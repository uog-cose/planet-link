from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0024_skill_rewards_avatars_push')]

    operations = [
        migrations.AlterField(
            model_name='profile',
            name='push_notifications_opt_in',
            field=models.BooleanField(default=False, db_default=False),
        ),
    ]
