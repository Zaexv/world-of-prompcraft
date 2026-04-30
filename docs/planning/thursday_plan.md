---
date: 2026-03-19
git_commit: d509c9a
branch: main
topic: "Dungeon System, Quest System, Zone Display & El Tito Quest Line"
tags: [plan, dungeons, quests, zones, ui, performance, el-tito]
status: draft
---

# Dungeon System, Quest System, Zone Display & El Tito Quest Line

## Overview

Implement four interconnected systems for World of Promptcraft:
1. **Dungeon System** — explorable dungeon instances with enemies and loot
2. **Quest System with UI** — persistent quest log panel, trackable & completable quests (3 quests)
3. **El Tito's Sacred Artifact Quest** — find the Mechero Ancestral to activate El Tito's artifact of wisdom
4. **Zone Display System** — WoW-style zone name popup + zone-based performance optimization

## Current State Analysis

### What Exists
- **Zones**: Server has 9 zones in `server/src/world/zones.py` with bounding boxes and `get_zone(position)`
- **Cave entrances**: `WorldGenerator` spawns cave entrance meshes (~5% of chunks) — cosmetic only, no interior
- **Quest actions**: `start_quest` and `complete_quest` exist in `dialogue.py` tools, but only trigger a 3s banner — **no persistent quest state**
- **El Tito NPC**: `eltito_01` with stoner personality, 420 HP, at (18, 0, -35)
- **Chunk system**: Terrain loads/unloads chunks in `VIEW_RADIUS` of 5 (320 units). Trees, NPCs, caves, towns via `WorldGenerator`

### Key Discoveries
- Quest banner in `ReactionSystem.ts:484-520` is purely visual (no state tracking)
- `PlayerState` (client) and `PlayerData` (server) have no quest fields
- `WorldGenerator` has deterministic `chunkHash()` — reusable for dungeon placement
- `InteractionPanel` action buttons are hardcoded per NPC in `main.ts`
- No zone tracking on client — zones are server-only for NPC context

## Desired End State

1. Press **L** to open quest log showing active/completed quests with objectives
2. Compact quest tracker always visible on right side of screen
3. El Tito gives "The Sacred Flame" quest: find the Mechero Ancestral in a dungeon
4. 3 quests: El Tito's + Elyria's Crystal Tear + Aldric's Village Patrol
5. Dungeon entrances at cave locations — press E to enter enclosed dungeon
6. Dungeons have enemies and a loot chest with quest items
7. Zone name displays when crossing zone boundaries (WoW-style)
8. Zone-aware chunk loading for performance

## What We're NOT Doing

- No instanced multiplayer dungeons — single-player zones
- No dungeon procedural generation — hand-crafted enclosed rooms
- No quest persistence across sessions — resets on reload
- No minimap dungeon maps — only entrance markers
- No quest abandonment UI — auto-track once accepted

---

# Agent Architecture: 10-Agent Parallel Plan

## Dependency Graph

```
                    ┌─────────────────────┐
                    │  AGENT 1            │
                    │  Quest Data         │
                    │  Contracts          │
                    │  (shared types)     │
                    └────────┬────────────┘
                             │
          ┌──────────────────┼──────────────────────┐
          │                  │                       │
          ▼                  ▼                       ▼
  ┌───────────────┐  ┌──────────────┐   ┌───────────────────┐
  │  AGENT 2      │  │  AGENT 3     │   │  AGENT 9          │
  │  Server Quest │  │  Client      │   │  Server NPC       │
  │  State        │  │  Quest State │   │  Tools &          │
  │               │  │              │   │  Personalities    │
  └───────┬───────┘  └──────┬───────┘   └─────────┬─────────┘
          │                  │                     │
          │           ┌──────┴──────┐              │
          │           │             │              │
          ▼           ▼             ▼              │
  ┌──────────────┐ ┌──────────┐ ┌──────────┐     │
  │  AGENT 7     │ │ AGENT 4  │ │ AGENT 5  │     │
  │  Server      │ │ Quest    │ │ Quest    │     │
  │  Handler &   │ │ Log UI   │ │ Tracker  │     │
  │  Protocol    │ │ Panel    │ │ Widget   │     │
  └──────────────┘ └──────────┘ └──────────┘     │
                                                  │
  ┌──────────────┐  ┌──────────────┐              │
  │  AGENT 6     │  │  AGENT 8     │              │
  │  Zone System │  │  Dungeon     │              │
  │  (display +  │  │  Interior    │              │
  │   tracker)   │  │  Scene       │              │
  └──────┬───────┘  └──────┬───────┘              │
         │                 │                      │
         │    ┌────────────┼──────────────────────┘
         │    │            │
         ▼    ▼            ▼
     ┌────────────────────────┐
     │  AGENT 10              │
     │  Integration &         │
     │  Wiring                │
     │  (main.ts, UIManager,  │
     │   ReactionSystem,      │
     │   DungeonSystem,       │
     │   WorldGenerator)      │
     └────────────────────────┘
```

## Execution Waves

| Wave | Agents | Can start when |
|------|--------|----------------|
| **Wave 1** | Agent 1, Agent 6, Agent 8 | Immediately (no deps) |
| **Wave 2** | Agent 2, Agent 3, Agent 9 | After Agent 1 |
| **Wave 3** | Agent 4, Agent 5, Agent 7 | After Agent 2 + Agent 3 |
| **Wave 4** | Agent 10 | After ALL agents 2-9 |

> Agents within the same wave run **fully in parallel**. Each agent owns exclusive files — no merge conflicts possible.

---

## Shared Interfaces Contract

All agents MUST use these exact interfaces. Agent 1 creates the canonical files; other agents import from them.

### Action Kinds (server → client via WebSocket)
```typescript
// Existing actions remain unchanged. New additions:
"start_quest"        // params: { questId: string, quest: string }
"advance_objective"  // params: { questId: string, objectiveId: string, description?: string }
"complete_quest"     // params: { questId: string, quest: string, reward?: string }
```

