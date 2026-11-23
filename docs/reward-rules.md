# Youth Quest reward and group scoring rules

This release aligns onsite attendance rewards with the youth-worker QR check-in flow, expands the youth dashboard reward guidance, and introduces durable group XP attribution and size-normalised group leaderboards.

## Daily login rewards

- Only a successful password login by a young person can trigger login XP.
- Refresh-token requests and repeated logins on the same programme-local calendar date do not award additional XP.
- Each programme has `login_reward_config` with `enabled`, `daily_xp`, `timezone`, and a list of `{days, bonus_xp}` milestones.
- The daily base reward is additive to a milestone bonus. For example, 10 daily XP plus a 30 XP three-day bonus awards 40 XP on day three.
- Each milestone is awarded once per continuous streak cycle. A new cycle begins after a missed local calendar day.
- Historical login rows are not backfilled. Tracking starts when the feature is enabled.
- The default timezone is `Europe/London`; an administrator can change it to any valid IANA timezone. Avoid changing a programme timezone mid-streak because local calendar boundaries will change.

## Onsite QR attendance rewards

- Youth workers create a short-lived attendance QR session. A young person scans the code while onsite.
- A scan is accepted only for a logged-in young person in the same active programme as the QR session.
- Only one reward-bearing attendance scan per young person per programme-local calendar day is allowed, even if several QR sessions are created that day.
- The daily attendance reward is `attendance_points × multiplier`, rounded to a whole XP value.
- The highest configured `streak_rules` threshold reached is applied. These rules count consecutive programme-local days with a successful QR check-in. For example, 100 base XP at a 1.5x multiplier awards 150 XP.
- Missing a calendar day resets the consecutive QR attendance streak. A duplicate scan does not extend the streak or award more XP.
- QR check-ins use the programme timezone configured in `login_reward_config` so login and onsite attendance day boundaries are consistent.
- The database's unique participant/date constraint remains the final protection against concurrent or retried scans.

## Map Events

- Map Events are now used for scheduling, map display and upcoming activity reminders only.
- New Map Event attendance rewards are disabled. Onsite attendance and XP are recorded through QR check-in, not manual event attendance entry.
- Existing `EventAttendance` rows and their historical XP transactions are retained for audit/history. The legacy API is read-only; new create or correction requests return HTTP 410.
- The old `event_streak_rules` configuration is retained for compatibility with existing programme data but is no longer used to award XP.

## Group XP and membership history

- Individual XP remains in the young person's personal account.
- When XP is awarded, a separate immutable group contribution is recorded for every group the young person belongs to at that moment.
- A member leaving or transferring does not move or delete XP already attributed to the original group. New XP is attributed only to their group membership at the time of the new award.
- Group membership changes are effective-dated and recorded with a status (`active`, `inactive`, `transferred` or `withdrawn`), join/leave timestamps and the staff actor where available.
- The existing group XP total at migration is retained as an opening balance. The system deliberately does not reconstruct historic group contributions from current membership because the previous system did not store enough membership history to do that accurately.
- Membership history for existing groups begins at migration time. New membership changes are recorded from then onwards.

## Group leaderboards

- Collective XP remains visible as the group's shared lifetime progress.
- Competitive rankings use average XP per eligible member, rather than raw collective XP, so a larger group does not rank higher solely because it has more members.
- Admins configure the minimum eligible group size required to appear in the leaderboard.
- Youth workers and admins can choose per group whether inactive accounts count in the ranking denominator. Departed/transferred members are not eligible after their effective leave date.
- Weekly rankings use the current calendar week (Monday to Sunday); monthly rankings use the current calendar month; overall rankings use the group's collective lifetime XP.
- Weekly and monthly scores use the new group contribution ledger and effective-dated membership history. They start accumulating from this release; historical transactions are not reassigned to current groups. The public board currently exposes the active week and active month; archived closed-period snapshots are not yet exposed.
- For weekly/monthly rankings, the eligible group size is time-weighted across the period (member-days divided by period days). This ensures a member contributes to the denominator only for the dates they belonged to the group. The inactive-account policy is taken from the policy in effect at the start of that period, so changing the setting affects the next weekly/monthly period rather than rewriting a period already in progress.
- Overall ranking uses the current eligible membership count and the preserved collective XP total.

## Youth dashboard

The youth dashboard receives live values from the backend for:

- Current XP, lifetime XP and recent XP transactions.
- Daily login streak, today's login status, base login XP, next milestone and projected next reward.
- Onsite QR attendance streak, today's check-in status, current multiplier, next multiplier milestone and projected next check-in reward.
- Group collective XP, average XP per eligible member and leaderboard position where the group meets the minimum size.
- Current/upcoming Map Events and a reminder to scan the QR code onsite.

## Configuration and permissions

- Programme login rewards, QR attendance base XP and QR attendance streak multipliers are configured in Admin → Configuration.
- The group minimum leaderboard size is configured in Admin → Configuration.
- Youth workers and admins can manage group membership and the per-group inactive-account scoring setting.
- Youth workers can create QR attendance sessions; young people can scan them. A scan is not accepted from a different programme.
- Reward calculations run on the backend and use the existing `award_xp()` ledger path, preserving profile XP, lifetime XP, levels, group contributions and notifications.

## API changes

- `POST /api/attendance/session/` – staff creates a short-lived QR attendance session.
- `POST /api/attendance/scan/` – a young person records their one-per-day onsite QR check-in.
- `GET /api/event-attendance/?eventId=<id>` – read legacy Map Event attendance history (staff only).
- `POST` and `PATCH /api/event-attendance/` – disabled with HTTP 410; Map Events are scheduling-only.
- `GET /api/staff/groups/` – includes collective XP, eligible member count, average XP per eligible member and inactive-account policy.
- `POST /api/staff/groups/members/` – manages group membership and the per-group inactive-account policy.
- `GET /api/public/` – includes weekly, monthly and overall group leaderboard data.

## Deployment

Back up the production PostgreSQL database before deployment. Run the normal Django migration step before deploying the updated backend and frontend together:

```bash
python manage.py migrate
```

The new migration preserves existing group XP totals as opening balances and records the current membership roster as the starting point for future membership history. Do not manually edit XP transaction history or delete attendance/membership rows to correct a reward.
