from .common import *


def _public_instances():
    return Programme.objects.filter(active=True, public_enabled=True, status='active').order_by('name', 'id')


def _public_instance_payload(programme):
    return {'id': programme.id, 'name': programme.name, 'location': programme.location}


@require_http_methods(["GET"])
def public_instances(request):
    programmes = _public_instances()
    query = str(request.GET.get('q', '')).strip()[:80]
    if query:
        programmes = programmes.filter(models.Q(name__icontains=query) | models.Q(location__icontains=query))
    total = programmes.count()
    items = list(programmes[:30])
    response = ok({'items': [_public_instance_payload(p) for p in items], 'total': total})
    response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    return response


@require_http_methods(["GET"])
def public_dashboard(request):
    programmes = _public_instances()
    requested = request.GET.get('instanceId')
    programme = None
    if requested not in (None, ''):
        try:
            programme = programmes.filter(pk=int(requested)).first()
        except (TypeError, ValueError):
            programme = None
        if not programme:
            return ok({'detail': 'Public programme not found'}, 404)
    else:
        programme = programmes.first()

    cfg = programme.public_config if programme and isinstance(programme.public_config, dict) else {}
    defaults = {'programme':True,'location':True,'collectiveXp':True,'targetXp':True,'participants':True,'groups':True,'highRisers':True,'skillsCompleted':True,'challengesCompleted':True,'attendance':True,'challengeProgress':True,'event':True}
    show = {k: bool(cfg.get(k, defaults[k])) for k in defaults}
    supplied_map_token = str(request.GET.get('mapAccess','')).strip().upper()
    map_access_granted = bool(programme and programme.public_map_token and supplied_map_token and supplied_map_token == str(programme.public_map_token or '').upper() and programme.public_map_token_expires_at and programme.public_map_token_expires_at > timezone.now())
    youth = Profile.objects.filter(role='youth', public_opt_in=True, user__is_active=True, programme=programme) if programme else Profile.objects.none()
    data = {}
    if show['programme']: data['programme'] = programme.name if programme else 'Youth Quest'
    if show['location']: data['location'] = programme.location if programme else 'Community'
    if show['targetXp']: data['targetXp'] = programme.target_xp if programme else 1
    if show['collectiveXp']: data['collectiveXp'] = sum(g['xp'] for g in Group.objects.filter(programme=programme).values('xp')) if programme else 0
    if show['groups']:
        groups_qs=Group.objects.filter(programme=programme).prefetch_related('members') if programme else Group.objects.none()
        group_rows=[]
        for group in groups_qs:
            members=group.members.filter(role='youth',public_opt_in=True,user__is_active=True,programme=programme)
            member_ids=list(members.values_list('id',flat=True))
            skills_count=ProfileSkill.objects.filter(profile_id__in=member_ids,completed=True).count() if member_ids else 0
            achievements_count=ProfileBadge.objects.filter(profile_id__in=member_ids).count() if member_ids else 0
            challenges_count=GameAttempt.objects.filter(profile_id__in=member_ids,status='completed',game__programme=programme).count() if member_ids else 0
            group_rows.append({'name':group.name,'xp':int(group.xp or 0),'targetXp':int(programme.target_xp if programme else 1),'progress':round(min(100,max(0,(float(group.xp or 0)/max(1,float(programme.target_xp if programme else 1)))*100)),1),'members':len(member_ids),'skills':skills_count,'achievements':achievements_count,'challenges':challenges_count})
        group_rows.sort(key=lambda x:(-x['xp'],x['name'].lower()))
        for i,row in enumerate(group_rows,1): row['rank']=i
        data['groups']=group_rows
        data['groupMetrics']=group_rows
    week = timezone.now() - timedelta(days=7)
    if show['highRisers']:
        high = []
        for p in youth:
            xp = XPTransaction.objects.filter(target=p, programme=programme, created_at__gte=week, amount__gt=0).aggregate(total=models.Sum('amount'))['total'] or 0
            high.append({'name':p.gamertag,'xp':xp,'skills':ProfileSkill.objects.filter(profile=p,completed=True).count()})
        data['highRisers'] = sorted(high,key=lambda x:x['xp'],reverse=True)[:5]
    stats = {}
    if show['skillsCompleted']: stats['skillsCompleted'] = ProfileSkill.objects.filter(completed=True, profile__role='youth', profile__programme=programme).count() if programme else 0
    if show['challengesCompleted']: stats['challengesCompleted'] = XPTransaction.objects.filter(programme=programme, target__role='youth', target__programme=programme, source__in=['challenge','drawing-game']).count() if programme else 0
    if show['participants']: stats['participants'] = youth.count()
    if show['attendance']:
        attendance_today=Attendance.objects.filter(session__programme=programme,attended_at__date=timezone.localdate()).count() if programme else 0
        stats['attendanceToday']=attendance_today
        stats['attendanceRegistered']=youth.count()
        stats['attendanceRate']=round((attendance_today/max(1,youth.count()))*100,1)
    if show['challengeProgress']:
        challenge_qs=Challenge.objects.filter(programme=programme) if programme else Challenge.objects.none()
        total_so_far=challenge_qs.filter(models.Q(start_at__isnull=True)|models.Q(start_at__lte=timezone.now())).count()
        active_now=challenge_qs.filter(active=True).filter(models.Q(start_at__isnull=True)|models.Q(start_at__lte=timezone.now())).filter(models.Q(end_at__isnull=True)|models.Q(end_at__gte=timezone.now())).count()
        completed=GameAttempt.objects.filter(game__programme=programme,status='completed',profile__role='youth',profile__programme=programme).values('game_id').distinct().count() if programme else 0
        data['challengeProgress']={'total':total_so_far,'active':active_now,'completed':completed}
    if stats: data['stats'] = stats
    if show['event']:
        event_data = event_summary(programme, include_map=map_access_granted)
        data.update(event_data)
    data.update(theme_payload(programme))
    layout = (cfg.get('layout') if isinstance(cfg.get('layout'),dict) else {})
    order = [x for x in (layout.get('order') or ['progress','stats','groups','highRisers','event']) if x in {'progress','stats','groups','highRisers','event'}]
    order += [x for x in ['progress','stats','groups','highRisers','event'] if x not in order]
    sizes = {x:2 if int((layout.get('sizes') or {}).get(x,1) or 1)==2 else 1 for x in ['progress','stats','groups','highRisers','event']}
    data['layout'] = {'order':order,'sizes':sizes,'columns':max(1,min(4,int(layout.get('columns',2) or 2)))}
    data['visibility'] = show
    data['mapAccessGranted'] = map_access_granted
    public_options = list(programmes[:20])
    if programme and not any(p.id == programme.id for p in public_options):
        public_options.append(programme)
    data['instances'] = [_public_instance_payload(p) for p in public_options]
    data['instanceCount'] = programmes.count()
    data['instanceId'] = programme.id if programme else None
    response = ok(data)
    response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    return response


