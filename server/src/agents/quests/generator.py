"""LLM-driven improvised quest generation.

Mirrors :mod:`src.combat.loot`: a single structured LLM call forced into the
:class:`QuestProposal` schema, then **server-side clamped** so the model's
numbers and objective kinds can never exceed safe bounds. Any failure falls back
to a deterministic, always-satisfiable "talk to the giver" quest so an NPC can
always offer something real.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from ...world.quests import (
    OBJECTIVE_KINDS,
    QuestInstance,
    QuestObjective,
    QuestReward,
)

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

# Safety bounds — the model's proposal is advisory; the server clamps.
MAX_OBJECTIVES = 3
MAX_REWARD_ITEMS = 2
# Reward gold/xp scale with player level so low-level quests can't mint fortunes.
_GOLD_PER_LEVEL = 40
_GOLD_BASE = 60
_XP_PER_LEVEL = 30
_XP_BASE = 40


class QuestObjectiveProposal(BaseModel):
    """One proposed objective."""

    kind: str = Field(description=f"One of: {', '.join(OBJECTIVE_KINDS)}.")
    target: str = Field(
        description=(
            "What to act on: an enemy archetype/name (or 'any') for kill, an item "
            "name for collect, an npc id for talk, a zone for reach, a dungeon id "
            "for enter_dungeon."
        )
    )
    description: str = Field(description="Short player-facing objective text.")
    required: int = Field(default=1, description="How many times (e.g. kill count).")


class QuestProposal(BaseModel):
    """Structured schema the improvised-quest LLM call must return."""

    title: str = Field(description="Short, evocative quest title (2-5 words).")
    description: str = Field(description="One or two sentences of quest context.")
    objectives: list[QuestObjectiveProposal] = Field(
        description=f"1 to {MAX_OBJECTIVES} objectives the world can actually fulfill."
    )
    reward_gold: int = Field(default=0, description="Gold reward (advisory; server clamps).")
    reward_items: list[str] = Field(default_factory=list, description="Item name rewards.")
    reward_xp: int = Field(default=0, description="XP reward (advisory; server clamps).")


def _reward_caps(player_level: int) -> tuple[int, int]:
    """Return (gold_cap, xp_cap) for a player level."""
    lvl = max(1, int(player_level or 1))
    return _GOLD_BASE + _GOLD_PER_LEVEL * lvl, _XP_BASE + _XP_PER_LEVEL * lvl


def _slug(text: str) -> str:
    cleaned = "".join(c if c.isalnum() else "_" for c in text.lower()).strip("_")
    return cleaned or "quest"


def clamp_proposal(
    proposal: QuestProposal,
    giver_npc_id: str,
    giver_name: str,
    player_level: int = 1,
) -> QuestInstance:
    """Convert a (possibly wild) proposal into a safe, well-formed instance.

    - objective kinds outside the matcher registry are remapped to ``talk`` on
      the giver (always satisfiable);
    - objective count is capped;
    - reward gold/xp are clamped to level-scaled caps and item count is capped.
    """
    gold_cap, xp_cap = _reward_caps(player_level)
    quest_id = f"improv_{giver_npc_id}_{_slug(proposal.title)}"

    objectives: list[QuestObjective] = []
    for idx, raw in enumerate(proposal.objectives[:MAX_OBJECTIVES]):
        kind = raw.kind.strip().lower()
        target = raw.target.strip()
        if kind not in OBJECTIVE_KINDS or not target:
            # Unsupported/unsatisfiable → fall back to talking to the giver.
            kind, target = "talk", giver_npc_id
        required = max(1, int(raw.required or 1))
        objectives.append(
            QuestObjective(
                id=f"{quest_id}_obj{idx}",
                description=raw.description.strip() or f"Objective {idx + 1}",
                kind=kind,
                target=target,
                required=required,
            )
        )
    if not objectives:
        objectives.append(
            QuestObjective(
                id=f"{quest_id}_obj0",
                description=f"Speak with {giver_name}",
                kind="talk",
                target=giver_npc_id,
            )
        )

    reward = QuestReward(
        gold=max(0, min(int(proposal.reward_gold or 0), gold_cap)),
        items=[i.strip() for i in proposal.reward_items[:MAX_REWARD_ITEMS] if i.strip()],
        xp=max(0, min(int(proposal.reward_xp or 0), xp_cap)),
        description=proposal.description.strip(),
    )

    return QuestInstance(
        id=quest_id,
        title=proposal.title.strip() or "A Curious Errand",
        description=proposal.description.strip(),
        giver_npc_id=giver_npc_id,
        giver_name=giver_name,
        objectives=objectives,
        reward=reward,
        origin="improvised",
        status="active",
    )


def _fallback_quest(giver_npc_id: str, giver_name: str, player_level: int) -> QuestInstance:
    """Deterministic, always-satisfiable quest when the LLM is unavailable."""
    gold_cap, xp_cap = _reward_caps(player_level)
    quest_id = f"improv_{giver_npc_id}_errand"
    return QuestInstance(
        id=quest_id,
        title="A Small Favor",
        description=f"{giver_name} has asked you for a small favor — return to them when ready.",
        giver_npc_id=giver_npc_id,
        giver_name=giver_name,
        objectives=[
            QuestObjective(
                id=f"{quest_id}_obj0",
                description=f"Return to {giver_name}",
                kind="talk",
                target=giver_npc_id,
            )
        ],
        reward=QuestReward(
            gold=min(30, gold_cap), xp=min(20, xp_cap), description="A token of thanks."
        ),
        origin="improvised",
    )


async def generate_quest(
    llm: BaseChatModel,
    giver_npc_id: str,
    giver_name: str,
    world_context: dict[str, Any],
    player_level: int = 1,
) -> QuestInstance:
    """Generate a contextual improvised quest, clamped to safe bounds.

    Always returns a valid instance — falls back to a simple errand on any error.
    """
    zone = world_context.get("zone", "the wilds")
    system = (
        "You design a single short fantasy RPG quest an NPC offers a player. "
        "The quest MUST be fulfillable in this world: objective kinds must be one "
        f"of {', '.join(OBJECTIVE_KINDS)}. Prefer 1-2 objectives. Keep rewards "
        "modest and appropriate to the player's level."
    )
    user = (
        f"Quest giver: {giver_name} (id: {giver_npc_id}). Location: {zone}. "
        f"Player level: {player_level}. Invent a fitting quest."
    )
    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        structured = llm.with_structured_output(QuestProposal)
        result = await structured.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=user)]
        )
        if isinstance(result, QuestProposal):
            return clamp_proposal(result, giver_npc_id, giver_name, player_level)
        logger.warning("Quest generation returned unexpected type for %s", giver_npc_id)
    except Exception:
        logger.warning("Quest generation failed for %s — using fallback", giver_npc_id)

    return _fallback_quest(giver_npc_id, giver_name, player_level)
