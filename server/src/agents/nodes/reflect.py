from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..agent_state import NPCAgentState

# ── Keyword sets for heuristic analysis ──────────────────────────────────────

_HOSTILE_WORDS = frozenset({
    "attack", "kill", "destroy", "fight", "hit", "strike", "slash", "stab",
    "punch", "kick", "murder", "slay", "crush", "smash", "die", "burn",
    "hate", "loathe", "despise",
})

_INSULT_WORDS = frozenset({
    "stupid", "idiot", "fool", "dumb", "ugly", "worthless", "pathetic",
    "weak", "coward", "trash", "scum", "useless", "insult", "mock",
    "humiliate", "taunt", "loser", "moron",
})

_FRIENDLY_WORDS = frozenset({
    "hello", "hi", "hey", "friend", "thanks", "thank", "please", "help",
    "love", "appreciate", "kind", "wonderful", "great", "amazing", "sorry",
    "forgive", "gift", "trade", "buy", "offer", "share", "teach", "learn",
})

_HAPPY_TRIGGERS = frozenset({
    "compliment", "praise", "joke", "laugh", "dance", "celebrate",
    "cheer", "hug", "smile", "happy", "wonderful", "beautiful",
})

_SAD_TRIGGERS = frozenset({
    "sad", "cry", "mourn", "lost", "death", "dead", "miss", "grieve",
    "sorry", "farewell", "goodbye", "alone", "lonely",
})

_FEAR_TRIGGERS = frozenset({
    "threat", "threaten", "scare", "fear", "terrify", "warn", "danger",
    "flee", "run", "escape",
})


def _tokenize(text: str) -> set[str]:
    """Extract lowercase alphanumeric tokens from text."""
    return set(re.findall(r"[a-z]+", text.lower()))


def _analyze_mood(tokens: set[str], current_mood: str) -> str:
    """Determine new mood based on conversation tokens and current mood."""
    hostile_count = len(tokens & _HOSTILE_WORDS) + len(tokens & _INSULT_WORDS)
    friendly_count = len(tokens & _FRIENDLY_WORDS) + len(tokens & _HAPPY_TRIGGERS)
    sad_count = len(tokens & _SAD_TRIGGERS)
    fear_count = len(tokens & _FEAR_TRIGGERS)

    if hostile_count >= 3:
        return "angry"
    if fear_count >= 2:
        return "fearful"
    if sad_count >= 2:
        return "sad"
    if friendly_count >= 3:
        return "happy"
    if hostile_count >= 1 and friendly_count == 0:
        return "angry" if current_mood == "angry" else "annoyed"
    if friendly_count >= 1 and hostile_count == 0:
        return "happy" if current_mood == "happy" else "pleased"

    # Mood decay toward neutral
    if current_mood in ("angry", "annoyed"):
        return "annoyed" if current_mood == "angry" else "neutral"
    if current_mood in ("happy", "pleased"):
        return "pleased" if current_mood == "happy" else "neutral"
    return current_mood if current_mood else "neutral"


def _compute_relationship_delta(tokens: set[str], actions: list[dict]) -> int:
    """Compute relationship score change from conversation + actions."""
    delta = 0

    # Action-based scoring
    for action in actions:
        kind = action.get("kind", "")
        if kind == "damage":
            target = action.get("params", {}).get("target", "")
            if target == "player":
                delta -= 5  # NPC attacked player (provoked)
            else:
                delta -= 10  # Player attacked NPC
        elif kind == "heal":
            delta += 8
        elif kind in ("give_item", "offer_item"):
            delta += 5
        elif kind == "start_quest":
            delta += 3
        elif kind == "complete_quest":
            delta += 10

    # Word-based scoring
    hostile_hits = len(tokens & _HOSTILE_WORDS) + len(tokens & _INSULT_WORDS)
    friendly_hits = len(tokens & _FRIENDLY_WORDS) + len(tokens & _HAPPY_TRIGGERS)
    delta -= hostile_hits * 2
    delta += friendly_hits

    return max(-20, min(15, delta))


def _build_personality_note(
    tokens: set[str],
    actions: list[dict],
    existing_notes: str,
    relationship_score: int,
) -> str:
    """Update personality notes based on the interaction."""
    notes = existing_notes or ""

    has_attacks = any(
        a.get("kind") == "damage" and a.get("params", {}).get("target") != "player"
        for a in actions
    )
    has_gifts = any(a.get("kind") in ("give_item", "offer_item") for a in actions)
    has_quests = any(a.get("kind") in ("start_quest", "complete_quest") for a in actions)

    new_observations: list[str] = []
    if has_attacks and "attacked" not in notes:
        new_observations.append("This player has been aggressive.")
    if has_gifts and "generous" not in notes:
        new_observations.append("This player has been generous.")
    if has_quests and "quest" not in notes.lower():
        new_observations.append("This player is a quester.")
    if relationship_score > 40 and "trusted" not in notes:
        new_observations.append("I consider this player a trusted companion.")
    if relationship_score < -40 and "enemy" not in notes:
        new_observations.append("This player is my enemy.")

    if new_observations:
        if notes:
            notes += " "
        notes += " ".join(new_observations)

    # Cap notes length to avoid prompt bloat
    if len(notes) > 300:
        notes = notes[-300:]

    return notes


async def reflect_node(state: NPCAgentState) -> dict:
    """Analyze the conversation to update mood, relationship, and personality notes.

    Uses heuristics (no LLM call) to keep latency and costs low.
    """
    # Collect recent human messages for analysis
    recent_text = ""
    for msg in state["messages"][-6:]:
        if hasattr(msg, "type") and msg.type == "human":
            recent_text += " " + msg.content
        elif isinstance(msg, dict) and msg.get("role") == "human":
            recent_text += " " + msg.get("content", "")

    tokens = _tokenize(recent_text)
    actions = state.get("pending_actions", [])
    current_mood = state.get("mood", "neutral") or "neutral"
    current_score = state.get("relationship_score", 0) or 0
    existing_notes = state.get("personality_notes", "") or ""

    new_mood = _analyze_mood(tokens, current_mood)
    delta = _compute_relationship_delta(tokens, actions)
    new_score = max(-100, min(100, current_score + delta))
    new_notes = _build_personality_note(tokens, actions, existing_notes, new_score)

    return {
        "mood": new_mood,
        "relationship_score": new_score,
        "personality_notes": new_notes,
    }
