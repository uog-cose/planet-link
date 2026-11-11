from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('core', '0029_xp_transaction_programme_scope')]
    operations = [
        migrations.AddField(
            model_name='reward',
            name='fallback_xp',
            field=models.PositiveIntegerField(default=10),
        ),
    ]
