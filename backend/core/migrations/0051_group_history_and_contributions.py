from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import core.models


def preserve_existing_group_state(apps, schema_editor):
    Group = apps.get_model('core', 'Group')
    Profile = apps.get_model('core', 'Profile')
    GroupMembership = apps.get_model('core', 'GroupMembership')
    GroupScoringPolicyHistory = apps.get_model('core', 'GroupScoringPolicyHistory')
    db = schema_editor.connection.alias
    now = django.utils.timezone.now()
    for group in Group.objects.using(db).all().iterator():
        # The existing XP total is the only reliable historical group snapshot.
        # Keep it as an opening balance rather than re-attributing old XP to
        # whichever profiles happen to be members when this migration runs.
        Group.objects.using(db).filter(pk=group.pk).update(historical_xp=max(0, int(group.xp or 0)))
        through = Group._meta.get_field('members').remote_field.through
        profile_ids = list(through.objects.using(db).filter(group_id=group.pk).values_list('profile_id', flat=True))
        active_by_profile = dict(Profile.objects.using(db).filter(pk__in=profile_ids).values_list('id', 'user__is_active'))
        GroupMembership.objects.using(db).bulk_create([
            GroupMembership(group_id=group.pk, profile_id=profile_id, status='active' if active_by_profile.get(profile_id, True) else 'inactive', joined_at=now)
            for profile_id in profile_ids
        ], ignore_conflicts=True)
        GroupScoringPolicyHistory.objects.using(db).create(
            group_id=group.pk, include_inactive_members=bool(group.include_inactive_members), effective_from=now,
        )


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0050_login_and_event_rewards'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='programme', name='group_scoring_config',
            field=models.JSONField(blank=True, default=core.models.default_group_scoring_config),
        ),
        migrations.AddField(
            model_name='group', name='historical_xp',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='group', name='include_inactive_members',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='GroupMembership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('active', 'Active'), ('inactive', 'Inactive'), ('transferred', 'Transferred'), ('withdrawn', 'Withdrawn')], default='active', max_length=20)),
                ('joined_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('left_at', models.DateTimeField(blank=True, null=True)),
                ('reason', models.CharField(blank=True, max_length=240)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='group_membership_changes', to=settings.AUTH_USER_MODEL)),
                ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='membership_history', to='core.group')),
                ('profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='group_membership_history', to='core.profile')),
            ],
        ),
        migrations.CreateModel(
            name='GroupScoringPolicyHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('include_inactive_members', models.BooleanField(default=False)),
                ('effective_from', models.DateTimeField(default=django.utils.timezone.now)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='group_scoring_policy_changes', to=settings.AUTH_USER_MODEL)),
                ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='scoring_policy_history', to='core.group')),
            ],
            options={'ordering': ['effective_from', 'id']},
        ),
        migrations.AddConstraint(
            model_name='groupscoringpolicyhistory',
            constraint=models.UniqueConstraint(fields=('group', 'effective_from'), name='unique_group_scoring_policy_time'),
        ),
        migrations.CreateModel(
            name='GroupXPContribution',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.IntegerField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('group', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='xp_contributions', to='core.group')),
                ('transaction', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='group_contributions', to='core.xptransaction')),
            ],
        ),
        migrations.AddConstraint(
            model_name='groupmembership',
            constraint=models.UniqueConstraint(condition=models.Q(('status', 'active')), fields=('group', 'profile'), name='unique_active_group_membership'),
        ),
        migrations.AddIndex(
            model_name='groupmembership',
            index=models.Index(fields=['profile', 'joined_at', 'left_at'], name='core_gm_profile_dates_idx'),
        ),
        migrations.AddConstraint(
            model_name='groupxpcontribution',
            constraint=models.UniqueConstraint(fields=('group', 'transaction'), name='unique_group_xp_contribution'),
        ),
        migrations.AddIndex(
            model_name='groupxpcontribution',
            index=models.Index(fields=['group', 'created_at'], name='core_groupxp_group_date_idx'),
        ),
        migrations.RunPython(preserve_existing_group_state, migrations.RunPython.noop),
    ]
