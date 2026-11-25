from datetime import timedelta
from django.db.models import Count, Q, Sum
from .common import *
from core.game_engine import GAME_TYPES, DEFAULT_RANGES, ranges_are_valid
from core.models import GroupTierUnlock

@require_http_methods(["GET"])
def worker_participants(request):
    if not require_role(request,["worker","admin"]): return ok({"detail":"Forbidden"},403)
    actor = profile_for(request)
    programme = active_programme_for(actor)
    group_qs = Group.objects.all() if actor.role == "admin" else Group.objects.filter(programme=programme)
    people_qs = Profile.objects.filter(role="youth", user__is_active=True) if actor.role == "admin" else Profile.objects.filter(role="youth", programme=programme, user__is_active=True)
    groups=list(group_qs.annotate(member_count=Count('members',filter=Q(members__role='youth',members__user__is_active=True))).order_by('programme__name','name').values('id','name','programme_id','member_count'))
    return ok({"items":[{"id":p.id,"userId":p.user_id,"gamertag":p.gamertag,"avatar":p.avatar,"avatarImageUrl":(request.build_absolute_uri(f'/api/profile/avatar-image/{p.id}/') if p.avatar_image else None),"milestoneTier":milestone_tier(p),"xp":p.current_xp,"programmeId":p.programme_id} for p in people_qs.select_related('programme').order_by("programme__name","gamertag")],"groups":[dict(g,memberCount=g.get('member_count',0)) for g in groups]})

@require_http_methods(["POST"])
def assign_avatar(request):
    if not require_role(request,["worker","admin"]): return ok({"detail":"Forbidden"},403)
    body=parse_json(request) or {}
    try: target=Profile.objects.get(id=int(body.get("profileId")),role="youth") if profile_for(request).role=='admin' else Profile.objects.get(id=int(body.get("profileId")),role="youth",programme=active_programme_for(profile_for(request)))
    except (ValueError,TypeError,Profile.DoesNotExist): return ok({"detail":"Young person not found"},404)
    avatar=str(body.get("avatar","orbit"))[:40]
    if avatar not in {"orbit","comet","rocket","star","moon","wave","alex","ben","charlie","daniel","ethan","finley","george","henry","jack","logan","ava","bella","chloe","daisy","ella","freya","grace","holly","isabella","sophie"}: return ok({"detail":"Avatar not available"},400)
    target.avatar=avatar
    if target.avatar_image: target.avatar_image.delete(save=False)
    target.save(update_fields=["avatar","avatar_image"])
    return ok({"ok":True,"avatar":avatar,"milestoneTier":milestone_tier(target)})

@require_http_methods(["POST"])
def assign_avatar_upload(request):
    actor=require_role(request,["worker","admin"])
    if not actor:return ok({"detail":"Forbidden"},403)
    upload=request.FILES.get('avatar')
    if not upload:return ok({'detail':'Choose an avatar image'},400)
    if upload.size>5*1024*1024:return ok({'detail':'Avatar image must be 5 MB or smaller'},400)
    name=os.path.basename(upload.name or '').lower()
    ext=os.path.splitext(name)[1]
    if ext not in {'.jpg','.jpeg','.png'}:return ok({'detail':'Avatar must be JPG, JPEG or PNG'},400)
    if str(upload.content_type or '').lower() not in {'image/jpeg','image/png'}:return ok({'detail':'Avatar must be a JPG, JPEG or PNG image'},400)
    try:
        from PIL import Image, ImageOps, UnidentifiedImageError
        Image.MAX_IMAGE_PIXELS=20_000_000
        raw=upload.read()
        image=Image.open(io.BytesIO(raw))
        image.verify()
        image=Image.open(io.BytesIO(raw))
        image=ImageOps.exif_transpose(image)
        if image.width<32 or image.height<32 or image.width>4096 or image.height>4096:return ok({'detail':'Avatar dimensions must be between 32×32 and 4096×4096 pixels'},400)
        fmt=image.format
        if fmt not in {'JPEG','PNG'}:return ok({'detail':'Avatar must be a JPG, JPEG or PNG image'},400)
        if fmt=='JPEG': image=image.convert('RGB'); out_ext='.jpg'; content_type='image/jpeg'; fmt_out='JPEG'
        else: image=image.convert('RGBA'); out_ext='.png'; content_type='image/png'; fmt_out='PNG'
        buffer=io.BytesIO(); image.save(buffer,format=fmt_out,optimize=True)
    except Exception:
        return ok({'detail':'The avatar file could not be validated as a safe image'},400)
    try: target=Profile.objects.get(id=int(request.POST.get('profileId')),role='youth',user__is_active=True) if actor.role=='admin' else Profile.objects.get(id=int(request.POST.get('profileId')),role='youth',programme=active_programme_for(actor),user__is_active=True)
    except (ValueError,TypeError,Profile.DoesNotExist):return ok({'detail':'Young person not found'},404)
    if target.avatar_image: target.avatar_image.delete(save=False)
    target.avatar_image.save(f'{target.id}{out_ext}',ContentFile(buffer.getvalue()),save=False)
    target.save(update_fields=['avatar_image'])
    AuditLog.objects.create(actor=request.user,action='avatar_uploaded',target=str(target.id),detail={'contentType':content_type,'size':len(buffer.getvalue())})
    return ok({'ok':True,'avatarImageUrl':request.build_absolute_uri(f'/api/profile/avatar-image/{target.id}/'),'milestoneTier':milestone_tier(target),'milestoneColor':milestone_color(target)})

