from .common import *

@require_http_methods(["POST"])
def points_qr(request):
    p = require_role(request, ["youth"])
    if not p: return ok({"detail":"Forbidden"}, 403)
    if not p.programme_id:
        return ok({"detail":"Your account is not assigned to a programme"},400)
    body = parse_json(request) or {}
    renew = bool(body.get("renew", False))
    existing = PointsQrToken.objects.filter(profile=p, active=True).first()
    if existing and not renew and existing.token:
        # Keep the current public QR stable across dashboard mounts. A deliberate
        # refresh is the only action that rotates/invalidate the previous token.
        return ok({"token": existing.token, "milestoneTier": milestone_tier(p), "stable": True})
    token = secrets.token_urlsafe(32)
    PointsQrToken.objects.update_or_create(profile=p, defaults={"token": token, "token_hash": token_hash(token), "active": True})
    return ok({"token": token, "milestoneTier": milestone_tier(p), "stable": False})

@require_http_methods(["GET"])
def points_scan_info(request):
    worker=require_role(request,["worker","admin"])
    if not worker:return ok({"detail":"Forbidden"},403)
    raw=str(request.GET.get("token",""))
    qr=PointsQrToken.objects.select_related("profile").filter(token_hash=token_hash(raw),active=True,profile__role="youth",profile__programme=active_programme_for(worker),profile__user__is_active=True).first()
    if not qr:return ok({"detail":"Invalid points QR"},400)
    return ok({"profileId":qr.profile_id,"gamertag":qr.profile.gamertag,"xp":qr.profile.current_xp,"avatar":qr.profile.avatar,"milestoneTier":milestone_tier(qr.profile)})

@require_http_methods(["POST"])
def points_scan(request):
    worker = require_role(request, ["worker", "admin"])
    if not worker: return ok({"detail":"Forbidden"}, 403)
    body = parse_json(request) or {}
    raw = str(body.get("token", ""))
    try:
        amount = safe_int(body.get("amount"), minimum=1, maximum=5000)
    except ValueError:
        return ok({"detail":"Point amount must be between 1 and 5000."}, 400)
    reason = str(body.get("reason", "Approved activity"))[:240]
    if not raw or amount <= 0: return ok({"detail":"Invalid QR or point amount"}, 400)
    qr = PointsQrToken.objects.select_related("profile").filter(token_hash=token_hash(raw), active=True, profile__programme=active_programme_for(worker)).first()
    if not qr: return ok({"detail":"Invalid points QR"}, 400)
    target=qr.profile
    programme=active_programme_for(worker)
    if not programme:
        return ok({'detail':'No active programme'},403)
    if target.programme_id != programme.id: return ok({'detail':'Young person is outside your active programme'},403)
    if worker.role=="worker" and amount>int(programme.max_worker_points if programme else 100):
        req=PointAwardRequest.objects.create(target=target,requested_by=request.user,amount=amount,reason=reason)
        AuditLog.objects.create(actor=request.user,action="qr_points_award_requested",target=str(target.id),detail={"requestId":str(req.id),"amount":amount,"reason":reason})
        return ok({"status":"pending","requestId":req.id,"gamertag":target.gamertag},202)
    tx, target = award_xp(target=target, actor=request.user, amount=amount, source="qr-approved", reason=reason)
    AuditLog.objects.create(actor=request.user,action="qr_points_award",target=str(target.id),detail={"amount":amount,"reason":reason})
    return ok({"ok":True,"gamertag":target.gamertag,"newXp":target.current_xp})

