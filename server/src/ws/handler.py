from __future__ import annotations

import asyncio
import logging
import random
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..agents.registry import AgentRegistry
    from ..world.world_state import WorldState

logger = logging.getLogger(__name__)

# ── Attack detection & quality scoring ──────────────────────────────────────
_ATTACK_KEYWORDS = {
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
    "fireball",
    "lightning",
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
    "cast",
    "burn",
    "freeze",
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


def _is_attack_prompt(prompt: str) -> bool:
    words = set(prompt.lower().split())
    return bool(words & _ATTACK_KEYWORDS)


def _score_attack_quality(prompt: str, inventory: list[str]) -> tuple[float, str, str]:
    """Score the quality of an attack prompt.

    Returns (multiplier, damage_type, effect_type).
    - 1.0 = basic attack ("attack")
    - Up to 3.0 for creative, weapon-equipped, styled attacks
    """
    lower = prompt.lower()
    words = set(lower.split())

    multiplier = 1.0
    damage_type = "physical"
    effect_type = "sparkle"

    # Length bonus: more descriptive prompts are rewarded
    word_count = len(prompt.split())
    if word_count >= 8:
        multiplier += 0.3
    if word_count >= 15:
        multiplier += 0.3
    if word_count >= 25:
        multiplier += 0.2

    # Weapon mention bonus
    if words & _WEAPON_KEYWORDS:
        multiplier += 0.4

    # Check if player uses an item they actually have in inventory
    for item in inventory:
        item_words = set(item.lower().split())
        if item_words & words:
            multiplier += 0.5  # Big bonus for using owned items
            break

    # Style keywords (creativity)
    style_matches = words & _STYLE_KEYWORDS
    multiplier += min(len(style_matches) * 0.25, 0.75)

    # Humiliation / psychological attacks
    if {"humiliate", "taunt", "mock", "insult"} & words:
        multiplier += 0.5

    # Magic keywords → change damage type + higher multiplier
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

    return min(multiplier, 3.0), damage_type, effect_type


# Module-level references set during app startup
_registry: AgentRegistry | None = None
_world_state: WorldState | None = None

# Allowed fields from client player state (security whitelist)
_ALLOWED_PLAYER_FIELDS = {"position"}


def init_handler(registry: AgentRegistry, world_state: WorldState) -> None:
    """Wire the handler to the live registry and world state (called at startup)."""
    global _registry, _world_state
    _registry = registry
    _world_state = world_state


async def handle_message(data: dict) -> dict:
    """Route incoming WebSocket messages to appropriate handlers."""
    msg_type = data.get("type")

    if msg_type == "interaction":
        return await _handle_interaction(data)

    if msg_type == "player_move":
        return await _handle_player_move(data)

    if msg_type == "explore_area":
        return await _handle_explore_area(data)

    if msg_type == "use_item":
        return await _handle_use_item(data)

    return {"type": "error", "message": f"Unknown message type: {msg_type}"}


async def _handle_interaction(data: dict) -> dict:
    npc_id = data.get("npcId", data.get("npc_id", "unknown"))
    player_id = data.get("playerId", data.get("player_id", "default"))
    prompt = data.get("prompt", "")
    player_state_raw = data.get("playerState", data.get("player_state", {}))

    if _registry is None or _world_state is None:
        logger.warning("Handler called before initialization")
        return {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": "[System] The world is not yet ready.",
            "actions": [],
            "playerStateUpdate": None,
            "npcStateUpdate": None,
        }

    # Ensure player exists in world state
    player = _world_state.get_player(player_id)
    # Only allow whitelisted fields from client (security)
    if player_state_raw:
        for key in _ALLOWED_PLAYER_FIELDS:
            if key in player_state_raw and hasattr(player, key):
                setattr(player, key, player_state_raw[key])

    # ── Apply player attack damage before agent invocation ──────────────
    player_damage_actions: list[dict] = []
    if _is_attack_prompt(prompt):
        quality, dmg_type, effect_type = _score_attack_quality(
            prompt,
            player.inventory,
        )
        base_damage = 15 + (player.level * 2)
        final_damage = int(base_damage * quality)

        npc = _world_state.get_npc(npc_id)
        if npc:
            npc.hp = max(0, npc.hp - final_damage)
            player_damage_actions.append(
                {
                    "kind": "damage",
                    "params": {
                        "target": npc_id,
                        "amount": final_damage,
                        "damageType": dmg_type,
                    },
                }
            )
            # Spawn visual effect for quality attacks
            if quality >= 1.5:
                player_damage_actions.append(
                    {
                        "kind": "spawn_effect",
                        "params": {"effectType": effect_type, "color": "#ffaa00", "count": 20},
                    }
                )
            # Critical hit notification for great prompts
            if quality >= 2.0:
                player_damage_actions.append(
                    {
                        "kind": "spawn_effect",
                        "params": {"effectType": "sparkle", "color": "#ffff00", "count": 40},
                    }
                )

    try:
        result = await asyncio.wait_for(
            _registry.invoke(
                npc_id=npc_id,
                player_id=player_id,
                prompt=prompt,
                player_state=player.to_dict(),
            ),
            timeout=30.0,
        )
    except TimeoutError:
        logger.warning("Agent invocation timed out for NPC %s", npc_id)
        return {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": "The NPC seems distracted and doesn't respond...",
            "actions": player_damage_actions,
            "playerStateUpdate": None,
            "npcStateUpdate": None,
        }

    # Merge player damage actions before agent actions
    all_actions = player_damage_actions + result.get("actions", [])

    # Check for NPC death
    npc = _world_state.get_npc(npc_id)
    npc_state = result.get("npcStateUpdate")
    if npc:
        npc_state = {"hp": npc.hp, "maxHp": npc.max_hp}
        if npc.hp <= 0:
            all_actions.append(
                {
                    "kind": "spawn_effect",
                    "params": {"color": "#ff4400", "count": 50},
                }
            )

    # Don't send playerStateUpdate — let actions be the sole source of truth
    # on the client. This prevents double-application of HP/inventory changes.
    return {
        "type": "agent_response",
        "npcId": npc_id,
        "dialogue": result.get("dialogue", "..."),
        "actions": all_actions,
        "playerStateUpdate": None,
        "npcStateUpdate": npc_state,
    }


async def _handle_player_move(data: dict) -> dict:
    player_id = data.get("playerId", data.get("player_id", "default"))
    position = data.get("position", [0.0, 0.0, 0.0])

    try:
        if _world_state is not None:
            await _world_state.update_player(player_id, {"position": position})
    except Exception:
        logger.exception("Failed to update player position for %s", player_id)

    return {"type": "ack", "status": "ok"}


async def _handle_explore_area(data: dict) -> dict:
    """Handle area exploration — create dynamic NPC agents for generated NPCs."""
    npcs = data.get("npcs", [])
    for npc_data in npcs:
        npc_id = npc_data.get("id", "")
        name = npc_data.get("name", "Unknown")
        behavior = npc_data.get("behavior", "friendly")

        # Create NPC in world state
        if _world_state and npc_id not in _world_state.npcs:
            from ..world.world_state import NPCData

            personality = _get_generated_personality(name, behavior)
            npc = NPCData(
                npc_id=npc_id,
                name=name,
                personality=personality,
                hp=60 if behavior == "hostile" else 80,
                max_hp=60 if behavior == "hostile" else 80,
                position=npc_data.get("position", [0, 0, 0]),
            )
            _world_state.npcs[npc_id] = npc

            # Register agent
            if _registry:
                _registry.register_dynamic_npc(npc)

    return {"type": "ack", "status": "ok"}


def _get_generated_personality(name: str, behavior: str) -> str:
    """Return a system prompt personality for a dynamically generated NPC."""
    if behavior == "hostile":
        damage_range = random.choice([(8, 15), (12, 20), (15, 25)])
        damage_type = random.choice(["physical", "fire", "ice", "dark"])
        effect = random.choice(["fire", "ice", "smoke", "lightning"])
        return (
            f"You are {name}, a dangerous creature lurking in Teldrassil.\n"
            f"BEHAVIOR: You are aggressive and attack on sight.\n"
            f"TOOL RULES:\n"
            f"- ALWAYS call deal_damage targeting 'player' with {damage_range[0]}-{damage_range[1]} {damage_type} damage.\n"
            f"- Use spawn_effect('{effect}') when attacking.\n"
            f"- Use emote('threaten') before your first attack.\n"
            f"- Keep dialogue to 1-2 sentences of growling, snarling, or hissing.\n"
            f"- If your HP drops below 30%, use flee() to escape.\n"
            f"- NEVER negotiate. ALWAYS fight."
        )
    elif behavior == "neutral":
        quest_type = random.choice(
            [
                ("Gather Moonpetals", "Collect 3 moonpetal flowers from the glade nearby"),
                ("Hunt the Corruption", "Destroy the corrupted treant east of here"),
                ("Deliver the Message", "Take this scroll to the sentinel at the crossroads"),
                ("Find the Lost Artifact", "A sacred moonstone was lost in the barrow den"),
            ]
        )
        return (
            f"You are {name}, a Night Elf patrolling Teldrassil.\n"
            f"PERSONALITY: Serious, dutiful, knowledgeable about Night Elf culture.\n"
            f"TOOL RULES:\n"
            f"- Use emote('bow') when greeting.\n"
            f"- You have a quest to offer: give_quest('{quest_type[0]}', '{quest_type[1]}').\n"
            f"- Use spawn_effect('sparkle') when discussing magical topics.\n"
            f"- If the player asks for directions, describe nearby landmarks.\n"
            f"- Share lore about Night Elves, Elune, and Teldrassil.\n"
            f"- If attacked, defend yourself with deal_damage(15-25, 'physical')."
        )
    else:
        item = random.choice(
            [
                "Health Potion",
                "Mana Elixir",
                "Lucky Charm",
                "Moonpetal Flower",
                "Starlight Dust",
                "Ancient Rune",
            ]
        )
        trait = random.choice(
            [
                "cheerful and tells bad jokes",
                "mysterious and speaks in riddles",
                "nervous and jumpy, always looking over their shoulder",
                "very old and wise, speaks slowly",
                "enthusiastic about everything, uses lots of exclamation marks",
            ]
        )
        return (
            f"You are {name}, a friendly wanderer in Teldrassil.\n"
            f"PERSONALITY: You are {trait}.\n"
            f"TOOL RULES:\n"
            f"- Use emote('wave') when greeting.\n"
            f"- You carry a {item} -- use offer_item('{item}') if the player is kind.\n"
            f"- If the player asks for help, give useful tips about the area.\n"
            f"- Use spawn_effect('sparkle') when showing something magical.\n"
            f"- If attacked, use emote('cry') and plead for peace. Don't fight.\n"
            f"- ALWAYS remind the player that it's dangerous out in the wild."
        )


async def _handle_use_item(data: dict) -> dict:
    """Handle item usage from the player's inventory."""
    if _world_state is None:
        return {"type": "use_item_result", "success": False, "message": "World not ready"}

    player_id = data.get("playerId", "default")
    item_name = data.get("item", "")

    player = _world_state.get_player(player_id)

    # Check if item exists in inventory
    if item_name not in player.inventory:
        return {"type": "use_item_result", "success": False, "message": "Item not found"}

    # Remove from inventory
    player.inventory.remove(item_name)

    # Apply effects based on item type
    actions: list[dict] = []
    message = f"Used {item_name}"

    lower = item_name.lower()

    if "health" in lower or "heal" in lower or "potion" in lower:
        heal_amount = 30
        player.hp = min(player.max_hp, player.hp + heal_amount)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": heal_amount}})
        message = f"Restored {heal_amount} HP"

    elif "mana" in lower or "elixir" in lower:
        mana_amount = 25
        player.mana = min(player.max_mana, player.mana + mana_amount)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": 0}})
        message = f"Restored {mana_amount} Mana"

    elif "sword" in lower or "blade" in lower or "axe" in lower or "dagger" in lower:
        # Weapon buff — player's next attacks deal more damage for the session
        player.level = min(player.level + 1, 10)
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "sparkle", "color": "#ffaa44", "count": 20},
            }
        )
        message = f"Equipped {item_name}! Attack power increased (Level {player.level})"

    elif "shield" in lower or "armor" in lower:
        # Defensive item — restore some HP as a shield effect
        shield_hp = 20
        player.hp = min(player.max_hp, player.hp + shield_hp)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": shield_hp}})
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "sparkle", "color": "#4488ff", "count": 15},
            }
        )
        message = f"Shield activated! +{shield_hp} HP"

    elif "scroll" in lower:
        # Scrolls restore mana and grant a magic boost
        mana_amount = 30
        player.mana = min(player.max_mana, player.mana + mana_amount)
        player.level = min(player.level + 1, 10)
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "sparkle", "color": "#aa44ff", "count": 30},
            }
        )
        message = f"Read {item_name}! Mana +{mana_amount}, magic power increased"

    elif "charm" in lower or "amulet" in lower or "rune" in lower:
        # Trinkets — small heal + buff
        heal_amount = 15
        player.hp = min(player.max_hp, player.hp + heal_amount)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": heal_amount}})
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "holy_light", "color": "#ffcc00", "count": 15},
            }
        )
        message = f"The {item_name} glows warmly. +{heal_amount} HP"

    elif "brownie" in lower or "tea" in lower or "herb" in lower:
        # El Tito's special items — full HP/mana restore
        player.hp = player.max_hp
        player.mana = player.max_mana
        heal_amount = player.max_hp
        actions.append({"kind": "heal", "params": {"target": "player", "amount": heal_amount}})
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "smoke", "color": "#44ff88", "count": 30},
            }
        )
        message = "Whoa... full restore! HP and Mana replenished"

    else:
        # Generic item — small heal
        heal_amount = 10
        player.hp = min(player.max_hp, player.hp + heal_amount)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": heal_amount}})
        message = f"Used {item_name}. +{heal_amount} HP"

    # Send updated state. The client will use actions as source of truth
    # for HP (ReactionSystem skips merge for fields touched by actions).
    return {
        "type": "use_item_result",
        "success": True,
        "item": item_name,
        "message": message,
        "actions": actions,
        "playerStateUpdate": player.to_dict(),
    }
