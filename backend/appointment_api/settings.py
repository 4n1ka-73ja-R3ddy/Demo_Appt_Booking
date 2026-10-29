import os
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

DEBUG = os.getenv('DJANGO_DEBUG', 'True').strip().lower() == 'true'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', '').strip()
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'local-development-only-not-for-deployment'
    else:
        raise RuntimeError('DJANGO_SECRET_KEY must be set when DJANGO_DEBUG=False.')

ALLOWED_HOSTS = [h.strip() for h in os.getenv('DJANGO_ALLOWED_HOSTS', '127.0.0.1,localhost').split(',') if h.strip()]
if not DEBUG and not ALLOWED_HOSTS:
    raise RuntimeError('DJANGO_ALLOWED_HOSTS must contain at least one hostname when DJANGO_DEBUG=False.')

GOOGLE_CALENDAR_ID = os.getenv('GOOGLE_CALENDAR_ID', 'primary').strip() or 'primary'
GOOGLE_CALENDAR_TIMEZONE = os.getenv('GOOGLE_CALENDAR_TIMEZONE', 'Asia/Kolkata').strip() or 'Asia/Kolkata'
CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.getenv(
        'CORS_ALLOWED_ORIGINS',
        'http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:5501,http://localhost:5501'
    ).split(',') if origin.strip()
]

INSTALLED_APPS = [
    'corsheaders',
    'django.contrib.admin', 'django.contrib.auth', 'django.contrib.contenttypes',
    'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles',
    'appointment_api',
]
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
ROOT_URLCONF = 'appointment_api.urls'
TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.request', 'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]
WSGI_APPLICATION = 'appointment_api.wsgi.application'

DATABASE_URL = os.getenv('DATABASE_URL', '').strip()
if DATABASE_URL:
    parsed = urlparse(DATABASE_URL)
    if parsed.scheme not in ('postgres', 'postgresql', 'postgresql+psycopg'):
        raise RuntimeError('DATABASE_URL must use postgresql:// or postgres://, or be unset for local SQLite.')
    if not parsed.path or parsed.path == '/':
        raise RuntimeError('DATABASE_URL must include a database name.')
    DATABASES = {'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': unquote(parsed.path.lstrip('/')),
        'USER': unquote(parsed.username or ''),
        'PASSWORD': unquote(parsed.password or ''),
        'HOST': parsed.hostname or 'localhost',
        'PORT': parsed.port or 5432,
        'CONN_MAX_AGE': 60,
        'OPTIONS': {'connect_timeout': 5},
    }}
else:
    DATABASES = {'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
        'OPTIONS': {'timeout': 20},
    }}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
LANGUAGE_CODE = 'en-in'
TIME_ZONE = GOOGLE_CALENDAR_TIMEZONE
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Conservative production defaults; HTTPS deployment may override via environment/proxy setup.
if not DEBUG:
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_REFERRER_POLICY = 'same-origin'
    X_FRAME_OPTIONS = 'DENY'
from corsheaders.defaults import default_headers

CORS_ALLOW_HEADERS = [
    *default_headers,
    "idempotency-key",
]