from .common import *
from django.core.files.uploadedfile import UploadedFile
import re
from urllib.parse import quote as urlquote
from urllib.request import Request as UrlRequest, urlopen
import json as pyjson

@require_http_methods(['GET'])
def map_event_lookup(request):
    actor=require_role(request,['worker','admin'])
    if not actor:return ok({'detail':'Forbidden'},403)
    postcode=str(request.GET.get('postcode','')).strip().upper()
    if not re.fullmatch(r'[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}', postcode):
        return ok({'detail':'Enter a valid UK postcode.'},400)
    try:
        pc_req=UrlRequest(f'https://api.postcodes.io/postcodes/{urlquote(postcode)}',headers={'User-Agent':'YouthQuest/1.0'})
        with urlopen(pc_req,timeout=8) as response: pc=pyjson.load(response)
        result=pc.get('result') or {}
        canonical=str(result.get('postcode') or postcode).upper()
        places=[]
        # Postcodes.io returns the postcode centroid, not a property list. Use a configured
        # authoritative address provider when available, then fall back to mapped OSM addresses.
        places_key=os.getenv('OS_PLACES_API_KEY','').strip()
        if places_key:
            try:
                places_req=UrlRequest(f'https://api.os.uk/search/places/v1/find?query={urlquote(canonical)}&maxresults=100&key={urlquote(places_key)}',headers={'Accept':'application/json','User-Agent':'YouthQuest/1.0 (event map address lookup)'})
                with urlopen(places_req,timeout=10) as response: os_data=pyjson.load(response)
                for item in (os_data.get('results') or []):
                    d=item.get('DPA') or {}; lat=d.get('LAT'); lng=d.get('LNG')
                    parts=[d.get('BUILDING_NAME') or d.get('BUILDING_NUMBER'),d.get('THOROUGHFARE_NAME'),d.get('POST_TOWN') or d.get('POSTAL_TOWN'),d.get('POSTCODE') or canonical]
                    display=', '.join(str(x).strip() for x in parts if x)
                    if display and lat is not None and lng is not None: places.append({'display_name':display,'lat':float(lat),'lon':float(lng),'type':'address'})
            except Exception: places=[]
        if not places:
            try:
                nm_req=UrlRequest(f'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=50&countrycodes=gb&q={urlquote(canonical)}',headers={'Accept':'application/json','User-Agent':'YouthQuest/1.0 (event map address lookup)'})
                with urlopen(nm_req,timeout=10) as response: raw_places=pyjson.load(response)
                canonical_compact=canonical.replace(' ','').upper()
                places=[x for x in (raw_places if isinstance(raw_places,list) else []) if (x.get('address') or {}).get('postcode','').replace(' ','').upper()==canonical_compact]
            except Exception: places=[]
        if not places:
            try:
                compact=canonical.replace(' ','').upper()
                overpass='[out:json][timeout:12];(node[\"addr:postcode\"~\"^'+canonical.replace(' ','\\s*')+'$\",i];way[\"addr:postcode\"~\"^'+canonical.replace(' ','\\s*')+'$\",i];relation[\"addr:postcode\"~\"^'+canonical.replace(' ','\\s*')+'$\",i];);out center tags;'
                req=UrlRequest('https://overpass-api.de/api/interpreter',data=('data='+urlquote(overpass)).encode(),headers={'Content-Type':'application/x-www-form-urlencoded','User-Agent':'YouthQuest/1.0 (event map address lookup)'})
                with urlopen(req,timeout=15) as response: over=pyjson.load(response)
                for item in (over.get('elements') or []):
                    tags=item.get('tags') or {}; lat=item.get('lat') or (item.get('center') or {}).get('lat'); lon=item.get('lon') or (item.get('center') or {}).get('lon')
                    if lat is None or lon is None: continue
                    parts=[tags.get('addr:unit'),tags.get('addr:housenumber'),tags.get('addr:street'),tags.get('addr:city') or tags.get('addr:town'),tags.get('addr:postcode') or canonical]
                    display=', '.join(str(x).strip() for x in parts if x)
                    if display: places.append({'display_name':display,'lat':float(lat),'lon':float(lon),'type':'address'})
            except Exception: pass
            seen=set(); places=[x for x in places if not (x.get('display_name') in seen or seen.add(x.get('display_name')))]
        return ok({'postcode':canonical,'lat':float(result.get('latitude')),'lng':float(result.get('longitude')),'suggestions':places,'fallbackLocation':result.get('admin_ward') or result.get('admin_district') or result.get('region') or ''})
    except Exception as exc:
        return ok({'detail':'Unable to find addresses for that postcode right now.'},502)

