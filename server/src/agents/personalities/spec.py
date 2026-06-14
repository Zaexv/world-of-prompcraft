"""Validated NPC personality spec — the data contract an NPC Designer writes.

A spec is the per-NPC, data-driven definition of a character: who it is
(``name``, ``flavor_prompt``), what role it plays (``archetype``, which decides
its tool budget — see :mod:`.archetypes`), and its starting stats. It is
deliberately free of tool wiring and prompt boilerplate; those are derived from
the archetype at runtime.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator

from .archetypes import ARCHETYPES


class NPCSpec(BaseModel):
    """A data-driven NPC personality definition."""

    key: str
    name: str
    archetype: str
    # The character voice / behaviour. May still contain legacy inline tool
    # rules (pre-Phase-5 data); composition strips/replaces those.
    system_prompt: str = ""
    flavor_prompt: str = ""
    initial_hp: int = 100
    position: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])

    @field_validator("archetype")
    @classmethod
    def _known_archetype(cls, v: str) -> str:
        if v and v not in ARCHETYPES:
            raise ValueError(f"unknown archetype {v!r}; known: {', '.join(sorted(ARCHETYPES))}")
        return v

    def to_legacy_dict(self) -> dict[str, Any]:
        """Return the legacy ``NPC_PERSONALITIES`` entry shape (back-compat)."""
        return {
            "name": self.name,
            "archetype": self.archetype,
            "system_prompt": self.system_prompt,
            "initial_hp": self.initial_hp,
            "position": list(self.position),
        }
