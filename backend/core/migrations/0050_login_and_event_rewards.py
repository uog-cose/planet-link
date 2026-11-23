from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
import core.models


class Migration(migrations.Migration):
    dependencies = [('core', '0049_group_tier_unlock')]

    operations = [
        migrations.AddField(
            model_name='programme', name='login_reward_config',
            field=models.JSONField(blank=True, default=core.models.default_login_reward_config),
        ),
        migrations.AddField(
            model_name='programme', name='event_streak_rules',
            field=models.JSONField(blank=True, default=core.models.default_event_streak_rules),
        ),
        migrations.AddField(model_name='mapevent', name='attendance_enabled', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='mapevent', name='attendance_base_xp', field=models.PositiveIntegerField(default=0)),
        migrations.AddField(
            model_name='mapevent', name='eligible_profiles',
            field=models.ManyToManyField(blank=True, related_name='eligible_map_events', to='core.profile'),
        ),
        migrations.AddField(
            model_name='mapevent', name='eligible_groups',
            field=models.ManyToManyField(blank=True, related_name='eligible_map_events', to='core.group'),
        ),
        migrations.AddField(
            model_name='mapevent', name='eligible_profile_snapshot',
            field=models.ManyToManyField(blank=True, related_name='event_eligibility_snapshots', to='core.profile'),
        ),
        migrations.AddField(model_name='mapevent', name='eligibility_restricted', field=models.BooleanField(default=False)),
        migrations.CreateModel(
            name='DailyLogin',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('local_date', models.DateField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('programme', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='daily_logins', to='core.programme')),
                ('profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='daily_logins', to='core.profile')),
            ],
        ),
        migrations.AddConstraint(
            model_name='dailylogin',
            constraint=models.UniqueConstraint(fields=('profile', 'local_date'), name='unique_profile_daily_login'),
        ),
        migrations.AddIndex(
            model_name='dailylogin', index=models.Index(fields=['profile', 'local_date'], name='core_daily_profile_date_idx'),
        ),
        migrations.CreateModel(
            name='LoginStreakAward',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('streak_start', models.DateField()),
                ('threshold', models.PositiveSmallIntegerField()),
                ('bonus_xp', models.PositiveIntegerField()),
                ('awarded_at', models.DateTimeField(auto_now_add=True)),
                ('programme', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='login_streak_awards', to='core.programme')),
                ('profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='login_streak_awards', to='core.profile')),
            ],
        ),
        migrations.AddConstraint(
            model_name='loginstreakaward',
            constraint=models.UniqueConstraint(fields=('profile', 'programme', 'streak_start', 'threshold'), name='unique_login_streak_milestone'),
        ),
        migrations.CreateModel(
            name='EventAttendance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('attended_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('base_xp', models.PositiveIntegerField(default=0)),
                ('streak_count', models.PositiveIntegerField(default=1)),
                ('multiplier', models.DecimalField(decimal_places=2, default=1, max_digits=5)),
                ('awarded_xp', models.PositiveIntegerField(default=0)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_records', to='core.mapevent')),
                ('participant', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='event_attendance_records', to='core.profile')),
                ('verified_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='event_attendance_verified', to='auth.user')),
            ],
        ),
        migrations.AddConstraint(
            model_name='eventattendance',
            constraint=models.UniqueConstraint(fields=('event', 'participant'), name='unique_event_participant_attendance'),
        ),
        migrations.AddField(model_name='eventattendance', name='voided_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='eventattendance', name='voided_by', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='voided_event_attendance', to='auth.user')),
        migrations.AddIndex(
            model_name='eventattendance', index=models.Index(fields=['participant', 'attended_at'], name='core_event_part_date_idx'),
        ),
    ]
