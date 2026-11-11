from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0010_drawing_submission_game')]
    operations=[
        migrations.AddField(model_name='mapevent',name='location_name',field=models.CharField(blank=True,max_length=180)),
        migrations.AddField(model_name='mapevent',name='start_at',field=models.DateTimeField(blank=True,null=True)),
        migrations.AddField(model_name='mapevent',name='end_at',field=models.DateTimeField(blank=True,null=True)),
        migrations.AddField(model_name='mapevent',name='ended_at',field=models.DateTimeField(blank=True,null=True)),
        migrations.AddField(model_name='mapevent',name='status',field=models.CharField(choices=[('scheduled','Scheduled'),('current','Current'),('ended','Ended'),('cancelled','Cancelled')],default='scheduled',max_length=20)),
    ]
