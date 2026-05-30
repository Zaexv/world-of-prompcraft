import logging
from typing import Any, Protocol, runtime_checkable

from langchain_core.messages import HumanMessage, SystemMessage

from ..agent_state import NPCAgentState

logger = logging.getLogger(__name__)


@runtime_checkable
class ChatModel(Protocol):
    async def ainvoke(self, messages: list[Any]) -> Any: ...


def make_episodic_memory_node(llm: ChatModel) -> Any:
    async def episodic_memory_node(state: NPCAgentState) -> dict[str, Any]:
        """
        Extracts key episodic facts from the last turn and adds them to the state.
        These will be persisted by the registry/world_state after invocation.
        """
        fast_intent = (state.get("fast_intent") or "").lower()
        if fast_intent in {"social", "ooc", "attack", "trade"}:
            return {}

        messages = state.get("messages", [])
        if len(messages) < 2:
            return {}

        # Last exchange
        last_human = messages[-2].content if hasattr(messages[-2], "content") else str(messages[-2])
        last_ai = messages[-1].content if hasattr(messages[-1], "content") else str(messages[-1])

        prompt = (
            f"Extract 1-2 discrete, important facts about the player from this exchange.\n"
            f"Player: {last_human}\n"
            f"NPC: {last_ai}\n\n"
            "Format: One fact per line. If no new facts, respond with 'NONE'."
        )

        try:
            # We use a smaller, faster model if possible, or just the main LLM
            response = await llm.ainvoke(
                [SystemMessage(content="You are a memory extractor."), HumanMessage(content=prompt)]
            )
            content = response.content.strip()

            if content == "NONE":
                return {}

            new_memories = [line.strip("- ") for line in content.split("\n") if line.strip()]

            # Combine with existing (they will be saved later)
            current_memories = state.get("episodic_memories", [])
            updated_memories = list(set(current_memories + new_memories))[-10:]  # Keep last 10

            return {"episodic_memories": updated_memories}
        except Exception as e:
            logger.error(f"Failed to extract episodic memory: {e}")
            return {}

    return episodic_memory_node
