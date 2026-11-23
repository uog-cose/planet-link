from .common import *
from core.game_engine import GAME_TYPES, make_challenge, score_attempt, xp_for_performance, game_specific_xp
from core.services import programme_local_date, attendance_streak_multiplier, event_attendance_streak
from django.http import FileResponse

@auth_required
def dashboard(request):
    p = require_role(request, ['youth'])
    if not p:
        return ok({'detail': 'Forbidden'}, 403)
    programme = active_programme_for(p)
    if not programme:
        return ok({'detail': 'No active programme'}, 400)
    scoring_config = programme.group_scoring_config if isinstance(programme.group_scoring_config, dict) else {}
    minimum_group_size = max(1, int(scoring_config.get('minimum_group_size', 2) or 2))
    group_rows = []
    for group in Group.objects.filter(programme=programme).prefetch_related('members'):
        eligible = group.members.filter(role='youth', programme=programme)
        if not group.include_inactive_members:
            eligible = eligible.filter(user__is_active=True)
        eligible_count = eligible.count()
        collective_xp = int(group.xp or 0)
        group_rows.append({
            'id': group.id, 'name': group.name, 'xp': collective_xp,
            'eligibleMembers': eligible_count,
            'averageXpPerMember': round(collective_xp / eligible_count, 2) if eligible_count else 0,
            'ranked': eligible_count >= minimum_group_size,
            'includeInactiveMembers': group.include_inactive_members,
            'targetXp': programme.target_xp,
            'progress': round(min(100, max(0, (collective_xp / max(1, programme.target_xp)) * 100)), 1),
        })
    ranked_groups = sorted([g for g in group_rows if g['ranked']], key=lambda g: (-g['averageXpPerMember'], g['name'].lower(), g['id']))
    group_ranks = {g['id']: index for index, g in enumerate(ranked_groups, 1)}
    groups = [{**g, 'rank': group_ranks.get(g['id'])} for g in group_rows if p.groups.filter(pk=g['id']).exists()]
    assigned_skill_ids = SkillAssignment.objects.filter(active=True).filter(models.Q(target_profile=p)|models.Q(target_group__members=p,target_group__programme=programme)).values_list('skill_id', flat=True)
    profile_skills = p.profileskill_set.filter(skill_id__in=assigned_skill_ids).filter(models.Q(skill__programme=programme)|models.Q(skill__programme__isnull=True)).select_related("skill")
    skills = []
    for ps in profile_skills:
        skill_milestones=list(ps.skill.milestone_records.select_related('reward').order_by('order','id'))
        completed_indexes=set(ps.completed_milestones if isinstance(ps.completed_milestones,list) else [])
        current_level=min(len(skill_milestones)+1, 1 + sum(1 for i,m in enumerate(skill_milestones) if ps.progress >= int(m.progress or 0) or i in completed_indexes))
        skills.append({"name": ps.skill.name, "description": ps.skill.description, "progress": ps.progress, "completed": ps.completed, "reward": ps.skill.xp_reward, "currentLevel": current_level, "totalLevels": len(skill_milestones)+1, "completedMilestones": list(completed_indexes), "milestones":[{"id":m.id,"name":m.name,"progress":m.progress,"xp":m.xp,"rewardId":m.reward_id,"reward":m.reward.name if m.reward_id else "","mysteryBox":bool(m.reward_id and m.reward and 'mystery' in m.reward.name.lower())} for m in skill_milestones]})
    badges = [{"name": b.badge.name, "description": b.badge.description, "icon": b.badge.icon} for b in p.profilebadge_set.select_related("badge")]
    milestone_defs=[m for m in (programme.milestones if isinstance(programme.milestones,list) else []) if isinstance(m,dict) and str(m.get('tier','')).strip()]
    achievement_total=len(milestone_defs)
    achievement_unlocked=sum(1 for m in milestone_defs if p.lifetime_xp >= int(m.get('xp',0) or 0))
    milestone_reward_ids={int(m.get('rewardId')) for m in milestone_defs if str(m.get('rewardId','')).isdigit()}
    milestone_reward_names={r.id:r.name for r in Reward.objects.filter(id__in=milestone_reward_ids,programme=programme)}
    awards=[{'tier':str(m.get('tier','Milestone')),'xp':int(m.get('xp',0) or 0),'color':str(m.get('color','#9d8cff')),'rewardId':m.get('rewardId'),'rewardName':milestone_reward_names.get(int(m.get('rewardId'))) if str(m.get('rewardId','')).isdigit() else '', 'mysteryBox':bool(str(milestone_reward_names.get(int(m.get('rewardId'))) if str(m.get('rewardId','')).isdigit() else '').lower().find('mystery')>=0)} for m in sorted(milestone_defs,key=lambda x:int(x.get('xp',0) or 0))]
    notes = list(p.notifications.order_by("-created_at")[:8].values("id", "title", "body", "kind", "url", "read", "created_at")) if p.notifications_opt_in else []
    now=timezone.now()
    reward_qs=Reward.objects.filter(programme=programme,active=True).filter(models.Q(start_at__isnull=True)|models.Q(start_at__lte=now)).filter(models.Q(end_at__isnull=True)|models.Q(end_at__gte=now))
    reward_cards=[]
    for r in reward_qs.order_by('end_at','id'):
        assigned=RewardAssignment.objects.filter(reward=r,active=True).filter(models.Q(target_profile=p)|models.Q(target_group__members=p)).exists()
        awards_data=r.awards if isinstance(r.awards,list) else []
        available=sum(max(0,int(a.get('remaining',1 if 'remaining' not in a else 0) or 0)) for a in awards_data if isinstance(a,dict) and a.get('available',True) and str(a.get('name','')).strip())
        has_claim=ScratchClaim.objects.filter(reward=r,profile=p).exists()
        if assigned and (available or int(r.fallback_xp or 0)>0) and not has_claim:
            reward_cards.append({'id':r.id,'name':r.name,'description':r.description,'awardCount':available,'endAt':r.end_at})
            if len(reward_cards)>=3: break
    reward_available=bool(reward_cards)
    assignments=GameAssignment.objects.filter(game__programme=programme,game__active=True,active=True).filter(models.Q(target_profile=p)|models.Q(target_group__members=p,target_group__programme=programme)).filter(models.Q(game__end_at__isnull=True)|models.Q(game__end_at__gte=now)).select_related("game").order_by("game__start_at","game__due_at")[:8]
    challenges=[]
    for a in assignments:
        attempts=DrawingSubmission.objects.filter(profile=p,game=a.game,created_at__gte=a.assigned_at).count() if a.game.kind=='drawing' else (GameAttempt.objects.filter(profile=p,game=a.game,assignment=a,started_at__gte=a.assigned_at).count() if a.game.kind in GAME_TYPES else 0)
        status='live' if not a.game.start_at or a.game.start_at<=now else 'upcoming'
        if a.game.end_at and a.game.end_at<now: status='expired'
        if a.game.kind in {'drawing',*GAME_TYPES.keys()} and attempts>=a.game.retries_per_player: status='completed'
        challenges.append({"id":a.game.id,"title":a.game.title,"description":a.game.description,"xp_reward":a.game.xp_reward,"due_at":a.due_at or a.game.due_at,"assignmentId":a.id,"kind":a.game.kind,"shape":a.game.shape,"scoreRanges":a.game.score_ranges,"gameConfig":a.game.game_config,"startAt":a.game.start_at,"endAt":a.game.end_at,"status":status,"attemptsUsed":attempts,"attemptsRemaining":max(0,a.game.retries_per_player-attempts),"retries":a.game.retries_per_player})
    drawings = list(p.drawing_submissions.filter(game__programme=programme).order_by("-created_at")[:5].values("id", "title", "score", "status", "feedback", "created_at", "game_id"))
    recent_xp=list(p.xp_transactions.filter(programme=programme).order_by('-created_at')[:8].values('amount','source','reason','created_at'))
    game_rows=list(p.game_attempts.filter(game__programme=programme,status='completed').select_related('game','assignment').order_by('-completed_at').values('assignment_id','game__title','raw_score','score_unit','performance','xp_awarded','completed_at'))
    game_activity=[]; grouped_games={}
    # A retry is one game lifecycle. Prefer the attempt that actually received XP
    # (best-attempt games may award an earlier attempt), otherwise use the latest.
    for row in game_rows:
        aid=row['assignment_id']
        current=grouped_games.get(aid)
        if current is None or (int(row.get('xp_awarded') or 0)>0 and int(current.get('xp_awarded') or 0)==0):
            grouped_games[aid]=row
    game_activity=list(grouped_games.values())
    personal_bests=[]
    for kind, label, unit, better in [('reaction','Reaction','ms','lower'),('sequence','Sequence Memory','level','higher'),('number_memory','Number Memory','digits','higher'),('visual_memory','Visual Memory','squares','higher'),('typing','Typing','WPM','higher')]:
        qs=p.game_attempts.filter(game__programme=programme,game__kind=kind,status='completed',score_unit=unit)
        if qs.exists():
            row=qs.order_by('raw_score').first() if better=='lower' else qs.order_by('-raw_score').first()
            personal_bests.append({'kind':kind,'label':label,'score':float(row.raw_score or 0),'unit':unit,'gameTitle':row.game.title})
    points_assigned=list(p.xp_transactions.filter(programme=programme,source__in=['staff','staff-award','staff-award-approved','qr-approved','point-award','qr-points']).order_by('-created_at')[:10].values('amount','reason','created_at','source'))
    attendance_dates=list(p.attendances.filter(session__programme=programme).order_by('-attendance_date').values_list('attendance_date',flat=True))
    today=programme_local_date(programme, now)
    attendance_date_set = set(attendance_dates)
    week_start = today - timedelta(days=today.weekday())
    attendance_last7=[1 if (week_start+timedelta(days=i)) in attendance_date_set else 0 for i in range(7)]
    attendance_last28=[1 if (today-timedelta(days=i)) in attendance_date_set else 0 for i in range(28)]
    attendance_trend=[]
    for week_index in range(11,-1,-1):
        week_end=today-timedelta(days=week_index*7)
        week_start=week_end-timedelta(days=6)
        attended=sum(1 for d in attendance_dates if week_start <= d <= week_end)
        attendance_trend.append({'label':week_end.strftime('%d %b'),'attended':attended})
    events=event_summary(programme)
    login_config = programme.login_reward_config if isinstance(programme.login_reward_config, dict) else {}
    login_today = programme_local_date(programme, now)
    login_dates = set(p.daily_logins.filter(programme=programme, local_date__lte=login_today).values_list('local_date', flat=True))
    last_login = max(login_dates) if login_dates else None
    login_streak = 0
    if last_login and last_login >= login_today - timedelta(days=1):
        cursor = last_login
        while cursor in login_dates:
            login_streak += 1
            cursor -= timedelta(days=1)
    logged_in_today = login_today in login_dates
    next_login_streak = login_streak + 1
    login_milestones = login_config.get('milestones', []) if isinstance(login_config.get('milestones', []), list) else []
    valid_login_rules = sorted([x for x in login_milestones if isinstance(x, dict)], key=lambda x: int(x.get('days', 0) or 0))
    next_login_rule = next((r for r in valid_login_rules if int(r.get('days', 0) or 0) > login_streak), None)
    next_login_bonus = int(next_login_rule.get('bonus_xp', 0) or 0) if next_login_rule and int(next_login_rule.get('days', 0) or 0) == next_login_streak else 0
    login_rewards_enabled = bool(login_config.get('enabled', True))
    daily_login_xp = max(0, int(login_config.get('daily_xp', 10) or 0)) if login_rewards_enabled else 0
    login_streak_payload = {
        'current': login_streak, 'enabled': login_rewards_enabled, 'dailyXp': daily_login_xp,
        'loggedInToday': logged_in_today, 'nextMilestone': next_login_rule if login_rewards_enabled else None,
        'milestoneWithinDays': max(0, int(next_login_rule.get('days', 0) or 0) - login_streak) if next_login_rule else None,
        'nextRewardXp': daily_login_xp + next_login_bonus if login_rewards_enabled else 0,
    }

    attendance_streak = event_attendance_streak(p, programme, now)
    current_event = MapEvent.objects.filter(
        programme=programme, status__in=['scheduled', 'current'],
        start_at__lte=now, end_at__gt=now,
    ).order_by('start_at', 'id').first()
    attended_current_event = bool(current_event and EventCheckIn.objects.filter(event=current_event, participant=p).exists())
    next_attendance_streak = attendance_streak + 1
    attendance_rules = programme.streak_rules if isinstance(programme.streak_rules, list) else []
    valid_attendance_rules = sorted(
        [x for x in attendance_rules if isinstance(x, dict)],
        key=lambda x: int(x.get('events', x.get('days', 0)) or 0),
    )
    current_attendance_multiplier = attendance_streak_multiplier(programme, attendance_streak)
    next_attendance_multiplier = attendance_streak_multiplier(programme, next_attendance_streak)
    next_attendance_rule = next((r for r in valid_attendance_rules if int(r.get('events', r.get('days', 0)) or 0) > attendance_streak), None)
    attendance_base_xp = max(0, int(programme.attendance_points or 0))
    attendance_streak_payload = {
        'current': attendance_streak, 'hasAttendedCurrentEvent': attended_current_event, 'hasAttendedToday': attended_current_event,
        'baseXp': attendance_base_xp, 'currentMultiplier': current_attendance_multiplier,
        'nextMultiplier': next_attendance_multiplier, 'nextMilestone': next_attendance_rule,
        'milestoneWithinEvents': max(0, int(next_attendance_rule.get('events', next_attendance_rule.get('days', 0)) or 0) - attendance_streak) if next_attendance_rule else None,
        'nextRewardXp': int(round(attendance_base_xp * next_attendance_multiplier)),
    }
    return ok({"loginStreak": login_streak_payload, "onsiteAttendanceStreak": attendance_streak_payload, "profile": {"gamertag": p.gamertag, "avatar": p.avatar, "avatarImageUrl": (request.build_absolute_uri(f'/api/profile/avatar-image/{p.id}/') if p.avatar_image else None), "milestoneTier": milestone_tier(p), "milestoneColor": milestone_color(p), "currentXp": p.current_xp, "lifetimeXp": p.lifetime_xp, "level": p.level, "streak": current_attendance_streak(p), "groupXp": sum(int(g.get('xp',0) or 0) for g in groups)}, "groups": groups, "skills": skills, "badges": badges, "personalBests": personal_bests, "achievementStats": {"unlocked": achievement_unlocked, "total": achievement_total}, "awards": awards, "notifications": notes, "challenges": challenges, "drawings": drawings, "recentXp": recent_xp, "attendanceStats":{"last7":attendance_last7,"last28":attendance_last28,"daysLast7":sum(attendance_last7),"daysLast28":sum(attendance_last28),"trend":attendance_trend}, "rewardCards": reward_cards, "rewardAvailable": reward_available, "activityTabs":{"attendance":list(p.attendances.filter(session__programme=programme).order_by("-attended_at")[:10].values("attended_at","attendance_date")),"scratch":list(p.scratch_claims.filter(reward__programme=programme).order_by("-claimed_at")[:10].values("award_name","amount","claimed_at")),"games":game_activity,"pointsAssigned":points_assigned,"publicPoints":list(p.xp_transactions.filter(programme=programme,source="public").order_by("-created_at")[:10].values("amount","reason","created_at"))}, "programme": programme and {"name":programme.name,"location":programme.location,"theme":programme.theme,"target_xp":programme.target_xp,"theme_config":programme.theme_config,"milestones":programme.milestones,"dashboardConfig":((programme.public_config or {}).get("youthDashboard", {}) if isinstance(programme.public_config,dict) else {})}, **events})

