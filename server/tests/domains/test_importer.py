"""Phase 6: one-shot import of legacy blob data into the ORM schema."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

import pytest

from src.persistence import GameStore
from src.persistence.importer import import_legacy_data

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _isolate_world_objects_json(tmp_path: Path, monkeypatch: Any) -> None:
    """Point the world_objects.json importer at a nonexistent temp file so the
    repo's real shared/data/world_objects.json doesn't leak into these tests."""
    from src.persistence import importer

    monkeypatch.setattr(importer, "_world_objects_json_path", lambda: tmp_path / "no_objects.json")


def _seed_legacy_blob_db(path: Path) -> None:
    """Create the old raw-sqlite3 blob schema + rows the previous store wrote."""
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE players (player_id TEXT PRIMARY KEY, data TEXT NOT NULL,
                              updated_at TEXT);
        CREATE TABLE npcs (npc_id TEXT PRIMARY KEY, hp INTEGER NOT NULL,
                           position TEXT NOT NULL, loot_dropped INTEGER NOT NULL DEFAULT 0,
                           updated_at TEXT);
        """
    )
    conn.execute(
        "INSERT INTO players (player_id, data) VALUES (?, ?)",
        (
            "zaex",
            json.dumps(
                {
                    "username": "zaex",
                    "hp": 33,
                    "gold": 444,
                    "inventory": ["Health Potion", "Health Potion", "Iron Sword"],
                }
            ),
        ),
    )
    conn.execute(
        "INSERT INTO npcs (npc_id, hp, position, loot_dropped) VALUES (?, ?, ?, ?)",
        ("proc_wolf_1_1_0", 0, json.dumps([5.0, 0.0, 5.0]), 1),
    )
    conn.commit()
    conn.close()


def test_imports_legacy_blob_rows(tmp_path: Path) -> None:
    db = tmp_path / "world.db"
    _seed_legacy_blob_db(db)
    store = GameStore()

    count = import_legacy_data(str(db), store)
    assert count >= 2

    doc = store.load_player("zaex")
    assert doc is not None
    assert doc["hp"] == 33
    assert doc["gold"] == 444
    assert doc["inventory"].count("Health Potion") == 2

    overrides = store.load_npc_overrides()
    assert overrides["proc_wolf_1_1_0"]["hp"] == 0
    assert overrides["proc_wolf_1_1_0"]["loot_dropped"] is True


def test_import_is_idempotent(tmp_path: Path) -> None:
    db = tmp_path / "world.db"
    _seed_legacy_blob_db(db)
    store = GameStore()

    first = import_legacy_data(str(db), store)
    second = import_legacy_data(str(db), store)
    assert first >= 2
    assert second == 0  # marker set; legacy tables renamed → nothing to re-import

    # Legacy tables renamed out of the way, marker present.
    conn = sqlite3.connect(db)
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    conn.close()
    assert "players_legacy_blob" in names
    assert "_legacy_import_done" in names


def test_missing_legacy_db_is_noop(tmp_path: Path) -> None:
    store = GameStore()
    assert import_legacy_data(str(tmp_path / "does_not_exist.db"), store) == 0


def _patch_world_objects_json(monkeypatch: Any, path: Path) -> None:
    from src.persistence import importer

    monkeypatch.setattr(importer, "_world_objects_json_path", lambda: path)


def test_imports_world_objects_json(tmp_path: Path, monkeypatch: Any) -> None:
    objects_file = tmp_path / "world_objects.json"
    objects_file.write_text(
        json.dumps({"objects": [{"objectId": "wb_legacy", "objectType": "tower"}]})
    )
    _patch_world_objects_json(monkeypatch, objects_file)

    store = GameStore()
    count = import_legacy_data(str(tmp_path / "nodb.db"), store)
    assert count == 1
    assert "wb_legacy" in store.load_world_objects()
