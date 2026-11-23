from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('core','0009_drawing_retries')]
    operations=[migrations.AddField(model_name='drawingsubmission',name='game',field=models.ForeignKey(blank=True,null=True,on_delete=models.deletion.PROTECT,related_name='drawing_submissions',to='core.challenge'))]
