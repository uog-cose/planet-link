from django.db import migrations, models
import core.models


class Migration(migrations.Migration):
    dependencies = [("core", "0053_consolidate_event_attendance")]

    operations = [
        migrations.AddField(
            model_name="programme", name="attendance_config",
            field=models.JSONField(blank=True, default=core.models.default_attendance_config),
        ),
        migrations.AddField(
            model_name="group", name="attendance_days",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name="profile", name="attendance_days",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
    ]
