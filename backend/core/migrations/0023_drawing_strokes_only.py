from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[("core","0022_skill_assignments")]
    operations=[
        migrations.RemoveField(model_name="drawingsubmission",name="image_data"),
        migrations.AddField(model_name="drawingsubmission",name="stroke_data",field=models.JSONField(default=list)),
    ]