@require_http_methods(["POST"])
def public_award(request):
    body = parse_json(request)
    allowed = {'high-five','cheer','thank-you'}
    if not body or body.get('reaction') not in allowed:
        return ok({'detail':'Reaction not allowed'},400)
    ip=request.META.get('REMOTE_ADDR','unknown')
    if not rate_limit(f'public-award:{ip}',30,60):
        return ok({'detail':'Too many reactions. Please try again shortly.'},429)
    return ok({'accepted':True,'reaction':body['reaction']})


@require_http_methods(["GET"])
def public_points_info(request):
    raw = str(request.GET.get('token', '')).strip()
    if len(raw) < 20 or len(raw) > 200:
        return ok({'detail': 'Invalid public points QR'}, 400)
    qr = PointsQrToken.objects.select_related('profile', 'profile__programme').filter(
        token_hash=token_hash(raw), active=True, profile__role='youth',
        profile__user__is_active=True, profile__programme__active=True,
        profile__programme__status='active', profile__programme__public_enabled=True,
    ).first()
    if not qr:
        return ok({'detail': 'This public points QR is invalid or no longer active.'}, 404)
    return ok({'gamertag': qr.profile.gamertag, 'programme': qr.profile.programme.name})


def _clean_public_name(value):
    if value is None:
        raise ValueError('Name is required.')
    value = ' '.join(str(value).strip().split())
    letters = sum(1 for ch in value if ch.isalpha())
    if letters < 3:
        raise ValueError('Name must contain at least 3 letters.')
    if len(value) > 80:
        raise ValueError('Name must be 80 characters or fewer.')
    return value


