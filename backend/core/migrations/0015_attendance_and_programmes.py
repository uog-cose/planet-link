from django.db import migrations, models
import django.db.models.deletion


def seed_programme_and_session_creators(apps, schema_editor):
    Profile = apps.get_model('core', 'Profile')
    Programme = apps.get_model('core', 'Programme')
    User = apps.get_model('auth', 'User')
    programme = Programme.objects.filter(active=True).order_by('id').first()
    if programme:
        Profile.objects.filter(programme__isnull=True).update(programme=programme)
    creator = User.objects.filter(is_active=True).order_by('id').first()
    if creator:
        apps.get_model('core','AttendanceSession').objects.filter(created_by__isnull=True).update(created_by=creator)

class Migration(migrations.Migration):
    dependencies=[('core','0014_hardening')]
    operations=[
        migrations.AddField(model_name='profile',name='programme',field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name='profiles',to='core.programme')),
        migrations.AddField(model_name='programme',name='attendance_points',field=models.PositiveIntegerField(default=25)),
        migrations.AddField(model_name='programme',name='streak_rules',field=models.JSONField(blank=True,default=list)),
        migrations.AddField(model_name='programme',name='attendance_attention_days',field=models.PositiveIntegerField(default=7)),
        migrations.AddField(model_name='programme',name='points_attention_days',field=models.PositiveIntegerField(default=7)),
        migrations.AddField(model_name='programme',name='attention_grace_days',field=models.PositiveIntegerField(default=3)),
        migrations.AddField(model_name='attendancesession',name='created_by',field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='attendance_sessions',to='auth.user')),
        migrations.RunPython(seed_programme_and_session_creators, migrations.RunPython.noop),
        migrations.AlterField(model_name='attendancesession',name='created_by',field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='attendance_sessions',to='auth.user')),
    ]
