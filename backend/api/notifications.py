from .common import *
import asyncio, json
from asgiref.sync import sync_to_async
from django.http import StreamingHttpResponse
from django.views.decorators.http import require_GET
from django.db import transaction

@require_http_methods(["GET", "POST", "DELETE"])
@auth_required
def notifications(request):
    p = profile_for(request); programme=active_programme_for(p)
    days=max(1,int(programme.notification_retention_days if programme else 30)); cutoff=timezone.now()-timedelta(days=days)
    p.notifications.filter(created_at__lt=cutoff).delete()
    if not p.notifications_opt_in:
        return ok({'items':[],'retentionDays':days,'optIn':False})
    if request.method == 'DELETE':
        raw_id=request.GET.get('id') or (parse_json(request) or {}).get('id')
        if raw_id not in (None,''):
            try: p.notifications.filter(id=int(raw_id)).delete()
            except (TypeError,ValueError): return ok({'detail':'Invalid notification id'},400)
            return ok({'ok':True,'retentionDays':days,'optIn':True})
        p.notifications.all().delete()
        return ok({'items':[],'retentionDays':days,'optIn':True})
    if request.method == "POST": p.notifications.filter(read=False).update(read=True)
    return ok({"items": list(p.notifications.order_by("-created_at").values("id", "title", "body", "kind", "url", "read", "created_at")),"retentionDays":days,'optIn':True})

@require_http_methods(["GET"])
@auth_required
def notification_pending_popups(request):
    p=profile_for(request); programme=active_programme_for(p)
    if not p.notifications_opt_in:
        return ok({"items":[]})
    kinds={"xp","penalty","reward","achievement","level","attendance","skill","game","approval","group","help"}
    items=list(p.notifications.filter(popup_delivered_at__isnull=True,kind__in=kinds).order_by("created_at","id")[:50].values("id","title","body","kind","url","created_at"))
    return ok({"items":items})

@require_http_methods(["POST"])
@auth_required
def notification_popup_delivered(request):
    p=profile_for(request)
    body=parse_json(request) or {}
    ids=body.get("ids") if isinstance(body.get("ids"),list) else []
    try: ids=list({int(x) for x in ids})
    except (TypeError,ValueError): return ok({"detail":"Invalid notification ids"},400)
    if not ids: return ok({"updated":0})
    # Lock eligible rows before returning them so concurrent tabs cannot both
    # successfully claim the same popup (row locks on PostgreSQL).
    with transaction.atomic():
        qs=p.notifications.select_for_update().filter(id__in=ids,popup_delivered_at__isnull=True)
        claimed_items=list(qs.order_by('created_at','id').values('id','title','body','kind','url','created_at'))
        claimed=[int(x['id']) for x in claimed_items]
        if claimed:
            p.notifications.filter(id__in=claimed,popup_delivered_at__isnull=True).update(popup_delivered_at=timezone.now())
    return ok({"updated":len(claimed),"ids":claimed,"items":claimed_items})

@require_http_methods(["GET","POST"])
@auth_required
def notification_settings(request):
    p=profile_for(request)
    if request.method=='GET': return ok({'optIn':bool(p.notifications_opt_in),'pushOptIn':bool(p.push_notifications_opt_in),'pushConfigured':bool(CONFIG.vapid_public_key)})
    body=parse_json(request) or {}
    if 'optIn' in body: p.notifications_opt_in=bool(body.get('optIn'))
    if 'pushOptIn' in body: p.push_notifications_opt_in=bool(body.get('pushOptIn')) and bool(CONFIG.vapid_public_key)
    if not p.notifications_opt_in: p.push_notifications_opt_in=False
    p.save(update_fields=['notifications_opt_in','push_notifications_opt_in'])
    if not p.notifications_opt_in: p.notifications.all().delete()
    if not p.notifications_opt_in or not p.push_notifications_opt_in: PushSubscription.objects.filter(profile=p).update(active=False)
    return ok({'optIn':p.notifications_opt_in,'pushOptIn':p.push_notifications_opt_in,'pushConfigured':bool(CONFIG.vapid_public_key)})

