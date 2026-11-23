from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('core','0011_map_event_lifecycle')]
    operations=[
        migrations.CreateModel(
            name='RewardAssignment',
            fields=[
                ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
                ('assigned_at',models.DateTimeField(auto_now_add=True)),
                ('active',models.BooleanField(default=True)),
                ('assigned_by',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='reward_assignments_created',to='auth.user')),
                ('reward',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='assignments',to='core.reward')),
                ('target_group',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.CASCADE,related_name='reward_assignments',to='core.group')),
                ('target_profile',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.CASCADE,related_name='reward_assignments',to='core.profile')),
            ],
        ),
        migrations.AddConstraint(
            model_name='rewardassignment',
            constraint=models.CheckConstraint(condition=models.Q(('target_group__isnull',False),('target_profile__isnull',False),_connector='OR'),name='reward_assignment_has_target'),
        ),
    ]
