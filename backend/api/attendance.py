from .common import *
from core.models import EventCheckIn
from core.services import event_attendance_streak, recalculate_event_attendance_streaks


@require_http_methods(["POST"])
def attendance_session(request):
    """Create a short-lived programme attendance QR; no map event is required."""
    actor = require_role(request, ["worker", "admin"])
    if not actor:
        return ok({"detail": "Forbidden"}, 403)
    programme = active_programme_for(actor)
    if not programme:
        return ok({"detail": "No active programme"}, 400)
    now = timezone.now()
    body = parse_json(request) or {}
    previous_token = str(body.get("previousToken") or "").strip()
    token = secrets.token_urlsafe(32)
    with transaction.atomic():
        if previous_token:
            AttendanceSession.objects.filter(
                programme=programme, created_by=request.user,
                token=previous_token, active=True,
            ).update(active=False)
        # Expire stale sessions independently; do not invalidate other live QRs.
        AttendanceSession.objects.filter(
            programme=programme, active=True, expires_at__lt=now,
        ).update(active=False)
        session = AttendanceSession.objects.create(
            programme=programme, event=None, created_by=request.user, token=token,
            # Allow enough time for a group to scan without racing the expiry timer.
            expires_at=now + timedelta(minutes=60),
        )
    return ok({"token": token, "expiresAt": session.expires_at})


@require_http_methods(["POST"])
def attendance_scan(request):
    if not profile_for(request):
        return ok({"detail": "Authentication required"}, 401)
    profile = require_role(request, ["youth"])
    if not profile:
        return ok({"detail": "Only young people can scan attendance QR codes"}, 403)
    body = parse_json(request) or {}
    programme = active_programme_for(profile)
    if not programme:
        return ok({"detail": "No active programme"}, 400)
    now = timezone.now()
    today = programme_local_date(programme, now)
    raw_token = str(body.get("token") or "").strip()
    if not raw_token:
        return ok({"detail": "No attendance QR token was supplied. Scan the QR again."}, 400)
    session = AttendanceSession.objects.filter(
        token=raw_token, programme=programme,
    ).select_related("created_by").first()
    if not session:
        other_programme_session = AttendanceSession.objects.filter(token=raw_token).only("programme_id").first()
        if other_programme_session:
            return ok({"detail": "This attendance QR belongs to a different programme. Ask staff to check your programme assignment."}, 403)
        return ok({"detail": "This attendance QR could not be recognised. Ask your youth worker to generate a new one."}, 400)
    if not session.active:
        return ok({"detail": "This attendance QR has been replaced or revoked. Ask your youth worker to display the latest code."}, 400)
    if session.expires_at < now:
        session.active = False
        session.save(update_fields=["active"])
        return ok({"detail": "This attendance QR has expired. Ask your youth worker to generate a new one."}, 400)

    from core.services import effective_attendance_days, scheduled_attendance_streak
    allowed_days = effective_attendance_days(profile, programme)
    if today.weekday() not in allowed_days:
        return ok({"detail": "Today is not one of your scheduled attendance days. Ask your youth worker if your schedule needs updating."}, 403)

    with transaction.atomic():
        profile = Profile.objects.select_for_update().select_related("programme", "user").get(pk=profile.pk)
        existing = Attendance.objects.filter(participant=profile, attendance_date=today).first()
        if existing:
            return ok({"ok": True, "awarded": 0, "streak": scheduled_attendance_streak(profile, programme, now), "alreadyRecorded": True, "alreadyRewardedToday": True, "detail": "Your attendance for today is already recorded."})
        Attendance.objects.create(session=session, participant=profile, attendance_date=today)
        streak = scheduled_attendance_streak(profile, programme, now)
        multiplier = attendance_streak_multiplier(programme, streak)
        base = max(0, int(programme.attendance_points or 0))
        awarded = int(round(base * multiplier)) if base else 0
        profile.streak = streak
        profile.save(update_fields=["streak"])
        if awarded:
            award_xp(target=profile, actor=session.created_by, amount=awarded, source="attendance", reason=f"Scheduled attendance — {streak} assigned attendance days ({multiplier:g}x)", notify=False)
        AuditLog.objects.create(actor=session.created_by, programme=programme, action="scheduled_qr_attendance_recorded", target=str(profile.id), detail={"attendanceDate": today.isoformat(), "days": allowed_days, "streak": streak, "multiplier": multiplier, "amount": awarded})

    create_notification(profile=profile, title=(f"Attendance +{awarded} XP" if awarded else "Attendance recorded"), body=f"Your scheduled attendance has been recorded. Current streak: {streak}.", kind="attendance", url="/")
    return ok({"ok": True, "awarded": awarded, "streak": streak, "multiplier": multiplier, "alreadyRecorded": True, "alreadyRewardedToday": False, "detail": "Attendance recorded."})


