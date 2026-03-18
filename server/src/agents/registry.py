from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import HumanMessage

from .npc_agent import create_npc_agent
from .tools import get_all_tools

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langgraph.graph.state import CompiledGraph

    from ..world.world_state import WorldState

logger = logging.getLogger(__name__)


class AgentRegistry:
    """Creates and manages one LangGraph agent per NPC."""

    def __init__(self, llm: BaseChatModel, world_state: WorldState) -> None:
        self._llm = llm
        self._world_state = world_state
        self._agents: dict[str, CompiledGraph] = {}
        # Each NPC gets its own shared pending_actions list and world_state snapshot dict
        # so that tool closures can write into them during invocation.
        self._shared_state: dict[str, dict[str, Any]] = {}
        self._build_agents()

    def _build_agents(self) -> None:
        """Create a compiled graph for every NPC registered in world state."""
        for npc_id, npc_data in self._world_state.npcs.items():
            npc_config = {
                "name": npc_data.name,
                "personality": npc_data.personality,
            }

            # Each NPC gets its own mutable containers for the tool closure
            pending_actions: list = []
            world_snapshot: dict = {}

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
        pending_actions: list = []
        world_snapshot: dict = {}
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
        npcs_dict: dict[str, dict] = {}
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
        player_state: dict,
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

        # Populate the tool-closure snapshot before invocation
        self._populate_world_snapshot(npc_id, player_id)

        input_state = {
            "messages": [HumanMessage(content=prompt)],
            "npc_id": npc_id,
            "npc_name": npc_config["name"],
            "npc_personality": npc_config["personality"],
            "player_state": player_state,
            "world_context": world_context,
            "pending_actions": [],
            "response_text": "",
        }

        config = {"configurable": {"thread_id": f"{npc_id}_{player_id}"}}

        try:
            result = await agent.ainvoke(input_state, config=config)
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

        return {
            "dialogue": result.get("response_text", "..."),
            "actions": pending,
            "playerStateUpdate": player.to_dict() if player else None,
            "npcStateUpdate": {"hp": npc.hp, "maxHp": npc.max_hp} if npc else None,
        }
