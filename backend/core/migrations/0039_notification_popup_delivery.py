from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[("core","0038_notification_sounds")]
    operations=[migrations.AddField(model_name="notification",name="popup_delivered_at",field=models.DateTimeField(blank=True,null=True))]
