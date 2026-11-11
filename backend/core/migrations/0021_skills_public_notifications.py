from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('core','0020_business_integrity')]
    operations=[
        migrations.AddField(model_name='programme',name='notification_retention_days',field=models.PositiveIntegerField(default=30)),
        migrations.AddField(model_name='programme',name='public_config',field=models.JSONField(default=dict,blank=True)),
        migrations.AddField(model_name='skill',name='programme',field=models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.CASCADE,related_name='skills',to='core.programme')),
        migrations.AddField(model_name='skill',name='milestones',field=models.JSONField(default=list,blank=True)),
        migrations.AddField(model_name='profileskill',name='completed_milestones',field=models.JSONField(default=list,blank=True)),
        migrations.AddField(model_name='mapevent',name='pin_enabled',field=models.BooleanField(default=True)),
    ]
