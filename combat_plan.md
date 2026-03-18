# Combat System Implementation Plan

## Current State Summary

The existing codebase has basic combat scaffolding:

- **`server/src/agents/tools/combat.py`** provides `deal_damage`, `defend`, and `flee` tools. `deal_damage` mutates `world_state["player"]["hp"]` inside the tool closure and appends a `"damage"` action to `pending_actions`.
- **`server/src/world/world_state.py`** has `apply_actions()` that handles `damage_player`, `heal_player`, `damage_npc` action kinds, but the tools emit `"damage"` kind actions, not `"damage_player"` -- **this is a bug** preventing server-side authoritative HP tracking from working.
- **`client/src/systems/ReactionSystem.ts`** handles `"damage"` actions by calling `playerState.takeDamage()` and showing floating text + screen flash. There is no NPC health bar, no combat log, no combat state machine.
- **`client/src/state/PlayerState.ts`** tracks HP, maxHp, mana, maxMana, inventory. NPC HP is tracked in `NPCStateStore` but not displayed.
- NPC personalities (e.g., Ignathar) include behavior rules like "ATTACK with fire damage" but the LLM is unreliable at calling tools.

### Key Gaps

1. No turn-based combat loop -- combat is "fire and forget" per prompt.
2. No NPC HP tracking on the client that's visible to the player.
3. No combat initiation/termination protocol.
4. No death/defeat handling.
5. No loot system.
6. No player abilities beyond free-text prompts.
7. No status effects.
8. No roaming/aggro enemies.
9. The `deal_damage` tool emits `kind: "damage"` but `apply_actions` expects `kind: "damage_player"` -- damage never actually persists server-side.

---

## 1. Turn-Based Combat Flow

### 1.1 Combat State Machine (Server)

Add a new file `server/src/combat/combat_session.py`:

```python
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional

class CombatPhase(Enum):
    PLAYER_TURN = "player_turn"
    NPC_TURN = "npc_turn"
    RESOLVING = "resolving"
    ENDED = "ended"

@dataclass
class CombatSession:
    session_id: str
    player_id: str
    npc_id: str
    phase: CombatPhase = CombatPhase.PLAYER_TURN
    turn_number: int = 0
    player_hp_at_start: int = 100
    npc_hp_at_start: int = 100
    combat_log: list[dict] = field(default_factory=list)
    status_effects: dict[str, list[dict]] = field(default_factory=lambda: {"player": [], "npc": []})
    loot_table: list[dict] = field(default_factory=list)

    @property
    def is_active(self) -> bool:
        return self.phase != CombatPhase.ENDED
```

### 1.2 Combat Manager (Server)

Add `server/src/combat/manager.py` to track active sessions:

```python
class CombatManager:
    def __init__(self, world_state: WorldState):
        self._world_state = world_state
        self._sessions: dict[str, CombatSession] = {}  # keyed by "player_id:npc_id"

    def initiate_combat(self, player_id: str, npc_id: str) -> CombatSession:
        """Create a new combat session. Called when:
        1. Player types an aggressive prompt at a hostile NPC
        2. Player enters aggro range of a roaming enemy
        3. NPC personality triggers an attack
        """
        key = f"{player_id}:{npc_id}"
        player = self._world_state.get_player(player_id)
        npc = self._world_state.get_npc(npc_id)
        session = CombatSession(
            session_id=key,
            player_id=player_id,
            npc_id=npc_id,
            player_hp_at_start=player.hp,
            npc_hp_at_start=npc.hp,
            loot_table=self._get_loot_table(npc_id),
        )
        self._sessions[key] = session
        return session

    def get_session(self, player_id: str, npc_id: str) -> CombatSession | None:
        return self._sessions.get(f"{player_id}:{npc_id}")

    def end_combat(self, session: CombatSession, reason: str) -> dict:
        """End combat and return result dict with loot if applicable."""
        session.phase = CombatPhase.ENDED
        result = {"reason": reason, "loot": []}
        if reason == "npc_defeated":
            result["loot"] = self._roll_loot(session.loot_table)
        del self._sessions[session.session_id]
        return result
```

### 1.3 Combat Initiation

Combat begins through one of these triggers:

