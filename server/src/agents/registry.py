from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from langchain_core.messages import HumanMessage

from ..llm.errors import LLMProviderUnavailableError
from .action_sink import PendingActionSink
from .npc_agent import create_npc_agent
from .tools import get_all_tools

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langgraph.graph.state import CompiledStateGraph as CompiledGraph

    from ..world.world_state import WorldState

logger = logging.getLogger(__name__)
_ATTACK_PATTERNS = re.compile(r"\b(attack|die|kill|fight|hit|strike)\b", re.IGNORECASE)
_TRADE_PATTERNS = re.compile(r"\b(trade|buy|sell|shop|store|goods)\b", re.IGNORECASE)
_DEFEND_PATTERNS = re.compile(r"\b(defend|block|parry|dodge|brace|guard)\b", re.IGNORECASE)
_FLEE_PATTERNS = re.compile(r"\b(flee|run|retreat|escape)\b", re.IGNORECASE)
_DIRECT_COMMAND_PREFIXES = (
    "attack",
    "hit",
    "strike",
    "kill",
    "fight",
    "trade",
    "buy",
    "sell",
    "shop",
    "defend",
    "block",
    "parry",
    "dodge",
    "brace",
    "guard",
    "flee",
    "run",
    "retreat",
    "escape",
)


class AgentRegistry:
    """Creates and manages one LangGraph agent per NPC."""

    def __init__(self, llm: BaseChatModel, world_state: WorldState) -> None:
        self._llm = llm
        self._world_state = world_state
        self._agents: dict[str, CompiledGraph] = {}  # type: ignore[type-arg]
        # Each NPC gets its own action sink and world_state snapshot dict
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
            pending_actions = PendingActionSink()
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
                pending_action_sink=pending_actions,
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
        pending_actions = PendingActionSink()
        world_snapshot: dict[str, Any] = {}
        tools = get_all_tools(pending_actions=pending_actions, world_state=world_snapshot)

        agent = create_npc_agent(
            npc_id=npc_id,
            npc_config=npc_config,
            llm=self._llm,
            tools=tools,
            pending_action_sink=pending_actions,
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

            pending_actions = PendingActionSink()
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
                pending_action_sink=pending_actions,
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

    @staticmethod
    def _normalize_prompt(prompt: str) -> str:
        return " ".join(prompt.lower().split())

    @staticmethod
    def _is_direct_command(prompt_lower: str) -> bool:
        if not prompt_lower:
            return False
        if len(prompt_lower.split()) <= 12:
            return True
        prefixed = _DIRECT_COMMAND_PREFIXES + tuple(
            f"i {prefix}" for prefix in _DIRECT_COMMAND_PREFIXES
        )
        return prompt_lower.startswith(prefixed)

    def _bind_action_context(
        self, actions: list[dict[str, Any]], player_id: str, npc_id: str
    ) -> list[dict[str, Any]]:
        """Attach missing player/npc identifiers so world-state mutations apply correctly."""
        bound: list[dict[str, Any]] = []
        for action in actions:
            params = dict(action.get("params", {}))
            kind = action.get("kind", "")
            target = str(params.get("target", ""))

            if kind in {"give_item", "take_item", "remove_item", "start_quest", "complete_quest"}:
                params.setdefault("player_id", player_id)
            if kind in {"damage_player", "heal_player"}:
                params.setdefault("player_id", player_id)
            if kind in {"damage", "heal"} and (not target or target == "player"):
                params.setdefault("target", "player")
                params.setdefault("player_id", player_id)
            if kind in {"update_npc_mood", "damage_npc", "move_npc"}:
                params.setdefault("npc_id", npc_id)

            bound.append({"kind": kind, "params": params})
        return bound

    def _deterministic_command_response(
        self,
        prompt: str,
        player_id: str,
        npc_id: str,
    ) -> dict[str, Any] | None:
        """O(1) deterministic branch for direct commands (combat/trade/control)."""
        text = self._normalize_prompt(prompt)
        if not self._is_direct_command(text):
            return None

        if _ATTACK_PATTERNS.search(text):
            actions = self._bind_action_context(
                [
                    {
                        "kind": "damage",
                        "params": {"target": "player", "amount": 15, "damageType": "physical"},
                    },
                    {"kind": "update_npc_mood", "params": {"mood": "angry"}},
                ],
                player_id,
                npc_id,
            )
            return {
                "dialogue": "I strike back immediately.",
                "actions": actions,
                "mood": "angry",
                "relationship_score": -15,
            }

        if _TRADE_PATTERNS.search(text):
            actions = self._bind_action_context(
                [
                    {"kind": "give_item", "params": {"item": "Health Potion"}},
                    {"kind": "update_npc_mood", "params": {"mood": "neutral"}},
                ],
                player_id,
                npc_id,
            )
            return {
                "dialogue": "Here, take this potion.",
                "actions": actions,
                "mood": "neutral",
                "relationship_score": 3,
            }

        if _DEFEND_PATTERNS.search(text):
            actions = self._bind_action_context(
                [
                    {"kind": "emote", "params": {"animation": "defend"}},
                    {"kind": "update_npc_mood", "params": {"mood": "focused"}},
                ],
                player_id,
                npc_id,
            )
            return {
                "dialogue": "I hold my guard.",
                "actions": actions,
                "mood": "focused",
                "relationship_score": -2,
            }

        if _FLEE_PATTERNS.search(text):
            npc = self._world_state.get_npc(npc_id)
            start = list(npc.position) if npc else [0.0, 0.0, 0.0]
            actions = self._bind_action_context(
                [
                    {
                        "kind": "move_npc",
                        "params": {
                            "position": [float(start[0]), float(start[1]), float(start[2]) + 20.0],
                        },
                    },
                    {"kind": "update_npc_mood", "params": {"mood": "afraid"}},
                ],
                player_id,
                npc_id,
            )
            return {
                "dialogue": "I am retreating!",
                "actions": actions,
                "mood": "afraid",
                "relationship_score": -8,
            }

        return None

    async def _deterministic_command_result(
        self,
        prompt: str,
        player_id: str,
        npc_id: str,
    ) -> dict[str, Any] | None:
        deterministic = self._deterministic_command_response(prompt, player_id, npc_id)
        if deterministic is None:
            return None

        actions = deterministic["actions"]
        if actions:
            await self._world_state.apply_actions(actions)

        player = self._world_state.get_player(player_id)
        npc = self._world_state.get_npc(npc_id)
        npc_state_update: dict[str, Any] | None = None
        if npc:
            npc_state_update = {
                "hp": npc.hp,
                "maxHp": npc.max_hp,
                "mood": deterministic["mood"],
                "relationship_score": deterministic["relationship_score"],
            }

        return {
            "dialogue": deterministic["dialogue"],
            "actions": actions,
            "playerStateUpdate": player.to_dict() if player else None,
            "npcStateUpdate": npc_state_update,
        }

    def _fallback_response(self, prompt: str, player_id: str, npc_id: str) -> dict[str, Any]:
        """Deterministic fallback used when the LLM provider is unavailable."""
        text = prompt.lower()
        if _ATTACK_PATTERNS.search(text):
            actions = self._bind_action_context(
                [{"kind": "damage", "params": {"target": "player", "amount": 12}}],
                player_id,
                npc_id,
            )
            return {"dialogue": "Stand back, or you will get hurt.", "actions": actions}
        if _TRADE_PATTERNS.search(text):
            actions = self._bind_action_context(
                [{"kind": "give_item", "params": {"item": "Health Potion"}}],
                player_id,
                npc_id,
            )
            return {"dialogue": "I can trade. Take this potion to start.", "actions": actions}
        return {
            "dialogue": "The winds are strange today. Speak again in a moment.",
            "actions": [],
        }

    async def _fallback_result(self, prompt: str, player_id: str, npc_id: str) -> dict[str, Any]:
        fallback = self._fallback_response(prompt, player_id, npc_id)
        if fallback["actions"]:
            await self._world_state.apply_actions(fallback["actions"])
        player = self._world_state.get_player(player_id)
        npc = self._world_state.get_npc(npc_id)
        npc_state_update: dict[str, Any] | None = None
        if npc:
            npc_state_update = {
                "hp": npc.hp,
                "maxHp": npc.max_hp,
                "mood": npc.mood,
                "relationship_score": 0,
            }
        return {
            "dialogue": fallback["dialogue"],
            "actions": fallback["actions"],
            "playerStateUpdate": player.to_dict() if player else None,
            "npcStateUpdate": npc_state_update,
        }

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

        deterministic = await self._deterministic_command_result(prompt, player_id, npc_id)
        if deterministic is not None:
            return deterministic

        npc_config = self._world_state.get_npc_config(npc_id)
        world_context = self._world_state.get_context_for_npc(npc_id, player_id)

        # Populate the tool-closure snapshot before invocation
        self._populate_world_snapshot(npc_id, player_id)

        npc_data = self._world_state.get_npc(npc_id)
        rel_score = npc_data.relationship_scores.get(player_id, 0) if npc_data else 0
        pers_notes = npc_data.personality_notes.get(player_id, "") if npc_data else ""
        conv_summary = npc_data.conversation_summaries.get(player_id, "") if npc_data else ""
        episodic = self._world_state._store.load_episodic_memories(player_id, npc_id)

        input_state = {
            "messages": [HumanMessage(content=prompt)],
            "npc_id": npc_id,
            "npc_name": npc_config["name"],
            "npc_personality": npc_config["personality"],
            "player_state": player_state,
            "world_context": world_context,
            "pending_actions": [],
            "response_text": "",
            # Enrichment fields — defaults here, persisted values loaded from checkpoint
            "conversation_summary": conv_summary,
            "mood": npc_data.mood if npc_data else "neutral",
            "relationship_score": rel_score,
            "personality_notes": pers_notes,
            "episodic_memories": episodic,
            "fast_intent": "",
        }

        config = {"configurable": {"thread_id": f"{npc_id}_{player_id}"}}

        try:
            result = await agent.ainvoke(input_state, config=config)  # type: ignore[call-overload]
        except LLMProviderUnavailableError:
            logger.warning("LLM provider unavailable for NPC %s; using fallback response", npc_id)
            return await self._fallback_result(prompt, player_id, npc_id)
        except Exception:
            logger.exception("Agent invocation failed for NPC %s", npc_id)
            return await self._fallback_result(prompt, player_id, npc_id)

        # Update persistent state in WorldState memory
        if npc_data:
            npc_data.mood = result.get("mood", "neutral")
            npc_data.relationship_scores[player_id] = result.get("relationship_score", 0)
            npc_data.personality_notes[player_id] = result.get("personality_notes", "")
            npc_data.conversation_summaries[player_id] = result.get("conversation_summary", "")

            # Save new episodic memories to DB
            new_episodic = result.get("episodic_memories", [])
            for mem in new_episodic:
                if mem not in episodic:
                    self._world_state._store.add_episodic_memory(player_id, npc_id, mem)

            # Persist social state to DB
            self._world_state._store.upsert_npc_social_record(
                player_id,
                npc_id,
                {
                    "relationship_score": npc_data.relationship_scores[player_id],
                    "personality_notes": npc_data.personality_notes[player_id],
                    "conversation_summary": npc_data.conversation_summaries[player_id],
                },
            )

        # Apply any pending actions to the authoritative world state
        pending = self._bind_action_context(
            list(result.get("pending_actions", [])),
            player_id,
            npc_id,
        )
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

        return {
            "dialogue": result.get("response_text") or "...",
            "actions": pending,
            "playerStateUpdate": player.to_dict() if player else None,
            "npcStateUpdate": npc_state_update,
        }
