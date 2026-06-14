#!/usr/bin/env python
"""Django management entry point for the embedded persistence layer.

Use it for schema work and inspection only, e.g.::

    python manage.py makemigrations gamedata
    python manage.py migrate
    python manage.py createsuperuser
    python manage.py runserver 8001   # optional admin at :8001/admin/

The game itself runs under FastAPI/uvicorn; this never starts the game server.
"""

from __future__ import annotations

import os
import sys


def main() -> None:
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "src.persistence.django_settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