@require_http_methods(["POST"])
def xp(request):
    p = require_role(request, ["worker", "admin"])
    if not p:
        return ok({"detail": "Forbidden"}, 403)
    body = parse_json(request)
    if body is None:
        return ok({"detail": "Invalid JSON"}, 400)
    try:
        target = Profile.objects.get(id=int(body["targetId"]), role='youth')
        amount = int(body["amount"])
    except (KeyError, ValueError, TypeError, Profile.DoesNotExist):
        return ok({"detail": "Invalid target or amount"}, 400)
    programme=active_programme_for(p)
    if not programme:
        return ok({'detail':'No active programme'},403)
    if target.programme_id != programme.id:
        return ok({'detail':'Young person is outside your active programme'},403)
    if amount <= 0 or amount > 5000:
        return ok({"detail": "XP awards must be between 1 and 5000. Use the penalty endpoint for deductions."}, 400)
    reason = str(body.get("reason", "Staff award"))[:240]
    programme=active_programme_for(p)
    if p.role=="worker" and amount>int(programme.max_worker_points if programme else 100):
        req=PointAwardRequest.objects.create(target=target,requested_by=request.user,amount=amount,reason=reason)
        AuditLog.objects.create(actor=request.user,action="point_award_requested",target=str(target.id),detail={"requestId":str(req.id),"amount":amount,"reason":reason,"source":"legacy-xp"})
        return ok({"status":"pending","requestId":req.id},202)
    tx, target = award_xp(target=target, actor=request.user, amount=amount, source='staff', reason=reason)
    AuditLog.objects.create(actor=request.user, action="xp_change", target=str(target.id), detail={"amount": amount, "reason": reason})
    return ok({"ok": True, "newXp": target.current_xp})

