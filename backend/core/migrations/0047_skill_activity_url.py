from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0046_point_award_rejection_reason')]
    operations=[migrations.AddField(model_name='skill',name='activity_url',field=models.URLField(blank=True,max_length=500))]
