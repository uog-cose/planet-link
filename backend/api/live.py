import asyncio
import json
from asgiref.sync import sync_to_async
from django.http import StreamingHttpResponse
from django.views.decorators.http import require_GET

from .common import active_programme_for, ok, profile_for, user_can_access_programme
from core.models import Programme, Profile


@sync_to_async

def _programme_for_request(user, scope, requested_id):
    if scope == 'public':
        qs = Programme.objects.filter(active=True, status='active', public_enabled=True)
        if requested_id:
            try:
                return qs.filter(pk=int(requested_id)).first()
            except (TypeError, ValueError):
                return None
        return qs.order_by('name', 'id').first()
    if not user or not user.is_authenticated or not user.is_active:
        return None
    profile = Profile.objects.select_related('programme').filter(user=user).first()
    if not profile or profile.role not in {'youth', 'worker', 'admin'}:
        return None
    if requested_id:
        try:
            programme = Programme.objects.get(pk=int(requested_id), active=True, status='active')
        except (TypeError, ValueError, Programme.DoesNotExist):
            return None
        if not user_can_access_programme(user, programme):
            return None
        return programme
    return active_programme_for(profile)


@sync_to_async

def _revision(programme_id, profile_id=None):
    programme = Programme.objects.filter(pk=programme_id).values('updated_at').first()
    if not programme:
        return None
    value = programme['updated_at']
    if profile_id:
        profile = Profile.objects.filter(pk=profile_id, programme_id=programme_id).values('updated_at').first()
        if profile and profile['updated_at'] and profile['updated_at'] > value:
            value = profile['updated_at']
    return value.isoformat() if value else None


def _sse(event, data):
    return f"event: {event}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


@require_GET
async def live_events(request):
    scope = str(request.GET.get('scope', 'dashboard')).strip().lower()
    if scope not in {'public', 'dashboard'}:
        return ok({'detail': 'Invalid live stream scope'}, 400)

    requested_id = request.GET.get('instanceId') or request.GET.get('programmeId')
    programme = await _programme_for_request(request.user, scope, requested_id)
    if not programme:
        return ok({'detail': 'Programme not available'}, 404 if scope == 'public' else 401)

    profile_id = None
    if scope == 'dashboard':
        profile = await sync_to_async(profile_for)(request)
        if not profile:
            return ok({'detail': 'Authentication required'}, 401)
        profile_id = profile.id if profile.role == 'youth' else None

    async def stream():
        current = await _revision(programme.id, profile_id)
        yield _sse('connected', {'programmeId': programme.id, 'revision': current})
        deadline = asyncio.get_running_loop().time() + 20
        while asyncio.get_running_loop().time() < deadline:
            await asyncio.sleep(2)
            latest = await _revision(programme.id, profile_id)
            if latest is None:
                yield _sse('programme-unavailable', {'programmeId': programme.id})
                break
            if latest != current:
                current = latest
                yield _sse('dashboard-changed', {'programmeId': programme.id, 'revision': latest})
            else:
                yield ': keep-alive\n\n'
        yield _sse('reconnect', {'programmeId': programme.id})

    response = StreamingHttpResponse(stream(), content_type='text/event-stream')
    response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    response['X-Accel-Buffering'] = 'no'
    response['Connection'] = 'keep-alive'
    response['Vary'] = 'Cookie'
    return response