@require_http_methods(["GET"])
@auth_required
def challenges(request):
    p=require_role(request,['youth'])
    if not p:return ok({'detail':'Forbidden'},403)
    now=timezone.now(); programme=active_programme_for(p)
    qs=GameAssignment.objects.filter(game__programme=programme,active=True).filter(models.Q(target_profile=p)|models.Q(target_group__members=p)).select_related('game').order_by('game__start_at','game__due_at')
    seen=set(); items=[]
    for a in qs:
        g=a.game
        if g.id in seen or not g.active: continue
        seen.add(g.id)
        if g.kind=='drawing':
            attempts=DrawingSubmission.objects.filter(profile=p,game=g,created_at__gte=a.assigned_at).count()
        elif g.kind in GAME_TYPES:
            attempts=GameAttempt.objects.filter(profile=p,game=g,assignment=a,started_at__gte=a.assigned_at).count()
        else:
            attempts=0
        start=g.start_at; end=g.end_at
        status='live'
        if start and start>now: status='upcoming'
        elif end and end<now: status='expired'
        elif attempts>=g.retries_per_player: status='completed'
        items.append({'id':g.id,'title':g.title,'description':g.description,'xp_reward':g.xp_reward,'due_at':a.due_at or g.due_at,'assignmentId':a.id,'kind':g.kind,'shape':g.shape,'scoreRanges':g.score_ranges,'gameConfig':g.game_config,'startAt':g.start_at,'endAt':g.end_at,'status':status,'attemptsUsed':attempts,'attemptsRemaining':max(0,g.retries_per_player-attempts) if g.kind in {'drawing',*GAME_TYPES.keys()} else None,'retries':g.retries_per_player,'gameType':g.kind if g.kind in GAME_TYPES else None,'scoreUnit':GAME_TYPES.get(g.kind,{}).get('unit')})
    return ok({'items':items})

@require_http_methods(["POST"])
@auth_required
def game_start(request):
    p=require_role(request,['youth'])
    if not p:return ok({'detail':'Forbidden'},403)
    body=parse_json(request) or {}
    try: game_id=int(body.get('gameId')); assignment_id=int(body.get('assignmentId'))
    except (TypeError,ValueError): return ok({'detail':'Invalid game assignment'},400)
    programme=active_programme_for(p); now=timezone.now()
    assignment=GameAssignment.objects.filter(id=assignment_id,game_id=game_id,active=True,game__programme=programme).filter(models.Q(target_profile=p)|models.Q(target_group__members=p)).select_related('game').first()
    if not assignment:return ok({'detail':'This game is not assigned to you.'},403)
    game=assignment.game
    if game.kind not in GAME_TYPES:return ok({'detail':'This game type is not playable.'},400)
    if game.start_at and game.start_at>now:return ok({'detail':'This game has not started yet.'},400)
    if game.end_at and game.end_at<now:return ok({'detail':'This game has ended.'},400)
    if not rate_limit(f'game-start:{p.id}',30,3600):return ok({'detail':'Too many game starts. Please try again later.'},429)
    # Enforce the configured retry limit on the server, under a row lock. The client
    # may show a remaining-round counter, but the database is the source of truth.
    with transaction.atomic():
        assignment=GameAssignment.objects.select_for_update().select_related('game').get(pk=assignment.pk)
        active_attempt=GameAttempt.objects.filter(profile=p,game=game,assignment=assignment,status='started').order_by('-started_at').first()
        attempts_used=GameAttempt.objects.filter(profile=p,game=game,assignment=assignment,started_at__gte=assignment.assigned_at).count()
        if active_attempt and active_attempt.started_at >= now-timedelta(minutes=30):
            challenge=dict(active_attempt.challenge_data or {})
            remaining=max(0,int(game.retries_per_player or 1)-attempts_used)
            return ok({'attemptId':str(active_attempt.id),'gameId':game.id,'gameType':game.kind,'challenge':challenge,'attemptsUsed':attempts_used,'attemptsRemaining':remaining,'resumed':True},200)
        if attempts_used >= int(game.retries_per_player or 1):
            return ok({'detail':f'No rounds remaining. You used {attempts_used} of {game.retries_per_player} rounds.','attemptsUsed':attempts_used,'attemptsRemaining':0},400)
        challenge=make_challenge(game.kind,game.game_config)
        attempt=GameAttempt.objects.create(assignment=assignment,profile=p,game=game,challenge_data=challenge)
        attempts_used += 1
    public=dict(challenge)
    # The server validates the answer against challenge_data. Never trust client-supplied XP.
    remaining=max(0,int(game.retries_per_player or 1)-attempts_used)
    return ok({'attemptId':str(attempt.id),'gameId':game.id,'gameType':game.kind,'challenge':public,'attemptsUsed':attempts_used,'attemptsRemaining':remaining},201)

