from .common import *
from core.models import EventCheckIn
from core.services import event_attendance_streak, recalculate_event_attendance_streaks


@require_http_methods(["POST"])
def attendance_session(request):
    actor = require_role(request, ["worker", "admin"])
    if not actor:
        return ok({"detail": "Forbidden"}, 403)
    programme = active_programme_for(actor)
    if not programme:
        return ok({"detail": "No active programme"}, 400)
    body = parse_json(request) or {}
    now = timezone.now()

    event_id = body.get("eventId")

    if event_id:
        try:
            event = MapEvent.objects.get(
                pk=int(event_id),
                programme=programme
            )
        except (TypeError, ValueError, MapEvent.DoesNotExist):
            return ok({"detail": "Selected programme event was not found."}, 400)
    else:
        # Automatically select the currently running programme event.
        event = MapEvent.objects.filter(
            programme=programme,
            start_at__lte=now,
            end_at__gt=now,
        ).order_by("start_at", "id").first()

        if not event:
            return ok({
                "detail": "There is no programme event currently taking place. Please check the event schedule."
            }, 400)
    if event.status == "cancelled":
        return ok({"detail": "Cancelled events cannot accept attendance."}, 400)
    if not event.start_at or not event.end_at or not (event.start_at <= now < event.end_at):
        return ok({"detail": "The event QR is only available while the event is taking place."}, 400)

    AttendanceSession.objects.filter(programme=programme, active=True).update(active=False)
    AttendanceSession.objects.filter(programme=programme, expires_at__lt=now).update(active=False)
    token = secrets.token_urlsafe(24)
    session = AttendanceSession.objects.create(
        programme=programme, event=event, created_by=request.user,
        token=token, expires_at=now + timedelta(minutes=5),
    )
    return ok({"token": token, "expiresAt": session.expires_at, "eventId": event.id, "eventTitle": event.title})


@require_http_methods(["POST"])
def attendance_scan(request):
    if not profile_for(request):
        return ok({"detail": "Authentication required"}, 401)
    profile = require_role(request, ["youth"])
    if not profile:
        return ok({"detail": "Only young people can scan attendance QR codes"}, 403)
    body = parse_json(request) or {}
    token = body.get("token")
    programme = active_programme_for(profile)
    if not programme:
        return ok({"detail": "No active programme"}, 400)
    now = timezone.now()
    today = programme_local_date(programme, now)
    session = AttendanceSession.objects.filter(
        token=token, active=True, expires_at__gte=now, programme=programme,
        event__isnull=False,
    ).select_related("created_by", "event").first()
    if not session:
        return ok({"detail": "QR expired or invalid. Ask your youth worker for the current event QR."}, 400)
    event = session.event
    if event.status == "cancelled" or not event.start_at or not event.end_at or not (event.start_at <= now < event.end_at):
        return ok({"detail": "This event is not currently accepting QR check-ins."}, 400)

    with transaction.atomic():
        # Serialise check-ins for this young person so two event scans on the
        # same day cannot both claim the daily XP reward.
        profile = Profile.objects.select_for_update().select_related("programme", "user").get(pk=profile.pk)
        existing_event_checkin = EventCheckIn.objects.filter(event=event, participant=profile).first()
        if existing_event_checkin:
            streak = event_attendance_streak(profile, programme, now)
            daily_reward_recorded = Attendance.objects.filter(
                participant=profile, attendance_date=today
            ).exists()
            return ok({
                "ok": True, "awarded": 0, "streak": streak,
                "multiplier": float(existing_event_checkin.multiplier),
                "alreadyRewardedToday": daily_reward_recorded,
                "alreadyRecorded": True,
                "detail": "Your attendance for this event is already recorded.",
            })

        daily_record = Attendance.objects.filter(
            participant=profile, attendance_date=today
        ).first()
        checkin = EventCheckIn.objects.create(
            event=event, participant=profile, source="qr", verified_by=session.created_by,
            checked_in_at=now,
        )
        streak = event_attendance_streak(profile, programme, now)
        multiplier = attendance_streak_multiplier(programme, streak)
        base = max(0, int(programme.attendance_points or 0))
        # Event attendance and streak progress are recorded for every event.
        # XP is limited to one reward-bearing QR scan per programme-local day.
        awarded = 0 if daily_record else (int(round(base * multiplier)) if base else 0)
        checkin.streak_count = streak
        checkin.multiplier = multiplier
        checkin.awarded_xp = awarded
        checkin.save(update_fields=["streak_count", "multiplier", "awarded_xp"])
        if not daily_record:
            Attendance.objects.create(session=session, participant=profile, attendance_date=today)
        profile.streak = streak
        profile.save(update_fields=["streak"])
        if awarded:
            award_xp(
                target=profile, actor=session.created_by, amount=awarded,
                source="attendance", reason=f"Event attendance — {streak} consecutive events ({multiplier:g}x)", notify=False,
            )
            AuditLog.objects.create(
                actor=session.created_by, programme=programme,
                action="event_qr_attendance_awarded", target=str(profile.id),
                detail={"eventId": event.id, "checkInId": checkin.id, "amount": awarded, "streak": streak, "multiplier": multiplier},
            )
        else:
            AuditLog.objects.create(
                actor=session.created_by, programme=programme,
                action="event_qr_attendance_recorded_no_daily_reward", target=str(profile.id),
                detail={"eventId": event.id, "checkInId": checkin.id, "streak": streak},
            )

    create_notification(
        profile=profile,
        title=(f"Event attendance recorded · +{awarded} XP" if awarded else "Event attendance recorded"),
        body=f"{event.title} · {streak} consecutive event streak ({multiplier:g}x)." + (" Your daily attendance reward was already claimed." if not awarded else ""),
        kind="attendance", url="/",
    )
    return ok({
        "ok": True, "awarded": awarded, "streak": streak, "multiplier": multiplier,
        "alreadyRewardedToday": awarded == 0, "alreadyRecorded": True,
        "eventId": event.id, "eventTitle": event.title,
        "detail": ("Attendance recorded. Your daily reward was already claimed." if awarded == 0 else "Attendance recorded."),
    })


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
