from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock
from typing import Any


class SQLiteGameStateStore:
    """SQLite-backed persistence for NPC personalities and game state."""

    def __init__(self, db_path: str) -> None:
        self._lock = RLock()
        self._db_path, self._is_memory = self._resolve_db_path(db_path)
        if not self._is_memory:
            self._db_path.parent.mkdir(parents=True, exist_ok=True)

        connection_target = ":memory:" if self._is_memory else str(self._db_path)
        self._conn = sqlite3.connect(connection_target, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA foreign_keys = ON")
            self._conn.execute("PRAGMA journal_mode = WAL")
            self._create_schema()

    @staticmethod
    def _resolve_db_path(db_path: str) -> tuple[Path, bool]:
        if db_path == ":memory:":
            return Path(db_path), True

        path = Path(db_path)
        if path.is_absolute():
            return path, False

        # /server/src/persistence/sqlite_store.py -> /server
        server_root = Path(__file__).resolve().parents[2]
        return server_root / path, False

    def _create_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS npc_personalities (
                npc_id TEXT PRIMARY KEY,
                personality_key TEXT NOT NULL,
                archetype TEXT NOT NULL,
                system_prompt TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS npc_state (
                npc_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                hp INTEGER NOT NULL,
                max_hp INTEGER NOT NULL,
                position_x REAL NOT NULL,
                position_y REAL NOT NULL,
                position_z REAL NOT NULL,
                mood TEXT NOT NULL,
                scale REAL NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (npc_id) REFERENCES npc_personalities(npc_id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS player_state (
                player_id TEXT PRIMARY KEY,
                hp INTEGER NOT NULL,
                max_hp INTEGER NOT NULL,
                mana INTEGER NOT NULL,
                max_mana INTEGER NOT NULL,
                level INTEGER NOT NULL,
                inventory_json TEXT NOT NULL,
                position_x REAL NOT NULL,
                position_y REAL NOT NULL,
                position_z REAL NOT NULL,
                active_quests_json TEXT NOT NULL,
                completed_quests_json TEXT NOT NULL,
                kill_count INTEGER NOT NULL,
                username TEXT NOT NULL,
                race TEXT NOT NULL,
                faction TEXT NOT NULL,
                skin TEXT NOT NULL,
                yaw REAL NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS npc_social_state (
                player_id TEXT NOT NULL,
                npc_id TEXT NOT NULL,
                relationship_score INTEGER NOT NULL DEFAULT 0,
                personality_notes TEXT NOT NULL DEFAULT '',
                conversation_summary TEXT NOT NULL DEFAULT '',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (player_id, npc_id)
            );

            CREATE TABLE IF NOT EXISTS episodic_memories (
                player_id TEXT NOT NULL,
                npc_id TEXT NOT NULL,
                memory_text TEXT NOT NULL,
                importance INTEGER NOT NULL DEFAULT 1,
                timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (player_id, npc_id, memory_text)
            );

            CREATE TABLE IF NOT EXISTS world_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                environment_json TEXT NOT NULL,
                recent_events_json TEXT NOT NULL,
                chat_history_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        self._conn.commit()

    def load_npc_social_records(self) -> dict[str, dict[str, dict[str, Any]]]:
        """Returns dict mapping player_id -> npc_id -> social_data_dict."""
        query = "SELECT player_id, npc_id, relationship_score, personality_notes, conversation_summary FROM npc_social_state"
        with self._lock:
            rows = self._conn.execute(query).fetchall()

        result: dict[str, dict[str, dict[str, Any]]] = {}
        for row in rows:
            pid = str(row["player_id"])
            nid = str(row["npc_id"])
            if pid not in result:
                result[pid] = {}
            result[pid][nid] = {
                "relationship_score": int(row["relationship_score"]),
                "personality_notes": str(row["personality_notes"]),
                "conversation_summary": str(row["conversation_summary"]),
            }
        return result

    def upsert_npc_social_record(self, player_id: str, npc_id: str, record: dict[str, Any]) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO npc_social_state (
                    player_id, npc_id, relationship_score, personality_notes, conversation_summary, updated_at
                )
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(player_id, npc_id) DO UPDATE SET
                    relationship_score = excluded.relationship_score,
                    personality_notes = excluded.personality_notes,
                    conversation_summary = excluded.conversation_summary,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    player_id,
                    npc_id,
                    int(record.get("relationship_score", 0)),
                    str(record.get("personality_notes", "")),
                    str(record.get("conversation_summary", "")),
                ),
            )
            self._conn.commit()

    def load_episodic_memories(self, player_id: str, npc_id: str, limit: int = 5) -> list[str]:
        query = """
            SELECT memory_text FROM episodic_memories
            WHERE player_id = ? AND npc_id = ?
            ORDER BY importance DESC, timestamp DESC
            LIMIT ?
        """
        with self._lock:
            rows = self._conn.execute(query, (player_id, npc_id, limit)).fetchall()
        return [str(row["memory_text"]) for row in rows]

    def add_episodic_memory(
        self, player_id: str, npc_id: str, memory_text: str, importance: int = 1
    ) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT OR IGNORE INTO episodic_memories (player_id, npc_id, memory_text, importance, timestamp)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (player_id, npc_id, memory_text, importance),
            )
            self._conn.commit()

    @staticmethod
    def _loads_json(raw: str, *, field: str, expected_type: type) -> Any:
        parsed = json.loads(raw)
        if not isinstance(parsed, expected_type):
            raise ValueError(f"Expected {field} to decode into {expected_type.__name__}.")
        return parsed

    def load_npc_records(self) -> dict[str, dict[str, Any]]:
        query = """
            SELECT
                s.npc_id,
                s.name,
                s.hp,
                s.max_hp,
                s.position_x,
                s.position_y,
                s.position_z,
                s.mood,
                s.scale,
                p.personality_key,
                p.archetype,
                p.system_prompt
            FROM npc_state AS s
            JOIN npc_personalities AS p ON p.npc_id = s.npc_id
        """
        with self._lock:
            rows = self._conn.execute(query).fetchall()

        records: dict[str, dict[str, Any]] = {}
        for row in rows:
            npc_id = str(row["npc_id"])
            records[npc_id] = {
                "npc_id": npc_id,
                "name": str(row["name"]),
                "hp": int(row["hp"]),
                "max_hp": int(row["max_hp"]),
                "position": [
                    float(row["position_x"]),
                    float(row["position_y"]),
                    float(row["position_z"]),
                ],
                "mood": str(row["mood"]),
                "scale": float(row["scale"]),
                "personality_key": str(row["personality_key"]),
                "archetype": str(row["archetype"]),
                "system_prompt": str(row["system_prompt"]),
            }
        return records

    def upsert_npc_record(self, record: dict[str, Any]) -> None:
        npc_id = str(record["npc_id"])
        position = record["position"]
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO npc_personalities (npc_id, personality_key, archetype, system_prompt, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(npc_id) DO UPDATE SET
                    personality_key = excluded.personality_key,
                    archetype = excluded.archetype,
                    system_prompt = excluded.system_prompt,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    npc_id,
                    str(record["personality_key"]),
                    str(record["archetype"]),
                    str(record["system_prompt"]),
                ),
            )
            self._conn.execute(
                """
                INSERT INTO npc_state (
                    npc_id, name, hp, max_hp, position_x, position_y, position_z, mood, scale, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(npc_id) DO UPDATE SET
                    name = excluded.name,
                    hp = excluded.hp,
                    max_hp = excluded.max_hp,
                    position_x = excluded.position_x,
                    position_y = excluded.position_y,
                    position_z = excluded.position_z,
                    mood = excluded.mood,
                    scale = excluded.scale,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    npc_id,
                    str(record["name"]),
                    int(record["hp"]),
                    int(record["max_hp"]),
                    float(position[0]),
                    float(position[1]),
                    float(position[2]),
                    str(record["mood"]),
                    float(record["scale"]),
                ),
            )
            self._conn.commit()

    def upsert_many_npc_records(self, records: list[dict[str, Any]]) -> None:
        if not records:
            return
        with self._lock:
            for record in records:
                npc_id = str(record["npc_id"])
                position = record["position"]
                self._conn.execute(
                    """
                    INSERT INTO npc_personalities (npc_id, personality_key, archetype, system_prompt, updated_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(npc_id) DO UPDATE SET
                        personality_key = excluded.personality_key,
                        archetype = excluded.archetype,
                        system_prompt = excluded.system_prompt,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        npc_id,
                        str(record["personality_key"]),
                        str(record["archetype"]),
                        str(record["system_prompt"]),
                    ),
                )
                self._conn.execute(
                    """
                    INSERT INTO npc_state (
                        npc_id, name, hp, max_hp, position_x, position_y, position_z, mood, scale, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(npc_id) DO UPDATE SET
                        name = excluded.name,
                        hp = excluded.hp,
                        max_hp = excluded.max_hp,
                        position_x = excluded.position_x,
                        position_y = excluded.position_y,
                        position_z = excluded.position_z,
                        mood = excluded.mood,
                        scale = excluded.scale,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        npc_id,
                        str(record["name"]),
                        int(record["hp"]),
                        int(record["max_hp"]),
                        float(position[0]),
                        float(position[1]),
                        float(position[2]),
                        str(record["mood"]),
                        float(record["scale"]),
                    ),
                )
            self._conn.commit()

    def delete_npc_record(self, npc_id: str) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM npc_state WHERE npc_id = ?", (npc_id,))
            self._conn.execute("DELETE FROM npc_personalities WHERE npc_id = ?", (npc_id,))
            self._conn.commit()

    def load_player_records(self) -> dict[str, dict[str, Any]]:
        query = """
            SELECT
                player_id,
                hp,
                max_hp,
                mana,
                max_mana,
                level,
                inventory_json,
                position_x,
                position_y,
                position_z,
                active_quests_json,
                completed_quests_json,
                kill_count,
                username,
                race,
                faction,
                skin,
                yaw
            FROM player_state
        """
        with self._lock:
            rows = self._conn.execute(query).fetchall()

        players: dict[str, dict[str, Any]] = {}
        for row in rows:
            player_id = str(row["player_id"])
            players[player_id] = {
                "hp": int(row["hp"]),
                "max_hp": int(row["max_hp"]),
                "mana": int(row["mana"]),
                "max_mana": int(row["max_mana"]),
                "level": int(row["level"]),
                "inventory": self._loads_json(
                    str(row["inventory_json"]), field="inventory_json", expected_type=list
                ),
                "position": [
                    float(row["position_x"]),
                    float(row["position_y"]),
                    float(row["position_z"]),
                ],
                "active_quests": self._loads_json(
                    str(row["active_quests_json"]),
                    field="active_quests_json",
                    expected_type=list,
                ),
                "completed_quests": self._loads_json(
                    str(row["completed_quests_json"]),
                    field="completed_quests_json",
                    expected_type=list,
                ),
                "kill_count": int(row["kill_count"]),
                "username": str(row["username"]),
                "race": str(row["race"]),
                "faction": str(row["faction"]),
                "skin": str(row["skin"]),
                "yaw": float(row["yaw"]),
            }
        return players

    def upsert_player_record(self, player_id: str, record: dict[str, Any]) -> None:
        position = record["position"]
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO player_state (
                    player_id, hp, max_hp, mana, max_mana, level,
                    inventory_json, position_x, position_y, position_z,
                    active_quests_json, completed_quests_json, kill_count,
                    username, race, faction, skin, yaw, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(player_id) DO UPDATE SET
                    hp = excluded.hp,
                    max_hp = excluded.max_hp,
                    mana = excluded.mana,
                    max_mana = excluded.max_mana,
                    level = excluded.level,
                    inventory_json = excluded.inventory_json,
                    position_x = excluded.position_x,
                    position_y = excluded.position_y,
                    position_z = excluded.position_z,
                    active_quests_json = excluded.active_quests_json,
                    completed_quests_json = excluded.completed_quests_json,
                    kill_count = excluded.kill_count,
                    username = excluded.username,
                    race = excluded.race,
                    faction = excluded.faction,
                    skin = excluded.skin,
                    yaw = excluded.yaw,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    player_id,
                    int(record["hp"]),
                    int(record["max_hp"]),
                    int(record["mana"]),
                    int(record["max_mana"]),
                    int(record["level"]),
                    json.dumps(record["inventory"]),
                    float(position[0]),
                    float(position[1]),
                    float(position[2]),
                    json.dumps(record["active_quests"]),
                    json.dumps(record["completed_quests"]),
                    int(record["kill_count"]),
                    str(record["username"]),
                    str(record["race"]),
                    str(record["faction"]),
                    str(record["skin"]),
                    float(record["yaw"]),
                ),
            )
            self._conn.commit()

    def upsert_many_player_records(self, records: dict[str, dict[str, Any]]) -> None:
        if not records:
            return
        with self._lock:
            for player_id, record in records.items():
                position = record["position"]
                self._conn.execute(
                    """
                    INSERT INTO player_state (
                        player_id, hp, max_hp, mana, max_mana, level,
                        inventory_json, position_x, position_y, position_z,
                        active_quests_json, completed_quests_json, kill_count,
                        username, race, faction, skin, yaw, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(player_id) DO UPDATE SET
                        hp = excluded.hp,
                        max_hp = excluded.max_hp,
                        mana = excluded.mana,
                        max_mana = excluded.max_mana,
                        level = excluded.level,
                        inventory_json = excluded.inventory_json,
                        position_x = excluded.position_x,
                        position_y = excluded.position_y,
                        position_z = excluded.position_z,
                        active_quests_json = excluded.active_quests_json,
                        completed_quests_json = excluded.completed_quests_json,
                        kill_count = excluded.kill_count,
                        username = excluded.username,
                        race = excluded.race,
                        faction = excluded.faction,
                        skin = excluded.skin,
                        yaw = excluded.yaw,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        player_id,
                        int(record["hp"]),
                        int(record["max_hp"]),
                        int(record["mana"]),
                        int(record["max_mana"]),
                        int(record["level"]),
                        json.dumps(record["inventory"]),
                        float(position[0]),
                        float(position[1]),
                        float(position[2]),
                        json.dumps(record["active_quests"]),
                        json.dumps(record["completed_quests"]),
                        int(record["kill_count"]),
                        str(record["username"]),
                        str(record["race"]),
                        str(record["faction"]),
                        str(record["skin"]),
                        float(record["yaw"]),
                    ),
                )
            self._conn.commit()

    def load_world_snapshot(self) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT environment_json, recent_events_json, chat_history_json FROM world_state WHERE id = 1"
            ).fetchone()
        if row is None:
            return None
        return {
            "environment": self._loads_json(
                str(row["environment_json"]), field="environment_json", expected_type=dict
            ),
            "recent_events": self._loads_json(
                str(row["recent_events_json"]), field="recent_events_json", expected_type=list
            ),
            "chat_history": self._loads_json(
                str(row["chat_history_json"]), field="chat_history_json", expected_type=list
            ),
        }

    def upsert_world_snapshot(
        self,
        environment: dict[str, Any],
        recent_events: list[str],
        chat_history: list[dict[str, Any]],
    ) -> None:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO world_state (
                    id, environment_json, recent_events_json, chat_history_json, updated_at
                )
                VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    environment_json = excluded.environment_json,
                    recent_events_json = excluded.recent_events_json,
                    chat_history_json = excluded.chat_history_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    json.dumps(environment),
                    json.dumps(recent_events),
                    json.dumps(chat_history),
                ),
            )
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()
