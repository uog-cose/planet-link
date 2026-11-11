from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0042_points_qr_stable_token')]
    operations=[migrations.AddField(model_name='profile',name='theme_presets',field=models.JSONField(blank=True,default=list))]
