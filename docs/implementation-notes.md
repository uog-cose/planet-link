# Implementation notes — rewards and group fairness

## Included changes

- QR attendance is the active onsite attendance reward path. The existing one-per-young-person-per-programme-local-day guard remains in place; QR attendance streak multipliers now use the programme timezone.
- Map Events are scheduling/display only. Legacy attendance records remain readable, while new manual Map Event attendance creation/correction is disabled.
- Youth dashboard reward data now includes login/onsite streak state, today's counted state, upcoming milestone progress and projected next rewards. Upcoming Map Events show a QR check-in reminder.
- Group XP is recorded in `GroupXPContribution` against the group membership at the time XP is awarded. The group total is no longer rebuilt from current member XP.
- `GroupMembership` records join/leave dates and active/inactive/transferred/withdrawn status. Account access changes update current membership status; group transfers preserve the original group's contributions.
- Admins set the minimum group leaderboard size. Staff can choose per group whether inactive accounts count. Public group rankings expose weekly, monthly and overall periods, with weekly/monthly membership denominators weighted by member-days.

## Migration 0051

The migration adds group membership history, group scoring policy history, the XP contribution ledger and programme group-scoring configuration. Existing `Group.xp` values are copied into `historical_xp` as opening balances. Existing current memberships are recorded as the initial roster at migration time.

The previous system did not retain effective-dated group membership history, so the migration deliberately does not attribute old individual XP transactions to today's groups. Weekly/monthly contribution-based rankings begin accumulating after this migration.

## Remaining limitation

The public board currently shows the active calendar week, active calendar month and overall leaderboard. Closed weekly/monthly leaderboard snapshots are not yet archived or selectable in the UI.

## Validation status

- Python source syntax compilation passed (`python -m compileall`).
- TypeScript/TSX syntax transpilation passed for all modified frontend files.
- Django tests, Django migration checks and the production Docker build could not be run in this workspace: Django/frontend dependencies are not installed, package installation was blocked by unavailable network access, and Docker is not installed.

Run the Django tests, migration check and frontend production build in the project's normal Docker/development environment before deploying. Back up PostgreSQL before applying migration 0051.
