from django.db import migrations, models
import django.db.models.deletion


def migrate_skill_milestones(apps, schema_editor):
    Skill = apps.get_model('core', 'Skill')
    SkillMilestone = apps.get_model('core', 'SkillMilestone')
    Reward = apps.get_model('core', 'Reward')
    ProfileSkill = apps.get_model('core', 'ProfileSkill')
    for skill in Skill.objects.all().iterator():
        raw = skill.milestones if isinstance(skill.milestones, list) else []
        created = []
        for order, item in enumerate(raw):
            if not isinstance(item, dict):
                continue
            name = str(item.get('name') or item.get('tier') or f'Milestone {order + 1}')[:100]
            try:
                progress = max(1, min(100, int(item.get('progress', item.get('percent', 0)) or 1)))
            except (TypeError, ValueError):
                progress = 0
            try:
                xp = max(0, min(5000, int(item.get('xp', 0) or 0)))
            except (TypeError, ValueError):
                xp = 0
            if any(existing.progress == progress for existing in created):
                continue
            reward_text = str(item.get('reward') or '').strip()[:240]
            reward = None
            if reward_text:
                reward, _ = Reward.objects.get_or_create(
                    programme=skill.programme,
                    name=f'{skill.name}: {name}'[:120],
                    defaults={'description': reward_text, 'cost_xp': 0, 'active': True},
                )
                if reward.description != reward_text:
                    reward.description = reward_text
                    reward.save(update_fields=['description'])
            milestone = SkillMilestone.objects.create(
                skill=skill, name=name, progress=progress, xp=xp,
                reward=reward, order=len(created),
            )
            created.append(milestone)
        for ps in ProfileSkill.objects.filter(skill=skill):
            old = ps.completed_milestones if isinstance(ps.completed_milestones, list) else []
            new = []
            for value in old:
                try:
                    idx = int(value)
                except (TypeError, ValueError):
                    continue
                if 0 <= idx < len(created):
                    new.append(created[idx].id)
            ps.completed_milestones = new
            ps.save(update_fields=['completed_milestones'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [('core', '0023_drawing_strokes_only')]
    operations = [
        migrations.AddField(
            model_name='profile', name='avatar_image',
            field=models.ImageField(blank=True, null=True, upload_to='avatars/%Y/%m/'),
        ),
        migrations.AddField(
            model_name='notification', name='url',
            field=models.CharField(blank=True, max_length=240),
        ),
        migrations.AddField(
            model_name='profile', name='push_notifications_opt_in',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='PushSubscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('endpoint', models.URLField(max_length=1000, unique=True)),
                ('p256dh', models.CharField(max_length=255)),
                ('auth', models.CharField(max_length=255)),
                ('user_agent', models.CharField(blank=True, max_length=500)),
                ('active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('profile', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='push_subscriptions', to='core.profile')),
            ],
        ),
        migrations.CreateModel(
            name='SkillMilestone',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('progress', models.PositiveSmallIntegerField(default=0)),
                ('xp', models.PositiveIntegerField(default=0)),
                ('order', models.PositiveIntegerField(default=0)),
                ('reward', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='skill_milestones', to='core.reward')),
                ('skill', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='milestone_records', to='core.skill')),
            ],
            options={'ordering': ['order', 'id']},
        ),
        migrations.AddConstraint(model_name='skillmilestone', constraint=models.UniqueConstraint(fields=('skill', 'order'), name='unique_skill_milestone_order')),
        migrations.AddConstraint(model_name='skillmilestone', constraint=models.UniqueConstraint(fields=('skill', 'progress'), name='unique_skill_milestone_progress')),
        migrations.RunPython(migrate_skill_milestones, noop_reverse),
        migrations.RemoveField(model_name='skill', name='milestones'),
    ]