1. **Player prompt detection**: In `handle_message`, before invoking the agent, check if the player's prompt contains aggressive intent (a lightweight classifier or keyword check). If the target NPC is hostile, start a `CombatSession`.
2. **Agent tool call**: If the NPC agent calls `deal_damage`, and no combat session exists, automatically create one.
3. **Proximity aggro**: When `player_move` messages arrive, check if the player is within aggro range of any hostile NPC (see Section 4).

### 1.4 Turn Progression

```
Player types prompt -> Server receives "interaction" message
  |
  v
If combat session exists for this player+NPC pair:
  1. Set phase = RESOLVING
  2. Parse player intent (attack, defend, ability, flee, talk)
  3. Apply player action to NPC (reduce NPC HP, apply effects)
  4. Check if NPC is defeated (HP <= 0) -> end combat, drop loot
  5. Set phase = NPC_TURN
  6. Invoke NPC agent with combat-enriched system prompt
  7. Agent calls tools (deal_damage, defend, flee)
  8. Apply NPC action to player
  9. Check if player is defeated (HP <= 0) -> trigger death
  10. Set phase = PLAYER_TURN
  11. Send full combat state update to client
```

### 1.5 Fix the Action Kind Mismatch

In `server/src/agents/tools/combat.py`, the `deal_damage` tool appends `kind: "damage"` but `WorldState.apply_actions()` checks for `kind: "damage_player"` and `kind: "damage_npc"`. Fix by changing the tool to emit the correct kinds:

```python
@tool
def deal_damage(target: str, amount: int, damage_type: str = "physical") -> str:
    if target == "player":
        pending_actions.append({
            "kind": "damage_player",
            "params": {
                "player_id": world_state.get("player_id", "default"),
                "amount": amount,
                "damageType": damage_type,
            },
        })
    else:
        pending_actions.append({
            "kind": "damage_npc",
            "params": {
                "npc_id": target,
                "amount": amount,
                "damageType": damage_type,
            },
        })
    # Also emit a client-side visual action
    pending_actions.append({
        "kind": "damage",
        "params": {"target": target, "amount": amount, "damageType": damage_type},
    })
    return f"Dealt {amount} {damage_type} damage to {target}"
```

### 1.6 Death/Defeat Handling

**When NPC HP reaches 0:**
- End the combat session.
- Roll loot from the NPC's loot table.
- Send a `"combat_end"` action to the client with loot data.
- Optionally mark NPC as "defeated" in world state (respawn timer).
- NPC's final dialogue should reflect defeat.

**When Player HP reaches 0:**
- End the combat session.
- Send a `"player_death"` action to the client.
- Apply respawn mechanics (see Section 8).

---

## 2. Combat UI

### 2.1 Health Bars

Add a new component `client/src/ui/CombatHUD.ts`:

