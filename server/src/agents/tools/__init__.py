"""Agent tools package.

Provides `get_all_tools()` which returns tool instances for NPC agents.
Tools use a closure pattern: they close over shared `pending_actions` and
`world_state` dicts so that tool invocations can accumulate side-effects.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool

from .combat import create_combat_tools
from .dialogue import create_dialogue_tools
from .environment import create_environment_tools
from .trade import create_trade_tools
from .world_query import create_world_query_tools

_CATEGORY_FACTORIES: dict[str, callable] = {
    "combat": create_combat_tools,
    "dialogue": create_dialogue_tools,
    "environment": create_environment_tools,
    "trade": create_trade_tools,
    "world_query": create_world_query_tools,
}


def get_tools_by_category(
    category: str, pending_actions: list, world_state: dict
) -> list[BaseTool]:
    """Instantiate and return tools for a specific category.

    Args:
        category: One of "combat", "dialogue", "environment", "trade",
                  "world_query".
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


def get_all_tools(
    pending_actions: list | None = None,
    world_state: dict | None = None,
) -> list[BaseTool]:
    """Return all registered NPC tools, closed over shared mutable state.

    Args:
        pending_actions: Mutable list that tools append actions to.
        world_state: Mutable dict with current world/player snapshot.

    Returns:
        A flat list of all tool objects.
    """
    if pending_actions is None:
        pending_actions = []
    if world_state is None:
        world_state = {}

    tools: list[BaseTool] = []
    tools.extend(create_combat_tools(pending_actions, world_state))
    tools.extend(create_dialogue_tools(pending_actions, world_state))
    tools.extend(create_trade_tools(pending_actions, world_state))
    tools.extend(create_environment_tools(pending_actions, world_state))
    tools.extend(create_world_query_tools(pending_actions, world_state))
    return tools
