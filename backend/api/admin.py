from .common import *
from django.db import IntegrityError, DatabaseError
from django.utils.dateparse import parse_datetime

@require_http_methods(["GET", "POST", "PATCH"])
def admin_instances(request):
    actor = require_role(request, ["admin"])
    if not actor:
        return ok({"detail": "Forbidden"}, 403)
    if request.method == "GET":
        memberships = Programme.objects.all().order_by('name', 'id')
        current_id = actor.programme_id
        return ok({"items": [
            {"id": p.id, "name": p.name, "location": p.location, "active": p.active,
             "status": p.status, "publicEnabled": p.public_enabled, "current": p.id == current_id}
            for p in memberships
        ], "currentId": current_id})

    body = parse_json(request) or {}
    action = str(body.get("action", "create")).strip().lower()
    if action == "switch":
        try:
            programme = Programme.objects.get(pk=int(body.get("programmeId")), active=True)
        except (TypeError, ValueError, Programme.DoesNotExist):
            return ok({"detail": "Programme not found"}, 404)
        if not user_can_access_programme(request.user, programme):
            # Admins manage programme instances globally; establish an explicit
            # membership when switching so subsequent programme-scoped queries
            # remain authorised without weakening youth-worker isolation.
            ProgrammeMembership.objects.get_or_create(user=request.user, programme=programme)
        actor.programme = programme
        actor.save(update_fields=["programme"])
        try:
            AuditLog.objects.create(actor=request.user, programme=programme, action="programme_switched", target=str(programme.id), detail={"name": programme.name})
        except DatabaseError:
            pass
        return ok({"ok": True, "currentId": programme.id, "name": programme.name})

    if action == "archive":
        try:
            programme = Programme.objects.get(pk=int(body.get("programmeId")))
        except (TypeError, ValueError, Programme.DoesNotExist):
            return ok({"detail": "Programme not found"}, 404)
        if not user_can_access_programme(request.user, programme):
            return ok({"detail": "You do not have access to this programme"}, 403)
        if programme.id == actor.programme_id:
            return ok({"detail": "Switch to another programme before archiving the current one"}, 400)
        programme.active = False
        programme.status = "archived"
        programme.save(update_fields=["active", "status"])
        AuditLog.objects.create(actor=request.user, action="programme_archived", target=str(programme.id), detail={"name": programme.name})
        return ok({"ok": True})

    if action in {"hide", "unhide"}:
        try:
            programme = Programme.objects.get(pk=int(body.get("programmeId")))
        except (TypeError, ValueError, Programme.DoesNotExist):
            return ok({"detail": "Programme not found"}, 404)
        if not user_can_access_programme(request.user, programme):
            return ok({"detail": "You do not have access to this programme"}, 403)
        if not programme.active or programme.status == "archived":
            return ok({"detail": "Archived programmes cannot be published"}, 400)
        programme.public_enabled = action == "unhide"
        programme.save(update_fields=["public_enabled"])
        try:
            AuditLog.objects.create(actor=request.user, programme=programme, action="programme_hidden" if action == "hide" else "programme_unhidden", target=str(programme.id), detail={"name": programme.name, "publicEnabled": programme.public_enabled})
        except DatabaseError:
            pass
        return ok({"ok": True, "publicEnabled": programme.public_enabled})

    if action == "delete":
        try:
            programme = Programme.objects.get(pk=int(body.get("programmeId")))
        except (TypeError, ValueError, Programme.DoesNotExist):
            return ok({"detail": "Programme not found"}, 404)
        if not user_can_access_programme(request.user, programme):
            return ok({"detail": "You do not have access to this programme"}, 403)
        if programme.id == actor.programme_id:
            return ok({"detail": "Switch to another programme before deleting the current programme"}, 400)
        name = programme.name
        programme_id = programme.id
        try:
            AuditLog.objects.create(actor=request.user, programme=programme, action="programme_deleted", target=str(programme_id), detail={"name": name})
        except DatabaseError:
            pass
        programme.delete()
        return ok({"ok": True, "deletedId": programme_id})

    name = str(body.get("name", "")).strip()[:120]
    location = str(body.get("location", "")).strip()[:120]
    if len(name) < 2:
        return ok({"detail": "Programme name must be at least 2 characters"}, 400)
    if not location:
        return ok({"detail": "Location is required"}, 400)
    if Programme.objects.filter(name__iexact=name, active=True).exists():
        return ok({"detail": "An active programme with this name already exists"}, 409)
    clone_id = body.get("cloneFromId")
    source = None
    if clone_id not in (None, "", 0):
        try:
            source = Programme.objects.filter(pk=int(clone_id)).first()
        except (TypeError, ValueError):
            source = None
        if not source or not source.active or not user_can_access_programme(request.user, source):
            return ok({"detail": "Source programme not found or not accessible"}, 404)
    with transaction.atomic():
        if source:
            programme = Programme.objects.create(
                name=name, location=location, theme=source.theme, target_xp=source.target_xp,
                active=True, status="active", public_enabled=False,
                starts=source.starts, ends=source.ends,
                theme_config=json.loads(json.dumps(source.theme_config or {})),
                milestones=json.loads(json.dumps(source.milestones or [])),
                max_worker_points=source.max_worker_points, attendance_points=source.attendance_points,
                streak_rules=json.loads(json.dumps(source.streak_rules or [])),
                login_reward_config=json.loads(json.dumps(source.login_reward_config or {})),
                group_scoring_config=json.loads(json.dumps(source.group_scoring_config or {})),
                attendance_config=json.loads(json.dumps(source.attendance_config or {'default_days':[0,1,2,3,4,5,6]})),
                attendance_attention_days=source.attendance_attention_days,
                points_attention_days=source.points_attention_days,
                attention_grace_days=source.attention_grace_days,
                notification_retention_days=source.notification_retention_days,
                public_config=json.loads(json.dumps(source.public_config or {})),
            )
            reward_map = {}
            for reward in Reward.objects.filter(programme=source):
                cloned = Reward.objects.create(
                    programme=programme, name=reward.name, description=reward.description, cost_xp=reward.cost_xp,
                    start_at=reward.start_at, end_at=reward.end_at, active=reward.active,
                    awards=json.loads(json.dumps(reward.awards or [])),
                )
                reward_map[reward.id] = cloned
            for skill in Skill.objects.filter(programme=source).prefetch_related('milestone_records'):
                cloned_skill = Skill.objects.create(
                    programme=programme, name=skill.name, description=skill.description,
                    xp_reward=skill.xp_reward, active=skill.active,
                )
                for milestone in skill.milestone_records.all():
                    SkillMilestone.objects.create(
                        skill=cloned_skill, name=milestone.name, progress=milestone.progress, xp=milestone.xp,
                        reward=reward_map.get(milestone.reward_id), order=milestone.order,
                    )
            for game in Challenge.objects.filter(programme=source):
                Challenge.objects.create(
                    programme=programme, kind=game.kind, title=game.title, description=game.description,
                    xp_reward=game.xp_reward, start_at=None, end_at=None, due_at=None, active=game.active,
                    shape=game.shape, score_ranges=json.loads(json.dumps(game.score_ranges or [])),
                    retries_per_player=game.retries_per_player,
                )
        else:
            programme = Programme.objects.create(name=name, location=location, active=True, status="active", public_enabled=False)
        ProgrammeMembership.objects.get_or_create(user=request.user, programme=programme)
    try:
        AuditLog.objects.create(actor=request.user, programme=programme, action="programme_created", target=str(programme.id), detail={"name": programme.name, "clonedFrom": source.id if source else None})
    except DatabaseError:
        # The programme is already committed; never turn a successful create into a 500
        # because an audit record cannot be written. Security-sensitive mutations remain
        # scoped by the programme membership created above.
        pass
    return ok({"id": programme.id, "name": programme.name, "location": programme.location, "publicEnabled": programme.public_enabled}, 201)

