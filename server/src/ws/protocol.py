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
