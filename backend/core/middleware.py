import json
import logging
import re
import uuid
from django.http import JsonResponse, HttpResponse
from django.db import IntegrityError
from django.utils import timezone
from datetime import timedelta
from .models import IdempotencyRecord

logger = logging.getLogger('youthquest.request')
_REQUEST_ID = re.compile(r'^[A-Za-z0-9._:-]{1,64}$')

IDEMPOTENCY_METHODS={'POST','PUT','PATCH','DELETE'}
IDEMPOTENCY_EXCLUDE={'/api/auth/login/','/api/auth/refresh/','/api/auth/logout/','/api/csrf/'}

def _idempotency_key(request):
    key=request.headers.get('X-Idempotency-Key','').strip()
    return key if _REQUEST_ID.fullmatch(key) else None


class RequestIdMiddleware:
    def __init__(self, get_response): self.get_response = get_response
    def __call__(self, request):
        candidate = request.headers.get('X-Request-ID', '')
        request.request_id = candidate if _REQUEST_ID.fullmatch(candidate) else str(uuid.uuid4())
        # Validate JSON bodies once at the API boundary. This prevents individual
        # endpoints from accidentally treating malformed JSON as an empty object.
        if request.path.startswith('/api/') and request.body and request.content_type == 'application/json':
            try:
                parsed = json.loads(request.body)
                if not isinstance(parsed, dict):
                    return JsonResponse({'detail': 'JSON request body must be an object.'}, status=400, headers={'X-Request-ID': request.request_id})
            except (TypeError, ValueError):
                return JsonResponse({'detail': 'Invalid JSON request body.'}, status=400, headers={'X-Request-ID': request.request_id})
        idem_key = _idempotency_key(request) if request.method in IDEMPOTENCY_METHODS and request.path.startswith('/api/') and request.path not in IDEMPOTENCY_EXCLUDE and getattr(request.user, 'is_authenticated', False) else None
        if idem_key:
            # Keep the replay store bounded without adding a scheduled job dependency.
            if request.request_id.endswith('0'):
                IdempotencyRecord.objects.filter(created_at__lt=timezone.now()-timedelta(days=7)).delete()
            existing=IdempotencyRecord.objects.filter(user=request.user,path=request.path,request_key=idem_key).first()
            if existing:
                response=HttpResponse(existing.response_body,status=existing.status_code,content_type=existing.content_type)
                response['X-Idempotency-Replay']='true'
                response['X-Request-ID']=request.request_id
                return response
        try:
            response = self.get_response(request)
        except (TypeError, ValueError) as exc:
            # Bad client input must never become a raw HTML 500 response.
            # Keep the real exception in server logs, but expose only a safe
            # validation message to API clients.
            logger.warning(
                'request_invalid request_id=%s method=%s path=%s error=%s',
                request.request_id, request.method, request.path, exc,
            )
            if request.path.startswith('/api/'):
                response = JsonResponse({'detail': 'Invalid request data.'}, status=400)
            else:
                raise
        except Exception:
            logger.exception('request_failed request_id=%s method=%s path=%s', request.request_id, request.method, request.path)
            if request.path.startswith('/api/'):
                # Never leak exception details, SQL, filesystem paths, or
                # framework tracebacks through the API.
                response = JsonResponse({'detail': 'An unexpected server error occurred.'}, status=500)
            else:
                raise
        if idem_key and 'application/json' in (response.get('Content-Type','')) and not getattr(response, 'streaming', False):
            try:
                IdempotencyRecord.objects.create(user=request.user,path=request.path,request_key=idem_key,status_code=response.status_code,content_type=response.get('Content-Type','application/json'),response_body=response.content.decode('utf-8'))
            except IntegrityError:
                # Another identical request completed first; its response is authoritative.
                pass
        response['X-Request-ID'] = request.request_id
        logger.info('request_complete request_id=%s method=%s path=%s status=%s', request.request_id, request.method, request.path, response.status_code)
        return response
