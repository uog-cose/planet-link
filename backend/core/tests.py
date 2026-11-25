from django.test import TestCase, Client
from django.contrib.auth.models import User
from core.models import *
from django.utils import timezone
import json
from datetime import timedelta
from api.common import active_programme_for, milestone_tier

class CoreApiTests(TestCase):
    def setUp(self):
        self.u = User.objects.create_user('alex', password='YouthQuest123!')
        self.programme = Programme.objects.create(name='P',location='L')
        self.p = Profile.objects.create(user=self.u, role='youth', gamertag='Nova', current_xp=10, lifetime_xp=10,programme=self.programme)
        self.client = Client()

    def csrf_login(self, username='alex', password='YouthQuest123!'):
        self.client.get('/api/csrf/')
        return self.client.post('/api/auth/login/', data={'username': username, 'password': password}, content_type='application/json')

    def test_group_tier_unlock_is_recorded_once_from_xp_ledger(self):
        from core.services import award_xp
        group = Group.objects.create(name='Independent Group', programme=self.programme, tier_targets=[{'name':'Tier 1','xp':50,'prize':'Group outing'}])
        group.members.add(self.p)
        award_xp(target=self.p, actor=self.u, amount=50, source='test', reason='Activity completed')
        self.assertEqual(GroupTierUnlock.objects.filter(group=group, threshold=50).count(), 1)
        self.assertEqual(Group.objects.get(pk=group.pk).xp, 50)
        award_xp(target=self.p, actor=self.u, amount=1, source='test', reason='Follow-up')
        self.assertEqual(GroupTierUnlock.objects.filter(group=group, threshold=50).count(), 1)

    def test_dashboard_requires_auth(self):
        self.assertEqual(self.client.get('/api/dashboard/').status_code, 401)

    def test_refresh_rotates_and_reuse_revokes_family(self):
        self.assertEqual(self.csrf_login().status_code, 200)
        cookie = self.client.cookies['yq_refresh'].value
        first = self.client.post('/api/auth/refresh/', data={}, content_type='application/json')
        self.assertEqual(first.status_code, 200)
        second_cookie = self.client.cookies['yq_refresh'].value
        self.assertNotEqual(cookie, second_cookie)
        self.client.cookies['yq_refresh'] = cookie
        reused = self.client.post('/api/auth/refresh/', data={}, content_type='application/json')
        self.assertEqual(reused.status_code, 401)
        self.assertFalse(RefreshToken.objects.filter(family_id=RefreshToken.objects.first().family_id, revoked_at__isnull=True).exists())

    def test_public_has_no_private_fields(self):
        Group.objects.create(name='G', programme=Programme.objects.create(name='P', location='L'))
        data = self.client.get('/api/public/').json()
        self.assertNotIn('gamertag', data)
        self.assertNotIn('realName', data)

    def test_drawing_submission_stores_strokes_only(self):
        self.assertEqual(self.csrf_login().status_code, 200)
        game=Challenge.objects.create(programme=self.programme,kind='drawing',title='Draw',description='Draw',xp_reward=100,shape='circle',score_ranges=[{'min':0,'max':100,'xp':10}])
        GameAssignment.objects.create(game=game,assigned_by=self.u,target_profile=self.p)
        strokes=[[[100,100],[150,100],[200,150],[150,200],[100,150],[100,100]]] * 1
        response=self.client.post('/api/drawings/submit/',data=json.dumps({'gameId':game.id,'strokes':strokes}),content_type='application/json')
        self.assertEqual(response.status_code,201)
        sub=DrawingSubmission.objects.get()
        self.assertEqual(sub.stroke_data,strokes)


