from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0008_drawing_games_scratch_awards')]
    operations=[migrations.AddField(model_name='challenge',name='retries_per_player',field=models.PositiveIntegerField(default=3))]
