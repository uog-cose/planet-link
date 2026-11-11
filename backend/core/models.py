from django.db import models
from django.contrib.auth.models import User
import uuid
from django.utils import timezone

def default_streak_rules():
    return [{'days':3,'multiplier':1.3},{'days':7,'multiplier':1.5},{'days':14,'multiplier':2.0}]

class Profile(models.Model):
    ROLE_CHOICES=[('youth','Young Person'),('worker','Youth Worker'),('admin','Admin')]
    user=models.OneToOneField(User,on_delete=models.CASCADE,related_name='profile')
    programme=models.ForeignKey('Programme',on_delete=models.SET_NULL,null=True,blank=True,related_name='profiles')
    role=models.CharField(max_length=20,choices=ROLE_CHOICES,default='youth')
    gamertag=models.CharField(max_length=40,default='Explorer')
    avatar=models.CharField(max_length=40,default='orbit')
    avatar_image=models.ImageField(upload_to='avatars/%Y/%m/', null=True, blank=True)
    current_xp=models.IntegerField(default=0)
    lifetime_xp=models.IntegerField(default=0)
    group_xp=models.IntegerField(default=0)
    level=models.IntegerField(default=1)
    streak=models.IntegerField(default=0)
    notifications_opt_in=models.BooleanField(default=True)
    push_notifications_opt_in=models.BooleanField(default=False, db_default=False)
    public_opt_in=models.BooleanField(default=True)
    deletion_requested=models.BooleanField(default=False)
    must_change_password=models.BooleanField(default=False)
    theme_presets=models.JSONField(default=list, blank=True)
    updated_at=models.DateTimeField(auto_now=True)

class Programme(models.Model):
    STATUS_CHOICES=[('active','Active'),('inactive','Inactive'),('archived','Archived')]
    name=models.CharField(max_length=120)
    location=models.CharField(max_length=120)
    theme=models.CharField(max_length=40,default='neon')
    target_xp=models.IntegerField(default=500000)
    active=models.BooleanField(default=True)
    status=models.CharField(max_length=20,choices=STATUS_CHOICES,default='active')
    public_enabled=models.BooleanField(default=True)
    starts=models.DateField(null=True); ends=models.DateField(null=True)
    theme_config=models.JSONField(default=dict, blank=True)
    milestones=models.JSONField(default=list, blank=True)
    max_worker_points=models.PositiveIntegerField(default=100)
    attendance_points=models.PositiveIntegerField(default=25)
    streak_rules=models.JSONField(default=default_streak_rules, blank=True)
    attendance_attention_days=models.PositiveIntegerField(default=7)
    points_attention_days=models.PositiveIntegerField(default=7)
    attention_grace_days=models.PositiveIntegerField(default=3)
    notification_retention_days=models.PositiveIntegerField(default=30)
    public_config=models.JSONField(default=dict, blank=True)
    public_map_token=models.CharField(max_length=160,blank=True,default='')
    public_map_token_expires_at=models.DateTimeField(null=True,blank=True)
    updated_at=models.DateTimeField(auto_now=True)

class ProgrammeMembership(models.Model):
    user=models.ForeignKey(User,on_delete=models.CASCADE,related_name='programme_memberships')
    programme=models.ForeignKey(Programme,on_delete=models.CASCADE,related_name='memberships')
    created_at=models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints=[models.UniqueConstraint(fields=['user','programme'],name='unique_user_programme_membership')]
        indexes=[models.Index(fields=['user','programme'])]


class Group(models.Model):
    name=models.CharField(max_length=120)
    programme=models.ForeignKey(Programme,on_delete=models.CASCADE,related_name='groups')
    xp=models.IntegerField(default=0)
    # Keep the model in sync with migration 0048; this field is used by group tier APIs.
    tier_targets=models.JSONField(default=list,blank=True)
    members=models.ManyToManyField(Profile,related_name='groups',blank=True)

class GroupTierUnlock(models.Model):
    group=models.ForeignKey(Group,on_delete=models.CASCADE,related_name='tier_unlocks')
    threshold=models.PositiveIntegerField()
    tier_name=models.CharField(max_length=80)
    prize=models.CharField(max_length=160,blank=True)
    unlocked_at=models.DateTimeField(auto_now_add=True)
    class Meta:
        constraints=[models.UniqueConstraint(fields=['group','threshold'],name='unique_group_tier_unlock')]
        ordering=['threshold','id']