class V46DataIntegrityTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.programme=Programme.objects.create(name='V46',location='L',max_worker_points=50)
        self.worker_u=User.objects.create_user('v46-worker',password='YouthQuest123!'); self.worker=Profile.objects.create(user=self.worker_u,role='worker',gamertag='Worker',programme=self.programme)
        self.player_u=User.objects.create_user('v46-player',password='YouthQuest123!'); self.player=Profile.objects.create(user=self.player_u,role='youth',gamertag='Player',programme=self.programme)
    def login(self):
        r=self.client.post('/api/auth/login/',data=json.dumps({'username':'v46-worker','password':'YouthQuest123!'}),content_type='application/json'); self.assertEqual(r.status_code,200)
    def test_completed_game_can_be_assigned_again_to_same_player(self):
        self.login()
        game=Challenge.objects.create(programme=self.programme,kind='reaction',title='Reaction',description='React',retries_per_player=3)
        old=GameAssignment.objects.create(game=game,assigned_by=self.worker_u,target_profile=self.player)
        GameAttempt.objects.create(assignment=old,profile=self.player,game=game,status='completed',started_at=old.assigned_at,completed_at=old.assigned_at,raw_score=300,score_unit='ms',performance=80,xp_awarded=10,challenge_data={})
        r=self.client.post('/api/staff/games/',data=json.dumps({'gameId':game.id,'profileIds':[self.player.id]}),content_type='application/json')
        self.assertEqual(r.status_code,201)
        old.refresh_from_db()
        self.assertFalse(old.active)
        new=GameAssignment.objects.get(id=r.json()['ids'][0])
        self.assertTrue(new.active)
        self.assertGreater(new.assigned_at,old.assigned_at)

    def test_reassignment_creates_new_lifecycle(self):
        self.login(); game=Challenge.objects.create(programme=self.programme,kind='drawing',title='Triangle',description='Draw',shape='triangle',retries_per_player=1,score_ranges=[{'min':0,'max':100,'xp':10}])
        old=GameAssignment.objects.create(game=game,assigned_by=self.worker_u,target_profile=self.player)
        DrawingSubmission.objects.create(profile=self.player,game=game,title='Triangle drawing',stroke_data=[[[1,1],[2,2]]],score=10,status='approved')
        r=self.client.post('/api/staff/games/',data=json.dumps({'action':'reassign_assignment','assignmentId':old.id,'profileId':self.player.id}),content_type='application/json')
        self.assertEqual(r.status_code,200); old.refresh_from_db(); new=GameAssignment.objects.get(id=r.json()['id'])
        self.assertFalse(old.active); self.assertTrue(new.active); self.assertGreater(new.assigned_at,old.assigned_at)
        self.assertEqual(DrawingSubmission.objects.filter(profile=self.player,game=game,created_at__gte=new.assigned_at).count(),0)
    def test_non_player_cannot_become_group_member(self):
        self.login(); group=Group.objects.create(name='G',programme=self.programme)
        r=self.client.post('/api/staff/groups/members/',data=json.dumps({'groupId':group.id,'memberIds':[self.worker.id]}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.assertFalse(group.members.filter(pk=self.worker.id).exists())
    def test_bulk_points_award_is_atomic(self):
        other_u=User.objects.create_user('v46-player2',password='YouthQuest123!'); other=Profile.objects.create(user=other_u,role='youth',gamertag='Player2',programme=self.programme)
        self.login(); r=self.client.post('/api/points/awards/',data=json.dumps({'profileIds':[self.player.id,other.id],'amount':25,'reason':'Team activity'}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.player.refresh_from_db(); other.refresh_from_db(); self.assertEqual(self.player.current_xp,25); self.assertEqual(other.current_xp,25)
    def test_notifications_default_on_for_players(self):
        self.assertTrue(self.player.notifications_opt_in)

    def test_game_cannot_exceed_configured_rounds(self):
        self.login('v46-worker')
        game=Challenge.objects.create(programme=self.programme,kind='reaction',title='Limited reaction',description='React',retries_per_player=1,active=True)
        assignment=GameAssignment.objects.create(game=game,assigned_by=self.worker_u,target_profile=self.player)
        self.client.logout()
        self.client.post('/api/auth/login/',data=json.dumps({'username':'v46-player','password':'YouthQuest123!'}),content_type='application/json')
        started=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(started.status_code,201)
        attempt=started.json()['attemptId']
        finished=self.client.post('/api/games/submit/',data=json.dumps({'attemptId':attempt,'result':{'milliseconds':300},'durationMs':300}),content_type='application/json')
        self.assertEqual(finished.status_code,201)
        second=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(second.status_code,400)
        self.assertEqual(second.json().get('attemptsRemaining'),0)

    def test_started_round_consumes_slot_and_active_round_is_resumed(self):
        self.login('v46-worker')
        game=Challenge.objects.create(programme=self.programme,kind='sequence',title='Two rounds',description='Sequence',retries_per_player=2,active=True)
        assignment=GameAssignment.objects.create(game=game,assigned_by=self.worker_u,target_profile=self.player)
        self.client.logout()
        self.client.post('/api/auth/login/',data=json.dumps({'username':'v46-player','password':'YouthQuest123!'}),content_type='application/json')
        first=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(first.status_code,201); self.assertEqual(first.json()['attemptsRemaining'],1)
        resumed=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(resumed.status_code,200); self.assertEqual(resumed.json()['attemptId'],first.json()['attemptId']); self.assertEqual(resumed.json()['attemptsRemaining'],1)
        GameAttempt.objects.filter(id=first.json()['attemptId']).update(started_at=timezone.now()-timedelta(minutes=31))
        second=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(second.status_code,201); self.assertEqual(second.json()['attemptsRemaining'],0)
        third=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(third.status_code,400); self.assertEqual(third.json().get('attemptsRemaining'),0)


    def test_started_round_consumes_slot_and_active_round_is_resumed(self):
        self.login('v46-worker')
        game=Challenge.objects.create(programme=self.programme,kind='sequence',title='Two rounds',description='Sequence',retries_per_player=2,active=True)
        assignment=GameAssignment.objects.create(game=game,assigned_by=self.worker_u,target_profile=self.player)
        self.client.logout()
        self.client.post('/api/auth/login/',data=json.dumps({'username':'v46-player','password':'YouthQuest123!'}),content_type='application/json')
        first=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(first.status_code,201); self.assertEqual(first.json()['attemptsRemaining'],1)
        resumed=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(resumed.status_code,200); self.assertEqual(resumed.json()['attemptId'],first.json()['attemptId']); self.assertEqual(resumed.json()['attemptsRemaining'],1)
        GameAttempt.objects.filter(id=first.json()['attemptId']).update(started_at=timezone.now()-timedelta(minutes=31))
        second=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(second.status_code,201); self.assertEqual(second.json()['attemptsRemaining'],0)
        third=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        self.assertEqual(third.status_code,400); self.assertEqual(third.json().get('attemptsRemaining'),0)


class SecurityRegressionTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.user = User.objects.create_user(username='security', password='StrongPass123!')
        self.profile = Profile.objects.create(user=self.user, role='youth', gamertag='Secure')

    def _login(self):
        response = self.client.post('/api/auth/login/', data=json.dumps({'username':'security','password':'StrongPass123!'}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        return response.cookies['yq_refresh'].value

    def test_refresh_rotation_and_reuse_detection(self):
        raw = self._login()
        self.client.cookies['yq_refresh'] = raw
        first = self.client.post('/api/auth/refresh/', data='{}', content_type='application/json')
        self.assertEqual(first.status_code, 200)
        replacement = first.cookies['yq_refresh'].value
        self.client.cookies['yq_refresh'] = raw
        reused = self.client.post('/api/auth/refresh/', data='{}', content_type='application/json')
        self.assertEqual(reused.status_code, 401)
        self.client.cookies['yq_refresh'] = replacement
        self.assertEqual(self.client.post('/api/auth/refresh/', data='{}', content_type='application/json').status_code, 401)

    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.programme = Programme.objects.create(name='Test Programme', location='Test')
        self.youth_user = User.objects.create_user('youth', password='YouthQuest123!')
        self.youth = Profile.objects.create(user=self.youth_user, role='youth', gamertag='Youth', programme=self.programme)
        self.worker_user = User.objects.create_user('worker', password='YouthQuest123!')
        self.worker = Profile.objects.create(user=self.worker_user, role='worker', gamertag='Worker', programme=self.programme)

    def login(self, username):
        response = self.client.post('/api/auth/login/', data=json.dumps({'username': username, 'password': 'YouthQuest123!'}), content_type='application/json')
        self.assertEqual(response.status_code, 200)

    def test_me_returns_401_when_session_is_missing(self):
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)

    def test_attendance_scan_requires_young_person_login(self):
        self.login('worker')
        token = self.client.post('/api/attendance/session/', data='{}', content_type='application/json').json()['token']
        self.client.logout()
        response = self.client.post('/api/attendance/scan/', data=json.dumps({'token': token}), content_type='application/json')
        self.assertEqual(response.status_code, 401)
        self.login('youth')
        response = self.client.post('/api/attendance/scan/', data=json.dumps({'token': token}), content_type='application/json')
        self.assertEqual(response.status_code, 200)

    def test_new_attendance_session_invalidates_previous_session(self):
        self.login('worker')
        first = self.client.post('/api/attendance/session/', data='{}', content_type='application/json').json()['token']
        second = self.client.post('/api/attendance/session/', data='{}', content_type='application/json').json()['token']
        self.assertNotEqual(first, second)
        self.client.logout()
        self.login('youth')
        old_scan = self.client.post('/api/attendance/scan/', data=json.dumps({'token': first}), content_type='application/json')
        self.assertEqual(old_scan.status_code, 400)
        current_scan = self.client.post('/api/attendance/scan/', data=json.dumps({'token': second}), content_type='application/json')
        self.assertEqual(current_scan.status_code, 200)

class QrAndThemeTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.admin_user=User.objects.create_user('admin',password='YouthQuest123!')
        self.programme=Programme.objects.create(name='P',location='L')
        self.admin=Profile.objects.create(user=self.admin_user,role='admin',gamertag='Admin',programme=self.programme)
        self.worker_user=User.objects.create_user('worker2',password='YouthQuest123!')
        self.worker=Profile.objects.create(user=self.worker_user,role='worker',gamertag='Worker',programme=self.programme)
        self.youth_user=User.objects.create_user('youth2',password='YouthQuest123!')
        self.youth=Profile.objects.create(user=self.youth_user,role='youth',gamertag='Nova',programme=self.programme)
    def login(self,u):
        self.client.post('/api/auth/login/',data=json.dumps({'username':u,'password':'YouthQuest123!'}),content_type='application/json')
    def test_password_reset_qr_is_single_use_and_expires(self):
        self.login('admin')
        qr=self.client.post('/api/admin/password-reset-qr/',data=json.dumps({'userId':self.youth_user.id}),content_type='application/json').json()
        self.client.logout()
        first=self.client.post('/api/auth/password-reset/',data=json.dumps({'token':qr['token'],'password':'NewStrongPass123!'}),content_type='application/json')
        self.assertEqual(first.status_code,200)
        second=self.client.post('/api/auth/password-reset/',data=json.dumps({'token':qr['token'],'password':'AnotherStrongPass123!'}),content_type='application/json')
        self.assertEqual(second.status_code,400)
    def test_theme_requires_admin(self):
        self.login('worker2')
        self.assertEqual(self.client.post('/api/admin/config/',data=json.dumps({'programmeId':self.programme.id,'theme':'cosmic'}),content_type='application/json').status_code,403)
        self.client.logout(); self.login('admin')
        self.assertEqual(self.client.post('/api/admin/config/',data=json.dumps({'programmeId':self.programme.id,'theme':'cosmic'}),content_type='application/json').status_code,200)
    def test_avatar_assignment_changes_avatar(self):
        self.login('worker2')
        r=self.client.post('/api/worker/avatar/',data=json.dumps({'profileId':self.youth.id,'avatar':'rocket'}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.youth.refresh_from_db(); self.assertEqual(self.youth.avatar,'rocket')


class FeaturePermissionTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.programme=Programme.objects.create(name='P',location='L',max_worker_points=50,milestones=[{'tier':'bronze','xp':10},{'tier':'silver','xp':100},{'tier':'gold','xp':200},{'tier':'diamond','xp':500},{'tier':'platinum','xp':1000}])
        self.admin_u=User.objects.create_user('adm',password='YouthQuest123!'); self.admin=Profile.objects.create(user=self.admin_u,role='admin',gamertag='Admin',programme=self.programme)
        self.worker_u=User.objects.create_user('wrk',password='YouthQuest123!'); self.worker=Profile.objects.create(user=self.worker_u,role='worker',gamertag='Worker',programme=self.programme)
        self.youth_u=User.objects.create_user('kid',password='YouthQuest123!'); self.youth=Profile.objects.create(user=self.youth_u,role='youth',gamertag='Kid',programme=self.programme)
    def login(self,u):
        r=self.client.post('/api/auth/login/',data=json.dumps({'username':u,'password':'YouthQuest123!'}),content_type='application/json'); self.assertEqual(r.status_code,200)
    def test_dynamic_milestones_persist(self):
        self.login('adm')
        r=self.client.post('/api/admin/config/',data=json.dumps({'programmeId':self.programme.id,'milestones':[{'tier':'bronze','xp':10},{'tier':'silver','xp':100},{'tier':'gold','xp':200},{'tier':'diamond','xp':500},{'tier':'platinum','xp':1000}]}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.programme.refresh_from_db(); self.assertEqual(len(self.programme.milestones),5)
    def test_worker_over_limit_creates_pending_request(self):
        self.login('wrk')
        r=self.client.post('/api/points/awards/',data=json.dumps({'profileId':self.youth.id,'amount':51,'reason':'Big award'}),content_type='application/json')
        self.assertEqual(r.status_code,202); self.assertEqual(PointAwardRequest.objects.count(),1); self.youth.refresh_from_db(); self.assertEqual(self.youth.current_xp,0)
    def test_youth_cannot_call_staff_endpoints(self):
        self.login('kid')
        self.assertEqual(self.client.get('/api/staff/accounts/').status_code,403)
        self.assertEqual(self.client.get('/api/staff/games/').status_code,403)
        self.assertEqual(self.client.get('/api/admin/config/').status_code,403)
    def test_drawing_requires_assignment(self):
        self.login('kid')
        payload={'gameId':game.id if 'game' in locals() else None,'strokes':[[[100,100],[150,100],[200,150],[150,200],[100,150],[100,100]]]}
        self.assertEqual(self.client.post('/api/drawings/submit/',data=json.dumps(payload),content_type='application/json').status_code,403)
        game=Challenge.objects.create(programme=self.programme,kind='drawing',title='Draw',description='Draw')
        GameAssignment.objects.create(game=game,assigned_by=self.worker_u,target_profile=self.youth)
        self.assertEqual(self.client.post('/api/drawings/submit/',data=json.dumps(payload),content_type='application/json').status_code,201)

class GroupFairnessRegressionTests(TestCase):
    def test_group_size_does_not_change_average_and_departed_xp_is_not_reassigned(self):
        from core.services import award_xp
        programme = Programme.objects.create(name='Fairness', location='Test', group_scoring_config={'minimum_group_size': 1, 'ranking_periods': ['overall']})
        actor = User.objects.create_user('fairness-admin', password='YouthQuest123!')
        five_person_group = Group.objects.create(name='Five people', programme=programme)
        four_person_group = Group.objects.create(name='Four people', programme=programme)
        five_people = []
        for index in range(5):
            user = User.objects.create_user(f'five-{index}', password='YouthQuest123!')
            profile = Profile.objects.create(user=user, role='youth', gamertag=f'Five {index}', programme=programme)
            five_person_group.members.add(profile)
            five_people.append(profile)
        for index in range(4):
            user = User.objects.create_user(f'four-{index}', password='YouthQuest123!')
            profile = Profile.objects.create(user=user, role='youth', gamertag=f'Four {index}', programme=programme)
            four_person_group.members.add(profile)
            award_xp(target=profile, actor=actor, amount=100, source='test', reason='Fair share')
        for profile in five_people:
            award_xp(target=profile, actor=actor, amount=100, source='test', reason='Fair share')
        five_person_group.members.remove(five_people[-1])
        response = Client().get('/api/public/')
        self.assertEqual(response.status_code, 200)
        rows = {row['name']: row for row in response.json()['groups']}
        self.assertEqual(rows['Five people']['averageXpPerMember'], 100)
        self.assertEqual(rows['Four people']['averageXpPerMember'], 100)
        self.assertEqual(rows['Five people']['xp'], 500)


class AttendanceAutomationTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.programme=Programme.objects.create(name='Attendance',location='L',attendance_points=100,streak_rules=[{'days':3,'multiplier':1.3},{'days':7,'multiplier':1.5}],attendance_attention_days=7,points_attention_days=7,attention_grace_days=1)
        self.wu=User.objects.create_user('coach',password='YouthQuest123!'); self.worker=Profile.objects.create(user=self.wu,role='worker',gamertag='Coach',programme=self.programme)
        self.yu=User.objects.create_user('player',password='YouthQuest123!'); self.player=Profile.objects.create(user=self.yu,role='youth',gamertag='Player',programme=self.programme)
    def login(self,name):
        r=self.client.post('/api/auth/login/',data=json.dumps({'username':name,'password':'YouthQuest123!'}),content_type='application/json'); self.assertEqual(r.status_code,200)
    def session(self):
        self.login('coach')
        return self.client.post('/api/attendance/session/',data='{}',content_type='application/json').json()['token']
    def test_attendance_awards_once_per_day_and_updates_streak(self):
        token=self.session(); self.client.logout(); self.login('player')
        first=self.client.post('/api/attendance/scan/',data=json.dumps({'token':token}),content_type='application/json').json()
        self.assertEqual(first['awarded'],100); self.assertEqual(first['streak'],1); self.assertEqual(first['multiplier'],1.0)
        self.client.logout(); token2=self.session(); self.client.logout(); self.login('player')
        second=self.client.post('/api/attendance/scan/',data=json.dumps({'token':token2}),content_type='application/json').json()
        self.assertEqual(second['awarded'],0); self.assertTrue(second['alreadyRewardedToday'])

    def test_attendance_qr_session_does_not_require_a_map_event(self):
        self.login('coach')
        response=self.client.post('/api/attendance/session/',data='{}',content_type='application/json')
        self.assertEqual(response.status_code,200)
        session=AttendanceSession.objects.get(token=response.json()['token'])
        self.assertIsNone(session.event_id)

    def test_attendance_schedule_inheritance_and_individual_override(self):
        from core.services import effective_attendance_days
        self.programme.attendance_config={'default_days':[0,2,4]}
        self.programme.save(update_fields=['attendance_config'])
        group=Group.objects.create(name='Schedule group',programme=self.programme,attendance_days=[1,3])
        group.members.add(self.player)
        self.assertEqual(effective_attendance_days(self.player,self.programme),[1,3])
        self.player.attendance_days=[5]
        self.player.save(update_fields=['attendance_days'])
        self.assertEqual(effective_attendance_days(self.player,self.programme),[5])
        self.player.attendance_days=None
        self.player.save(update_fields=['attendance_days'])
        group.attendance_days=None
        group.save(update_fields=['attendance_days'])
        self.assertEqual(effective_attendance_days(self.player,self.programme),[0,2,4])

    def test_attendance_schedule_changes_do_not_rewrite_past_streak_rules(self):
        from datetime import date
        from core.models import AttendanceScheduleChange
        from core.services import effective_attendance_days
        self.programme.attendance_config={'default_days':[0,2,4]}
        self.programme.save(update_fields=['attendance_config'])
        AttendanceScheduleChange.objects.create(programme=self.programme,scope_type='programme',days=[0,2,4],effective_from=date(1970,1,1))
        AttendanceScheduleChange.objects.create(programme=self.programme,scope_type='programme',days=[1],effective_from=date(2026,11,20))
        self.assertEqual(effective_attendance_days(self.player,self.programme,on_date=date(2026,11,18)),[0,2,4])
        self.assertEqual(effective_attendance_days(self.player,self.programme,on_date=date(2026,11,24)),[1])

class InstanceVisibilityRegressionTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user('visibility-admin', password='YouthQuest123!')
        self.programme = Programme.objects.create(name='Visible Base', location='London', active=True, status='active', public_enabled=True)
        self.hidden = Programme.objects.create(name='Hidden Instance', location='Leeds', active=True, status='active', public_enabled=False)
        self.profile = Profile.objects.create(user=self.user, role='admin', gamertag='Admin', programme=self.programme)
        ProgrammeMembership.objects.create(user=self.user, programme=self.programme)
        ProgrammeMembership.objects.create(user=self.user, programme=self.hidden)
        self.client.force_login(self.user)

    def test_hidden_instance_remains_admin_visible_and_can_be_unhidden(self):
        response = self.client.get('/api/admin/instances/')
        self.assertEqual(response.status_code, 200)
        items = response.json()['items']
        hidden = next(item for item in items if item['id'] == self.hidden.id)
        self.assertFalse(hidden['publicEnabled'])

        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'unhide','programmeId':self.hidden.id}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.hidden.refresh_from_db()
        self.assertTrue(self.hidden.public_enabled)

    def test_admin_can_switch_to_hidden_instance(self):
        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'switch','programmeId':self.hidden.id}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.profile.refresh_from_db()
        self.assertEqual(self.profile.programme_id, self.hidden.id)


class MultiProgrammeSecurityTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.programme_a = Programme.objects.create(name='Alpha', location='A', milestones=[{'tier':'silver','xp':100,'color':'#aaaaaa'}])
        self.programme_b = Programme.objects.create(name='Beta', location='B', milestones=[{'tier':'gold','xp':200,'color':'#bbbbbb'}])
        self.admin_user = User.objects.create_user('multi-admin', password='YouthQuest123!')
        self.admin = Profile.objects.create(user=self.admin_user, role='admin', gamertag='Admin', programme=self.programme_a)
        ProgrammeMembership.objects.create(user=self.admin_user, programme=self.programme_a)
        ProgrammeMembership.objects.create(user=self.admin_user, programme=self.programme_b)
        self.a_user = User.objects.create_user('alpha-kid', password='YouthQuest123!')
        self.a_profile = Profile.objects.create(user=self.a_user, role='youth', gamertag='AlphaKid', programme=self.programme_a)
        self.b_user = User.objects.create_user('beta-kid', password='YouthQuest123!')
        self.b_profile = Profile.objects.create(user=self.b_user, role='youth', gamertag='BetaKid', programme=self.programme_b)

    def login(self):
        response = self.client.post('/api/auth/login/', data=json.dumps({'username':'multi-admin','password':'YouthQuest123!'}), content_type='application/json')
        self.assertEqual(response.status_code, 200)

    def test_admin_can_switch_between_authorised_instances_without_cross_scope(self):
        self.login()
        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'switch','programmeId':self.programme_b.id}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.programme_id, self.programme_b.id)
        overview = self.client.get('/api/admin/overview/').json()
        self.assertEqual(overview['programme']['id'], self.programme_b.id)
        self.assertEqual(overview['participants'], 1)
        self.assertEqual(overview['programme']['name'], 'Beta')
        audit = self.client.get('/api/admin/audit/').json()
        self.assertTrue(all(AuditLog.objects.get(pk=item['id']).programme_id == self.programme_b.id for item in audit['items']))

    def test_admin_can_create_and_switch_to_new_instance(self):
        self.login()
        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'create','name':'Glasgow Quest','location':'Glasgow'}), content_type='application/json')
        self.assertEqual(response.status_code, 201)
        new_id = response.json()['id']
        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'switch','programmeId':new_id}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.programme_id, new_id)
        overview = self.client.get('/api/admin/overview/').json()
        self.assertEqual(overview['programme']['name'], 'Glasgow Quest')

    def test_admin_cannot_switch_to_unassigned_instance(self):
        self.login()
        outsider = Programme.objects.create(name='Private', location='P')
        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'switch','programmeId':outsider.id}), content_type='application/json')
        self.assertEqual(response.status_code, 403)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.programme_id, self.programme_a.id)

    def test_config_changes_are_scoped_to_selected_instance(self):
        self.login()
        response = self.client.post('/api/admin/config/', data=json.dumps({'programmeId':self.programme_a.id,'milestones':[{'tier':'silver','xp':150,'color':'#112233'}], 'streak_rules':[{'days':3,'multiplier':1.5}]}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.programme_a.refresh_from_db(); self.programme_b.refresh_from_db()
        self.assertEqual(self.programme_a.milestones[0]['xp'], 150)
        self.assertEqual(self.programme_b.milestones[0]['xp'], 200)
        self.assertEqual(self.programme_b.streak_rules, [{'days':3,'multiplier':1.3},{'days':7,'multiplier':1.5},{'days':14,'multiplier':2.0}])

    def test_public_explicit_instance_selection_returns_requested_instance(self):
        self.programme_a.public_enabled = True; self.programme_a.save(update_fields=['public_enabled'])
        self.programme_b.public_enabled = True; self.programme_b.save(update_fields=['public_enabled'])
        response = self.client.get(f'/api/public/?instanceId={self.programme_b.id}')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['instanceId'], self.programme_b.id)
        self.assertEqual(data['programme'], self.programme_b.name)
        self.assertEqual(response.headers.get('Cache-Control'), 'no-store, no-cache, must-revalidate, max-age=0')

    def test_public_only_exposes_enabled_instance(self):
        self.programme_a.public_enabled = True; self.programme_a.save(update_fields=['public_enabled'])
        self.programme_b.public_enabled = False; self.programme_b.save(update_fields=['public_enabled'])
        public = self.client.get('/api/public/').json()
        self.assertEqual(public['instanceId'], self.programme_a.id)
        self.assertEqual([x['id'] for x in public['instances']], [self.programme_a.id])
        self.assertEqual(self.client.get(f'/api/public/?instanceId={self.programme_b.id}').status_code, 404)

    def test_admin_can_hide_and_unhide_non_current_programme(self):
        self.login()
        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'hide','programmeId':self.programme_b.id}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.programme_b.refresh_from_db()
        self.assertFalse(self.programme_b.public_enabled)
        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'unhide','programmeId':self.programme_b.id}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.programme_b.refresh_from_db()
        self.assertTrue(self.programme_b.public_enabled)

    def test_admin_can_delete_non_current_programme(self):
        self.login()
        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'delete','programmeId':self.programme_b.id}), content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Programme.objects.filter(pk=self.programme_b.id).exists())

class ProgrammeCloneTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.source = Programme.objects.create(name='Template', location='T')
        reward = Reward.objects.create(programme=self.source, name='Template Reward', description='Reward', awards=[{'name':'10 XP','xp':10,'quantity':1,'remaining':1,'available':True}])
        skill = Skill.objects.create(programme=self.source, name='Template Skill', description='Skill', xp_reward=50)
        SkillMilestone.objects.create(skill=skill, name='First', progress=50, xp=20, reward=reward, order=1)
        Challenge.objects.create(programme=self.source, title='Template Game', description='Game', xp_reward=100)
        self.user = User.objects.create_user('clone-admin', password='YouthQuest123!')
        self.profile = Profile.objects.create(user=self.user, role='admin', gamertag='Admin', programme=self.source)
        ProgrammeMembership.objects.create(user=self.user, programme=self.source)

    def test_clone_copies_configuration_without_assignments_or_people(self):
        self.client.post('/api/auth/login/', data=json.dumps({'username':'clone-admin','password':'YouthQuest123!'}), content_type='application/json')
        response = self.client.post('/api/admin/instances/', data=json.dumps({'action':'create','name':'Cloned Programme','location':'C','cloneFromId':self.source.id}), content_type='application/json')
        self.assertEqual(response.status_code, 201)
        clone = Programme.objects.get(pk=response.json()['id'])
        self.assertFalse(clone.public_enabled)
        self.assertEqual(Skill.objects.filter(programme=clone).count(), 1)
        self.assertEqual(Reward.objects.filter(programme=clone).count(), 1)
        self.assertEqual(Challenge.objects.filter(programme=clone).count(), 1)
        self.assertEqual(SkillMilestone.objects.filter(skill__programme=clone).count(), 1)
        self.assertFalse(Group.objects.filter(programme=clone).exists())

class LiveDashboardTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.programme = Programme.objects.create(name='Live Programme', location='Test')
        self.user = User.objects.create_user('live-youth', password='YouthQuest123!')
        self.profile = Profile.objects.create(user=self.user, role='youth', gamertag='Live', programme=self.programme)

    def test_youth_dashboard_loads_successfully(self):
        self.client.post('/api/auth/login/', data=json.dumps({'username':'live-youth','password':'YouthQuest123!'}), content_type='application/json')
        response = self.client.get('/api/dashboard/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['profile']['gamertag'], 'Live')
        self.assertIn('achievementStats', payload)
        self.assertIn('events', payload)

    def test_relevant_changes_touch_programme_revision(self):
        before = self.programme.updated_at
        group = Group.objects.create(name='Live Group', programme=self.programme)
        self.programme.refresh_from_db()
        self.assertGreaterEqual(self.programme.updated_at, before)
        before = self.programme.updated_at
        XPTransaction.objects.create(target=self.profile, actor=self.user, amount=10, source='test', reason='Live update')
        self.programme.refresh_from_db()
        self.profile.refresh_from_db()
        self.assertGreaterEqual(self.programme.updated_at, before)
        self.assertIsNotNone(self.profile.updated_at)

    def test_public_live_stream_is_scoped_to_public_programme(self):
        self.programme.public_enabled = True
        self.programme.save(update_fields=['public_enabled'])
        response = self.client.get(f'/api/live/events/?scope=public&instanceId={self.programme.id}')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get('Content-Type'), 'text/event-stream')
        self.assertEqual(response.get('Cache-Control'), 'no-store, no-cache, must-revalidate, max-age=0')

class PublicProgrammeIntegrityTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.a = Programme.objects.create(name='Alpha Public', location='A', public_enabled=True, status='active')
        self.b = Programme.objects.create(name='Beta Public', location='B', public_enabled=True, status='active')
        self.a_group = Group.objects.create(name='Alpha Group', programme=self.a, xp=111)
        self.b_group = Group.objects.create(name='Beta Group', programme=self.b, xp=222)
        self.a_user = User.objects.create_user('alpha-public', password='YouthQuest123!')
        self.a_profile = Profile.objects.create(user=self.a_user, role='youth', gamertag='Alpha Player', programme=self.a, public_opt_in=True, current_xp=111)
        self.b_user = User.objects.create_user('beta-public', password='YouthQuest123!')
        self.b_profile = Profile.objects.create(user=self.b_user, role='youth', gamertag='Beta Player', programme=self.b, public_opt_in=True, current_xp=222)

    def test_selected_public_instance_contains_only_selected_programme_data(self):
        data = self.client.get(f'/api/public/?instanceId={self.b.id}').json()
        self.assertEqual(data['instanceId'], self.b.id)
        self.assertEqual(data['programme'], self.b.name)
        self.assertEqual(data['location'], self.b.location)
        self.assertEqual([g['name'] for g in data['groups']], ['Beta Group'])
        self.assertEqual(data['stats']['participants'], 1)
        self.assertNotIn('Alpha Group', {g['name'] for g in data['groups']})

    def test_public_instance_search_is_bounded_and_filters_by_name_or_location(self):
        for index in range(40):
            Programme.objects.create(name=f'Long Programme {index:02d}', location='North', public_enabled=True, status='active')
        response = self.client.get('/api/public/instances/?q=Long')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['total'], 40)
        self.assertLessEqual(len(payload['items']), 30)
        response = self.client.get('/api/public/instances/?q=Beta')
        self.assertEqual([item['id'] for item in response.json()['items']], [self.b.id])

    def test_profile_without_programme_never_falls_back_to_another_programme(self):
        user = User.objects.create_user('unassigned-user', password='YouthQuest123!')
        profile = Profile.objects.create(user=user, role='youth', gamertag='Unassigned')
        self.assertIsNone(active_programme_for(profile))
        self.assertEqual(milestone_tier(profile), 'grey')

class XPProgrammeIntegrityTests(TestCase):
    def test_xp_history_is_pinned_to_the_programme_at_award_time(self):
        from core.services import award_xp
        programme_a = Programme.objects.create(name='XP A', location='A')
        programme_b = Programme.objects.create(name='XP B', location='B')
        user = User.objects.create_user('xp-integrity', password='YouthQuest123!')
        profile = Profile.objects.create(user=user, role='youth', gamertag='XP', programme=programme_a)
        actor = User.objects.create_user('xp-worker', password='YouthQuest123!')
        Profile.objects.create(user=actor, role='worker', gamertag='Worker', programme=programme_a)
        tx_a, _ = award_xp(target=profile, actor=actor, amount=10, source='test', reason='A')
        profile.programme = programme_b
        profile.save(update_fields=['programme'])
        tx_b, _ = award_xp(target=profile, actor=actor, amount=20, source='test', reason='B')
        self.assertEqual(tx_a.programme_id, programme_a.id)
        self.assertEqual(tx_b.programme_id, programme_b.id)
        self.assertEqual(profile.xp_transactions.filter(programme=programme_a).count(), 1)
        self.assertEqual(profile.xp_transactions.filter(programme=programme_b).count(), 1)

