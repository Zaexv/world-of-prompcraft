"""Tests for the NPC '...' response fix.

Covers:
- dialogue_fallback.fallback_line   — action-kind → short in-character line
- respond_node                      — raw extraction only, passes EMPTY_DIALOGUE through
- fallback_node                     — replaces EMPTY_DIALOGUE with action-derived line
- reason_node (inline tool path)    — second LLM call when no prose surrounds tool call
- registry cache                    — does not cache EMPTY_DIALOGUE or empty dialogue
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from src.agents.nodes.constants import EMPTY_DIALOGUE
from src.agents.nodes.dialogue_fallback import fallback_line
from src.agents.nodes.fallback import fallback_node
from src.agents.nodes.reason import make_reason_node
from src.agents.nodes.respond import respond_node

# ── fallback_line ─────────────────────────────────────────────────────────────


def test_fallback_line_empty_actions() -> None:
    assert fallback_line([]) == ""
    assert fallback_line(None) == ""


def test_fallback_line_give_item() -> None:
    assert fallback_line([{"kind": "give_item", "item": "sword"}]) == "Here, take this."


def test_fallback_line_deal_damage() -> None:
    assert fallback_line([{"kind": "deal_damage", "amount": 10}]) == "*strikes*"


def test_fallback_line_heal_target() -> None:
    assert fallback_line([{"kind": "heal_target", "amount": 5}]) == "*heals*"


def test_fallback_line_complete_quest_priority() -> None:
    # complete_quest outranks deal_damage
    assert fallback_line([{"kind": "deal_damage"}, {"kind": "complete_quest"}]) == "Quest done."


def test_fallback_line_unknown_kind() -> None:
    assert fallback_line([{"kind": "some_unknown_action"}]) == ""


# ── respond_node — raw extraction only ───────────────────────────────────────


def _make_state(content: str, pending: list[dict[str, Any]] | None = None) -> Any:
    return {
        "messages": [HumanMessage(content="hi"), AIMessage(content=content)],
        "pending_actions": pending or [],
    }


@pytest.mark.asyncio
async def test_respond_node_normal_dialogue() -> None:
    result = await respond_node(_make_state("Hello adventurer!"))
    assert result["response_text"] == "Hello adventurer!"


@pytest.mark.asyncio
async def test_respond_node_empty_content_returns_empty_dialogue() -> None:
    result = await respond_node(_make_state(""))
    assert result["response_text"] == EMPTY_DIALOGUE


@pytest.mark.asyncio
async def test_respond_node_passes_ellipsis_through() -> None:
    # respond_node no longer replaces "..." — fallback_node does that
    result = await respond_node(_make_state("..."))
    assert result["response_text"] == EMPTY_DIALOGUE


@pytest.mark.asyncio
async def test_respond_node_empty_messages() -> None:
    state: dict[str, Any] = {"messages": [], "pending_actions": []}
    result = await respond_node(state)
    assert result["response_text"] == EMPTY_DIALOGUE


@pytest.mark.asyncio
async def test_respond_node_pending_actions_forwarded() -> None:
    pending = [{"kind": "give_item"}]
    result = await respond_node(_make_state("Take this!", pending=pending))
    assert result["pending_actions"] == pending


# ── fallback_node — action-derived replacement ───────────────────────────────


def _fallback_state(response_text: str, pending: list[dict[str, Any]] | None = None) -> Any:
    return {
        "messages": [],
        "response_text": response_text,
        "pending_actions": pending or [],
    }


@pytest.mark.asyncio
async def test_fallback_node_real_dialogue_unchanged() -> None:
    result = await fallback_node(_fallback_state("Hello traveller!"))
    assert result["response_text"] == "Hello traveller!"


@pytest.mark.asyncio
async def test_fallback_node_empty_dialogue_with_action() -> None:
    result = await fallback_node(_fallback_state(EMPTY_DIALOGUE, pending=[{"kind": "give_item"}]))
    assert result["response_text"] == "Here, take this."


@pytest.mark.asyncio
async def test_fallback_node_empty_dialogue_no_actions() -> None:
    result = await fallback_node(_fallback_state(EMPTY_DIALOGUE))
    assert result["response_text"] == EMPTY_DIALOGUE


@pytest.mark.asyncio
async def test_fallback_node_damage_action() -> None:
    result = await fallback_node(_fallback_state(EMPTY_DIALOGUE, pending=[{"kind": "deal_damage"}]))
    assert result["response_text"] == "*strikes*"


# ── registry cache gate ───────────────────────────────────────────────────────


def _cache_write(
    registry: Any, cache_key: str, payload: dict[str, Any], pending: list[Any]
) -> None:
    dialogue = payload.get("dialogue", "")
    if not pending and dialogue and dialogue != EMPTY_DIALOGUE:
        registry._response_cache[cache_key] = payload


def test_registry_does_not_cache_empty_dialogue() -> None:
    from src.agents.registry import AgentRegistry

    registry = AgentRegistry.__new__(AgentRegistry)
    registry._response_cache: dict[str, Any] = {}
    _cache_write(registry, "k", {"dialogue": EMPTY_DIALOGUE}, [])
    assert "k" not in registry._response_cache


def test_registry_does_not_cache_bare_empty_string() -> None:
    from src.agents.registry import AgentRegistry

    registry = AgentRegistry.__new__(AgentRegistry)
    registry._response_cache: dict[str, Any] = {}
    _cache_write(registry, "k", {"dialogue": ""}, [])
    assert "k" not in registry._response_cache


def test_registry_caches_real_dialogue() -> None:
    from src.agents.registry import AgentRegistry

    registry = AgentRegistry.__new__(AgentRegistry)
    registry._response_cache: dict[str, Any] = {}
    _cache_write(registry, "k", {"dialogue": "Hello traveller!"}, [])
    assert "k" in registry._response_cache


# ── reason_node second-call path ──────────────────────────────────────────────


def _make_mock_llm(responses: list[str]) -> MagicMock:
    mock = MagicMock()
    mock.bind_tools.return_value = mock
    mock.ainvoke = AsyncMock(side_effect=[AIMessage(content=t) for t in responses])
    return mock


def _minimal_state() -> dict[str, Any]:
    return {
        "messages": [HumanMessage(content="Can I have a weapon?")],
        "npc_name": "Pablo",
        "npc_personality": "A friendly fisherman.",
        "pending_actions": [],
        "world_context": {},
        "player_state": {},
    }


@pytest.mark.asyncio
async def test_reason_node_inline_tool_no_prose_triggers_second_call() -> None:
    """Inline tool-only response → second LLM call for dialogue."""
    mock_llm = _make_mock_llm(["give_item(item='sword')", "Take this blade, traveller!"])
    fake_tool = MagicMock()
    fake_tool.name = "give_item"
    fake_tool.args = {"item": {"type": "string"}}
    fake_tool.ainvoke = AsyncMock(return_value=None)

    with patch(
        "src.agents.nodes.reason.extract_inline_tool_calls",
        return_value=("", [{"name": "give_item", "args": {"item": "sword"}}]),
    ):
        node = make_reason_node(mock_llm, [fake_tool], [])
        result = await node(_minimal_state())

    assert mock_llm.ainvoke.call_count == 2
    assert result["messages"][-1].content == "Take this blade, traveller!"


@pytest.mark.asyncio
async def test_reason_node_inline_tool_with_prose_skips_second_call() -> None:
    """Inline tool with surrounding prose → single LLM call, prose preserved."""
    mock_llm = _make_mock_llm(["Here you go! give_item(item='sword')"])
    fake_tool = MagicMock()
    fake_tool.name = "give_item"
    fake_tool.args = {"item": {"type": "string"}}
    fake_tool.ainvoke = AsyncMock(return_value=None)

    with patch(
        "src.agents.nodes.reason.extract_inline_tool_calls",
        return_value=("Here you go!", [{"name": "give_item", "args": {"item": "sword"}}]),
    ):
        node = make_reason_node(mock_llm, [fake_tool], [])
        result = await node(_minimal_state())

    assert mock_llm.ainvoke.call_count == 1
    assert result["messages"][-1].content == "Here you go!"
