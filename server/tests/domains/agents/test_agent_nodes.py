from __future__ import annotations

import asyncio
from typing import Any

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool

from src.agents.action_sink import PendingActionSink
from src.agents.nodes.act import make_act_node
from src.agents.nodes.pre_check import make_pre_check_node
from src.agents.nodes.reflect import ReflectionOutput, make_reflect_node
from src.agents.nodes.summarize import _should_summarize
from src.agents.npc_agent import _route_from_act, _route_from_pre_check


class _StructuredReflectLLM:
    def __init__(self) -> None:
        self.calls = 0

    async def ainvoke(self, payload: Any) -> ReflectionOutput:
        self.calls += 1
        return ReflectionOutput(
            mood="Curious",
            relationship_delta=4,
            new_episodic_memories=["The player asked for help."],
            new_goal="Keep guiding the player through the village.",
        )


class _ReflectLLM:
    def __init__(self, structured_llm: _StructuredReflectLLM) -> None:
        self._structured_llm = structured_llm

    def with_structured_output(self, schema: type[ReflectionOutput]) -> _StructuredReflectLLM:
        assert schema is ReflectionOutput
        return self._structured_llm


def _state_with_messages(messages: list[Any]) -> dict[str, Any]:
    return {
        "messages": messages,
        "npc_name": "Guard",
        "mood": "neutral",
        "relationship_score": 0,
        "current_goal": "Keep the village safe.",
        "pending_actions": [],
        "fast_intent": "",
    }


@pytest.mark.asyncio
async def test_pre_check_routes_short_social_messages_to_fast_reply(mock_llm_openai) -> None:
    node = make_pre_check_node(mock_llm_openai)
    result = await node({"messages": [HumanMessage(content="hello")]})

    assert result["fast_intent"] == "social"
    assert len(result["messages"]) == 1
    assert getattr(result["messages"][0], "type", "") == "ai"
    assert (
        _route_from_pre_check({"messages": result["messages"], "fast_intent": "social"})
        == "respond"
    )


@pytest.mark.asyncio
async def test_pre_check_routes_direct_attack_commands_even_when_longer(mock_llm_openai) -> None:
    node = make_pre_check_node(mock_llm_openai)
    prompt = "I attack you now and challenge you to a direct fight right away."
    result = await node({"messages": [HumanMessage(content=prompt)]})

    assert result["fast_intent"] == "attack"
    assert _route_from_pre_check({"messages": result["messages"], "fast_intent": "attack"}) == "act"


def test_route_from_pre_check_uses_fast_intent_instead_of_message_id() -> None:
    state = {
        "messages": [AIMessage(content="Blocked", id="ooc_reject_abc123")],
        "fast_intent": "ooc",
    }
    assert _route_from_pre_check(state) == "respond"


