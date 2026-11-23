from django.db import migrations, models
import django.db.models.deletion


def backfill_programme(apps, schema_editor):
    XPTransaction = apps.get_model('core', 'XPTransaction')
    Profile = apps.get_model('core', 'Profile')
    batch=[]
    for tx in XPTransaction.objects.filter(programme__isnull=True).iterator(chunk_size=500):
        programme_id = Profile.objects.filter(pk=tx.target_id).values_list('programme_id', flat=True).first()
        if programme_id:
            tx.programme_id = programme_id
            batch.append(tx)
        if len(batch) >= 500:
            XPTransaction.objects.bulk_update(batch, ['programme'])
            batch=[]
    if batch:
        XPTransaction.objects.bulk_update(batch, ['programme'])


def reverse_backfill(apps, schema_editor):
    # Programme scope is intentionally retained as nullable historical metadata.
    pass


class Migration(migrations.Migration):
    dependencies = [('core', '0028_live_dashboard_state')]

    operations = [
        migrations.AddField(
            model_name='xptransaction',
            name='programme',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='xp_transactions', to='core.programme'),
        ),
        migrations.RunPython(backfill_programme, reverse_backfill),
        migrations.AddIndex(
            model_name='xptransaction',
            index=models.Index(fields=['programme', '-created_at'], name='core_xp_prog_created_idx'),
        ),
    ]
