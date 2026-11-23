from django.db import migrations

def seed_rules(apps, schema_editor):
    Programme=apps.get_model('core','Programme')
    defaults=[{'days':3,'multiplier':1.3},{'days':7,'multiplier':1.5},{'days':14,'multiplier':2.0}]
    for p in Programme.objects.filter(streak_rules=[]):
        p.streak_rules=defaults; p.save(update_fields=['streak_rules'])

class Migration(migrations.Migration):
    dependencies=[('core','0017_scope_games_rewards')]
    operations=[migrations.RunPython(seed_rules,migrations.RunPython.noop)]