### WebSocket Message Types (client → server)
```typescript
"dungeon_enter"   // { type: "dungeon_enter", dungeonId: string, playerId: string }
"dungeon_exit"    // { type: "dungeon_exit", dungeonId: string, playerId: string, loot: string[] }
"quest_update"    // { type: "quest_update", questId: string, objectiveId: string, playerId: string }
```

---

## Agent 1: Quest Data Contracts (Shared Types & Definitions)

**Purpose**: Create the canonical quest/dungeon data definitions that ALL other agents import.

**Owns these files (creates NEW):**
- `server/src/world/quest_definitions.py`
- `client/src/state/QuestDefinitions.ts`
- `client/src/scene/DungeonConfig.ts`

**Dependencies**: None (Wave 1)

### Tasks:

#### [ ] 1.1 Server Quest Definitions
**File**: `server/src/world/quest_definitions.py` (NEW)

```python
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class QuestObjective:
    """A single trackable objective within a quest."""

    id: str
    description: str
    type: str  # "enter_dungeon", "collect_item", "talk_npc", "kill_enemies"
    target: str  # dungeon_id, item_name, npc_id, or count as string
    completed: bool = False


@dataclass
class QuestDefinition:
    """Static definition of a quest (template, not instance)."""

    id: str
    name: str
    description: str
    giver_npc: str
    objectives: list[QuestObjective] = field(default_factory=list)
    reward_item: str = ""
    reward_description: str = ""
    required_level: int = 1


QUEST_DEFINITIONS: dict[str, QuestDefinition] = {
    "sacred_flame": QuestDefinition(
        id="sacred_flame",
        name="The Sacred Flame",
        description=(
            "El Tito possesses an ancient artifact of immense wisdom — el porro "
            "ancestral — but it lies dormant. Find the Mechero Ancestral, a sacred "
            "lighter from the ancient world, hidden in the Ember Depths dungeon. "
            "Only its sacred fire can awaken the artifact's power."
        ),
        giver_npc="eltito_01",
        objectives=[
            QuestObjective(
                "enter_ember_depths",
                "Enter the Ember Depths",
                "enter_dungeon",
                "ember_depths",
            ),
            QuestObjective(
                "find_mechero",
                "Find the Mechero Ancestral",
                "collect_item",
                "Mechero Ancestral",
            ),
            QuestObjective(
                "return_tito",
                "Return to El Tito",
                "talk_npc",
                "eltito_01",
            ),
        ],
        reward_item="Artifact of Ancient Wisdom",
        reward_description=(
            "El Tito's legendary artifact, now ablaze with sacred fire. "
            "Grants +50 max mana."
        ),
    ),
    "crystal_tear": QuestDefinition(
        id="crystal_tear",
        name="The Crystal Tear",
        description=(
            "Elyria the Sage speaks of a Crystal Tear — a shard of pure magical "
            "energy — lost in the Crystal Caverns beneath Crystal Lake. Retrieve "
            "it and bring it to her."
        ),
        giver_npc="sage_01",
        objectives=[
            QuestObjective(
                "enter_crystal_caverns",
                "Enter the Crystal Caverns",
                "enter_dungeon",
                "crystal_caverns",
            ),
            QuestObjective(
                "find_crystal_tear",
                "Find the Crystal Tear",
                "collect_item",
                "Crystal Tear",
            ),
            QuestObjective(
                "return_elyria",
                "Return to Elyria",
                "talk_npc",
                "sage_01",
            ),
        ],
        reward_item="Amulet of Clarity",
        reward_description="A shimmering amulet that clears the mind. Grants +20 max mana.",
    ),
    "village_patrol": QuestDefinition(
        id="village_patrol",
        name="Village Patrol",
        description=(
            "Captain Aldric needs help securing the village perimeter. Defeat 3 "
            "hostile creatures near the village and report back."
        ),
        giver_npc="guard_01",
        objectives=[
            QuestObjective(
                "kill_hostiles",
                "Defeat 3 hostile creatures",
                "kill_enemies",
                "3",
            ),
            QuestObjective(
                "return_aldric",
                "Report to Captain Aldric",
                "talk_npc",
                "guard_01",
            ),
        ],
        reward_item="Guard's Badge of Honor",
        reward_description="A badge marking you as a friend of the village guard.",
    ),
}


def get_quest(quest_id: str) -> QuestDefinition | None:
    """Look up a quest definition by ID."""
    return QUEST_DEFINITIONS.get(quest_id)
```

#### [ ] 1.2 Client Quest Definitions (TypeScript mirror)
**File**: `client/src/state/QuestDefinitions.ts` (NEW)