class IdempotencyRecord(models.Model):
    request_key=models.CharField(max_length=64)
    user=models.ForeignKey(User,on_delete=models.CASCADE,related_name='idempotency_records')
    path=models.CharField(max_length=240)
    status_code=models.PositiveSmallIntegerField()
    content_type=models.CharField(max_length=160,default='application/json')
    response_body=models.TextField()
    created_at=models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints=[models.UniqueConstraint(fields=['user','path','request_key'],name='unique_idempotency_request')]
        indexes=[models.Index(fields=['user','created_at'])]


class XPTransaction(models.Model):
    target=models.ForeignKey(Profile,on_delete=models.CASCADE,related_name='xp_transactions')
    programme=models.ForeignKey('Programme',on_delete=models.SET_NULL,null=True,blank=True,related_name='xp_transactions')
    actor=models.ForeignKey(User,on_delete=models.PROTECT,related_name='xp_actions')
    amount=models.IntegerField()
    source=models.CharField(max_length=80)
    reason=models.CharField(max_length=240)
    created_at=models.DateTimeField(auto_now_add=True)
    immutable_hash=models.CharField(max_length=64,blank=True)

class Badge(models.Model):
    name=models.CharField(max_length=100); description=models.CharField(max_length=200)
    icon=models.CharField(max_length=40,default='sparkles'); color_token=models.CharField(max_length=40,default='accent')
class ProfileBadge(models.Model):
    profile=models.ForeignKey(Profile,on_delete=models.CASCADE); badge=models.ForeignKey(Badge,on_delete=models.CASCADE); awarded_at=models.DateTimeField(auto_now_add=True)

class Skill(models.Model):
    programme=models.ForeignKey(Programme,on_delete=models.CASCADE,null=True,blank=True,related_name='skills')
    name=models.CharField(max_length=100); description=models.CharField(max_length=240); xp_reward=models.IntegerField(default=50); active=models.BooleanField(default=True); activity_url=models.URLField(max_length=500,blank=True)
class SkillAssignment(models.Model):
    skill=models.ForeignKey(Skill,on_delete=models.CASCADE,related_name='assignments')
    target_profile=models.ForeignKey(Profile,on_delete=models.CASCADE,null=True,blank=True,related_name='skill_assignments')
    target_group=models.ForeignKey(Group,on_delete=models.CASCADE,null=True,blank=True,related_name='skill_assignments')
    assigned_by=models.ForeignKey(User,on_delete=models.PROTECT,related_name='skill_assignments_created')
    assigned_at=models.DateTimeField(auto_now_add=True)
    active=models.BooleanField(default=True)
    class Meta:
        constraints=[
            models.CheckConstraint(check=(models.Q(target_profile__isnull=False)|models.Q(target_group__isnull=False)),name='skill_assignment_has_target'),
            models.CheckConstraint(check=~(models.Q(target_profile__isnull=False)&models.Q(target_group__isnull=False)),name='skill_assignment_one_target'),
            models.UniqueConstraint(fields=['skill','target_profile'],condition=models.Q(active=True,target_profile__isnull=False),name='unique_active_skill_profile'),
            models.UniqueConstraint(fields=['skill','target_group'],condition=models.Q(active=True,target_group__isnull=False),name='unique_active_skill_group'),
        ]

class SkillMilestone(models.Model):
    skill=models.ForeignKey(Skill,on_delete=models.CASCADE,related_name='milestone_records')
    name=models.CharField(max_length=100)
    progress=models.PositiveSmallIntegerField(default=0)
    xp=models.PositiveIntegerField(default=0)
    reward=models.ForeignKey('Reward',on_delete=models.SET_NULL,null=True,blank=True,related_name='skill_milestones')
    order=models.PositiveIntegerField(default=0)
    class Meta:
        ordering=['order','id']
        constraints=[models.UniqueConstraint(fields=['skill','order'],name='unique_skill_milestone_order'),models.UniqueConstraint(fields=['skill','progress'],name='unique_skill_milestone_progress')]

class ProfileSkill(models.Model):
    profile=models.ForeignKey(Profile,on_delete=models.CASCADE); skill=models.ForeignKey(Skill,on_delete=models.CASCADE); progress=models.IntegerField(default=0); completed=models.BooleanField(default=False); completed_milestones=models.JSONField(default=list,blank=True)
    class Meta:
        constraints=[models.UniqueConstraint(fields=['profile','skill'],name='unique_profile_skill')]

