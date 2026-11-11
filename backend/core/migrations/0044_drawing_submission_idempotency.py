from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0043_profile_theme_presets')]
    operations=[migrations.AddField(model_name='drawingsubmission',name='client_request_id',field=models.CharField(blank=True,max_length=64,null=True,unique=True))]
