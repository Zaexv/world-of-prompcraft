from __future__ import annotations

from django.apps import AppConfig


class GamedataConfig(AppConfig):
    name = "src.persistence.gamedata"
    label = "gamedata"
    default_auto_field = "django.db.models.BigAutoField"
