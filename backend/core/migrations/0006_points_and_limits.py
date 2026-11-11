from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0005_challenge_kind')]
    operations=[
        migrations.AddField(model_name='programme',name='max_worker_points',field=models.PositiveIntegerField(default=100)),
        migrations.CreateModel(name='PointAwardRequest',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('amount',models.PositiveIntegerField()),('reason',models.CharField(max_length=240)),
            ('status',models.CharField(choices=[('pending','Pending'),('approved','Approved'),('rejected','Rejected')],default='pending',max_length=20)),
            ('created_at',models.DateTimeField(auto_now_add=True)),('reviewed_at',models.DateTimeField(blank=True,null=True)),
            ('requested_by',models.ForeignKey(on_delete=models.deletion.PROTECT,related_name='point_award_requests',to='auth.user')),
            ('reviewed_by',models.ForeignKey(blank=True,null=True,on_delete=models.deletion.PROTECT,related_name='reviewed_point_awards',to='auth.user')),
            ('target',models.ForeignKey(on_delete=models.deletion.CASCADE,related_name='point_award_requests',to='core.profile')),
        ]),
    ]
