"""One-shot migration of pre-ORM data into the Django schema.

Two legacy sources are folded in, idempotently:

1. The old raw-``sqlite3`` ``players`` / ``npcs`` *blob* tables (JSON document
   per row) that the previous ``GameStore`` wrote into ``data/world.db``.
2. The standalone ``shared/data/world_objects.json`` file that used to hold
   player-built objects.

The importer is safe to run on every boot: it checks for the legacy tables /
file and a marker row, imports once, then records that it ran so subsequent
boots are no-ops. Legacy blob tables are renamed (not dropped) so the original
data remains recoverable.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .store import GameStore

logger = logging.getLogger(__name__)

_MARKER = "_legacy_import_done"


def _world_objects_json_path() -> Path:
    base_dir = Path(__file__).resolve().parents[3]
    return base_dir / "shared" / "data" / "world_objects.json"


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone()
    return row is not None


def import_legacy_data(db_path: str, store: GameStore) -> int:
    """Import legacy blob rows + world_objects.json into the ORM. Returns count.

    ``db_path`` is the SQLite file; ``store`` is the live ORM-backed GameStore.
    """
    imported = 0

    # ── World objects JSON file → WorldObject rows ────────────────────────────
    objects_path = _world_objects_json_path()
    if objects_path.exists():
        try:
            data = json.loads(objects_path.read_text())
            objects = data.get("objects", []) if isinstance(data, dict) else data
            mapping = {
                str(o["objectId"]): o for o in objects if isinstance(o, dict) and o.get("objectId")
            }
            if mapping:
                # Merge with anything already persisted (don't clobber newer rows).
                existing = store.load_world_objects()
                existing.update({k: v for k, v in mapping.items() if k not in existing})
                store.save_world_objects(existing)
                imported += len(mapping)
                logger.info("Imported %d world objects from %s", len(mapping), objects_path)
        except Exception:
            logger.exception("Failed importing world objects from %s", objects_path)

    # ── Legacy blob tables in the SQLite file ─────────────────────────────────
    if not db_path or not Path(db_path).exists():
        return imported

    conn = sqlite3.connect(db_path)
    try:
        # Already imported? (marker table written on a prior successful run).
        if _table_exists(conn, _MARKER):
            return imported
        # Distinguish the *legacy* blob schema from the new ORM tables: the old
        # players table has a `data` JSON column; the ORM one does not.
        legacy_players = _table_exists(conn, "players") and _column_exists(conn, "players", "data")
        legacy_npcs = _table_exists(conn, "npcs") and _column_exists(conn, "npcs", "loot_dropped")

        if legacy_players:
            imported += _import_players(conn, store)
        if legacy_npcs:
            imported += _import_npcs(conn, store)

        if legacy_players or legacy_npcs:
            # Rename the legacy tables out of the way and drop a marker so we
            # never re-import.
            if legacy_players:
                conn.execute("ALTER TABLE players RENAME TO players_legacy_blob")
            if legacy_npcs:
                conn.execute("ALTER TABLE npcs RENAME TO npcs_legacy_blob")
            conn.execute(f"CREATE TABLE {_MARKER} (done INTEGER)")
            conn.execute(f"INSERT INTO {_MARKER} (done) VALUES (1)")
            conn.commit()
            logger.info("Legacy blob import complete (%d rows); tables renamed", imported)
    finally:
        conn.close()

    return imported


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    return column in cols


def _import_players(conn: sqlite3.Connection, store: GameStore) -> int:
    from ..world.player_state import PlayerData

    count = 0
    for player_id, doc_text in conn.execute("SELECT player_id, data FROM players"):
        try:
            doc: dict[str, Any] = json.loads(doc_text)
            player = PlayerData(**doc)
            store.save_player(player_id, player)
            count += 1
        except Exception:
            logger.warning("Skipping un-importable legacy player %s", player_id)
    return count


def _import_npcs(conn: sqlite3.Connection, store: GameStore) -> int:
    from ..world.world_state import NPCData

    count = 0
    for npc_id, hp, position, loot in conn.execute(
        "SELECT npc_id, hp, position, loot_dropped FROM npcs"
    ):
        try:
            pos = json.loads(position)
            npc = NPCData(
                npc_id=npc_id,
                name="",
                personality="",
                hp=int(hp),
                position=[float(c) for c in pos],
                loot_dropped=bool(loot),
            )
            store.save_npc(npc)
            count += 1
        except Exception:
            logger.warning("Skipping un-importable legacy NPC %s", npc_id)
    return count
