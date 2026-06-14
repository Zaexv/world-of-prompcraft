"""Idempotent embedded-Django bootstrap.

Both the FastAPI ``lifespan`` and any standalone script can call
``setup_django()`` to configure the ORM, and ``run_migrations()`` to ensure the
schema exists. ``pytest-django`` and ``manage.py`` configure Django themselves,
so these are no-ops when Django is already set up.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_SETTINGS_MODULE = "src.persistence.django_settings"


def setup_django() -> None:
    """Configure Django once. Safe to call repeatedly."""
    import django
    from django.apps import apps

    if apps.ready:
        return
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", _SETTINGS_MODULE)
    django.setup()


def run_migrations() -> None:
    """Apply outstanding migrations (creates tables on first boot)."""
    from pathlib import Path

    from django.conf import settings as dj_settings
    from django.core.management import call_command

    db_name = str(dj_settings.DATABASES["default"]["NAME"])
    if db_name not in (":memory:", "", "None"):
        Path(db_name).parent.mkdir(parents=True, exist_ok=True)

    call_command("migrate", "--no-input", verbosity=0)
    logger.info("Database migrations applied")
