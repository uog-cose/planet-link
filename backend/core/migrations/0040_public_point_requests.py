from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('core','0039_notification_popup_delivery')]
    operations=[
        migrations.CreateModel(
            name='PublicPointRequest',
            fields=[
                ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
                ('name',models.CharField(max_length=80)),
                ('organisation',models.CharField(blank=True,max_length=1000)),
                ('comment',models.TextField(blank=True,max_length=500)),
                ('rating',models.PositiveSmallIntegerField()),
                ('status',models.CharField(choices=[('pending','Pending'),('approved','Approved'),('rejected','Rejected')],default='pending',max_length=20)),
                ('assigned_amount',models.PositiveIntegerField(blank=True,null=True)),
                ('created_at',models.DateTimeField(auto_now_add=True)),
                ('reviewed_at',models.DateTimeField(blank=True,null=True)),
                ('submitted_ip_hash',models.CharField(blank=True,max_length=64)),
                ('reviewed_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='reviewed_public_point_requests',to='auth.user')),
                ('target',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='public_point_requests',to='core.profile')),
            ],
        ),
        migrations.AddIndex(model_name='publicpointrequest',index=models.Index(fields=['target','status','created_at'],name='core_pubpoint_target_status_idx')),
    ]
