from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('core','0021_skills_public_notifications')]
    operations=[migrations.CreateModel(name='SkillAssignment',fields=[
        ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
        ('assigned_at',models.DateTimeField(auto_now_add=True)),('active',models.BooleanField(default=True)),
        ('assigned_by',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='skill_assignments_created',to='auth.user')),
        ('skill',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='assignments',to='core.skill')),
        ('target_group',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.CASCADE,related_name='skill_assignments',to='core.group')),
        ('target_profile',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.CASCADE,related_name='skill_assignments',to='core.profile')),
    ],),
    migrations.AddConstraint(model_name='skillassignment',constraint=models.CheckConstraint(condition=models.Q(('target_profile__isnull',False))|models.Q(('target_group__isnull',False)),name='skill_assignment_has_target')),
    migrations.AddConstraint(model_name='skillassignment',constraint=models.CheckConstraint(condition=~(models.Q(('target_profile__isnull',False))&models.Q(('target_group__isnull',False))),name='skill_assignment_one_target')),
    migrations.AddConstraint(model_name='skillassignment',constraint=models.UniqueConstraint(condition=models.Q(('active',True),('target_profile__isnull',False)),fields=('skill','target_profile'),name='unique_active_skill_profile')),
    migrations.AddConstraint(model_name='skillassignment',constraint=models.UniqueConstraint(condition=models.Q(('active',True),('target_group__isnull',False)),fields=('skill','target_group'),name='unique_active_skill_group')),
    ]
