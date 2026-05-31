from __future__ import annotations

import hashlib
import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import HumanMessage

from .npc_agent import create_npc_agent
from .tools import get_all_tools

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langgraph.graph.state import CompiledStateGraph as CompiledGraph

    from ..world.world_state import WorldState

logger = logging.getLogger(__name__)


def _build_input_state(
    npc_id: str,
    npc_name: str,
    npc_personality: str,
    prompt: str,
    player_state: dict[str, Any],
    world_context: dict[str, Any],
) -> dict[str, Any]:
    """Build the per-turn graph input without clobbering persisted memory."""
    return {
        "messages": [HumanMessage(content=prompt)],
        "npc_id": npc_id,
        "npc_name": npc_name,
        "npc_personality": npc_personality,
        "player_state": player_state,
        "world_context": world_context,
        "pending_actions": [],
        "response_text": "",
    }


class AgentRegistry:
    """Creates and manages one LangGraph agent per NPC."""

    def __init__(self, llm: BaseChatModel, world_state: WorldState) -> None:
        self._llm = llm
        self._world_state = world_state
        self._agents: dict[str, CompiledGraph] = {}  # type: ignore[type-arg]
        # Each NPC gets its own shared pending_actions list and world_state snapshot dict
        # so that tool closures can write into them during invocation.
        self._shared_state: dict[str, dict[str, Any]] = {}
        self._response_cache: dict[str, dict[str, Any]] = {}
        self._build_agents()

    def _build_agents(self) -> None:
        """Create a compiled graph for every NPC registered in world state."""
        for npc_id, npc_data in self._world_state.npcs.items():
            npc_config = {
                "name": npc_data.name,
                "personality": npc_data.personality,
            }

            # Each NPC gets its own mutable containers for the tool closure
            pending_actions: list[Any] = []
            world_snapshot: dict[str, Any] = {}

            tools = get_all_tools(
                pending_actions=pending_actions,
                world_state=world_snapshot,
            )

            agent = create_npc_agent(
                npc_id=npc_id,
                npc_config=npc_config,
                llm=self._llm,
                tools=tools,
                shared_pending_actions=pending_actions,
                world_state=self._world_state,
            )
            self._agents[npc_id] = agent
            self._shared_state[npc_id] = {
                "pending_actions": pending_actions,
                "world_snapshot": world_snapshot,
            }
            logger.info("Registered agent for NPC %s (%s)", npc_id, npc_data.name)

    def register_dynamic_npc(self, npc_data: Any) -> None:
        """Register a dynamically generated NPC agent at runtime."""
        npc_id = npc_data.npc_id
        if npc_id in self._agents:
            return

        npc_config = {"name": npc_data.name, "personality": npc_data.personality}
        pending_actions: list[Any] = []
        world_snapshot: dict[str, Any] = {}
        tools = get_all_tools(pending_actions=pending_actions, world_state=world_snapshot)

        agent = create_npc_agent(
            npc_id=npc_id,
            npc_config=npc_config,
            llm=self._llm,
            tools=tools,
            shared_pending_actions=pending_actions,
            world_state=self._world_state,
        )
        self._agents[npc_id] = agent
        self._shared_state[npc_id] = {
            "pending_actions": pending_actions,
            "world_snapshot": world_snapshot,
        }
        logger.info("Dynamically registered agent for NPC %s (%s)", npc_id, npc_data.name)

    def refresh_agents(self) -> None:
        """Synchronize AI agents with the current world state population."""
        # 1. Remove agents for NPCs no longer in world state
        current_ids = set(self._agents.keys())
        manifest_ids = set(self._world_state.npcs.keys())
        for npc_id in current_ids - manifest_ids:
            logger.info("Removing agent for NPC %s", npc_id)
            del self._agents[npc_id]
            del self._shared_state[npc_id]

        # 2. Add agents for new NPCs
        for npc_id, npc_data in self._world_state.npcs.items():
            if npc_id in self._agents:
                # Update existing (if personality changed)
                self._shared_state[npc_id]["personality"] = npc_data.personality
                continue

            npc_config = {
                "name": npc_data.name,
                "personality": npc_data.personality,
            }

            pending_actions: list[Any] = []
            world_snapshot: dict[str, Any] = {}

            tools = get_all_tools(
                pending_actions=pending_actions,
                world_state=world_snapshot,
            )

            agent = create_npc_agent(
                npc_id=npc_id,
                npc_config=npc_config,
                llm=self._llm,
                tools=tools,
                shared_pending_actions=pending_actions,
                world_state=self._world_state,
            )
            self._agents[npc_id] = agent
            self._shared_state[npc_id] = {
                "pending_actions": pending_actions,
                "world_snapshot": world_snapshot,
            }
            logger.info("Registered agent for NPC %s (%s)", npc_id, npc_data.name)

    def _populate_world_snapshot(self, npc_id: str, player_id: str) -> None:
        """Fill the tool-closure world_snapshot dict with current data."""
        snapshot = self._shared_state[npc_id]["world_snapshot"]
        snapshot.clear()

        player = self._world_state.get_player(player_id)
        snapshot["player"] = player.to_dict()

        npc = self._world_state.get_npc(npc_id)
        snapshot["self_npc_id"] = npc_id
        snapshot["self_position"] = list(npc.position) if npc else [0, 0, 0]

        # Provide NPC data as dicts for the world_query tools
        npcs_dict: dict[str, dict[str, Any]] = {}
        for oid, odata in self._world_state.npcs.items():
            npcs_dict[oid] = {
                "name": odata.name,
                "hp": odata.hp,
                "position": list(odata.position),
                "mood": odata.mood,
            }
        snapshot["npcs"] = npcs_dict

    async def invoke(
        self,
        npc_id: str,
        player_id: str,
        prompt: str,
        player_state: dict[str, Any],
    ) -> dict[str, Any]:
        """Invoke the agent for a given NPC with the player's prompt."""
        agent = self._agents.get(npc_id)
        if agent is None:
            return {
                "dialogue": "That NPC does not exist in this world.",
                "actions": [],
                "playerStateUpdate": None,
                "npcStateUpdate": None,
            }

        npc_config = self._world_state.get_npc_config(npc_id)
        world_context = self._world_state.get_context_for_npc(npc_id, player_id)
        cache_key = hashlib.sha256(
            f"{npc_id}|{player_id}|{prompt}|{player_state.get('hp')}|{world_context.get('zone')}".encode()
        ).hexdigest()
        cached = self._response_cache.get(cache_key)
        if cached is not None:
            return cached

        # Populate the tool-closure snapshot before invocation
        self._populate_world_snapshot(npc_id, player_id)

        input_state = _build_input_state(
            npc_id=npc_id,
            npc_name=npc_config["name"],
            npc_personality=npc_config["personality"],
            prompt=prompt,
            player_state=player_state,
            world_context=world_context,
        )

        config = {"configurable": {"thread_id": f"{npc_id}_{player_id}"}}

        try:
            result = await agent.ainvoke(input_state, config=config)  # type: ignore[call-overload]
        except Exception:
            logger.exception("Agent invocation failed for NPC %s", npc_id)
            return {
                "dialogue": "The NPC seems lost in thought...",
                "actions": [],
                "playerStateUpdate": None,
                "npcStateUpdate": None,
            }

        # Apply any pending actions to the authoritative world state
        pending = result.get("pending_actions", [])
        if pending:
            await self._world_state.apply_actions(pending)

        # Build updated states to send back
        player = self._world_state.get_player(player_id)
        npc = self._world_state.get_npc(npc_id)

        npc_state_update: dict[str, Any] | None = None
        if npc:
            npc_state_update = {
                "hp": npc.hp,
                "maxHp": npc.max_hp,
                "mood": result.get("mood", "neutral"),
                "relationship_score": result.get("relationship_score", 0),
            }

        response_payload = {
            "dialogue": result.get("response_text", "..."),
            "actions": pending,
            "playerStateUpdate": player.to_dict() if player else None,
            "npcStateUpdate": npc_state_update,
        }
        if not pending:
            self._response_cache[cache_key] = response_payload
            if len(self._response_cache) > 512:
                self._response_cache.pop(next(iter(self._response_cache)), None)
        return response_payload
