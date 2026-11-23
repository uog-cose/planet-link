# DigitalOcean Droplet deployment

This deployment intentionally uses one Ubuntu Droplet and Docker Compose to minimise recurring cost. PostgreSQL runs in a private container on the same Droplet. No Redis, object storage, or managed database is required for this initial setup.

> **Domain and HTTPS are required before real users or sensitive youth data use the service.** The production stack uses Caddy for automatic HTTPS and cannot obtain a trusted certificate from a bare IP address. You can prepare GitHub CI now; enable automatic deployment after you have a domain pointed at the Droplet.

## 1. Prepare the Droplet

Create an Ubuntu 24.04 Droplet. A 2 GB RAM / 1 vCPU plan is a practical minimum to start with for the frontend, Django, and PostgreSQL on one machine; monitor memory and upgrade if needed. Do not expose PostgreSQL publicly.

Install Docker Engine, the Compose plugin, Git, and rsync using DigitalOcean's current Ubuntu/Docker instructions. Create a non-root deployment user and grant it Docker access:

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy /opt/youth-quest
```

Copy or clone the GitHub repository into `/opt/youth-quest` before the first deployment. For a public repository:

```bash
git clone https://github.com/OWNER/REPOSITORY.git /opt/youth-quest
```

For a private repository, configure a read-only GitHub deploy key or transfer the release securely.

Add the GitHub Actions deployment public key to `/home/deploy/.ssh/authorized_keys` (create the `.ssh` directory with mode `700`, and the file with mode `600`). Log in as `deploy` and verify `docker compose version` works.

Configure the Droplet firewall to allow inbound TCP 22, 80, and 443 only. Do not open 5432, 8000, or 80/443 on internal containers. Restrict SSH to trusted IPs where practical.

## 2. Configure production environment

After you purchase a domain, create an A record pointing it to the Droplet IPv4 address. Wait for DNS to resolve. Then, on the Droplet:

```bash
cd /opt/youth-quest
cp .env.production.example .env.production
chmod 600 .env.production
```

Edit `.env.production` and replace every placeholder. Set the same real domain in `DOMAIN`, `ALLOWED_HOSTS`, `CORS_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `FRONTEND_URL`, and `PUBLIC_APP_URL`. Use `https://` for origins and public URLs. Generate a Django secret and database password, for example:

```bash
openssl rand -base64 64
openssl rand -base64 48
```

Use separate random values for `SECRET_KEY` and `DB_PASSWORD`. Keep `DEBUG=false`, `ENABLE_QUICK_LOGIN=false`, and `SEED_DEMO=false`. VAPID keys can remain blank until browser push notifications are required.

## 3. First deployment

The GitHub workflow copies the tested repository to `/opt/youth-quest` but deliberately excludes `.env.production`. Once DNS and `.env.production` are ready, run the first deployment manually from the Droplet using `./deploy.sh`:

```bash
cd /opt/youth-quest
./deploy.sh
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f --tail=100
```

Caddy will request and automatically renew the TLS certificate. Confirm the site loads over HTTPS and that login, session refresh, PWA assets, media, and the Django health endpoint work. Do not create real youth accounts until HTTPS and access controls have been validated.

## 4. GitHub Actions CI/CD configuration

The workflow is `.github/workflows/ci-cd.yml`. Every push and pull request runs Django checks/tests and the frontend type-check/production build. Automatic deployment is gated and remains off until explicitly enabled.

In GitHub, open **Settings → Secrets and variables → Actions**. Add these repository variables:

| Variable | Example / value |
|---|---|
| `DEPLOY_ENABLED` | `true` only after server and domain setup |
| `DEPLOY_HOST` | Droplet IPv4 address |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_PATH` | `/opt/youth-quest` |
| `DEPLOY_KNOWN_HOSTS` | Verified SSH host-key line(s) for the Droplet |

Add this repository secret:

| Secret | Value |
|---|---|
| `DEPLOY_SSH_PRIVATE_KEY` | Private half of a dedicated Ed25519 key installed for the `deploy` user |

Generate a dedicated key on your trusted computer:

```bash
ssh-keygen -t ed25519 -C "github-actions-youth-quest" -f ./yq_github_deploy_key -N ""
```

Append `yq_github_deploy_key.pub` to the Droplet deployment user's `authorized_keys`. Store the contents of `yq_github_deploy_key` as the GitHub Actions secret `DEPLOY_SSH_PRIVATE_KEY`. Do not commit either key.

Obtain the server host key with `ssh-keyscan -H DROPLET_IP` and verify its fingerprint through a trusted channel before saving the line(s) as `DEPLOY_KNOWN_HOSTS`.

Keep `DEPLOY_ENABLED=false` while configuring the server. After the first manual deployment succeeds and HTTPS is verified, set it to `true`. Subsequent successful pushes to `main` will deploy automatically after both CI jobs pass. Pull requests never deploy.

## 5. Database and persistent data

PostgreSQL data is stored in the Docker volume `youthquest_postgres`; uploaded media is stored in `youthquest_media`; Django static assets are stored in `youthquest_static`. Do not run `docker compose down -v` in production: `-v` deletes the database and media volumes.

This low-cost initial setup does not include automated off-site backups. Before significant production use, arrange a scheduled encrypted `pg_dump` and a separate copy of media files. A disk or Droplet failure can otherwise destroy both data and uploads.

Useful commands:

```bash
# Inspect services
docker compose --env-file .env.production -f docker-compose.prod.yml ps

# Tail logs
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f backend

# Create a database dump (write it to a protected location and copy it off the Droplet)
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > youthquest-$(date +%F).sql

# Apply migrations (normally run automatically by the backend entrypoint)
docker compose --env-file .env.production -f docker-compose.prod.yml exec backend python manage.py migrate
```

## 6. Database engine

PostgreSQL 17 is used in local development, CI, and production. The local development Compose overlay starts a PostgreSQL container and persists its data in `youthquest_postgres_dev`. Production uses the separate `youthquest_postgres` volume. Do not use `docker compose down -v` unless you intentionally want to delete database data. Do not use `SEED_DEMO=true` in production.