@require_http_methods(["GET","POST"])
def staff_accounts(request):
    actor=require_role(request,['worker','admin'])
    if not actor:return ok({'detail':'Forbidden'},403)
    if request.method=='GET':
        qs=User.objects.filter(profile__isnull=False).select_related('profile','profile__programme').exclude(username__startswith='deleted_') if actor.role=='admin' else User.objects.filter(profile__isnull=False,profile__programme=active_programme_for(actor)).exclude(username__startswith='deleted_').exclude(profile__gamertag='Deleted account').select_related('profile')
        if actor.role=='worker':qs=qs.filter(profile__role='youth')
        q=str(request.GET.get('q','')).strip()
        role=str(request.GET.get('role','')).strip()
        if role in {'youth','worker','admin'}: qs=qs.filter(profile__role=role)
        if q: qs=qs.filter(models.Q(profile__gamertag__icontains=q)|models.Q(username__icontains=q))
        total=qs.count()
        try: page=max(1,int(request.GET.get('page','1')))
        except ValueError: page=1
        try: limit=max(10,min(100,int(request.GET.get('limit','40'))))
        except ValueError: limit=40
        rows=qs.order_by('profile__role','profile__gamertag')[(page-1)*limit:page*limit]
        return ok({'items':[{'userId':u.id,'profileId':u.profile.id,'username':u.username,'gamertag':u.profile.gamertag,'role':u.profile.role,'avatar':u.profile.avatar,'isActive':bool(u.is_active),'programmeId':u.profile.programme_id,'programmeName':u.profile.programme.name if u.profile.programme_id else None} for u in rows],'total':total,'page':page,'limit':limit,'hasMore':page*limit<total})
    body=parse_json(request) or {}
    if body.get('action') == 'reassign_programme':
        if actor.role != 'admin':
            return ok({'detail':'Only administrators can reassign programme membership.'},403)
        try:
            target = User.objects.select_related('profile').get(id=int(body.get('userId')), profile__isnull=False)
            destination = Programme.objects.get(id=int(body.get('programmeId')), active=True, status='active')
        except (TypeError, ValueError, User.DoesNotExist, Programme.DoesNotExist):
            return ok({'detail':'Select a valid account and active destination programme.'},404)
        profile = target.profile
        old_programme_id = profile.programme_id
        if old_programme_id == destination.id:
            return ok({'ok':True,'programmeId':destination.id,'detail':'Account is already assigned to this programme.'})
        with transaction.atomic():
            GroupMembership.objects.filter(profile=profile,status='active',left_at__isnull=True).update(status='transferred',left_at=timezone.now(),changed_by=request.user,reason='Programme reassignment')
            profile.groups.clear()
            profile.programme = destination
            profile.save(update_fields=['programme','updated_at'])
            ProgrammeMembership.objects.get_or_create(user=target,programme=destination)
            AuditLog.objects.create(actor=request.user,programme=destination,action='profile_reassigned_programme',target=str(profile.id),detail={'fromProgrammeId':old_programme_id,'toProgrammeId':destination.id})
        return ok({'ok':True,'programmeId':destination.id})
    if body.get('action') in {'set_access','delete'}:
        try: target=User.objects.select_related('profile').get(id=int(body.get('userId'))) if actor.role=='admin' else User.objects.select_related('profile').get(id=int(body.get('userId')),profile__programme=active_programme_for(actor))
        except (TypeError,ValueError,User.DoesNotExist,Profile.DoesNotExist): return ok({'detail':'Account not found'},404)
        if target.id==request.user.id: return ok({'detail':'You cannot change your own account access here'},400)
        target_profile=target.profile
        if actor.role=='worker' and target_profile.role!='youth':
            return ok({'detail':'Youth workers can only manage player accounts'},403)
        if body.get('action')=='set_access':
            active=bool(body.get('active'))
            if target_profile.role=='admin' and not active and User.objects.filter(is_active=True,profile__role='admin',profile__programme=target_profile.programme).exclude(id=target.id).count()==0:
                return ok({'detail':'The programme must retain at least one active admin'},400)
            target.is_active=active; target.save(update_fields=['is_active'])
            if active:
                GroupMembership.objects.filter(profile=target_profile,status='inactive',left_at__isnull=True).update(status='active',changed_by=request.user,reason='Account reactivated')
            else:
                GroupMembership.objects.filter(profile=target_profile,status='active',left_at__isnull=True).update(status='inactive',changed_by=request.user,reason='Account deactivated')
                RefreshToken.objects.filter(user=target,revoked_at__isnull=True).update(revoked_at=timezone.now())
            AuditLog.objects.create(actor=request.user,action='account_access_changed',target=str(target.id),detail={'active':active,'role':target_profile.role})
            return ok({'ok':True,'isActive':active})
        if target_profile.role=='admin' and User.objects.filter(is_active=True,profile__role='admin',profile__programme=target_profile.programme).exclude(id=target.id).count()==0:
            return ok({'detail':'The programme must retain at least one active admin'},400)
        previous_username=target.username
        target.is_active=False; target.save(update_fields=['is_active'])
        GroupMembership.objects.filter(profile=target_profile,status='active',left_at__isnull=True).update(status='inactive',changed_by=request.user,reason='Account deactivated')
        target_profile.deletion_requested=False; target_profile.save(update_fields=['deletion_requested'])
        RefreshToken.objects.filter(user=target,revoked_at__isnull=True).update(revoked_at=timezone.now())
        AuditLog.objects.create(actor=request.user,action='account_deleted',target=str(target.id),detail={'previousUsername':previous_username,'role':target_profile.role,'softDelete':True})
        return ok({'ok':True,'isActive':False})
    username=str(body.get('username','')).strip(); password=str(body.get('password','')); gamertag=str(body.get('gamertag','Explorer')).strip()[:40] or 'Explorer'; role=str(body.get('role','youth'))
    allowed={'youth'} if actor.role=='worker' else {'youth','worker','admin'}
    if role not in allowed:return ok({'detail':'This role cannot be created by your account'},403)
    if len(username)<3 or len(password)<10:return ok({'detail':'Username must be at least 3 characters and password at least 10 characters'},400)
    if User.objects.filter(username__iexact=username).exists():return ok({'detail':'Username already exists'},409)
    programme=active_programme_for(actor)
    if not programme:return ok({'detail':'No active programme'},400)
    avatar=str(body.get('avatar','orbit')).strip()[:40]
    allowed_avatars={'orbit','comet','rocket','star','moon','wave','alex','ben','charlie','daniel','ethan','finley','george','henry','jack','logan','ava','bella','chloe','daisy','ella','freya','grace','holly','isabella','sophie'}
    if avatar not in allowed_avatars:return ok({'detail':'Avatar not available'},400)
    user=User.objects.create_user(username=username,password=password,is_active=True,is_staff=(role=='admin')); Profile.objects.create(user=user,role=role,gamertag=gamertag,programme=programme,avatar=avatar,must_change_password=True); ProgrammeMembership.objects.create(user=user,programme=programme)
    AuditLog.objects.create(actor=request.user,action='account_created',target=str(user.id),detail={'role':role})
    return ok({'userId':user.id,'username':username,'gamertag':gamertag,'role':role},201)

