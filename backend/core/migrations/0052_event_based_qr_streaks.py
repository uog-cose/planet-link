from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def convert_attendance_thresholds(apps, schema_editor):
    Programme = apps.get_model('core', 'Programme')
    db = schema_editor.connection.alias
    for programme in Programme.objects.using(db).all().iterator():
        rules = programme.streak_rules if isinstance(programme.streak_rules, list) else []
        converted = []
        for rule in rules:
            if not isinstance(rule, dict):
                continue
            threshold = rule.get('events', rule.get('days', 0))
            try:
                threshold = int(threshold)
                multiplier = float(rule.get('multiplier', 1))
            except (TypeError, ValueError):
                continue
            if threshold > 0 and multiplier >= 1:
                converted.append({'events': threshold, 'multiplier': multiplier})
        converted.sort(key=lambda item: item['events'])
        programme.streak_rules = converted
        programme.save(update_fields=['streak_rules'], using=db)


class Migration(migrations.Migration):
    dependencies = [('core', '0051_group_history_and_contributions')]

    operations = [
        migrations.AddField(
            model_name='attendancesession', name='event',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='qr_sessions', to='core.mapevent'),
        ),
        migrations.CreateModel(
            name='EventCheckIn',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(choices=[('qr', 'QR scan'), ('admin', 'Admin correction')], default='qr', max_length=12)),
                ('checked_in_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('streak_count', models.PositiveIntegerField(default=1)),
                ('multiplier', models.DecimalField(decimal_places=2, default=1, max_digits=5)),
                ('awarded_xp', models.PositiveIntegerField(default=0)),
                ('correction_reason', models.CharField(blank=True, max_length=240)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('corrected_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='event_check_ins_corrected', to=settings.AUTH_USER_MODEL)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='check_ins', to='core.mapevent')),
                ('participant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='event_check_ins', to='core.profile')),
                ('verified_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='event_check_ins_verified', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name='eventcheckin',
            constraint=models.UniqueConstraint(fields=('event', 'participant'), name='unique_event_qr_checkin'),
        ),
        migrations.AddIndex(
            model_name='eventcheckin',
            index=models.Index(fields=['participant', 'checked_in_at'], name='core_eventcheck_profile_idx'),
        ),
        migrations.RunPython(convert_attendance_thresholds, migrations.RunPython.noop),
        migrations.RemoveField(model_name='programme', name='event_streak_rules'),
        migrations.RemoveField(model_name='mapevent', name='attendance_enabled'),
        migrations.RemoveField(model_name='mapevent', name='attendance_base_xp'),
        migrations.RemoveField(model_name='mapevent', name='eligible_profiles'),
        migrations.RemoveField(model_name='mapevent', name='eligible_groups'),
        migrations.RemoveField(model_name='mapevent', name='eligible_profile_snapshot'),
        migrations.RemoveField(model_name='mapevent', name='eligibility_restricted'),
    ]