```typescript
export class CombatHUD {
  private container: HTMLDivElement;
  private playerHPBar: HTMLDivElement;
  private npcHPBar: HTMLDivElement;
  private npcNameLabel: HTMLDivElement;
  private combatLog: HTMLDivElement;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "combat-hud";
    this.container.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      display: none; flex-direction: column; align-items: center; gap: 8px;
      z-index: 50; font-family: 'Cinzel', serif;
    `;
    // Build player HP bar (green), NPC HP bar (red), labels
    // ...
    document.body.appendChild(this.container);
  }

  show(npcName: string, npcHP: number, npcMaxHP: number): void {
    this.container.style.display = "flex";
    this.npcNameLabel.textContent = npcName;
    this.updateNPCHP(npcHP, npcMaxHP);
  }

  hide(): void { this.container.style.display = "none"; }

  updatePlayerHP(hp: number, maxHP: number): void {
    const pct = Math.max(0, hp / maxHP * 100);
    this.playerHPBar.style.width = `${pct}%`;
  }

  updateNPCHP(hp: number, maxHP: number): void {
    const pct = Math.max(0, hp / maxHP * 100);
    this.npcHPBar.style.width = `${pct}%`;
  }

  addLogEntry(text: string, color: string): void {
    const entry = document.createElement("div");
    entry.textContent = text;
    entry.style.color = color;
    this.combatLog.appendChild(entry);
    this.combatLog.scrollTop = this.combatLog.scrollHeight;
  }
}
```

### 2.2 Combat Log

A scrollable log panel showing:
- `"You attack Ignathar for 25 fire damage!"`
- `"Ignathar attacks you for 40 fire damage!"`
- `"You are poisoned! (-5 HP per turn)"`
- `"Ignathar is defeated! Loot: Ember Crown"`

The combat log should be fed by the `ReactionSystem` when processing combat-related actions. Add a new action kind `"combat_log_entry"` that the server can emit.

### 2.3 Action Feedback

Extend `ReactionSystem.processAction()` with new cases:

```typescript
case "combat_start": {
  this.combatHUD.show(p.npcName, p.npcHP, p.npcMaxHP);
  this.combatHUD.addLogEntry(`Combat with ${p.npcName} begins!`, "#ffcc00");
  break;
}
case "combat_end": {
  this.combatHUD.hide();
  if (p.reason === "npc_defeated") {
    this.combatHUD.addLogEntry(`${p.npcName} is defeated!`, "#33ff66");
  }
  break;
}
case "player_death": {
  this.combatHUD.hide();
  this.showDeathScreen();
  break;
}
```

---

## 3. Enemy AI Improvements

This is the most critical section. The current system relies entirely on the LLM choosing to call tools, which is unreliable.

### 3.1 Better System Prompts

The current system prompt in `reason.py` has generic instructions. Improve it for combat contexts:

```python
def _build_system_prompt(state: NPCAgentState) -> str:
    # ... existing personality and context ...

    # Add combat-specific instructions when in combat
    if state.get("in_combat"):
        parts.append("")
        parts.append("## COMBAT MODE -- MANDATORY TOOL USE")
        parts.append("You are currently IN COMBAT with the player.")
        parts.append("You MUST call exactly ONE of these tools on EVERY response:")
        parts.append("- deal_damage(target='player', amount=<int>, damage_type=<str>)")
        parts.append("- defend(stance=<str>)")
        parts.append("- flee(direction=<str>)")
        parts.append("")
        parts.append("Do NOT respond with just dialogue. You MUST use a tool.")
        parts.append("After calling the tool, you may add a SHORT in-character combat quip.")
    return "\n".join(parts)
```

### 3.2 Constrained Outputs / Forced Tool Use

Add a fallback mechanism in the `act` node. If the LLM was supposed to call a tool but didn't (detectable when `in_combat` is True but no `tool_calls` on the AI message), force a default action:

```python
# In act_node or a new "combat_fallback" node:
async def combat_fallback_node(state: NPCAgentState) -> dict:
    """If the LLM didn't call a tool during combat, force a default attack."""
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", [])

    if state.get("in_combat") and not tool_calls:
        # Force a default attack
        npc_personality = state.get("npc_personality", "")
        if "fire" in npc_personality.lower():
            damage_type = "fire"
            amount = random.randint(15, 30)
        else:
            damage_type = "physical"
            amount = random.randint(10, 20)

        pending_actions = list(state.get("pending_actions", []))
        pending_actions.append({
            "kind": "damage",
            "params": {"target": "player", "amount": amount, "damageType": damage_type},
        })
        return {
            "pending_actions": pending_actions,
            "response_text": state.get("response_text", "The enemy strikes!"),
        }
    return {}
```

### 3.3 Modified Graph for Combat

Update `npc_agent.py` to add the fallback edge:

```python
def _should_act_or_respond(state: NPCAgentState) -> str:
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", [])
    if tool_calls:
        return "act"
    if state.get("in_combat"):
        return "combat_fallback"  # Force tool use
    return "respond"
```

### 3.4 Two-Call Strategy for Reliability

For critical combat interactions, use a two-step LLM approach:

1. **Step 1 (structured)**: Ask the LLM to output ONLY a JSON action decision, using `response_format={"type": "json_object"}` or LangChain's `with_structured_output()`.
2. **Step 2 (narrative)**: Ask the LLM to narrate the action in character.

This separates the mechanical decision from the creative writing, improving tool-use reliability.

```python
from pydantic import BaseModel

