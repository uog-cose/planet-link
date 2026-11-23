from django.db import migrations

def cleanup(apps, schema_editor):
    GameAssignment=apps.get_model('core','GameAssignment')
    RewardAssignment=apps.get_model('core','RewardAssignment')
    # Prefer group-level assignments when a player already receives the same item through a group.
    for assignment in GameAssignment.objects.filter(active=True,target_profile__isnull=False).select_related('game','target_profile'):
        if GameAssignment.objects.filter(game_id=assignment.game_id,active=True,target_group__members=assignment.target_profile).exclude(pk=assignment.pk).exists():
            assignment.active=False; assignment.save(update_fields=['active'])
    for assignment in RewardAssignment.objects.filter(active=True,target_profile__isnull=False).select_related('reward','target_profile'):
        if RewardAssignment.objects.filter(reward_id=assignment.reward_id,active=True,target_group__members=assignment.target_profile).exclude(pk=assignment.pk).exists():
            assignment.active=False; assignment.save(update_fields=['active'])

class Migration(migrations.Migration):
    dependencies=[('core','0018_default_attendance_rules')]
    operations=[migrations.RunPython(cleanup,migrations.RunPython.noop)]