@require_http_methods(["GET","POST"])
def staff_groups(request):
    actor=require_role(request,['worker','admin'])
    if not actor:return ok({'detail':'Forbidden'},403)
    programme=active_programme_for(actor)
    if not programme and actor.role != 'admin':return ok({'detail':'No active programme'},400)
    if request.method=='GET':
        items=[]
        group_queryset = Group.objects.all() if actor.role == 'admin' else Group.objects.filter(programme=programme)
        for g in group_queryset.prefetch_related('members','programme').order_by('programme__name','name'):
            member_qs=g.members.filter(role='youth',programme=g.programme)
            active_member_qs=member_qs.filter(user__is_active=True)
            member_ids=list(member_qs.values_list('id',flat=True))
            # The group ledger is immutable. Membership edits must never reassign
            # XP earned by a young person before they joined or after they left.
            contribution_total=GroupXPContribution.objects.filter(group=g).aggregate(total=Sum('amount'))['total'] or 0
            total=max(0,int(g.historical_xp or 0)+int(contribution_total))
            if g.xp != total:
                Group.objects.filter(pk=g.pk).update(xp=total)
                g.xp=total
            eligible_qs=member_qs if g.include_inactive_members else active_member_qs
            eligible_people=list(eligible_qs.only('id'))
            eligible_count=len(eligible_people)
            scoring_xp=0
            for person in eligible_people:
                membership=GroupMembership.objects.filter(group=g,profile=person,status__in=['active','inactive'],left_at__isnull=True).order_by('-joined_at').first()
                contributions=GroupXPContribution.objects.filter(group=g,transaction__target=person)
                if membership: contributions=contributions.filter(created_at__gte=membership.joined_at)
                scoring_xp += int(contributions.aggregate(total=Sum('amount'))['total'] or 0)
            scoring_xp = max(0, scoring_xp + int(g.historical_xp or 0))
            average_xp=round(scoring_xp/eligible_count,2) if eligible_count else 0
            tiers=g.tier_targets if isinstance(g.tier_targets,list) else []
            valid_tiers=sorted([x for x in tiers if isinstance(x,dict) and str(x.get('name','')).strip() and str(x.get('xp','')).isdigit() and int(x.get('xp',0))>0],key=lambda x:int(x['xp']))
            next_tier=next((x for x in valid_tiers if total<int(x['xp'])),None)
            items.append({'id':g.id,'name':g.name,'programmeId':g.programme_id,'programmeName':g.programme.name,'xp':total,'memberIds':member_ids,'memberNames':list(member_qs.values_list('gamertag',flat=True)),'activeMemberCount':active_member_qs.count(),'eligibleMembers':eligible_count,'averageXpPerMember':average_xp,'scoringXp':scoring_xp,'includeInactiveMembers':g.include_inactive_members,'tierTargets':valid_tiers,'nextTier':next_tier,'pointsToNext':max(0,int(next_tier['xp'])-total) if next_tier else 0,'progressPercent':min(100,round(total*100/int(next_tier['xp']))) if next_tier else 100})
        return ok({'items':items,'groupScoringConfig':programme.group_scoring_config if programme else {}})
    if not programme:return ok({'detail':'Select an active programme before creating a group'},400)
    body=parse_json(request) or {}; name=str(body.get('name','')).strip()[:120]
    if not name:return ok({'detail':'Group name is required'},400)
    ids=body.get('memberIds',[]) or []
    if not isinstance(ids,list):return ok({'detail':'Member selection must be a list'},400)
    try: ids=[safe_int(x,minimum=1) for x in ids]
    except ValueError:return ok({'detail':'Member selection contains an invalid player id'},400)
    members=Profile.objects.filter(id__in=ids,role='youth',programme=programme,user__is_active=True)
    group=Group.objects.create(name=name,programme=programme); group.members.set(members)
    GroupMembership.objects.filter(group=group,status='active',profile__in=members).update(changed_by=request.user)
    group.xp=0
    group.save(update_fields=['xp'])
    AuditLog.objects.create(actor=request.user,action='group_created',target=str(group.id),detail={'memberIds':list(members.values_list('id',flat=True))})
    return ok({'id':group.id,'name':group.name,'memberIds':list(members.values_list('id',flat=True))},201)

@require_http_methods(["GET", "POST"])
def staff_group_progress(request):
    actor=require_role(request,['worker','admin'])
    if not actor:return ok({'detail':'Forbidden'},403)
    programme=active_programme_for(actor)
    if not programme and actor.role != 'admin':return ok({'detail':'No active programme'},400)
    if request.method=='GET':
        # Reuse the canonical list calculation, including exact ledger totals.
        return staff_groups(request)
    body=parse_json(request) or {}
    try: group_id=safe_int(body.get('groupId'),minimum=1)
    except ValueError:return ok({'detail':'Invalid group'},400)
    group=(Group.objects.filter(pk=group_id).first() if actor.role=='admin' else Group.objects.filter(pk=group_id,programme=programme).first())
    if not group:return ok({'detail':'Group not found'},404)
    tiers=body.get('tiers')
    if not isinstance(tiers,list) or len(tiers)>20:return ok({'detail':'Provide up to 20 tier targets'},400)
    cleaned=[]; seen=set()
    for item in tiers:
        if not isinstance(item,dict):return ok({'detail':'Each tier must be an object'},400)
        name=str(item.get('name','')).strip()[:80]
        try: threshold=safe_int(item.get('xp'),minimum=1,maximum=100000000)
        except ValueError:return ok({'detail':'Tier XP must be a positive whole number'},400)
        if not name:return ok({'detail':'Each tier needs a name'},400)
        if threshold in seen:return ok({'detail':'Tier thresholds must be unique'},400)
        seen.add(threshold);cleaned.append({'name':name,'xp':threshold,'prize':str(item.get('prize','')).strip()[:160]})
    group.tier_targets=sorted(cleaned,key=lambda x:x['xp']);group.save(update_fields=['tier_targets'])
    # If targets are configured after a group has already passed them, unlock them immediately.
    for tier in group.tier_targets:
        if int(tier['xp']) <= int(group.xp or 0):
            unlock,created=GroupTierUnlock.objects.get_or_create(group=group,threshold=int(tier['xp']),defaults={'tier_name':tier['name'],'prize':tier['prize']})
            if created:
                prize_text=f" Prize: {unlock.prize}." if unlock.prize else ''
                for member in group.members.filter(role='youth',programme_id=group.programme_id,user__is_active=True):
                    create_notification(profile=member,title=f"{group.name} unlocked {unlock.tier_name}!",body=f"Your group reached {unlock.threshold:,} XP.{prize_text}",kind='reward',url='/rewards')
    AuditLog.objects.create(actor=request.user,programme=group.programme,action='group_tiers_updated',target=str(group.id),detail={'tiers':group.tier_targets})
    return ok({'ok':True,'tiers':group.tier_targets})

