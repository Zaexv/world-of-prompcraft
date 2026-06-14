"""Agent tools package.

Provides `get_all_tools()` which returns tool instances for NPC agents.
Tools use a closure pattern: they close over shared `pending_actions` and
`world_state` dicts so that tool invocations can accumulate side-effects.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import Callable

    from langchain_core.tools import BaseTool

from .combat import (
    create_defense_tools,
    create_offense_tools,
    create_support_tools,
)
from .dialogue import create_dialogue_tools
from .environment import create_environment_tools
from .music import create_music_tools
from .quest import create_quest_tools
from .trade import create_trade_tools
from .world_query import create_world_query_tools

_CATEGORY_FACTORIES: dict[str, Callable[..., list[Any]]] = {
    "offense": create_offense_tools,
    "defense": create_defense_tools,
    "support": create_support_tools,
    "dialogue": create_dialogue_tools,
    "environment": create_environment_tools,
    "music": create_music_tools,
    "quest": create_quest_tools,
    "trade": create_trade_tools,
    "world_query": create_world_query_tools,
}


def get_tools_by_category(
    category: str, pending_actions: list[Any], world_state: dict[str, Any]
) -> list[BaseTool]:
    """Instantiate and return tools for a specific category.

    Args:
        category: One of "offense", "defense", "support", "dialogue",
                  "environment", "music", "quest", "trade", "world_query".
        pending_actions: Shared mutable list for frontend actions.
        world_state: Shared mutable dict of current world state.

    Returns:
        A list of LangChain tool objects for the requested category.

    Raises:
        KeyError: If the category is not recognized.
    """
    if category not in _CATEGORY_FACTORIES:
        raise KeyError(
            f"Unknown tool category '{category}'. "
            f"Available: {', '.join(sorted(_CATEGORY_FACTORIES))}"
        )
    return _CATEGORY_FACTORIES[category](pending_actions, world_state)


def get_tools_for(
    categories: list[str],
    pending_actions: list[Any] | None = None,
    world_state: dict[str, Any] | None = None,
) -> list[BaseTool]:
    """Return tools for the given categories, closed over shared mutable state.

    This is the per-NPC seam: an archetype declares which tool categories it may
    call, and only those are bound to the agent. ``get_all_tools`` is the
    all-categories special case.

    Args:
        categories: Tool category keys (see ``_CATEGORY_FACTORIES``).
        pending_actions: Mutable list that tools append actions to.
        world_state: Mutable dict with current world/player snapshot.

    Returns:
        A flat list of tool objects for the requested categories.

    Raises:
        KeyError: If any category is not recognized.
    """
    if pending_actions is None:
        pending_actions = []
    if world_state is None:
        world_state = {}

    tools: list[BaseTool] = []
    for category in categories:
        tools.extend(get_tools_by_category(category, pending_actions, world_state))
    return tools


def get_all_tools(
    pending_actions: list[Any] | None = None,
    world_state: dict[str, Any] | None = None,
) -> list[BaseTool]:
    """Return all registered NPC tools, closed over shared mutable state.

    Args:
        pending_actions: Mutable list that tools append actions to.
        world_state: Mutable dict with current world/player snapshot.

    Returns:
        A flat list of all tool objects.
    """
    return get_tools_for(list(_CATEGORY_FACTORIES), pending_actions, world_state)