class Challenge(models.Model):
    programme=models.ForeignKey('Programme',on_delete=models.CASCADE,null=True,blank=True,related_name='challenges')
    kind=models.CharField(max_length=30,default='activity')
    title=models.CharField(max_length=120); description=models.CharField(max_length=300); xp_reward=models.IntegerField(default=100); start_at=models.DateTimeField(null=True,blank=True); end_at=models.DateTimeField(null=True,blank=True); due_at=models.DateTimeField(null=True); active=models.BooleanField(default=True)
    shape=models.CharField(max_length=20,default='circle')
    score_ranges=models.JSONField(default=list,blank=True)
    retries_per_player=models.PositiveIntegerField(default=3)
    scoring_policy=models.CharField(max_length=10,choices=[('best','Best attempt'),('last','Last attempt')],default='best')
    game_config=models.JSONField(default=dict, blank=True)

class Reward(models.Model):
    programme=models.ForeignKey('Programme',on_delete=models.CASCADE,null=True,blank=True,related_name='rewards')
    name=models.CharField(max_length=120); description=models.CharField(max_length=240); cost_xp=models.IntegerField(default=100); start_at=models.DateTimeField(null=True,blank=True); end_at=models.DateTimeField(null=True,blank=True); active=models.BooleanField(default=True)
    awards=models.JSONField(default=list,blank=True)
    fallback_xp=models.PositiveIntegerField(default=0)

class RewardAssignment(models.Model):
    reward=models.ForeignKey(Reward,on_delete=models.CASCADE,related_name='assignments')
    target_profile=models.ForeignKey(Profile,on_delete=models.CASCADE,null=True,blank=True,related_name='reward_assignments')
    target_group=models.ForeignKey(Group,on_delete=models.CASCADE,null=True,blank=True,related_name='reward_assignments')
    assigned_by=models.ForeignKey(User,on_delete=models.PROTECT,related_name='reward_assignments_created')
    assigned_at=models.DateTimeField(auto_now_add=True)
    active=models.BooleanField(default=True)

    class Meta:
        constraints=[
            models.CheckConstraint(check=(models.Q(target_profile__isnull=False) | models.Q(target_group__isnull=False)),name='reward_assignment_has_target'),
            models.CheckConstraint(check=~(models.Q(target_profile__isnull=False) & models.Q(target_group__isnull=False)),name='reward_assignment_one_target'),
            models.UniqueConstraint(fields=['reward','target_profile'], condition=models.Q(active=True,target_profile__isnull=False), name='unique_active_reward_profile'),
            models.UniqueConstraint(fields=['reward','target_group'], condition=models.Q(active=True,target_group__isnull=False), name='unique_active_reward_group'),
        ]

class ScratchClaim(models.Model):
    reward=models.ForeignKey(Reward,on_delete=models.CASCADE,related_name='claims')
    profile=models.ForeignKey(Profile,on_delete=models.CASCADE,related_name='scratch_claims')
    award_name=models.CharField(max_length=120)
    award_type=models.CharField(max_length=20,default='other')
    amount=models.PositiveIntegerField(default=0)
    claimed_at=models.DateTimeField(auto_now_add=True)

class RewardFulfillment(models.Model):
    STATUS_CHOICES=[('pending','Pending'),('fulfilled','Fulfilled')]
    claim=models.OneToOneField(ScratchClaim,on_delete=models.CASCADE,related_name='fulfillment')
    status=models.CharField(max_length=20,choices=STATUS_CHOICES,default='pending')
    fulfilled_by=models.ForeignKey(User,on_delete=models.SET_NULL,null=True,blank=True,related_name='reward_fulfillments')
    fulfilled_at=models.DateTimeField(null=True,blank=True)
    notes=models.CharField(max_length=240,blank=True)
    created_at=models.DateTimeField(auto_now_add=True)


class NotificationSound(models.Model):
    CATEGORY_CHOICES=[('positive','Positive'),('negative','Negative'),('bravo','Bravo'),('motivation','Motivation')]
    programme=models.ForeignKey(Programme,on_delete=models.CASCADE,related_name='notification_sounds')
    name=models.CharField(max_length=120)
    category=models.CharField(max_length=20,choices=CATEGORY_CHOICES)
    file=models.FileField(upload_to='notification-sounds/%Y/%m/')
    active=models.BooleanField(default=True)
    created_at=models.DateTimeField(auto_now_add=True)

