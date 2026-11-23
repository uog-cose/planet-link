from django.db import migrations, models
import django.db.models.deletion
import uuid

class Migration(migrations.Migration):
    dependencies=[('core','0001_initial')]
    operations=[
        migrations.CreateModel(
            name='RefreshToken',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('token_hash', models.CharField(max_length=64, unique=True)),
                ('family_id', models.UUIDField(default=uuid.uuid4, db_index=True)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('last_used_at', models.DateTimeField(null=True, blank=True)),
                ('revoked_at', models.DateTimeField(null=True, blank=True)),
                ('replaced_by', models.UUIDField(null=True, blank=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='refresh_tokens', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='DrawingSubmission',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=120)),
                ('image_data', models.TextField()),
                ('score', models.PositiveIntegerField(default=0)),
                ('status', models.CharField(choices=[('submitted','Submitted'),('approved','Approved'),('rejected','Rejected')], default='submitted', max_length=20)),
                ('feedback', models.CharField(blank=True, max_length=300)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='drawing_submissions', to='core.profile')),
            ],
        ),
        migrations.AddIndex(model_name='refreshtoken', index=models.Index(fields=['user','expires_at'], name='core_refresht_user_exp_7e4b8d_idx')),
        migrations.AddIndex(model_name='drawingsubmission', index=models.Index(fields=['profile','created_at'], name='core_drawin_profile_8e5c3f_idx')),
    ]
