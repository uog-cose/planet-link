from django.urls import path
from .views import *
from .live import live_events
from .notifications import notification_events

urlpatterns = [
    path('health/', health), path('csrf/', csrf), path('live/events/', live_events),
    path('auth/login/', login), path('auth/refresh/', refresh), path('auth/logout/', logout), path('auth/me/', me),
    path('dashboard/', dashboard), path('xp/', xp), path('challenges/', challenges), path('games/start/', game_start), path('games/submit/', game_submit), path('skills/', skills), path('skills/progress/', skill_progress), path('skills/assign/', skill_assign), path('rewards/', rewards), path('scratch/claim/', scratch_claim),
    path('notifications/', notifications), path('notifications/events/', notification_events), path('approvals/count/', approval_counts), path('notifications/pending-popups/', notification_pending_popups), path('notifications/popup-delivered/', notification_popup_delivered), path('attendance/session/', attendance_session), path('attendance/scan/', attendance_scan), path('attendance/schedule/', attendance_schedule), path('event-attendance/', event_attendance),
    path('public/theme/', public_theme), path('admin/overview/', admin_overview), path('admin/instances/', admin_instances), path('admin/audit/', admin_audit_logs), path('admin/config/', admin_config), path('admin/theme-presets/', admin_theme_presets), path('public/instances/', public_instances), path('public/', public_dashboard), path('public/award/', public_award), path('public/points-info/', public_points_info), path('public/points-request/', public_points_request),
    path('drawings/', drawing_list), path('profile/avatar-image/<int:profile_id>/', profile_avatar_image), path('drawings/submit/', drawing_submit), path('profile/delete/', profile_delete), path('auth/change-password/', change_password), path('points/qr/', points_qr), path('points/scan/', points_scan), path('points/scan-info/', points_scan_info), path('worker/participants/', worker_participants), path('worker/avatar/', assign_avatar), path('worker/avatar-upload/', assign_avatar_upload), path('admin/users/', admin_users), path('admin/account-deletions/', admin_account_deletions), path('staff/accounts/', staff_accounts), path('staff/groups/', staff_groups), path('staff/groups/progress/', staff_group_progress), path('staff/groups/members/', assign_group_members), path('staff/games/', game_assignments), path('staff/rewards/', staff_rewards), path('points/awards/', point_awards), path('points/awards/review/', point_award_review), path('points/public-requests/', public_point_requests), path('points/public-requests/review/', public_point_request_review), path('points/penalty/', point_penalty), path('admin/password-reset-qr/', admin_password_reset_qr), path('auth/password-reset/', password_reset), path('settings/notifications/', notification_settings), path('notifications/config/', push_config), path('notifications/push/', push_subscription), path('notifications/sounds/', notification_sounds), path('profile/avatar/', profile_avatar), path('map-event/lookup/', map_event_lookup), path('map-event/', map_event), path('map-event/end/', map_event_end),
]

# Development-only convenience: the endpoint is not registered in production.
from core.config import CONFIG
if CONFIG.env == 'local' and CONFIG.enable_quick_login:
    from .dev_auth import dev_login
    urlpatterns.append(path('auth/dev-login/', dev_login))