@require_http_methods(["POST"])
@auth_required
def game_submit(request):
    p=require_role(request,['youth'])
    if not p:return ok({'detail':'Forbidden'},403)
    body=parse_json(request) or {}; attempt_id=body.get('attemptId')
    try: attempt=GameAttempt.objects.select_related('game','assignment').get(id=attempt_id,profile=p)
    except (TypeError,ValueError,GameAttempt.DoesNotExist): return ok({'detail':'Game attempt not found'},404)
    if attempt.status!='started':
        # Submissions are idempotent by attempt ID. If the server committed the
        # result but the response was lost, the client can safely retry the same
        # attempt and receive the original result instead of creating another XP award.
        if attempt.status=='completed':
            xp=int(attempt.xp_awarded or 0)
            consumed=GameAttempt.objects.filter(profile=p,game=attempt.game,assignment=attempt.assignment,started_at__gte=attempt.assignment.assigned_at).count()
            remaining=max(0,int(attempt.game.retries_per_player or 1)-consumed)
            return ok({'attemptId':str(attempt.id),'score':round(float(attempt.raw_score or 0),2),'scoreUnit':attempt.score_unit,'performance':round(float(attempt.performance or 0),2),'xp':xp,'attemptXp':xp,'attemptsRemaining':remaining,'finalAttempt':consumed>=int(attempt.game.retries_per_player or 1),'scoringPolicy':attempt.game.scoring_policy,'selectedPerformance':round(float(attempt.performance or 0),2),'message':f'{xp} XP awarded.' if xp else 'No XP awarded.','alreadyCompleted':True})
        return ok({'detail':'This attempt is no longer available.'},409)
    now=timezone.now(); game=attempt.game
    assignment=attempt.assignment
    if not assignment.active or not game.active or not (assignment.target_profile_id==p.id or assignment.target_group_id in set(p.groups.filter(programme=game.programme_id).values_list('id',flat=True))):
        return ok({'detail':'This game assignment is no longer active for you.'},403)
    if game.end_at and game.end_at<now:
        attempt.status='rejected'; attempt.save(update_fields=['status']); return ok({'detail':'This game has ended.'},400)
    result=body.get('result') if isinstance(body.get('result'),dict) else {}
    try:
        raw_score, unit, performance=score_attempt(game.kind,attempt.challenge_data,result)
    except (TypeError,ValueError) as exc:
        return ok({'detail':str(exc)},400)
    duration=body.get('durationMs')
    try: duration_int=max(0,min(300000,int(duration))) if duration is not None else None
    except (TypeError,ValueError): duration_int=None
    # For timed games, reject impossible wall-clock claims. Typing also has a bounded duration in the engine.
    elapsed=max(0,int((now-attempt.started_at).total_seconds()*1000))
    if game.kind=='reaction':
        if elapsed < 50:return ok({'detail':'Reaction attempt was completed too quickly to be valid.'},400)
        if duration_int is not None and duration_int > elapsed + 100:return ok({'detail':'Reaction timing is inconsistent with the attempt window.'},400)
    if game.kind=='typing' and duration_int is not None and duration_int > elapsed + 5000:return ok({'detail':'Typing duration does not match the attempt window.'},400)
    if not rate_limit(f'game-submit:{p.id}',30,3600):return ok({'detail':'Too many game submissions. Please try again later.'},429)
    with transaction.atomic():
        assignment=GameAssignment.objects.select_for_update().select_related('game').get(pk=assignment.pk)
        attempt=GameAttempt.objects.select_for_update().get(pk=attempt.pk)
        if attempt.status!='started':return ok({'detail':'This attempt has already been completed.'},409)
        # Count completed rounds before committing this attempt. The assignment lock
        # prevents two concurrent submissions from both consuming the last round.
        consumed_attempts=GameAttempt.objects.filter(profile=p,game=game,assignment=assignment,started_at__gte=assignment.assigned_at).count()
        if consumed_attempts > int(game.retries_per_player or 1):
            attempt.status='rejected'
            attempt.save(update_fields=['status'])
            return ok({'detail':f'No rounds remaining. You used {consumed_attempts} of {game.retries_per_player} rounds.','attemptsUsed':consumed_attempts,'attemptsRemaining':0},400)
        attempts_remaining=max(0,int(game.retries_per_player or 1)-consumed_attempts)
        final_attempt=attempts_remaining==0
        attempt.status='completed'; attempt.raw_score=float(raw_score); attempt.score_unit=unit; attempt.performance=round(float(performance),2); attempt.xp_awarded=0; attempt.completed_at=now; attempt.client_duration_ms=duration_int
        attempt.save(update_fields=['status','raw_score','score_unit','performance','xp_awarded','completed_at','client_duration_ms'])
        final_attempt=attempts_remaining==0
        xp=game_specific_xp(game.kind,float(raw_score),game.game_config,game.score_ranges,game.xp_reward)
        selected_performance=float(performance)
        selected_attempt=attempt
        selected_attempt.xp_awarded=xp
        selected_attempt.save(update_fields=['xp_awarded'])
        if xp>0: award_xp(target=p,actor=request.user,amount=xp,source='benchmark-game',reason=f'Game: {game.title}',notify=False)
        AuditLog.objects.create(actor=request.user,action='benchmark_game_completed',target=str(p.id),detail={'attemptId':str(attempt.id),'gameId':game.id,'rawScore':float(raw_score),'unit':unit,'performance':round(float(performance),2),'xp':xp,'finalAttempt':final_attempt,'scoringPolicy':game.scoring_policy,'selectedAttemptId':str(selected_attempt.id) if final_attempt else None})
    message=(f'{xp} XP awarded.' if xp else 'No XP awarded.')
    attempt_xp=game_specific_xp(game.kind,float(raw_score),game.game_config,game.score_ranges,game.xp_reward)
    return ok({'attemptId':str(attempt.id),'score':round(float(raw_score),2),'scoreUnit':unit,'performance':round(float(performance),2),'xp':xp,'attemptXp':attempt_xp,'attemptsRemaining':attempts_remaining,'finalAttempt':final_attempt,'scoringPolicy':game.scoring_policy,'selectedPerformance':round(selected_performance,2),'message':message},201)

