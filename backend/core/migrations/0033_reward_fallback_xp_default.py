from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0032_scratch_claim_award_type')]
    operations=[migrations.AlterField(model_name='reward',name='fallback_xp',field=models.PositiveIntegerField(default=0))]