@require_http_methods(["GET"])
@auth_required
def push_config(request): return ok({'publicKey':CONFIG.vapid_public_key})

@require_http_methods(["POST","DELETE"])
@auth_required
def push_subscription(request):
    p=profile_for(request)
    if request.method=='DELETE':
        body=parse_json(request) or {}; endpoint=str(body.get('endpoint',''))
        if endpoint: PushSubscription.objects.filter(profile=p,endpoint=endpoint).update(active=False)
        return ok({'ok':True})
    if not p.notifications_opt_in:return ok({'detail':'Enable Youth Quest notifications before enabling phone notifications'},400)
    body=parse_json(request) or {}; sub=body.get('subscription') or {}; endpoint=str(sub.get('endpoint','')).strip(); keys=sub.get('keys') or {}
    p256dh=str(keys.get('p256dh','')); auth=str(keys.get('auth',''))
    if not endpoint or len(endpoint)>1000 or not p256dh or not auth:return ok({'detail':'Invalid push subscription'},400)
    if not CONFIG.vapid_public_key or not CONFIG.vapid_private_key:return ok({'detail':'Phone notifications are not configured on this server'},503)
    existing=PushSubscription.objects.filter(endpoint=endpoint).first()
    if existing and existing.profile_id != p.id:
        return ok({'detail':'This push subscription is already registered to another account'},409)
    PushSubscription.objects.update_or_create(endpoint=endpoint,defaults={'profile':p,'p256dh':p256dh,'auth':auth[:255],'user_agent':request.META.get('HTTP_USER_AGENT','')[:500],'active':True})
    p.push_notifications_opt_in=True; p.notifications_opt_in=True; p.save(update_fields=['push_notifications_opt_in','notifications_opt_in'])
    return ok({'ok':True})



@require_http_methods(["GET"])
@auth_required
def approval_counts(request):
    actor=profile_for(request)
    programme=active_programme_for(actor)
    if not programme:
        return ok({'total':0,'publicPoints':0,'pointAwards':0,'accountDeletions':0})
    if actor.role=='admin':
        point_awards=PointAwardRequest.objects.filter(status='pending',target__programme=programme).count()
        public_points=PublicPointRequest.objects.filter(status='pending',target__programme=programme).count()
        account_deletions=Profile.objects.filter(deletion_requested=True,programme=programme,user__is_active=True).count()
    elif actor.role=='worker':
        point_awards=PointAwardRequest.objects.filter(status='pending',target__programme=programme,requested_by=request.user).count()
        public_points=0
        account_deletions=0
    else:
        point_awards=public_points=account_deletions=0
    # Workers also need a visible badge for public-member point submissions waiting for review.
    # Keep the total scoped to the approvals surfaced from the points workspace.
    total = point_awards + public_points
    return ok({'total':total,'publicPoints':public_points,'pointAwards':point_awards,'accountDeletions':account_deletions})

