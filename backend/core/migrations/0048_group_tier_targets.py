from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('core', '0047_skill_activity_url')]
    operations = [
        migrations.AddField(
            model_name='group',
            name='tier_targets',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
