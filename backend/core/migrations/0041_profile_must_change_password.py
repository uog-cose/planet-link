from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0040_public_point_requests')]
    operations=[migrations.AddField(model_name='profile',name='must_change_password',field=models.BooleanField(default=False))]
