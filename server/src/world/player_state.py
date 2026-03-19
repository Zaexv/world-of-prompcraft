from __future__ import annotations

from dataclasses import dataclass, field

from .npc_definitions import NPC_DEFINITIONS
from .quest_definitions import QUEST_DEFINITIONS


@dataclass
class PlayerData:
    hp: int = 100
    max_hp: int = 100
    mana: int = 50
    max_mana: int = 50
    level: int = 1
    inventory: list[str] = field(default_factory=list)
    position: list[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    active_quests: list[dict] = field(default_factory=list)
    completed_quests: list[str] = field(default_factory=list)
    kill_count: int = 0
    username: str = ""
    race: str = "human"
    faction: str = "alliance"
    yaw: float = 0.0

    def to_public_dict(self) -> dict:
        """Return minimal data suitable for broadcasting to other players."""
        return {
            "playerId": self.username or "",
            "username": self.username,
            "position": list(self.position),
            "race": self.race,
            "faction": self.faction,
            "hp": self.hp,
            "maxHp": self.max_hp,
            "yaw": self.yaw,
        }

    def to_dict(self) -> dict:
        return {
            "hp": self.hp,
            "maxHp": self.max_hp,
            "mana": self.mana,
            "maxMana": self.max_mana,
            "level": self.level,
            "inventory": list(self.inventory),
            "username": self.username,
            "race": self.race,
            "faction": self.faction,
            "yaw": self.yaw,
            "active_quests": [
                {
                    "id": q["id"],
                    "name": q.get("name", ""),
                    "description": q.get("description", ""),
                    "giverNpc": q.get("giver_npc", ""),
                    "giverName": q.get("giver_name", ""),
                    "rewardItem": q.get("reward_item", ""),
                    "rewardDescription": q.get("reward_description", ""),
                    "objectives": [
                        {
                            "id": obj["id"],
                            "description": obj.get("description", ""),
                            "type": obj.get("type", ""),
                            "target": obj.get("target", ""),
                            "completed": obj.get("completed", False),
                        }
                        for obj in q.get("objectives", [])
                    ],
                }
                for q in self.active_quests
            ],
            "completed_quests": list(self.completed_quests),
            "kill_count": self.kill_count,
        }

    def start_quest(self, quest_id: str) -> None:
        """Add a quest to active_quests from QUEST_DEFINITIONS."""
        if self.has_active_quest(quest_id) or self.has_completed_quest(quest_id):
            return
        quest_def = QUEST_DEFINITIONS.get(quest_id)
        if quest_def is None:
            return
        npc_def = NPC_DEFINITIONS.get(quest_def.giver_npc)
        giver_name = npc_def["name"] if npc_def else quest_def.giver_npc
        quest_entry: dict = {
            "id": quest_def.id,
            "name": quest_def.name,
            "description": quest_def.description,
            "giver_npc": quest_def.giver_npc,
            "giver_name": giver_name,
            "reward_item": quest_def.reward_item,
            "reward_description": quest_def.reward_description,
            "objectives": [
                {
                    "id": obj.id,
                    "description": obj.description,
                    "type": obj.type,
                    "target": obj.target,
                    "completed": False,
                }
                for obj in quest_def.objectives
            ],
        }
        self.active_quests.append(quest_entry)

    def advance_objective(self, quest_id: str, objective_id: str) -> None:
        """Mark a specific objective as completed."""
        for quest in self.active_quests:
            if quest["id"] == quest_id:
                for obj in quest.get("objectives", []):
                    if obj["id"] == objective_id:
                        obj["completed"] = True
                        return

    def complete_quest(self, quest_id: str) -> None:
        """Move quest from active to completed."""
        self.active_quests = [q for q in self.active_quests if q["id"] != quest_id]
        if quest_id not in self.completed_quests:
            self.completed_quests.append(quest_id)

    def has_active_quest(self, quest_id: str) -> bool:
        """Check if a quest is currently active."""
        return any(q["id"] == quest_id for q in self.active_quests)

    def has_completed_quest(self, quest_id: str) -> bool:
        """Check if a quest has been completed."""
        return quest_id in self.completed_quests