@require_http_methods(["POST"])
def assign_group_members(request):
    actor=require_role(request,['worker','admin'])
    if not actor:return ok({'detail':'Forbidden'},403)
    body=parse_json(request) or {}
    try: group_id=safe_int(body.get('groupId'),minimum=1)
    except ValueError:return ok({'detail':'Invalid group'},400)
    group=(Group.objects.filter(id=group_id).first() if actor.role=='admin' else Group.objects.filter(id=group_id,programme=active_programme_for(actor)).first())
    if not group:return ok({'detail':'Group not found'},404)
    member_ids=body.get('memberIds') or []
    if not isinstance(member_ids,list):return ok({'detail':'Member selection must be a list'},400)
    try: member_ids=[safe_int(x,minimum=1) for x in member_ids]
    except ValueError:return ok({'detail':'Member selection contains an invalid player id'},400)
    include_inactive_members=body.get('includeInactiveMembers', group.include_inactive_members)
    change_reason=str(body.get('reason','')).strip()[:240]
    if not isinstance(include_inactive_members, bool):
        return ok({'detail':'Include inactive members must be true or false'},400)
    with transaction.atomic():
        group=Group.objects.select_for_update().get(pk=group.pk)
        if group.include_inactive_members != include_inactive_members:
            GroupScoringPolicyHistory.objects.create(
                group=group, include_inactive_members=include_inactive_members, changed_by=request.user,
            )
        group.include_inactive_members=include_inactive_members
        previous_ids=set(group.members.filter(role='youth').values_list('id',flat=True))
        members=Profile.objects.filter(id__in=member_ids,role='youth',programme=group.programme).filter(Q(user__is_active=True)|Q(id__in=previous_ids))
        current_ids=set(members.values_list('id',flat=True))
        removed_ids=previous_ids-current_ids
        if removed_ids:
            for removed_id in removed_ids:
                has_other_group = Profile.objects.filter(
                    pk=removed_id, groups__programme=group.programme,
                ).exclude(groups=group).exists()
                GroupMembership.objects.filter(group=group,profile_id=removed_id,status__in=['active','inactive']).update(
                    status='transferred' if has_other_group else 'withdrawn',
                    left_at=timezone.now(), changed_by=request.user,
                    reason=change_reason or ('Transferred to another group' if has_other_group else 'Removed from group by staff'),
                )
        group.members.set(members)
        GroupMembership.objects.filter(group=group,status='active',profile_id__in=current_ids,changed_by__isnull=True).update(changed_by=request.user)
        if change_reason:
            GroupMembership.objects.filter(group=group,status='active',profile_id__in=current_ids).update(reason=change_reason)
        # Recompute only from the group's own immutable contribution ledger.
        contribution_total=GroupXPContribution.objects.filter(group=group).aggregate(total=Sum('amount'))['total'] or 0
        group.xp=max(0,int(group.historical_xp or 0)+int(contribution_total))
        group.save(update_fields=['xp','include_inactive_members'])
    newly_added=members.exclude(id__in=previous_ids)
    for member in newly_added: create_notification(profile=member,title='Group updated',body=f'You are now in {group.name}.',kind='group',url='/')
    AuditLog.objects.create(actor=request.user,programme=group.programme,action='group_membership_updated',target=str(group.id),detail={'addedProfileIds':list(newly_added.values_list('id',flat=True)),'removedProfileIds':sorted(removed_ids),'includeInactiveMembers':include_inactive_members,'reason':change_reason})
    return ok({'ok':True,'memberIds':list(members.values_list('id',flat=True)),'notifiedCount':newly_added.count()})