@require_http_methods(["GET", "POST"])
def attendance_schedule(request):
    """Admin-managed attendance day hierarchy and explicit overrides."""
    actor = require_role(request, ["admin"])
    if not actor:
        return ok({"detail": "Forbidden"}, 403)
    programme = active_programme_for(actor)
    if not programme:
        return ok({"detail": "No active programme"}, 400)
    if request.method == "GET":
        from core.models import Group
        groups = Group.objects.filter(programme=programme).order_by("name")
        people = Profile.objects.filter(programme=programme, role="youth", user__is_active=True).order_by("gamertag")
        return ok({
            "programme": {"defaultDays": (programme.attendance_config or {}).get("default_days", [])},
            "groups": [{"id": g.id, "name": g.name, "attendanceDays": g.attendance_days} for g in groups],
            "people": [{"id": p.id, "gamertag": p.gamertag, "attendanceDays": p.attendance_days} for p in people],
            "weekdayOptions": [{"value": i, "label": label} for i, label in enumerate(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])],
        })
    body = parse_json(request) or {}
    if body.get("action") == "restore":
        try:
            participant = Profile.objects.get(pk=int(body.get("profileId")), programme=programme, role="youth")
            restore_date = timezone.datetime.fromisoformat(str(body.get("date"))).date()
        except (TypeError, ValueError, Profile.DoesNotExist):
            return ok({"detail": "Select a valid young person and attendance date."}, 400)
        reason = str(body.get("reason", "")).strip()[:240]
        if len(reason) < 8:
            return ok({"detail": "Provide an audit reason of at least 8 characters."}, 400)
        today = programme_local_date(programme, timezone.now())
        if restore_date > today:
            return ok({"detail": "Attendance cannot be restored for a future date."}, 400)
        from core.services import effective_attendance_days, scheduled_attendance_streak
        if restore_date.weekday() not in effective_attendance_days(participant, programme, on_date=restore_date):
            return ok({"detail": "That date was not an assigned attendance day."}, 400)
        with transaction.atomic():
            if Attendance.objects.filter(participant=participant, attendance_date=restore_date).exists():
                return ok({"detail": "Attendance is already recorded for that date."}, 409)
            correction_session = AttendanceSession.objects.create(programme=programme, event=None, created_by=request.user, token=secrets.token_urlsafe(32), expires_at=timezone.now(), active=False)
            Attendance.objects.create(session=correction_session, participant=participant, attendance_date=restore_date)
            streak = scheduled_attendance_streak(participant, programme)
            participant.streak = streak
            participant.save(update_fields=["streak"])
            AuditLog.objects.create(actor=request.user, programme=programme, action="scheduled_attendance_restored", target=str(participant.id), detail={"date": restore_date.isoformat(), "reason": reason, "streak": streak, "xpAwarded": 0})
        return ok({"ok": True, "streak": streak, "xpAwarded": 0})
    raw_days = body.get("days")
    if not isinstance(raw_days, list) or len(raw_days) > 7:
        return ok({"detail": "Choose one or more valid weekdays, or an empty list to disable attendance."}, 400)
    try:
        days = sorted(set(int(day) for day in raw_days))
    except (TypeError, ValueError):
        return ok({"detail": "Attendance days must be weekday numbers from 0 to 6."}, 400)
    if any(day < 0 or day > 6 for day in days):
        return ok({"detail": "Attendance days must be weekday numbers from 0 to 6."}, 400)
    target_type = str(body.get("targetType", "programme"))
    override = body.get("override", True)
    if not isinstance(override, bool):
        return ok({"detail": "Override must be true or false."}, 400)
    if target_type == "programme":
        previous_days = (programme.attendance_config or {}).get("default_days", [0, 1, 2, 3, 4, 5, 6])
        if previous_days != days:
            record_attendance_schedule_change(programme, "programme", days, actor=request.user, previous_days=previous_days)
            programme.attendance_config = {**(programme.attendance_config or {}), "default_days": days}
            programme.save(update_fields=["attendance_config", "updated_at"])
        target_id = programme.id
    elif target_type == "group":
        from core.models import Group
        try:
            target = Group.objects.get(pk=int(body.get("targetId")), programme=programme)
        except (TypeError, ValueError, Group.DoesNotExist):
            return ok({"detail": "Group not found in this programme."}, 404)
        next_days = days if override else None
        if target.attendance_days != next_days:
            record_attendance_schedule_change(programme, "group", next_days, actor=request.user, group=target, previous_days=target.attendance_days)
            target.attendance_days = next_days
            target.save(update_fields=["attendance_days"])
        target_id = target.id
    elif target_type == "person":
        try:
            target = Profile.objects.get(pk=int(body.get("targetId")), programme=programme, role="youth")
        except (TypeError, ValueError, Profile.DoesNotExist):
            return ok({"detail": "Young person not found in this programme."}, 404)
        next_days = days if override else None
        if target.attendance_days != next_days:
            record_attendance_schedule_change(programme, "person", next_days, actor=request.user, profile=target, previous_days=target.attendance_days)
            target.attendance_days = next_days
            target.save(update_fields=["attendance_days"])
        target_id = target.id
    else:
        return ok({"detail": "Target type must be programme, group or person."}, 400)
    AuditLog.objects.create(actor=request.user, programme=programme, action="attendance_schedule_updated", target=str(target_id), detail={"targetType": target_type, "days": days, "override": override})
    return ok({"ok": True, "targetType": target_type, "targetId": target_id, "days": days})


