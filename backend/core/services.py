import hashlib
import json
import logging
from datetime import timedelta
from django.conf import settings
from django.db import transaction, models
from django.utils import timezone
from .config import CONFIG
from .models import XPTransaction, Notification, PushSubscription, Reward, RewardAssignment, Badge, ProfileBadge, GroupTierUnlock, DailyLogin, LoginStreakAward, Profile, GroupXPContribution

logger = logging.getLogger('youthquest.notifications')


def _push_payload(notification):
    return json.dumps({
        'title': notification.title,
        'body': notification.body,
        'kind': notification.kind,
        'url': notification.url or '/notifications',
        'notificationId': notification.id,
        'icon': '/icon-192.png',
        'badge': '/icon-192.png',
        'created_at': notification.created_at.isoformat(),
    })


def send_push(notification):
    if not CONFIG.vapid_public_key or not CONFIG.vapid_private_key:
        return
    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning('pywebpush is not installed; skipping phone notification')
        return
    subscriptions = PushSubscription.objects.filter(profile=notification.profile, active=True).only('id','endpoint','p256dh','auth','updated_at')
    for sub in subscriptions:
        try:
            webpush(
                subscription_info={'endpoint': sub.endpoint, 'keys': {'p256dh': sub.p256dh, 'auth': sub.auth}},
                data=_push_payload(notification),
                vapid_private_key=CONFIG.vapid_private_key,
                vapid_claims={'sub': CONFIG.vapid_subject},
            )
            sub.updated_at = timezone.now()
            sub.save(update_fields=['updated_at'])
        except WebPushException as exc:
            status = getattr(getattr(exc, 'response', None), 'status_code', None)
            if status in (404, 410):
                sub.active = False
                sub.save(update_fields=['active', 'updated_at'])
            else:
                logger.warning('Push delivery failed for subscription %s: %s', sub.id, exc)
        except Exception:
            logger.exception('Unexpected push delivery failure for subscription %s', sub.id)


def create_notification(*, profile, title, body, kind='info', url='/notifications'):
    """Create the in-app notification and optionally deliver it to the phone.

    notifications_opt_in is the master preference. push_notifications_opt_in
    controls whether an existing active web-push subscription is contacted.
    """
    if not profile or not getattr(profile, 'notifications_opt_in', False):
        return None
    clean_kind=str(kind)[:30]
    clean_title=str(title)[:120]
    clean_body=str(body)[:300]
    # Game assignments can be created in a short burst. Keep one useful notification
    # instead of making a young person dismiss one card per assigned game.
    if clean_kind == 'game':
        existing = Notification.objects.filter(
            profile=profile, kind='game', read=False, created_at__gte=timezone.now()-timedelta(minutes=10)
        ).order_by('-created_at').first()
        if existing:
            if existing.title != 'New games assigned':
                existing.title = 'New games assigned'
                existing.body = 'You have more than one new game ready in Games.'
                existing.url = '/games'
                existing.save(update_fields=['title','body','url'])
            return existing
    notification = Notification.objects.create(
        profile=profile, title=clean_title, body=clean_body,
        kind=clean_kind, url=str(url)[:240],
    )
    # Publish only after the row commits so subscribers can immediately read it.
    from .notification_events import publish_notification
    transaction.on_commit(lambda: publish_notification(notification.id, profile.id))
    if getattr(profile, 'push_notifications_opt_in', False):
        transaction.on_commit(lambda: send_push(notification))
    return notification


