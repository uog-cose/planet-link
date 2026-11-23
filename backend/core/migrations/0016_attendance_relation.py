from django.db import migrations
class Migration(migrations.Migration):
    dependencies=[('core','0015_attendance_and_programmes')]
    operations=[migrations.AlterField(model_name='attendance',name='participant',field=__import__('django.db.models',fromlist=['ForeignKey']).ForeignKey(on_delete=__import__('django.db.models.deletion',fromlist=['CASCADE']).CASCADE,related_name='attendances',to='core.profile'))]
