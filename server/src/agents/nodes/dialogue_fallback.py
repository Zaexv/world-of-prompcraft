from __future__ import annotations

from typing import Any

_ACTION_LINES: list[tuple[str, str]] = [
    ("complete_quest", "Quest done."),
    ("start_quest", "New quest begins."),
    ("give_item", "Here, take this."),
    ("take_item", "I'll take that."),
    ("deal_damage", "*strikes*"),
    ("heal_target", "*heals*"),
    ("apply_status", "*casts*"),
    ("move_to", "*moves*"),
    ("emote", "*nods*"),
]


def fallback_line(pending_actions: list[dict[str, Any]] | None) -> str:
    """Return short in-character line for most salient pending action.

    Returns '' when no actions — caller decides the final fallback.
    """
    if not pending_actions:
        return ""
    kinds = {a.get("kind", "") for a in pending_actions}
    for kind, line in _ACTION_LINES:
        if kind in kinds:
            return line
    return ""
