"""Abstract, server-authoritative quest model.

A quest is a self-describing **instance** living on the player: a title, a list
of objectives (each with progress/required counters), and a generalized reward
(gold + items + xp). Objectives are keyed by an open ``kind`` string resolved
against the objective-matcher registry in :mod:`quest_progress`, so adding a new
objective type means registering a matcher — not editing a closed enum.

Curated quests are seeded from :data:`QUEST_TEMPLATES`; improvised quests are
built the same shape by the LLM generator. Both are stored on the player as the
dict produced by :meth:`QuestInstance.to_storage_dict` and rendered for the
client by :meth:`QuestInstance.to_client_dict`.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Any

# Objective kinds recognised by the matcher registry (quest_progress.py).
# Adding a kind here + a matcher there is the whole extension surface.
OBJECTIVE_KINDS: tuple[str, ...] = ("kill", "collect", "talk", "reach", "enter_dungeon")

# Manual-only objective kind: it has NO matcher and NO event mapping, so
# quest_progress.on_event never auto-advances it. It can only be completed by an
# NPC calling advance_quest_objective (the "report back" / "NPC judges this"
# path). Deliberately NOT in OBJECTIVE_KINDS so the custom-quest generator can't
# mint improvised quests with an objective nothing can fulfil. Use it for steps a
# specific NPC must confirm — returning to a quest giver (a plain `talk` step
# would auto-complete on the turn the quest is accepted from that same giver) or
# a judged outcome like "make Alonso laugh".
MANUAL_OBJECTIVE_KIND = "confirm"


def _as_int(value: Any, default: int = 0) -> int:
    """Coerce a value (possibly a numeric string) to int, falling back safely."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass
class QuestObjective:
    """A single trackable objective.

    ``kind`` selects a matcher; ``target`` is the thing to act on (npc id, item
    name, zone, dungeon id, or an archetype/"any" for kills). ``required`` and
    ``progress`` generalize "kill 3 wolves" / "collect 1 Crystal Tear".
    """

    id: str
    description: str
    kind: str
    target: str
    required: int = 1
    progress: int = 0
    completed: bool = False

    def to_storage_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "description": self.description,
            "kind": self.kind,
            "target": self.target,
            "required": self.required,
            "progress": self.progress,
            "completed": self.completed,
        }

    def to_client_dict(self) -> dict[str, Any]:
        # ``type`` is kept as an alias of ``kind`` for backward-compatible client code.
        return {
            "id": self.id,
            "description": self.description,
            "kind": self.kind,
            "type": self.kind,
            "target": self.target,
            "required": self.required,
            "progress": self.progress,
            "completed": self.completed,
        }

    @classmethod
    def from_storage_dict(cls, d: dict[str, Any]) -> QuestObjective:
        # Accept both the new (kind/required/progress) and the legacy (type) shape.
        kind = str(d.get("kind") or d.get("type") or "talk")
        required = _as_int(d.get("required", 1), 1) or 1
        # Legacy kill_enemies stored the count in target; normalize to required.
        if kind in ("kill_enemies", "kill"):
            kind = "kill"
            legacy_count = _as_int(d.get("target"), 0)
            if legacy_count > 0 and not d.get("kind"):
                required = legacy_count
        legacy_type_map = {"collect_item": "collect", "talk_npc": "talk"}
        kind = legacy_type_map.get(kind, kind)
        completed = bool(d.get("completed", False))
        progress = _as_int(d.get("progress", required if completed else 0))
        return cls(
            id=str(d.get("id", "")),
            description=str(d.get("description", "")),
            kind=kind,
            target=str(d.get("target", "")),
            required=required,
            progress=progress,
            completed=completed,
        )


@dataclass
class QuestReward:
    """Generalized, extensible reward block."""

    gold: int = 0
    items: list[str] = field(default_factory=list)
    xp: int = 0
    description: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "gold": self.gold,
            "items": list(self.items),
            "xp": self.xp,
            "description": self.description,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> QuestReward:
        d = d or {}
        items = d.get("items")
        if not isinstance(items, list):
            # Legacy single reward_item string.
            single = d.get("reward_item", "")
            items = [single] if single else []
        return cls(
            gold=_as_int(d.get("gold", 0)),
            items=[str(i) for i in items if i],
            xp=_as_int(d.get("xp", 0)),
            description=str(d.get("description", d.get("reward_description", ""))),
        )


