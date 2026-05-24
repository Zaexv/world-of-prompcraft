from __future__ import annotations

from pydantic import BaseModel, Field

# ── Client → Server models ─────────────────────────────────────────────────────


class PlayerInteraction(BaseModel):
    type: str = "interaction"
    npc_id: str = Field(alias="npcId")
    prompt: str
    player_id: str = Field(default="default", alias="playerId")
    player_state: dict = Field(default_factory=dict, alias="playerState")

    model_config = {"populate_by_name": True}


class PlayerMove(BaseModel):
    type: str = "player_move"
    player_id: str = Field(default="default", alias="playerId")
    position: list[float]

    model_config = {"populate_by_name": True}


class UseItem(BaseModel):
    type: str = "use_item"
    player_id: str = Field(default="default", alias="playerId")
    item: str

    model_config = {"populate_by_name": True}


class EquipItem(BaseModel):
    type: str = "equip_item"
    player_id: str = Field(default="default", alias="playerId")
    item: str
    slot: str | None = None
    equipped: bool = True

    model_config = {"populate_by_name": True}


class ExploreArea(BaseModel):
    type: str = "explore_area"
    position: list[float]
    npcs: list[dict] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class DungeonEnter(BaseModel):
    type: str = "dungeon_enter"
    dungeon_id: str = Field(alias="dungeonId")
    player_id: str = Field(default="default", alias="playerId")

    model_config = {"populate_by_name": True}


class DungeonExit(BaseModel):
    type: str = "dungeon_exit"
    dungeon_id: str = Field(alias="dungeonId")
    player_id: str = Field(default="default", alias="playerId")
    loot: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class QuestUpdate(BaseModel):
    type: str = "quest_update"
    quest_id: str = Field(alias="questId")
    objective_id: str = Field(alias="objectiveId")
    player_id: str = Field(default="default", alias="playerId")

    model_config = {"populate_by_name": True}


# ── Shared data shapes ─────────────────────────────────────────────────────────


class Action(BaseModel):
    kind: str
    params: dict = Field(default_factory=dict)


# ── Server → Client models ─────────────────────────────────────────────────────


class AgentResponse(BaseModel):
    type: str = "agent_response"
    npc_id: str = Field(alias="npcId")
    dialogue: str
    actions: list[Action] = []
    player_state_update: dict | None = Field(default=None, alias="playerStateUpdate")
    npc_state_update: dict | None = Field(default=None, alias="npcStateUpdate")

    model_config = {"populate_by_name": True, "ser_json_by_alias": True}  # type: ignore[typeddict-unknown-key]


class UseItemResult(BaseModel):
    type: str = "use_item_result"
    success: bool
    message: str
    actions: list[Action] = []
    player_state_update: dict | None = Field(default=None, alias="playerStateUpdate")

    model_config = {"populate_by_name": True, "ser_json_by_alias": True}  # type: ignore[typeddict-unknown-key]


class AckMessage(BaseModel):
    type: str = "ack"
    status: str = "ok"

    model_config = {"populate_by_name": True}
