from __future__ import annotations

from dataclasses import dataclass
from typing import Any

_ATTACK_KEYWORDS = {
    # Direct violence
    "attack",
    "hit",
    "strike",
    "slash",
    "stab",
    "punch",
    "kick",
    "fight",
    "kill",
    "destroy",
    "smash",
    "swing",
    "cleave",
    "thrust",
    "cut",
    "shoot",
    "blast",
    "crush",
    "bite",
    "claw",
    "charge",
    "slam",
    "burn",
    "freeze",
    "slay",
    "vanquish",
    "obliterate",
    "annihilate",
    "impale",
    "shatter",
    "pummel",
    "batter",
    "bludgeon",
    "gut",
    "rend",
    "tear",
    "mutilate",
    "pierce",
    "skewer",
    "decimate",
    "devastate",
    "maim",
    "wound",
    "hurt",
    "overpower",
    "overwhelm",
    "assault",
    "ambush",
    "execute",
    # Magical intent
    "fireball",
    "lightning",
    "cast",
    "unleash",
    "channel",
    "invoke",
    "summon",
    "conjure",
    "surge",
    "detonate",
    "incinerate",
    "electrocute",
    "smite",
    "curse",
    "hex",
    "wither",
    "drain",
    "zap",
    "ignite",
    "explode",
    # Tactical / expressive
    "lunge",
    "pounce",
    "rush",
    "leap",
    "dive",
    "tackle",
    "headbutt",
    "challenge",
    "duel",
    "engage",
    "confront",
    "face",
}

_WEAPON_KEYWORDS = {
    "sword",
    "blade",
    "axe",
    "dagger",
    "bow",
    "arrow",
    "staff",
    "mace",
    "hammer",
    "spear",
    "shield",
    "fist",
    "claws",
}

_STYLE_KEYWORDS = {
    "humiliate",
    "taunt",
    "mock",
    "insult",
    "feint",
    "dodge",
    "parry",
    "counter",
    "flank",
    "ambush",
    "backstab",
    "critical",
    "powerful",
    "mighty",
    "devastating",
    "precise",
    "swift",
    "spinning",
    "leaping",
    "charging",
    "overhead",
    "uppercut",
    "combo",
    "fury",
    "rage",
    "berserk",
    "finisher",
    "execute",
}

_MAGIC_KEYWORDS = {
    "fireball",
    "lightning",
    "ice",
    "frost",
    "flame",
    "thunder",
    "arcane",
    "holy",
    "shadow",
    "spell",
    "magic",
    "enchant",
    "inferno",
    "blizzard",
    "meteor",
    "bolt",
    "beam",
    "nova",
}


@dataclass
class CombatResolution:
    """Full description of how a single player attack resolves."""

    prompt_quality: float
    base_damage: int
    final_damage: int
    damage_type: str
    outcome: str
    combat_text: str
    visual_tags: list[str]
    is_crit: bool


def is_attack_prompt(prompt: str) -> bool:
    words = set(prompt.lower().split())
    return bool(words & _ATTACK_KEYWORDS)