@require_http_methods(["GET","POST"])
def point_awards(request):
    actor=require_role(request,["worker","admin"])
    if not actor:return ok({"detail":"Forbidden"},403)
    programme=active_programme_for(actor)
    if request.method=="GET":
        qs=PointAwardRequest.objects.select_related("target","requested_by","reviewed_by").filter(target__programme=programme).order_by("-created_at")
        if actor.role=="worker": qs=qs.filter(requested_by=request.user)
        qs=qs[:100]
        return ok({"items":[{"id":x.id,"gamertag":x.target.gamertag,"amount":x.amount,"reason":x.reason,"rejectionReason":x.rejection_reason,"status":x.status,"requestedBy":x.requested_by.username,"reviewedBy":x.reviewed_by.username if x.reviewed_by else None,"createdAt":x.created_at,"reviewedAt":x.reviewed_at} for x in qs]})
    body=parse_json(request) or {}
    group_id=body.get('groupId')
    if group_id is not None and str(group_id).isdigit():
        group=Group.objects.filter(id=int(group_id),programme=active_programme_for(actor)).first()
        if not group:return ok({'detail':'Group not found'},404)
        profile_ids=list(group.members.filter(role='youth',programme=active_programme_for(actor),user__is_active=True).values_list('id',flat=True))
    else:
        profile_ids=body.get('profileIds') if isinstance(body.get('profileIds'),list) else None
    if profile_ids is not None:
        try: profile_ids=[int(x) for x in profile_ids]
        except (TypeError,ValueError): return ok({'detail':'Invalid young person selection'},400)
        profile_ids=list(dict.fromkeys(profile_ids))
    else:
        raw_profile_id=body.get('profileId')
        profile_ids=[int(raw_profile_id)] if str(raw_profile_id or '').isdigit() else []
    targets=list(Profile.objects.filter(id__in=profile_ids,role='youth',programme=active_programme_for(actor),user__is_active=True))
    # A group action is deliberately resolved to the exact active youth members
    # at transaction time. Never report success for an empty/stale group.
    if group_id is not None and not targets:
        return ok({'detail':'This group has no active young people to update. Refresh the group membership and try again.'},400)
    raw_token=str(body.get('token','')).strip()
    if raw_token and len(targets)!=1:
        return ok({'detail':'A scanned player QR can only award points to one player at a time.'},400)
    if raw_token:
        qr=PointsQrToken.objects.filter(profile=targets[0],token_hash=token_hash(raw_token),active=True).first()
        if not qr:return ok({'detail':'The scanned player QR is invalid or expired.'},400)
    try: amount=int(body.get('amount',0))
    except (TypeError,ValueError): amount=0
    reason=str(body.get('reason','Staff award')).strip()[:240]
    if not targets or amount<=0 or not reason:return ok({'detail':'Invalid young person, points or reason'},400)
    limit=programme.max_worker_points if programme else 100
    results=[]
    pending_targets=[]
    with transaction.atomic():
        for target in targets:
            if actor.role=='worker' and amount>limit:
                req=PointAwardRequest.objects.create(target=target,requested_by=request.user,amount=amount,reason=reason)
                AuditLog.objects.create(actor=request.user,action='point_award_requested',target=str(target.id),detail={'requestId':req.id,'amount':amount,'reason':reason})
                pending_targets.append(target.gamertag)
                results.append({'status':'pending','requestId':req.id,'gamertag':target.gamertag})
            else:
                tx, target = award_xp(target=target, actor=request.user, amount=amount, source='staff-award', reason=reason)
                AuditLog.objects.create(actor=request.user,action='point_award',target=str(target.id),detail={'amount':amount,'reason':reason})
                results.append({'status':'approved','gamertag':target.gamertag,'newXp':target.current_xp})
    if pending_targets:
        requester=actor.gamertag
        label=f'{len(pending_targets)} point award' if len(pending_targets)==1 else f'{len(pending_targets)} point awards'
        body=f'{requester} submitted {label} above the worker limit for approval.'
        for admin_profile in Profile.objects.filter(role='admin',programme=programme,user__is_active=True):
            create_notification(profile=admin_profile,title='Point awards waiting for approval',body=body,kind='approval',url='/worker/points')
    # A group action always returns an affected-player count, even when the
    # group currently contains one young person. This keeps the UI semantics
    # consistent and prevents a group action from falling back to a player name.
    if group_id is not None:
        return ok({'status':'bulk','updatedCount':len(results),'results':results},202 if any(x['status']=='pending' for x in results) else 200)
    if len(results)==1:
        return ok(results[0],202 if results[0]['status']=='pending' else 200)
    return ok({'status':'bulk','updatedCount':len(results),'results':results},202 if any(x['status']=='pending' for x in results) else 200)

@require_http_methods(["POST"])
def point_award_review(request):
    admin_p=require_role(request,["admin"])
    if not admin_p:return ok({"detail":"Forbidden"},403)
    body=parse_json(request) or {}; req=PointAwardRequest.objects.select_for_update().select_related("target").filter(id=body.get("requestId"),status="pending",target__programme=active_programme_for(admin_p)).first()
    if not req:return ok({"detail":"Pending award not found"},404)
    decision=str(body.get("decision",""))
    rejection_reason=str(body.get('reason','')).strip()[:500]
    if decision=='reject' and not rejection_reason:
        return ok({'detail':'Add a reason when rejecting a points request.'},400)
    with transaction.atomic():
        if decision=="approve":
            target=req.target
            tx, target = award_xp(target=target, actor=request.user, amount=req.amount, source="staff-award-approved", reason=req.reason)
            req.status="approved"; action="point_award_approved"
        elif decision=="reject": req.status="rejected"; req.rejection_reason=rejection_reason; action="point_award_rejected"
        else:return ok({"detail":"Decision must be approve or reject"},400)
        req.reviewed_by=request.user;req.reviewed_at=timezone.now();
        if req.status=='rejected':
            req.save(update_fields=['status','rejection_reason','reviewed_by','reviewed_at'])
        else:
            req.save(update_fields=['status','reviewed_by','reviewed_at'])
        requester=Profile.objects.filter(user=req.requested_by).first()
        if requester:
            if req.status=='approved':
                create_notification(profile=requester,title='Points request approved',body=f'{req.amount} XP for {req.target.gamertag} was approved by admin.',kind='approval',url='/worker/points')
            else:
                create_notification(profile=requester,title='Points request declined',body=f'{req.amount} XP for {req.target.gamertag} was declined by admin. Reason: {req.rejection_reason}',kind='approval',url='/worker/points')
        AuditLog.objects.create(actor=request.user,action=action,target=str(req.target.id),detail={"requestId":req.id,"amount":req.amount,"reason":req.reason})
    return ok({"ok":True,"status":req.status})