@require_http_methods(["GET"])
def admin_users(request):
    if not require_role(request,["admin"]): return ok({"detail":"Forbidden"},403)
    programme=active_programme_for(profile_for(request))
    users=User.objects.filter(is_active=True,profile__isnull=False).select_related("profile","profile__programme").order_by("profile__programme__name","profile__role","profile__gamertag")
    return ok({"items":[{"userId":u.id,"gamertag":u.profile.gamertag,"role":u.profile.role,"programmeId":u.profile.programme_id,"programmeName":u.profile.programme.name if u.profile.programme_id else None} for u in users]})

@require_http_methods(["GET","POST"])
def admin_account_deletions(request):
    if not require_role(request,['admin']): return ok({'detail':'Forbidden'},403)
    if request.method=='GET':
        items=list(Profile.objects.filter(deletion_requested=True,user__is_active=True).select_related('user').order_by('id').values('id','gamertag','role','user__username','user_id'))
        return ok({'items':items})
    body=parse_json(request) or {}
    try: p=Profile.objects.select_related('user').get(id=int(body.get('profileId')),deletion_requested=True)
    except (ValueError,TypeError,Profile.DoesNotExist): return ok({'detail':'Deletion request not found'},404)
    action=str(body.get('action','')).lower()
    if action=='reject':
        reason=str(body.get('reason','')).strip()[:500]
        if not reason:
            return ok({'detail':'A reason is required when rejecting an account removal request.'},400)
        p.deletion_requested=False; p.save(update_fields=['deletion_requested'])
        create_notification(profile=p,title='Account removal request declined',body=reason,kind='approval',url='/')
        AuditLog.objects.create(actor=request.user,action='account_deletion_rejected',target=str(p.id),detail={'reason':reason})
        return ok({'status':'rejected','reason':reason})
    if action=='approve':
        u=p.user
        # Preserve audit/history while disabling access and anonymising the display identity.
        old=u.username; u.username=f'deleted_{u.id}'; u.is_active=False; u.save(update_fields=['username','is_active'])
        p.gamertag='Deleted Player'; p.deletion_requested=False; p.save(update_fields=['gamertag','deletion_requested'])
        RefreshToken.objects.filter(user=u,revoked_at__isnull=True).update(revoked_at=timezone.now())
        AuditLog.objects.create(actor=request.user,action='account_deletion_approved',target=str(p.id),detail={'previousUsername':old})
        return ok({'status':'approved'})
    return ok({'detail':'Action must be approve or reject'},400)

