from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0006_points_and_limits')]
    operations=[
        migrations.AddField(model_name='challenge',name='start_at',field=models.DateTimeField(blank=True,null=True)),
        migrations.AddField(model_name='challenge',name='end_at',field=models.DateTimeField(blank=True,null=True)),
        migrations.AddField(model_name='reward',name='start_at',field=models.DateTimeField(blank=True,null=True)),
        migrations.AddField(model_name='reward',name='end_at',field=models.DateTimeField(blank=True,null=True)),
    ]
