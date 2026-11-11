from django.db import migrations, models
import django.db.models.deletion

def assign_scope(apps, schema_editor):
    Programme=apps.get_model('core','Programme'); p=Programme.objects.filter(active=True).order_by('id').first()
    if not p:return
    apps.get_model('core','Challenge').objects.filter(programme__isnull=True).update(programme=p)
    apps.get_model('core','Reward').objects.filter(programme__isnull=True).update(programme=p)

class Migration(migrations.Migration):
    dependencies=[('core','0016_attendance_relation')]
    operations=[
        migrations.AddField(model_name='challenge',name='programme',field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.CASCADE,related_name='challenges',to='core.programme')),
        migrations.AddField(model_name='reward',name='programme',field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.CASCADE,related_name='rewards',to='core.programme')),
        migrations.RunPython(assign_scope,migrations.RunPython.noop),
    ]
