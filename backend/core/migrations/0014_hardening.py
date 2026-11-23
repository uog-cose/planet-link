from django.db import migrations


def clean_programme_duplicates(apps, schema_editor):
    Group=apps.get_model('core','Group')
    # No destructive merge: duplicate milestone thresholds are invalidated to preserve admin intent.
    Programme=apps.get_model('core','Programme')
    for p in Programme.objects.all():
        if isinstance(p.milestones,list):
            seen=set(); cleaned=[]
            for m in sorted(p.milestones,key=lambda x:int(x.get('xp',0) or 0)):
                xp=int(m.get('xp',0) or 0)
                if xp in seen: continue
                seen.add(xp); cleaned.append(m)
            if cleaned != p.milestones:
                p.milestones=cleaned; p.save(update_fields=['milestones'])

class Migration(migrations.Migration):
    dependencies=[('core','0013_harden_assignments')]
    operations=[migrations.RunPython(clean_programme_duplicates,migrations.RunPython.noop)]
