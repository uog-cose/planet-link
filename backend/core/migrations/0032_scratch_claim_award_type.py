from django.db import migrations, models


def classify_existing_claims(apps, schema_editor):
    ScratchClaim = apps.get_model('core', 'ScratchClaim')
    # Historical claims created before award_type existed can safely identify the
    # legacy XP-only fallback by a positive XP amount. New physical/voucher/other
    # claims explicitly persist their award type from this migration onward.
    ScratchClaim.objects.filter(amount__gt=0).update(award_type='xp')


def remove_legacy_xp_fulfilments(apps, schema_editor):
    RewardFulfillment = apps.get_model('core', 'RewardFulfillment')
    RewardFulfillment.objects.filter(claim__award_type='xp').delete()


class Migration(migrations.Migration):
    dependencies = [('core', '0031_reward_fulfillment')]
    operations = [
        migrations.AddField(
            model_name='scratchclaim',
            name='award_type',
            field=models.CharField(default='other', max_length=20),
        ),
        migrations.RunPython(classify_existing_claims, migrations.RunPython.noop),
        migrations.RunPython(remove_legacy_xp_fulfilments, migrations.RunPython.noop),
    ]