@dataclass
class QuestInstance:
    """A concrete quest carried by a player (curated or improvised)."""

    id: str
    title: str
    description: str
    giver_npc_id: str
    giver_name: str
    objectives: list[QuestObjective] = field(default_factory=list)
    reward: QuestReward = field(default_factory=QuestReward)
    origin: str = "curated"  # "curated" | "improvised"
    status: str = "active"  # "offered" | "active" | "completed"

    def fresh(self, giver_name: str | None = None) -> QuestInstance:
        """Deep copy with reset objective progress (used when instantiating a template)."""
        return replace(
            self,
            giver_name=giver_name or self.giver_name,
            objectives=[replace(o, progress=0, completed=False) for o in self.objectives],
            reward=replace(self.reward, items=list(self.reward.items)),
            status="active",
        )

    def to_storage_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "giver_npc_id": self.giver_npc_id,
            "giver_name": self.giver_name,
            "origin": self.origin,
            "status": self.status,
            "objectives": [o.to_storage_dict() for o in self.objectives],
            "reward": self.reward.to_dict(),
        }

    def to_client_dict(self) -> dict[str, Any]:
        reward = self.reward
        return {
            "id": self.id,
            "name": self.title,
            "title": self.title,
            "description": self.description,
            "giverNpc": self.giver_npc_id,
            "giverName": self.giver_name,
            "origin": self.origin,
            "status": self.status,
            "objectives": [o.to_client_dict() for o in self.objectives],
            "reward": reward.to_dict(),
            # Backward-compatible flat fields for older client UI.
            "rewardItem": reward.items[0] if reward.items else "",
            "rewardDescription": reward.description,
        }

    @classmethod
    def from_storage_dict(cls, d: dict[str, Any]) -> QuestInstance:
        return cls(
            id=str(d.get("id", "")),
            title=str(d.get("title", d.get("name", ""))),
            description=str(d.get("description", "")),
            giver_npc_id=str(d.get("giver_npc_id", d.get("giver_npc", ""))),
            giver_name=str(d.get("giver_name", "")),
            objectives=[QuestObjective.from_storage_dict(o) for o in d.get("objectives", [])],
            reward=QuestReward.from_dict(d.get("reward")),
            origin=str(d.get("origin", "curated")),
            status=str(d.get("status", "active")),
        )