```typescript
export interface QuestObjectiveData {
  id: string;
  description: string;
  type: "enter_dungeon" | "collect_item" | "talk_npc" | "kill_enemies";
  target: string;
}

export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  giverNpc: string;
  giverName: string;
  objectives: QuestObjectiveData[];
  rewardItem: string;
  rewardDescription: string;
}

/** Runtime quest instance (with completion state). */
export interface ActiveQuest {
  id: string;
  name: string;
  description: string;
  giverNpc: string;
  giverName: string;
  objectives: Array<QuestObjectiveData & { completed: boolean }>;
  rewardItem: string;
  rewardDescription: string;
}

export const QUEST_DEFINITIONS: Record<string, QuestDefinition> = {
  sacred_flame: {
    id: "sacred_flame",
    name: "The Sacred Flame",
    description:
      "El Tito possesses an ancient artifact of immense wisdom — el porro ancestral — but it lies dormant. Find the Mechero Ancestral, a sacred lighter from the ancient world, hidden in the Ember Depths dungeon.",
    giverNpc: "eltito_01",
    giverName: "El Tito",
    objectives: [
      { id: "enter_ember_depths", description: "Enter the Ember Depths", type: "enter_dungeon", target: "ember_depths" },
      { id: "find_mechero", description: "Find the Mechero Ancestral", type: "collect_item", target: "Mechero Ancestral" },
      { id: "return_tito", description: "Return to El Tito", type: "talk_npc", target: "eltito_01" },
    ],
    rewardItem: "Artifact of Ancient Wisdom",
    rewardDescription: "El Tito's legendary artifact, ablaze with sacred fire. +50 max mana.",
  },
  crystal_tear: {
    id: "crystal_tear",
    name: "The Crystal Tear",
    description:
      "Elyria speaks of a Crystal Tear lost in the Crystal Caverns beneath Crystal Lake. Retrieve it.",
    giverNpc: "sage_01",
    giverName: "Elyria the Sage",
    objectives: [
      { id: "enter_crystal_caverns", description: "Enter the Crystal Caverns", type: "enter_dungeon", target: "crystal_caverns" },
      { id: "find_crystal_tear", description: "Find the Crystal Tear", type: "collect_item", target: "Crystal Tear" },
      { id: "return_elyria", description: "Return to Elyria", type: "talk_npc", target: "sage_01" },
    ],
    rewardItem: "Amulet of Clarity",
    rewardDescription: "A shimmering amulet that clears the mind. +20 max mana.",
  },
  village_patrol: {
    id: "village_patrol",
    name: "Village Patrol",
    description:
      "Captain Aldric needs help securing the village perimeter. Defeat 3 hostile creatures and report back.",
    giverNpc: "guard_01",
    giverName: "Captain Aldric",
    objectives: [
      { id: "kill_hostiles", description: "Defeat 3 hostile creatures", type: "kill_enemies", target: "3" },
      { id: "return_aldric", description: "Report to Captain Aldric", type: "talk_npc", target: "guard_01" },
    ],
    rewardItem: "Guard's Badge of Honor",
    rewardDescription: "A badge marking you as a friend of the village guard.",
  },
};
```

#### [ ] 1.3 Dungeon Config (shared between DungeonInterior and DungeonSystem)
**File**: `client/src/scene/DungeonConfig.ts` (NEW)

```typescript
export interface DungeonConfig {
  id: string;
  name: string;
  wallColor: number;
  floorColor: number;
  ceilingColor: number;
  ambientColor: number;
  fogColor: number;
  fogDensity: number;
  enemyCount: number;
  lootItem: string;
  enemyNames: string[];
  enemyColor: number;
  roomWidth: number;
  roomDepth: number;
}

export const DUNGEONS: Record<string, DungeonConfig> = {
  ember_depths: {
    id: "ember_depths",
    name: "Ember Depths",
    wallColor: 0x2a1a0a,
    floorColor: 0x1a0a05,
    ceilingColor: 0x1a0a00,
    ambientColor: 0xff4400,
    fogColor: 0x1a0800,
    fogDensity: 0.03,
    enemyCount: 4,
    lootItem: "Mechero Ancestral",
    enemyNames: ["Ember Guardian", "Fire Wraith", "Magma Sentinel", "Lava Worm"],
    enemyColor: 0xff4400,
    roomWidth: 40,
    roomDepth: 40,
  },
  crystal_caverns: {
    id: "crystal_caverns",
    name: "Crystal Caverns",
    wallColor: 0x1a2a3a,
    floorColor: 0x0a1a2a,
    ceilingColor: 0x0a1520,
    ambientColor: 0x4488cc,
    fogColor: 0x0a1a2a,
    fogDensity: 0.02,
    enemyCount: 3,
    lootItem: "Crystal Tear",
    enemyNames: ["Crystal Golem", "Frost Shade", "Ice Stalker"],
    enemyColor: 0x4488cc,
    roomWidth: 35,
    roomDepth: 45,
  },
};
```

### Success Criteria:
- [ ] `cd server && ruff check src && ruff format --check src`
- [ ] `cd server && mypy src`
- [ ] `cd client && npx tsc --noEmit`
- [ ] `cd client && npm run lint`

---

## Agent 2: Server Player State — Quest Fields

**Purpose**: Add quest tracking fields to the server-side `PlayerData` dataclass and update `to_dict()`.

**Owns these files (EDITS):**
- `server/src/world/player_state.py`

**Dependencies**: Agent 1 (uses `quest_definitions.py` types)

### Tasks:

#### [ ] 2.1 Add quest fields to PlayerData
**File**: `server/src/world/player_state.py`

Add to the `PlayerData` dataclass:
```python
active_quests: list[dict] = field(default_factory=list)
# Format: [{"id": "sacred_flame", "objectives": [{"id": "enter_ember_depths", "completed": false}, ...]}]
completed_quests: list[str] = field(default_factory=list)
# Format: ["village_patrol"]
kill_count: int = 0  # For village_patrol quest tracking
```

#### [ ] 2.2 Update to_dict() to include quest data
Ensure `active_quests` and `completed_quests` are serialized in `to_dict()`.

#### [ ] 2.3 Add quest helper methods
```python
def start_quest(self, quest_id: str) -> None:
    """Add a quest to active_quests from QUEST_DEFINITIONS."""
    ...

def advance_objective(self, quest_id: str, objective_id: str) -> None:
    """Mark a specific objective as completed."""
    ...

def complete_quest(self, quest_id: str) -> None:
    """Move quest from active to completed."""
    ...

def has_active_quest(self, quest_id: str) -> bool: ...
def has_completed_quest(self, quest_id: str) -> bool: ...
```

### Success Criteria:
- [ ] `cd server && ruff check src && ruff format --check src`
- [ ] `cd server && mypy src`
- [ ] `cd server && pytest tests/ -x`

---

## Agent 3: Client Player State — Quest Methods

**Purpose**: Add quest tracking to the client-side `PlayerState` singleton.

**Owns these files (EDITS):**
- `client/src/state/PlayerState.ts`

**Dependencies**: Agent 1 (imports from `QuestDefinitions.ts`)

### Tasks:

#### [ ] 3.1 Add quest state fields
```typescript
// New fields on PlayerState:
activeQuests: ActiveQuest[] = [];
completedQuests: string[] = [];
onQuestChange?: () => void;  // Callback for UI reactivity
```

