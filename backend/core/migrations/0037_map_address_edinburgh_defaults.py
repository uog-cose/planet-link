from django.db import migrations, models


def move_legacy_default_pins(apps, schema_editor):
    MapEvent = apps.get_model('core', 'MapEvent')
    MapEvent.objects.filter(lat=51.5074, lng=-0.1278).update(lat=55.9533, lng=-3.1883)


class Migration(migrations.Migration):
    dependencies = [('core', '0036_game_scoring_and_map_access')]
    operations = [
        migrations.AddField(model_name='mapevent', name='postcode', field=models.CharField(blank=True, max_length=16)),
        migrations.AddField(model_name='mapevent', name='address', field=models.CharField(blank=True, max_length=240)),
        migrations.AlterField(model_name='mapevent', name='lat', field=models.FloatField(default=55.9533)),
        migrations.AlterField(model_name='mapevent', name='lng', field=models.FloatField(default=-3.1883)),
        migrations.RunPython(move_legacy_default_pins, migrations.RunPython.noop),
    ]
