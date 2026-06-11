"""Tests for multiplayer sync correctness.

Covers the three sync guarantees:
1. A player's private NPC interaction is never broadcast as their prompt —
   only the NPC's spoken reply is overheard nearby (tagged with the speaker).
2. Procedural NPCs auto-register at their real world position, so
   nearby-broadcasts (combat sync, death) are measured from the fight, not
   the world origin.
3. NPC damage/death reaches bystanders via npc_actions with the NPC's real
   position as the broadcast origin.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.world.world_state import NPCData, WorldState
from src.ws import handler


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send_json(self, data: dict[str, Any]) -> None:
        self.sent.append(data)


class _RecordingManager:
    """Fake ConnectionManager that records every nearby-broadcast."""

    def __init__(self, player_id: str) -> None:
        self._player_id = player_id
        self.broadcasts: list[dict[str, Any]] = []

    def get_player_id(self, _websocket: Any) -> str:
        return self._player_id

    async def broadcast_nearby(
        self,
        data: dict[str, Any],
        origin: Any = None,
        radius: float = 0.0,
        world_state: Any = None,
        exclude: str | None = None,
    ) -> None:
        self.broadcasts.append(
            {
                "data": data,
                "origin": list(origin) if origin else None,
                "radius": radius,
                "exclude": exclude,
            }
        )


class _FakeRegistry:
    def __init__(self) -> None:
        self.dynamic_npcs: list[Any] = []

    async def invoke(self, **_kwargs: Any) -> dict[str, Any]:
        return {"dialogue": "LLM_REPLY", "actions": [], "npcStateUpdate": {}}

    def register_dynamic_npc(self, npc: Any) -> None:
        self.dynamic_npcs.append(npc)


@pytest.fixture(autouse=True)
def _reset_world_state() -> Any:
    WorldState._instance = None
    yield
    WorldState._instance = None


def _spawn_npc(world: WorldState, npc_id: str, position: list[float], hp: int = 200) -> None:
    world.npcs[npc_id] = NPCData(
        npc_id=npc_id,
        name="Ignathar",
        personality="boss",
        hp=hp,
        max_hp=hp,
        position=position,
        mood="angry",
        archetype="hostile_boss",
    )


async def _interact(
    manager: _RecordingManager, data: dict[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    fake_ws = _FakeWebSocket()
    result = await handler._handle_interaction(
        data,
        fake_ws,  # type: ignore[arg-type]
        manager,  # type: ignore[arg-type]
    )
    return result, fake_ws.sent


# ── 1. Private interactions stay private ─────────────────────────────────────


@pytest.mark.asyncio
async def test_player_prompt_is_never_broadcast() -> None:
    world = WorldState()
    _spawn_npc(world, "dragon_01", [50.0, 0.0, 50.0])
    world.get_player("p1")
    manager = _RecordingManager("p1")
    handler.init_handler(_FakeRegistry(), world, manager)  # type: ignore[arg-type]

    secret = "Tell me about the hidden treasure, just between us."
    await _interact(manager, {"npcId": "dragon_01", "playerId": "p1", "prompt": secret})

    for b in manager.broadcasts:
        assert b["data"].get("dialogue") != secret, "private prompt leaked to other players"


@pytest.mark.asyncio
async def test_npc_reply_broadcast_is_tagged_with_speaker_and_npc_name() -> None:
    """The NPC's spoken reply may be overheard — but must carry the npcName and
    the originating player so clients can render it world-only (bubble)."""
    world = WorldState()
    _spawn_npc(world, "dragon_01", [50.0, 0.0, 50.0])
    world.get_player("p1")
    manager = _RecordingManager("p1")
    handler.init_handler(_FakeRegistry(), world, manager)  # type: ignore[arg-type]

    await _interact(manager, {"npcId": "dragon_01", "playerId": "p1", "prompt": "Hello there."})

    dialogues = [b for b in manager.broadcasts if b["data"].get("type") == "npc_dialogue"]
    assert dialogues, "NPC reply should be overhearable nearby"
    for b in dialogues:
        assert b["data"]["npcName"], "npc_dialogue without npcName renders as a player chat line"
        assert b["data"]["speakerPlayer"] == "p1"
        assert b["exclude"] == "p1", "the speaking player gets the reply via agent_response"


# ── 2. Procedural NPC registration position ──────────────────────────────────


@pytest.mark.asyncio
async def test_procedural_npc_registers_at_npc_position() -> None:
    world = WorldState()
    world.get_player("p1")
    manager = _RecordingManager("p1")
    handler.init_handler(_FakeRegistry(), world, manager)  # type: ignore[arg-type]

    await _interact(
        manager,
        {
            "npcId": "proc_wolf_3_-2_0",
            "npcName": "Dire Wolf",
            "npcPosition": [210.0, 4.0, -130.0],
            "playerId": "p1",
            "prompt": "Hello?",
        },
    )

    npc = world.get_npc("proc_wolf_3_-2_0")
    assert npc is not None
    assert npc.position == [210.0, 4.0, -130.0]


@pytest.mark.asyncio
async def test_procedural_npc_falls_back_to_player_position() -> None:
    world = WorldState()
    world.get_player("p1")
    manager = _RecordingManager("p1")
    handler.init_handler(_FakeRegistry(), world, manager)  # type: ignore[arg-type]

    await _interact(
        manager,
        {
            "npcId": "proc_wolf_3_-2_1",
            "npcName": "Dire Wolf",
            "playerId": "p1",
            "prompt": "Hello?",
            "playerState": {"position": [99.0, 1.0, 77.0], "hp": 100, "inventory": []},
        },
    )

    npc = world.get_npc("proc_wolf_3_-2_1")
    assert npc is not None
    assert npc.position == [99.0, 1.0, 77.0], (
        "should fall back to the interacting player's position"
    )


# ── 3. Death reaches bystanders from the right origin ────────────────────────


@pytest.mark.asyncio
async def test_npc_damage_broadcast_originates_at_npc_position() -> None:
    world = WorldState()
    _spawn_npc(world, "dragon_01", [300.0, 2.0, -450.0], hp=200)
    world.get_player("p1")
    manager = _RecordingManager("p1")
    handler.init_handler(_FakeRegistry(), world, manager)  # type: ignore[arg-type]

    await _interact(
        manager,
        {"npcId": "dragon_01", "playerId": "p1", "prompt": "I attack the dragon with my sword!"},
    )

    combat = [b for b in manager.broadcasts if b["data"].get("type") == "npc_actions"]
    assert combat, "bystanders must receive the combat npc_actions broadcast"
    for b in combat:
        assert b["origin"] == [300.0, 2.0, -450.0], (
            "broadcast must radiate from the NPC, not the origin"
        )
        assert b["exclude"] == "p1"
        assert b["data"].get("npcStateUpdate"), "hp update must ride along for nameplates/death"


@pytest.mark.asyncio
async def test_killed_npc_hp_is_zero_in_world_state() -> None:
    """Late joiners get the dead NPC via join_ok — hp must be authoritative."""
    world = WorldState()
    _spawn_npc(world, "dragon_01", [10.0, 0.0, 10.0], hp=1)
    world.get_player("p1")
    manager = _RecordingManager("p1")
    handler.init_handler(_FakeRegistry(), world, manager)  # type: ignore[arg-type]

    await _interact(
        manager,
        {"npcId": "dragon_01", "playerId": "p1", "prompt": "I attack the dragon!"},
    )

    npc = world.get_npc("dragon_01")
    assert npc is not None
    assert npc.hp == 0
