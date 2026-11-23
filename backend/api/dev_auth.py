"""Development-only authentication helpers.

This module is intentionally isolated from the normal authentication module so
that local Quick Login can be removed without changing production auth logic.
Delete this module and its single URL registration when the feature is retired.
"""
from .common import *

DEV_ACCOUNTS = {"alex", "worker", "admin"}


@require_http_methods(["POST"])
def dev_login(request):
    """One-click login for fixed seeded local accounts; never available in production."""
    if CONFIG.env != "local" or not CONFIG.debug or not CONFIG.enable_quick_login:
        return ok({"detail": "Not available"}, 404)
    body = parse_json(request) or {}
    username = str(body.get("username", "")).strip().lower()
    if username not in DEV_ACCOUNTS:
        return ok({"detail": "Unknown development account"}, 400)
    user = User.objects.select_related("profile").filter(username__iexact=username, is_active=True).first()
    if not user or not hasattr(user, "profile"):
        return ok({"detail": "Development account is not seeded"}, 404)
    dj_login(request, user)
    raw, _ = issue_refresh_token(user)
    response = ok({"user": {"username": user.username, "role": user.profile.role, "gamertag": user.profile.gamertag}})
    set_refresh_cookie(response, raw)
    return response
