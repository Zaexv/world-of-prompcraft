"""Interaction handling: the combat fast-path (instant deterministic replies),
the full LLM agent path, procedural NPC auto-registration, kill rewards, and
dialogue/action broadcasts to nearby players."""

from __future__ import annotations

import asyncio
import logging
import random
from typing import TYPE_CHECKING, Any

from ...combat.combat_resolution import (
    MAGIC_KEYWORDS,
    STYLE_KEYWORDS,
    WEAPON_KEYWORDS,
    CombatResolution,
    is_attack_prompt,
    resolve_combat,
)
from ...combat.loot import generate_loot
from ...config import settings
from ...world import quest_progress

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ...world.world_state import NPCData
    from ..connection_manager import ConnectionManager
    from .context import HandlerContext

logger = logging.getLogger(__name__)

# Action kinds that nearby players need to see for combat/world sync.
_BROADCAST_KINDS = {"damage", "move_npc", "emote", "spawn_effect"}

# ── Instant combat replies ───────────────────────────────────────────────────
# When the player attacks, the NPC fires back a deterministic, personality-
# flavoured response immediately instead of waiting on the LLM. Each profile is
# keyed by archetype: a few barks, a counterattack damage range + type, an
# optional spawn effect, an emote, and the resulting mood.
_COMBAT_PROFILES: dict[str, dict[str, Any]] = {
    "hostile_boss": {
        "lines": [
            "You dare strike me, mortal? You will burn for that!",
            "Pathetic. Witness true power!",
            "Your insolence ends here!",
        ],
        "damage": (24, 36),
        "type": "fire",
        "effect": "fire",
        "emote": "threaten",
        "mood": "angry",
    },
    "hostile_monster": {
        "lines": [
            "The creature snarls and lunges back at you!",
            "It shrieks and claws at you!",
            "The beast retaliates savagely!",
        ],
        "damage": (12, 20),
        "type": "physical",
        "effect": None,
        "emote": "threaten",
        "mood": "angry",
    },
    "volatile_pyromancer": {
        "lines": ["You'll regret that -- burn!", "Flames answer your folly!"],
        "damage": (20, 30),
        "type": "fire",
        "effect": "fire",
        "emote": "threaten",
        "mood": "angry",
    },
    "mysterious_cryomancer": {
        "lines": ["Freeze where you stand.", "The cold takes those who provoke me."],
        "damage": (18, 26),
        "type": "ice",
        "effect": "ice",
        "emote": "threaten",
        "mood": "angry",
    },
    "neutral_guard": {
        "lines": ["Attacking me? Bad move, citizen!", "Stand down, or face the law!"],
        "damage": (14, 22),
        "type": "physical",
        "effect": None,
        "emote": "threaten",
        "mood": "annoyed",
    },
    "neutral_wanderer": {
        "lines": ["I didn't want a fight, but so be it!", "You'll find I'm no easy mark!"],
        "damage": (12, 20),
        "type": "physical",
        "effect": None,
        "emote": "threaten",
        "mood": "annoyed",
    },
    "eccentric_archmage": {
        "lines": ["Rudeness met with arcane fire!", "You interrupt my studies -- unwise!"],
        "damage": (16, 24),
        "type": "arcane",
        "effect": "sparkle",
        "emote": "threaten",
        "mood": "annoyed",
    },
}

# Friendly archetypes (merchant, healer, guide, stoner, quest_giver) fall back
# to this: they plead rather than fight, and deal no damage.
_PACIFIST_PROFILE: dict[str, Any] = {
    "lines": [
        "Please, stop! I mean you no harm!",
        "Why would you attack me?!",
        "Mercy! I'm no fighter!",
    ],
    "damage": (0, 0),
    "type": "physical",
    "effect": None,
    "emote": "cry",
    "mood": "fearful",
}

_DEFEAT_LINES = ["No... this cannot be...", "You... have bested me...", "Argh! I am undone!"]


# Gold reward multiplier per archetype tier — bosses pay out far more than
# trash mobs. Multiplied by the NPC's max HP to scale with difficulty.
_GOLD_TIER: dict[str, float] = {
    "hostile_boss": 0.6,
    "eccentric_archmage": 0.5,
    "volatile_pyromancer": 0.4,
    "mysterious_cryomancer": 0.4,
    "neutral_guard": 0.3,
    "neutral_wanderer": 0.3,
    "hostile_monster": 0.25,
}