class CombatDecision(BaseModel):
    action: str  # "attack", "defend", "flee"
    target: str  # "player" or NPC id
    amount: int  # damage amount or 0
    damage_type: str  # "physical", "fire", etc.

# In the reason node, when in combat:
decision_llm = llm.with_structured_output(CombatDecision)
decision = await decision_llm.ainvoke([system_msg, user_msg])
# Then map decision -> tool call programmatically
```

---

## 4. Roaming Enemies

### 4.1 Patrol System (Server)

Add `server/src/combat/patrol.py`:

```python
import asyncio
import math

class PatrolSystem:
    """Runs a background loop that moves hostile NPCs along patrol routes."""

    def __init__(self, world_state: WorldState, broadcast_fn):
        self._world_state = world_state
        self._broadcast = broadcast_fn
        self._routes: dict[str, list[list[float]]] = {}
        self._running = False

    def register_patrol(self, npc_id: str, waypoints: list[list[float]]):
        self._routes[npc_id] = waypoints

    async def run(self, interval: float = 2.0):
        self._running = True
        waypoint_indices: dict[str, int] = {nid: 0 for nid in self._routes}

        while self._running:
            await asyncio.sleep(interval)
            for npc_id, waypoints in self._routes.items():
                npc = self._world_state.get_npc(npc_id)
                if not npc or npc.hp <= 0:
                    continue

                idx = waypoint_indices[npc_id]
                target = waypoints[idx]
                # Move NPC toward target waypoint
                dx = target[0] - npc.position[0]
                dz = target[2] - npc.position[2]
                dist = math.sqrt(dx*dx + dz*dz)

                if dist < 2.0:
                    waypoint_indices[npc_id] = (idx + 1) % len(waypoints)
                else:
                    speed = 3.0  # units per tick
                    npc.position[0] += (dx / dist) * min(speed, dist)
                    npc.position[2] += (dz / dist) * min(speed, dist)

                # Broadcast position update to clients
                await self._broadcast({
                    "type": "npc_move",
                    "npcId": npc_id,
                    "position": list(npc.position),
                })
```

### 4.2 Aggro Range Detection

In the `_handle_player_move` handler, after updating player position, check proximity to hostile NPCs:

```python
async def _handle_player_move(data: dict) -> dict:
    player_id = data.get("playerId", "default")
    position = data.get("position", [0.0, 0.0, 0.0])

    if _world_state is not None:
        await _world_state.update_player(player_id, {"position": position})

        # Check aggro ranges
        for npc_id, npc in _world_state.npcs.items():
            if npc.hp <= 0:
                continue
            dx = position[0] - npc.position[0]
            dz = position[2] - npc.position[2]
            dist = (dx*dx + dz*dz) ** 0.5

            npc_personality = NPC_PERSONALITIES.get(npc_id, {})
            if npc_personality.get("archetype") == "hostile_boss" and dist < 30.0:
                # Initiate combat if not already in combat
                session = _combat_manager.get_session(player_id, npc_id)
                if session is None:
                    session = _combat_manager.initiate_combat(player_id, npc_id)
                    return {
                        "type": "combat_start",
                        "npcId": npc_id,
                        "npcName": npc.name,
                        "npcHP": npc.hp,
                        "npcMaxHP": 500,
                    }

    return {"type": "ack", "status": "ok"}
```

### 4.3 New Enemy Types to Add

Define new hostile NPCs in `NPC_PERSONALITIES` and `NPC_DEFINITIONS`:

| NPC ID | Name | Zone | HP | Behavior | Aggro Range |
|--------|------|------|----|----------|-------------|
| `bandit_01` | Shadow Bandit | Dark Forest | 60 | Patrols forest path, attacks on sight | 20 |
| `bandit_02` | Shadow Bandit Scout | Dark Forest | 45 | Patrols, flees at low HP | 25 |
| `golem_01` | Crystal Golem | Crystal Lake | 150 | Guards the lake shore, slow but hard-hitting | 15 |
| `wolf_01` | Dire Wolf | Wilderness | 40 | Pack hunter, low damage but fast | 30 |
| `fire_spirit_01` | Fire Spirit | Ember Peaks | 80 | Ranged fire attacker near the dragon | 25 |

---

## 5. Loot System

### 5.1 Loot Tables

Add `server/src/combat/loot.py`:

```python
import random

