from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core.models import Challenge, GameAssignment, Profile, Programme, Reward, RewardAssignment


class Command(BaseCommand):
    help = "Seed idempotent scratch-card, circle-drawing and sequence games for QA without resetting users."

    def add_arguments(self, parser):
        parser.add_argument('--programme', type=int, help='Programme id to seed. Defaults to the first programme.')
        parser.add_argument('--profile', type=int, help='Existing young-person profile id to assign the test games to.')

    def handle(self, *args, **options):
        programmes = Programme.objects.all().order_by('id')
        programme = programmes.filter(id=options.get('programme')).first() if options.get('programme') else programmes.first()
        if not programme:
            raise CommandError('No programme exists. Create a programme first.')

        profile = Profile.objects.filter(id=options.get('profile'), role='youth', programme=programme).first() if options.get('profile') else Profile.objects.filter(role='youth', programme=programme, user__is_active=True).order_by('id').first()
        now = timezone.now()

        circle, _ = Challenge.objects.update_or_create(
            programme=programme,
            title='QA Circle Drawing',
            defaults={
                'kind': 'drawing',
                'description': 'Test a hand-drawn circle with percentage-based XP scoring.',
                'xp_reward': 150,
                'shape': 'circle',
                'score_ranges': [
                    {'min': 90, 'max': 100, 'xp': 150},
                    {'min': 75, 'max': 89, 'xp': 100},
                    {'min': 60, 'max': 74, 'xp': 75},
                    {'min': 40, 'max': 59, 'xp': 40},
                    {'min': 0, 'max': 39, 'xp': 10},
                ],
                'retries_per_player': 3,
                'scoring_policy': 'best',
                'start_at': now - timedelta(minutes=5),
                'end_at': now + timedelta(days=30),
                'active': True,
                'game_config': {'scoring': [
                    {'min': 90, 'max': 100, 'xp': 150},
                    {'min': 75, 'max': 89, 'xp': 100},
                    {'min': 60, 'max': 74, 'xp': 75},
                    {'min': 40, 'max': 59, 'xp': 40},
                    {'min': 0, 'max': 39, 'xp': 10},
                ]},
            },
        )

        sequence, _ = Challenge.objects.update_or_create(
            programme=programme,
            title='QA Sequence Points',
            defaults={
                'kind': 'sequence',
                'description': 'Test sequence scoring with different point thresholds.',
                'xp_reward': 150,
                'shape': 'circle',
                'score_ranges': [],
                'retries_per_player': 3,
                'scoring_policy': 'best',
                'start_at': now - timedelta(minutes=5),
                'end_at': now + timedelta(days=30),
                'active': True,
                'game_config': {
                    'difficulty': 12,
                    'scoring': [
                        {'min': 12, 'xp': 150},
                        {'min': 10, 'xp': 100},
                        {'min': 8, 'xp': 70},
                        {'min': 6, 'xp': 40},
                    ],
                },
            },
        )

        future, _ = Challenge.objects.update_or_create(
            programme=programme,
            title='QA Future Game',
            defaults={
                'kind': 'sequence',
                'description': 'Scheduled QA game; should appear as Upcoming before its start time.',
                'xp_reward': 100,
                'shape': 'circle',
                'score_ranges': [],
                'retries_per_player': 2,
                'scoring_policy': 'best',
                'start_at': now + timedelta(days=2),
                'end_at': now + timedelta(days=9),
                'active': True,
                'game_config': {'difficulty': 8, 'scoring': [
                    {'min': 8, 'xp': 100}, {'min': 7, 'xp': 80}, {'min': 6, 'xp': 50}
                ]},
            },
        )

        reward, _ = Reward.objects.update_or_create(
            programme=programme,
            name='QA Mystery Scratch Card',
            defaults={
                'description': 'QA scratch card with several XP outcomes.',
                'cost_xp': 0,
                'active': True,
                'start_at': now - timedelta(minutes=5),
                'end_at': now + timedelta(days=30),
                'awards': [
                    {'name': '10 XP', 'xp': 10, 'quantity': 20, 'remaining': 20, 'available': True, 'weightage': 5},
                    {'name': '50 XP', 'xp': 50, 'quantity': 8, 'remaining': 8, 'available': True, 'weightage': 3},
                    {'name': '100 XP', 'xp': 100, 'quantity': 2, 'remaining': 2, 'available': True, 'weightage': 1},
                ],
            },
        )

        assigned = []
        if profile:
            # GameAssignment requires an assigning user; use the existing programme worker/admin.
            from django.contrib.auth.models import User
            assigned_by = User.objects.filter(profile__programme=programme, profile__role__in=['worker', 'admin'], is_active=True).order_by('id').first()
            if assigned_by:
                for game in (circle, sequence, future):
                    assignment, _ = GameAssignment.objects.get_or_create(
                        game=game, target_profile=profile, active=True,
                        defaults={'assigned_by': assigned_by, 'due_at': game.due_at},
                    )
                    assigned.append(assignment.id)
                RewardAssignment.objects.update_or_create(
                    reward=reward, target_profile=profile,
                    defaults={'assigned_by': assigned_by, 'target_group': None, 'active': True},
                )

        self.stdout.write(self.style.SUCCESS(
            f'Seeded QA games for programme {programme.id}: circle={circle.id}, sequence={sequence.id}, future={future.id}, scratch={reward.id}. '
            f'Assigned to profile {profile.id}.' if profile else
            f'Seeded QA games for programme {programme.id}: circle={circle.id}, sequence={sequence.id}, future={future.id}, scratch={reward.id}. No youth profile was assigned.'
        ))