@require_http_methods(["GET","POST","DELETE"])
def notification_sounds(request):
    actor=profile_for(request)
    if not actor:
        return ok({"detail":"Forbidden"},403)
    if request.method == 'GET' and actor.role == 'youth':
        programme=active_programme_for(actor)
        if not programme:return ok({"items":[]},400)
        return ok({"items":[{"id":x.id,"name":x.name,"category":x.category,"url":x.file.url} for x in programme.notification_sounds.filter(active=True).order_by("category","name") ]})
    if actor.role not in ("admin","worker"):
        return ok({"detail":"Forbidden"},403)
    programme=active_programme_for(actor)
    if not programme:return ok({"items":[]},400)
    if request.method=="GET":
        return ok({"items":[{"id":x.id,"name":x.name,"category":x.category,"url":x.file.url} for x in programme.notification_sounds.filter(active=True).order_by("category","name") ]})
    if request.method=="DELETE":
        if actor.role != "admin": return ok({"detail":"Only admins can delete notification sounds"},403)
        body=parse_json(request) or {}; x=programme.notification_sounds.filter(id=body.get("id"),active=True).first()
        if not x:return ok({"detail":"Sound not found"},404)
        x.active=False;x.save(update_fields=["active"]);return ok({"ok":True})
    if actor.role!="admin":return ok({"detail":"Only admins can upload notification sounds"},403)
    f=request.FILES.get("file"); category=str(request.POST.get("category","positive")); name=str(request.POST.get("name","")).strip()[:120]
    if not f:return ok({"detail":"Choose an audio file"},400)
    if category not in {"positive","negative","bravo","motivation"}:return ok({"detail":"Invalid sound category"},400)
    if f.size>1572864:return ok({"detail":"Sound must be 1.5 MB or smaller"},400)
    allowed_types={"audio/wav","audio/x-wav","audio/mpeg","audio/ogg","audio/webm","application/octet-stream"}; allowed_ext={'.wav','.mp3','.ogg','.webm'}
    import os
    ext=os.path.splitext(f.name or '')[1].lower()
    if getattr(f,"content_type","") not in allowed_types or ext not in allowed_ext:return ok({"detail":"Use WAV, MP3, OGG or WebM audio"},400)
    x=NotificationSound.objects.create(programme=programme,name=name or f.name[:120],category=category,file=f)
    AuditLog.objects.create(actor=request.user,action="notification_sound_uploaded",target=str(x.id),detail={"category":category,"name":x.name})
    return ok({"id":x.id,"name":x.name,"category":x.category,"url":x.file.url},201)


@require_GET
async def notification_events(request):
    """SSE notifications with in-process wake-ups and 30s database reconciliation.

    No Redis and no per-second database polling. In-process events deliver quickly;
    durable rows are reconciled on connect and every 30 seconds to cover reconnects
    and multi-process deployments.
    """
    from .common import profile_for
    from core.notification_events import subscribe, unsubscribe
    profile = await sync_to_async(profile_for)(request)
    if not profile:
        response = StreamingHttpResponse(iter(["event: auth-required\ndata: {}\n\n"]), content_type="text/event-stream")
        response["Cache-Control"] = "no-store"
        return response
    if not profile.notifications_opt_in:
        response = StreamingHttpResponse(iter(["event: notifications-disabled\ndata: {}\n\n"]), content_type="text/event-stream")
        response["Cache-Control"] = "no-store"
        return response
    profile_id = int(profile.id)

    @sync_to_async
    def get_pending(ids=None):
        kinds = {"xp", "penalty", "reward", "achievement", "level", "attendance", "skill", "game", "approval", "group", "help"}
        qs = Notification.objects.filter(profile_id=profile_id, popup_delivered_at__isnull=True, kind__in=kinds)
        if ids:
            qs = qs.filter(id__in=ids)
        return list(qs.order_by("created_at", "id")[:50].values("id", "title", "body", "kind", "url", "created_at"))

    def serialize(items):
        for item in items:
            item["created_at"] = item["created_at"].isoformat() if item.get("created_at") else None
        return json.dumps(items, separators=(",", ":"))

    async def stream():
        channel = subscribe(profile_id)
        loop = asyncio.get_running_loop()
        last_reconcile = 0.0
        last_heartbeat = 0.0
        try:
            yield "retry: 3000\n: connected\n\n"
            while True:
                now = loop.time()
                # Reconcile immediately on connect, then at most every 30 seconds.
                if now - last_reconcile >= 30:
                    items = await get_pending()
                    if items:
                        yield f"event: notification\ndata: {serialize(items)}\n\n"
                    last_reconcile = loop.time()
                try:
                    notification_id = await asyncio.to_thread(channel.get, True, 10)
                    items = await get_pending([notification_id])
                    if items:
                        yield f"event: notification\ndata: {serialize(items)}\n\n"
                except __import__('queue').Empty:
                    pass
                now = loop.time()
                if now - last_heartbeat >= 15:
                    yield ": keep-alive\n\n"
                    last_heartbeat = now
        except asyncio.CancelledError:
            raise
        finally:
            unsubscribe(profile_id, channel)

    response = StreamingHttpResponse(stream(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache, no-store, no-transform"
    response["X-Accel-Buffering"] = "no"
    response["Connection"] = "keep-alive"
    return response
