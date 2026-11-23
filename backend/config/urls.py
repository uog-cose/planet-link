from django.contrib import admin
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import include, path

from core.config import CONFIG


def root(request):
    # The backend owns the API; local users opening port 8000 should be
    # taken to the actual product UI instead of seeing a Django 404 page.
    if CONFIG.env in {"local", "dev"}:
        return redirect(request.build_absolute_uri('/').rstrip('/'))
    return JsonResponse({"name": CONFIG.app_name, "service": "backend", "status": "ok"})


urlpatterns = [
    path('', root, name='root'),
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]

from django.conf import settings
from django.conf.urls.static import static
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