@require_http_methods(["GET","POST"])
def staff_rewards(request):
    actor=require_role(request,['worker','admin'])
    if not actor:return ok({'detail':'Forbidden'},403)
    if request.method=='GET':
        programme=active_programme_for(actor)
        rewards=list(Reward.objects.filter(programme=programme,active=True).values('id','name','description','start_at','end_at','awards','fallback_xp'))
        assignment_rows=list(RewardAssignment.objects.filter(active=True,reward__programme=programme).select_related('reward','target_group','target_profile').order_by('reward_id','id'))
        groups=list(Group.objects.filter(programme=programme).prefetch_related('members').order_by('name'))
        youth=list(Profile.objects.filter(role='youth',programme=programme,user__is_active=True).values('id','gamertag','avatar'))
        assignment_items=[]
        covered_profiles=set()
        active_group_assignments=[a for a in assignment_rows if a.target_group_id]
        for a in active_group_assignments:
            member_list=[m for m in a.target_group.members.all() if m.role=='youth' and m.programme_id==programme.id and m.user.is_active]
            member_ids={m.id for m in member_list}
            if not member_ids: continue
            assignment_items.append({'id':a.id,'reward_id':a.reward_id,'target_group_id':a.target_group_id,'target_profile_id':None,'playerCount':len(member_ids),'assignmentIds':[a.id]})
            covered_profiles.update((a.reward_id,pid) for pid in member_ids)
        for a in assignment_rows:
            if a.target_group_id or (a.target_profile_id and (a.reward_id,a.target_profile_id) in covered_profiles): continue
            assignment_items.append({'id':a.id,'reward_id':a.reward_id,'target_group_id':None,'target_profile_id':a.target_profile_id,'playerCount':1,'assignmentIds':[a.id]})
        group_payload=[{'id':g.id,'name':g.name,'memberCount':sum(1 for m in g.members.all() if m.role=='youth' and m.programme_id==programme.id and m.user.is_active)} for g in groups]
        fulfillments=list(RewardFulfillment.objects.filter(claim__reward__programme=programme,claim__award_type__in=['physical','voucher','other']).select_related('claim','claim__reward','claim__profile','fulfilled_by').order_by('-created_at')[:200].values('id','status','notes','fulfilled_at','created_at','claim_id','claim__award_name','claim__amount','claim__reward__name','claim__profile__id','claim__profile__gamertag'))
        return ok({'items':rewards,'assignments':assignment_items,'groups':group_payload,'youth':youth,'fulfillments':fulfillments})
    body=parse_json(request) or {}
    if body.get('action')=='assignment_players':
        try:
            assignment=RewardAssignment.objects.select_related('reward','target_group','target_profile').get(
                pk=int(body.get('assignmentId')), reward__programme=active_programme_for(actor), active=True
            )
        except (TypeError,ValueError,RewardAssignment.DoesNotExist):
            return ok({'detail':'Assignment not found'},404)
        if assignment.target_group_id:
            names=list(assignment.target_group.members.filter(
                role='youth', programme=active_programme_for(actor), user__is_active=True
            ).order_by('gamertag').values_list('gamertag',flat=True))
        elif assignment.target_profile_id:
            names=[assignment.target_profile.gamertag]
        else:
            names=[]
        return ok({'assignmentId':assignment.id,'playerCount':len(names),'players':names})
    if body.get('action')=='fulfill':
        try: fulfillment=RewardFulfillment.objects.select_related('claim','claim__reward','claim__profile').get(pk=int(body.get('fulfillmentId')),claim__reward__programme=active_programme_for(actor),claim__award_type__in=['physical','voucher','other'])
        except (TypeError,ValueError,RewardFulfillment.DoesNotExist): return ok({'detail':'Reward transaction not found'},404)
        if fulfillment.status=='fulfilled': return ok({'detail':'This reward is already marked as fulfilled'},409)
        fulfillment.status='fulfilled'; fulfillment.fulfilled_by=request.user; fulfillment.fulfilled_at=timezone.now(); fulfillment.notes=str(body.get('notes','')).strip()[:240]; fulfillment.save(update_fields=['status','fulfilled_by','fulfilled_at','notes'])
        AuditLog.objects.create(actor=request.user,action='reward_fulfilled',target=str(fulfillment.claim_id),detail={'award':fulfillment.claim.award_name,'profileId':fulfillment.claim.profile_id})
        return ok({'ok':True,'status':'fulfilled'})
    if body.get('action')=='update':
        try: reward=Reward.objects.get(pk=int(body.get('rewardId')),programme=active_programme_for(actor),active=True)
        except (TypeError,ValueError,Reward.DoesNotExist): return ok({'detail':'Scratch card not found'},404)
        name=str(body.get('name',reward.name)).strip()[:120]
        awards=body.get('awards',[])
        if not name or not isinstance(awards,list) or not awards:return ok({'detail':'A scratch card needs a name and at least one award'},400)
        old=list(reward.awards) if isinstance(reward.awards,list) else []
        clean=[]
        for i,a in enumerate(awards[:30]):
            if not isinstance(a,dict): continue
            an=str(a.get('name','')).strip()[:120]
            if not an: continue
            try: quantity=max(1,int(str(a.get('quantity',1)).lstrip('0') or '1'))
            except (TypeError,ValueError): quantity=1
            try: weight=max(1,int(str(a.get('weightage',a.get('weight',1))).lstrip('0') or '1'))
            except (TypeError,ValueError): weight=1
            try: amount=max(0,int(str(a.get('xp',a.get('value',0))).lstrip('0') or '0'))
            except (TypeError,ValueError): amount=0
            atype=str(a.get('type','xp')).strip().lower()
            if atype not in {'xp','physical','voucher','other'}: atype='other'
            value=str(a.get('value',amount if atype=='xp' else '')).strip()[:160]
            previous=old[i] if i < len(old) and isinstance(old[i],dict) else {}
            previous_qty=max(1,int(previous.get('quantity',quantity) or quantity))
            previous_remaining=max(0,int(previous.get('remaining',previous_qty) or 0))
            consumed=max(0,previous_qty-previous_remaining)
            remaining=max(0,quantity-consumed)
            clean.append({'name':an,'type':atype,'value':value,'xp':amount if atype=='xp' else 0,'quantity':quantity,'remaining':remaining,'weightage':weight,'available':bool(a.get('available',True))})
        if not clean:return ok({'detail':'Add at least one valid award'},400)
        def _reward_dt_update(value, fallback):
            if value in (None,''): return fallback
            if str(value).strip().upper()=='NOW': return timezone.now()
            parsed=timezone.datetime.fromisoformat(str(value).replace('Z','+00:00'))
            return timezone.make_aware(parsed, timezone.get_current_timezone()) if timezone.is_naive(parsed) else parsed
        try:
            start_at=_reward_dt_update(body.get('startAt'),reward.start_at)
            end_at=_reward_dt_update(body.get('endAt'),reward.end_at)
            if end_at and start_at and end_at<=start_at:return ok({'detail':'End date/time must be after start date/time'},400)
        except Exception:return ok({'detail':'Invalid reward date/time'},400)
        try: fallback_xp=max(0,int(str(body.get('fallbackXp',reward.fallback_xp)).lstrip('0') or '0'))
        except (TypeError,ValueError): fallback_xp=int(reward.fallback_xp or 0)
        reward.name=name; reward.description=str(body.get('description',reward.description)).strip()[:240]; reward.start_at=start_at; reward.end_at=end_at; reward.awards=clean; reward.fallback_xp=fallback_xp
        reward.save(update_fields=['name','description','start_at','end_at','awards','fallback_xp'])
        AuditLog.objects.create(actor=request.user,action='scratch_card_reconfigured',target=str(reward.id),detail={'awardCount':len(clean)})
        return ok({'ok':True,'id':reward.id})
    if body.get('action')=='delete':
        try: reward=Reward.objects.get(pk=int(body.get('rewardId')),programme=active_programme_for(actor),active=True)
        except (TypeError,ValueError,Reward.DoesNotExist): return ok({'detail':'Scratch card not found'},404)
        reward_id=reward.id
        reward.active=False
        reward.save(update_fields=['active'])
        RewardAssignment.objects.filter(reward=reward,active=True).update(active=False)
        AuditLog.objects.create(actor=request.user,action='scratch_card_deleted',target=str(reward_id),detail={'softDelete':True})
        return ok({'ok':True})
    if body.get('action')=='assign':
        try: reward=Reward.objects.get(pk=int(body.get('rewardId')),programme=active_programme_for(actor),active=True)
        except (TypeError,ValueError,Reward.DoesNotExist): return ok({'detail':'Scratch card not found'},404)
        target_type=str(body.get('targetType','group'))
        try: target_id=int(body.get('targetId'))
        except (TypeError,ValueError): return ok({'detail':'Choose a valid player or group'},400)
        programme=active_programme_for(actor)
        if target_type=='group':
            target=Group.objects.filter(pk=target_id,programme=programme).first()
            if not target:return ok({'detail':'Group not found'},404)
            members=list(target.members.filter(role='youth',programme=programme,user__is_active=True))
            if not members:return ok({'detail':'This group has no active young people to receive the scratch card.'},400)
            if RewardAssignment.objects.filter(reward=reward,active=True,target_group=target).exists(): return ok({'detail':'This scratch card is already assigned to this group'},409)
            if RewardAssignment.objects.filter(reward=reward,active=True,target_profile__isnull=False,target_profile__groups=target).exists(): return ok({'detail':'This scratch card is already assigned directly to a member of that group'},409)
            group_assignment=RewardAssignment.objects.create(reward=reward,target_group=target,assigned_by=request.user,active=True)
            for member in members:
                RewardAssignment.objects.get_or_create(reward=reward,target_profile=member,active=True,defaults={'assigned_by':request.user})
                create_notification(profile=member,title='New reward available',body=f'{reward.name} is now available.',kind='reward',url='/rewards')
            AuditLog.objects.create(actor=request.user,action='scratch_card_assigned',target=str(reward.id),detail={'assignmentId':group_assignment.id,'targetType':'group','targetId':target_id,'updatedCount':len(members)})
            return ok({'assignmentId':group_assignment.id,'updatedCount':len(members)},201)
        if target_type=='youth':
            target=Profile.objects.filter(pk=target_id,role='youth',programme=programme,user__is_active=True).first()
            if not target:return ok({'detail':'Young person not found'},404)
            if RewardAssignment.objects.filter(reward=reward,active=True,target_profile=target).exists(): return ok({'detail':'This scratch card is already assigned to this young person'},409)
            if RewardAssignment.objects.filter(reward=reward,active=True,target_group__members=target).exists(): return ok({'detail':'This scratch card is already assigned to this young person through a group'},409)
            assignment=RewardAssignment.objects.create(reward=reward,target_profile=target,assigned_by=request.user,active=True)
            create_notification(profile=target,title='New reward available',body=f'{reward.name} is now available.',kind='reward',url='/rewards')
            AuditLog.objects.create(actor=request.user,action='scratch_card_assigned',target=str(reward.id),detail={'assignmentId':assignment.id,'targetType':'youth','targetId':target_id})
            return ok({'assignmentId':assignment.id,'updatedCount':1},201)
        return ok({'detail':'Invalid assignment target'},400)
    if body.get('action')=='unassign':
        try: assignment=RewardAssignment.objects.select_related('target_group','reward').get(pk=int(body.get('assignmentId')),reward__programme=active_programme_for(actor),active=True)
        except (TypeError,ValueError,RewardAssignment.DoesNotExist): return ok({'detail':'Assignment not found'},404)
        assignment.active=False; assignment.save(update_fields=['active'])
        deactivated=[assignment.id]
        if assignment.target_group_id:
            member_ids=list(assignment.target_group.members.filter(role='youth',programme=active_programme_for(actor)).values_list('id',flat=True))
            qs=RewardAssignment.objects.filter(reward=assignment.reward,active=True,target_profile_id__in=member_ids)
            deactivated += list(qs.values_list('id',flat=True)); qs.update(active=False)
        AuditLog.objects.create(actor=request.user,action='scratch_card_unassigned',target=str(assignment.reward_id),detail={'assignmentId':assignment.id,'deactivatedAssignmentIds':deactivated})
        return ok({'ok':True,'deactivatedCount':len(deactivated)})
    name=str(body.get('name','')).strip()[:120]
    awards=body.get('awards',[])
    if not name or not isinstance(awards,list) or not awards:return ok({'detail':'A scratch card needs a name and at least one award'},400)
    clean=[]
    for a in awards[:30]:
        if not isinstance(a,dict):continue
        an=str(a.get('name','')).strip()[:120]
        try: amount=max(0,int(str(a.get('xp',0)).lstrip('0') or '0'))
        except (TypeError,ValueError): amount=0
        try: quantity=max(1,int(str(a.get('quantity',1)).lstrip('0') or '1'))
        except (TypeError,ValueError): quantity=1
        if an:
            try: weight=max(1,int(str(a.get('weightage',a.get('weight',1))).lstrip('0') or '1'))
            except (TypeError,ValueError): weight=1
            atype=str(a.get('type','xp')).strip().lower()
            if atype not in {'xp','physical','voucher','other'}: atype='other'
            value=str(a.get('value',amount if atype=='xp' else '')).strip()[:160]
            clean.append({'name':an,'type':atype,'value':value,'xp':amount if atype=='xp' else 0,'quantity':quantity,'remaining':quantity,'weightage':weight,'available':bool(a.get('available',True))})
    if not clean:return ok({'detail':'Add at least one valid award'},400)
    start_at=body.get('startAt') or 'NOW'; end_at=body.get('endAt') or (timezone.now()+timedelta(hours=24)).isoformat()
    if start_at and end_at:
        try:
            sa=timezone.now() if str(start_at).strip().upper()=='NOW' else timezone.datetime.fromisoformat(str(start_at).replace('Z','+00:00')); ea=timezone.datetime.fromisoformat(str(end_at).replace('Z','+00:00'))
            if timezone.is_naive(sa): sa=timezone.make_aware(sa)
            if timezone.is_naive(ea): ea=timezone.make_aware(ea)
            if sa < timezone.now().replace(second=0,microsecond=0):return ok({'detail':'Start date/time has already passed'},400)
            if ea<=sa:return ok({'detail':'End date/time must be after start date/time'},400)
        except Exception:return ok({'detail':'Invalid reward date/time'},400)
    
    try: fallback_xp=max(0,int(str(body.get('fallbackXp',0)).lstrip('0') or '0'))
    except (TypeError,ValueError): fallback_xp=0
    def _reward_dt(value):
        if str(value).strip().upper()=='NOW': return timezone.now()
        raw=str(value).replace('Z','+00:00')
        parsed=timezone.datetime.fromisoformat(raw)
        return timezone.make_aware(parsed, timezone.get_current_timezone()) if timezone.is_naive(parsed) else parsed
    start_at=_reward_dt(start_at); end_at=_reward_dt(end_at)
    if start_at < timezone.now().replace(second=0,microsecond=0):
        start_at=timezone.now()
    if end_at <= start_at:
        end_at=start_at+timedelta(hours=24)
    r=Reward.objects.create(programme=active_programme_for(actor),name=name,description=str(body.get('description','')).strip()[:240],cost_xp=0,start_at=start_at,end_at=end_at,awards=clean,fallback_xp=fallback_xp,active=True)
    AuditLog.objects.create(actor=request.user,action='scratch_card_configured',target=str(r.id),detail={'awardCount':len(clean)})
    return ok({'id':r.id},201)