def score_attack(
    prompt: str,
    inventory: list[str],
    equipped: dict[str, Any] | None = None,
) -> tuple[float, str, str]:
    """Score the quality of an attack prompt.

    Returns (multiplier, damage_type, effect_type).
    - 1.0 = basic attack ("attack")
    - Up to 3.5 for creative, weapon-equipped, styled attacks
    """
    lower = prompt.lower()
    words = set(lower.split())

    multiplier = 1.0
    damage_type = "physical"
    effect_type = "sparkle"

    if equipped:
        weapon = equipped.get("weapon")
        if weapon:
            multiplier += 0.6
            if any(w in lower for w in str(weapon).lower().split()):
                multiplier += 0.4
        shield = equipped.get("shield")
        if shield:
            multiplier += 0.2
        trinket = equipped.get("trinket")
        if trinket:
            multiplier += 0.15

    word_count = len(prompt.split())
    if word_count >= 8:
        multiplier += 0.3
    if word_count >= 15:
        multiplier += 0.3
    if word_count >= 25:
        multiplier += 0.2

    if words & _WEAPON_KEYWORDS:
        multiplier += 0.3

    for item in inventory:
        item_words = set(item.lower().split())
        if item_words & words:
            multiplier += 0.4
            break

    style_matches = words & _STYLE_KEYWORDS
    multiplier += min(len(style_matches) * 0.25, 0.75)

    if {"humiliate", "taunt", "mock", "insult"} & words:
        multiplier += 0.5

    magic_matches = words & _MAGIC_KEYWORDS
    if magic_matches:
        multiplier += 0.3
        if {"fireball", "flame", "inferno", "fire", "burn", "meteor"} & magic_matches:
            damage_type = "fire"
            effect_type = "fire"
        elif {"ice", "frost", "blizzard", "freeze"} & magic_matches:
            damage_type = "ice"
            effect_type = "ice"
        elif {"lightning", "thunder", "bolt"} & magic_matches:
            damage_type = "lightning"
            effect_type = "lightning"
        elif {"holy", "light"} & magic_matches:
            damage_type = "holy"
            effect_type = "holy_light"
        elif {"shadow", "dark"} & magic_matches:
            damage_type = "dark"
            effect_type = "smoke"
        else:
            damage_type = "arcane"
            effect_type = "sparkle"

    return min(multiplier, 3.5), damage_type, effect_type


def resolve_combat(
    prompt: str,
    player_level: int,
    player_inventory: list[str],
    player_equipped: dict[str, Any] | None,
    npc_hp: int,
    npc_max_hp: int,
    npc_armor: int = 0,
) -> CombatResolution:
    """Resolve a combat action from a free-form player prompt."""
    quality, damage_type, effect_type = score_attack(prompt, player_inventory, player_equipped)
    base_damage = 15 + (player_level * 2)
    raw_damage = int(base_damage * quality)
    final_damage = max(1, raw_damage - npc_armor)

    _ = npc_max_hp

    if quality < 1.2:
        outcome = "glancing_hit"
        combat_text = f"Glancing blow — {final_damage} {damage_type} damage."
        is_crit = False
        visual_tags: list[str] = []
    elif quality < 1.5:
        outcome = "clean_hit"
        combat_text = f"Clean hit! {final_damage} {damage_type} damage."
        is_crit = False
        visual_tags = [effect_type] if effect_type != "sparkle" else []
    elif quality < 2.0:
        outcome = "critical_hit"
        combat_text = f"Critical hit! {final_damage} {damage_type} damage!"
        is_crit = True
        visual_tags = [effect_type] if effect_type != "sparkle" else ["sparkle"]
    elif quality < 2.5:
        outcome = "critical_hit"
        combat_text = f"Critical hit! {final_damage} {damage_type} damage!"
        is_crit = True
        visual_tags = [effect_type, "sparkle"] if effect_type != "sparkle" else ["sparkle"]
    else:
        outcome = "devastating_hit"
        combat_text = f"DEVASTATING blow! {final_damage} {damage_type} damage!!"
        is_crit = True
        visual_tags = (
            [effect_type, "sparkle", "explosion"]
            if effect_type != "sparkle"
            else ["sparkle", "explosion"]
        )

    if npc_hp - final_damage <= 0:
        outcome = "defeated"
        combat_text = f"Finishing blow! {final_damage} {damage_type} damage — DEFEATED!"
        if "explosion" not in visual_tags:
            visual_tags.append("explosion")

    return CombatResolution(
        prompt_quality=quality,
        base_damage=base_damage,
        final_damage=final_damage,
        damage_type=damage_type,
        outcome=outcome,
        combat_text=combat_text,
        visual_tags=visual_tags,
        is_crit=is_crit,
    )