LOOT_TABLES: dict[str, list[dict]] = {
    "dragon_01": [
        {"item": "Ember Crown", "chance": 0.1, "type": "legendary"},
        {"item": "Dragon Scale", "chance": 0.5, "type": "material"},
        {"item": "Fire Ruby", "chance": 0.3, "type": "gem"},
        {"item": "Gold (500)", "chance": 1.0, "type": "currency"},
    ],
    "bandit_01": [
        {"item": "Stolen Gold (25)", "chance": 0.8, "type": "currency"},
        {"item": "Bandit's Dagger", "chance": 0.3, "type": "weapon"},
        {"item": "Health Potion", "chance": 0.2, "type": "consumable"},
    ],
    "golem_01": [
        {"item": "Crystal Shard", "chance": 0.6, "type": "material"},
        {"item": "Stone Shield", "chance": 0.15, "type": "armor"},
        {"item": "Mana Crystal", "chance": 0.4, "type": "consumable"},
    ],
    "wolf_01": [
        {"item": "Wolf Pelt", "chance": 0.7, "type": "material"},
        {"item": "Fang Necklace", "chance": 0.1, "type": "accessory"},
    ],
    "fire_spirit_01": [
        {"item": "Flame Essence", "chance": 0.5, "type": "material"},
        {"item": "Scroll of Fireball", "chance": 0.15, "type": "consumable"},
    ],
}

def roll_loot(npc_id: str) -> list[str]:
    table = LOOT_TABLES.get(npc_id, [])
    drops = []
    for entry in table:
        if random.random() < entry["chance"]:
            drops.append(entry["item"])
    return drops if drops else ["Gold (10)"]  # Guaranteed minimum
```

### 5.2 Client Loot Display

Add a loot popup to `ReactionSystem`:

```typescript
case "loot_drop": {
  const items: string[] = p.items ?? [];
  this.showLootPopup(items);
  for (const item of items) {
    this.playerState.addItem(item);
  }
  break;
}
```

---

## 6. Player Abilities

### 6.1 Ability Definitions

The player types natural language, but certain keywords should map to mechanical effects. Add `server/src/combat/abilities.py`:

```python
PLAYER_ABILITIES: dict[str, dict] = {
    "fireball": {
        "keywords": ["fireball", "fire ball", "flame blast"],
        "damage": 35,
        "damage_type": "fire",
        "mana_cost": 20,
        "description": "A blazing sphere of fire",
        "effect": "spawn_effect",
        "effect_type": "fire",
    },
    "heal": {
        "keywords": ["heal", "healing", "cure", "restore health"],
        "heal_amount": 30,
        "mana_cost": 15,
        "description": "A soothing wave of restoration",
        "effect": "spawn_effect",
        "effect_type": "holy_light",
    },
    "shield": {
        "keywords": ["shield", "block", "defend", "guard"],
        "damage_reduction": 0.5,  # 50% reduction for this turn
        "mana_cost": 10,
        "duration_turns": 1,
        "description": "A magical barrier absorbs incoming damage",
        "effect": "spawn_effect",
        "effect_type": "sparkle",
    },
    "ice_lance": {
        "keywords": ["ice lance", "frost", "freeze", "ice"],
        "damage": 25,
        "damage_type": "ice",
        "mana_cost": 15,
        "status_effect": "freeze",
        "description": "A shard of crystallized frost",
        "effect": "spawn_effect",
        "effect_type": "ice",
    },
    "lightning": {
        "keywords": ["lightning", "thunder", "shock", "bolt"],
        "damage": 30,
        "damage_type": "lightning",
        "mana_cost": 18,
        "description": "A crackling bolt from the heavens",
        "effect": "spawn_effect",
        "effect_type": "lightning",
    },
}

def detect_ability(prompt: str) -> dict | None:
    """Check if the player's prompt contains an ability keyword."""
    prompt_lower = prompt.lower()
    for ability_name, ability in PLAYER_ABILITIES.items():
        for keyword in ability["keywords"]:
            if keyword in prompt_lower:
                return {"name": ability_name, **ability}
    return None
