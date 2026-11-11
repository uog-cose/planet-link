from django.db import migrations, models


def create_memberships(apps, schema_editor):
    Profile = apps.get_model('core', 'Profile')
    Membership = apps.get_model('core', 'ProgrammeMembership')
    rows = []
    for profile in Profile.objects.exclude(programme__isnull=True).values('user_id', 'programme_id'):
        rows.append(Membership(user_id=profile['user_id'], programme_id=profile['programme_id']))
    Membership.objects.bulk_create(rows, ignore_conflicts=True)


def sync_status(apps, schema_editor):
    Programme = apps.get_model('core', 'Programme')
    for programme in Programme.objects.all().iterator():
        programme.status = 'active' if programme.active else 'inactive'
        programme.save(update_fields=['status'])


class Migration(migrations.Migration):
    dependencies = [('core', '0025_profile_push_db_default')]

    operations = [
        migrations.AddField(
            model_name='programme', name='status',
            field=models.CharField(choices=[('active','Active'),('inactive','Inactive'),('archived','Archived')], default='active', max_length=20),
        ),
        migrations.AddField(
            model_name='programme', name='public_enabled',
            field=models.BooleanField(default=True),
        ),
        migrations.CreateModel(
            name='ProgrammeMembership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('programme', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='memberships', to='core.programme')),
                ('user', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='programme_memberships', to='auth.user')),
            ],
        ),
        migrations.AddConstraint(
            model_name='programmemembership',
            constraint=models.UniqueConstraint(fields=('user','programme'), name='unique_user_programme_membership'),
        ),
        migrations.AddIndex(
            model_name='programmemembership',
            index=models.Index(fields=['user','programme'], name='core_progra_user_id_4b0f0e_idx'),
        ),
        migrations.RunPython(create_memberships, migrations.RunPython.noop),
        migrations.RunPython(sync_status, migrations.RunPython.noop),
    ]
