from django.contrib import admin
from .models import *

for model in [Profile,Programme,ProgrammeMembership,Group,XPTransaction,Badge,ProfileBadge,Skill,SkillMilestone,ProfileSkill,Challenge,Reward,Notification,PushSubscription,AttendanceSession,Attendance,MapEvent]:
    admin.site.register(model)

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display=('created_at','actor','action','target')
    list_filter=('action','created_at')
    search_fields=('actor__username','action','target')
    readonly_fields=('actor','action','target','detail','created_at')
    def has_add_permission(self, request): return False
    def has_change_permission(self, request, obj=None): return False
    def has_delete_permission(self, request, obj=None): return False

@admin.register(RefreshToken)
class RefreshTokenAdmin(admin.ModelAdmin):
    list_display=('user','created_at','expires_at','revoked_at','family_id')
    readonly_fields=('token_hash',)

@admin.register(DrawingSubmission)
class DrawingSubmissionAdmin(admin.ModelAdmin):
    list_display=('title','profile','status','score','created_at')
    list_filter=('status',)
