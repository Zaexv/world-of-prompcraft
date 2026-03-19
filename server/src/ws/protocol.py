from pydantic import BaseModel, Field


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


class DungeonEnter(BaseModel):
    """Client tells the server the player entered a dungeon."""

    type: str = "dungeon_enter"
    dungeon_id: str = Field(alias="dungeonId")
    player_id: str = Field(default="default", alias="playerId")

    model_config = {"populate_by_name": True}


class DungeonExit(BaseModel):
    """Client tells the server the player exited a dungeon (with collected loot)."""

    type: str = "dungeon_exit"
    dungeon_id: str = Field(alias="dungeonId")
    player_id: str = Field(default="default", alias="playerId")
    loot: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class QuestUpdate(BaseModel):
    """Generic quest objective advancement (e.g. kill tracking)."""

    type: str = "quest_update"
    quest_id: str = Field(alias="questId")
    objective_id: str = Field(alias="objectiveId")
    player_id: str = Field(default="default", alias="playerId")

    model_config = {"populate_by_name": True}


class Action(BaseModel):
    kind: str
    params: dict = Field(default_factory=dict)


class AgentResponse(BaseModel):
    type: str = "agent_response"
    npc_id: str = Field(alias="npcId")
    dialogue: str
    actions: list[Action] = []
    player_state_update: dict | None = Field(default=None, alias="playerStateUpdate")
    npc_state_update: dict | None = Field(default=None, alias="npcStateUpdate")

    model_config = {"populate_by_name": True, "ser_json_by_alias": True}  # type: ignore[typeddict-unknown-key]
