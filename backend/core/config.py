
import os
import base64
import json
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv
from cryptography.hazmat.primitives import serialization


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _load_or_create_dev_vapid() -> tuple[str, str]:
    """Keep a stable development VAPID identity in the persistent data volume.

    Production may omit VAPID keys when browser push notifications are not enabled.
    """
    public = os.getenv('VAPID_PUBLIC_KEY', '').strip()
    private = os.getenv('VAPID_PRIVATE_KEY', '').strip()

    if public and private:
        return public, private

    if os.getenv('APP_ENV', 'local').lower() == 'prod':
        return public, private

    path = (
        Path(os.getenv('APP_DATA_DIR', str(Path(__file__).resolve().parents[2] / 'data')))
        / 'vapid_keys.json'
    )

    try:
        if path.exists():
            data = json.loads(path.read_text())
            if data.get('public') and data.get('private'):
                return str(data['public']), str(data['private'])

        from cryptography.hazmat.primitives.asymmetric import ec

        key = ec.generate_private_key(ec.SECP256R1())

        private_bytes = key.private_numbers().private_value.to_bytes(32, 'big')

        public_bytes = key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )

        data = {
            'public': _b64url(public_bytes),
            'private': _b64url(private_bytes),
        }

        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))

        try:
            path.chmod(0o600)
        except OSError:
            pass

        return data['public'], data['private']

    except Exception:
        return '', ''


# One project-level .env is shared by local, Docker and CI/dev environments.
PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / '.env')


def csv(name: str, default: str) -> list[str]:
    return [
        x.strip()
        for x in os.getenv(name, default).split(',')
        if x.strip()
    ]


@dataclass(frozen=True)
class AppConfig:
    env: str
    app_name: str
    secret_key: str
    debug: bool
    enable_quick_login: bool
    allowed_hosts: list[str]
    cors_origins: list[str]
    csrf_origins: list[str]
    api_prefix: str
    db_engine: str
    db_name: str
    db_user: str
    db_password: str
    db_host: str
    db_port: str
    secure_cookies: bool
    session_age: int
    rate_limit_backend: str
    frontend_url: str
    vapid_public_key: str
    vapid_private_key: str
    vapid_subject: str


_VAPID_PUBLIC_KEY, _VAPID_PRIVATE_KEY = _load_or_create_dev_vapid()


CONFIG = AppConfig(
    env=os.getenv('APP_ENV', 'local').lower(),
    app_name=os.getenv('APP_NAME', 'Youth Quest'),
    secret_key=os.getenv('SECRET_KEY', ''),
    debug=os.getenv('DEBUG', 'false').lower() == 'true',
    enable_quick_login=os.getenv('ENABLE_QUICK_LOGIN', 'false').lower() == 'true',
    allowed_hosts=csv('ALLOWED_HOSTS', 'localhost,127.0.0.1,.devtunnels.ms'),
    cors_origins=csv('CORS_ORIGINS', 'http://localhost:5173'),
    csrf_origins=csv(
        'CSRF_TRUSTED_ORIGINS',
        'http://localhost:5173,https://*.devtunnels.ms'
    ),
    api_prefix=os.getenv('API_PREFIX', 'api').strip('/'),

    # SQLite for development, PostgreSQL for production.
    db_engine=os.getenv('DB_ENGINE', 'sqlite').strip().lower(),

    db_name=os.getenv('DB_NAME', ''),
    db_user=os.getenv('DB_USER', ''),
    db_password=os.getenv('DB_PASSWORD', ''),
    db_host=os.getenv('DB_HOST', ''),
    db_port=os.getenv('DB_PORT', '5432'),

    secure_cookies=os.getenv('SECURE_COOKIES', 'false').lower() == 'true',
    session_age=int(os.getenv('SESSION_COOKIE_AGE', str(60 * 60 * 24 * 7))),
    rate_limit_backend=os.getenv('RATE_LIMIT_BACKEND', 'locmem'),
    frontend_url=os.getenv('FRONTEND_URL', 'http://localhost:5173').rstrip('/'),

    vapid_public_key=_VAPID_PUBLIC_KEY,
    vapid_private_key=_VAPID_PRIVATE_KEY,
    vapid_subject=os.getenv('VAPID_SUBJECT', 'mailto:admin@example.com'),
)


# Validate database engine.
if CONFIG.db_engine not in ('sqlite', 'postgres'):
    raise RuntimeError('DB_ENGINE must be either sqlite or postgres')


# PostgreSQL requires connection credentials.
if CONFIG.db_engine == 'postgres':
    if not all((
        CONFIG.db_name,
        CONFIG.db_user,
        CONFIG.db_password,
        CONFIG.db_host,
    )):
        raise RuntimeError(
            'DB_NAME, DB_USER, DB_PASSWORD and DB_HOST are required for PostgreSQL'
        )


# Production must always use PostgreSQL.
if CONFIG.env == 'prod' and CONFIG.db_engine != 'postgres':
    raise RuntimeError('Production must use PostgreSQL')


# Production security validation.
if CONFIG.env == 'prod':

    if (
        not CONFIG.secret_key
        or len(CONFIG.secret_key) < 50
        or CONFIG.secret_key in {'change-me-in-dev', 'unsafe-local'}
        or 'REPLACE' in CONFIG.secret_key.upper()
    ):
        raise RuntimeError(
            'SECRET_KEY must be a strong, unique value in production'
        )

    if CONFIG.debug:
        raise RuntimeError('DEBUG must be false in production')

    if not CONFIG.allowed_hosts or CONFIG.allowed_hosts == ['*']:
        raise RuntimeError(
            'ALLOWED_HOSTS must be explicitly configured in production'
        )

    if (
        '*' in CONFIG.cors_origins
        or any(
            x.strip().startswith('https://*.devtunnels.ms')
            for x in CONFIG.csrf_origins
        )
    ):
        raise RuntimeError(
            'Production CORS/CSRF origins must be explicit; '
            'wildcard development origins are not allowed'
        )

    if not CONFIG.cors_origins:
        raise RuntimeError(
            'CORS_ORIGINS must contain explicit production origins'
        )

    if (
        'REPLACE' in CONFIG.db_password.upper()
        or 'YOUR-' in CONFIG.db_host.upper()
    ):
        raise RuntimeError(
            'Production database credentials must not contain example placeholders'
        )

    if CONFIG.enable_quick_login:
        raise RuntimeError(
            'ENABLE_QUICK_LOGIN must be false in production'
        )
