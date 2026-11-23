from django.db import migrations, models
import django.db.models.deletion
class Migration(migrations.Migration):
    dependencies=[('core','0003_qr_and_theme_features')]
    operations=[
      migrations.AddField(model_name='programme',name='theme_config',field=models.JSONField(blank=True,default=dict)),
      migrations.AddField(model_name='programme',name='milestones',field=models.JSONField(blank=True,default=list)),
      migrations.CreateModel(name='GameAssignment',fields=[
        ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),('assigned_at',models.DateTimeField(auto_now_add=True)),('due_at',models.DateTimeField(blank=True,null=True)),('active',models.BooleanField(default=True)),
        ('assigned_by',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='game_assignments',to='auth.user')),
        ('game',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='assignments',to='core.challenge')),
        ('target_group',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.CASCADE,related_name='game_assignments',to='core.group')),
        ('target_profile',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.CASCADE,related_name='game_assignments',to='core.profile'))])
    ]
