from django.db import migrations, models
from django.utils import timezone


class Migration(migrations.Migration):
    dependencies = [('core', '0027_audit_programme_scope')]

    operations = [
        migrations.AddField(
            model_name='profile', name='updated_at',
            field=models.DateTimeField(default=timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='programme', name='updated_at',
            field=models.DateTimeField(default=timezone.now),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name='profile', name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
        migrations.AlterField(
            model_name='programme', name='updated_at',
            field=models.DateTimeField(auto_now=True),
        ),
    ]
