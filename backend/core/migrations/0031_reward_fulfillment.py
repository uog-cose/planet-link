from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('core','0030_reward_fallback_xp')]
    operations=[
        migrations.CreateModel(
            name='RewardFulfillment',
            fields=[
                ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
                ('status',models.CharField(choices=[('pending','Pending'),('fulfilled','Fulfilled')],default='pending',max_length=20)),
                ('fulfilled_at',models.DateTimeField(blank=True,null=True)),
                ('notes',models.CharField(blank=True,max_length=240)),
                ('created_at',models.DateTimeField(auto_now_add=True)),
                ('claim',models.OneToOneField(on_delete=django.db.models.deletion.CASCADE,related_name='fulfillment',to='core.scratchclaim')),
                ('fulfilled_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.SET_NULL,related_name='reward_fulfillments',to='auth.user')),
            ],
        ),
    ]