@require_http_methods(["POST"])
def admin_password_reset_qr(request):
    admin_p=require_role(request,["admin"])
    if not admin_p: return ok({"detail":"Forbidden"},403)
    body=parse_json(request) or {}
    try: target=User.objects.select_related("profile").get(id=int(body.get("userId")),is_active=True,profile__isnull=False)
    except (ValueError,TypeError,User.DoesNotExist): return ok({"detail":"User not found"},404)
    if not hasattr(target,"profile"): return ok({"detail":"User has no profile"},400)
    raw=secrets.token_urlsafe(32)
    PasswordResetQr.objects.filter(target=target,used_at__isnull=True).update(used_at=timezone.now())
    PasswordResetQr.objects.create(token_hash=token_hash(raw),target=target,created_by=request.user,expires_at=timezone.now()+timedelta(minutes=10))
    AuditLog.objects.create(actor=request.user,action="password_reset_qr_generated",target=str(target.id),detail={"expires_minutes":10})
    return ok({"token":raw,"expiresAt":timezone.now()+timedelta(minutes=10),"gamertag":target.profile.gamertag})

@require_http_methods(["GET"])
def admin_audit_logs(request):
    actor = require_role(request, ["admin"])
    if not actor:
        return ok({"detail": "Forbidden"}, 403)
    programme=active_programme_for(actor)
    qs = AuditLog.objects.select_related("actor","actor__profile").filter(programme=programme)
    q = str(request.GET.get("q", "")).strip()
    action = str(request.GET.get("action", "")).strip()
    username = str(request.GET.get("actor", "")).strip()
    target = str(request.GET.get("target", "")).strip()
    since = str(request.GET.get("since", "")).strip()
    until = str(request.GET.get("until", "")).strip()
    if q:
        qs = qs.filter(models.Q(action__icontains=q) | models.Q(target__icontains=q) | models.Q(actor__username__icontains=q))
    if action:
        qs = qs.filter(action=action)
    if username:
        qs = qs.filter(actor__username__icontains=username)
    if target:
        qs = qs.filter(target__icontains=target)
    if since:
        try:
            qs = qs.filter(created_at__gte=timezone.make_aware(timezone.datetime.fromisoformat(since)))
        except Exception:
            pass
    if until:
        try:
            end = timezone.make_aware(timezone.datetime.fromisoformat(until)) + timedelta(days=1)
            qs = qs.filter(created_at__lt=end)
        except Exception:
            pass
    all_actions = list(AuditLog.objects.filter(programme=programme).order_by().values_list("action", flat=True).distinct())
    actions = sorted(all_actions)
    try:
        page = max(1, int(request.GET.get("page", "1")))
    except ValueError:
        page = 1
    try:
        limit = min(100, max(1, int(request.GET.get("limit", "5"))))
    except ValueError:
        limit = 5
    total = qs.count()
    raw = list(qs.order_by("-created_at", "-id")[(page-1)*limit:page*limit].values("id", "action", "target", "detail", "created_at", "actor__username"))
    rows=[]
    for x in raw:
        d=x.get('detail') or {}; summary={}
        for k in ('amount','reason','role','kind','startAt','endAt','memberCount','name','status'):
            if k in d: summary[k]=d[k]
        rows.append({'id':x['id'],'action':x['action'],'target':x['target'],'summary':summary,'created_at':x['created_at'],'actor__username':x['actor__username']})
    return ok({"items": rows, "total": total, "page": page, "limit": limit, "hasMore": page * limit < total, "actions": actions})