```

### 6.2 Ability Resolution in Handler

Before passing the prompt to the NPC agent during combat, detect and resolve player abilities:

```python
ability = detect_ability(prompt)
if ability and combat_session:
    player = world_state.get_player(player_id)
    if player.mana < ability.get("mana_cost", 0):
        # Not enough mana -- tell client
        return {"type": "agent_response", "dialogue": "Not enough mana!", ...}

    player.mana -= ability["mana_cost"]

    if "damage" in ability:
        npc = world_state.get_npc(npc_id)
        npc.hp = max(0, npc.hp - ability["damage"])

    if "heal_amount" in ability:
        player.hp = min(player.max_hp, player.hp + ability["heal_amount"])

    if "status_effect" in ability:
        combat_session.status_effects["npc"].append({
            "type": ability["status_effect"],
            "duration": 3,
        })
```

---

## 7. Status Effects

### 7.1 Effect Definitions

```python
STATUS_EFFECTS: dict[str, dict] = {
    "poison": {
        "damage_per_turn": 5,
        "damage_type": "physical",
        "duration": 3,
        "description": "Taking poison damage",
    },
    "burn": {
        "damage_per_turn": 8,
        "damage_type": "fire",
        "duration": 2,
        "description": "Burning!",
    },
    "freeze": {
        "skip_turn_chance": 0.5,
        "damage_per_turn": 3,
        "damage_type": "ice",
        "duration": 2,
        "description": "Frozen! May skip turn",
    },
    "shield": {
        "damage_reduction": 0.5,
        "duration": 1,
        "description": "Shielded -- damage reduced by 50%",
    },
    "blessed": {
        "damage_bonus": 1.25,
        "duration": 3,
        "description": "Blessed -- damage increased by 25%",
    },
}
```

### 7.2 Effect Processing

At the start of each combat turn, process active status effects:

```python
def process_status_effects(session: CombatSession, world_state: WorldState) -> list[dict]:
    """Apply tick damage/effects and decrement durations. Returns action list for client."""
    actions = []

    for target in ["player", "npc"]:
        remaining = []
        for effect in session.status_effects[target]:
            effect_def = STATUS_EFFECTS[effect["type"]]

            if "damage_per_turn" in effect_def:
                amount = effect_def["damage_per_turn"]
                if target == "player":
                    player = world_state.get_player(session.player_id)
                    player.hp = max(0, player.hp - amount)
                else:
                    npc = world_state.get_npc(session.npc_id)
                    npc.hp = max(0, npc.hp - amount)

                actions.append({
                    "kind": "damage",
                    "params": {"target": target, "amount": amount, "damageType": effect_def["damage_type"]},
                })
                actions.append({
                    "kind": "combat_log_entry",
                    "params": {"text": f"{target.title()} takes {amount} {effect_def['damage_type']} damage from {effect['type']}!"},
                })

            effect["duration"] -= 1
            if effect["duration"] > 0:
                remaining.append(effect)

        session.status_effects[target] = remaining

    return actions
```

### 7.3 NPC Status Effect Tools

Add a new tool to `combat.py` so the NPC agent can apply status effects:

```python
@tool
def apply_status_effect(target: str, effect_type: str) -> str:
    """Apply a status effect to a target. Use during combat for debuffs.

    Args:
        target: "player" or an NPC id.
        effect_type: One of "poison", "burn", "freeze".
    """
    pending_actions.append({
        "kind": "apply_status",
        "params": {"target": target, "effectType": effect_type},
    })
    return f"Applied {effect_type} to {target}"
```

---

## 8. Respawn Mechanics

### 8.1 Player Death

When the player's HP reaches 0:

1. **Server** sends a `"player_death"` action to the client.
2. **Client** displays a death screen overlay with:
   - "You have been defeated" message
   - A "Respawn" button
   - Optional: "You lost: [list of gold/items]" (death penalty)
3. **On respawn**, the client sends a `"respawn"` message to the server.
4. **Server** resets player HP to `max_hp`, mana to `max_mana`, and teleports the player to a safe spawn point (village center: `[0, 0, 0]`).
5. Any active combat sessions involving this player are ended.

```python
# In handler.py
async def _handle_respawn(data: dict) -> dict:
    player_id = data.get("playerId", "default")
    player = _world_state.get_player(player_id)
    player.hp = player.max_hp
    player.mana = player.max_mana
    player.position = [0.0, 0.0, 0.0]

    # End any active combat
    _combat_manager.end_all_for_player(player_id)

    return {
        "type": "respawn",
        "playerState": player.to_dict(),
        "spawnPosition": [0.0, 0.0, 0.0],
    }
