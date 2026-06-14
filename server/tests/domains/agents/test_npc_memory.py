"""Phase 4: persistent NPC memory (relationship / summary / messages).

Proves two things our persistence relies on:
1. ``create_npc_agent`` / ``AgentRegistry`` thread an injected checkpointer into
   every compiled agent (instead of a throwaway ``MemorySaver``).
2. ``AsyncSqliteSaver`` keeps a thread's state across *separate* saver instances
   over the same DB file — i.e. memory survives a server restart.
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict

import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from src.agents.npc_agent import create_npc_agent
from src.agents.registry import AgentRegistry
from src.world.world_state import WorldState
from tests.llm_fixtures import MockChatModel


@pytest.fixture(autouse=True)
def _reset_world_state() -> Any:
    WorldState._instance = None
    yield
    WorldState._instance = None


def _make_agent(checkpointer: Any) -> Any:
    return create_npc_agent(
        npc_id="npc_test",
        npc_config={"name": "Test", "personality": "test"},
        llm=MockChatModel(),
        tools=[],
        shared_pending_actions=[],
        world_state=WorldState(),
        checkpointer=checkpointer,
    )


def test_create_npc_agent_uses_injected_checkpointer() -> None:
    saver = MemorySaver()
    agent = _make_agent(saver)
    assert agent.checkpointer is saver


def test_create_npc_agent_defaults_to_memorysaver() -> None:
    agent = _make_agent(None)
    assert isinstance(agent.checkpointer, MemorySaver)


def test_registry_threads_checkpointer_into_all_agents() -> None:
    saver = MemorySaver()
    registry = AgentRegistry(llm=MockChatModel(), world_state=WorldState(), checkpointer=saver)
    assert registry._agents  # manifest NPCs registered
    assert all(agent.checkpointer is saver for agent in registry._agents.values())


class _CounterState(TypedDict):
    count: Annotated[int, operator.add]


def _build_counter_graph(checkpointer: Any) -> Any:
    def _inc(_state: _CounterState) -> dict[str, int]:
        return {"count": 1}

    graph = StateGraph(_CounterState)
    graph.add_node("inc", _inc)
    graph.add_edge(START, "inc")
    graph.add_edge("inc", END)
    return graph.compile(checkpointer=checkpointer)


async def test_async_sqlite_saver_persists_across_instances(tmp_path: Any) -> None:
    """State accumulated under a thread_id survives reopening the saver — the
    exact guarantee that lets NPCs remember a player across a restart."""
    from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

    db = str(tmp_path / "memory.sqlite3")
    config = {"configurable": {"thread_id": "npc_test_zaex"}}

    async with AsyncSqliteSaver.from_conn_string(db) as saver:
        await saver.setup()
        app = _build_counter_graph(saver)
        await app.ainvoke({"count": 0}, config)
        await app.ainvoke({"count": 0}, config)

    # Fresh saver instance over the same file == a server restart.
    async with AsyncSqliteSaver.from_conn_string(db) as saver2:
        app2 = _build_counter_graph(saver2)
        state = await app2.aget_state(config)
        assert state.values["count"] == 2
