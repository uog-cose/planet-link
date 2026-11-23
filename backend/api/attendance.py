from .common import *

@require_http_methods(["POST"])
def attendance_session(request):
    p = require_role(request, ["worker", "admin"])
    if not p:
        return ok({"detail": "Forbidden"}, 403)
    now = timezone.now()
    programme = active_programme_for(p)
    if not programme:
        return ok({"detail": "No active programme"}, 400)
    AttendanceSession.objects.filter(programme=programme, active=True).update(active=False)
    AttendanceSession.objects.filter(programme=programme, expires_at__lt=now).update(active=False)
    if not programme:
        return ok({"detail": "No active programme"}, 400)
    token = secrets.token_urlsafe(24)
    session = AttendanceSession.objects.create(programme=programme, created_by=request.user, token=token, expires_at=now + timedelta(minutes=5))
    return ok({"token": token, "expiresAt": session.expires_at})

@require_http_methods(["POST"])
def attendance_scan(request):
    if not profile_for(request):return ok({"detail":"Authentication required"},401)
    p=require_role(request,["youth"])
    if not p:return ok({"detail":"Only young people can scan attendance QR codes"},403)
    body=parse_json(request) or {}; token=body.get("token")
    programme=active_programme_for(p)
    if not programme:return ok({"detail":"No active programme"},400)
    now=timezone.now(); today=timezone.localdate()
    session=AttendanceSession.objects.filter(token=token,active=True,expires_at__gte=now,programme=programme).select_related('created_by').first()
    if not session:return ok({"detail":"QR expired or invalid"},400)
    with transaction.atomic():
        # Lock the player row so two different attendance sessions scanned concurrently
        # cannot both award the once-per-day attendance reward.
        p=Profile.objects.select_for_update().get(pk=p.pk)
        if Attendance.objects.filter(session=session,participant=p).exists():
            return ok({"ok":True,"awarded":0,"streak":current_attendance_streak(p),"multiplier":1,"alreadyRewardedToday":True,"alreadyRecorded":True,"detail":"Attendance already recorded today."})
        already_today=Attendance.objects.filter(participant=p,attendance_date=today).exists()
        if already_today:
            # Daily attendance is idempotent. Do not attempt a second insert because
            # the database deliberately enforces one row per player/day. This also
            # makes a retry after a lost network response safe and user-friendly.
            streak=current_attendance_streak(p); multiplier=attendance_streak_multiplier(programme,streak); awarded=0
        else:
            Attendance.objects.create(session=session,participant=p,attendance_date=today)
            awarded,streak,multiplier=attendance_reward(p,session)
            if awarded:
                award_xp(target=p,actor=session.created_by,amount=awarded,source='attendance',reason=f'Attendance — {streak} day streak ({multiplier:g}x)',notify=False)
                AuditLog.objects.create(actor=session.created_by,action='attendance_points_awarded',target=str(p.id),detail={'amount':awarded,'streak':streak,'multiplier':multiplier,'sessionId':session.id})
    if already_today:
        return ok({"ok":True,"awarded":0,"streak":streak,"multiplier":multiplier,"alreadyRewardedToday":True,"alreadyRecorded":True,"detail":"Attendance already recorded today."})
    create_notification(profile=p,title=('Attendance marked' if awarded <= 0 else f'Attendance +{awarded} XP'),body=f'Attendance recorded · {streak} day streak ({multiplier:g}x).',kind='attendance',url='/')
    return ok({"ok":True,"awarded":awarded,"streak":streak,"multiplier":multiplier,"alreadyRewardedToday":False,"alreadyRecorded":True})

