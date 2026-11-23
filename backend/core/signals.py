from django.db.models.signals import m2m_changed
from django.dispatch import receiver
from django.utils import timezone

from .models import Group, GroupMembership, Profile


@receiver(m2m_changed, sender=Group.members.through)
def record_group_membership_history(sender, instance, action, reverse, model, pk_set, **kwargs):
    """Keep effective-dated membership history in sync with the legacy M2M API."""
    if reverse:
        return
    if action == 'post_add' and pk_set:
        now = timezone.now()
        inactive_ids = set(Profile.objects.filter(pk__in=pk_set, user__is_active=False).values_list('id', flat=True))
        GroupMembership.objects.bulk_create(
            [GroupMembership(group=instance, profile_id=profile_id, joined_at=now, status='inactive' if profile_id in inactive_ids else 'active') for profile_id in pk_set],
            ignore_conflicts=True,
        )
        # If the previous group was removed first, complete the old record as a
        # transfer now that the destination group membership exists.
        for profile_id in pk_set:
            previous = GroupMembership.objects.filter(
                profile_id=profile_id, group__programme_id=instance.programme_id, status='withdrawn',
            ).exclude(group=instance).order_by('-left_at', '-id').first()
            if previous:
                previous.status = 'transferred'
                previous.reason = 'Transferred to another group'
                previous.save(update_fields=['status', 'reason'])
    elif action == 'pre_remove' and pk_set:
        instance._yq_removed_profile_ids = set(pk_set)
    elif action == 'post_remove' and getattr(instance, '_yq_removed_profile_ids', None):
        GroupMembership.objects.filter(
            group=instance,
            profile_id__in=instance._yq_removed_profile_ids,
            status__in=['active', 'inactive'],
        ).update(status='withdrawn', left_at=timezone.now(), reason='Removed from group')
        instance._yq_removed_profile_ids = set()
    elif action == 'pre_clear':
        instance._yq_cleared_profile_ids = set(instance.members.values_list('id', flat=True))
    elif action == 'post_clear' and getattr(instance, '_yq_cleared_profile_ids', None):
        GroupMembership.objects.filter(
            group=instance,
            profile_id__in=instance._yq_cleared_profile_ids,
            status__in=['active', 'inactive'],
        ).update(status='withdrawn', left_at=timezone.now(), reason='Removed from group')
        instance._yq_cleared_profile_ids = set()
