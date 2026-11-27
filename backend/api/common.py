import random
import io
import os
import hashlib
import json
import secrets
import uuid
from datetime import timedelta
from functools import wraps

from django.contrib.auth import authenticate, login as dj_login, logout as dj_logout
from django.contrib.auth.models import User
from django.core.cache import cache
from django.conf import settings
from django.db import transaction, models
from django.http import JsonResponse
from django.core.files.base import ContentFile
from django.middleware.csrf import get_token
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods
from core.config import CONFIG
from core.services import award_xp, attendance_streak_multiplier, scheduled_attendance_streak, create_notification, programme_local_date, record_attendance_schedule_change

from core.models import (
    Attendance, AttendanceSession, AttendanceScheduleChange, AuditLog, Challenge, DrawingSubmission,
    Badge, Group, MapEvent, Notification, Profile, ProfileBadge, ProfileSkill, Programme, ProgrammeMembership,
    RefreshToken, Reward, RewardAssignment, ScratchClaim, Skill, SkillMilestone, XPTransaction, EventCheckIn, PasswordResetQr, PointsQrToken, GameAssignment, GameAttempt, PointAwardRequest, PublicPointRequest, PushSubscription, SkillAssignment, RewardFulfillment, NotificationSound, DailyLogin, LoginStreakAward, GroupMembership, GroupXPContribution, GroupScoringPolicyHistory,
)

REFRESH_COOKIE = "yq_refresh"
REFRESH_DAYS = 14



def revoke_refresh_family(family_id):
    RefreshToken.objects.filter(family_id=family_id, revoked_at__isnull=True).update(revoked_at=timezone.now())

def set_refresh_cookie(response, raw, persistent=True):
    kwargs = {
        "httponly": True,
        "secure": settings.SESSION_COOKIE_SECURE,
        "samesite": "Lax",
        "path": "/",
    }
    if persistent:
        kwargs["max_age"] = REFRESH_DAYS * 86400
    response.set_cookie(REFRESH_COOKIE, raw, **kwargs)
    return response

def current_attendance_streak(profile):
    if not profile or not profile.programme_id:
        return 0
    return scheduled_attendance_streak(profile, profile.programme)


def needs_attention_for(profile, programme):
    now=timezone.now()
    age_days=(now-profile.user.date_joined).days
    if age_days < int(programme.attention_grace_days or 0):
        return []
    reasons=[]
    attendance_cutoff=now-timedelta(days=max(1,int(programme.attendance_attention_days or 7)))
    points_cutoff=now-timedelta(days=max(1,int(programme.points_attention_days or 7)))
    last_att=profile.attendances.filter(session__programme=programme).order_by('-attended_at').values_list('attended_at',flat=True).first()
    last_points=profile.xp_transactions.filter(programme=programme,amount__gt=0).exclude(source='attendance').order_by('-created_at').values_list('created_at',flat=True).first()
    if not last_att or last_att < attendance_cutoff:
        reasons.append('attendance')
    if not last_points or last_points < points_cutoff:
        reasons.append('points')
    return reasons

def milestone_color(profile):
    xp=profile.lifetime_xp; programme=profile.programme if profile and profile.programme_id else None
    milestones=[x for x in (programme.milestones if programme and isinstance(programme.milestones,list) else []) if isinstance(x,dict)]
    reached=sorted([x for x in milestones if xp >= int(x.get('xp',0) or 0)], key=lambda x:int(x.get('xp',0) or 0))
    return str(reached[-1].get('color','#6f778d')) if reached else '#6f778d'

