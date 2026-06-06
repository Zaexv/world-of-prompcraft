"""NPC quest generation (curated + improvised)."""

from __future__ import annotations

from .generator import (
    QuestObjectiveProposal,
    QuestProposal,
    clamp_proposal,
    generate_quest,
)

__all__ = [
    "QuestObjectiveProposal",
    "QuestProposal",
    "clamp_proposal",
    "generate_quest",
]
