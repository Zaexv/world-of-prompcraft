"""Event-driven, abstract objective progress.

A single :func:`on_event` consumes typed game events and advances *any* matching
objective across *all* of a player's active quests. The mapping from objective
``kind`` to "did this event advance it, and by how much" lives in
:data:`OBJECTIVE_MATCHERS`. Adding a new objective kind is one matcher entry —
no edits to the handler, the model, or the client.

Event shape (a plain dict):
    {"type": "<event type>", "target"/"archetype"/"name"/"npc_id"/...: str}

Event types and the objective kinds they feed:
    enemy_killed   → kill
    item_collected → collect
    npc_talked     → talk
    zone_entered   → reach
    dungeon_entered→ enter_dungeon
"""

from __future__ import annotations

from collections.abc import Callable
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .player_state import PlayerData

# A matcher answers: how much progress (delta) does this event give this objective?
Matcher = Callable[[dict[str, Any], dict[str, Any]], int]

# Map objective kind → the event type that can advance it.
# A kind absent from this map (and from OBJECTIVE_MATCHERS) is manual-only: it is
# never auto-advanced by on_event and can only be completed via the explicit
# advance_quest_objective tool. See quests.MANUAL_OBJECTIVE_KIND ("confirm"),
# used for NPC-judged steps and return-to-giver steps that a plain `talk` would
# otherwise complete on the very turn the quest is accepted from that giver.
_KIND_EVENT: dict[str, str] = {
    "kill": "enemy_killed",
    "collect": "item_collected",
    "talk": "npc_talked",
    "reach": "zone_entered",
    "enter_dungeon": "dungeon_entered",
}

_KILL_ANY = {"", "any", "anyone", "enemy", "enemies", "creature", "creatures", "hostile"}


def _norm(value: Any) -> str:
    # Underscores and spaces are treated alike so a kill target "dire_wolf"
    # matches an enemy whose display name is "Dire Wolf".
    return str(value or "").strip().lower().replace("_", " ")


def _match_kill(objective: dict[str, Any], event: dict[str, Any]) -> int:
    """Kill objectives match by archetype, name, or 'any'."""
    target = _norm(objective.get("target"))
    if target in _KILL_ANY:
        return 1
    candidates = {
        _norm(event.get("target")),
        _norm(event.get("archetype")),
        _norm(event.get("name")),
    }
    return 1 if target in candidates else 0


def _match_exact_target(field: str) -> Matcher:
    """Build a matcher that compares the objective target to one event field."""

    def matcher(objective: dict[str, Any], event: dict[str, Any]) -> int:
        target = _norm(objective.get("target"))
        return 1 if target and target == _norm(event.get(field)) else 0

    return matcher


# kind → matcher. Extension point: register a new kind here.
OBJECTIVE_MATCHERS: dict[str, Matcher] = {
    "kill": _match_kill,
    "collect": _match_exact_target("target"),
    "talk": _match_exact_target("target"),
    "reach": _match_exact_target("target"),
    "enter_dungeon": _match_exact_target("target"),
}


def _advance_action(quest_id: str, obj: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "advance_objective",
        "params": {
            "questId": quest_id,
            "objectiveId": obj.get("id", ""),
            "description": obj.get("description", ""),
            "progress": obj.get("progress", 0),
            "required": obj.get("required", 1),
        },
    }


def on_event(player: PlayerData, event: dict[str, Any]) -> list[dict[str, Any]]:
    """Advance matching objectives for one event; auto-complete + pay finished quests.

    Mutates the player's quest dicts in place and returns client-facing actions
    (objective advances, quest completions, and reward banners). The player's
    authoritative gold/inventory are updated here too — the actions are for
    feedback; ``player.to_dict()`` remains the source of truth.
    """
    event_type = event.get("type", "")
    actions: list[dict[str, Any]] = []
    finished: list[str] = []

    for quest in player.active_quests:
        if quest.get("status", "active") not in ("active", ""):
            continue
        quest_id = quest.get("id", "")
        objectives = quest.get("objectives", [])
        touched = False
        for obj in objectives:
            if obj.get("completed"):
                continue
            kind = obj.get("kind") or obj.get("type", "")
            if _KIND_EVENT.get(kind) != event_type:
                continue
            matcher = OBJECTIVE_MATCHERS.get(kind)
            if matcher is None:
                continue
            delta = matcher(obj, event)
            if delta <= 0:
                continue
            required = int(obj.get("required", 1) or 1)
            obj["progress"] = min(required, int(obj.get("progress", 0)) + delta)
            if obj["progress"] >= required:
                obj["completed"] = True
            touched = True
            actions.append(_advance_action(quest_id, obj))

        if touched and objectives and all(o.get("completed") for o in objectives):
            finished.append(quest_id)

    # Complete + pay finished quests after iteration (complete_quest mutates the list).
    for quest_id in finished:
        actions.extend(complete_and_reward(player, quest_id))

    return actions


def complete_and_reward(player: PlayerData, quest_id: str) -> list[dict[str, Any]]:
    """Move a quest to completed, grant its reward, and return feedback actions."""
    reward = player.complete_quest(quest_id)
    actions: list[dict[str, Any]] = [{"kind": "complete_quest", "params": {"questId": quest_id}}]
    if reward is None:
        return actions
    if reward.gold:
        player.gold = max(0, player.gold + reward.gold)
        actions.append({"kind": "give_gold", "params": {"amount": reward.gold}})
    for item in reward.items:
        player.inventory.append(item)
        actions.append({"kind": "give_item", "params": {"item": item}})
    # xp is reserved (no leveling curve yet) — surface it for the banner only.
    if reward.xp:
        actions.append({"kind": "grant_xp", "params": {"amount": reward.xp}})
    return actions