def award_xp(*, target, actor, amount, source, reason, group_multiplier=1.0, notify=True):
    amount = int(round(amount * float(group_multiplier)))
    if amount == 0:
        return None, target
    old_level=target.level
    with transaction.atomic():
        target.current_xp = max(0, target.current_xp + amount)
        if amount > 0:
            target.lifetime_xp += amount
        target.level = max(1, target.current_xp // 500 + 1)
        target.save(update_fields=['current_xp', 'lifetime_xp', 'level'])
        programme = target.programme
        tx = XPTransaction.objects.create(target=target, programme=programme, actor=actor, amount=amount, source=str(source)[:80], reason=str(reason)[:240])
        tx.immutable_hash = hashlib.sha256(f'{tx.id}:{target.id}:{amount}:{tx.created_at}'.encode()).hexdigest()
        tx.save(update_fields=['immutable_hash'])
        unlocked_group_tiers=[]
        for group in target.groups.filter(programme=programme).select_for_update().prefetch_related('members'):
            previous_group_xp=int(group.xp or 0)
            GroupXPContribution.objects.get_or_create(
                group=group, transaction=tx, defaults={'amount': amount},
            )
            group.xp = max(0, group.xp + amount)
            group.save(update_fields=['xp'])
            tiers=group.tier_targets if isinstance(group.tier_targets,list) else []
            for tier in tiers:
                if not isinstance(tier,dict): continue
                try: threshold=int(tier.get('xp',0))
                except (TypeError,ValueError): continue
                name=str(tier.get('name','')).strip()[:80]
                if threshold>0 and name and previous_group_xp < threshold <= group.xp:
                    unlock,created=GroupTierUnlock.objects.get_or_create(group=group,threshold=threshold,defaults={'tier_name':name,'prize':str(tier.get('prize',''))[:160]})
                    if created: unlocked_group_tiers.append((group,unlock))
    if notify:
        create_notification(profile=target, title=f'{amount:+d} XP', body=str(reason)[:300], kind='penalty' if amount < 0 else 'xp', url='/')
    if notify:
        for group, unlock in locals().get('unlocked_group_tiers', []):
            prize_text=f' Prize: {unlock.prize}.' if unlock.prize else ''
            for member in group.members.filter(role='youth',programme_id=group.programme_id,user__is_active=True):
                create_notification(profile=member,title=f'{group.name} unlocked {unlock.tier_name}!',body=f'Your group reached {unlock.threshold:,} XP.{prize_text}',kind='reward',url='/rewards')
    if notify and amount > 0 and target.programme_id:
        programme = target.programme
        milestones = [m for m in (programme.milestones if isinstance(programme.milestones, list) else []) if isinstance(m, dict)]
        # Crossing a milestone is an idempotent achievement event. A matching reward
        # can be assigned once, and the badge/notification can never be duplicated.
        for milestone in sorted(milestones, key=lambda x: int(x.get('xp', 0) or 0)):
            threshold = int(milestone.get('xp', 0) or 0)
            if not (old_level >= 0 and target.lifetime_xp >= threshold and (target.lifetime_xp - amount) < threshold):
                continue
            tier = str(milestone.get('tier', f'Milestone {threshold}')).strip()[:100]
            badge, _ = Badge.objects.get_or_create(name=f'{programme.id}:{tier}', defaults={'description':f'{tier} achievement at {threshold} XP','icon':'trophy','color_token':'accent'})
            ProfileBadge.objects.get_or_create(profile=target, badge=badge)
            create_notification(profile=target, title=f'{tier} unlocked!', body=f'You reached {threshold:,} XP.', kind='achievement', url='/')
            reward_id = milestone.get('rewardId')
            try:
                reward_id = int(reward_id) if reward_id not in (None, '') else None
            except (TypeError, ValueError):
                reward_id = None
            if reward_id:
                reward = Reward.objects.filter(pk=reward_id, programme=programme, active=True).first()
                if reward:
                    assignment, created = RewardAssignment.objects.get_or_create(
                        reward=reward, target_profile=target, active=True,
                        defaults={'assigned_by': actor, 'target_group': None},
                    )
                    if created:
                        create_notification(profile=target, title='Award unlocked!', body=f'{reward.name} is now available.', kind='reward', url='/rewards')
    if notify and target.level > old_level:
        create_notification(profile=target, title=f'Level {target.level} reached!', body='You have reached a new level in Youth Quest.', kind='level', url='/')
    return tx, target



def process_daily_login_reward(profile):
    """Award a youth member's daily login XP and any newly reached streak milestone.

    The profile row lock and unique daily-login constraint make this safe under
    concurrent login requests and retries. Streak dates use the programme's
    configured timezone, falling back to Django's configured timezone.
    """
    if not profile or profile.role != 'youth' or not profile.programme_id:
        return {'awarded': False, 'streak': 0, 'dailyXp': 0, 'bonusXp': 0}
    with transaction.atomic():
        # locked = Profile.objects.select_for_update().select_related('programme', 'user').get(pk=profile.pk)
        locked = Profile.objects.select_for_update(of=('self',)).select_related('programme', 'user').get(pk=profile.pk)
        programme = locked.programme
        config = programme.login_reward_config if isinstance(programme.login_reward_config, dict) else {}
        if not config.get('enabled', True):
            return {'awarded': False, 'streak': 0, 'dailyXp': 0, 'bonusXp': 0}
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        try:
            tz = ZoneInfo(str(config.get('timezone') or settings.TIME_ZONE))
        except (ZoneInfoNotFoundError, ValueError):
            tz = timezone.get_current_timezone()
        today = timezone.localtime(timezone.now(), tz).date()
        login, created = DailyLogin.objects.get_or_create(
            profile=locked, local_date=today, defaults={'programme': programme}
        )
        if not created:
            return {'awarded': False, 'streak': _login_streak(locked, programme, today), 'dailyXp': 0, 'bonusXp': 0}
        streak = _login_streak(locked, programme, today)
        start_date = today - timedelta(days=streak - 1)
        try:
            daily_xp = int(config.get('daily_xp', 10))
        except (TypeError, ValueError):
            daily_xp = 10
        daily_xp = max(0, min(daily_xp, 5000))
        if daily_xp:
            award_xp(target=locked, actor=locked.user, amount=daily_xp, source='daily_login', reason='Daily login reward', notify=True)
        bonus_xp = 0
        milestones = config.get('milestones', []) if isinstance(config.get('milestones', []), list) else []
        for rule in milestones:
            if not isinstance(rule, dict):
                continue
            try:
                threshold = int(rule.get('days', 0))
                bonus = int(rule.get('bonus_xp', 0))
            except (TypeError, ValueError):
                continue
            if threshold != streak or bonus <= 0:
                continue
            _, milestone_created = LoginStreakAward.objects.get_or_create(
                profile=locked, programme=programme, streak_start=start_date, threshold=threshold,
                defaults={'bonus_xp': bonus},
            )
            if milestone_created:
                award_xp(target=locked, actor=locked.user, amount=bonus, source='login_streak',
                         reason=f'{threshold}-day login streak bonus', notify=True)
                bonus_xp += bonus
        return {'awarded': bool(daily_xp or bonus_xp), 'streak': streak, 'dailyXp': daily_xp, 'bonusXp': bonus_xp}


def _login_streak(profile, programme, today):
    dates = set(DailyLogin.objects.filter(profile=profile, programme=programme,
                                           local_date__lte=today).values_list('local_date', flat=True))
    streak = 0
    cursor = today
    while cursor in dates:
        streak += 1
        cursor -= timedelta(days=1)
    return streak

def programme_local_date(programme, moment=None):
    """Return a date in the programme's configured reward timezone."""
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    config = programme.login_reward_config if programme and isinstance(programme.login_reward_config, dict) else {}
    try:
        tz = ZoneInfo(str(config.get('timezone') or settings.TIME_ZONE))
    except (ZoneInfoNotFoundError, ValueError):
        tz = timezone.get_current_timezone()
    return timezone.localtime(moment or timezone.now(), tz).date()


def attendance_streak_multiplier(programme, streak):
    """Return the highest multiplier for consecutive assigned attendance days."""
    rules = programme.streak_rules if programme and isinstance(programme.streak_rules, list) else []
    multiplier = 1.0
    for rule in rules:
        try:
            events = int(rule.get('events', rule.get('days', 0)))
            value = float(rule.get('multiplier', 1))
            if events > 0 and value >= 1 and streak >= events:
                multiplier = max(multiplier, value)
        except (TypeError, ValueError, AttributeError):
            continue
    return multiplier



def _clean_attendance_days(value):
    if not isinstance(value, list):
        return None
    days = []
    for item in value:
        try:
            day = int(item)
        except (TypeError, ValueError):
            continue
        if 0 <= day <= 6 and day not in days:
            days.append(day)
    return sorted(days)

def _attendance_schedule_history(profile, programme):
    from core.models import AttendanceScheduleChange, GroupMembership
    memberships = list(GroupMembership.objects.filter(
        profile=profile, group__programme=programme,
    ).select_related('group').order_by('joined_at', 'id'))
    group_memberships = {}
    for membership in memberships:
        group_memberships.setdefault(membership.group_id, {'group': membership.group, 'memberships': []})['memberships'].append({
            'joined_at': membership.joined_at, 'left_at': membership.left_at,
        })
    # Older profiles may not have history if they were assigned through a legacy path.
    for group in profile.groups.filter(programme=programme).exclude(id__in=list(group_memberships)):
        group_memberships[group.id] = {'group': group, 'memberships': [{'joined_at': None, 'left_at': None}]}
    group_ids = list(group_memberships)
    rows = AttendanceScheduleChange.objects.filter(programme=programme).filter(
        models.Q(scope_type='programme') | models.Q(profile=profile) | models.Q(group_id__in=group_ids)
    ).order_by('effective_from', 'id')
    history = {'programme': [], 'person': [], 'groups': {group_id: [] for group_id in group_ids}}
    for row in rows:
        if row.scope_type == 'programme':
            history['programme'].append(row)
        elif row.scope_type == 'person':
            history['person'].append(row)
        elif row.scope_type == 'group' and row.group_id in history['groups']:
            history['groups'][row.group_id].append(row)
    return history, list(group_memberships.values())

def _latest_schedule_change(rows, on_date):
    for row in reversed(rows):
        if row.effective_from <= on_date:
            return row
    return None

def _resolve_attendance_days(profile, programme, on_date, history, groups):
    person_change = _latest_schedule_change(history['person'], on_date)
    if person_change is not None:
        person_days = _clean_attendance_days(person_change.days)
        if person_days is not None:
            return person_days
    elif profile.attendance_days is not None:
        return _clean_attendance_days(profile.attendance_days) or []

    group_days = set()
    has_group_override = False
    for entry in groups:
        group = entry['group']
        is_member_on_date = False
        for membership in entry['memberships']:
            joined_date = programme_local_date(programme, membership['joined_at']) if membership['joined_at'] else on_date
            left_date = programme_local_date(programme, membership['left_at']) if membership['left_at'] else None
            if joined_date <= on_date and (left_date is None or on_date < left_date):
                is_member_on_date = True
                break
        if not is_member_on_date:
            continue
        change = _latest_schedule_change(history['groups'].get(group.id, []), on_date)
        if change is not None:
            resolved = _clean_attendance_days(change.days)
            if resolved is not None:
                has_group_override = True
                group_days.update(resolved)
        elif group.attendance_days is not None:
            has_group_override = True
            group_days.update(_clean_attendance_days(group.attendance_days) or [])
    if has_group_override:
        # If a person belongs to multiple groups, their scheduled days are the
        # union of the groups' explicit schedules. An individual override wins.
        return sorted(group_days)

    programme_change = _latest_schedule_change(history['programme'], on_date)
    if programme_change is not None:
        return _clean_attendance_days(programme_change.days) or []
    config = programme.attendance_config if isinstance(programme.attendance_config, dict) else {}
    return _clean_attendance_days(config.get('default_days', [])) or []

def record_attendance_schedule_change(programme, scope_type, days, *, actor=None, group=None, profile=None, previous_days=None, effective_from=None):
    """Persist a new rule while retaining the prior rule for historical streaks."""
    from datetime import date
    from core.models import AttendanceScheduleChange
    filters = {'programme': programme, 'scope_type': scope_type}
    if scope_type == 'group':
        filters['group'] = group
    elif scope_type == 'person':
        filters['profile'] = profile
    history = AttendanceScheduleChange.objects.filter(**filters)
    if not history.exists():
        AttendanceScheduleChange.objects.create(
            **filters, days=previous_days, effective_from=date(1970, 1, 1), changed_by=actor,
        )
    return AttendanceScheduleChange.objects.create(
        **filters, days=days,
        effective_from=effective_from or programme_local_date(programme, timezone.now()),
        changed_by=actor,
    )

def effective_attendance_days(profile, programme=None, on_date=None):
    """Resolve the effective schedule for a date: person, groups, programme."""
    programme = programme or (profile.programme if profile else None)
    if not profile or not programme:
        return []
    local_date = on_date or programme_local_date(programme, timezone.now())
    history, groups = _attendance_schedule_history(profile, programme)
    return _resolve_attendance_days(profile, programme, local_date, history, groups)

def scheduled_attendance_streak(profile, programme=None, moment=None):
    """Count attended scheduled opportunities using the schedule effective on each date."""
    from datetime import timedelta
    from core.models import Attendance
    programme = programme or (profile.programme if profile else None)
    if not profile or not programme:
        return 0
    today = programme_local_date(programme, moment or timezone.now())
    history, groups = _attendance_schedule_history(profile, programme)
    attended = set(Attendance.objects.filter(
        participant=profile, session__programme=programme, attendance_date__lte=today
    ).values_list('attendance_date', flat=True))
    cursor = today
    streak = 0
    # A safety cap avoids unbounded date iteration for old accounts.
    for _ in range(3660):
        assigned_days = _resolve_attendance_days(profile, programme, cursor, history, groups)
        if cursor.weekday() in assigned_days:
            if cursor not in attended:
                break
            streak += 1
        cursor -= timedelta(days=1)
    return streak

def event_attendance_streak(profile, programme=None, moment=None):
    """Count the current run of consecutive programme events attended.

    Every non-cancelled event in the programme is an opportunity for every
    young person. Calendar gaps do not matter. A missed event breaks the run
    only after its scheduled end; cancelled events never affect it.
    """
    from core.models import EventCheckIn, MapEvent
    programme = programme or (profile.programme if profile else None)
    if not profile or not programme:
        return 0
    now = moment or timezone.now()
    events = MapEvent.objects.filter(
        programme=programme, start_at__lte=now,
    ).exclude(status='cancelled').order_by('start_at', 'id')
    attended_ids = set(EventCheckIn.objects.filter(
        participant=profile, event__in=events, voided_at__isnull=True,
    ).values_list('event_id', flat=True))
    streak = 0
    for event in events:
        if event.id in attended_ids:
            streak += 1
            continue
        event_end = event.ended_at or event.end_at
        if event_end and event_end <= now:
            streak = 0
    return streak


def recalculate_event_attendance_streaks(profile, programme=None, moment=None):
    """Refresh stored streak snapshots after an audited attendance correction.

    Previously awarded XP and multiplier snapshots are intentionally immutable.
    Only the attendance streak count shown in event history is recalculated.
    """
    from core.models import EventCheckIn, MapEvent
    programme = programme or (profile.programme if profile else None)
    if not profile or not programme:
        return 0
    now = moment or timezone.now()
    events = list(MapEvent.objects.filter(
        programme=programme, start_at__lte=now,
    ).exclude(status='cancelled').order_by('start_at', 'id'))
    checkins = {
        row.event_id: row
        for row in EventCheckIn.objects.filter(
            participant=profile, event__in=events, voided_at__isnull=True,
        )
    }
    streak = 0
    for event in events:
        checkin = checkins.get(event.id)
        if checkin:
            streak += 1
            if checkin.streak_count != streak:
                EventCheckIn.objects.filter(pk=checkin.pk).update(streak_count=streak)
            continue
        event_end = event.ended_at or event.end_at
        if event_end and event_end <= now:
            streak = 0
    return streak