#### [ ] 3.2 Add quest mutation methods
```typescript
startQuest(questId: string): void {
  // Look up from QUEST_DEFINITIONS, clone objectives with completed: false
  // Push to activeQuests, fire onQuestChange
  // Skip if already active or completed
}

advanceObjective(questId: string, objectiveId: string): void {
  // Find quest, mark objective completed, fire onQuestChange
}

completeQuest(questId: string): void {
  // Remove from activeQuests, add id to completedQuests, fire onQuestChange
}

isQuestActive(questId: string): boolean { ... }
isQuestComplete(questId: string): boolean { ... }
getActiveQuest(questId: string): ActiveQuest | undefined { ... }
```

#### [ ] 3.3 Include quest state in merge()
When server sends `playerStateUpdate` with quest data, merge it properly.

### Success Criteria:
- [ ] `cd client && npx tsc --noEmit`
- [ ] `cd client && npm run lint`
- [ ] `cd client && npm test`

---

## Agent 4: Quest Log UI Panel

**Purpose**: Create the full-screen quest log panel (toggled with L key).

**Owns these files (creates NEW):**
- `client/src/ui/QuestLog.ts`

**Dependencies**: Agent 3 (reads `PlayerState.activeQuests/completedQuests`)

### Tasks:

#### [ ] 4.1 Create QuestLog panel
**File**: `client/src/ui/QuestLog.ts` (NEW)

Follow the pattern from `InventoryPanel.ts`:
- `element: HTMLDivElement` property
- `show()`, `hide()`, `toggle()` methods
- `update(playerState: PlayerState)` to refresh content

**Layout** (see mockup in Overview):
- Fixed overlay, centered, 450px wide, max 80vh tall
- Dark semi-transparent background with gold border
- Header: "QUEST LOG" with close [X] button
- Section: "ACTIVE QUESTS" — collapsible
  - Quest cards with: star icon, name (gold), description (gray), objectives list
  - Each objective: circle (empty ○ / filled ●) + description text
  - "Given by: [NPC name]" footer
- Section: "COMPLETED" — collapsible, grayed out
  - Quest cards with checkmark, name, no objectives
- Escape key closes panel

**Styling**:
- Background: `rgba(10, 6, 2, 0.95)`
- Border: `2px solid #c5a55a`
- Font: `'Cinzel', 'Times New Roman', serif`
- Quest name: `#c5a55a` (gold)
- Description: `#aaa`
- Completed objective: `#66cc66`
- Incomplete objective: `#888`

**Reactivity**: Subscribe to `PlayerState.onQuestChange` to re-render.

### Success Criteria:
- [ ] `cd client && npx tsc --noEmit`
- [ ] `cd client && npm run lint`

---

## Agent 5: Quest Tracker Widget

**Purpose**: Create the compact always-visible quest tracker on the right side.

**Owns these files (creates NEW):**
- `client/src/ui/QuestTracker.ts`

**Dependencies**: Agent 3 (reads `PlayerState.activeQuests`)

### Tasks:

#### [ ] 5.1 Create QuestTracker widget
**File**: `client/src/ui/QuestTracker.ts` (NEW)

**Layout** (see mockup in Overview):
- Fixed position: right side, below where combat log sits (~top: 200px, right: 16px)
- Width: 220px, semi-transparent background
- For each active quest (max 3):
  - Quest name (gold, small font)
  - Only incomplete objectives listed (gray, indented)
- No close button — always visible when quests exist
- Hidden when no active quests
- Clicking a quest name fires `onOpenQuestLog` callback

**Styling**:
- Background: `rgba(10, 6, 2, 0.7)`
- Border: `1px solid rgba(197, 165, 90, 0.3)`
- Border-radius: 4px
- Font size: 12px for objectives, 13px for quest name
- Pointer-events: auto (clickable)

**API**:
```typescript
export class QuestTracker {
  readonly element: HTMLDivElement;
  onOpenQuestLog?: () => void;
  update(playerState: PlayerState): void;
}
```

**Reactivity**: Subscribe to `PlayerState.onQuestChange` to re-render.

### Success Criteria:
- [ ] `cd client && npx tsc --noEmit`
- [ ] `cd client && npm run lint`

---

## Agent 6: Zone Display System

**Purpose**: Detect zone boundaries and show WoW-style zone name popup. Fully self-contained.

**Owns these files (creates NEW):**
- `client/src/systems/ZoneTracker.ts`
- `client/src/ui/ZoneDisplay.ts`

**Dependencies**: None (Wave 1 — uses zone data from `server/src/world/zones.py` but just mirrors it inline)

### Tasks:

#### [ ] 6.1 Zone Tracker
**File**: `client/src/systems/ZoneTracker.ts` (NEW)

```typescript
export interface ZoneData {
  name: string;
  description: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Mirror of server/src/world/zones.py — checked in order (specific zones first)
export const ZONES: ZoneData[] = [
  { name: "Elders' Village", description: "A peaceful village at the heart of the world, where wise elders share ancient knowledge.", minX: -50, maxX: 50, minZ: -50, maxZ: 50 },
  { name: "Dark Forest", description: "A foreboding forest to the north, thick with shadows and strange whispers.", minX: -100, maxX: 100, minZ: 50, maxZ: 200 },
  { name: "Ember Peaks", description: "Volcanic mountains to the east, glowing with molten rivers and fire spirits.", minX: 50, maxX: 200, minZ: -100, maxZ: 100 },
  { name: "Crystal Lake", description: "A serene lake to the west, its waters shimmer with magical energy.", minX: -200, maxX: -50, minZ: -100, maxZ: 100 },
  { name: "Ember Wastes", description: "A vast volcanic wasteland. Rivers of lava carve through obsidian fields.", minX: 200, maxX: 99999, minZ: -99999, maxZ: 99999 },
  { name: "Crystal Tundra", description: "An endless frozen expanse. Towering ice spires catch the moonlight.", minX: -99999, maxX: 99999, minZ: 200, maxZ: 99999 },
  { name: "Twilight Marsh", description: "A sprawling swampland shrouded in perpetual mist.", minX: -99999, maxX: 99999, minZ: -99999, maxZ: -200 },
  { name: "Sunlit Meadows", description: "Rolling golden grasslands extending westward to the horizon.", minX: -99999, maxX: -200, minZ: -99999, maxZ: 99999 },
  { name: "Teldrassil Wilds", description: "The ancient forest surrounding the Elders' Village.", minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
];

export class ZoneTracker {
  private currentZone = "";
  onZoneChange?: (zoneName: string, description: string) => void;

  getCurrentZone(): string { return this.currentZone; }

  update(playerX: number, playerZ: number): void {
    const zone = this.getZone(playerX, playerZ);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      const desc = this.getDescription(zone);
      this.onZoneChange?.(zone, desc);
    }
  }

  /** Also usable for dungeon zone overrides. */
  forceZone(name: string, description: string): void {
    this.currentZone = name;
    this.onZoneChange?.(name, description);
  }

  private getZone(x: number, z: number): string { /* iterate ZONES */ }
  private getDescription(name: string): string { /* lookup */ }
}
```