@require_http_methods(["GET"])
def admin_overview(request):
    p = require_role(request, ["worker", "admin"])
    if not p:
        return ok({"detail": "Forbidden"}, 403)
    programme=active_programme_for(p)
    if not programme:
        return ok({"detail":"No active programme"},400)
    now=timezone.now()
    upcoming=Challenge.objects.filter(programme=programme,active=True,start_at__gt=now).count()
    ending_soon=Challenge.objects.filter(programme=programme,active=True,end_at__gte=now,end_at__lte=now+timedelta(days=1)).count()
    youth=Profile.objects.filter(role='youth',programme=programme,user__is_active=True).select_related('user')
    attention=[]
    for player in youth:
        reasons=needs_attention_for(player,programme)
        if reasons:
            if p.role == 'worker':
                reason_text=' and '.join('attendance' if r=='attendance' else 'recent points' for r in reasons)
                title=f'{player.gamertag} may need a check-in'
                exists=Notification.objects.filter(profile=p,kind='help',title=title,created_at__gte=now-timedelta(days=1)).exists()
                if not exists:
                    create_notification(profile=p,title=title,body=f'Please check in on this young person: {reason_text}.',kind='help',url='/worker')
            last_att=player.attendances.order_by('-attended_at').values_list('attended_at',flat=True).first()
            last_points=player.xp_transactions.filter(amount__gt=0).exclude(source='attendance').order_by('-created_at').values_list('created_at',flat=True).first()
            attention.append({'id':player.id,'gamertag':player.gamertag,'avatar':player.avatar,'streak':current_attendance_streak(player),'reasons':reasons,'lastAttendance':last_att,'lastPoints':last_points})
    attention_total=len(attention)
    attendance_flags=sum('attendance' in x['reasons'] for x in attention)
    points_flags=sum('points' in x['reasons'] for x in attention)
    attention=attention[:25]
    analytics=[]
    for player in youth[:50]:
        completed=GameAttempt.objects.filter(profile=player,game__programme=programme,status='completed').count()
        xp=XPTransaction.objects.filter(target=player,programme=programme).aggregate(total=models.Sum('amount')).get('total') or 0
        analytics.append({'id':player.id,'gamertag':player.gamertag,'xp':xp,'gamesCompleted':completed,'streak':current_attendance_streak(player),'needsHelp':any(x['id']==player.id for x in attention)})
    analytics.sort(key=lambda x:(x['xp'],x['gamesCompleted']),reverse=True)
    registered_players=youth.count()
    attendance_today=Attendance.objects.filter(session__programme=programme,attended_at__date=timezone.localdate()).count()
    challenge_qs=Challenge.objects.filter(programme=programme)
    total_challenges_so_far=challenge_qs.filter(models.Q(start_at__isnull=True)|models.Q(start_at__lte=now)).count()
    active_challenges=challenge_qs.filter(active=True).filter(models.Q(start_at__isnull=True)|models.Q(start_at__lte=now)).filter(models.Q(end_at__isnull=True)|models.Q(end_at__gte=now)).count()
    completed_challenges=GameAttempt.objects.filter(game__programme=programme,status='completed',profile__role='youth',profile__programme=programme).values('game_id').distinct().count()
    challenge_status={'total':total_challenges_so_far,'active':active_challenges,'completed':completed_challenges}
    data={"programme":{"id":programme.id,"name":programme.name,"location":programme.location},"participants":registered_players,"collectiveXp":sum(g.xp for g in Group.objects.filter(programme=programme)),"groups":Group.objects.filter(programme=programme).count(),"activeChallenges":active_challenges,"attendanceToday":attendance_today,"attendanceRate":round((attendance_today/max(1,registered_players))*100,1),"attendanceRegistered":registered_players,"challengeStatus":challenge_status,"recentXp":list(XPTransaction.objects.filter(programme=programme, target__programme=programme).select_related("target").order_by("-created_at")[:8].values("amount","source","reason","created_at","target__gamertag")),"playerAnalytics":analytics,**event_summary(programme),"needsAttention":{"pendingAwards":PointAwardRequest.objects.filter(status='pending',target__programme=programme).count(),"upcomingGames":upcoming,"gamesEndingSoon":ending_soon,"players":[*attention],"total":attention_total,"attendanceFlags":attendance_flags,"pointsFlags":points_flags}}
    if p.role=="admin":
        data["needsAttention"]["deletionRequests"]=Profile.objects.filter(deletion_requested=True,programme=programme,user__is_active=True).count()
        data.update({"audit":list(AuditLog.objects.select_related("actor").filter(programme=programme).order_by("-created_at")[:25].values("action","target","detail","created_at","actor__username")),"pendingAwards":PointAwardRequest.objects.filter(status="pending",target__programme=programme).count(),"publicPointRequests":PublicPointRequest.objects.filter(status="pending",target__programme=programme).count()})
    return ok(data)

