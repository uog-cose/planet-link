from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('core','0044_drawing_submission_idempotency')]
    operations=[
        migrations.CreateModel(
            name='IdempotencyRecord',
            fields=[
                ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
                ('request_key',models.CharField(max_length=64)),
                ('path',models.CharField(max_length=240)),
                ('status_code',models.PositiveSmallIntegerField()),
                ('content_type',models.CharField(default='application/json',max_length=160)),
                ('response_body',models.TextField()),
                ('created_at',models.DateTimeField(auto_now_add=True)),
                ('user',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='idempotency_records',to='auth.user')),
            ],
            options={'indexes':[models.Index(fields=['user','created_at'],name='core_idempo_user_id_3b5f9a_idx')], 'constraints':[models.UniqueConstraint(fields=('user','path','request_key'),name='unique_idempotency_request')]},
        ),
    ]
