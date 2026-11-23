from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('core', '0048_group_tier_targets')]
    operations = [migrations.CreateModel(name='GroupTierUnlock', fields=[('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')), ('threshold', models.PositiveIntegerField()), ('tier_name', models.CharField(max_length=80)), ('prize', models.CharField(blank=True, max_length=160)), ('unlocked_at', models.DateTimeField(auto_now_add=True)), ('group', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tier_unlocks', to='core.group'))], options={'ordering': ['threshold', 'id']}), migrations.AddConstraint(model_name='grouptierunlock', constraint=models.UniqueConstraint(fields=('group', 'threshold'), name='unique_group_tier_unlock'))]