def _clean_public_organisation(value):
    value = ' '.join(str(value or '').strip().split())
    if len(value) > 300:
        raise ValueError('Organisation must be 50 words or fewer.')
    if value and len(value.split()) > 50:
        raise ValueError('Organisation must be 50 words or fewer.')
    return value


def _clean_public_comment(value):
    value = ' '.join(str(value or '').strip().split())
    if len(value) > 500:
        raise ValueError('Comment must be 500 characters or fewer.')
    return value


@require_http_methods(["POST"])
def public_points_request(request):
    body = parse_json(request) or {}
    # Honeypot for simple automated submissions. It is deliberately undocumented in the UI.
    if str(body.get('website', '')).strip():
        return ok({'accepted': True}, 202)
    ip = request.META.get('REMOTE_ADDR', 'unknown')
    raw = str(body.get('token', '')).strip()
    if len(raw) < 20 or len(raw) > 200:
        return ok({'detail': 'Invalid public points QR.'}, 400)
    if not rate_limit(f'public-points-ip:{ip}', 5, 600):
        return ok({'detail': 'Too many submissions. Please try again later.'}, 429)
    if not rate_limit(f'public-points-token:{token_hash(raw)}', 10, 600):
        return ok({'detail': 'Too many submissions for this QR. Please try again later.'}, 429)
    qr = PointsQrToken.objects.select_related('profile', 'profile__programme').filter(
        token_hash=token_hash(raw), active=True, profile__role='youth',
        profile__user__is_active=True, profile__programme__active=True,
        profile__programme__status='active', profile__programme__public_enabled=True,
    ).first()
    if not qr:
        return ok({'detail': 'This public points QR is invalid or no longer active.'}, 404)
    try:
        name = _clean_public_name(body.get('name'))
        organisation = _clean_public_organisation(body.get('organisation'))
        comment = _clean_public_comment(body.get('comment'))
        rating_raw = body.get('rating')
        if isinstance(rating_raw, bool) or not str(rating_raw).strip().isdigit():
            raise ValueError('Rating must be a whole number from 1 to 5.')
        rating = int(str(rating_raw).strip())
        if rating < 1 or rating > 5:
            raise ValueError('Rating must be a whole number from 1 to 5.')
    except ValueError as exc:
        return ok({'detail': str(exc)}, 400)
    # Avoid accepting the exact same submission repeatedly from one network in a short burst.
    ip_hash = hashlib.sha256(ip.encode('utf-8', errors='ignore')).hexdigest()
    recent = PublicPointRequest.objects.filter(
        target=qr.profile, submitted_ip_hash=ip_hash,
        created_at__gte=timezone.now() - timedelta(minutes=2),
    ).exists()
    if recent:
        return ok({'detail': 'A recent submission from this connection is already waiting for review.'}, 429)
    PublicPointRequest.objects.create(
        target=qr.profile, name=name, organisation=organisation,
        comment=comment, rating=rating, submitted_ip_hash=ip_hash,
    )
    for worker_profile in Profile.objects.filter(role__in=['worker','admin'], programme=qr.profile.programme, user__is_active=True):
        create_notification(profile=worker_profile, title='New public points feedback', body=f'{name} rated {qr.profile.gamertag} {rating}/5.', kind='approval', url='/worker/points')
    return ok({'accepted': True, 'message': 'Thanks. Your feedback has been sent to the youth worker for review.'}, 201)


@require_http_methods(["GET"])
def public_theme(request):
    """Expose only the active programme's visual settings so login can be themed.

    Theme colours are presentation data, not authentication or participant data.
    Keep the response deliberately small and disable intermediary caching so a
    newly saved admin theme is picked up on the next page load.
    """
    programme = Programme.objects.filter(active=True, status='active').order_by('name', 'id').first()
    payload = theme_payload(programme)
    payload['programmeName'] = programme.name if programme else 'Youth Quest'
    response = ok(payload)
    response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response['Pragma'] = 'no-cache'
    return response
