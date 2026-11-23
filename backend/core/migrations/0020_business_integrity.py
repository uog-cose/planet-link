from django.db import migrations, models
import django.utils.timezone


def normalize_programmes(apps, schema_editor):
    Programme = apps.get_model('core', 'Programme')
    active = list(Programme.objects.filter(active=True).order_by('id'))
    if len(active) > 1:
        Programme.objects.filter(active=True).exclude(pk=active[0].pk).update(active=False)


def backfill_attendance_dates(apps, schema_editor):
    Attendance = apps.get_model('core', 'Attendance')
    for row in Attendance.objects.all().iterator():
        row.attendance_date = django.utils.timezone.localtime(row.attended_at).date()
        row.save(update_fields=['attendance_date'])


def dedupe_profile_skills(apps, schema_editor):
    ProfileSkill = apps.get_model('core', 'ProfileSkill')
    seen = {}
    for row in ProfileSkill.objects.order_by('id'):
        key = (row.profile_id, row.skill_id)
        if key not in seen:
            seen[key] = row
            continue
        keep = seen[key]
        keep.progress = max(int(keep.progress or 0), int(row.progress or 0))
        keep.completed = bool(keep.completed or row.completed)
        keep.save(update_fields=['progress', 'completed'])
        row.delete()


def dedupe_daily_attendance(apps, schema_editor):
    Attendance = apps.get_model('core', 'Attendance')
    seen=set()
    for row in Attendance.objects.order_by('participant_id','attendance_date','id'):
        key=(row.participant_id,row.attendance_date)
        if key in seen:
            row.delete()
        else:
            seen.add(key)


class Migration(migrations.Migration):
    dependencies = [('core', '0019_cleanup_overlapping_assignments')]
    operations = [
        migrations.RunPython(normalize_programmes, migrations.RunPython.noop),
        migrations.RunPython(dedupe_profile_skills, migrations.RunPython.noop),
        migrations.AddField(model_name='attendance',name='attendance_date',field=models.DateField(default=django.utils.timezone.localdate),),
        migrations.RunPython(backfill_attendance_dates, migrations.RunPython.noop),
        migrations.RunPython(dedupe_daily_attendance, migrations.RunPython.noop),
        migrations.AddConstraint(model_name='attendance',constraint=models.UniqueConstraint(fields=['participant','attendance_date'],name='unique_daily_attendance')),
        migrations.AddConstraint(
            model_name='profileskill',
            constraint=models.UniqueConstraint(
                fields=['profile', 'skill'],
                name='unique_profile_skill',
            ),
        ),
    ]
