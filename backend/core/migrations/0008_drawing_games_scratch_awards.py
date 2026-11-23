from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0007_game_schedules')]
    operations=[
        migrations.AddField(model_name='challenge',name='shape',field=models.CharField(default='circle',max_length=20)),
        migrations.AddField(model_name='challenge',name='score_ranges',field=models.JSONField(blank=True,default=list)),
        migrations.AddField(model_name='reward',name='awards',field=models.JSONField(blank=True,default=list)),
        migrations.CreateModel(name='ScratchClaim',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('award_name',models.CharField(max_length=120)),('amount',models.PositiveIntegerField(default=0)),('claimed_at',models.DateTimeField(auto_now_add=True)),
            ('profile',models.ForeignKey(on_delete=models.deletion.CASCADE,related_name='scratch_claims',to='core.profile')),
            ('reward',models.ForeignKey(on_delete=models.deletion.CASCADE,related_name='claims',to='core.reward')),
        ]),
    ]