@require_http_methods(["GET","POST","PATCH","DELETE"])
@auth_required
def skills(request):
    actor=profile_for(request); programme=active_programme_for(actor)
    if not programme:return ok({"detail":"No active programme"},400)
    if request.method=="GET":
        qs=Skill.objects.filter(active=True).filter(models.Q(programme=programme)|models.Q(programme__isnull=True)).order_by('id')
        if actor.role in {'worker','admin'}:
            qs=Skill.objects.filter(active=True,programme=programme).order_by('id')
        def serialize(skill, target=None):
            ps=ProfileSkill.objects.filter(profile=target,skill=skill).first() if target else None
            milestones=list(skill.milestone_records.order_by('order','id'))
            return {'id':skill.id,'name':skill.name,'description':skill.description,'activity_url':skill.activity_url,'xp_reward':skill.xp_reward,'progress':max(0,min(100,int(ps.progress))) if ps else 0,'completed':bool(ps.completed) if ps else False,'completedMilestones':(ps.completed_milestones if ps and isinstance(ps.completed_milestones,list) else []),'milestones':[{'id':m.id,'name':m.name,'progress':m.progress,'xp':m.xp,'rewardId':m.reward_id,'reward':m.reward.name if m.reward_id else ''} for m in milestones]}
        if actor.role=='youth':
            assigned_ids=set(SkillAssignment.objects.filter(active=True).filter(models.Q(target_profile=actor)|models.Q(target_group__members=actor,target_group__programme=programme)).values_list('skill_id',flat=True))
            return ok({'items':[serialize(x,actor) for x in qs if x.id in assigned_ids]})
        return ok({'items':[serialize(x) for x in qs],'youth':[{'id':p.id,'name':p.gamertag} for p in Profile.objects.filter(role='youth',programme=programme,user__is_active=True).order_by('gamertag')],'groups':[{'id':g.id,'name':g.name} for g in Group.objects.filter(programme=programme).order_by('name')]})
    if actor.role not in {'worker','admin'}: return ok({'detail':'Forbidden'},403)
    body=parse_json(request) or {}; sid=body.get('id')
    if request.method=='DELETE':
        try: skill=Skill.objects.get(id=int(sid),programme=programme,active=True)
        except (TypeError,ValueError,Skill.DoesNotExist): return ok({'detail':'Skill not found'},404)
        skill.active=False; skill.save(update_fields=['active']); SkillAssignment.objects.filter(skill=skill,active=True).update(active=False)
        AuditLog.objects.create(actor=request.user,action='skill_deleted',target=str(skill.id),detail={}); return ok({'ok':True})
    try: skill=Skill.objects.get(id=int(sid),programme=programme) if sid is not None else None
    except (TypeError,ValueError,Skill.DoesNotExist): return ok({'detail':'Skill not found'},404)
    name=str(body.get('name','')).strip()[:100]; description=str(body.get('description','')).strip()[:240]
    activity_url=str(body.get('activity_url','')).strip()[:500]
    if activity_url and not activity_url.startswith(('https://','http://')): return ok({'detail':'Activity URL must start with http:// or https://'},400)
    if not name:return ok({'detail':'Skill name is required'},400)
    try: xp_reward=max(0,min(5000,int(body.get('xp_reward',50))))
    except (TypeError,ValueError):return ok({'detail':'Invalid XP reward'},400)
    raw=body.get('milestones',[])
    if not isinstance(raw,list):return ok({'detail':'Milestones must be a list'},400)
    clean=[]; seen_progress=set(); last=-1
    for item in raw:
        if not isinstance(item,dict):return ok({'detail':'Each milestone must be an object'},400)
        mname=str(item.get('name','')).strip()[:100]
        try: progress=int(item.get('progress',item.get('percent',0))); mxp=int(item.get('xp',0))
        except (TypeError,ValueError):return ok({'detail':'Invalid milestone values'},400)
        if not mname or progress<1 or progress>100 or progress<=last or progress in seen_progress or mxp<0 or mxp>5000:return ok({'detail':'Milestones must have unique ascending progress values from 1 to 100 and XP from 0 to 5000'},400)
        reward_id=item.get('rewardId'); reward=None
        if reward_id not in (None,''):
            try: reward=Reward.objects.get(id=int(reward_id),programme=programme,active=True)
            except (TypeError,ValueError,Reward.DoesNotExist): return ok({'detail':'Milestone reward not found'},400)
        clean.append({'name':mname,'progress':progress,'xp':mxp,'reward':reward}); seen_progress.add(progress); last=progress
    if skill is None: skill=Skill.objects.create(programme=programme,name=name,description=description,xp_reward=xp_reward,active=True,activity_url=activity_url)
    else: skill.name=name; skill.description=description; skill.activity_url=activity_url; skill.xp_reward=xp_reward; skill.active=True; skill.save(update_fields=['name','description','activity_url','xp_reward','active'])
    skill.milestone_records.all().delete()
    for i,m in enumerate(clean): SkillMilestone.objects.create(skill=skill,name=m['name'],progress=m['progress'],xp=m['xp'],reward=m['reward'],order=i)
    AuditLog.objects.create(actor=request.user,action='skill_configured',target=str(skill.id),detail={'name':skill.name,'milestones':len(clean)})
    return ok({'skill':{'id':skill.id,'name':skill.name,'description':skill.description,'activity_url':skill.activity_url,'xp_reward':skill.xp_reward,'milestones':[{'id':m.id,'name':m.name,'progress':m.progress,'xp':m.xp,'rewardId':m.reward_id,'reward':m.reward.name if m.reward_id else ''} for m in skill.milestone_records.all()]}},201 if sid is None else 200)

@require_http_methods(["POST","DELETE"])
@auth_required
def skill_assign(request):
    actor=require_role(request,['worker','admin'])
    if not actor:return ok({'detail':'Forbidden'},403)
    programme=active_programme_for(actor); body=parse_json(request) or {}
    if request.method=='DELETE':
        try: assignment=SkillAssignment.objects.get(id=int(body.get('id')),skill__programme=programme)
        except (TypeError,ValueError,SkillAssignment.DoesNotExist):return ok({'detail':'Skill assignment not found'},404)
        assignment.active=False; assignment.save(update_fields=['active']); return ok({'ok':True})
    try: skill=Skill.objects.get(id=int(body.get('skillId')),programme=programme,active=True)
    except (TypeError,ValueError,Skill.DoesNotExist):return ok({'detail':'Skill not found'},404)
    profile_id=body.get('profileId'); group_id=body.get('groupId')
    if bool(profile_id)==bool(group_id):return ok({'detail':'Choose exactly one young person or group'},400)
    if profile_id:
        try: target=Profile.objects.get(id=int(profile_id),role='youth',programme=programme,user__is_active=True)
        except (TypeError,ValueError,Profile.DoesNotExist):return ok({'detail':'Young person not found'},404)
        a,_=SkillAssignment.objects.update_or_create(skill=skill,target_profile=target,defaults={'target_group':None,'assigned_by':request.user,'active':True})
        create_notification(profile=target,title='New skill assigned',body=f'{skill.name} has been added to your Skills.',kind='skill',url='/skills')
    else:
        try: target=Group.objects.get(id=int(group_id),programme=programme)
        except (TypeError,ValueError,Group.DoesNotExist):return ok({'detail':'Group not found'},404)
        a,_=SkillAssignment.objects.update_or_create(skill=skill,target_group=target,defaults={'target_profile':None,'assigned_by':request.user,'active':True})
        for member in target.members.filter(role='youth',programme=programme,user__is_active=True):
            ProfileSkill.objects.get_or_create(profile=member,skill=skill)
            create_notification(profile=member,title='New skill assigned',body=f'{skill.name} has been added to your Skills.',kind='skill',url='/skills')
    return ok({'ok':True,'assignmentId':a.id})