@require_http_methods(["POST"])
def point_penalty(request):
    actor=require_role(request,["worker","admin"])
    if not actor:return ok({"detail":"Forbidden"},403)
    body=parse_json(request) or {}; programme=active_programme_for(actor)
    if body.get('groupId') is not None and str(body.get('groupId')).isdigit():
        group=Group.objects.filter(id=int(body.get('groupId')),programme=programme).first()
        if not group:return ok({'detail':'Group not found'},404)
        targets=list(group.members.filter(role='youth',programme=programme,user__is_active=True))
    else:
        targets=list(Profile.objects.filter(id=body.get("profileId"),role="youth",programme=programme,user__is_active=True)[:1])
    try: amount=int(body.get("amount",0))
    except (TypeError,ValueError): amount=0
    reason=str(body.get("reason","Penalty")).strip()[:240]
    if not targets or amount<=0 or not reason:return ok({"detail":"Invalid penalty"},400)
    if any(amount>target.current_xp for target in targets):return ok({'detail':'The removal amount cannot exceed a player current XP.'},400)
    results=[]
    with transaction.atomic():
        for target in targets:
            _, target=award_xp(target=target,actor=request.user,amount=-amount,source="penalty",reason=reason)
            AuditLog.objects.create(actor=request.user,action="point_penalty",target=str(target.id),detail={"amount":amount,"reason":reason})
            results.append({'gamertag':target.gamertag,'newXp':target.current_xp})
    if body.get('groupId') is not None:
        return ok({'status':'bulk','updatedCount':len(results),'results':results})
    return ok(results[0] if len(results)==1 else {'status':'bulk','updatedCount':len(results),'results':results})



@require_http_methods(["GET"])
def public_point_requests(request):
    actor = require_role(request, ["worker", "admin"])
    if not actor:
        return ok({"detail": "Forbidden"}, 403)
    programme = active_programme_for(actor)
    if not programme:
        return ok({"items": []})
    qs = PublicPointRequest.objects.select_related("target", "reviewed_by").filter(
        target__programme=programme
    ).order_by("-created_at")[:100]
    return ok({"items": [{
        "id": x.id,
        "gamertag": x.target.gamertag,
        "name": x.name,
        "organisation": x.organisation,
        "comment": x.comment,
        "rating": x.rating,
        "status": x.status,
        "assignedAmount": x.assigned_amount,
        "createdAt": x.created_at,
        "reviewedAt": x.reviewed_at,
        "reviewedBy": x.reviewed_by.username if x.reviewed_by else None,
    } for x in qs]})


@require_http_methods(["POST"])
def public_point_request_review(request):
    actor = require_role(request, ["worker", "admin"])
    if not actor:
        return ok({"detail": "Forbidden"}, 403)
    programme = active_programme_for(actor)
    body = parse_json(request) or {}
    try:
        request_id = safe_int(body.get("requestId"), minimum=1)
    except ValueError:
        return ok({"detail": "Invalid public points request."}, 400)
    decision = str(body.get("decision", "")).strip().lower()
    if decision not in {"approve", "reject"}:
        return ok({"detail": "Decision must be approve or reject."}, 400)
    try:
        amount = safe_int(body.get("amount"), minimum=1, maximum=5000) if decision == "approve" else None
    except ValueError:
        return ok({"detail": "Points must be a whole number between 1 and 5000."}, 400)
    with transaction.atomic():
        req = PublicPointRequest.objects.select_for_update().select_related("target").filter(
            id=request_id, status="pending", target__programme=programme,
        ).first()
        if not req:
            return ok({"detail": "Pending public points request not found."}, 404)
        if decision == "reject":
            req.status = "rejected"
            req.reviewed_by = request.user
            req.reviewed_at = timezone.now()
            req.save(update_fields=["status", "reviewed_by", "reviewed_at"])
            AuditLog.objects.create(actor=request.user, action="public_point_request_rejected", target=str(req.target.id), detail={"requestId": req.id, "rating": req.rating})
            return ok({"ok": True, "status": "rejected"})
        if actor.role == "worker" and amount > int(programme.max_worker_points or 100):
            return ok({"detail": f"Youth workers can assign up to {int(programme.max_worker_points or 100)} points per public request."}, 400)
        reason = f"Public feedback ({req.rating}/5)"
        if req.comment:
            reason = f"{reason}: {req.comment}"
        tx, target = award_xp(target=req.target, actor=request.user, amount=amount, source="public-points", reason=reason)
        req.status = "approved"
        req.assigned_amount = amount
        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.save(update_fields=["status", "assigned_amount", "reviewed_by", "reviewed_at"])
        AuditLog.objects.create(actor=request.user, action="public_point_request_approved", target=str(target.id), detail={"requestId": req.id, "rating": req.rating, "amount": amount, "name": req.name})
    return ok({"ok": True, "status": "approved", "gamertag": target.gamertag, "newXp": target.current_xp, "amount": amount})
