from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .items import stacked_inventory
from .quests import QuestInstance, QuestReward, instantiate


@dataclass
class PlayerData:
    hp: int = 100
    max_hp: int = 100
    mana: int = 50
    max_mana: int = 50
    level: int = 1
    gold: int = 0
    inventory: list[str] = field(default_factory=list)
    position: list[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    active_quests: list[dict[str, Any]] = field(default_factory=list)
    completed_quests: list[str] = field(default_factory=list)
    kill_count: int = 0
    username: str = ""
    race: str = "human"
    faction: str = "alliance"
    yaw: float = 0.0

    def to_public_dict(self) -> dict[str, Any]:
        """Return minimal data suitable for broadcasting to other players."""
        return {
            "playerId": self.username or "",
            "username": self.username,
            "position": list(self.position),
            "race": self.race,
            "faction": self.faction,
            "hp": self.hp,
            "maxHp": self.max_hp,
            "gold": self.gold,
            "yaw": self.yaw,
        }

    def to_dict(self) -> dict[str, Any]:
        client_quests = [
            QuestInstance.from_storage_dict(q).to_client_dict() for q in self.active_quests
        ]
        return {
            "hp": self.hp,
            "maxHp": self.max_hp,
            "mana": self.mana,
            "maxMana": self.max_mana,
            "level": self.level,
            "gold": self.gold,
            "inventory": stacked_inventory(self.inventory),
            "username": self.username,
            "race": self.race,
            "faction": self.faction,
            "yaw": self.yaw,
            # Client-facing (camelCase) — what PlayerState.merge consumes.
            "activeQuests": client_quests,
            "completedQuests": list(self.completed_quests),
            # Internal/agent-context (snake) consumers still read these.
            "active_quests": list(self.active_quests),
            "completed_quests": list(self.completed_quests),
            "kill_count": self.kill_count,
        }

    # ── Quest API (instance-based, server-authoritative) ───────────────────

    def accept_quest(self, instance: dict[str, Any]) -> bool:
        """Store a full quest instance (offered→active). Returns False if dupe/invalid."""
        quest_id = str(instance.get("id", ""))
        if not quest_id or self.has_active_quest(quest_id) or self.has_completed_quest(quest_id):
            return False
        normalized = QuestInstance.from_storage_dict(instance)
        normalized.status = "active"
        self.active_quests.append(normalized.to_storage_dict())
        return True

    def accept_template(self, template_id: str, giver_name: str | None = None) -> bool:
        """Accept a curated quest by template id."""
        inst = instantiate(template_id, giver_name)
        if inst is None:
            return False
        return self.accept_quest(inst.to_storage_dict())

    def advance_objective(self, quest_id: str, objective_id: str) -> None:
        """Mark a specific objective completed (used by the LLM 'report back' path)."""
        for quest in self.active_quests:
            if quest.get("id") != quest_id:
                continue
            for obj in quest.get("objectives", []):
                if obj.get("id") == objective_id:
                    obj["progress"] = obj.get("required", 1)
                    obj["completed"] = True
                    return

    def get_quest(self, quest_id: str) -> dict[str, Any] | None:
        for quest in self.active_quests:
            if quest.get("id") == quest_id:
                return quest
        return None

    def all_objectives_complete(self, quest_id: str) -> bool:
        quest = self.get_quest(quest_id)
        if quest is None:
            return False
        objectives = quest.get("objectives", [])
        return bool(objectives) and all(o.get("completed") for o in objectives)

    def complete_quest(self, quest_id: str) -> QuestReward | None:
        """Move quest active→completed and return its reward (or None if absent)."""
        reward: QuestReward | None = None
        remaining: list[dict[str, Any]] = []
        for quest in self.active_quests:
            if quest.get("id") == quest_id:
                reward = QuestReward.from_dict(quest.get("reward"))
            else:
                remaining.append(quest)
        if reward is None:
            return None
        self.active_quests = remaining
        if quest_id not in self.completed_quests:
            self.completed_quests.append(quest_id)
        return reward

    def has_active_quest(self, quest_id: str) -> bool:
        return any(q.get("id") == quest_id for q in self.active_quests)

    def has_completed_quest(self, quest_id: str) -> bool:
        return quest_id in self.completed_quests