@require_http_methods(["POST"])
@auth_required
def skill_progress(request):
    actor=profile_for(request)
    if not actor or actor.role not in {'youth','worker','admin'}:return ok({'detail':'Forbidden'},403)
    body=parse_json(request) or {}
    try: skill=Skill.objects.get(id=int(body.get('skillId')),active=True)
    except (TypeError,ValueError,Skill.DoesNotExist):return ok({'detail':'Skill not found'},404)
    programme=active_programme_for(actor)
    if not programme:return ok({'detail':'No active programme'},400)
    if skill.programme_id not in (None,programme.id):return ok({'detail':'Skill is outside your programme'},403)
    if actor.role=='youth':
        target=actor
        assigned=SkillAssignment.objects.filter(skill=skill,active=True).filter(models.Q(target_profile=target)|models.Q(target_group__members=target,target_group__programme=programme)).exists()
    else:
        try: target=Profile.objects.get(id=int(body.get('profileId')),role='youth',programme=programme,user__is_active=True)
        except (TypeError,ValueError,Profile.DoesNotExist):return ok({'detail':'Young person not found'},404)
        assigned=SkillAssignment.objects.filter(skill=skill,active=True).filter(models.Q(target_profile=target)|models.Q(target_group__members=target,target_group__programme=programme)).exists()
    if not assigned:return ok({'detail':'This skill has not been assigned to this young person or their group'},403)
    try: progress=max(0,min(100,int(body.get('progress',0))))
    except (TypeError,ValueError):return ok({'detail':'Invalid progress'},400)
    ps,_=ProfileSkill.objects.get_or_create(profile=target,skill=skill)
    completed=set(int(x) for x in (ps.completed_milestones or []) if str(x).isdigit()); newly=[]
    for milestone in skill.milestone_records.order_by('order','id'):
        if progress>=milestone.progress and milestone.id not in completed: completed.add(milestone.id); newly.append(milestone)
    was_completed=bool(ps.completed)
    ps.progress=progress; ps.completed=progress>=100; ps.completed_milestones=sorted(completed); ps.save()
    if ps.completed and not was_completed:
        create_notification(profile=target,title='Skill completed!',body=f'{skill.name} is complete. Great work!',kind='achievement',url='/activity')
    awarded=[]
    for m in newly:
        if m.xp: award_xp(target=target,actor=request.user,amount=m.xp,source='skill-milestone',reason=f'Skill: {skill.name} — {m.name}')
        if m.reward_id:
            RewardAssignment.objects.update_or_create(reward=m.reward,target_profile=target,defaults={'assigned_by':request.user,'active':True})
            create_notification(profile=target,title='Milestone reward unlocked',body=f'{m.reward.name} is now available.',kind='reward',url='/rewards')
        awarded.append({'id':m.id,'name':m.name,'xp':m.xp,'rewardId':m.reward_id,'reward':m.reward.name if m.reward_id else ''})
    return ok({'progress':ps.progress,'completed':ps.completed,'completedMilestones':sorted(completed),'awarded':awarded})

@require_http_methods(["GET"])
@auth_required
def profile_avatar_image(request, profile_id):
    actor=profile_for(request); programme=active_programme_for(actor)
    try: target=Profile.objects.get(id=int(profile_id),role='youth',programme=programme,user__is_active=True)
    except (TypeError,ValueError,Profile.DoesNotExist): return ok({'detail':'Avatar not found'},404)
    if actor.role=='youth' and actor.id!=target.id:return ok({'detail':'Forbidden'},403)
    if not target.avatar_image or not target.avatar_image.storage.exists(target.avatar_image.name):return ok({'detail':'Avatar not found'},404)
    return FileResponse(target.avatar_image.open('rb'),content_type='image/jpeg' if target.avatar_image.name.lower().endswith(('.jpg','.jpeg')) else 'image/png')

@require_http_methods(["GET"])
def rewards(request):
    p = require_role(request, ['youth'])
    if not p:
        return ok({'detail': 'Forbidden'}, 403)
    programme=active_programme_for(p)
    if not programme:
        return ok({'detail':'No active programme'},400)
    now=timezone.now()
    qs=Reward.objects.filter(programme=programme,active=True).filter(models.Q(start_at__isnull=True)|models.Q(start_at__lte=now)).filter(models.Q(end_at__isnull=True)|models.Q(end_at__gte=now))
    items=[]
    for r in qs:
        awards=r.awards if isinstance(r.awards,list) else []
        available=sum(max(0,int(a.get('remaining',1 if 'remaining' not in a else 0) or 0)) for a in awards if isinstance(a,dict) and a.get('available',True) and str(a.get('name','')).strip())
        assigned=RewardAssignment.objects.filter(reward=r,active=True).filter(models.Q(target_profile=p)|models.Q(target_group__members=p)).exists()
        # Scratch cards are intentionally assignment-based: an unassigned card is not shown to players.
        if assigned and (available or int(r.fallback_xp or 0) > 0) and not ScratchClaim.objects.filter(reward=r,profile=p).exists():
            items.append({'id':r.id,'name':r.name,'description':r.description,'cost_xp':r.cost_xp,'awardCount':available,'fallbackXp':r.fallback_xp,'end_at':r.end_at})
    return ok({'items':items})

