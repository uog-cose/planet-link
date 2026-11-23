from django.db import migrations, models
import django.db.models.deletion
import uuid

class Migration(migrations.Migration):
    dependencies=[('core','0002_security_drawing')]
    operations=[
        migrations.CreateModel(name='PasswordResetQr',fields=[
            ('id',models.UUIDField(default=uuid.uuid4,editable=False,primary_key=True,serialize=False)),
            ('token_hash',models.CharField(max_length=64,unique=True)),
            ('expires_at',models.DateTimeField()),
            ('used_at',models.DateTimeField(blank=True,null=True)),
            ('created_by',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='generated_password_reset_qrs',to='auth.user')),
            ('target',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='password_reset_qrs',to='auth.user')),
        ]),
        migrations.CreateModel(name='PointsQrToken',fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('token_hash',models.CharField(max_length=64,unique=True)),
            ('created_at',models.DateTimeField(auto_now_add=True)),
            ('active',models.BooleanField(default=True)),
            ('profile',models.OneToOneField(on_delete=django.db.models.deletion.CASCADE,related_name='points_qr',to='core.profile')),
        ]),
    ]
