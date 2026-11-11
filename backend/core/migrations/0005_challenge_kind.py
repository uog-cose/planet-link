from django.db import migrations, models
class Migration(migrations.Migration):
 dependencies=[('core','0004_theme_milestones_accounts_groups_games')]
 operations=[migrations.AddField(model_name='challenge',name='kind',field=models.CharField(default='activity',max_length=30))]