class Notification(models.Model):
    profile=models.ForeignKey(Profile,on_delete=models.CASCADE,related_name='notifications'); title=models.CharField(max_length=120); body=models.CharField(max_length=300); kind=models.CharField(max_length=30,default='info'); url=models.CharField(max_length=240,blank=True); read=models.BooleanField(default=False); popup_delivered_at=models.DateTimeField(null=True,blank=True); created_at=models.DateTimeField(auto_now_add=True)

class PushSubscription(models.Model):
    profile=models.ForeignKey(Profile,on_delete=models.CASCADE,related_name='push_subscriptions')
    endpoint=models.URLField(max_length=1000,unique=True)
    p256dh=models.CharField(max_length=255)
    auth=models.CharField(max_length=255)
    user_agent=models.CharField(max_length=500,blank=True)
    active=models.BooleanField(default=True)
    created_at=models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)

class AttendanceSession(models.Model):
    programme=models.ForeignKey(Programme,on_delete=models.CASCADE); created_by=models.ForeignKey(User,on_delete=models.PROTECT,related_name='attendance_sessions'); token=models.CharField(max_length=64,unique=True); expires_at=models.DateTimeField(); active=models.BooleanField(default=True); created_at=models.DateTimeField(auto_now_add=True)
class Attendance(models.Model):
    session=models.ForeignKey(AttendanceSession,on_delete=models.CASCADE); participant=models.ForeignKey(Profile,on_delete=models.CASCADE,related_name='attendances'); attended_at=models.DateTimeField(auto_now_add=True); attendance_date=models.DateField(default=timezone.localdate)
    class Meta: constraints=[models.UniqueConstraint(fields=['session','participant'],name='unique_attendance_scan'),models.UniqueConstraint(fields=['participant','attendance_date'],name='unique_daily_attendance')]

class MapEvent(models.Model):
    STATUS_CHOICES=[('scheduled','Scheduled'),('current','Current'),('ended','Ended'),('cancelled','Cancelled')]
    programme=models.ForeignKey(Programme,on_delete=models.CASCADE,related_name='map_events')
    title=models.CharField(max_length=120)
    description=models.CharField(max_length=240,blank=True)
    location_name=models.CharField(max_length=180,blank=True)
    postcode=models.CharField(max_length=16,blank=True)
    address=models.CharField(max_length=240,blank=True)
    lat=models.FloatField(default=55.9533)
    lng=models.FloatField(default=-3.1883)
    start_at=models.DateTimeField(null=True,blank=True)
    end_at=models.DateTimeField(null=True,blank=True)
    ended_at=models.DateTimeField(null=True,blank=True)
    status=models.CharField(max_length=20,choices=STATUS_CHOICES,default='scheduled')
    visible=models.BooleanField(default=True)
    pin_enabled=models.BooleanField(default=True)


class AuditLog(models.Model):
    actor=models.ForeignKey(User,on_delete=models.PROTECT)
    programme=models.ForeignKey(Programme,on_delete=models.SET_NULL,null=True,blank=True,related_name='audit_logs')
    action=models.CharField(max_length=100)
    target=models.CharField(max_length=100)
    detail=models.JSONField(default=dict)
    created_at=models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if self.programme_id is None:
            profile = getattr(self.actor, 'profile', None)
            self.programme_id = getattr(profile, 'programme_id', None)
        super().save(*args, **kwargs)


class RefreshToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="refresh_tokens")
    token_hash = models.CharField(max_length=64, unique=True)
    family_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    replaced_by = models.UUIDField(null=True, blank=True)

class PasswordResetQr(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    token_hash = models.CharField(max_length=64, unique=True)
    target = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_qrs')
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='generated_password_reset_qrs')
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

class PointsQrToken(models.Model):
    profile = models.OneToOneField(Profile, on_delete=models.CASCADE, related_name='points_qr')
    token = models.CharField(max_length=128, default="")
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    active = models.BooleanField(default=True)

class DrawingSubmission(models.Model):
    STATUS_CHOICES = [("submitted", "Submitted"), ("approved", "Approved"), ("rejected", "Rejected")]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name="drawing_submissions")
    game = models.ForeignKey(Challenge, on_delete=models.PROTECT, null=True, blank=True, related_name='drawing_submissions')
    title = models.CharField(max_length=120)
    stroke_data = models.JSONField(default=list)
    score = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="submitted")
    feedback = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    client_request_id = models.CharField(max_length=64, null=True, blank=True, unique=True)