@require_http_methods(["GET", "POST"])
def event_attendance(request):
    """Read event check-ins and allow audited administrator attendance restoration."""
    actor = require_role(request, ["worker", "admin"])
    if not actor:
        return ok({"detail": "Forbidden"}, 403)
    programme = active_programme_for(actor)
    if not programme:
        return ok({"detail": "No active programme"}, 400)

    if request.method == "GET":
        try:
            event = MapEvent.objects.get(pk=int(request.GET.get("eventId", "")), programme=programme)
        except (TypeError, ValueError, MapEvent.DoesNotExist):
            return ok({"detail": "Event not found"}, 404)
        youth = Profile.objects.filter(programme=programme, role="youth").select_related("user").order_by("gamertag")
        checkins = {row.participant_id: row for row in EventCheckIn.objects.filter(event=event, voided_at__isnull=True).select_related("verified_by", "corrected_by")}
        return ok({"eventId": event.id, "eventTitle": event.title, "eventStatus": event_payload(event, include_map=False)["status"], "canRestore": actor.role == "admin", "attendance": [{
            "profileId": person.id, "gamertag": person.gamertag,
            "attended": person.id in checkins,
            "source": checkins[person.id].source if person.id in checkins else None,
            "checkedInAt": checkins[person.id].checked_in_at if person.id in checkins else None,
            "streak": checkins[person.id].streak_count if person.id in checkins else None,
            "awardedXp": checkins[person.id].awarded_xp if person.id in checkins else 0,
            "correctionReason": checkins[person.id].correction_reason if person.id in checkins else "",
            "correctedBy": checkins[person.id].corrected_by.username if person.id in checkins and checkins[person.id].corrected_by else None,
        } for person in youth]})

    if actor.role != "admin":
        return ok({"detail": "Only administrators can restore attendance streaks."}, 403)
    body = parse_json(request) or {}
    reason = str(body.get("reason", "")).strip()[:240]
    if len(reason) < 8:
        return ok({"detail": "Enter a reason of at least 8 characters for the audit record."}, 400)
    try:
        event = MapEvent.objects.get(pk=int(body.get("eventId")), programme=programme)
        participant = Profile.objects.get(pk=int(body.get("profileId")), programme=programme, role="youth")
    except (TypeError, ValueError, MapEvent.DoesNotExist, Profile.DoesNotExist):
        return ok({"detail": "Select a valid event and young person in this programme."}, 404)
    if event.status == "cancelled":
        return ok({"detail": "Attendance cannot be restored for a cancelled event."}, 400)
    if not event.start_at or event.start_at > timezone.now():
        return ok({"detail": "Attendance can only be restored for an event that has started."}, 400)
    existing_checkin = EventCheckIn.objects.filter(event=event, participant=participant).first()
    if existing_checkin and existing_checkin.voided_at is None:
        return ok({"detail": "Attendance is already recorded for this event."}, 409)

    with transaction.atomic():
        checked_in_at = event.ended_at or event.end_at or timezone.now()
        if existing_checkin:
            checkin = existing_checkin
            checkin.source = "admin"
            checkin.verified_by = request.user
            checkin.corrected_by = request.user
            checkin.checked_in_at = checked_in_at
            checkin.correction_reason = reason
            checkin.awarded_xp = 0
            checkin.voided_at = None
            checkin.save(update_fields=["source", "verified_by", "corrected_by", "checked_in_at", "correction_reason", "awarded_xp", "voided_at"])
        else:
            checkin = EventCheckIn.objects.create(
                event=event, participant=participant, source="admin", verified_by=request.user,
                corrected_by=request.user, checked_in_at=checked_in_at,
                correction_reason=reason, awarded_xp=0,
            )
        streak = recalculate_event_attendance_streaks(participant, programme)
        multiplier = attendance_streak_multiplier(programme, streak)
        checkin.refresh_from_db()
        checkin.multiplier = multiplier
        checkin.save(update_fields=["multiplier"])
        participant.streak = streak
        participant.save(update_fields=["streak"])
        AuditLog.objects.create(
            actor=request.user, programme=programme, action="event_attendance_streak_restored",
            target=str(participant.id), detail={"eventId": event.id, "checkInId": checkin.id, "reason": reason, "streak": streak, "xpAwarded": 0},
        )
    return ok({"ok": True, "streak": streak, "detail": f"Attendance restored. The streak is now {streak} consecutive events. No XP was backdated."})