#### [ ] 6.2 Zone Display UI
**File**: `client/src/ui/ZoneDisplay.ts` (NEW)

WoW-style centered zone popup:

```typescript
export class ZoneDisplay {
  readonly element: HTMLDivElement;

  /** Show a zone transition banner. Auto-fades after ~4 seconds. */
  show(zoneName: string, description: string): void;
}
```

**Visual spec**:
- Fixed center of screen (top: 25%)
- Zone name: 32px, gold `#c5a55a`, letter-spacing 3px, `'Cinzel'` font
- Decorated with `~ Zone Name ~` tildes
- Description: 14px, `#aaa`, italic, below name
- Fade in 0.5s → hold 3s → fade out 1s
- Pointer-events: none
- Each new trigger cancels previous animation

### Success Criteria:
- [ ] `cd client && npx tsc --noEmit`
- [ ] `cd client && npm run lint`

---

## Agent 7: Server Handler & Protocol — Dungeon + Quest Messages

**Purpose**: Handle new WebSocket message types for dungeons and quest state syncing.

**Owns these files (EDITS):**
- `server/src/ws/handler.py`
- `server/src/ws/protocol.py`

**Dependencies**: Agent 2 (uses `PlayerData` quest methods)

### Tasks:

#### [ ] 7.1 Add message types to protocol
**File**: `server/src/ws/protocol.py`

Add to the protocol definitions:
- `dungeon_enter`: `{ type, dungeonId, playerId }`
- `dungeon_exit`: `{ type, dungeonId, playerId, loot: string[] }`
- `quest_update`: `{ type, questId, objectiveId, playerId }`

#### [ ] 7.2 Handle dungeon_enter
**File**: `server/src/ws/handler.py`

```python
async def _handle_dungeon_enter(self, data: dict, player_id: str) -> dict:
    dungeon_id = data.get("dungeonId", "")
    player = self.world_state.get_player(player_id)
    actions = []

    # Advance "enter_dungeon" objectives for matching active quests
    for quest in player.active_quests:
        for obj in quest.get("objectives", []):
            if obj["type"] == "enter_dungeon" and obj["target"] == dungeon_id and not obj["completed"]:
                player.advance_objective(quest["id"], obj["id"])
                actions.append({
                    "kind": "advance_objective",
                    "params": {"questId": quest["id"], "objectiveId": obj["id"], "description": obj["description"]},
                })

    return {"type": "quest_update", "actions": actions, "playerStateUpdate": player.to_dict()}
```

#### [ ] 7.3 Handle dungeon_exit
When exiting with loot:
- Add loot items to `player.inventory`
- Advance `collect_item` objectives if loot matches quest target
- Return updated player state + actions

#### [ ] 7.4 Handle quest_update (generic objective advancement)
For `kill_enemies` type: increment `player.kill_count`, check if threshold met.

#### [ ] 7.5 Inject quest state into NPC interactions
In `_handle_interaction`, add `active_quests` and `completed_quests` to the player_state dict sent to the agent, so the agent can see what quests the player has.

### Success Criteria:
- [ ] `cd server && ruff check src && ruff format --check src`
- [ ] `cd server && mypy src`
- [ ] `cd server && pytest tests/ -x`

---

## Agent 8: Dungeon Interior Scene (3D Geometry)

**Purpose**: Create the enclosed dungeon room meshes — pure Three.js scene generation, no game logic.

**Owns these files (creates NEW):**
- `client/src/scene/DungeonInterior.ts`

**Dependencies**: Agent 1 (imports `DungeonConfig` from `DungeonConfig.ts`)

### Tasks:

#### [ ] 8.1 Create DungeonInterior class
**File**: `client/src/scene/DungeonInterior.ts` (NEW)

```typescript
import * as THREE from "three";
import type { DungeonConfig } from "./DungeonConfig";

export interface DungeonObjects {
  group: THREE.Group;          // Root group containing all dungeon meshes
  enemySpawnPoints: THREE.Vector3[];  // Positions where enemies should spawn
  chestPosition: THREE.Vector3;       // Where the loot chest sits
  exitPortalPosition: THREE.Vector3;  // Where the exit portal is
  chestMesh: THREE.Group;             // Interactive chest mesh
  exitPortalMesh: THREE.Group;        // Interactive exit portal mesh
}

export function createDungeonInterior(config: DungeonConfig): DungeonObjects { ... }
export function disposeDungeonInterior(objects: DungeonObjects): void { ... }
```

