from django.db import migrations, models

def enable_existing_player_notifications(apps, schema_editor):
    Profile=apps.get_model('core','Profile')
    Profile.objects.filter(role='youth').update(notifications_opt_in=True)

class Migration(migrations.Migration):
    dependencies=[('core','0033_reward_fallback_xp_default')]
    operations=[migrations.AlterField(model_name='profile',name='notifications_opt_in',field=models.BooleanField(default=True)),migrations.RunPython(enable_existing_player_notifications,migrations.RunPython.noop)]
