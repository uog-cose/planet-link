from django.db import migrations, models


def backfill_programme(apps, schema_editor):
    AuditLog = apps.get_model('core', 'AuditLog')
    Profile = apps.get_model('core', 'Profile')
    profiles = dict(Profile.objects.values_list('user_id', 'programme_id'))
    for audit in AuditLog.objects.filter(programme__isnull=True).iterator():
        programme_id = profiles.get(audit.actor_id)
        if programme_id:
            AuditLog.objects.filter(pk=audit.pk).update(programme_id=programme_id)


class Migration(migrations.Migration):
    dependencies = [('core', '0026_multi_instance_programmes')]

    operations = [
        migrations.AddField(
            model_name='auditlog', name='programme',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.deletion.SET_NULL, related_name='audit_logs', to='core.programme'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['programme','created_at'], name='core_audit_programme_created_idx'),
        ),
        migrations.RunPython(backfill_programme, migrations.RunPython.noop),
    ]
