
from pathlib import Path
from core.config import CONFIG


BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = CONFIG.secret_key
DEBUG = CONFIG.debug
ALLOWED_HOSTS = CONFIG.allowed_hosts


INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'core.apps.CoreConfig',
    'api',
]


MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'core.middleware.RequestIdMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
]


ROOT_URLCONF = 'config.urls'
ASGI_APPLICATION = 'config.asgi.application'

SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
USE_X_FORWARDED_HOST = True


TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    }
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database configuration.
if CONFIG.db_engine == 'sqlite':

    # SQLite database stored in the persistent application data directory.
    DATA_DIR = Path(
        __import__('os').getenv('APP_DATA_DIR', str(BASE_DIR / 'data'))
    )

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': DATA_DIR / 'db.sqlite3',
            'OPTIONS': {
                'timeout': 20,
            },
        }
    }

elif CONFIG.db_engine == 'postgres':

    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': CONFIG.db_name,
            'USER': CONFIG.db_user,
            'PASSWORD': CONFIG.db_password,
            'HOST': CONFIG.db_host,
            'PORT': CONFIG.db_port,
            'CONN_MAX_AGE': 60,
        }
    }

else:
    raise RuntimeError(
        f'Unsupported database engine: {CONFIG.db_engine}'
    )


# Internationalization.
LANGUAGE_CODE = 'en-gb'
TIME_ZONE = 'Europe/London'
USE_I18N = True
USE_TZ = True


# Static and media files.
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'


DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# CORS and CSRF.
CORS_ALLOWED_ORIGINS = CONFIG.cors_origins

CORS_ALLOWED_ORIGIN_REGEXES = (
    []
    if CONFIG.env == 'prod'
    else [r'^https://.*\.devtunnels\.ms$']
)

CSRF_TRUSTED_ORIGINS = CONFIG.csrf_origins
CORS_ALLOW_CREDENTIALS = True


# Django REST Framework.
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
}


# Security defaults.
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
X_FRAME_OPTIONS = 'DENY'

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_AGE = CONFIG.session_age
SESSION_COOKIE_PATH = '/'
SESSION_EXPIRE_AT_BROWSER_CLOSE = False

CSRF_COOKIE_HTTPONLY = False

SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'


if CONFIG.secure_cookies:

    SECURE_SSL_REDIRECT = True

    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

else:

    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False


# Logging.
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,

    'formatters': {
        'security': {
            'format': '%(asctime)s %(levelname)s %(name)s %(message)s',
        },
    },

    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'security',
        },
    },

    'loggers': {
        'youthquest.request': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },

        'django.security': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}
