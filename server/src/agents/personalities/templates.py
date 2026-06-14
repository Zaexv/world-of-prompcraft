"""NPC personalities, loaded from data (``shared/data/personalities.json``).

Personalities used to be a large hand-edited Python dict; they now live in JSON
so an NPC Designer can author them without touching code. Each record is
validated through :class:`~src.agents.personalities.spec.NPCSpec`. The module
still exposes ``NPC_PERSONALITIES`` in its legacy ``dict[str, dict]`` shape so
existing consumers keep working.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

from .spec import NPCSpec

logger = logging.getLogger(__name__)

# Mirror npc_definitions.py: Docker mounts /shared, locally use a relative path.
_DOCKER_PATH = "/shared/data/personalities.json"
_LOCAL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "shared", "data", "personalities.json"
)
DATA_FILE = _DOCKER_PATH if os.path.exists(_DOCKER_PATH) else _LOCAL_PATH


def load_personalities() -> dict[str, dict[str, Any]]:
    """Load + validate personalities, returning the legacy dict shape."""
    if not os.path.exists(DATA_FILE):
        logger.error("Personalities file NOT FOUND at: %s", DATA_FILE)
        return {}
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            raw = json.load(f)
    except Exception:
        logger.exception("Failed to parse personalities file")
        return {}

    result: dict[str, dict[str, Any]] = {}
    for key, record in raw.items():
        record.setdefault("key", key)
        try:
            spec = NPCSpec.model_validate(record)
        except Exception:
            logger.exception("Invalid personality spec for %s — skipping", key)
            continue
        result[key] = spec.to_legacy_dict()
    return result


NPC_PERSONALITIES: dict[str, dict[str, Any]] = load_personalities()