_COMBAT_FALLBACKS = [
    "You dare strike me?!",
    "I'll make you pay for that!",
    "You'll regret this, fool!",
    "Feel my wrath!",
    "Is that all you've got?!",
]

# Allowed fields from client player state (security whitelist)
# We sync inventory and hp so the server can score attacks properly
# and use_item can find items the player received from NPCs.
_ALLOWED_PLAYER_FIELDS = {"position", "hp", "inventory"}


def cleanup_player_locks(ctx: HandlerContext, player_id: str) -> None:
    """Remove per-player interaction lock on disconnect."""
    ctx.interaction_locks.pop(player_id, None)


def _gold_reward(npc: NPCData) -> int:
    """Calculate gold dropped by a defeated NPC, scaled by HP and archetype."""
    tier = _GOLD_TIER.get(npc.archetype, 0.2)
    base = int(npc.max_hp * tier)
    return max(1, base + random.randint(0, max(1, base // 2)))


async def _build_kill_rewards(
    ctx: HandlerContext, npc: NPCData, player_id: str
) -> list[dict[str, Any]]:
    """Award gold + LLM loot for a freshly defeated NPC. Returns client actions.

    Idempotent: guarded by ``npc.loot_dropped`` so a corpse only pays out once.
    """
    world_state = ctx.world_state
    if world_state is None or npc.loot_dropped:
        return []
    npc.loot_dropped = True

    actions: list[dict[str, Any]] = []

    gold = _gold_reward(npc)
    gold_action = {
        "kind": "give_gold",
        "params": {"amount": gold, "player_id": player_id},
    }
    actions.append(gold_action)

    # LLM loot drop — bespoke item themed to the slain NPC.
    if ctx.registry is not None:
        try:
            loot_params = await asyncio.wait_for(
                generate_loot(ctx.registry._llm, npc.name, npc.archetype),
                timeout=settings.agent_invoke_timeout_seconds,
            )
            loot_params["player_id"] = player_id
            actions.append({"kind": "give_item", "params": loot_params})
        except Exception:
            logger.warning("Loot generation timed out for %s", npc.npc_id)

    await world_state.apply_actions(actions)

    # Advance any kill objectives across the player's active quests. on_event
    # mutates the player (progress + reward payout) directly, so its actions are
    # appended for client feedback rather than re-applied via apply_actions.
    async with world_state._lock:
        player = world_state.get_player(player_id)
        player.kill_count += 1
        quest_actions = quest_progress.on_event(
            player,
            {"type": "enemy_killed", "archetype": npc.archetype, "name": npc.name},
        )
    actions.extend(quest_actions)
    return actions


def _basic_combat_reply(npc: NPCData, player_id: str) -> dict[str, Any]:
    """Build an instant combat reply (dialogue + actions) for an attacked NPC.

    No LLM involved — the response is chosen from the NPC's archetype profile so
    attacks resolve immediately. HP is applied by the caller via apply_actions.
    """
    profile = _COMBAT_PROFILES.get(npc.archetype, _PACIFIST_PROFILE)

    # The player's hit already landed; if it dropped the NPC, it gasps and falls.
    if npc.hp <= 0:
        npc.mood = "sad"
        return {"dialogue": random.choice(_DEFEAT_LINES), "actions": [], "mood": "sad"}

    actions: list[dict[str, Any]] = [{"kind": "emote", "params": {"animation": profile["emote"]}}]
    low, high = profile["damage"]
    if high > 0:
        amount = random.randint(low, high)
        actions.append(
            {
                "kind": "damage",
                "params": {
                    "target": "player",
                    "player_id": player_id,
                    "amount": amount,
                    "damageType": profile["type"],
                },
            }
        )
        if profile["effect"]:
            actions.append({"kind": "spawn_effect", "params": {"effectType": profile["effect"]}})

    npc.mood = profile["mood"]
    return {
        "dialogue": random.choice(profile["lines"]),
        "actions": actions,
        "mood": profile["mood"],
    }


def _score_attack_quality(
    prompt: str,
    inventory: list[str],
    equipped: dict[str, str | None] | None = None,
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

    # ── Equipped weapon bonus (always applies when attacking) ──────────
    if equipped:
        weapon = equipped.get("weapon")
        if weapon:
            multiplier += 0.6  # Having a weapon equipped is a big deal
            # Extra bonus if the player mentions their weapon by name
            if any(w in lower for w in weapon.lower().split()):
                multiplier += 0.4
        shield = equipped.get("shield")
        if shield:
            multiplier += 0.2  # Shield gives a small damage bonus too
        trinket = equipped.get("trinket")
        if trinket:
            multiplier += 0.15

    # Length bonus: more descriptive prompts are rewarded
    word_count = len(prompt.split())
    if word_count >= 8:
        multiplier += 0.3
    if word_count >= 15:
        multiplier += 0.3
    if word_count >= 25:
        multiplier += 0.2

    # Weapon mention bonus (generic weapon words)
    if words & WEAPON_KEYWORDS:
        multiplier += 0.3

    # Check if player mentions an inventory item by name
    for item in inventory:
        item_words = set(item.lower().split())
        if item_words & words:
            multiplier += 0.4
            break

    # Style keywords (creativity)
    style_matches = words & STYLE_KEYWORDS
    multiplier += min(len(style_matches) * 0.25, 0.75)

    # Humiliation / psychological attacks
    if {"humiliate", "taunt", "mock", "insult"} & words:
        multiplier += 0.5

    # Magic keywords → change damage type + higher multiplier
    magic_matches = words & MAGIC_KEYWORDS
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


def _auto_register_procedural_npc(
    ctx: HandlerContext,
    npc_id: str,
    name: str,
    personality_key: str,
    position: list[float] | None = None,
) -> None:
    """Register a procedurally spawned NPC in the world state and agent registry on first contact."""
    if ctx.world_state is None or ctx.registry is None:
        return

    from ...world.procedural_npcs import build_procedural_npc

    # A real world position is essential: nearby-broadcasts (combat sync, death,
    # overheard dialogue) measure from the NPC. Registering at the origin made
    # those broadcasts invisible to everyone actually standing at the fight.
    npc = build_procedural_npc(
        npc_id, name, personality_key, position if position is not None else [0.0, 0.0, 0.0]
    )
    ctx.world_state.npcs[npc_id] = npc
    ctx.registry.register_dynamic_npc(npc)
    logger.info(
        "Auto-registered procedural NPC %s (%s) with key '%s'", npc_id, name, personality_key
    )


async def _fast_combat_reaction(
    ctx: HandlerContext,
    player_id: str,
    npc_id: str,
    npc_name: str,
    npc_personality: str,
    resolution: CombatResolution,
    prompt: str,
    manager: ConnectionManager,
) -> None:
    """Send a fast NPC reaction using a single direct LLM call — no full pipeline.

    - NPC dialogue: one direct LLM call with a minimal prompt (≈1-2 s).
    - Counter-attack: computed deterministically from NPC max HP (no LLM needed).

    The player already received the damage action instantly. This follow-up
    delivers the NPC's voice and retaliation damage with minimum extra latency.
    """
    world_state = ctx.world_state
    if ctx.registry is None or world_state is None:
        return

    npc_data = world_state.get_npc(npc_id)
    if npc_data is None or npc_data.hp <= 0:
        return

    # Deterministic counter-attack: scales with NPC max HP so bosses hit harder
    counter_damage = max(3, random.randint(npc_data.max_hp // 15, npc_data.max_hp // 8))

    # Single direct LLM call — no tools, no pipeline, minimal prompt
    llm = ctx.registry._llm
    from langchain_core.messages import HumanMessage as _HumanMessage
    from langchain_core.messages import SystemMessage as _SystemMessage

    short_personality = npc_personality[:300].strip()
    system_text = (
        f"You are {npc_name}.\n{short_personality}\n\n"
        "The player just attacked you. React in ONE short, dramatic, in-character sentence. "
        "Do NOT break character. Do NOT explain or add commentary."
    )
    user_text = f'Player did: "{prompt}". Combat result: {resolution.combat_text}'

    try:
        response = await asyncio.wait_for(
            llm.ainvoke([_SystemMessage(content=system_text), _HumanMessage(content=user_text)]),
            timeout=12.0,
        )
        raw = response.content if isinstance(response.content, str) else ""
        dialogue = raw.strip() or random.choice(_COMBAT_FALLBACKS)
    except Exception:
        logger.warning("Fast combat reaction failed for NPC %s — using fallback", npc_id)
        dialogue = random.choice(_COMBAT_FALLBACKS)

    # Apply counter-attack to world state
    counter_actions: list[dict[str, Any]] = []
    if npc_data.hp > 0:
        counter_action: dict[str, Any] = {
            "kind": "damage",
            "params": {
                "target": "player",
                "amount": counter_damage,
                "damageType": "physical",
                "combatText": f"{npc_name} retaliates for {counter_damage} damage!",
            },
        }
        await world_state.apply_actions([counter_action])
        counter_actions.append(counter_action)

    # Re-fetch updated state
    npc_after = world_state.get_npc(npc_id)
    npc_state: dict[str, Any] = {}
    if npc_after is not None:
        npc_state = {"hp": npc_after.hp, "maxHp": npc_after.max_hp}

    player = world_state.get_player(player_id)
    player_update = player.to_dict() if player else None

    await manager.send_to(
        player_id,
        {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": dialogue,
            "actions": counter_actions,
            "playerStateUpdate": player_update,
            "npcStateUpdate": npc_state,
        },
    )

    # Broadcast to nearby players
    if npc_after is not None:
        if dialogue:
            await manager.broadcast_nearby(
                {
                    "type": "npc_dialogue",
                    "npcId": npc_id,
                    "npcName": npc_name,
                    # Tagging the attacker keeps the bark out of bystanders'
                    # chat panels — they see an overheard bubble instead.
                    "speakerPlayer": player_id,
                    "dialogue": dialogue,
                },
                origin=npc_after.position,
                radius=100.0,
                world_state=world_state,
                exclude=player_id,
            )
        bcast = [a for a in counter_actions if a.get("params", {}).get("target") != "player"]
        if bcast or npc_state:
            await manager.broadcast_nearby(
                {
                    "type": "npc_actions",
                    "npcId": npc_id,
                    "actions": bcast,
                    "npcStateUpdate": npc_state,
                },
                origin=npc_after.position,
                radius=200.0,
                world_state=world_state,
                exclude=player_id,
            )


async def _update_combat_memory_async(
    ctx: HandlerContext,
    player_id: str,
    npc_id: str,
    resolution: CombatResolution,
    prompt: str,
) -> None:
    """Run the full agent pipeline silently to update NPC memory and relationship score.

    The player already received their combat response from _fast_combat_reaction.
    This function persists the relationship penalty and mood change so future
    interactions reflect that the NPC was attacked — no further client message sent.
    """
    registry = ctx.registry
    world_state = ctx.world_state
    if registry is None or world_state is None:
        return

    player = world_state.get_player(player_id)
    player_dict = player.to_dict()
    player_dict["active_quests"] = player.active_quests
    player_dict["completed_quests"] = list(player.completed_quests)
    player_dict["kill_count"] = player.kill_count

    combat_prompt = (
        f"[COMBAT: {resolution.outcome} — "
        f"{resolution.final_damage} {resolution.damage_type} damage] "
        f"{prompt}"
    )

    lock = ctx.interaction_locks.setdefault(player_id, asyncio.Lock())
    try:
        async with lock, ctx.agent_semaphore:
            await asyncio.wait_for(
                registry.invoke(
                    npc_id=npc_id,
                    player_id=player_id,
                    prompt=combat_prompt,
                    player_state=player_dict,
                ),
                timeout=settings.agent_invoke_timeout_seconds,
            )
    except Exception:
        logger.debug("Background memory update timed out/failed for NPC %s", npc_id)


async def handle_interaction(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle a player→NPC interaction prompt (combat fast-path or LLM agent)."""
    registry = ctx.registry
    world_state = ctx.world_state

    npc_id = data.get("npcId", data.get("npc_id", "unknown"))
    npc_name = data.get("npcName") or "Unknown Creature"
    personality_key = data.get("personalityKey") or ""
    player_id = data.get("playerId", data.get("player_id")) or manager.get_player_id(websocket)
    prompt = str(data.get("prompt", data.get("text", ""))).strip()
    player_state_raw = data.get("playerState", data.get("player_state", {}))

    # Bug 10: Reject unregistered players instead of falling back to "default"
    if not player_id:
        return {"type": "error", "message": "Player not registered"}

    if registry is None or world_state is None:
        logger.warning("Handler called before initialization")
        return {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": "[System] The world is not yet ready.",
            "actions": [],
            "playerStateUpdate": None,
            "npcStateUpdate": None,
        }

    # Auto-register procedural NPCs on first interaction.
    # These are spawned client-side and the server has no prior record of them.
    if world_state.get_npc(npc_id) is None and npc_id.startswith(("proc_", "enc_")):
        npc_position_raw = data.get("npcPosition")
        npc_position: list[float] | None = None
        if isinstance(npc_position_raw, list) and len(npc_position_raw) >= 3:
            npc_position = [float(c) for c in npc_position_raw[:3]]
        elif isinstance(player_state_raw, dict):
            # Fallback: the interacting player is standing next to the NPC.
            pos = player_state_raw.get("position")
            if isinstance(pos, list) and len(pos) >= 3:
                npc_position = [float(c) for c in pos[:3]]
        _auto_register_procedural_npc(ctx, npc_id, npc_name, personality_key, npc_position)

    # Bug 6: Update player state under the world state lock (must happen first
    # so the dead-check below uses the client-synced HP, not stale server HP).
    player = world_state.get_player(player_id)
    if player_state_raw:
        updates = {
            key: player_state_raw[key]
            for key in _ALLOWED_PLAYER_FIELDS
            if key in player_state_raw and hasattr(player, key)
        }
        if updates:
            await world_state.update_player(player_id, updates)
        # Re-fetch player after lock-protected update
        player = world_state.get_player(player_id)

    # Bug 36: Dead players cannot interact (checked AFTER client HP sync)
    if player.hp <= 0:
        return {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": "[System] You are dead and cannot interact.",
            "actions": [],
            "playerStateUpdate": None,
            "npcStateUpdate": None,
        }

    # ── Resolve player attack (fast path — no LLM wait) ─────────────────
    player_damage_actions: list[dict[str, Any]] = []
    _combat_resolution: CombatResolution | None = None

    if is_attack_prompt(prompt):
        client_inventory = player_state_raw.get("inventory", []) if player_state_raw else []
        scoring_inventory = client_inventory if client_inventory else player.inventory
        client_equipped = player_state_raw.get("equipped", None) if player_state_raw else None

        npc = world_state.get_npc(npc_id)
        if npc:
            # Bug 35: Skip if NPC was already dead before this interaction
            if npc.hp <= 0:
                return {
                    "type": "agent_response",
                    "npcId": npc_id,
                    "dialogue": f"{npc.name} is already dead.",
                    "actions": [],
                    "playerStateUpdate": None,
                    "npcStateUpdate": {"hp": 0, "maxHp": npc.max_hp},
                }

            _combat_resolution = resolve_combat(
                prompt=prompt,
                player_level=player.level,
                player_inventory=scoring_inventory,
                player_equipped=client_equipped,
                npc_hp=npc.hp,
                npc_max_hp=npc.max_hp,
            )

            damage_action: dict[str, Any] = {
                "kind": "damage",
                "params": {
                    "target": npc_id,
                    "amount": _combat_resolution.final_damage,
                    "damageType": _combat_resolution.damage_type,
                    "outcome": _combat_resolution.outcome,
                    "isCrit": _combat_resolution.is_crit,
                    "combatText": _combat_resolution.combat_text,
                },
            }
            await world_state.apply_actions([damage_action])
            player_damage_actions.append(damage_action)

            # Visual effects from outcome
            for tag in _combat_resolution.visual_tags:
                player_damage_actions.append(
                    {
                        "kind": "spawn_effect",
                        "params": {
                            "effectType": tag,
                            "count": 40 if _combat_resolution.is_crit else 20,
                        },
                    }
                )

    # ── Fast-path: return immediately for combat, fire LLM narration async ──
    if _combat_resolution is not None:
        # Re-fetch NPC to get updated HP after apply_actions
        npc_after = world_state.get_npc(npc_id)
        npc_state: dict[str, Any] = {}
        if npc_after is not None:
            npc_state = {"hp": npc_after.hp, "maxHp": npc_after.max_hp}
            if npc_after.hp <= 0:
                player_damage_actions.append(
                    {
                        "kind": "spawn_effect",
                        "params": {"color": "#ff4400", "count": 50},
                    }
                )

    # ── Deliver the player's hit to the client immediately ──────────────
    # Combat must feel instant: the attack resolves and is sent right away,
    # then the agent's dialogue follows in the final response once the LLM
    # returns. The actions are cleared afterwards so the final response (and
    # nearby broadcast) don't apply them a second time.
    if player_damage_actions:
        attacked_npc = world_state.get_npc(npc_id)
        immediate_npc_state: dict[str, Any] | None = (
            {"hp": attacked_npc.hp, "maxHp": attacked_npc.max_hp} if attacked_npc else None
        )
        # Use `npc_actions` (not `agent_response`): the client applies the hit —
        # damage, HP, effects, attack animation — without clearing the "thinking"
        # indicator or adding an empty dialogue bubble. The dialogue arrives next.
        await websocket.send_json(
            {
                "type": "npc_actions",
                "npcId": npc_id,
                "actions": player_damage_actions,
                "npcStateUpdate": immediate_npc_state,
                # `self` marks this as the acting player's own hit so the client
                # logs "You strike…" + a damage number. Bystander broadcasts omit
                # it (they only need the visual sync, not the personal log).
                "self": True,
            }
        )
        # Let nearby players see the hit at the same time.
        if attacked_npc is not None:
            nearby_hit = [
                a
                for a in player_damage_actions
                if a.get("kind") in _BROADCAST_KINDS
                and a.get("params", {}).get("target") != "player"
            ]
            if nearby_hit:
                await manager.broadcast_nearby(
                    {
                        "type": "npc_actions",
                        "npcId": npc_id,
                        "actions": nearby_hit,
                        "npcStateUpdate": immediate_npc_state,
                    },
                    origin=list(attacked_npc.position),
                    radius=200.0,
                    world_state=world_state,
                    exclude=player_id,
                )
        # Fire memory update as a background task so it doesn't block the response.
        # Only do this when the NPC survived the hit (hp > 0) so dead NPCs don't
        # continue generating relationship updates.
        if _combat_resolution is not None:
            attacked_npc_for_mem = world_state.get_npc(npc_id)
            if attacked_npc_for_mem is not None and attacked_npc_for_mem.hp > 0:
                mem_task = asyncio.create_task(
                    _update_combat_memory_async(ctx, player_id, npc_id, _combat_resolution, prompt)
                )
                ctx.background_tasks.add(mem_task)
                mem_task.add_done_callback(ctx.background_tasks.discard)
        player_damage_actions = []

    # Build player state dict with quest data so agents can see quest progress
    player_dict = player.to_dict()
    player_dict["active_quests"] = player.active_quests
    player_dict["completed_quests"] = list(player.completed_quests)
    player_dict["kill_count"] = player.kill_count

    # ── Instant combat reply: attacks skip the LLM ──────────────────────
    # An attacked NPC fires back a deterministic, personality-based response
    # right away instead of waiting on the (slow) agent. Non-attack prompts
    # (talk, trade, quests) still go through the full LangGraph agent below.
    combat_npc = world_state.get_npc(npc_id)
    if is_attack_prompt(prompt) and combat_npc is not None:
        reply = _basic_combat_reply(combat_npc, player_id)
        if reply["actions"]:
            await world_state.apply_actions(reply["actions"])
        result = {
            "dialogue": reply["dialogue"],
            "actions": reply["actions"],
            "npcStateUpdate": {"mood": reply["mood"], "relationship_score": 0},
        }
    else:
        # Per-player lock + global semaphore:
        #   lock  → serializes rapid clicks from the same player (prevents double-damage)
        #   semaphore → caps total concurrent LLM calls (backpressure against API rate limits)
        lock = ctx.interaction_locks.setdefault(player_id, asyncio.Lock())
        async with lock, ctx.agent_semaphore:
            try:
                result = await asyncio.wait_for(
                    registry.invoke(
                        npc_id=npc_id,
                        player_id=player_id,
                        prompt=prompt,
                        player_state=player_dict,
                    ),
                    timeout=settings.agent_invoke_timeout_seconds,
                )
            except TimeoutError:
                logger.warning(
                    "Agent invocation timed out for npc_id=%s player_id=%s", npc_id, player_id
                )
                return {
                    "type": "agent_response",
                    "npcId": npc_id,
                    "dialogue": "The NPC seems distracted and doesn't respond...",
                    "actions": player_damage_actions,
                    "playerStateUpdate": None,
                    "npcStateUpdate": None,
                }
            except Exception:
                logger.exception("Agent invocation failed for NPC %s player %s", npc_id, player_id)
                return {
                    "type": "agent_response",
                    "npcId": npc_id,
                    "dialogue": "The NPC seems confused and doesn't respond.",
                    "actions": player_damage_actions,
                    "playerStateUpdate": None,
                    "npcStateUpdate": None,
                }

    # Merge player damage actions before agent actions
    all_actions = player_damage_actions + result.get("actions", [])

    # Talking to an NPC advances "talk"/"return to giver" objectives automatically.
    async with world_state._lock:
        talker = world_state.get_player(player_id)
        all_actions.extend(
            quest_progress.on_event(talker, {"type": "npc_talked", "target": npc_id})
        )

    # Check for NPC death
    npc = world_state.get_npc(npc_id)
    # Bug 11: Merge agent's npcStateUpdate with server HP instead of overwriting
    npc_state = result.get("npcStateUpdate") or {}
    if npc:
        npc_state = {**npc_state, "hp": npc.hp, "maxHp": npc.max_hp}
        if npc.hp <= 0:
            all_actions.append(
                {
                    "kind": "spawn_effect",
                    "params": {"color": "#ff4400", "count": 50},
                }
            )
            # Award gold + LLM-generated loot once per corpse.
            kill_rewards = await _build_kill_rewards(ctx, npc, player_id)
            all_actions.extend(kill_rewards)

    # Bug 19: Sync offer_item actions to server-side player inventory
    for action in all_actions:
        if action.get("kind") == "offer_item":
            item = action.get("params", {}).get("item", "")
            if item:
                async with world_state._lock:
                    player = world_state.get_player(player_id)
                    player.inventory.append(item)

    dialogue_text = result.get("dialogue", "...")

    # ── Broadcast the NPC's spoken reply to nearby players ────────────────
    # Only the NPC's side of a private interaction is audible in the world —
    # the player's typed prompt is private and is never broadcast. Receivers
    # render this as an overheard speech bubble, not a chat-panel entry
    # (the client gates on speakerPlayer != local player).
    npc_for_broadcast = world_state.get_npc(npc_id)
    if npc_for_broadcast is not None:
        npc_pos = npc_for_broadcast.position
        await manager.broadcast_nearby(
            {
                "type": "npc_dialogue",
                "npcId": npc_id,
                "npcName": npc_for_broadcast.name,
                "speakerPlayer": player_id,
                "dialogue": dialogue_text,
                "position": list(npc_pos),
            },
            origin=npc_pos,
            radius=100.0,
            world_state=world_state,
            exclude=player_id,
        )

    # ── Sync NPC position for move_npc actions ─────────────────────────────
    for action in all_actions:
        if action.get("kind") == "move_npc":
            pos = action.get("params", {}).get("position")
            npc = world_state.get_npc(npc_id)
            if npc and isinstance(pos, list) and len(pos) >= 3:
                async with world_state._lock:
                    npc.position = [float(pos[0]), float(pos[1]), float(pos[2])]

    # ── Broadcast NPC actions to nearby players (combat sync) ─────────────
    # Other players need to see NPC damage, movement, emotes, and HP changes.
    if npc_for_broadcast is not None:
        broadcast_actions = [
            a
            for a in all_actions
            if a.get("kind") in _BROADCAST_KINDS and a.get("params", {}).get("target") != "player"
        ]
        if broadcast_actions or npc_state:
            await manager.broadcast_nearby(
                {
                    "type": "npc_actions",
                    "npcId": npc_id,
                    "actions": broadcast_actions,
                    "npcStateUpdate": npc_state,
                },
                origin=list(npc_for_broadcast.position),
                radius=200.0,
                world_state=world_state,
                exclude=player_id,
            )

    # Don't send playerStateUpdate — let actions be the sole source of truth
    # on the client. This prevents double-application of HP/inventory changes.
    return {
        "type": "agent_response",
        "npcId": npc_id,
        "dialogue": dialogue_text,
        "actions": all_actions,
        "playerStateUpdate": None,
        "npcStateUpdate": npc_state,
    }