```

### 8.2 NPC Respawn

When a non-boss NPC is defeated:

1. Mark the NPC as defeated (`hp = 0`).
2. Start a respawn timer (e.g., 60 seconds for normal enemies, 300 seconds for bosses).
3. After the timer, reset NPC HP and position to defaults.
4. Broadcast the NPC's return to all connected clients.

```python
async def schedule_npc_respawn(npc_id: str, delay: float = 60.0):
    await asyncio.sleep(delay)
    npc_def = NPC_DEFINITIONS[npc_id]
    npc = world_state.get_npc(npc_id)
    npc.hp = npc_def.get("initial_hp", 100)
    npc.position = list(npc_def["position"])
    await broadcast({"type": "npc_respawn", "npcId": npc_id, "position": list(npc.position)})
```

### 8.3 Death Penalties (Optional Progression)

- **Gold loss**: Player loses 10% of gold on death.
- **No item loss**: Equipment is retained (keeps frustration low).
- **XP debt**: Optional -- player needs extra XP to next level.

---

## Implementation Priority and Order

| Phase | Items | Effort | Dependencies |
|-------|-------|--------|-------------|
| **Phase 1** | Fix action kind mismatch bug, add `in_combat` flag to agent state, improve combat system prompts, add combat fallback node | Small | None |
| **Phase 2** | Combat session manager, turn-based flow, player ability detection, combat HUD | Medium | Phase 1 |
| **Phase 3** | Status effects, loot system, death/respawn | Medium | Phase 2 |
| **Phase 4** | Roaming enemies, patrol system, aggro detection, new NPC definitions | Large | Phase 2 |
| **Phase 5** | Two-call LLM strategy, structured output for combat decisions | Medium | Phase 2 |

### Estimated Timeline

- **Phase 1**: 1-2 days (critical bug fix + prompt improvements)
- **Phase 2**: 3-5 days (core combat loop)
- **Phase 3**: 2-3 days (effects and loot)
- **Phase 4**: 3-4 days (AI enemies)
- **Phase 5**: 2-3 days (LLM reliability)

---

## New Files to Create

```
server/src/combat/
  __init__.py
  combat_session.py    # CombatSession dataclass, CombatPhase enum
  manager.py           # CombatManager class
  abilities.py         # Player ability definitions and detection
  loot.py              # Loot tables and roll logic
  status_effects.py    # Status effect definitions and processing
  patrol.py            # PatrolSystem for roaming enemies

client/src/ui/
  CombatHUD.ts         # Health bars, combat log overlay
  DeathScreen.ts       # Death overlay with respawn button
  LootPopup.ts         # Loot drop popup display
```

## Files to Modify

```
server/src/agents/tools/combat.py       # Fix action kinds, add apply_status_effect tool
server/src/agents/nodes/reason.py       # Combat-enriched system prompt
server/src/agents/npc_agent.py          # Add combat_fallback node and edge
server/src/agents/agent_state.py        # Add in_combat, combat_session_id fields
server/src/agents/registry.py           # Pass combat context to agent
server/src/world/world_state.py         # NPC respawn timer, combat state tracking
server/src/world/npc_definitions.py     # Add new enemy NPCs
server/src/agents/personalities/templates.py  # Add new enemy personalities
server/src/ws/handler.py                # Combat initiation, ability resolution, respawn handler
server/src/ws/protocol.py               # New message types
server/src/main.py                      # Initialize CombatManager, PatrolSystem

client/src/systems/ReactionSystem.ts    # New action handlers (combat_start, combat_end, loot, death)
client/src/network/MessageProtocol.ts   # New action kinds and message types
client/src/state/PlayerState.ts         # Mana consumption methods
```
