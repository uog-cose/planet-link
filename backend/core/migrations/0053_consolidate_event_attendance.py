from django.db import migrations, models
import django.db.models.deletion


def migrate_legacy_event_attendance(apps, schema_editor):
    EventAttendance = apps.get_model('core', 'EventAttendance')
    EventCheckIn = apps.get_model('core', 'EventCheckIn')
    db = schema_editor.connection.alias
    for old in EventAttendance.objects.using(db).all().iterator():
        defaults = {
            'source': 'admin',
            'checked_in_at': old.attended_at,
            'verified_by_id': old.verified_by_id,
            'streak_count': old.streak_count,
            'multiplier': old.multiplier,
            'awarded_xp': old.awarded_xp,
            'correction_reason': 'Migrated from legacy event attendance',
            'voided_at': old.voided_at,
            'voided_by_id': old.voided_by_id,
        }
        EventCheckIn.objects.using(db).get_or_create(
            event_id=old.event_id,
            participant_id=old.participant_id,
            defaults=defaults,
        )


class Migration(migrations.Migration):
    dependencies = [('core', '0052_event_based_qr_streaks')]

    operations = [
        migrations.AddField(
            model_name='eventcheckin', name='voided_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='eventcheckin', name='voided_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='voided_event_check_ins', to='auth.user'),
        ),
        migrations.RunPython(migrate_legacy_event_attendance, migrations.RunPython.noop),
        migrations.DeleteModel(name='EventAttendance'),
    ]
