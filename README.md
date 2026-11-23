# Youth Quest

Youth Quest is a youth engagement platform with role-based experiences for young people, youth workers, and administrators.

## Technology

- Frontend: React, TypeScript, Vite
- Backend: Django and Django REST Framework
- Database: PostgreSQL 17 in local development, CI, and production
- Containers: Docker Compose
- Tests: pytest and Playwright

## Local development

Requirements: Python 3.13+, Node.js 22+, npm, and Docker Desktop (if using containers).

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Open the frontend at `http://localhost:5174`. The backend API is available through `/api/`; the local Django admin is proxied at `/django-admin/` and the backend is available at `http://localhost:8001`.

Quick login is available only in the local Vite development server when `APP_ENV=local` and `ENABLE_QUICK_LOGIN=true`. The backend endpoint additionally requires `DEBUG=true`. The production frontend build disables the control and the production backend does not register its endpoint.

The local Compose stack starts PostgreSQL 17 automatically and stores its data in a named Docker volume. To seed local demonstration accounts, set `SEED_DEMO=true` in the local `.env` and recreate the backend, or run the seed command explicitly. Keep demo data and credentials out of production.

To stop containers:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

Do not use `docker compose down -v` unless you intentionally want to delete local database and media volumes.

## Tests

Backend:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python manage.py check
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend pytest
```

Frontend:

```bash
cd frontend
npm install
npm run lint
npm run build
```

## Production deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the low-cost DigitalOcean Droplet deployment, PostgreSQL configuration, HTTPS, GitHub Actions CI/CD, and operational commands.

## Security

See [SECURITY.md](SECURITY.md). Never commit `.env` or `.env.production`; both are ignored by Git. If a credential was exposed, rotate it because removing the file from the latest version does not erase Git history.

## Project traceability

See [JIRA_TRACEABILITY.md](JIRA_TRACEABILITY.md) for issue-to-implementation traceability.


## Reward rules

See [docs/reward-rules.md](docs/reward-rules.md) for daily login rewards, event attendance streaks, configuration, permissions, and deployment notes.