def auth_required(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not profile_for(request):
            return ok({"detail": "Authentication required"}, 401)
        return view(request, *args, **kwargs)
    return wrapped

def user_can_access_programme(user, programme):
    if not user or not getattr(user, "is_authenticated", False) or not programme:
        return False
    profile = getattr(user, 'profile', None)
    if profile and profile.role == 'admin':
        return True
    if ProgrammeMembership.objects.filter(user=user, programme=programme).exists():
        return True
    return getattr(profile, 'programme_id', None) == programme.id

def active_programme_for(profile=None):
    if not profile:
        return None
    programme = profile.programme if profile.programme_id else None
    if programme and programme.active and programme.status == 'active':
        return programme
    if profile.role != 'admin':
        return None
    programme = Programme.objects.filter(
        active=True, status='active'
    ).order_by('name', 'id').first()
    if not programme:
        return None
    if profile.programme_id != programme.id:
        Profile.objects.filter(pk=profile.pk).update(programme=programme)
        profile.programme = programme
    ProgrammeMembership.objects.get_or_create(
        user_id=profile.user_id, programme=programme
    )
    return programme

def token_hash(raw):
    return hashlib.sha256(raw.encode()).hexdigest()

def event_payload(event, include_map=True, include_attendance_config=False):
    if not event: return None
    now=timezone.now()
    status=event.status
    if status!='cancelled':
        if event.ended_at or (event.end_at and event.end_at<=now): status='ended'
        elif event.start_at and event.start_at>now: status='scheduled'
        else: status='current'
    payload={'id':event.id,'title':event.title,'description':event.description,'locationName':event.location_name,'postcode':event.postcode,'address':event.address,'startAt':event.start_at,'endAt':event.end_at,'endedAt':event.ended_at,'status':status,'pinEnabled':event.pin_enabled,'visible':event.visible,'qrCheckInRequired':True}
    if include_map:
        payload.update({'lat':event.lat,'lng':event.lng,'directionsUrl':f'https://www.google.com/maps/dir/?api=1&destination={event.lat},{event.lng}'})
    return payload

def theme_payload(programme):
    # Meadow is the accessible, light default for login and first-time users.
    # Ignore legacy/unknown dark "neon" theme records rather than applying
    # their colours to the Meadow preset in the frontend.
    default_theme = {
        'accent': '#2E9B69', 'accent2': '#5C9C70',
        'background': '#F6F1E6', 'header': '#FFFDF7',
        'nav': '#173B32', 'card': '#FFFDF7', 'surface': '#FFFDF7',
        'surface2': '#EEE7D8', 'text': '#173B32', 'muted': '#687970',
        'border': '#D8D6C9', 'warm': '#F4C65B', 'danger': '#C95454',
        'success': '#2E9B69', 'warning': '#F29B38', 'focus': '#F29B38',
        'button': '#173B32', 'buttonText': '#FFFDF7',
        'donutXp': '#2E9B69', 'donutMilestone': '#5C9C70',
        'donutAchievement': '#F4C65B', 'donutTrack': '#D3D9D0',
        'tile1': '#D9F0DF', 'tile2': '#F9E7BA', 'tile3': '#F3E6C7',
        'tile4': '#D8EFF1', 'tile5': '#F6D2C8', 'tile6': '#FFFDF7',
    }
    requested_theme = str(programme.theme or 'meadow') if programme else 'meadow'
    known_themes = {'meadow', 'space', 'cleaning', 'music', 'arts', 'games', 'sunrise', 'ocean', 'twilight'}
    theme = requested_theme if requested_theme in known_themes else 'meadow'
    config = programme.theme_config if programme and theme == requested_theme and isinstance(programme.theme_config, dict) and programme.theme_config else default_theme
    return {'theme': theme, 'themeConfig': config}

def issue_refresh_token(user, family_id=None):
    raw = secrets.token_urlsafe(48)
    token = RefreshToken.objects.create(
        user=user,
        token_hash=token_hash(raw),
        family_id=family_id or uuid.uuid4(),
        expires_at=timezone.now() + timedelta(days=REFRESH_DAYS),
    )
    return raw, token

def parse_json(request):
    try:
        value = json.loads(request.body or "{}")
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None

def safe_int(value, *, default=None, minimum=None, maximum=None):
    if value in (None, ''):
        if default is not None:
            return default
        raise ValueError('integer required')
    try:
        # Reject booleans: bool is an int subclass in Python but is not a valid
        # API identifier/amount.
        if isinstance(value, bool):
            raise ValueError('boolean is not an integer')
        result = int(value)
    except (TypeError, ValueError):
        raise ValueError('invalid integer')
    if minimum is not None and result < minimum:
        raise ValueError('integer below minimum')
    if maximum is not None and result > maximum:
        raise ValueError('integer above maximum')
    return result

def ok(data, status=200):
    return JsonResponse(data, status=status, safe=isinstance(data, dict))

def profile_for(request):
    if not request.user.is_authenticated or not request.user.is_active:
        return None
    return getattr(request.user, "profile", None)

def require_role(request, roles):
    profile = profile_for(request)
    return profile if profile and profile.role in roles else None

def milestone_tier(profile):
    xp=profile.lifetime_xp
    programme=profile.programme if profile and profile.programme_id else None
    milestones=[x for x in (programme.milestones if programme and isinstance(programme.milestones,list) else []) if isinstance(x,dict) and str(x.get('tier','')).strip()]
    reached=sorted([x for x in milestones if xp >= int(x.get('xp',0) or 0)], key=lambda x:int(x.get('xp',0) or 0))
    return str(reached[-1].get('tier','grey')) if reached else 'grey'

def event_summary(programme, include_map=True):
    if not programme: return {'lastEvent':None,'currentEvent':None,'nextEvent':None}
    now=timezone.now()
    qs=MapEvent.objects.filter(programme=programme,visible=True).exclude(status='cancelled')
    current=qs.filter(ended_at__isnull=True).filter(models.Q(start_at__isnull=True)|models.Q(start_at__lte=now)).filter(models.Q(end_at__isnull=True)|models.Q(end_at__gt=now)).order_by('-start_at','-id').first()
    upcoming=qs.filter(ended_at__isnull=True).filter(start_at__gt=now).order_by('start_at','id').first()
    last=qs.filter(models.Q(ended_at__isnull=False)|models.Q(end_at__lte=now)).order_by('-ended_at','-end_at','-id').first()
    events=[event_payload(e, include_map=include_map) for e in qs.order_by('start_at','id')[:20]]
    return {'lastEvent':event_payload(last, include_map=include_map),'currentEvent':event_payload(current, include_map=include_map),'nextEvent':event_payload(upcoming, include_map=include_map),'events':events}

def rate_limit(key, limit=10, window=60):
    cache_key = f"rate:{key}"
    count = cache.get(cache_key, 0)
    if count >= limit:
        return False
    cache.set(cache_key, count + 1, window)
    return True