**Room construction**:
- Floor: PlaneGeometry (roomWidth × roomDepth), colored per config
- Walls: 4 BoxGeometry panels, height 8 units, colored per config
- Ceiling: PlaneGeometry, darker variant of wall color
- Ambient light: PointLight at center, color from config.ambientColor, intensity 1.5
- Loot chest: Small BoxGeometry group with lid, emissive golden glow (pulsing)
- Exit portal: Torus geometry, blue emissive, slowly rotating
- Decorative elements per dungeon type:
  - **Ember Depths**: Lava pools (orange emissive planes on floor), fire particle positions, stalactites (inverted cones from ceiling)
  - **Crystal Caverns**: Crystal formations (reuse cone geometry with blue emissive), ice patches (semi-transparent planes), sparkle light

**Enemy spawn points**: Evenly distributed around the room, at least 8 units from center.

**Performance**: Share geometries and materials within a single dungeon instance.

### Success Criteria:
- [ ] `cd client && npx tsc --noEmit`
- [ ] `cd client && npm run lint`

---

## Agent 9: Server Quest Tools & NPC Personalities

**Purpose**: Create quest-specific agent tools and update NPC personalities with quest dialogue.

**Owns these files (creates NEW + EDITS):**
- `server/src/agents/tools/quest.py` (NEW)
- `server/src/agents/personalities/templates.py` (EDIT)
- `server/src/agents/npc_agent.py` (EDIT — only the tool binding section)

**Dependencies**: Agent 1 (imports from `quest_definitions.py`)

### Tasks:

#### [ ] 9.1 Create quest tools
**File**: `server/src/agents/tools/quest.py` (NEW)

Following the closure pattern from `dialogue.py`:

```python
from __future__ import annotations

from langchain_core.tools import tool

from server.src.world.quest_definitions import QUEST_DEFINITIONS


def create_quest_tools(pending_actions: list, world_state: dict) -> list:
    @tool
    def start_quest(quest_id: str) -> str:
        """Offer a quest to the player. Use when the player asks about adventures,
        quests, or tasks. Only use quest IDs from: sacred_flame, crystal_tear, village_patrol.

        Args:
            quest_id: The quest identifier to start.
        """
        qdef = QUEST_DEFINITIONS.get(quest_id)
        if not qdef:
            return f"Unknown quest: {quest_id}"
        pending_actions.append({
            "kind": "start_quest",
            "params": {"questId": quest_id, "quest": qdef.name},
        })
        return f"Started quest: {qdef.name}"

    @tool
    def advance_quest_objective(quest_id: str, objective_id: str) -> str:
        """Mark a quest objective as completed. Use when the player has fulfilled
        a requirement (returned with an item, reported back, etc.).

        Args:
            quest_id: The quest identifier.
            objective_id: The specific objective to advance.
        """
        pending_actions.append({
            "kind": "advance_objective",
            "params": {"questId": quest_id, "objectiveId": objective_id},
        })
        return f"Advanced objective: {objective_id} in quest: {quest_id}"

    @tool
    def check_player_quests() -> str:
        """Check which quests the player currently has active and which are completed.
        Use this to decide whether to offer a new quest or complete an existing one."""
        player = world_state.get("player", {})
        active = player.get("active_quests", [])
        completed = player.get("completed_quests", [])
        inventory = player.get("inventory", [])
        return (
            f"Active quests: {active}\n"
            f"Completed quests: {completed}\n"
            f"Player inventory: {inventory}"
        )

    return [start_quest, advance_quest_objective, check_player_quests]
```

#### [ ] 9.2 Bind quest tools in npc_agent.py
**File**: `server/src/agents/npc_agent.py`

Import `create_quest_tools` and add to the tool list alongside existing tools:
```python
from server.src.agents.tools.quest import create_quest_tools
# In _build_agent():
tools = [
    *create_combat_tools(pending_actions, world_snapshot),
    *create_dialogue_tools(pending_actions, world_snapshot),
    *create_trade_tools(pending_actions, world_snapshot),
    *create_environment_tools(pending_actions, world_snapshot),
    *create_world_query_tools(pending_actions, world_snapshot),
    *create_quest_tools(pending_actions, world_snapshot),  # NEW
]
```

#### [ ] 9.3 Update El Tito personality
**File**: `server/src/agents/personalities/templates.py`

Add quest section to El Tito's system prompt (append after existing BEHAVIOR RULES):

```python
"QUEST - THE SACRED FLAME:\n"
"- You possess an ancient artifact of incredible wisdom. You call it 'el porro "
"ancestral'. It's dormant — needs sacred fire to activate.\n"
"- The sacred fire comes from the 'Mechero Ancestral', an ancient lighter "
"hidden in the Ember Depths dungeon.\n"
"- When a player asks about quests or adventures, FIRST call check_player_quests() "
"to see if they already have the quest or have completed it.\n"
"- If they DON'T have it yet, describe your artifact casually and call "
"start_quest('sacred_flame'). Say something like: 'Maaan, I've got this "
"artifact, tio... el porro ancestral... grants INCREDIBLE wisdom, bro. "
"Like, see-the-matrix-level stuff. But it's dead, man. Needs sacred fire "
"from the Mechero Ancestral. It's in some dungeon... the Ember Depths. "
"Can you find it? I'd go myself but... I'm in the middle of a raid, tio.'\n"
"- If they HAVE the quest and 'Mechero Ancestral' is in their inventory, "
"call advance_quest_objective('sacred_flame', 'return_tito') AND THEN "
"complete_quest('sacred_flame', 'Artifact of Ancient Wisdom'). "
"Celebrate: spawn_effect('smoke'), spawn_effect('fire'), emote('cheer'). "
"Say: 'DUUUUDE! You did it, tio! *lights the artifact* ...Broooo... I can see... "
"EVERYTHING. The meaning of life is... wait I forgot. Take this bro, you earned "
"it. Don't forget... WEDNESDAY, tio!'\n"
"- If they already completed it, say you're still basking in the wisdom, bro.\n"
```

#### [ ] 9.4 Update Elyria personality
Add quest section:
- Use `start_quest('crystal_tear')` when player is worthy (2+ polite exchanges)
- On return with "Crystal Tear" in inventory: `advance_quest_objective` + `complete_quest`
- Replace the old text-only quest descriptions