@require_http_methods(["GET","POST","DELETE"])
def admin_theme_presets(request):
    actor=require_role(request,["admin"])
    if not actor: return ok({"detail":"Forbidden"},403)
    presets=actor.theme_presets if isinstance(actor.theme_presets,list) else []
    if request.method=="GET": return ok({"presets":presets[:30]})
    body=parse_json(request) or {}
    if request.method=="DELETE":
        preset_id=str(body.get("id","")).strip()
        next_presets=[p for p in presets if isinstance(p,dict) and str(p.get("id",""))!=preset_id]
        actor.theme_presets=next_presets[:30]; actor.save(update_fields=["theme_presets","updated_at"])
        return ok({"presets":actor.theme_presets})
    name=str(body.get("name","")).strip()[:60]
    theme=str(body.get("theme","meadow")).strip()[:40]
    config=body.get("config")
    if not name: return ok({"detail":"Preset name is required"},400)
    if not isinstance(config,dict): return ok({"detail":"Preset colours must be an object"},400)
    import re, uuid
    allowed={'card','accent','accent2','background','surface','surface2','text','muted','border','warm','danger','success','warning','focus','button','buttonText','header','nav','donutXp','donutMilestone','donutAchievement','donutTrack','tile1','tile2','tile3','tile4','tile5','tile6'}
    cleaned={k:str(v) for k,v in config.items() if k in allowed}
    if any(not re.fullmatch(r'#[0-9a-fA-F]{6}',v) for v in cleaned.values()): return ok({"detail":"Preset colours must be six-digit hex values"},400)
    item={"id":str(uuid.uuid4()),"name":name,"theme":theme,"config":cleaned}
    next_presets=[p for p in presets if isinstance(p,dict) and str(p.get("name",""))!=name]
    next_presets.insert(0,item)
    actor.theme_presets=next_presets[:30]; actor.save(update_fields=["theme_presets","updated_at"])
    return ok({"presets":actor.theme_presets})

