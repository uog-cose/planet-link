import hashlib
import json
import logging
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from .config import CONFIG
from .models import XPTransaction, Notification, PushSubscription, Reward, RewardAssignment, Badge, ProfileBadge, GroupTierUnlock

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


def attendance_streak_multiplier(programme, streak):
    rules = programme.streak_rules if programme and isinstance(programme.streak_rules, list) else []
    multiplier = 1.0
    for rule in rules:
        try:
            days = int(rule.get('days', 0)); value = float(rule.get('multiplier', 1))
            if days > 0 and value >= 1 and streak >= days: multiplier = max(multiplier, value)
        except (TypeError, ValueError, AttributeError):
            continue
    return multiplier


def attendance_reward(profile, session):
    programme=session.programme; today=timezone.localdate()
    attended_dates=set(profile.attendances.values_list('attended_at__date',flat=True))
    if today not in attended_dates: attended_dates.add(today)
    cursor=today; streak=0
    while cursor in attended_dates:
        streak += 1; cursor -= timedelta(days=1)
    profile.streak=streak; profile.save(update_fields=['streak'])
    base=max(0,int(programme.attendance_points or 0)); multiplier=attendance_streak_multiplier(programme,streak)
    awarded=int(round(base*multiplier)) if base else 0
    return awarded,streak,multiplier
