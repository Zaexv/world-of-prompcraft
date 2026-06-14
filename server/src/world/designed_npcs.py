"""Durable store for NPCs created at runtime via the in-game NPC Designer.

Designer-made NPCs live in ``shared/data/designed_npcs.json`` (separate from the
hand-authored ``world_manifest.json``) so they survive restarts without the
Designer having to edit the complex zonal manifest. Each record is an
``NPCSpec`` plus a spawn ``position``.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

_DOCKER_PATH = "/shared/data/designed_npcs.json"
_LOCAL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "shared", "data", "designed_npcs.json"
)
DATA_FILE = _DOCKER_PATH if os.path.exists(os.path.dirname(_DOCKER_PATH)) else _LOCAL_PATH


def load_designed_npcs() -> dict[str, dict[str, Any]]:
    """Load all designer-created NPC records, keyed by npc id. Empty on error."""
    if not os.path.exists(DATA_FILE):
        return {}
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            data: dict[str, dict[str, Any]] = json.load(f)
            return data
    except Exception:
        logger.exception("Failed to read designed NPCs file")
        return {}


def _write(records: dict[str, dict[str, Any]]) -> None:
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)


def save_designed_npc(record: dict[str, Any]) -> None:
    """Insert or replace a designed NPC record (must contain ``npc_id``)."""
    records = load_designed_npcs()
    records[record["npc_id"]] = record
    _write(records)


def update_designed_npc(npc_id: str, patch: dict[str, Any]) -> bool:
    """Merge ``patch`` into an existing record. Returns False if id unknown."""
    records = load_designed_npcs()
    if npc_id not in records:
        return False
    records[npc_id].update(patch)
    _write(records)
    return True