class ScratchCardFulfilmentAndAccountAccessTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.programme=Programme.objects.create(name='Scratch Programme',location='Test')
        self.worker_user=User.objects.create_user('scratch-worker',password='YouthQuest123!')
        self.worker=Profile.objects.create(user=self.worker_user,role='worker',gamertag='Worker',programme=self.programme)
        self.player_user=User.objects.create_user('scratch-player',password='YouthQuest123!')
        self.player=Profile.objects.create(user=self.player_user,role='youth',gamertag='Player',programme=self.programme)

    def login(self,username):
        response=self.client.post('/api/auth/login/',data=json.dumps({'username':username,'password':'YouthQuest123!'}),content_type='application/json')
        self.assertEqual(response.status_code,200)

    def test_worker_can_revoke_restore_and_soft_delete_player(self):
        self.login('scratch-worker')
        response=self.client.post('/api/staff/accounts/',data=json.dumps({'action':'set_access','userId':self.player_user.id,'active':False}),content_type='application/json')
        self.assertEqual(response.status_code,200)
        self.player_user.refresh_from_db(); self.assertFalse(self.player_user.is_active)
        response=self.client.post('/api/staff/accounts/',data=json.dumps({'action':'set_access','userId':self.player_user.id,'active':True}),content_type='application/json')
        self.assertEqual(response.status_code,200)
        self.player_user.refresh_from_db(); self.assertTrue(self.player_user.is_active)
        response=self.client.post('/api/staff/accounts/',data=json.dumps({'action':'delete','userId':self.player_user.id}),content_type='application/json')
        self.assertEqual(response.status_code,200)
        self.player_user.refresh_from_db(); self.player.refresh_from_db()
        self.assertFalse(self.player_user.is_active); self.assertEqual(self.player.gamertag,'Deleted account')

    def test_xp_scratch_claim_is_auto_awarded_without_fulfilment(self):
        reward=Reward.objects.create(programme=self.programme,name='XP Card',description='',awards=[{'name':'10 XP','type':'xp','value':'10','xp':10,'quantity':1,'remaining':1,'weightage':1,'available':True}],fallback_xp=0)
        RewardAssignment.objects.create(reward=reward,target_profile=self.player,assigned_by=self.worker)
        self.login('scratch-player')
        response=self.client.post('/api/scratch/claim/',data=json.dumps({'rewardId':reward.id}),content_type='application/json')
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.json()['fulfillmentStatus'],None)
        self.assertFalse(RewardFulfillment.objects.filter(claim__reward=reward).exists())
        self.player.refresh_from_db(); self.assertEqual(self.player.current_xp,10)
        # A scratch claim is one user-facing reward event: generic XP/milestone/level
        # notifications must not create extra popups for the same scratch action.
        self.assertEqual(Notification.objects.filter(profile=self.player).count(), 1)
        self.assertEqual(Notification.objects.filter(profile=self.player, kind='reward').count(), 1)

    def test_pending_reward_assignment_is_upgraded_to_claim_result(self):
        reward=Reward.objects.create(programme=self.programme,name='Mystery Card',description='',awards=[{'name':'25 XP','type':'xp','xp':25,'quantity':1,'remaining':1,'weightage':1,'available':True}],fallback_xp=0)
        RewardAssignment.objects.create(reward=reward,target_profile=self.player,assigned_by=self.worker)
        from core.services import create_notification
        pending=create_notification(profile=self.player,title='New reward available',body='Mystery Card is now available.',kind='reward',url='/rewards')
        self.assertIsNotNone(pending)
        self.login('scratch-player')
        response=self.client.post('/api/scratch/claim/',data=json.dumps({'rewardId':reward.id}),content_type='application/json')
        self.assertEqual(response.status_code,201)
        self.assertEqual(Notification.objects.filter(profile=self.player).count(),1)
        n=Notification.objects.get(profile=self.player)
        self.assertEqual(n.title,'Scratch card reward')
        self.assertIn('25 XP',n.body)
        self.assertIsNone(n.popup_delivered_at)

    def test_delivering_same_popup_twice_only_claims_once(self):
        from core.services import create_notification
        n=create_notification(profile=self.player,title='+5 XP',body='Test',kind='xp',url='/')
        self.login('scratch-player')
        ids=[n.id]
        r=self.client.post('/api/notifications/popup-delivered/',data=json.dumps({'ids':ids}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.assertEqual(r.json()['updated'],1); self.assertEqual(r.json()['ids'],ids)
        r=self.client.post('/api/notifications/popup-delivered/',data=json.dumps({'ids':ids}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.assertEqual(r.json()['updated'],0); self.assertEqual(r.json()['ids'],[])

    def test_physical_scratch_claim_creates_pending_fulfilment(self):
        reward=Reward.objects.create(programme=self.programme,name='Pizza Card',description='',awards=[{'name':'Pizza','type':'physical','value':'Large pizza','xp':0,'quantity':1,'remaining':1,'weightage':1,'available':True}],fallback_xp=0)
        RewardAssignment.objects.create(reward=reward,target_profile=self.player,assigned_by=self.worker)
        self.login('scratch-player')
        response=self.client.post('/api/scratch/claim/',data=json.dumps({'rewardId':reward.id}),content_type='application/json')
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.json()['fulfillmentStatus'],'pending')
        self.assertTrue(RewardFulfillment.objects.filter(claim__reward=reward,status='pending').exists())


class BenchmarkGameIntegrityTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.programme=Programme.objects.create(name='Games',location='London')
        self.wu=User.objects.create_user('game-worker',password='YouthQuest123!'); self.worker=Profile.objects.create(user=self.wu,role='worker',gamertag='Worker',programme=self.programme)
        self.pu=User.objects.create_user('game-player',password='YouthQuest123!'); self.player=Profile.objects.create(user=self.pu,role='youth',gamertag='Player',programme=self.programme)
    def login(self,name):
        r=self.client.post('/api/auth/login/',data=json.dumps({'username':name,'password':'YouthQuest123!'}),content_type='application/json'); self.assertEqual(r.status_code,200)
    def test_reaction_game_scores_on_server_and_awards_configured_xp(self):
        game=Challenge.objects.create(programme=self.programme,kind='reaction',title='Reaction',description='React',xp_reward=100,score_ranges=[{'min':80,'max':100,'xp':90},{'min':0,'max':79,'xp':10}],retries_per_player=2,game_config={})
        GameAssignment.objects.create(game=game,assigned_by=self.wu,target_profile=self.player)
        self.login('game-player')
        start=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':game.assignments.first().id}),content_type='application/json')
        self.assertEqual(start.status_code,201); attempt=start.json()['attemptId']
        result=self.client.post('/api/games/submit/',data=json.dumps({'attemptId':attempt,'result':{'milliseconds':200},'durationMs':1000}),content_type='application/json')
        self.assertEqual(result.status_code,201); self.assertEqual(result.json()['xp'],90)
        self.player.refresh_from_db(); self.assertEqual(self.player.current_xp,90); self.assertEqual(GameAttempt.objects.get(id=attempt).status,'completed')
    def test_invalid_benchmark_result_cannot_award_xp(self):
        game=Challenge.objects.create(programme=self.programme,kind='number_memory',title='Number',description='Remember',score_ranges=[{'min':0,'max':100,'xp':100}],game_config={'digits':6})
        assignment=GameAssignment.objects.create(game=game,assigned_by=self.wu,target_profile=self.player)
        self.login('game-player'); start=self.client.post('/api/games/start/',data=json.dumps({'gameId':game.id,'assignmentId':assignment.id}),content_type='application/json')
        attempt=start.json()['attemptId']; response=self.client.post('/api/games/submit/',data=json.dumps({'attemptId':attempt,'result':{'number':'not-a-number'}}),content_type='application/json')
        self.assertEqual(response.status_code,400); self.player.refresh_from_db(); self.assertEqual(self.player.current_xp,0); self.assertEqual(GameAttempt.objects.get(id=attempt).status,'started')

class EventDateIntegrityTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False); self.programme=Programme.objects.create(name='Events',location='London')
        self.u=User.objects.create_user('event-worker',password='YouthQuest123!'); self.p=Profile.objects.create(user=self.u,role='worker',gamertag='Worker',programme=self.programme)
    def test_local_wall_clock_event_is_not_shifted_on_create(self):
        self.client.post('/api/auth/login/',data=json.dumps({'username':'event-worker','password':'YouthQuest123!'}),content_type='application/json')
        response=self.client.post('/api/map-event/',data=json.dumps({'title':'Quest','description':'D','locationName':'Centre','lat':51.5,'lng':-0.1,'startAt':'2099-06-10T15:30','endAt':'2099-06-10T16:30'}),content_type='application/json')
        self.assertEqual(response.status_code,200); event=MapEvent.objects.get(); self.assertEqual(event.start_at.astimezone(timezone.get_current_timezone()).strftime('%Y-%m-%d %H:%M'),'2099-06-10 15:30')


class SecurityHardeningRegressionTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.programme = Programme.objects.create(name='Hardening', location='London', max_worker_points=50)
        self.worker_user = User.objects.create_user('hard-worker', password='YouthQuest123!')
        self.worker = Profile.objects.create(user=self.worker_user, role='worker', gamertag='Worker', programme=self.programme)
        self.youth_user = User.objects.create_user('hard-youth', password='YouthQuest123!')
        self.youth = Profile.objects.create(user=self.youth_user, role='youth', gamertag='Youth', programme=self.programme)

    def login(self, username):
        r = self.client.post('/api/auth/login/', data=json.dumps({'username': username, 'password': 'YouthQuest123!'}), content_type='application/json')
        self.assertEqual(r.status_code, 200)

    def test_malformed_json_is_rejected(self):
        self.login('hard-worker')
        r = self.client.post('/api/points/scan/', data='{"amount":', content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('detail', r.json())

    def test_qr_points_have_same_upper_bound_as_manual_awards(self):
        self.login('hard-worker')
        token = self.client.post('/api/points/qr/', data='{}', content_type='application/json')
        # A worker cannot request a youth QR; create it under the youth account.
        self.client.logout()
        self.login('hard-youth')
        token = self.client.post('/api/points/qr/', data='{}', content_type='application/json').json()['token']
        self.client.logout()
        self.login('hard-worker')
        r = self.client.post('/api/points/scan/', data=json.dumps({'token': token, 'amount': 5001}), content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.youth.current_xp, 0)

    def test_worker_skill_progress_updates_young_person(self):
        self.login('hard-worker')
        skill = Skill.objects.create(programme=self.programme, name='Teamwork', description='Teamwork', xp_reward=10, active=True)
        SkillAssignment.objects.create(skill=skill, assigned_by=self.worker_user, target_profile=self.youth, active=True)
        r = self.client.post('/api/skills/progress/', data=json.dumps({'skillId': skill.id, 'profileId': self.youth.id, 'progress': 50}), content_type='application/json')
        self.assertEqual(r.status_code, 200)
        self.assertTrue(ProfileSkill.objects.filter(profile=self.youth, skill=skill, progress=50).exists())
        self.assertFalse(ProfileSkill.objects.filter(profile=self.worker, skill=skill).exists())

    def test_cross_programme_worker_cannot_award_points(self):
        other_programme = Programme.objects.create(name='Other', location='Leeds')
        other_user = User.objects.create_user('other-youth', password='YouthQuest123!')
        other = Profile.objects.create(user=other_user, role='youth', gamertag='Other', programme=other_programme)
        self.login('hard-worker')
        r = self.client.post('/api/points/awards/', data=json.dumps({'profileId': other.id, 'amount': 10, 'reason': 'test'}), content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(other.current_xp, 0)

class V57RegressionTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.programme=Programme.objects.create(name='V57',location='Edinburgh',target_xp=10000,milestones=[{'tier':'bronze','xp':2000,'color':'#9d8cff'}])
        self.admin_user=User.objects.create_user('v57-admin',password='YouthQuest123!')
        self.admin=Profile.objects.create(user=self.admin_user,role='admin',gamertag='Admin',programme=self.programme)
        self.worker_user=User.objects.create_user('v57-worker',password='YouthQuest123!')
        self.worker=Profile.objects.create(user=self.worker_user,role='worker',gamertag='Worker',programme=self.programme)
        self.player_user=User.objects.create_user('v57-player',password='YouthQuest123!')
        self.player=Profile.objects.create(user=self.player_user,role='youth',gamertag='Player',programme=self.programme)

    def login(self, username):
        response=self.client.post('/api/auth/login/',data=json.dumps({'username':username,'password':'YouthQuest123!'}),content_type='application/json')
        self.assertEqual(response.status_code,200)

    def test_youth_dashboard_loads(self):
        self.login('v57-player')
        response=self.client.get('/api/dashboard/')
        self.assertEqual(response.status_code,200)
        self.assertIn('awards',response.json())

    def test_youth_dashboard_exposes_assigned_scratch_card_and_rewards_endpoint_uses_active_programme(self):
        reward=Reward.objects.create(programme=self.programme,name='Dashboard Scratch',description='Reveal it',awards=[{'name':'25 XP','type':'xp','xp':25,'quantity':1,'remaining':1,'weightage':1,'available':True}],fallback_xp=0)
        RewardAssignment.objects.create(reward=reward,target_profile=self.player,assigned_by=self.admin_user,active=True)
        self.login('v57-player')
        dashboard=self.client.get('/api/dashboard/')
        self.assertEqual(dashboard.status_code,200)
        payload=dashboard.json()
        self.assertTrue(payload.get('rewardAvailable'))
        self.assertEqual(payload.get('rewardCards',[{}])[0].get('id'),reward.id)
        rewards=self.client.get('/api/rewards/')
        self.assertEqual(rewards.status_code,200)
        self.assertEqual([item['id'] for item in rewards.json().get('items',[])],[reward.id])

    def test_milestone_reward_is_unlocked_once(self):
        reward=Reward.objects.create(programme=self.programme,name='Milestone Scratch',description='Prize',awards=[{'name':'Pizza','type':'physical','quantity':1,'remaining':1,'weightage':1}],start_at=timezone.now(),end_at=timezone.now()+timedelta(days=7))
        self.programme.milestones=[{'tier':'bronze','xp':2000,'color':'#9d8cff','rewardId':reward.id}]
        self.programme.save(update_fields=['milestones'])
        from core.services import award_xp
        award_xp(target=self.player,actor=self.admin_user,amount=2000,source='staff-award',reason='Milestone test')
        self.assertEqual(RewardAssignment.objects.filter(reward=reward,target_profile=self.player,active=True).count(),1)
        self.assertEqual(Notification.objects.filter(profile=self.player,kind='reward').count(),1)
        award_xp(target=self.player,actor=self.admin_user,amount=100,source='staff-award',reason='Follow up')
        self.assertEqual(RewardAssignment.objects.filter(reward=reward,target_profile=self.player,active=True).count(),1)

    def test_public_map_hides_coordinates_without_token(self):
        MapEvent.objects.create(programme=self.programme,title='Edinburgh Quest',location_name='Centre',lat=55.9533,lng=-3.1883,start_at=timezone.now(),end_at=timezone.now()+timedelta(hours=1))
        response=self.client.get(f'/api/public/?instanceId={self.programme.id}')
        self.assertEqual(response.status_code,200)
        self.assertNotIn('lat',response.json().get('currentEvent') or {})
        self.assertNotIn('lng',response.json().get('currentEvent') or {})

class V58HardeningTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.programme = Programme.objects.create(name='V58', location='Edinburgh')
        self.youth_user = User.objects.create_user('v58-youth', password='YouthQuest123!')
        self.youth = Profile.objects.create(user=self.youth_user, role='youth', gamertag='Player', programme=self.programme)
        self.worker_user = User.objects.create_user('v58-worker', password='YouthQuest123!')
        self.worker = Profile.objects.create(user=self.worker_user, role='worker', gamertag='Worker', programme=self.programme)

    def login(self, username):
        response = self.client.post('/api/auth/login/', data=json.dumps({'username': username, 'password': 'YouthQuest123!'}), content_type='application/json')
        self.assertEqual(response.status_code, 200)

    def test_youth_cannot_manage_staff_rewards(self):
        self.login('v58-youth')
        self.assertEqual(self.client.get('/api/staff/rewards/').status_code, 403)
        self.assertEqual(self.client.post('/api/staff/rewards/', data=json.dumps({'action': 'delete', 'rewardId': 1}), content_type='application/json').status_code, 403)

    def test_youth_cannot_manage_staff_accounts(self):
        self.login('v58-youth')
        self.assertEqual(self.client.get('/api/staff/accounts/').status_code, 403)
        self.assertEqual(self.client.post('/api/staff/accounts/', data=json.dumps({'username': 'intruder', 'password': 'StrongPass123!', 'gamertag': 'Intruder', 'role': 'youth'}), content_type='application/json').status_code, 403)

    def test_reward_claim_creates_single_reward_notification(self):
        reward = Reward.objects.create(programme=self.programme, name='Scratch', description='Prize', fallback_xp=20, awards=[])
        RewardAssignment.objects.create(reward=reward, target_profile=self.youth, assigned_by=self.worker_user, active=True)
        self.login('v58-youth')
        response = self.client.post('/api/scratch/claim/', data=json.dumps({'rewardId': reward.id}), content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Notification.objects.filter(profile=self.youth, kind='reward').count(), 1)

class V61GameScoringAndNotificationTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.programme=Programme.objects.create(name='V61',location='Edinburgh',max_worker_points=100)
        self.admin_user=User.objects.create_user('v61-admin',password='YouthQuest123!')
        self.admin=Profile.objects.create(user=self.admin_user,role='admin',gamertag='Admin',programme=self.programme)
        self.worker_user=User.objects.create_user('v61-worker',password='YouthQuest123!')
        self.worker=Profile.objects.create(user=self.worker_user,role='worker',gamertag='Worker',programme=self.programme)
        self.player_user=User.objects.create_user('v61-player',password='YouthQuest123!')
        self.player=Profile.objects.create(user=self.player_user,role='youth',gamertag='Player',programme=self.programme)
    def login(self, username):
        r=self.client.post('/api/auth/login/',data=json.dumps({'username':username,'password':'YouthQuest123!'}),content_type='application/json'); self.assertEqual(r.status_code,200)
    def test_game_specific_scoring_uses_raw_units(self):
        from core.game_engine import game_specific_xp
        reaction={'scoring':[{'maxMs':250,'xp':100},{'maxMs':350,'xp':60},{'maxMs':5000,'xp':15}]}
        self.assertEqual(game_specific_xp('reaction',250,reaction,[],100),100)
        self.assertEqual(game_specific_xp('reaction',302,reaction,[],100),60)
        self.assertEqual(game_specific_xp('reaction',377,reaction,[],100),15)
        typing={'scoring':[{'minWpm':80,'xp':100},{'minWpm':50,'xp':60},{'minWpm':20,'xp':20}]}
        self.assertEqual(game_specific_xp('typing',80,typing,[],100),100)
        self.assertEqual(game_specific_xp('typing',55,typing,[],100),60)
    def test_group_award_updates_all_members(self):
        other_user=User.objects.create_user('v61-player2',password='YouthQuest123!')
        other=Profile.objects.create(user=other_user,role='youth',gamertag='Player2',programme=self.programme)
        group=Group.objects.create(name='Quest Group',programme=self.programme); group.members.add(self.player,other)
        self.login('v61-worker')
        r=self.client.post('/api/points/awards/',data=json.dumps({'groupId':group.id,'amount':25,'reason':'Team activity'}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.player.refresh_from_db(); other.refresh_from_db()
        self.assertEqual(self.player.current_xp,25); self.assertEqual(other.current_xp,25)
    def test_group_penalty_updates_all_members(self):
        other_user=User.objects.create_user('v61-player3',password='YouthQuest123!')
        other=Profile.objects.create(user=other_user,role='youth',gamertag='Player3',programme=self.programme,current_xp=50,lifetime_xp=50)
        self.player.current_xp=50; self.player.save(update_fields=['current_xp'])
        group=Group.objects.create(name='Penalty Group',programme=self.programme); group.members.add(self.player,other)
        self.login('v61-worker')
        r=self.client.post('/api/points/penalty/',data=json.dumps({'groupId':group.id,'amount':10,'reason':'Correction'}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.player.refresh_from_db(); other.refresh_from_db()
        self.assertEqual(self.player.current_xp,40); self.assertEqual(other.current_xp,40)
    def test_admin_approval_notifies_requesting_worker(self):
        req=PointAwardRequest.objects.create(target=self.player,requested_by=self.worker_user,amount=150,reason='Big team award')
        self.login('v61-admin')
        r=self.client.post('/api/points/awards/review/',data=json.dumps({'requestId':req.id,'decision':'approve'}),content_type='application/json')
        self.assertEqual(r.status_code,200)
        self.assertTrue(Notification.objects.filter(profile=self.worker,kind='approval',title='Points request approved').exists())

    def test_admin_rejection_notifies_requesting_worker(self):
        self.worker.notifications_opt_in=True
        self.worker.save(update_fields=['notifications_opt_in'])
        req=PointAwardRequest.objects.create(target=self.player,requested_by=self.worker_user,amount=150,reason='Big team award')
        self.login('v61-admin')
        r=self.client.post('/api/points/awards/review/',data=json.dumps({'requestId':req.id,'decision':'reject','reason':'Please add evidence.'}),content_type='application/json')
        self.assertEqual(r.status_code,200)
        n=Notification.objects.filter(profile=self.worker,kind='approval',title='Points request declined').latest('id')
        self.assertIn('Please add evidence.',n.body)
        self.assertIn('150 XP',n.body)
    def test_notification_clear_deletes_all(self):
        Notification.objects.create(profile=self.worker,title='One',body='One',kind='info')
        Notification.objects.create(profile=self.worker,title='Two',body='Two',kind='help')
        self.login('v61-worker')
        r=self.client.delete('/api/notifications/')
        self.assertEqual(r.status_code,200)
        self.assertEqual(Notification.objects.filter(profile=self.worker).count(),0)

class V65ReliabilityRegressionTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.programme=Programme.objects.create(name='V65',location='Edinburgh')
        self.worker_user=User.objects.create_user('v65-worker',password='YouthQuest123!')
        self.worker=Profile.objects.create(user=self.worker_user,role='worker',gamertag='Worker',programme=self.programme)
        self.youth_user=User.objects.create_user('v65-youth',password='YouthQuest123!')
        self.youth=Profile.objects.create(user=self.youth_user,role='youth',gamertag='Youth',programme=self.programme)
        self.youth2_user=User.objects.create_user('v65-youth2',password='YouthQuest123!')
        self.youth2=Profile.objects.create(user=self.youth2_user,role='youth',gamertag='Youth2',programme=self.programme)
        self.group=Group.objects.create(name='Quest Group',programme=self.programme);self.group.members.add(self.youth,self.youth2)
    def login(self):
        r=self.client.post('/api/auth/login/',data=json.dumps({'username':'v65-worker','password':'YouthQuest123!'}),content_type='application/json');self.assertEqual(r.status_code,200)
    def test_group_points_returns_exact_updated_count_and_notifications(self):
        self.login();r=self.client.post('/api/points/awards/',data=json.dumps({'groupId':self.group.id,'amount':25,'reason':'Team activity'}),content_type='application/json')
        self.assertEqual(r.status_code,200);data=r.json();self.assertEqual(data['updatedCount'],2);self.youth.refresh_from_db();self.youth2.refresh_from_db();self.assertEqual(self.youth.current_xp,25);self.assertEqual(self.youth2.current_xp,25);self.assertEqual(Notification.objects.filter(profile__in=[self.youth,self.youth2],kind='xp').count(),2)
    def test_group_scratch_assignment_fans_out_to_members(self):
        from core.models import Reward
        self.login();reward=Reward.objects.create(programme=self.programme,name='Pizza',description='Prize',active=True,start_at=timezone.now()-timedelta(minutes=1),end_at=timezone.now()+timedelta(days=1),awards=[{'name':'Pizza','type':'physical','quantity':1}])
        r=self.client.post('/api/staff/rewards/',data=json.dumps({'action':'assign','rewardId':reward.id,'targetType':'group','targetId':self.group.id}),content_type='application/json')
        self.assertEqual(r.status_code,201);self.assertEqual(r.json()['updatedCount'],2);self.assertEqual(RewardAssignment.objects.filter(reward=reward,target_profile__in=[self.youth,self.youth2],active=True).count(),2);self.assertEqual(Notification.objects.filter(profile__in=[self.youth,self.youth2],kind='reward').count(),2)
    def test_manual_map_access_code_grants_public_map(self):
        self.login();start=(timezone.now()+timedelta(minutes=15)).astimezone(timezone.get_current_timezone()).replace(second=0,microsecond=0).strftime('%Y-%m-%dT%H:%M');end=(timezone.now()+timedelta(hours=2)).astimezone(timezone.get_current_timezone()).replace(second=0,microsecond=0).strftime('%Y-%m-%dT%H:%M')
        r=self.client.post('/api/map-event/',data=json.dumps({'action':'private-link','accessCode':'QUEST26','hours':24}),content_type='application/json');self.assertEqual(r.status_code,200);self.assertEqual(r.json()['token'],'QUEST26')
        r=self.client.post('/api/map-event/',data=json.dumps({'title':'Quest','description':'D','locationName':'Centre','postcode':'EH1 1YZ','address':'Test address','lat':55.9533,'lng':-3.1883,'startAt':start,'endAt':end}),content_type='application/json');self.assertEqual(r.status_code,200)
        self.client.logout();r=self.client.get(f'/api/public/?instanceId={self.programme.id}&mapAccess=QUEST26');self.assertEqual(r.status_code,200);self.assertTrue(r.json()['mapAccessGranted']);self.assertIn('lat',r.json()['currentEvent'])

class V66AuthenticationAuthorisationTests(TestCase):
    """Regression tests for the public/private API boundary and role isolation."""
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.programme = Programme.objects.create(name='V66 Security', location='Edinburgh')
        self.admin_user = User.objects.create_user('v66-admin', password='YouthQuest123!')
        self.admin = Profile.objects.create(user=self.admin_user, role='admin', gamertag='Admin', programme=self.programme)
        self.worker_user = User.objects.create_user('v66-worker', password='YouthQuest123!')
        self.worker = Profile.objects.create(user=self.worker_user, role='worker', gamertag='Worker', programme=self.programme)
        self.youth_user = User.objects.create_user('v66-youth', password='YouthQuest123!')
        self.youth = Profile.objects.create(user=self.youth_user, role='youth', gamertag='Youth', programme=self.programme)

    def login(self, username):
        response = self.client.post('/api/auth/login/', data=json.dumps({'username': username, 'password': 'YouthQuest123!'}), content_type='application/json')
        self.assertEqual(response.status_code, 200)

    def test_privileged_mutations_reject_anonymous_users(self):
        cases = [
            ('/api/points/awards/', {'profileId': self.youth.id, 'amount': 10, 'reason': 'x'}),
            ('/api/points/penalty/', {'profileId': self.youth.id, 'amount': 1, 'reason': 'x'}),
            ('/api/attendance/session/', {}),
            ('/api/map-event/', {'title': 'x', 'lat': 55.95, 'lng': -3.18, 'startAt': 'NOW'}),
            ('/api/staff/accounts/', {'username': 'intruder'}),
            ('/api/staff/groups/members/', {'groupId': 1, 'memberIds': [self.youth.id]}),
            ('/api/staff/rewards/', {'action': 'delete', 'rewardId': 1}),
            ('/api/admin/config/', {'theme': 'neon'}),
        ]
        for path, payload in cases:
            response = self.client.post(path, data=json.dumps(payload), content_type='application/json')
            self.assertIn(response.status_code, (401, 403), path)

    def test_youth_cannot_use_staff_or_admin_mutations(self):
        self.login('v66-youth')
        cases = [
            ('/api/points/awards/', {'profileId': self.youth.id, 'amount': 10, 'reason': 'x'}),
            ('/api/points/penalty/', {'profileId': self.youth.id, 'amount': 1, 'reason': 'x'}),
            ('/api/attendance/session/', {}),
            ('/api/staff/accounts/', {'username': 'intruder'}),
            ('/api/staff/rewards/', {'action': 'delete', 'rewardId': 1}),
            ('/api/admin/config/', {'theme': 'neon'}),
        ]
        for path, payload in cases:
            response = self.client.post(path, data=json.dumps(payload), content_type='application/json')
            self.assertEqual(response.status_code, 403, path)

    def test_public_reaction_is_rate_limited_but_does_not_expose_private_data(self):
        for _ in range(30):
            self.assertEqual(self.client.post('/api/public/award/', data=json.dumps({'reaction': 'cheer'}), content_type='application/json').status_code, 200)
        self.assertEqual(self.client.post('/api/public/award/', data=json.dumps({'reaction': 'cheer'}), content_type='application/json').status_code, 429)

    def test_worker_cannot_delete_notification_sounds(self):
        self.login('v66-worker')
        response = self.client.delete('/api/notifications/sounds/', data=json.dumps({'id': 1}), content_type='application/json')
        self.assertEqual(response.status_code, 403)

class V67PointsAndAttendanceNotificationTests(TestCase):
    def setUp(self):
        self.client=Client(enforce_csrf_checks=False)
        self.programme=Programme.objects.create(name='V67 Notifications',location='Edinburgh',attendance_points=25,max_worker_points=100)
        self.wu=User.objects.create_user('v67-worker',password='YouthQuest123!')
        self.worker=Profile.objects.create(user=self.wu,role='worker',gamertag='Worker',programme=self.programme)
        self.yu=User.objects.create_user('v67-youth',password='YouthQuest123!')
        self.youth=Profile.objects.create(user=self.yu,role='youth',gamertag='Player',programme=self.programme)
        self.yu2=User.objects.create_user('v67-youth2',password='YouthQuest123!')
        self.youth2=Profile.objects.create(user=self.yu2,role='youth',gamertag='Player2',programme=self.programme)
        self.group=Group.objects.create(name='Team',programme=self.programme); self.group.members.add(self.youth,self.youth2)
    def login(self,username):
        r=self.client.post('/api/auth/login/',data=json.dumps({'username':username,'password':'YouthQuest123!'}),content_type='application/json'); self.assertEqual(r.status_code,200)
    def test_group_award_and_removal_return_exact_member_count(self):
        self.login('v67-worker')
        r=self.client.post('/api/points/awards/',data=json.dumps({'groupId':self.group.id,'amount':10,'reason':'Team work'}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.assertEqual(r.json()['updatedCount'],2)
        r=self.client.post('/api/points/penalty/',data=json.dumps({'groupId':self.group.id,'amount':5,'reason':'Correction'}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.assertEqual(r.json()['updatedCount'],2)
        self.assertEqual(Notification.objects.filter(profile=self.youth,kind='xp').count(),1)
        self.assertEqual(Notification.objects.filter(profile=self.youth,kind='penalty').count(),1)
        self.assertEqual(Notification.objects.filter(profile=self.youth2,kind='xp').count(),1)
        self.assertEqual(Notification.objects.filter(profile=self.youth2,kind='penalty').count(),1)
    def test_attendance_creates_single_points_notification(self):
        self.login('v67-worker')
        token=self.client.post('/api/attendance/session/',data='{}',content_type='application/json').json()['token']
        self.client.logout(); self.login('v67-youth')
        r=self.client.post('/api/attendance/scan/',data=json.dumps({'token':token}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.assertEqual(r.json()['awarded'],25)
        notifications=list(Notification.objects.filter(profile=self.youth).order_by('id').values('kind','title','body'))
        self.assertEqual(len(notifications),1)
        self.assertEqual(notifications[0]['kind'],'attendance')
        self.assertEqual(notifications[0]['title'],'Attendance +25 XP')

    def test_group_actions_always_return_affected_count(self):
        self.login('v67-worker')
        r=self.client.post('/api/points/awards/',data=json.dumps({'groupId':self.group.id,'amount':5,'reason':'Group'}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.assertEqual(r.json().get('status'),'bulk'); self.assertEqual(r.json().get('updatedCount'),2)
        r=self.client.post('/api/points/penalty/',data=json.dumps({'groupId':self.group.id,'amount':2,'reason':'Correction'}),content_type='application/json')
        self.assertEqual(r.status_code,200); self.assertEqual(r.json().get('status'),'bulk'); self.assertEqual(r.json().get('updatedCount'),2)

    def test_pending_popup_survives_logout_until_next_login(self):
        self.login();
        from core.services import create_notification
        create_notification(profile=self.youth,title='+10 XP',body='Offline award',kind='xp',url='/')
        self.client.post('/api/auth/logout/')
        r=self.client.get('/api/notifications/pending-popups/'); self.assertEqual(r.status_code,401)
        self.login()
        r=self.client.get('/api/notifications/pending-popups/'); self.assertEqual(r.status_code,200); ids=[x['id'] for x in r.json()['items']]; self.assertTrue(ids)
        r=self.client.post('/api/notifications/popup-delivered/',data=json.dumps({'ids':ids}),content_type='application/json'); self.assertEqual(r.status_code,200)
        self.assertEqual(r.json()['updated'],len(ids))
        self.assertEqual(self.client.get('/api/notifications/pending-popups/').json()['items'],[])
        self.assertEqual(self.client.get('/api/notifications/pending-popups/').json()['items'],[])


class PublicPointsQrTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.programme = Programme.objects.create(name='Public Feedback', location='London', max_worker_points=50, public_enabled=True, active=True, status='active')
        youth_user = User.objects.create_user('public-youth', password='YouthQuest123!')
        self.youth = Profile.objects.create(user=youth_user, role='youth', gamertag='Nova', programme=self.programme)
        worker_user = User.objects.create_user('public-worker', password='YouthQuest123!')
        self.worker = Profile.objects.create(user=worker_user, role='worker', gamertag='Worker', programme=self.programme)
        self.raw_token = 'public-test-token-abcdefghijklmnopqrstuvwxyz-123456'
        PointsQrToken.objects.create(profile=self.youth, token_hash=__import__('hashlib').sha256(self.raw_token.encode()).hexdigest(), active=True)

    def login_worker(self):
        return self.client.post('/api/auth/login/', data=json.dumps({'username':'public-worker','password':'YouthQuest123!'}), content_type='application/json')

    def test_public_submission_requires_no_login_and_is_pending(self):
        r = self.client.post('/api/public/points-request/', data=json.dumps({'token':self.raw_token,'name':'Jo','organisation':'Org','comment':'Great work','rating':5}), content_type='application/json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(PublicPointRequest.objects.count(), 0)
        r = self.client.post('/api/public/points-request/', data=json.dumps({'token':self.raw_token,'name':'Jordan','organisation':'A small organisation','comment':'Great work','rating':5}), content_type='application/json')
        self.assertEqual(r.status_code, 201)
        req = PublicPointRequest.objects.get()
        self.assertEqual(req.status, 'pending')
        self.assertEqual(self.youth.current_xp, 0)

    def test_public_rating_and_organisation_are_strictly_validated(self):
        too_many_words = ' '.join(['word'] * 51)
        r = self.client.post('/api/public/points-request/', data=json.dumps({'token':self.raw_token,'name':'Jordan','organisation':too_many_words,'comment':'ok','rating':5}), content_type='application/json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post('/api/public/points-request/', data=json.dumps({'token':self.raw_token,'name':'Jordan','organisation':'Org','comment':'ok','rating':'5 stars'}), content_type='application/json')
        self.assertEqual(r.status_code, 400)

    def test_worker_reviews_public_request_and_awards_public_points(self):
        self.client.post('/api/public/points-request/', data=json.dumps({'token':self.raw_token,'name':'Jordan','organisation':'Org','comment':'Helpful and welcoming','rating':4}), content_type='application/json')
        self.assertEqual(self.login_worker().status_code, 200)
        listing = self.client.get('/api/points/public-requests/')
        self.assertEqual(listing.status_code, 200)
        request_id = listing.json()['items'][0]['id']
        review = self.client.post('/api/points/public-requests/review/', data=json.dumps({'requestId':request_id,'decision':'approve','amount':25}), content_type='application/json')
        self.assertEqual(review.status_code, 200)
        self.youth.refresh_from_db()
        self.assertEqual(self.youth.current_xp, 25)
        self.assertTrue(XPTransaction.objects.filter(target=self.youth, source='public-points', amount=25).exists())
        self.assertEqual(PublicPointRequest.objects.get(id=request_id).status, 'approved')

    def test_worker_cannot_exceed_worker_public_point_limit(self):
        self.client.post('/api/public/points-request/', data=json.dumps({'token':self.raw_token,'name':'Jordan','organisation':'Org','comment':'Good','rating':3}), content_type='application/json')
        self.assertEqual(self.login_worker().status_code, 200)
        request_id = self.client.get('/api/points/public-requests/').json()['items'][0]['id']
        review = self.client.post('/api/points/public-requests/review/', data=json.dumps({'requestId':request_id,'decision':'approve','amount':51}), content_type='application/json')
        self.assertEqual(review.status_code, 400)
        self.youth.refresh_from_db()
        self.assertEqual(self.youth.current_xp, 0)

class PushNotificationHardeningTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=False)
        self.programme = Programme.objects.create(name='Push Programme', location='L')
        self.a_user = User.objects.create_user('push-a', password='YouthQuest123!')
        self.a = Profile.objects.create(user=self.a_user, role='youth', gamertag='A', programme=self.programme)
        self.b_user = User.objects.create_user('push-b', password='YouthQuest123!')
        self.b = Profile.objects.create(user=self.b_user, role='youth', gamertag='B', programme=self.programme)

    def login(self, username):
        response = self.client.post('/api/auth/login/', data=json.dumps({'username':username,'password':'YouthQuest123!'}), content_type='application/json')
        self.assertEqual(response.status_code, 200)

    def test_push_subscription_cannot_be_reassigned_between_accounts(self):
        self.login('push-a')
        payload={'subscription':{'endpoint':'https://push.example/subscription-a','keys':{'p256dh':'p256dh','auth':'auth'}}}
        self.assertEqual(self.client.post('/api/notifications/push/', data=json.dumps(payload), content_type='application/json').status_code, 200)
        self.client.post('/api/auth/logout/', data='{}', content_type='application/json')
        self.login('push-b')
        self.assertEqual(self.client.post('/api/notifications/push/', data=json.dumps(payload), content_type='application/json').status_code, 409)
        self.assertEqual(PushSubscription.objects.get(endpoint=payload['subscription']['endpoint']).profile_id, self.a.id)

    def test_push_subscription_enables_notification_master_preference(self):
        self.login('push-a')
        self.a.notifications_opt_in=False
        self.a.save(update_fields=['notifications_opt_in'])
        payload={'subscription':{'endpoint':'https://push.example/subscription-b','keys':{'p256dh':'p256dh','auth':'auth'}}}
        response=self.client.post('/api/notifications/push/',data=json.dumps(payload),content_type='application/json')
        self.assertEqual(response.status_code,200)
        self.a.refresh_from_db()
        self.assertTrue(self.a.notifications_opt_in)
        self.assertTrue(self.a.push_notifications_opt_in)


class LoginAndQrRewardTests(TestCase):
    def setUp(self):
        self.programme = Programme.objects.create(
            name='Rewards', location='Glasgow', attendance_points=100,
            streak_rules=[{'days': 2, 'multiplier': 1.2}, {'days': 3, 'multiplier': 1.5}],
            login_reward_config={
                'enabled': True, 'daily_xp': 10, 'timezone': 'Europe/London',
                'milestones': [{'days': 2, 'bonus_xp': 20}, {'days': 3, 'bonus_xp': 30}],
            },
        )
        self.youth_user = User.objects.create_user('reward-youth', password='YouthQuest123!')
        self.youth = Profile.objects.create(user=self.youth_user, role='youth', gamertag='Comet', programme=self.programme)
        self.worker_user = User.objects.create_user('reward-worker', password='YouthQuest123!')
        self.worker = Profile.objects.create(user=self.worker_user, role='worker', gamertag='Worker', programme=self.programme)
        self.client = Client(enforce_csrf_checks=False)

    def _login(self, username):
        response = self.client.post('/api/auth/login/', data=json.dumps({
            'username': username, 'password': 'YouthQuest123!',
        }), content_type='application/json')
        self.assertEqual(response.status_code, 200)

    def test_successful_login_awards_once_and_refresh_does_not_award(self):
        login_payload = json.dumps({'username': 'reward-youth', 'password': 'YouthQuest123!'})
        first = self.client.post('/api/auth/login/', data=login_payload, content_type='application/json')
        self.assertEqual(first.status_code, 200)
        self.youth.refresh_from_db()
        self.assertEqual(self.youth.current_xp, 10)
        self.client.post('/api/auth/refresh/', data=json.dumps({}), content_type='application/json')
        self.client.post('/api/auth/login/', data=login_payload, content_type='application/json')
        self.youth.refresh_from_db()
        self.assertEqual(self.youth.current_xp, 10)
        self.assertEqual(DailyLogin.objects.filter(profile=self.youth).count(), 1)
        self.assertEqual(XPTransaction.objects.filter(target=self.youth, source='daily_login').count(), 1)

    def test_login_rewards_are_idempotent_and_milestones_award_once(self):
        from unittest.mock import patch
        from datetime import datetime
        from django.utils.timezone import make_aware
        from core.services import process_daily_login_reward

        for day in (17, 18, 19):
            moment = make_aware(datetime(2026, 11, day, 12, 0))
            with patch('core.services.timezone.now', return_value=moment):
                result = process_daily_login_reward(self.youth)
                if day == 19:
                    duplicate = process_daily_login_reward(self.youth)
        self.youth.refresh_from_db()
        self.assertEqual(self.youth.current_xp, 80)
        self.assertEqual(XPTransaction.objects.filter(target=self.youth, source='daily_login').count(), 3)
        self.assertEqual(XPTransaction.objects.filter(target=self.youth, source='login_streak').count(), 2)
        self.assertFalse(duplicate['awarded'])
        self.assertEqual(result['streak'], 3)

    def test_qr_checkins_apply_onsite_multipliers_once_per_local_day(self):
        from unittest.mock import patch
        from datetime import datetime
        from zoneinfo import ZoneInfo

        attendance_results = []
        first_moment = datetime(2026, 11, 17, 12, 0, tzinfo=ZoneInfo('Europe/London'))
        with patch('core.services.timezone.now', return_value=first_moment):
            self._login('reward-youth')
        for day in (17, 18, 19):
            moment = datetime(2026, 11, day, 12, 0, tzinfo=ZoneInfo('Europe/London'))
            token = f'reward-qr-{day}'
            AttendanceSession.objects.create(
                programme=self.programme, created_by=self.worker_user, token=token,
                expires_at=moment + timedelta(minutes=5),
            )
            with patch('api.attendance.timezone.now', return_value=moment), patch('core.services.timezone.now', return_value=moment):
                scan = self.client.post('/api/attendance/scan/', data=json.dumps({'token': token}), content_type='application/json')
                self.assertEqual(scan.status_code, 200)
                attendance_results.append(scan.json())

        self.assertEqual([row['awarded'] for row in attendance_results], [100, 120, 150])
        self.assertEqual([row['streak'] for row in attendance_results], [1, 2, 3])
        self.assertEqual([row['multiplier'] for row in attendance_results], [1.0, 1.2, 1.5])
        self.assertEqual(XPTransaction.objects.filter(target=self.youth, source='attendance').count(), 3)

    def test_second_qr_scan_same_day_does_not_award_again(self):
        self._login('reward-youth')
        first_session = AttendanceSession.objects.create(
            programme=self.programme, created_by=self.worker_user, token='same-day-first',
            expires_at=timezone.now()+timedelta(minutes=5),
        )
        second_session = AttendanceSession.objects.create(
            programme=self.programme, created_by=self.worker_user, token='same-day-second',
            expires_at=timezone.now()+timedelta(minutes=5),
        )
        first = self.client.post('/api/attendance/scan/', data=json.dumps({'token': first_session.token}), content_type='application/json')
        self.assertEqual(first.status_code, 200)
        second = self.client.post('/api/attendance/scan/', data=json.dumps({'token': second_session.token}), content_type='application/json')
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()['alreadyRewardedToday'])
        self.assertEqual(second.json()['awarded'], 0)
        self.assertEqual(XPTransaction.objects.filter(target=self.youth, source='attendance').count(), 1)

    def test_inactive_account_membership_is_retained_and_can_be_counted(self):
        group = Group.objects.create(name='Inactive-aware group', programme=self.programme)
        group.members.add(self.youth)
        self._login('reward-worker')
        disabled = self.client.post('/api/staff/accounts/', data=json.dumps({
            'action': 'set_access', 'userId': self.youth_user.id, 'active': False,
        }), content_type='application/json')
        self.assertEqual(disabled.status_code, 200)
        membership = GroupMembership.objects.get(group=group, profile=self.youth)
        self.assertEqual(membership.status, 'inactive')
        updated = self.client.post('/api/staff/groups/members/', data=json.dumps({
            'groupId': group.id, 'memberIds': [self.youth.id], 'includeInactiveMembers': True,
        }), content_type='application/json')
        self.assertEqual(updated.status_code, 200)
        group.refresh_from_db()
        self.assertTrue(group.include_inactive_members)
        self.assertEqual(group.members.filter(pk=self.youth.id).count(), 1)
        enabled = self.client.post('/api/staff/accounts/', data=json.dumps({
            'action': 'set_access', 'userId': self.youth_user.id, 'active': True,
        }), content_type='application/json')
        self.assertEqual(enabled.status_code, 200)
        membership.refresh_from_db()
        self.assertEqual(membership.status, 'active')

    def test_map_event_has_no_separate_attendance_reward_configuration(self):
        event = MapEvent.objects.create(
            programme=self.programme, title='Scheduled activity',
            start_at=timezone.now()+timedelta(days=2),
            end_at=timezone.now()+timedelta(days=2, hours=2),
        )
        self.assertFalse(hasattr(event, 'attendance_enabled'))
        self.assertFalse(hasattr(event, 'attendance_base_xp'))
        self.assertEqual(EventCheckIn.objects.filter(event=event).count(), 0)

    def test_group_xp_stays_with_group_when_member_leaves(self):
        from core.services import award_xp
        first = Group.objects.create(name='First group', programme=self.programme)
        second = Group.objects.create(name='Second group', programme=self.programme)
        first.members.add(self.youth)
        award_xp(target=self.youth, actor=self.worker_user, amount=100, source='test', reason='Before transfer')
        first.members.remove(self.youth)
        second.members.add(self.youth)
        award_xp(target=self.youth, actor=self.worker_user, amount=50, source='test', reason='After transfer')
        first.refresh_from_db(); second.refresh_from_db()
        self.assertEqual(first.xp, 100)
        self.assertEqual(second.xp, 50)
        self.assertEqual(sum(GroupXPContribution.objects.filter(group=first).values_list('amount', flat=True)), 100)
        self.assertEqual(sum(GroupXPContribution.objects.filter(group=second).values_list('amount', flat=True)), 50)
        self.assertEqual(GroupMembership.objects.get(group=first, profile=self.youth).status, 'transferred')
        self.assertEqual(GroupMembership.objects.get(group=second, profile=self.youth).status, 'active')

    def test_group_leaderboards_expose_weekly_monthly_and_overall_periods(self):
        from core.services import award_xp
        self.programme.group_scoring_config = {'minimum_group_size': 1, 'ranking_periods': ['weekly', 'monthly', 'overall']}
        self.programme.save(update_fields=['group_scoring_config'])
        group = Group.objects.create(name='Comets', programme=self.programme)
        group.members.add(self.youth)
        award_xp(target=self.youth, actor=self.worker_user, amount=75, source='test', reason='Leaderboard XP')
        response = self.client.get('/api/public/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.json()['groupLeaderboards'].keys()), {'weekly', 'monthly', 'overall'})
        overall = response.json()['groupLeaderboards']['overall'][0]
        self.assertEqual(overall['name'], 'Comets')
        self.assertEqual(overall['xp'], 75)
        self.assertEqual(overall['rank'], 1)

