from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0045_idempotency_records')]
    operations=[
        migrations.AddField(
            model_name='pointawardrequest',
            name='rejection_reason',
            field=models.CharField(blank=True,default='',max_length=500),
        ),
    ]