class GameAssignment(models.Model):
    game=models.ForeignKey(Challenge,on_delete=models.CASCADE,related_name='assignments')
    assigned_by=models.ForeignKey(User,on_delete=models.PROTECT,related_name='game_assignments')
    target_profile=models.ForeignKey(Profile,on_delete=models.CASCADE,null=True,blank=True,related_name='game_assignments')
    target_group=models.ForeignKey(Group,on_delete=models.CASCADE,null=True,blank=True,related_name='game_assignments')
    assigned_at=models.DateTimeField(auto_now_add=True)
    due_at=models.DateTimeField(null=True,blank=True)
    active=models.BooleanField(default=True)

    class Meta:
        constraints=[
            models.CheckConstraint(check=(models.Q(target_profile__isnull=False) | models.Q(target_group__isnull=False)),name='game_assignment_has_target'),
            models.CheckConstraint(check=~(models.Q(target_profile__isnull=False) & models.Q(target_group__isnull=False)),name='game_assignment_one_target'),
            models.UniqueConstraint(fields=['game','target_profile'], condition=models.Q(active=True,target_profile__isnull=False), name='unique_active_game_profile'),
            models.UniqueConstraint(fields=['game','target_group'], condition=models.Q(active=True,target_group__isnull=False), name='unique_active_game_group'),
        ]


class GameAttempt(models.Model):
    STATUS_CHOICES=[('started','Started'),('completed','Completed'),('rejected','Rejected')]
    id=models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment=models.ForeignKey(GameAssignment,on_delete=models.PROTECT,related_name='attempts')
    profile=models.ForeignKey(Profile,on_delete=models.CASCADE,related_name='game_attempts')
    game=models.ForeignKey(Challenge,on_delete=models.PROTECT,related_name='attempts')
    challenge_data=models.JSONField(default=dict)
    status=models.CharField(max_length=20,choices=STATUS_CHOICES,default='started')
    raw_score=models.FloatField(null=True,blank=True)
    score_unit=models.CharField(max_length=20,blank=True)
    performance=models.FloatField(null=True,blank=True)
    xp_awarded=models.PositiveIntegerField(default=0)
    started_at=models.DateTimeField(auto_now_add=True)
    completed_at=models.DateTimeField(null=True,blank=True)
    client_duration_ms=models.PositiveIntegerField(null=True,blank=True)

    class Meta:
        indexes=[models.Index(fields=['profile','game','started_at']),models.Index(fields=['assignment','status'])]


class PublicPointRequest(models.Model):
    STATUS_CHOICES=[('pending','Pending'),('approved','Approved'),('rejected','Rejected')]
    target=models.ForeignKey(Profile,on_delete=models.CASCADE,related_name='public_point_requests')
    name=models.CharField(max_length=80)
    organisation=models.CharField(max_length=1000,blank=True)
    comment=models.TextField(max_length=500,blank=True)
    rating=models.PositiveSmallIntegerField()
    status=models.CharField(max_length=20,choices=STATUS_CHOICES,default='pending')
    assigned_amount=models.PositiveIntegerField(null=True,blank=True)
    reviewed_by=models.ForeignKey(User,on_delete=models.PROTECT,null=True,blank=True,related_name='reviewed_public_point_requests')
    created_at=models.DateTimeField(auto_now_add=True)
    reviewed_at=models.DateTimeField(null=True,blank=True)
    submitted_ip_hash=models.CharField(max_length=64,blank=True)


class PointAwardRequest(models.Model):
    STATUS_CHOICES=[('pending','Pending'),('approved','Approved'),('rejected','Rejected')]
    target=models.ForeignKey(Profile,on_delete=models.CASCADE,related_name='point_award_requests')
    requested_by=models.ForeignKey(User,on_delete=models.PROTECT,related_name='point_award_requests')
    amount=models.PositiveIntegerField()
    reason=models.CharField(max_length=240)
    rejection_reason=models.CharField(max_length=500,blank=True,default='')
    status=models.CharField(max_length=20,choices=STATUS_CHOICES,default='pending')
    reviewed_by=models.ForeignKey(User,on_delete=models.PROTECT,null=True,blank=True,related_name='reviewed_point_awards')
    created_at=models.DateTimeField(auto_now_add=True)
    reviewed_at=models.DateTimeField(null=True,blank=True)
