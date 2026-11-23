from django.db import migrations, models
import django.db.models.deletion
import uuid

class Migration(migrations.Migration):
    dependencies=[('core','0034_notifications_default_on')]
    operations=[
        migrations.AddField(model_name='challenge',name='game_config',field=models.JSONField(blank=True,default=dict)),
        migrations.CreateModel(name='GameAttempt',fields=[
            ('id',models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),
            ('status',models.CharField(choices=[('started','Started'),('completed','Completed'),('rejected','Rejected')],default='started',max_length=20)),
            ('raw_score',models.FloatField(blank=True,null=True)),
            ('score_unit',models.CharField(blank=True,max_length=20)),
            ('performance',models.FloatField(blank=True,null=True)),
            ('xp_awarded',models.PositiveIntegerField(default=0)),
            ('started_at',models.DateTimeField(auto_now_add=True)),
            ('completed_at',models.DateTimeField(blank=True,null=True)),
            ('client_duration_ms',models.PositiveIntegerField(blank=True,null=True)),
            ('challenge_data',models.JSONField(default=dict)),
            ('assignment',models.ForeignKey(on_delete=models.deletion.PROTECT,related_name='attempts',to='core.gameassignment')),
            ('game',models.ForeignKey(on_delete=models.deletion.PROTECT,related_name='attempts',to='core.challenge')),
            ('profile',models.ForeignKey(on_delete=models.deletion.CASCADE,related_name='game_attempts',to='core.profile')),
        ],options={'indexes':[models.Index(fields=['profile','game','started_at'],name='core_gameat_profile_game_7e4e4c_idx'),models.Index(fields=['assignment','status'],name='core_gameat_assign_status_8d4e65_idx')]}),
    ]