@require_http_methods(["POST"])
@auth_required
def scratch_claim(request):
    p=require_role(request,['youth'])
    if not p:return ok({'detail':'Forbidden'},403)
    body=parse_json(request) or {}
    try: rid=int(body.get('rewardId'))
    except (TypeError,ValueError): return ok({'detail':'Invalid scratch card'},400)
    now=timezone.now()
    with transaction.atomic():
        reward=(Reward.objects.select_for_update()
            .filter(pk=rid,programme=p.programme,active=True)
            .filter(models.Q(start_at__isnull=True)|models.Q(start_at__lte=now))
            .filter(models.Q(end_at__isnull=True)|models.Q(end_at__gte=now)).first())
        if not reward:return ok({'detail':'Scratch card is not active'},400)
        assigned=RewardAssignment.objects.filter(reward=reward,active=True).filter(models.Q(target_profile=p)|models.Q(target_group__members=p)).exists()
        if not assigned:return ok({'detail':'This scratch card is not assigned to you or your group'},403)
        if ScratchClaim.objects.filter(reward=reward,profile=p).exists():return ok({'detail':'You have already claimed this scratch card'},409)
        awards=reward.awards if isinstance(reward.awards,list) else []
        available=[]
        for a in awards:
            if not isinstance(a,dict) or not a.get('available',True) or not str(a.get('name','')).strip(): continue
            try: remaining=int(a.get('remaining',0) or 0)
            except (TypeError,ValueError): remaining=0
            if remaining>0: available.append(a)
        award_type='xp'
        if not available:
            amount=max(0,int(reward.fallback_xp or 0))
            if amount <= 0:return ok({'detail':'This scratch card has no awards remaining'},409)
            award_name='XP points'
        else:
            weighted=[]
            total_weight=0
            for candidate in available:
                try: weight=max(1,min(100,int(candidate.get('weightage',candidate.get('weight',1)) or 1)))
                except (TypeError,ValueError): weight=1
                try: remaining=max(1,int(candidate.get('remaining',0) or 0))
                except (TypeError,ValueError): remaining=1
                total_weight += remaining * weight
                weighted.append((candidate,total_weight))
            pick=secrets.randbelow(total_weight)+1
            award=next(candidate for candidate,cumulative in weighted if pick <= cumulative)
            award_name=str(award.get('name','Reward'))[:120]
            award_type=str(award.get('type','other')).strip().lower()
            if award_type not in {'xp','physical','voucher','other'}: award_type='other'
            try: amount=max(0,int(award.get('xp',0) or 0))
            except (TypeError,ValueError): amount=0
            award['remaining']=max(0,int(award.get('remaining',0) or 0)-1)
            reward.awards=awards; reward.save(update_fields=['awards'])
        claim=ScratchClaim.objects.create(reward=reward,profile=p,award_name=award_name,award_type=award_type,amount=amount)
        if amount:
            award_xp(target=p,actor=request.user,amount=amount,source='scratch-card',reason=f'Scratch card: {award_name}',notify=False)
        reward_title='Scratch card reward'
        reward_body=(f'{award_name} · +{amount} XP' if amount else f'{award_name} revealed')
        # If the assignment notification has not been shown yet, turn that pending
        # event into the actual revealed reward instead of creating two popups for
        # the same scratch-card journey. If it was already delivered, the claim is
        # a genuinely new event and gets its own notification.
        notification=(p.notifications.filter(
            popup_delivered_at__isnull=True, kind='reward', title='New reward available',
            body__startswith=f'{reward.name} is now available.'
        ).order_by('-created_at','-id').first())
        if notification:
            notification.title=reward_title
            notification.body=reward_body[:300]
            notification.url='/rewards'
            notification.save(update_fields=['title','body','url'])
        else:
            notification=create_notification(profile=p,title=reward_title,body=reward_body,kind='reward',url='/rewards')
        AuditLog.objects.create(actor=request.user,action='scratch_award_claimed',target=str(p.id),detail={'rewardId':reward.id,'claimId':claim.id,'award':award_name,'awardType':award_type,'amount':amount})
        if award_type != 'xp':
            RewardFulfillment.objects.create(claim=claim)
    status='pending' if award_type != 'xp' else None
    message=f'{award_name} revealed.' if award_type != 'xp' else f'{award_name} revealed and {amount} XP was added automatically.'
    return ok({'claimId':claim.id,'award':award_name,'awardType':award_type,'amount':amount,'fulfillmentStatus':status,'message':message,'notificationId':notification.id if notification else None},201)