#### [ ] 9.5 Update Captain Aldric personality
Add quest section:
- Use `start_quest('village_patrol')` when player asks for work
- When player reports back (check kill count via `check_player_quests`): complete quest

### Success Criteria:
- [ ] `cd server && ruff check src && ruff format --check src`
- [ ] `cd server && mypy src`

---

## Agent 10: Integration & Wiring

**Purpose**: Wire all new systems into the game bootstrap, UIManager, ReactionSystem, WorldGenerator, and create the DungeonSystem controller. This is the glue agent.

**Owns these files (EDITS + creates DungeonSystem):**
- `client/src/main.ts` (EDIT)
- `client/src/ui/UIManager.ts` (EDIT)
- `client/src/systems/ReactionSystem.ts` (EDIT)
- `client/src/systems/WorldGenerator.ts` (EDIT)
- `client/src/systems/DungeonSystem.ts` (NEW)

**Dependencies**: ALL agents 2-9 must be complete (Wave 4)

### Tasks:

#### [ ] 10.1 Create DungeonSystem controller
**File**: `client/src/systems/DungeonSystem.ts` (NEW)

```typescript
import * as THREE from "three";
import { DUNGEONS } from "../scene/DungeonConfig";
import { createDungeonInterior, disposeDungeonInterior, type DungeonObjects } from "../scene/DungeonInterior";
import type { EntityManager } from "../entities/EntityManager";
import type { WebSocketClient } from "../network/WebSocketClient";
import type { PlayerState } from "../state/PlayerState";

export class DungeonSystem {
  private scene: THREE.Scene;
  private entityManager: EntityManager;
  private ws: WebSocketClient;
  private playerState: PlayerState;

  // Dungeon entrance positions registered by WorldGenerator
  private entrances: Map<string, { position: THREE.Vector3; dungeonId: string }> = new Map();

  // Active dungeon state
  private activeDungeon: DungeonObjects | null = null;
  private activeDungeonId: string | null = null;
  private savedPlayerPosition: THREE.Vector3 | null = null;
  private dungeonEnemyIds: string[] = [];

  // Proximity UI
  private promptElement: HTMLDivElement;  // "Press E to enter..."
  private nearestEntrance: string | null = null;

  // Callbacks
  onEnterDungeon?: (dungeonId: string, dungeonName: string) => void;
  onExitDungeon?: (previousZone: string) => void;

  isInDungeon(): boolean { return this.activeDungeon !== null; }

  registerEntrance(id: string, position: THREE.Vector3, dungeonId: string): void { ... }

  /** Called every frame. Checks proximity to dungeon entrances. */
  update(playerPos: THREE.Vector3): void {
    if (this.activeDungeon) {
      this.updateDungeonProximity(playerPos);  // Check exit portal + chest
      return;
    }
    // Check proximity to entrances (< 5 units)
    // Show/hide "Press E to enter" prompt
  }

  /** Called on E key press. */
  tryEnter(): void {
    if (this.nearestEntrance) this.enterDungeon(this.nearestEntrance);
    else if (this.activeDungeon) this.tryInteractInDungeon();
  }

  private enterDungeon(entranceId: string): void {
    // 1. Save player position
    // 2. Hide overworld (scene children visibility)
    // 3. Create dungeon interior
    // 4. Spawn enemies via EntityManager
    // 5. Move player to dungeon center
    // 6. Send dungeon_enter to server
    // 7. Fire onEnterDungeon callback (for ZoneTracker override)
  }

  private exitDungeon(): void {
    // 1. Collect loot from chest (if opened)
    // 2. Dispose dungeon interior
    // 3. Show overworld
    // 4. Restore player position
    // 5. Remove dungeon enemies
    // 6. Send dungeon_exit to server
    // 7. Fire onExitDungeon callback
  }
}
```

#### [ ] 10.2 Wire into UIManager
**File**: `client/src/ui/UIManager.ts`

```typescript
import { QuestLog } from "./QuestLog";
import { QuestTracker } from "./QuestTracker";
import { ZoneDisplay } from "./ZoneDisplay";

// Add as class fields:
readonly questLog: QuestLog;
readonly questTracker: QuestTracker;
readonly zoneDisplay: ZoneDisplay;

// In constructor — create and append elements

// Add methods:
toggleQuestLog(): void { this.questLog.toggle(); }
showZoneTransition(name: string, description: string): void { this.zoneDisplay.show(name, description); }
updateQuestUI(playerState: PlayerState): void {
  this.questLog.update(playerState);
  this.questTracker.update(playerState);
}
```

#### [ ] 10.3 Enhance ReactionSystem quest actions
**File**: `client/src/systems/ReactionSystem.ts`

Update the `start_quest`, `complete_quest` cases and add `advance_objective`:

```typescript
case "start_quest": {
  const questId: string = p.questId ?? "";
  const questName: string = p.quest ?? p.name ?? questId;
  if (questId) this.playerState.startQuest(questId);
  this.showQuestBanner(`Quest Started: ${questName}`);
  break;
}

case "advance_objective": {
  const questId: string = p.questId ?? "";
  const objectiveId: string = p.objectiveId ?? "";
  if (questId && objectiveId) this.playerState.advanceObjective(questId, objectiveId);
  this.showQuestBanner(`Objective Complete: ${p.description ?? objectiveId}`);
  break;
}

case "complete_quest": {
  const questId: string = p.questId ?? p.questName ?? "";
  const questName: string = p.quest ?? p.name ?? questId;
  if (questId) this.playerState.completeQuest(questId);
  this.showQuestBanner(`Quest Complete: ${questName}`);
  break;
}
```

#### [ ] 10.4 Enhance WorldGenerator — Dungeon entrances
**File**: `client/src/systems/WorldGenerator.ts`

In `maybeSpawnCave()`, after creating a cave entrance, also create a dungeon portal if the cave is in a matching zone:

```typescript
// After createCaveEntrance():
const dungeonId = this.getDungeonForPosition(cx, cz);
if (dungeonId && this.dungeonSystem) {
  // Create portal visual (torus + nameplate)
  const portalGroup = this.createDungeonPortal(cx, cy, cz, DUNGEONS[dungeonId].name);
  this.scene.add(portalGroup);
  this.dungeonSystem.registerEntrance(`dungeon_${cx}_${cz}`, new THREE.Vector3(cx, cy, cz), dungeonId);
}
```

Zone-to-dungeon mapping:
- Caves in Ember Peaks / Ember Wastes → `ember_depths`
- Caves in Crystal Lake / Crystal Tundra → `crystal_caverns`

Add `setDungeonSystem(ds: DungeonSystem)` method.

#### [ ] 10.5 Wire everything in main.ts
**File**: `client/src/main.ts`

```typescript
import { ZoneTracker } from "./systems/ZoneTracker";
import { DungeonSystem } from "./systems/DungeonSystem";

// In initGame():
const zoneTracker = new ZoneTracker();
const dungeonSystem = new DungeonSystem(scene, entityManager, ws, playerState);
worldGenerator.setDungeonSystem(dungeonSystem);

// Zone display callback:
zoneTracker.onZoneChange = (name, desc) => {
  uiManager.showZoneTransition(name, desc);
};

// Dungeon zone override:
dungeonSystem.onEnterDungeon = (id, name) => {
  zoneTracker.forceZone(name, `Dungeon: ${name}`);
};
dungeonSystem.onExitDungeon = () => {
  // Zone tracker will re-detect on next update
};

// Quest UI reactivity:
playerState.onQuestChange = () => {
  uiManager.updateQuestUI(playerState);
};

// Keybindings:
window.addEventListener("keydown", (e) => {
  if (e.key === "l" || e.key === "L") uiManager.toggleQuestLog();
  if (e.key === "e" || e.key === "E") dungeonSystem.tryEnter();
});

// In animate():
zoneTracker.update(playerPos.x, playerPos.z);
dungeonSystem.update(playerMesh.position);

// Update El Tito action buttons:
// eltito_01 buttons: ["Quest", "Chill", "Talk WoW", "Lore"]
```

#### [ ] 10.6 Handle server dungeon responses
Wire `ws.onMessage` to process `quest_update` responses from server (dungeon_enter/exit returns).

### Success Criteria:

#### Automated Verification:
- [ ] `cd client && npx tsc --noEmit`
- [ ] `cd client && npm run lint`
- [ ] `cd server && ruff check src && ruff format --check src`

#### Manual Verification:
- [ ] L key toggles quest log
- [ ] E key enters/exits dungeons
- [ ] Zone text appears when crossing boundaries
- [ ] Quest tracker visible with active quests
- [ ] Full quest flow: get quest → enter dungeon → loot → return → complete

---

## File Ownership Matrix

| File | Agent | Action |
|------|-------|--------|
| `server/src/world/quest_definitions.py` | **1** | CREATE |
| `client/src/state/QuestDefinitions.ts` | **1** | CREATE |
| `client/src/scene/DungeonConfig.ts` | **1** | CREATE |
| `server/src/world/player_state.py` | **2** | EDIT |
| `client/src/state/PlayerState.ts` | **3** | EDIT |
| `client/src/ui/QuestLog.ts` | **4** | CREATE |
| `client/src/ui/QuestTracker.ts` | **5** | CREATE |
| `client/src/systems/ZoneTracker.ts` | **6** | CREATE |
| `client/src/ui/ZoneDisplay.ts` | **6** | CREATE |
| `server/src/ws/handler.py` | **7** | EDIT |
| `server/src/ws/protocol.py` | **7** | EDIT |
| `client/src/scene/DungeonInterior.ts` | **8** | CREATE |
| `server/src/agents/tools/quest.py` | **9** | CREATE |
| `server/src/agents/personalities/templates.py` | **9** | EDIT |
| `server/src/agents/npc_agent.py` | **9** | EDIT |
| `client/src/systems/DungeonSystem.ts` | **10** | CREATE |
| `client/src/main.ts` | **10** | EDIT |
| `client/src/ui/UIManager.ts` | **10** | EDIT |
| `client/src/systems/ReactionSystem.ts` | **10** | EDIT |
| `client/src/systems/WorldGenerator.ts` | **10** | EDIT |

**Zero overlap** — no two agents touch the same file.

---

## Testing Strategy

### Unit Tests (agents can add these to their owned test files):

| Test File | Agent | Tests |
|-----------|-------|-------|
| `server/tests/test_quest_definitions.py` | **1** | Quest data integrity, all NPC refs valid |
| `server/tests/test_player_state.py` | **2** | Quest field serialization, start/advance/complete |
| `client/src/__tests__/PlayerState.test.ts` | **3** | startQuest, advanceObjective, completeQuest |
| `client/src/__tests__/ZoneTracker.test.ts` | **6** | getZone() with known coords, boundary transitions |
| `server/tests/test_quest_tools.py` | **9** | Tool functions produce correct actions |

### Integration Tests:
| Test File | Agent | Tests |
|-----------|-------|-------|
| `server/tests/test_handler_dungeon.py` | **7** | dungeon_enter/exit messages, quest advancement |

### Manual Testing (after Agent 10 completes):
1. Walk to El Tito, click "Quest" → quest appears in log + tracker
2. Walk toward Ember Peaks → zone display shows "Ember Peaks"
3. Find dungeon entrance (cave with portal) → press E to enter
4. Defeat enemies, open chest → receive Mechero Ancestral
5. Exit dungeon → return to overworld, zone text reappears
6. Return to El Tito → quest completes with celebration effects
7. Press L → quest log shows completed quest
8. Test Elyria (Crystal Tear) and Aldric (Village Patrol) quests

## Performance Considerations

- Dungeon interiors are small (35-40 units) — minimal geometry
- Zone-aware chunk loading reduces active chunks
- Quest tracker DOM updates only on state change
- Zone display is pure CSS animation, no Three.js cost
- Dungeon enemies reuse existing NPC class
- Shared geometries within dungeon instances
