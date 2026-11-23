from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[("core","0037_map_address_edinburgh_defaults")]
    operations=[migrations.CreateModel(name="NotificationSound",fields=[("id",models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name="ID")),("name",models.CharField(max_length=120)),("category",models.CharField(choices=[("positive","Positive"),("negative","Negative"),("bravo","Bravo"),("motivation","Motivation")],max_length=20)),("file",models.FileField(upload_to="notification-sounds/%Y/%m/")),("active",models.BooleanField(default=True)),("created_at",models.DateTimeField(auto_now_add=True)),("programme",models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name="notification_sounds",to="core.programme"))])]