@require_http_methods(["POST"])
@auth_required
def drawing_submit(request):
    """Score drawing strokes only. No image/file data is accepted or stored."""
    p=profile_for(request)
    if not p or p.role!="youth": return ok({"detail":"Forbidden"},403)
    body=parse_json(request) or {}
    client_request_id=str(body.get('clientRequestId','')).strip()[:64] or None
    if client_request_id:
        existing=DrawingSubmission.objects.filter(profile=p,client_request_id=client_request_id).first()
        if existing:
            return ok({'id':str(existing.id),'status':existing.status,'score':existing.score,'accuracy':int(existing.feedback.split('%',1)[0].split()[-1]) if '%' in existing.feedback else existing.score,'attemptXp':existing.score,'xp':existing.score,'awardedXp':existing.score,'selectedScore':existing.score,'attemptsRemaining':max(0,int(locked_assignment.game.retries_per_player or 1)-(locked_attempts+1)),'finalAttempt':(locked_attempts+1)>=int(locked_assignment.game.retries_per_player or 1),'scoringPolicy':existing.game.scoring_policy if existing.game_id else 'last','message':f'{existing.score} XP awarded.' if existing.score else 'Drawing recorded. No XP awarded.','alreadyCompleted':True})
    strokes=body.get("strokes")
    if not isinstance(strokes,list) or not strokes or len(strokes)>12:
        return ok({"detail":"Please draw the target shape before submitting."},400)
    points=[]
    for stroke in strokes:
        if not isinstance(stroke,list) or len(stroke)<2 or len(stroke)>1500: continue
        clean=[]
        for point in stroke:
            if not isinstance(point,(list,tuple)) or len(point)!=2: continue
            try: x=float(point[0]); y=float(point[1])
            except (TypeError,ValueError): continue
            if not (0<=x<=1000 and 0<=y<=800): continue
            clean.append((x,y))
        if len(clean)>=2: points.append(clean)
    flat=[pt for stroke in points for pt in stroke]
    if len(flat)<8 or len(flat)>6000: return ok({"detail":"The drawing is too simple or too large to score."},400)
    if body.get('preview') is True:
        if not rate_limit(f'drawing-preview:{p.id}',60,60): return ok({'detail':'Preview is updating too quickly. Please pause briefly.'},429)
    elif not rate_limit(f'drawing:{p.id}',20,3600):
        return ok({'detail':'Too many drawing submissions. Try again later.'},429)
    programme=active_programme_for(p); now=timezone.now(); game_id=body.get('gameId')
    game_filter={'game__id':game_id} if game_id else {}
    assignment=GameAssignment.objects.filter(active=True,game__programme=programme,game__kind='drawing',**game_filter).filter(models.Q(target_profile=p)|models.Q(target_group__members=p)).filter(models.Q(game__start_at__isnull=True)|models.Q(game__start_at__lte=now)).filter(models.Q(game__end_at__isnull=True)|models.Q(game__end_at__gte=now)).select_related('game').order_by('-assigned_at').first()
    if not assignment:return ok({'detail':'The selected drawing game has not been assigned to you or your group, or is outside its active time.'},403)
    attempts=DrawingSubmission.objects.filter(profile=p,game=assignment.game,created_at__gte=assignment.assigned_at).count()
    if attempts>=assignment.game.retries_per_player:return ok({'detail':f'No retries remaining. You used {attempts} of {assignment.game.retries_per_player} attempts.'},400)

    # Normalize the user's strokes into a 0..1 coordinate space while preserving shape.
    minx=min(x for x,_ in flat); maxx=max(x for x,_ in flat); miny=min(y for _,y in flat); maxy=max(y for _,y in flat)
    bw=maxx-minx; bh=maxy-miny
    if bw<30 or bh<30:return ok({'detail':'Draw a larger, clearer version of the target shape.'},400)
    norm=[((x-minx)/bw,(y-miny)/bh) for x,y in flat]
    aspect=min(bw,bh)/max(bw,bh)

    import math
    def target_points(shape,n=200):
        # Targets are expressed in the same 0..1 bounding-box space as the
        # player's drawing. The previous implementation left an 8% inset on
        # polygon targets, which systematically penalised otherwise accurate
        # triangle/rectangle/polygon drawings.
        if shape=='circle':
            return [(0.5+0.48*math.cos(2*math.pi*i/n),0.5+0.48*math.sin(2*math.pi*i/n)) for i in range(n)]
        if shape=='rectangle':
            corners=[(0.03,0.03),(0.97,0.03),(0.97,0.97),(0.03,0.97)]
        else:
            sides={'triangle':3,'pentagon':5,'hexagon':6}.get(shape,4)
            r=0.48
            corners=[(0.5+r*math.cos(-math.pi/2+i*2*math.pi/sides),0.5+r*math.sin(-math.pi/2+i*2*math.pi/sides)) for i in range(sides)]
        out=[]; per_edge=max(2,n//len(corners))
        for i in range(len(corners)):
            a=corners[i]; b=corners[(i+1)%len(corners)]
            for j in range(per_edge):
                t=j/per_edge; out.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))
        return out
    target=target_points(assignment.game.shape)
    # Compare geometry without requiring the player's trace to land on a pixel-perfect
    # template. Drawing is intentionally forgiving: a recognisable hand-drawn shape
    # should earn useful XP rather than fail because of small stylus/mouse variation.
    def nearest_score(src,dst,tolerance=0.24):
        total=0.0
        for x,y in src:
            d=min(math.hypot(x-u,y-v) for u,v in dst)
            total += max(0.0,1.0-d/tolerance)
        return total/max(1,len(src))
    closed=math.hypot(norm[0][0]-norm[-1][0],norm[0][1]-norm[-1][1])
    closure=max(0.0,1.0-closed/0.45)
    if assignment.game.shape=='circle':
        # Circle scoring is based primarily on radial consistency around the drawn
        # centre. This makes a nearly circular hand-drawn loop reliably land above
        # the useful-score threshold while still penalising obvious ovals/open arcs.
        cx=sum(x for x,_ in norm)/len(norm); cy=sum(y for _,y in norm)/len(norm)
        radii=[math.hypot(x-cx,y-cy) for x,y in norm]
        mean_r=sum(radii)/len(radii) if radii else 0.0
        variance=(sum((r-mean_r)**2 for r in radii)/len(radii)) if radii else 1.0
        radial_cv=(math.sqrt(variance)/mean_r) if mean_r else 1.0
        radial_score=max(0.0,min(1.0,1.0-radial_cv/0.45))
        angles=sorted((math.atan2(y-cy,x-cx)%(2*math.pi)) for x,y in norm)
        gaps=[(angles[i+1]-angles[i]) for i in range(len(angles)-1)] + ([angles[0]+2*math.pi-angles[-1]] if angles else [2*math.pi])
        coverage_score=max(0.0,min(1.0,1.0-max(gaps)/(2*math.pi)))
        geometry=radial_score*0.60+closure*0.20+coverage_score*0.20
    else:
        forward=nearest_score(norm,target); backward=nearest_score(target,norm)
        shape_score=(forward*0.58+backward*0.42)
        geometry=shape_score*0.82+closure*0.18
        # Bounding-box normalization intentionally removes hand-size differences.
        # Only a rectangle benefits from an aspect check; the other polygon targets
        # are defined by their vertices and should not be penalised for canvas scale.
        if assignment.game.shape=='rectangle':
            expected_aspect=0.88
            aspect_score=max(0.0,1.0-abs(aspect-expected_aspect)*3.0)
            geometry=geometry*0.88+aspect_score*0.12
    accuracy=round(max(0,min(100,geometry*100)))
    if len(points)==1 and len(points[0])<25: accuracy=min(accuracy,35)
    amount=0
    for r in sorted((assignment.game.score_ranges if isinstance(assignment.game.score_ranges,list) else []),key=lambda x:int(x.get('min',0)),reverse=True):
        try:
            if int(r.get('min',0))<=accuracy<=int(r.get('max',100)): amount=max(0,int(r.get('xp',0))); break
        except (TypeError,ValueError,AttributeError): pass
    if body.get('preview') is True:
        return ok({'preview':True,'accuracy':accuracy,'xp':amount,'message':f'Estimated match: {accuracy}%'})
    # Store only bounded drawing coordinates; never an image, data URL, filename or path.
    safe_strokes=[[[round(x,2),round(y,2)] for x,y in stroke] for stroke in points]
    selected_score=amount
    awarded=amount
    with transaction.atomic():
        locked_assignment=GameAssignment.objects.select_for_update().select_related('game').get(pk=assignment.pk)
        locked_attempts=DrawingSubmission.objects.filter(profile=p,game=locked_assignment.game,created_at__gte=locked_assignment.assigned_at).count()
        if locked_attempts >= int(locked_assignment.game.retries_per_player or 1):
            return ok({'detail':f'No retries remaining. You used {locked_attempts} of {locked_assignment.game.retries_per_player} attempts.','attemptsUsed':locked_attempts,'attemptsRemaining':0},400)
        submission=DrawingSubmission.objects.create(profile=p,game=locked_assignment.game,client_request_id=client_request_id,title=f"{locked_assignment.game.shape.title()} drawing",stroke_data=safe_strokes,score=amount,status='approved',feedback=f'Accuracy {accuracy}% — attempt recorded.')
        if awarded>0:
            award_xp(target=p,actor=request.user,amount=awarded,source='drawing-game',reason=f'Drawing: {locked_assignment.game.shape.title()} drawing')
        AuditLog.objects.create(actor=request.user,action='drawing_attempt_completed',target=str(p.id),detail={'submissionId':str(submission.id),'amount':amount,'accuracy':accuracy,'gameId':locked_assignment.game_id,'attemptsUsed':locked_attempts+1,'attemptsRemaining':max(0,int(locked_assignment.game.retries_per_player or 1)-(locked_attempts+1)),'finalAttempt':(locked_attempts+1)>=int(locked_assignment.game.retries_per_player or 1),'scoringPolicy':locked_assignment.game.scoring_policy,'selectedScore':selected_score,'awardedXp':awarded})
    message=f'{awarded} XP awarded.' if awarded else 'Drawing recorded. No XP awarded.'
    return ok({"id":str(submission.id),"status":submission.status,"score":amount,"accuracy":accuracy,"attemptXp":amount,"xp":awarded,"awardedXp":awarded,"selectedScore":selected_score,"attemptsUsed":locked_attempts+1,"attemptsRemaining":max(0,int(locked_assignment.game.retries_per_player or 1)-(locked_attempts+1)),"finalAttempt":(locked_attempts+1)>=int(locked_assignment.game.retries_per_player or 1),"scoringPolicy":locked_assignment.game.scoring_policy,"message":message},201)

@require_http_methods(["GET"])
@auth_required
def drawing_list(request):
    p=profile_for(request); programme=active_programme_for(p); items=DrawingSubmission.objects.filter(profile=p,game__programme=programme).order_by('-created_at')[:20]
    return ok({'items':list(items.values('id','title','score','status','feedback','created_at','game_id'))})

@require_http_methods(['POST'])
def profile_avatar(request):
    p=profile_for(request)
    if not p:return ok({'detail':'Authentication required'},401)
    body=parse_json(request) or {}; avatar=str(body.get('avatar','orbit'))[:40]
    if avatar not in {'alex','ben','charlie','daniel','ethan','finley','george','henry','jack','logan','ava','bella','chloe','daisy','ella','freya','grace','holly','isabella','sophie','orbit','comet','rocket','star','moon','wave'}:return ok({'detail':'Avatar not available'},400)
    p.avatar=avatar
    if p.avatar_image: p.avatar_image.delete(save=False)
    p.save(update_fields=['avatar','avatar_image'])
    return ok({'ok':True,'avatar':p.avatar,'avatarImageUrl':None,'milestoneTier':milestone_tier(p),'milestoneColor':milestone_color(p)})