# ── Curated seed templates (the original three + room to grow) ──────────────
QUEST_TEMPLATES: dict[str, QuestInstance] = {
    "sacred_flame": QuestInstance(
        id="sacred_flame",
        title="The Sacred Flame",
        description=(
            "El Tito possesses an ancient artifact of immense wisdom — el porro "
            "ancestral — but it lies dormant. Find the Mechero Ancestral, a sacred "
            "lighter from the ancient world, hidden in the Ember Depths dungeon. "
            "Only its sacred fire can awaken the artifact's power."
        ),
        giver_npc_id="eltito_01",
        giver_name="El Tito",
        objectives=[
            QuestObjective(
                "enter_ember_depths", "Enter the Ember Depths", "enter_dungeon", "ember_depths"
            ),
            QuestObjective(
                "find_mechero", "Find the Mechero Ancestral", "collect", "Mechero Ancestral"
            ),
            QuestObjective("return_tito", "Return to El Tito", "talk", "eltito_01"),
        ],
        reward=QuestReward(
            gold=120,
            items=["Artifact of Ancient Wisdom"],
            xp=100,
            description="El Tito's legendary artifact, ablaze with sacred fire. Grants +50 max mana.",
        ),
    ),
    "crystal_tear": QuestInstance(
        id="crystal_tear",
        title="The Crystal Tear",
        description=(
            "Elyria the Sage speaks of a Crystal Tear — a shard of pure magical "
            "energy — lost in the Crystal Caverns beneath Crystal Lake. Retrieve "
            "it and bring it to her."
        ),
        giver_npc_id="sage_01",
        giver_name="Elyria the Sage",
        objectives=[
            QuestObjective(
                "enter_crystal_caverns",
                "Enter the Crystal Caverns",
                "enter_dungeon",
                "crystal_caverns",
            ),
            QuestObjective("find_crystal_tear", "Find the Crystal Tear", "collect", "Crystal Tear"),
            QuestObjective("return_elyria", "Return to Elyria", "talk", "sage_01"),
        ],
        reward=QuestReward(
            gold=80,
            items=["Amulet of Clarity"],
            xp=70,
            description="A shimmering amulet that clears the mind. Grants +20 max mana.",
        ),
    ),
    "village_patrol": QuestInstance(
        id="village_patrol",
        title="Village Patrol",
        description=(
            "Captain Aldric needs help securing the village perimeter. Defeat 3 "
            "hostile creatures near the village and report back."
        ),
        giver_npc_id="guard_01",
        giver_name="Captain Aldric",
        objectives=[
            QuestObjective(
                "kill_hostiles", "Defeat 3 hostile creatures", "kill", "any", required=3
            ),
            QuestObjective("return_aldric", "Report to Captain Aldric", "talk", "guard_01"),
        ],
        reward=QuestReward(
            gold=50,
            items=["Guard's Badge of Honor"],
            xp=40,
            description="A badge marking you as a friend of the village guard.",
        ),
    ),
    # ── Fort Malaka — Notion-brief quests ───────────────────────────────────
    "juan_story": QuestInstance(
        id="juan_story",
        title="Escucha la Historia del Pescador",
        description=(
            "Juan el Pescador gazes out over the Mediterranean, full of memories of "
            "his father and of Sara, a love lost in a distant port. Sit with him and "
            "hear his tale of the sea."
        ),
        giver_npc_id="juan_pescador",
        giver_name="Juan el Pescador",
        objectives=[
            QuestObjective(
                "hear_tale",
                "Hear Juan's tale of the sea",
                MANUAL_OBJECTIVE_KIND,
                "juan_pescador",
            ),
        ],
        reward=QuestReward(
            gold=20,
            items=["Anzuelo de la Suerte"],
            xp=25,
            description="Juan's lucky hook, worn smooth by years of salt and longing.",
        ),
    ),
    "malaka_thieves": QuestInstance(
        id="malaka_thieves",
        title="Hay Nuevos Ladrones en Ésta Zona",
        description=(
            "Guardia Abelardo reports a fresh band of thieves plaguing the quarter. "
            "Defeat 3 of them and report back. ¡Por el Rey Paco!"
        ),
        giver_npc_id="guardia_abelardo",
        giver_name="Guardia Abelardo",
        objectives=[
            QuestObjective("clear_thieves", "Defeat 3 thieves", "kill", "any", required=3),
            QuestObjective(
                "report_abelardo",
                "Report to Guardia Abelardo",
                MANUAL_OBJECTIVE_KIND,
                "guardia_abelardo",
            ),
        ],
        reward=QuestReward(
            gold=60,
            items=["Comenda de la Guardia"],
            xp=50,
            description="A commendation marking you a friend of Fort Malaka's guard.",
        ),
    ),
    "glorious_potatoes": QuestInstance(
        id="glorious_potatoes",
        title="¡Gloriosas Patatas!",
        description=(
            "Luisa la Patatera has gathered a glorious sack of potatoes and, shouting "
            "across her fields, begs you to carry it to her philosopher friend Nireg "
            "Jenkins down by the beach before they spoil — then hurry back to her."
        ),
        giver_npc_id="luisa_patatera",
        giver_name="Luisa la Patatera",
        objectives=[
            QuestObjective(
                "deliver_potatoes",
                "Deliver Luisa's sack of potatoes to Nireg Jenkins",
                "talk",
                "nireg_jenkins",
            ),
            QuestObjective(
                "return_luisa",
                "Return to Luisa la Patatera",
                MANUAL_OBJECTIVE_KIND,
                "luisa_patatera",
            ),
        ],
        reward=QuestReward(
            gold=40,
            items=["Saco de Patatas Gloriosas"],
            xp=40,
            description="A hefty sack of Luisa's finest, gloriously gathered potatoes.",
        ),
    ),
    "make_him_laugh": QuestInstance(
        id="make_him_laugh",
        title="Haz Reír al Hombre Más Serio del Reino",
        description=(
            "Sancho Barriga dares you — no cheating! — to make his lifelong friend "
            "Alonso Quijano, the most serious man in the realm, finally laugh. Then "
            "report your triumph to Sancho."
        ),
        giver_npc_id="sancho_barriga",
        giver_name="Sancho Barriga",
        objectives=[
            QuestObjective(
                "amuse_alonso",
                "Make Alonso Quijano laugh",
                MANUAL_OBJECTIVE_KIND,
                "alonso_quijano",
            ),
            QuestObjective(
                "tell_sancho",
                "Report your triumph to Sancho Barriga",
                MANUAL_OBJECTIVE_KIND,
                "sancho_barriga",
            ),
        ],
        reward=QuestReward(
            gold=70,
            items=["Sonrisa de Alonso"],
            xp=60,
            description="The rarest treasure in the realm: a smile from Alonso Quijano.",
        ),
    ),
    "heroes_reunion": QuestInstance(
        id="heroes_reunion",
        title="Misión de Cadena",
        description=(
            "Zaex Uve sends you to gather the wisdom of his fellow dragon-slayers: "
            "consult El Tito the mage, then Nireg Jenkins the oracle, then return to Zaex."
        ),
        giver_npc_id="zaex_01",
        giver_name="Zaex Uve",
        objectives=[
            QuestObjective("consult_tito", "Consult El Tito", "talk", "eltito_01"),
            QuestObjective("consult_nireg", "Consult Nireg Jenkins", "talk", "nireg_jenkins"),
            QuestObjective("return_zaex", "Return to Zaex Uve", MANUAL_OBJECTIVE_KIND, "zaex_01"),
        ],
        reward=QuestReward(
            gold=300,
            items=["Aullido de la Hermandad"],
            xp=250,
            description=(
                "The hermandad's howl made token — a relic of the three heroes who "
                "slew Cárgarath el Inabarcable."
            ),
        ),
    ),
}


def template_ids() -> list[str]:
    """Sorted list of curated quest template IDs (for dynamic tool docstrings)."""
    return sorted(QUEST_TEMPLATES)


def instantiate(template_id: str, giver_name: str | None = None) -> QuestInstance | None:
    """Build a fresh active instance from a curated template, or None if unknown."""
    template = QUEST_TEMPLATES.get(template_id)
    if template is None:
        return None
    return template.fresh(giver_name)