@pytest.mark.asyncio
async def test_reflect_node_skips_llm_when_below_interval(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.config import settings

    monkeypatch.setattr(settings, "reflect_every_n_turns", 3)
    structured_llm = _StructuredReflectLLM()
    node = make_reflect_node(_ReflectLLM(structured_llm))

    state = _state_with_messages(
        [HumanMessage(content="Hi there"), AIMessage(content="Greetings.")]
    )
    result = await node(state)

    assert result == {}
    assert structured_llm.calls == 0


@pytest.mark.asyncio
async def test_reflect_node_runs_llm_on_interval(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.config import settings

    monkeypatch.setattr(settings, "reflect_every_n_turns", 3)
    structured_llm = _StructuredReflectLLM()
    node = make_reflect_node(_ReflectLLM(structured_llm))

    messages = [
        HumanMessage(content="Hi."),
        AIMessage(content="Hello."),
        HumanMessage(content="Can you help me?"),
        AIMessage(content="Maybe."),
        HumanMessage(content="Please?"),
        AIMessage(content="Let me think."),
    ]
    result = await node(_state_with_messages(messages))

    assert structured_llm.calls == 1
    assert result["mood"] == "curious"
    assert result["relationship_score"] == 4
    assert result["episodic_memories"] == ["The player asked for help."]


@pytest.mark.asyncio
async def test_reflect_node_handles_social_fast_intent_without_llm() -> None:
    structured_llm = _StructuredReflectLLM()
    node = make_reflect_node(_ReflectLLM(structured_llm))

    state = _state_with_messages([HumanMessage(content="thanks")])
    state["fast_intent"] = "social"
    state["relationship_score"] = 7
    result = await node(state)

    assert structured_llm.calls == 0
    assert result["relationship_score"] == 8
    assert result["mood"] == "neutral"


def test_should_summarize_uses_new_turn_cadence(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.config import settings

    monkeypatch.setattr(settings, "summarize_threshold_turns", 12)
    monkeypatch.setattr(settings, "summarize_every_n_turns", 6)

    twelve_humans = {"messages": [{"role": "human", "content": "x"} for _ in range(12)]}
    thirteen_humans = {"messages": [{"role": "human", "content": "x"} for _ in range(13)]}

    assert _should_summarize(twelve_humans) == "summarize"
    assert _should_summarize(thirteen_humans) == "end"


def test_should_summarize_skips_fast_attack_intents() -> None:
    state = {
        "fast_intent": "attack",
        "messages": [{"role": "human", "content": "x"} for _ in range(60)],
    }
    assert _should_summarize(state) == "end"


def test_pending_action_sink_requires_active_capture() -> None:
    sink = PendingActionSink()
    with pytest.raises(RuntimeError, match="No active action capture context"):
        sink.append({"kind": "give_item", "params": {"item": "Potion"}})


@pytest.mark.asyncio
async def test_pending_action_sink_isolates_concurrent_captures() -> None:
    sink = PendingActionSink()

    async def _capture(capture_id: str, item_name: str, delay_s: float) -> list[dict[str, Any]]:
        token = sink.start_capture(capture_id)
        try:
            await asyncio.sleep(delay_s)
            sink.append({"kind": "give_item", "params": {"item": item_name}})
            await asyncio.sleep(0)
        finally:
            sink.end_capture(token)
        return sink.drain(capture_id)

    first, second = await asyncio.gather(
        _capture("capture-a", "A", 0.01),
        _capture("capture-b", "B", 0.0),
    )

    assert first == [{"kind": "give_item", "params": {"item": "A"}}]
    assert second == [{"kind": "give_item", "params": {"item": "B"}}]


@pytest.mark.asyncio
async def test_act_node_keeps_pending_actions_isolated_per_invocation() -> None:
    sink = PendingActionSink()

    @tool
    async def queue_item(item_name: str, delay_ms: int = 0) -> str:
        """Queue one item action for the current interaction context."""
        await asyncio.sleep(delay_ms / 1000)
        sink.append({"kind": "give_item", "params": {"item": item_name}})
        return f"queued {item_name}"

    act_node = make_act_node([queue_item], sink)

    async def _invoke(item_name: str, delay_ms: int) -> dict[str, Any]:
        state = {
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "queue_item",
                            "args": {"item_name": item_name, "delay_ms": delay_ms},
                            "id": f"{item_name}-call",
                        }
                    ],
                )
            ],
            "pending_actions": [],
        }
        return await act_node(state)

    first, second = await asyncio.gather(
        _invoke("Elixir", 15),
        _invoke("Key", 0),
    )

    assert first["pending_actions"] == [{"kind": "give_item", "params": {"item": "Elixir"}}]
    assert second["pending_actions"] == [{"kind": "give_item", "params": {"item": "Key"}}]


@pytest.mark.asyncio
async def test_act_node_infers_fast_intent_for_deterministic_damage_tool() -> None:
    sink = PendingActionSink()

    @tool
    async def deal_damage(
        target: str,
        amount: int,
        damage_type: str = "physical",
    ) -> str:
        """Apply deterministic damage."""
        sink.append(
            {
                "kind": "deal_damage",
                "target": target,
                "amount": amount,
                "damage_type": damage_type,
            }
        )
        return "ok"

    act_node = make_act_node([deal_damage], sink)
    result = await act_node(
        {
            "messages": [
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "deal_damage",
                            "args": {"target": "player", "amount": 15, "damage_type": "physical"},
                            "id": "tool_damage_1",
                        }
                    ],
                )
            ],
            "pending_actions": [],
            "fast_intent": "",
        }
    )

    assert result["fast_intent"] == "attack"
    assert result["response_text"] == "I strike back immediately."
    assert result["last_tool_names"] == ["deal_damage"]


def test_route_from_act_skips_second_reason_for_deterministic_tools() -> None:
    state = {
        "messages": [ToolMessage(content="ok", tool_call_id="tool_damage_1")],
        "last_tool_names": ["deal_damage"],
    }
    assert _route_from_act(state) == "respond"
