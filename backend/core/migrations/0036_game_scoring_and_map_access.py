from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0035_benchmark_games')]
    operations=[
        migrations.AddField(model_name='challenge',name='scoring_policy',field=models.CharField(choices=[('best','Best attempt'),('last','Last attempt')],default='best',max_length=10)),
        migrations.AddField(model_name='programme',name='public_map_token',field=models.CharField(blank=True,default='',max_length=160)),
        migrations.AddField(model_name='programme',name='public_map_token_expires_at',field=models.DateTimeField(blank=True,null=True)),
    ]
