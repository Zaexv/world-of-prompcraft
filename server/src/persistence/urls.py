"""URL config for the optional Django admin (served only via ``manage.py
runserver`` for inspection — FastAPI owns the game's :8000 port)."""

from __future__ import annotations

from django.contrib import admin
from django.urls import path

urlpatterns = [path("admin/", admin.site.urls)]
