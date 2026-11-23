from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[("core","0041_profile_must_change_password")]
    operations=[migrations.AddField(model_name="pointsqrtoken",name="token",field=models.CharField(default="",max_length=128))]