def admin_config(request):
    actor = require_role(request, ["admin"])
    if not actor:
        return ok({"detail": "Forbidden"}, 403)
    programme = active_programme_for(actor)
    if not programme:
        return ok({"detail": "No active programme"}, 400)
    if request.method == "POST":
        body = parse_json(request) or {}
        requested_id = body.get("programmeId")
        if requested_id is not None and str(requested_id) != str(programme.id):
            try:
                requested = Programme.objects.get(pk=int(requested_id), active=True)
            except (TypeError, ValueError, Programme.DoesNotExist):
                return ok({"detail": "Programme not found"}, 404)
            if not user_can_access_programme(request.user, requested):
                return ok({"detail": "Programme access denied"}, 403)
            programme = requested

        updates = {}
        for field in ['name','location','theme','target_xp','starts','ends','theme_config','milestones','max_worker_points','attendance_points','streak_rules','login_reward_config','group_scoring_config','attendance_config','attendance_attention_days','points_attention_days','attention_grace_days','notification_retention_days','public_config','public_enabled','status','active']:
            if field in body:
                updates[field] = body[field]
        if 'status' in updates:
            status = str(updates['status']).lower()
            if status not in {'active','inactive','archived'}:
                return ok({'detail':'Invalid programme status'},400)
            if status != 'active' and programme.id == actor.programme_id:
                return ok({'detail':'Switch to another programme before deactivating the current programme'},400)
            updates['status'] = status
            updates['active'] = status == 'active'
        if 'active' in updates and 'status' not in body:
            if not bool(updates['active']) and programme.id == actor.programme_id:
                return ok({'detail':'Switch to another programme before deactivating the current programme'},400)
            updates['status'] = 'active' if bool(updates['active']) else 'inactive'
        if 'public_enabled' in updates and not isinstance(updates['public_enabled'], bool):
            return ok({'detail':'Public dashboard setting must be true or false'},400)

        attendance_config = updates.get('attendance_config', programme.attendance_config or {})
        if not isinstance(attendance_config, dict):
            return ok({'detail':'Attendance configuration must be an object'},400)
        raw_days = attendance_config.get('default_days', [])
        if not isinstance(raw_days, list) or any(not str(x).isdigit() or not 0 <= int(x) <= 6 for x in raw_days):
            return ok({'detail':'Attendance days must be a list of weekday numbers from 0 (Monday) to 6 (Sunday)'},400)
        attendance_config = {**attendance_config, 'default_days': sorted(set(int(x) for x in raw_days))}
        previous_attendance_days = (programme.attendance_config or {}).get('default_days', [0, 1, 2, 3, 4, 5, 6])
        if 'attendance_config' in updates and previous_attendance_days != attendance_config['default_days']:
            record_attendance_schedule_change(
                programme, 'programme', attendance_config['default_days'], actor=request.user,
                previous_days=previous_attendance_days,
            )
        target_xp = int(updates.get('target_xp', programme.target_xp) or 0)
        max_worker_points = int(updates.get('max_worker_points', programme.max_worker_points) or 0)
        attendance_points = int(updates.get('attendance_points', programme.attendance_points) or 0)
        if target_xp < 1 or max_worker_points < 1 or not 0 <= attendance_points <= 5000:
            return ok({'detail':'XP targets and worker point limit must be positive'},400)

        milestones = updates.get('milestones', programme.milestones)
        try:
            valid_milestones = isinstance(milestones, list) and all(
                isinstance(x, dict) and str(x.get('tier','')).strip() and
                0 <= int(x.get('xp',0) or 0) and
                __import__('re').fullmatch(r'#[0-9a-fA-F]{6}', str(x.get('color','#6f778d')))
                for x in milestones
            )
        except (TypeError, ValueError):
            valid_milestones = False
        if not valid_milestones:
            return ok({'detail':'Milestones must be named objects with non-negative XP thresholds and valid colours'},400)
        for milestone in milestones:
            reward_id = milestone.get('rewardId')
            if reward_id not in (None, ''):
                try: reward_id = int(reward_id)
                except (TypeError, ValueError): return ok({'detail':'Milestone reward must be a valid scratch card'},400)
                if not Reward.objects.filter(pk=reward_id, programme=programme, active=True).exists():
                    return ok({'detail':'Milestone reward must belong to the active programme'},400)
                milestone['rewardId'] = reward_id
        thresholds = [int(x.get('xp',0) or 0) for x in milestones]
        if thresholds != sorted(thresholds) or len(set(thresholds)) != len(thresholds):
            return ok({'detail':'Milestone XP thresholds must be strictly ascending with no duplicates'},400)
        if len({str(x.get('tier')).strip().lower() for x in milestones}) != len(milestones):
            return ok({'detail':'Milestone names must be unique'},400)

        map_token = str(updates.get('public_map_token', programme.public_map_token or '')).strip()
        if len(map_token) > 160:
            return ok({'detail':'Map access code must be 160 characters or fewer'},400)
        map_expiry = updates.get('public_map_token_expires_at', programme.public_map_token_expires_at)
        if isinstance(map_expiry,str):
            try:
                map_expiry=parse_datetime(map_expiry)
                if map_expiry is None: raise ValueError
            except (ValueError,TypeError): return ok({'detail':'Invalid map access expiry date/time'},400)
        if map_expiry and timezone.is_naive(map_expiry): map_expiry=timezone.make_aware(map_expiry)
        if map_token and map_expiry and map_expiry <= timezone.now():
            return ok({'detail':'Map access expiry must be in the future'},400)
        if not map_token: map_expiry=None

        theme_config = updates.get('theme_config', programme.theme_config)
        if not isinstance(theme_config, dict):
            return ok({'detail':'Theme configuration must be an object'},400)
        import re
        allowed = {'card','accent','accent2','background','surface','surface2','text','muted','border','warm','danger','success','warning','focus','button','buttonText','header','nav','donutXp','donutMilestone','donutAchievement','donutTrack','tile1','tile2','tile3','tile4','tile5','tile6'}
        if any(k not in allowed or not isinstance(v,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',v) for k,v in theme_config.items()):
            return ok({'detail':'Theme colours must be six-digit hex values'},400)

        streak_rules = updates.get('streak_rules', programme.streak_rules)
        try:
            if not isinstance(streak_rules, list): raise ValueError
            cleaned_rules = []
            for rule in streak_rules[:30]:
                if not isinstance(rule, dict): raise ValueError
                events = int(rule.get('events', rule.get('days', 0)) or 0)
                multiplier = float(rule.get('multiplier', 1) or 1)
                if not 1 <= events <= 365 or not 1 <= multiplier <= 10: raise ValueError
                cleaned_rules.append({'events': events, 'multiplier': multiplier})
        except (TypeError, ValueError):
            return ok({'detail':'Streak rules need positive day thresholds and multipliers between 1 and 10'},400)
        streak_events = [x['events'] for x in cleaned_rules]
        if len(set(streak_events)) != len(streak_events) or streak_events != sorted(streak_events):
            return ok({'detail':'Attendance-day thresholds must be strictly ascending and unique'},400)

        login_config = updates.get('login_reward_config', programme.login_reward_config)
        try:
            if not isinstance(login_config, dict): raise ValueError
            enabled = login_config.get('enabled', True)
            if not isinstance(enabled, bool): raise ValueError
            daily_xp = int(login_config.get('daily_xp', 10))
            if not 0 <= daily_xp <= 5000: raise ValueError
            timezone_name = str(login_config.get('timezone') or 'Europe/London')
            from zoneinfo import ZoneInfo
            ZoneInfo(timezone_name)
            raw_milestones = login_config.get('milestones', [])
            if not isinstance(raw_milestones, list) or len(raw_milestones) > 30: raise ValueError
            cleaned_milestones = []
            for rule in raw_milestones:
                if not isinstance(rule, dict): raise ValueError
                days = int(rule.get('days', 0)); bonus = int(rule.get('bonus_xp', 0))
                if not 1 <= days <= 365 or not 0 <= bonus <= 50000: raise ValueError
                cleaned_milestones.append({'days': days, 'bonus_xp': bonus})
            cleaned_milestones.sort(key=lambda x: x['days'])
            milestone_days = [x['days'] for x in cleaned_milestones]
            if len(set(milestone_days)) != len(milestone_days): raise ValueError
            login_config = {'enabled': enabled, 'daily_xp': daily_xp, 'milestones': cleaned_milestones, 'timezone': timezone_name}
        except (TypeError, ValueError, KeyError):
            return ok({'detail':'Login rewards require a valid enabled flag, daily XP (0–5000), timezone and unique ascending milestone thresholds with bonus XP (0–50000).'},400)

        group_scoring_config = updates.get('group_scoring_config', programme.group_scoring_config)
        try:
            if not isinstance(group_scoring_config, dict): raise ValueError
            minimum_group_size = int(group_scoring_config.get('minimum_group_size', 2))
            if not 1 <= minimum_group_size <= 100: raise ValueError
            periods = group_scoring_config.get('ranking_periods', ['weekly', 'monthly', 'overall'])
            if not isinstance(periods, list) or not periods or any(x not in {'weekly', 'monthly', 'overall'} for x in periods): raise ValueError
            group_scoring_config = {'minimum_group_size': minimum_group_size, 'ranking_periods': list(dict.fromkeys(periods))}
        except (TypeError, ValueError):
            return ok({'detail':'Group scoring requires a minimum group size from 1 to 100 and valid weekly, monthly or overall ranking periods.'},400)

        windows = {}
        for field in ['attendance_attention_days','points_attention_days','attention_grace_days','notification_retention_days']:
            try: value = int(updates.get(field, getattr(programme, field)) or 0)
            except (TypeError, ValueError): return ok({'detail':'Attention and notification windows must be whole numbers'},400)
            if value < 1: return ok({'detail':'Attention and notification windows must be at least 1 day'},400)
            windows[field] = value

        for field, value in updates.items():
            setattr(programme, field, value)
        programme.target_xp = target_xp
        programme.max_worker_points = max_worker_points
        programme.attendance_points = attendance_points
        programme.milestones = milestones
        programme.theme_config = theme_config
        programme.public_map_token = map_token
        programme.public_map_token_expires_at = map_expiry
        programme.streak_rules = cleaned_rules
        programme.login_reward_config = login_config
        programme.group_scoring_config = group_scoring_config
        programme.attendance_config = attendance_config
        for field, value in windows.items(): setattr(programme, field, value)
        programme.save()
        AuditLog.objects.create(actor=request.user, action='programme_update', target=str(programme.id), detail={k:v for k,v in body.items() if str(k).lower() not in {'password','token','csrf','imagedata','public_map_token'}})

    rewards = list(Reward.objects.filter(programme=programme, active=True).order_by('name').values('id','name','description'))
    row = {'id':programme.id,'name':programme.name,'location':programme.location,'theme':programme.theme,'theme_config':programme.theme_config,'target_xp':programme.target_xp,'milestones':programme.milestones,'rewards':rewards,'max_worker_points':programme.max_worker_points,'attendance_points':programme.attendance_points,'streak_rules':programme.streak_rules,'login_reward_config':programme.login_reward_config,'group_scoring_config':programme.group_scoring_config,'attendance_config':programme.attendance_config,'attendance_attention_days':programme.attendance_attention_days,'points_attention_days':programme.points_attention_days,'attention_grace_days':programme.attention_grace_days,'notification_retention_days':programme.notification_retention_days,'public_config':programme.public_config,'public_map_token':programme.public_map_token,'public_map_token_expires_at':programme.public_map_token_expires_at,'active':programme.active,'status':programme.status,'public_enabled':programme.public_enabled,'starts':programme.starts,'ends':programme.ends}
    return ok({'programmes':[row],'audit':list(AuditLog.objects.filter(programme=programme).order_by('-created_at')[:10].values('action','target','created_at'))})