@require_http_methods(["GET", "POST"])
def game_assignments(request):
    actor = require_role(request, ['worker', 'admin'])
    if not actor:
        return ok({'detail': 'Forbidden'}, 403)
    programme = active_programme_for(actor)
    if not programme:
        return ok({'detail': 'No active programme'}, 400)

    def parse_game_datetime(value, required=False):
        if value in (None, ''):
            if required:
                raise ValueError('required')
            return None
        if str(value).strip().upper()=='NOW':
            return timezone.now()
        raw = str(value).strip().replace('Z', '+00:00')
        if 'T' in raw:
            date_part, time_part = raw.split('T', 1)
            if len(time_part) >= 4 and time_part[1] == ':':
                raw = f'{date_part}T0{time_part}'
        dt = timezone.datetime.fromisoformat(raw)
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt

    if request.method == 'GET':
        games = list(Challenge.objects.filter(programme=programme).order_by('-active', '-start_at', '-id').values(
            'id','title','description','xp_reward','start_at','end_at','due_at','kind','shape','score_ranges','game_config','retries_per_player','scoring_policy','active'))
        groups = list(Group.objects.filter(programme=programme).values('id','name'))
        youth = list(Profile.objects.filter(role='youth', programme=programme).values('id','gamertag','avatar'))
        assignments = list(GameAssignment.objects.filter(game__programme=programme).order_by('-active','-assigned_at','-id').values(
            'id','game_id','game__title','target_group_id','target_group__name','target_profile_id','target_profile__gamertag','due_at','assigned_at','active'))
        return ok({'games':games,'groups':groups,'youth':youth,'assignments':assignments})

    body = parse_json(request) or {}
    action = str(body.get('action','')).strip()

    if action in {'revoke_assignment','reassign_assignment'}:
        try:
            assignment = GameAssignment.objects.get(id=int(body.get('assignmentId')), game__programme=programme)
        except (TypeError,ValueError,GameAssignment.DoesNotExist):
            return ok({'detail':'Game assignment not found'},404)
        if action == 'revoke_assignment':
            if not assignment.active:
                return ok({'detail':'This assignment is already revoked'},400)
            assignment.active=False
            assignment.save(update_fields=['active'])
            AuditLog.objects.create(actor=request.user,action='game_assignment_revoked',target=str(assignment.id),detail={'gameId':assignment.game_id})
            return ok({'ok':True,'active':False})
        group = Group.objects.filter(id=body.get('groupId'),programme=programme).first() if body.get('groupId') else None
        profile = Profile.objects.filter(id=body.get('profileId'),role='youth',programme=programme,user__is_active=True).first() if body.get('profileId') else None
        if bool(group)==bool(profile):
            return ok({'detail':'Choose one group or one young person'},400)
        if group and GameAssignment.objects.filter(game=assignment.game,active=True,target_group=group).exists():
            return ok({'detail':'This game is already assigned to that group'},409)
        if profile and GameAssignment.objects.filter(game=assignment.game,active=True,target_profile=profile).exists():
            return ok({'detail':'This game is already assigned to that young person'},409)
        if not assignment.game.active:
            assignment.game.active=True
            assignment.game.save(update_fields=['active'])
            AuditLog.objects.create(actor=request.user,action='game_restored',target=str(assignment.game_id),detail={'reason':'assignment_reactivated'})
        # A reassignment is a new assignment lifecycle. Keeping the old row inactive
        # preserves audit/history while the new row gets a fresh assigned_at timestamp.
        # This is important for drawing retries: previous submissions must not make a
        # freshly reassigned game appear completed.
        with transaction.atomic():
            assignment.active=False
            assignment.save(update_fields=['active'])
            new_assignment=GameAssignment.objects.create(
                game=assignment.game,
                assigned_by=request.user,
                target_group=group,
                target_profile=profile,
                due_at=body.get('dueAt') or assignment.game.due_at,
                active=True,
            )
            AuditLog.objects.create(actor=request.user,action='game_assignment_reassigned',target=str(new_assignment.id),detail={
                'gameId':assignment.game_id,
                'previousAssignmentId':assignment.id,
                'profileId':profile.id if profile else None,
                'groupId':group.id if group else None,
            })
        return ok({'ok':True,'id':new_assignment.id,'previousAssignmentId':assignment.id,'active':True})

    if action == 'delete_game':
        try:
            game = Challenge.objects.get(id=int(body.get('gameId')),programme=programme)
        except (TypeError,ValueError,Challenge.DoesNotExist):
            return ok({'detail':'Game not found'},404)
        game.active=False
        game.assignments.filter(active=True).update(active=False)
        game.save(update_fields=['active'])
        AuditLog.objects.create(actor=request.user,action='game_deleted',target=str(game.id),detail={'title':game.title,'softDelete':True})
        return ok({'ok':True,'active':False})

    game_id = body.get('gameId')
    creating = not game_id
    if creating:
        title=str(body.get('title','')).strip()[:120]; kind=str(body.get('kind','activity'))
        if not title or kind not in {'activity','drawing',*GAME_TYPES.keys()}: return ok({'detail':'Title and valid game type are required'},400)
        try: xp_reward=int(body.get('xpReward',100))
        except (TypeError,ValueError): xp_reward=100
        if xp_reward<0 or xp_reward>5000: return ok({'detail':'XP reward must be between 0 and 5000'},400)
        shape=str(body.get('shape','circle')).lower() if kind=='drawing' else 'circle'
        if shape not in {'circle','triangle','rectangle','pentagon','hexagon'}: return ok({'detail':'Unsupported drawing shape'},400)
        ranges=body.get('scoreRanges',[]) if kind in {'drawing',*GAME_TYPES.keys()} else []
        if not isinstance(ranges,list): return ok({'detail':'Score ranges must be a list'},400)
        clean_ranges=[]
        for r in ranges[:10]:
            try:
                mn=max(0,min(100,int(r.get('min',0)))); mx=max(0,min(100,int(r.get('max',100)))); pts=max(0,min(5000,int(r.get('xp',0))))
            except (AttributeError,TypeError,ValueError): continue
            if mn<=mx: clean_ranges.append({'min':mn,'max':mx,'xp':pts})
        if kind == 'drawing':
            if not clean_ranges: clean_ranges=DEFAULT_RANGES.copy()
            ordered=sorted(clean_ranges,key=lambda x:x['min'],reverse=True)
            if not ordered or ordered[0]['max']!=100 or ordered[-1]['min']!=0 or any(ordered[i]['min']!=ordered[i+1]['max']+1 for i in range(len(ordered)-1)):
                return ok({'detail':'Drawing scoring ranges must cover 0–100% continuously without gaps or overlaps'},400)
        elif kind in GAME_TYPES:
            clean_ranges=[]
        try:
            start_at=parse_game_datetime(body.get('startAt')) or timezone.now(); end_at=parse_game_datetime(body.get('endAt')) or (start_at + timedelta(hours=24))
        except (ValueError,TypeError): return ok({'detail':'Invalid game date/time. Use a valid date and time.'},400)
        if start_at < timezone.now() - timedelta(minutes=2): return ok({'detail':'Start date/time has already passed'},400)
        if end_at<=start_at: return ok({'detail':'End date/time must be after the start date/time'},400)
        try: retries=max(1,min(20,int(body.get('retries',3))))
        except (TypeError,ValueError): retries=3
        scoring_policy=str(body.get('scoringPolicy','best')).lower()
        if scoring_policy not in {'best','last'}: scoring_policy='best'
        game_config=body.get('gameConfig') if isinstance(body.get('gameConfig'),dict) else {}
        if kind in GAME_TYPES:
            scoring=game_config.get('scoring')
            if not isinstance(scoring,list) or not scoring:
                return ok({'detail':'Add at least one game-specific scoring rule'},400)
            for row in scoring[:20]:
                if not isinstance(row,dict): return ok({'detail':'Invalid game scoring rule'},400)
                try:
                    pts=int(row.get('xp',-1))
                    if pts<0 or pts>5000: raise ValueError
                    key='maxMs' if kind=='reaction' else 'minWpm' if kind=='typing' else 'min'
                    threshold=float(row.get(key))
                    limits={'maxMs':(80,5000),'minWpm':(0,200),'min':(1,1000)}
                    lo,hi=limits[key]
                    if threshold<lo or threshold>hi: raise ValueError
                except (TypeError,ValueError):
                    return ok({'detail':f'Invalid {kind} scoring rule'},400)
        if kind in GAME_TYPES and not isinstance(body.get('scoreRanges'),list): clean_ranges=[]
        game=Challenge.objects.create(programme=programme,title=title,description=str(body.get('description','')).strip()[:300],kind=kind,xp_reward=xp_reward,start_at=start_at,end_at=end_at,shape=shape,score_ranges=clean_ranges,retries_per_player=retries,scoring_policy=scoring_policy,game_config=game_config,active=True)
        AuditLog.objects.create(actor=request.user,action='game_created',target=str(game.id),detail={'kind':kind,'xp':xp_reward,'shape':shape,'retries':retries})
    else:
        try: game=Challenge.objects.get(id=int(game_id),programme=programme)
        except (TypeError,ValueError,Challenge.DoesNotExist): return ok({'detail':'Game not found'},404)
        if 'title' in body and body['title']: game.title=str(body['title']).strip()[:120]
        if 'description' in body: game.description=str(body['description']).strip()[:300]
        if 'kind' in body and str(body['kind']) in {'drawing','activity',*GAME_TYPES.keys()}: game.kind=str(body['kind'])
        if 'gameConfig' in body and isinstance(body['gameConfig'],dict):
            next_config=body['gameConfig']
            if game.kind in GAME_TYPES:
                scoring=next_config.get('scoring')
                if not isinstance(scoring,list) or not scoring: return ok({'detail':'Add at least one game-specific scoring rule'},400)
            game.game_config=next_config
        if 'xpReward' in body: game.xp_reward=max(0,min(5000,int(body['xpReward'])))
        if 'startAt' in body:
            try: game.start_at=parse_game_datetime(body.get('startAt')) or timezone.now()
            except (ValueError,TypeError): return ok({'detail':'Invalid start date/time'},400)
        if 'endAt' in body:
            try: game.end_at=parse_game_datetime(body.get('endAt')) or (game.start_at + timedelta(hours=24) if game.start_at else timezone.now()+timedelta(hours=24))
            except (ValueError,TypeError): return ok({'detail':'Invalid end date/time'},400)
        if game.start_at and game.end_at and game.end_at<=game.start_at: return ok({'detail':'End date/time must be after the start date/time'},400)
        if 'shape' in body and str(body['shape']) in {'circle','triangle','rectangle','pentagon','hexagon'}: game.shape=str(body['shape'])
        if 'scoreRanges' in body and isinstance(body['scoreRanges'],list):
            if game.kind == 'drawing':
                try: normalized=sorted([{'min':max(0,min(100,int(r.get('min',0)))),'max':max(0,min(100,int(r.get('max',100)))),'xp':max(0,min(5000,int(r.get('xp',0))))} for r in body['scoreRanges']],key=lambda x:x['min'],reverse=True)
                except (TypeError,ValueError,AttributeError): return ok({'detail':'Invalid drawing scoring ranges'},400)
                if not normalized or normalized[0]['max']!=100 or normalized[-1]['min']!=0 or any(normalized[i]['min']!=normalized[i+1]['max']+1 for i in range(len(normalized)-1)): return ok({'detail':'Drawing scoring ranges must cover 0–100% continuously without gaps or overlaps'},400)
                game.score_ranges=normalized
            elif game.kind in GAME_TYPES:
                game.score_ranges=[]
        if 'retries' in body: game.retries_per_player=max(1,min(20,int(body['retries'])))
        if 'scoringPolicy' in body and str(body['scoringPolicy']).lower() in {'best','last'}: game.scoring_policy=str(body['scoringPolicy']).lower()
        if 'active' in body: game.active=bool(body['active'])
        game.save()
        AuditLog.objects.create(actor=request.user,action='game_updated',target=str(game.id),detail={'title':game.title})

    # A game definition can be edited without assigning it again.
    profile_ids = body.get('profileIds') if isinstance(body.get('profileIds'), list) else None
    if not body.get('groupId') and not body.get('profileId') and not profile_ids:
        return ok({'id':game.id,'updated':True},200 if not creating else 201)
    group=Group.objects.filter(id=body.get('groupId'),programme=programme).first() if body.get('groupId') else None
    if group:
        profiles=list(Profile.objects.filter(id__in=profile_ids or [],role='youth',programme=programme,user__is_active=True)) if profile_ids else []
        if profiles:
            return ok({'detail':'Choose either a group or young people, not both.'},400)
        direct_rows=list(GameAssignment.objects.filter(game=game,active=True,target_profile__isnull=False,target_profile__groups=group).select_related('target_profile'))
        for direct in direct_rows:
            profile=direct.target_profile
            if game.kind=='drawing':
                played=DrawingSubmission.objects.filter(profile=profile,game=game,created_at__gte=direct.assigned_at).exists()
            elif game.kind in GAME_TYPES:
                played=GameAttempt.objects.filter(profile=profile,game=game,assignment=direct,status='completed',started_at__gte=direct.assigned_at).exists()
            else:
                played=False
            if not played:
                return ok({'detail':f'This game is already assigned to {profile.gamertag} and has not been used yet.'},409)
            direct.active=False
            direct.save(update_fields=['active'])
            AuditLog.objects.create(actor=request.user,action='game_assignment_reassigned',target=str(direct.id),detail={'gameId':game.id,'profileId':profile.id,'reason':'completed_lifecycle_reassigned_to_group'})
        existing_group=GameAssignment.objects.filter(game=game,active=True,target_group=group).first()
        if existing_group:
            members=list(group.members.filter(role='youth',programme=programme,user__is_active=True))
            incomplete=[]
            for profile in members:
                if game.kind=='drawing':
                    played=DrawingSubmission.objects.filter(profile=profile,game=game,created_at__gte=existing_group.assigned_at).exists()
                elif game.kind in GAME_TYPES:
                    played=GameAttempt.objects.filter(profile=profile,game=game,assignment=existing_group,status='completed',started_at__gte=existing_group.assigned_at).exists()
                else:
                    played=False
                if not played: incomplete.append(profile.gamertag)
            if incomplete:
                return ok({'detail':f'This game is still active for {", ".join(incomplete[:3])}.'},409)
            existing_group.active=False
            existing_group.save(update_fields=['active'])
            AuditLog.objects.create(actor=request.user,action='game_assignment_reassigned',target=str(existing_group.id),detail={'gameId':game.id,'groupId':group.id,'reason':'completed_group_lifecycle_reassigned'})
        assignment=GameAssignment.objects.create(game=game,assigned_by=request.user,target_group=group,due_at=body.get('dueAt') or game.due_at)
        members=group.members.filter(role='youth',programme=programme,user__is_active=True)
        for member in members: create_notification(profile=member,title='New game assigned',body=f'{game.title} is ready in Games.',kind='game',url='/challenges')
        return ok({'id':assignment.id,'count':1},201)
    raw_ids = profile_ids if profile_ids is not None else ([body.get('profileId')] if body.get('profileId') else [])
    try: raw_ids=[int(x) for x in raw_ids]
    except (TypeError,ValueError): return ok({'detail':'Choose valid young people'},400)
    raw_ids=list(dict.fromkeys(raw_ids))[:200]
    profiles=list(Profile.objects.filter(id__in=raw_ids,role='youth',programme=programme,user__is_active=True))
    if not profiles:return ok({'detail':'Choose at least one young person'},400)
    if GameAssignment.objects.filter(game=game,active=True,target_group__members__in=profiles).exists(): return ok({'detail':'One or more players already receive this game through a group'},409)
    existing_rows={
        row.target_profile_id: row
        for row in GameAssignment.objects.filter(game=game,active=True,target_profile_id__in=[x.id for x in profiles]).select_related('game')
    }
    created=[]
    for profile in profiles:
        existing=existing_rows.get(profile.id)
        if existing:
            # A completed lifecycle may be assigned again.  Keep the old lifecycle
            # as immutable history and create a fresh assignment so the player gets
            # a fresh attempt window.  An unfinished active assignment is still a
            # conflict and is deliberately not duplicated.
            if game.kind == 'drawing':
                played = DrawingSubmission.objects.filter(
                    profile=profile, game=game, created_at__gte=existing.assigned_at
                ).exists()
            elif game.kind in GAME_TYPES:
                played = GameAttempt.objects.filter(
                    profile=profile, game=game, assignment=existing, status='completed',
                    started_at__gte=existing.assigned_at
                ).exists()
            else:
                played = False
            if not played:
                continue
            existing.active=False
            existing.save(update_fields=['active'])
            AuditLog.objects.create(
                actor=request.user,
                action='game_assignment_reassigned',
                target=str(existing.id),
                detail={'gameId':game.id,'profileId':profile.id,'reason':'completed_lifecycle_reassigned'},
            )
        created.append(GameAssignment.objects.create(
            game=game, assigned_by=request.user, target_profile=profile,
            due_at=body.get('dueAt') or game.due_at
        ))
        create_notification(profile=profile,title='New game assigned',body=f'{game.title} is ready in Games.',kind='game',url='/challenges')
    if not created:return ok({'detail':'This game is already assigned to the selected players'},409)
    return ok({'ids':[x.id for x in created],'count':len(created)},201)
