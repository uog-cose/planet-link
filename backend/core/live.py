from __future__ import annotations

from django.db import models
from django.utils import timezone
from django.dispatch import receiver
from django.db.models.signals import post_delete, post_save

from .models import (
    Attendance, AttendanceSession, Badge, Challenge, DrawingSubmission,
    GameAssignment, Group, MapEvent, Notification, PointAwardRequest,
    Profile, ProfileBadge, ProfileSkill, Programme, Reward, RewardAssignment,
    ScratchClaim, Skill, SkillAssignment, SkillMilestone, XPTransaction,
)


def _touch_programme(programme_id: int | None) -> None:
    if programme_id:
        Programme.objects.filter(pk=programme_id).update(updated_at=timezone.now())


def _programme_id(instance):
    if isinstance(instance, Profile):
        return instance.programme_id
    if isinstance(instance, (Group, Skill, Challenge, Reward, MapEvent, AttendanceSession)):
        return instance.programme_id
    if isinstance(instance, XPTransaction):
        return instance.programme_id or getattr(getattr(instance, 'target', None), 'programme_id', None)
    if isinstance(instance, (Notification, ProfileBadge, ProfileSkill, SkillAssignment, ScratchClaim, DrawingSubmission, GameAssignment, PointAwardRequest, Attendance)):
        profile = getattr(instance, 'target', None) or getattr(instance, 'profile', None) or getattr(instance, 'participant', None) or getattr(instance, 'target_profile', None)
        if profile is not None:
            return profile.programme_id
        if isinstance(instance, SkillAssignment):
            return instance.skill.programme_id
        if isinstance(instance, GameAssignment):
            return instance.game.programme_id
        if isinstance(instance, PointAwardRequest):
            return instance.target.programme_id
        if isinstance(instance, Attendance):
            return instance.session.programme_id
    if isinstance(instance, RewardAssignment):
        return instance.reward.programme_id
    if isinstance(instance, SkillMilestone):
        return instance.skill.programme_id
    if isinstance(instance, Badge):
        return None
    return None


def _profile_id(instance):
    if isinstance(instance, Profile):
        return instance.pk
    profile = getattr(instance, 'profile', None) or getattr(instance, 'participant', None) or getattr(instance, 'target', None) or getattr(instance, 'target_profile', None)
    return getattr(profile, 'pk', None)


@receiver(post_save)
def touch_live_state(sender, instance, **kwargs):
    if sender is Programme:
        return
    programme_id = _programme_id(instance)
    _touch_programme(programme_id)
    profile_id = _profile_id(instance)
    if profile_id and not isinstance(instance, Profile):
        Profile.objects.filter(pk=profile_id).update(updated_at=timezone.now())


@receiver(post_delete)
def touch_live_state_delete(sender, instance, **kwargs):
    if sender is Programme:
        return
    _touch_programme(_programme_id(instance))
    profile_id = _profile_id(instance)
    if profile_id:
        Profile.objects.filter(pk=profile_id).update(updated_at=timezone.now())
