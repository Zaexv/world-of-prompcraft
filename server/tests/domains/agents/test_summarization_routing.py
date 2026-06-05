"""Tests for bounded agent memory summarization."""

from __future__ import annotations

from typing import Any

import pytest
from langchain_core.messages import AIMessage, HumanMessage, RemoveMessage

from src.agents.nodes.reason import make_reason_node
from src.agents.nodes.summarize import (
    _KEEP_RECENT_MESSAGES,
    make_summarize_node,
    route_after_reflect,
)
from src.agents.registry import _build_input_state


def _build_messages(turns: int) -> list[object]:
    messages: list[object] = []
    for turn in range(turns):
        messages.append(HumanMessage(content=f"Player turn {turn} with enough detail to matter."))
        messages.append(AIMessage(content=f"NPC reply {turn}."))
    return messages


class _RecorderModel:
    def __init__(self, response_text: str) -> None:
        self.response_text = response_text
        self.last_messages: list[Any] = []
        self.bound_tools: list[Any] = []

    def bind_tools(self, tools: list[Any] | None = None, **kwargs: Any) -> _RecorderModel:
        self.bound_tools = list(tools or [])
        return self

    async def ainvoke(self, messages: list[Any], **kwargs: Any) -> AIMessage:
        self.last_messages = messages
        return AIMessage(content=self.response_text)


def test_route_after_reflect_triggers_on_interval() -> None:
    state = {"messages": _build_messages(12)}

    assert route_after_reflect(state) == "summarize"


def test_route_after_reflect_skips_non_interval_turns() -> None:
    state = {"messages": _build_messages(11)}

    assert route_after_reflect(state) == "end"


def test_build_input_state_keeps_persistent_memory_out() -> None:
    state = _build_input_state(
        npc_id="npc-1",
        npc_name="Aster",
        npc_personality="Cautious archivist",
        prompt="Hello again.",
        player_state={"hp": 100},
        world_context={"zone": "Library"},
    )

    assert "conversation_summary" not in state
    assert "mood" not in state
    assert "relationship_score" not in state
    assert "personality_notes" not in state
    assert state["messages"][0].content == "Hello again."


@pytest.mark.asyncio
async def test_reason_node_uses_bounded_history() -> None:
    model = _RecorderModel("OpenAI mock response: Explain the old legends of this place.")
    reason_node = make_reason_node(model, [], [])
    state = {
        "messages": [
            *_build_messages(10),
            HumanMessage(content="Explain the old legends of this place."),
        ],
        "npc_name": "Aster",
        "npc_personality": "You are a cautious archivist.",
        "player_state": {"hp": 100, "inventory": []},
        "world_context": {"zone": "Library", "time_of_day": "night", "weather": "clear"},
        "pending_actions": [],
        "response_text": "",
        "conversation_summary": "We already discussed the missing key and the hidden archive.",
        "mood": "neutral",
        "relationship_score": 0,
        "personality_notes": "",
    }

    await reason_node(state)  # type: ignore[arg-type]

    assert model.last_messages
    assert len(model.last_messages) == 9
    assert "We already discussed the missing key" in model.last_messages[0].content
    assert "Player turn 0" not in model.last_messages[0].content


@pytest.mark.asyncio
async def test_summarize_node_uses_recent_window() -> None:
    model = _RecorderModel("Updated summary")
    summarize_node = make_summarize_node(model)
    state = {
        "messages": [
            *_build_messages(10),
            HumanMessage(content="And the final clue is in the tower."),
        ],
        "npc_name": "Aster",
        "conversation_summary": "The player is looking for a tower key.",
    }

    result = await summarize_node(state)  # type: ignore[arg-type]

    assert result["conversation_summary"] == "Updated summary"
    assert model.last_messages
    prompt = model.last_messages[0].content
    assert "The player is looking for a tower key." in prompt
    assert "And the final clue is in the tower." in prompt
    assert "Player turn 0" not in prompt


def _build_identified_messages(turns: int) -> list[object]:
    """Conversation history where every message carries a stable id (prunable)."""
    messages: list[object] = []
    for turn in range(turns):
        messages.append(HumanMessage(content=f"Player turn {turn}.", id=f"h{turn}"))
        messages.append(AIMessage(content=f"NPC reply {turn}.", id=f"a{turn}"))
    return messages


@pytest.mark.asyncio
async def test_summarize_node_prunes_to_recent_tail() -> None:
    model = _RecorderModel("Updated summary")
    summarize_node = make_summarize_node(model)
    messages = _build_identified_messages(10)  # 20 messages, all with ids
    state = {"messages": messages, "npc_name": "Aster", "conversation_summary": ""}

    result = await summarize_node(state)  # type: ignore[arg-type]

    removals = result["messages"]
    assert all(isinstance(m, RemoveMessage) for m in removals)
    # 20 total, keep the last _KEEP_RECENT_MESSAGES → the rest are removed.
    assert len(removals) == len(messages) - _KEEP_RECENT_MESSAGES
    removed_ids = {m.id for m in removals}
    kept_ids = {getattr(m, "id", None) for m in messages[-_KEEP_RECENT_MESSAGES:]}
    assert removed_ids.isdisjoint(kept_ids)


@pytest.mark.asyncio
async def test_summarize_node_no_prune_when_history_short() -> None:
    model = _RecorderModel("Updated summary")
    summarize_node = make_summarize_node(model)
    state = {
        "messages": _build_identified_messages(2),  # 4 messages ≤ keep threshold
        "npc_name": "Aster",
        "conversation_summary": "",
    }

    result = await summarize_node(state)  # type: ignore[arg-type]

    assert "messages" not in result  # nothing pruned
    assert result["conversation_summary"] == "Updated summary"


@pytest.mark.asyncio
async def test_summarize_node_skips_messages_without_ids() -> None:
    model = _RecorderModel("Updated summary")
    summarize_node = make_summarize_node(model)
    state = {
        "messages": _build_messages(10),  # no ids → not prunable
        "npc_name": "Aster",
        "conversation_summary": "",
    }

    result = await summarize_node(state)  # type: ignore[arg-type]

    assert "messages" not in result
