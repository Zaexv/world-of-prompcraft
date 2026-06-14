"""Embedded Django settings for the in-process ORM persistence layer.

Django is used purely as a schema/migration/ORM/admin layer — there is no
Django web server in production. The FastAPI app calls ``django.setup()`` once
at startup and drives the ORM through ``GameStore``. ``manage.py`` (and
``pytest-django``) use this same module via ``DJANGO_SETTINGS_MODULE``.

The database is the *same* SQLite file the rest of the game uses
(``settings.persistence_db_path``), so player/NPC rows and the LangGraph
checkpoint tables all live together.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from ..config import settings as app_settings

# Fall back to an in-repo file if persistence is disabled (empty string); the
# ORM still needs *a* database to bind to even when the game won't save to it.
_db_name = app_settings.persistence_db_path or "data/world.db"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": _db_name,
        "OPTIONS": {
            # WAL lets readers and the single writer coexist; busy timeout avoids
            # spurious "database is locked" under the periodic-save + per-turn
            # checkpointer write mix.
            "init_command": "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=30000;",
            "timeout": 30,
        },
        # pytest-django uses a *file* test DB (not in-memory) so the async
        # handler tests — which touch the ORM from a worker thread via
        # sync_to_async — share one database across connections/threads.
        "TEST": {"NAME": str(Path(tempfile.gettempdir()) / "wop_test.sqlite3")},
    }
}

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.admin",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "src.persistence.gamedata",
]

MIDDLEWARE = [
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "django.template.context_processors.request",
            ]
        },
    }
]

ROOT_URLCONF = "src.persistence.urls"
STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
# Local-only ORM/admin: this key never protects anything network-facing.
SECRET_KEY = "dev-only-not-secret"