@require_http_methods(["GET","POST","PATCH"])
def map_event(request):
    actor=require_role(request,['worker','admin']) if request.method in ['POST','PATCH'] else profile_for(request)
    programme=active_programme_for(profile_for(request))
    if request.method=='GET':
        if not programme:return ok({'events':[],'lastEvent':None,'currentEvent':None,'nextEvent':None})
        summary=event_summary(programme, include_map=True)
        events=[event_payload(e, include_map=True, include_attendance_config=bool(actor and actor.role in ['worker','admin'])) for e in MapEvent.objects.filter(programme=programme).order_by('-start_at','-id')[:20]]
        return ok({'events':events,'mapAccess':{'instanceId':programme.id,'token':programme.public_map_token,'expiresAt':programme.public_map_token_expires_at},**summary})
    if not actor: return ok({'detail':'Forbidden'},403)
    if not programme:return ok({'detail':'No active programme'},400)
    body=parse_json(request) or {}
    if request.method=='PATCH' and str(body.get('action','')).lower()=='toggle-pin':
        try:event=MapEvent.objects.get(pk=int(body.get('id')),programme=programme)
        except (TypeError,ValueError,MapEvent.DoesNotExist):return ok({'detail':'Event not found'},404)
        event.pin_enabled=bool(body.get('pinEnabled',True)); event.save(update_fields=['pin_enabled'])
        AuditLog.objects.create(actor=request.user,action='map_event_pin_toggled',target=str(event.id),detail={'pinEnabled':event.pin_enabled})
        return ok({'event':event_payload(event,include_map=True)})
    if request.method=='PATCH' and str(body.get('action','')).lower()=='cancel':
        try:event=MapEvent.objects.get(pk=int(body.get('id')),programme=programme)
        except (TypeError,ValueError,MapEvent.DoesNotExist):return ok({'detail':'Event not found'},404)
        if event.status == 'cancelled': return ok({'event':event_payload(event,include_map=True,include_attendance_config=True)})
        if event.ended_at or (event.end_at and event.end_at <= timezone.now()): return ok({'detail':'Completed events cannot be cancelled. Correct attendance records if needed.'},400)
        event.status='cancelled'; event.save(update_fields=['status'])
        AttendanceSession.objects.filter(event=event, active=True).update(active=False)
        AuditLog.objects.create(actor=request.user,action='map_event_cancelled',target=str(event.id),detail={})
        return ok({'event':event_payload(event,include_map=True,include_attendance_config=True),**event_summary(programme,include_map=True)})
    if request.method=='POST' and str(body.get('action','')).lower()=='private-link':
        programme=active_programme_for(actor)
        if not programme:return ok({'detail':'No active programme'},400)
        access_code=str(body.get('accessCode','')).strip().upper()
        if not re.fullmatch(r'[A-Z0-9]{6,16}', access_code):
            return ok({'detail':'Map access key must be 6–16 letters/numbers, with no spaces.'},400)
        if Programme.objects.filter(public_map_token=access_code).exclude(pk=programme.pk).exists():
            return ok({'detail':'That map access key is already in use. Choose another.'},409)
        programme.public_map_token=access_code
        expires_raw=str(body.get('expiresAt','')).strip()
        if expires_raw:
            try:
                parsed=timezone.datetime.fromisoformat(expires_raw.replace('Z','+00:00'))
                expires_at=timezone.make_aware(parsed,timezone.get_current_timezone()) if timezone.is_naive(parsed) else parsed
            except (TypeError,ValueError):
                return ok({'detail':'Choose a valid map expiry date and time.'},400)
            if expires_at <= timezone.now():
                return ok({'detail':'Map expiry must be in the future.'},400)
        else:
            try:
                hours=max(1,int(body.get('hours',24) or 24))
            except (TypeError,ValueError):
                hours=24
            expires_at=timezone.now()+timedelta(hours=hours)
        programme.public_map_token_expires_at=expires_at
        programme.save(update_fields=['public_map_token','public_map_token_expires_at','updated_at'])
        AuditLog.objects.create(actor=request.user,action='private_map_link_generated',target=str(programme.id),detail={'expiresAt':str(programme.public_map_token_expires_at)})
        return ok({'token':programme.public_map_token,'expiresAt':programme.public_map_token_expires_at})
    try: lat=float(body.get('lat')); lng=float(body.get('lng'))
    except (TypeError,ValueError): return ok({'detail':'Invalid map coordinates'},400)
    if not -90<=lat<=90 or not -180<=lng<=180:return ok({'detail':'Invalid map coordinates'},400)
    def dt(v):
        if not v:return None
        if str(v).strip().upper()=='NOW': return timezone.now()
        try:
            raw=str(v).strip()
            parsed=timezone.datetime.fromisoformat(raw.replace('Z','+00:00'))
            # CalendarField intentionally sends a timezone-free local date/time.
            # Interpret that value in Django's configured timezone; never silently
            # reinterpret it as UTC and shift the event to another wall-clock time.
            return timezone.make_aware(parsed,timezone.get_current_timezone()) if timezone.is_naive(parsed) else parsed
        except Exception:
            return None
    if request.method=='PATCH':
        try:event=MapEvent.objects.get(pk=int(body.get('id')),programme=programme)
        except (TypeError,ValueError,MapEvent.DoesNotExist):return ok({'detail':'Event not found'},404)
    else:event=MapEvent(programme=programme)
    event.title=str(body.get('title','Upcoming event')).strip()[:120] or 'Upcoming event'
    event.description=str(body.get('description','')).strip()[:240]
    event.location_name=str(body.get('locationName','')).strip()[:180]
    event.postcode=str(body.get('postcode','')).strip().upper()[:16]
    if event.postcode and not __import__('re').fullmatch(r'[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}', event.postcode):
        return ok({'detail':'Enter a valid UK postcode or leave it blank.'},400)
    event.address=str(body.get('address','')).strip()[:240]
    event.lat=lat; event.lng=lng
    event.start_at=dt(body.get('startAt')) or timezone.now()
    event.end_at=dt(body.get('endAt')) or (event.start_at + timedelta(hours=24))
    event.visible=bool(body.get('visible',True)); event.pin_enabled=bool(body.get('pinEnabled',True))
    now=timezone.now()
    if not event.start_at:return ok({'detail':'Start date and time are required'},400)
    # NOW is resolved on the server at final submission time; never reject it as stale.
    raw_start=str(body.get('startAt','')).strip().upper()
    if raw_start!='NOW' and event.start_at < now.replace(second=0,microsecond=0):return ok({'detail':'Start date and time has already passed'},400)
    if not event.end_at:return ok({'detail':'End date and time are required'},400)
    if event.end_at<=event.start_at:return ok({'detail':'End date and time must be after the start date and time'},400)
    event.status = 'ended' if event.ended_at or event.end_at <= now else 'scheduled'
    event.save()
    event_summary(programme)
    AuditLog.objects.create(actor=request.user,action='map_event_saved',target=str(event.id),detail={'lat':lat,'lng':lng,'startAt':str(event.start_at),'endAt':str(event.end_at)})
    return ok({'event':event_payload(event, include_map=True, include_attendance_config=True),**event_summary(programme, include_map=True)})

@require_http_methods(['POST'])
def map_event_end(request):
    actor=require_role(request,['worker','admin'])
    if not actor:return ok({'detail':'Forbidden'},403)
    body=parse_json(request) or {}; programme=active_programme_for(actor)
    try:event=MapEvent.objects.get(pk=int(body.get('id')),programme=programme)
    except (TypeError,ValueError,MapEvent.DoesNotExist):return ok({'detail':'Event not found'},404)
    event.ended_at=timezone.now(); event.status='ended'; event.save(update_fields=['ended_at','status'])
    AuditLog.objects.create(actor=request.user,action='map_event_ended',target=str(event.id),detail={})
    return ok({'event':event_payload(event, include_map=True, include_attendance_config=True),**event_summary(programme, include_map=True)})

