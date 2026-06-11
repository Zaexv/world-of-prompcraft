"""SQLite-backed game-state store.

Two tables:
- ``players`` — the full PlayerData as a JSON document (the player schema
  evolves quickly; a document column means no migration churn).
- ``npcs``    — only the *mutable* NPC state (hp, position, loot_dropped).
  Identity (name, personality, archetype) always comes from the manifest or
  runtime registration, so restoring is an overlay, never a respawn source.

All methods are synchronous sqlite3 — every call is a tiny single-row write
or a bounded read, invoked at low frequency (join, disconnect, a periodic
tick, shutdown), so they're safe to call from the event loop.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from dataclasses import asdict
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..world.world_state import WorldState

logger = logging.getLogger(__name__)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    player_id  TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS npcs (
    npc_id       TEXT PRIMARY KEY,
    hp           INTEGER NOT NULL,
    position     TEXT NOT NULL,
    loot_dropped INTEGER NOT NULL DEFAULT 0,
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


class GameStore:
    """Persist and restore the mutable game state in a SQLite database."""

    def __init__(self, db_path: str | Path) -> None:
        self._path = Path(db_path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self._path, check_same_thread=False)
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    # ── Players ───────────────────────────────────────────────────────────────

    def save_player(self, player_id: str, player: Any) -> None:
        """Upsert a player's full dataclass state as JSON."""
        doc = json.dumps(asdict(player))
        self._conn.execute(
            "INSERT INTO players (player_id, data, updated_at) VALUES (?, ?, datetime('now')) "
            "ON CONFLICT(player_id) DO UPDATE SET data = excluded.data, "
            "updated_at = excluded.updated_at",
            (player_id, doc),
        )
        self._conn.commit()

    def load_player(self, player_id: str) -> dict[str, Any] | None:
        """Return the persisted player document, or None for a new player."""
        row = self._conn.execute(
            "SELECT data FROM players WHERE player_id = ?", (player_id,)
        ).fetchone()
        if row is None:
            return None
        try:
            doc: dict[str, Any] = json.loads(row[0])
            return doc
        except (json.JSONDecodeError, TypeError):
            logger.warning("Corrupt player row for %s — treating as new", player_id)
            return None

    # ── NPCs ──────────────────────────────────────────────────────────────────

    def save_npc(self, npc: Any) -> None:
        """Upsert an NPC's mutable state (hp, position, loot flag)."""
        self._conn.execute(
            "INSERT INTO npcs (npc_id, hp, position, loot_dropped, updated_at) "
            "VALUES (?, ?, ?, ?, datetime('now')) "
            "ON CONFLICT(npc_id) DO UPDATE SET hp = excluded.hp, "
            "position = excluded.position, loot_dropped = excluded.loot_dropped, "
            "updated_at = excluded.updated_at",
            (npc.npc_id, npc.hp, json.dumps(list(npc.position)), int(npc.loot_dropped)),
        )
        self._conn.commit()

    def load_npc_overrides(self) -> dict[str, dict[str, Any]]:
        """Return npc_id → {hp, position, loot_dropped} for all persisted NPCs."""
        overrides: dict[str, dict[str, Any]] = {}
        for npc_id, hp, position, loot in self._conn.execute(
            "SELECT npc_id, hp, position, loot_dropped FROM npcs"
        ):
            try:
                pos = json.loads(position)
            except (json.JSONDecodeError, TypeError):
                continue
            overrides[npc_id] = {"hp": hp, "position": pos, "loot_dropped": bool(loot)}
        return overrides

    # ── Whole-world snapshot / restore ────────────────────────────────────────

    def save_world(self, world_state: WorldState) -> None:
        """Persist every player and every NPC's mutable state."""
        for player_id, player in world_state.players.items():
            self.save_player(player_id, player)
        for npc in world_state.npcs.values():
            self.save_npc(npc)

    def restore_world(self, world_state: WorldState) -> int:
        """Overlay persisted state onto a freshly built WorldState.

        Players are recreated from their JSON documents; NPC overrides apply
        only to NPCs that already exist (manifest) — except dead procedural
        NPCs, which are recreated as corpses so ``join_ok`` reports them dead
        and clients refuse to respawn them. Returns the number of restored rows.
        """
        from ..world.player_state import PlayerData
        from ..world.world_state import NPCData

        restored = 0
        for npc_id, override in self.load_npc_overrides().items():
            npc = world_state.npcs.get(npc_id)
            if npc is not None:
                npc.hp = int(override["hp"])
                npc.position = [float(c) for c in override["position"]]
                npc.loot_dropped = bool(override["loot_dropped"])
                restored += 1
            elif npc_id.startswith(("proc_", "enc_")) and int(override["hp"]) <= 0:
                world_state.npcs[npc_id] = NPCData(
                    npc_id=npc_id,
                    name="Slain creature",
                    personality="dead",
                    hp=0,
                    max_hp=1,
                    position=[float(c) for c in override["position"]],
                    loot_dropped=bool(override["loot_dropped"]),
                )
                restored += 1

        rows = self._conn.execute("SELECT player_id, data FROM players").fetchall()
        for player_id, doc in rows:
            try:
                fields: dict[str, Any] = json.loads(doc)
                world_state.players[player_id] = PlayerData(**fields)
                restored += 1
            except (json.JSONDecodeError, TypeError) as exc:
                logger.warning("Skipping corrupt player row %s: %s", player_id, exc)
        return restored

    def close(self) -> None:
        self._conn.close()
