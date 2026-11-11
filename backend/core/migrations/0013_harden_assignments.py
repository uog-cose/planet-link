from django.db import migrations, models
from django.db.models import Q

def _dedupe(apps):
    GameAssignment=apps.get_model('core','GameAssignment')
    RewardAssignment=apps.get_model('core','RewardAssignment')
    for Model in (GameAssignment, RewardAssignment):
        seen=set()
        for row in Model.objects.filter(active=True).order_by('id'):
            target=row.target_profile_id or row.target_group_id
            key=(row.game_id if hasattr(row,'game_id') else row.reward_id, target, bool(row.target_profile_id))
            if target is None or key not in seen:
                if target is not None: seen.add(key)
                continue
            row.active=False
            row.save(update_fields=['active'])

class Migration(migrations.Migration):
    dependencies=[('core','0012_reward_assignments')]
    operations=[
        migrations.RunPython(lambda apps, schema_editor: _dedupe(apps), migrations.RunPython.noop),
        migrations.AddConstraint(model_name='rewardassignment',constraint=models.CheckConstraint(condition=~(Q(target_profile__isnull=False)&Q(target_group__isnull=False)),name='reward_assignment_one_target')),
        migrations.AddConstraint(model_name='rewardassignment',constraint=models.UniqueConstraint(fields=('reward','target_profile'),condition=Q(active=True,target_profile__isnull=False),name='unique_active_reward_profile')),
        migrations.AddConstraint(model_name='rewardassignment',constraint=models.UniqueConstraint(fields=('reward','target_group'),condition=Q(active=True,target_group__isnull=False),name='unique_active_reward_group')),
        migrations.AddConstraint(model_name='gameassignment',constraint=models.CheckConstraint(condition=(Q(target_profile__isnull=False)|Q(target_group__isnull=False)),name='game_assignment_has_target')),
        migrations.AddConstraint(model_name='gameassignment',constraint=models.CheckConstraint(condition=~(Q(target_profile__isnull=False)&Q(target_group__isnull=False)),name='game_assignment_one_target')),
        migrations.AddConstraint(model_name='gameassignment',constraint=models.UniqueConstraint(fields=('game','target_profile'),condition=Q(active=True,target_profile__isnull=False),name='unique_active_game_profile')),
        migrations.AddConstraint(model_name='gameassignment',constraint=models.UniqueConstraint(fields=('game','target_group'),condition=Q(active=True,target_group__isnull=False),name='unique_active_game_group')),
    ]
