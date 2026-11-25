import datetime

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def seed_programme_attendance_history(apps, schema_editor):
    Programme = apps.get_model('core', 'Programme')
    AttendanceScheduleChange = apps.get_model('core', 'AttendanceScheduleChange')
    db = schema_editor.connection.alias
    baseline = datetime.date(1970, 1, 1)
    for programme in Programme.objects.using(db).all().iterator():
        config = programme.attendance_config if isinstance(programme.attendance_config, dict) else {}
        days = config.get('default_days', [0, 1, 2, 3, 4, 5, 6])
        AttendanceScheduleChange.objects.using(db).create(
            programme_id=programme.pk, scope_type='programme', days=days,
            effective_from=baseline,
        )


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0054_configurable_attendance_days'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AttendanceScheduleChange',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('scope_type', models.CharField(choices=[('programme', 'Programme'), ('group', 'Group'), ('person', 'Person')], max_length=12)),
                ('days', models.JSONField(blank=True, default=None, null=True)),
                ('effective_from', models.DateField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('changed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='attendance_schedule_changes', to=settings.AUTH_USER_MODEL)),
                ('group', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='attendance_schedule_history', to='core.group')),
                ('profile', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='attendance_schedule_history', to='core.profile')),
                ('programme', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_schedule_history', to='core.programme')),
            ],
        ),
        migrations.AddIndex(model_name='attendanceschedulechange', index=models.Index(fields=['programme', 'scope_type', 'effective_from'], name='core_att_sched_scope_idx')),
        migrations.AddIndex(model_name='attendanceschedulechange', index=models.Index(fields=['profile', 'effective_from'], name='core_att_sched_profile_idx')),
        migrations.AddIndex(model_name='attendanceschedulechange', index=models.Index(fields=['group', 'effective_from'], name='core_att_sched_group_idx')),
        migrations.RunPython(seed_programme_attendance_history, migrations.RunPython.noop),
    ]
