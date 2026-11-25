from .common import *
from core.services import process_daily_login_reward

@require_http_methods(["GET"])
def health(request):
    return ok({"status": "ok", "service": "youth-quest"})

@ensure_csrf_cookie
@require_http_methods(["GET"])
def csrf(request):
    return ok({"csrfToken": get_token(request)})

@require_http_methods(["POST"])
def login(request):
    if not rate_limit(f"login:{request.META.get('REMOTE_ADDR', 'unknown')}", 8, 60):
        return ok({"detail": "Too many login attempts. Try again shortly."}, 429)
    body = parse_json(request)
    if body is None:
        return ok({"detail": "Invalid JSON"}, 400)
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    remember_me = bool(body.get("rememberMe", True))
    canonical = User.objects.filter(username__iexact=username).values_list('username', flat=True).first() if username else None
    user = authenticate(username=canonical or username, password=password)
    if not user or not user.is_active or not hasattr(user, "profile"):
        return ok({"detail": "Invalid credentials"}, 401)
    dj_login(request, user)
    if user.profile.role == "youth":
        process_daily_login_reward(user.profile)
    request.session.set_expiry(None if remember_me else 0)
    request.session["remember_me"] = remember_me
    raw, _ = issue_refresh_token(user)
    response = ok({"user": {"username": user.username, "role": user.profile.role, "gamertag": user.profile.gamertag, "mustChangePassword": bool(user.profile.must_change_password)}})
    set_refresh_cookie(response, raw, persistent=remember_me)
    return response


@require_http_methods(["POST"])
def refresh(request):
    if not rate_limit(f"refresh:{request.META.get('REMOTE_ADDR', 'unknown')}", 20, 60):
        return ok({"detail": "Too many refresh attempts"}, 429)
    raw = request.COOKIES.get(REFRESH_COOKIE)
    if not raw:
        return ok({"detail": "Refresh token missing"}, 401)
    now = timezone.now()
    with transaction.atomic():
        current = RefreshToken.objects.select_for_update().select_related("user", "user__profile").filter(token_hash=token_hash(raw)).first()
        if not current or current.expires_at <= now or not current.user.is_active:
            if current:
                revoke_refresh_family(current.family_id)
            return ok({"detail": "Refresh token invalid or expired"}, 401)
        if current.revoked_at:
            # Reuse of a rotated token is treated as family compromise.
            revoke_refresh_family(current.family_id)
            return ok({"detail": "Refresh token reuse detected"}, 401)
        current.revoked_at = now
        current.last_used_at = now
        new_raw, replacement = issue_refresh_token(current.user, current.family_id)
        current.replaced_by = replacement.id
        current.save(update_fields=["revoked_at", "last_used_at", "replaced_by"])
    dj_login(request, current.user)
    remember_me = bool(request.session.get("remember_me", True))
    request.session.set_expiry(None if remember_me else 0)
    request.session["remember_me"] = remember_me
    response = ok({"user": {"username": current.user.username, "role": current.user.profile.role, "gamertag": current.user.profile.gamertag, "mustChangePassword": bool(current.user.profile.must_change_password)}})
    set_refresh_cookie(response, new_raw, persistent=remember_me)
    return response

@require_http_methods(["POST"])
def logout(request):
    raw = request.COOKIES.get(REFRESH_COOKIE)
    if raw:
        token = RefreshToken.objects.filter(token_hash=token_hash(raw)).first()
        if token:
            revoke_refresh_family(token.family_id)
    dj_logout(request)
    response = ok({"ok": True})
    response.delete_cookie(REFRESH_COOKIE, path="/")
    return response

@require_http_methods(["GET"])
def me(request):
    profile = profile_for(request)
    if not profile:
        return ok({"detail": "Authentication required"}, 401)
    programme = active_programme_for(profile)
    return ok({"authenticated": True, "user": {"username": request.user.username, "role": profile.role, "gamertag": profile.gamertag, "mustChangePassword": bool(profile.must_change_password)}, **theme_payload(programme)})

@require_http_methods(["POST"])
@auth_required
def change_password(request):
    body=parse_json(request) or {}
    current=str(body.get("currentPassword","")); password=str(body.get("password",""))
    if len(password)<10:return ok({"detail":"Password must be at least 10 characters"},400)
    if not request.user.check_password(current):return ok({"detail":"Current password is incorrect."},400)
    if password==current:return ok({"detail":"Choose a different password."},400)
    request.user.set_password(password); request.user.save(update_fields=["password"])
    profile=profile_for(request)
    if profile:
        profile.must_change_password=False; profile.save(update_fields=["must_change_password","updated_at"])
    RefreshToken.objects.filter(user=request.user,revoked_at__isnull=True).update(revoked_at=timezone.now())
    raw,_=issue_refresh_token(request.user)
    dj_login(request,request.user)
    response=ok({"ok":True,"user":{"username":request.user.username,"role":profile.role if profile else "","gamertag":profile.gamertag if profile else "","mustChangePassword":False}})
    set_refresh_cookie(response,raw)
    return response

@require_http_methods(["POST"])
@auth_required
def profile_delete(request):
    p=profile_for(request); p.deletion_requested=True; p.save(update_fields=['deletion_requested'])
    for admin_profile in Profile.objects.filter(role='admin',programme=p.programme,user__is_active=True):
        create_notification(profile=admin_profile,title='Account deletion waiting for approval',body=f'{p.gamertag} has requested account removal.',kind='approval',url='/admin')
    RefreshToken.objects.filter(user=request.user,revoked_at__isnull=True).update(revoked_at=timezone.now()); dj_logout(request); response=ok({'requested':True}); response.delete_cookie(REFRESH_COOKIE,path='/'); return response

@require_http_methods(["POST"])
def password_reset(request):
    body=parse_json(request) or {}; raw=str(body.get("token","")); password=str(body.get("password",""))
    if len(password)<10: return ok({"detail":"Password must be at least 10 characters"},400)
    with transaction.atomic():
        reset=PasswordResetQr.objects.select_for_update().select_related("target").filter(token_hash=token_hash(raw),used_at__isnull=True).first()
        if not reset or reset.expires_at<=timezone.now(): return ok({"detail":"Reset QR is invalid or expired"},400)
        reset.target.set_password(password); reset.target.save(update_fields=["password"])
        RefreshToken.objects.filter(user=reset.target,revoked_at__isnull=True).update(revoked_at=timezone.now())
        reset.used_at=timezone.now(); reset.save(update_fields=["used_at"])
        target = reset.target
        raw_refresh, _ = issue_refresh_token(target)
    dj_login(request, target)
    response = ok({"ok":True, "user":{"username":target.username,"role":target.profile.role,"gamertag":target.profile.gamertag,"mustChangePassword":bool(target.profile.must_change_password)}})
    set_refresh_cookie(response, raw_refresh)
    return response

