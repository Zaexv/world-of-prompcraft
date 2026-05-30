# Model State & Plan - Saturday, May 30, 2026

## Current Status: Procedural Expressiveness Overhaul Complete

### 1. Architectural Pivot: Pure Mesh System
- **GLTF Removed**: All dependency on external GLTF models for NPCs has been eliminated.
- **Unified Procedural Engine**: All NPCs now use a stylized, Roblox-inspired blocky mesh system built in `NPCAppearance.ts`.
- **ID-Based Variety**: Added seed-based randomization (`hashString`) to ensure NPCs of the same style have unique heights, colors, and proportions.

### 2. Expressive Animation System
- **Enhanced Procedural Animations**: `NPCAnimator.ts` now supports `wave`, `nod`, `cheer`, and `dance` by direct limb manipulation.
- **Mood-Driven Feedback**: NPC idle animations now respond to their internal mood state (e.g., faster bouncing for happy, jittering for angry/scared).
- **Secondary Motion**: Added accessory-aware animations (e.g., wings flap, staves sway) for a more "alive" feel.

### 3. Agentic Integration
- **LLM Prompts**: Updated system prompts to force roleplay animations (`*waves*`) and rich-text highlights (`**important**`).
- **Dynamic Skinning Tool**: Added `set_skin` tool to the server and `npc.setSkin()` to the client, allowing agents to change their physical look mid-conversation.
- **Rich Text Rendering**: Implemented `RichTextFormatter` for real-time parsing of LLM dialogue into stylized HTML.

### 4. UI/UX Polish
- **Amazing Text Editor**: Overhauled chat and interaction inputs with glassmorphism, animated glowing borders, and premium typography.
- **Chat Bubbles**: Enabled rich-text rendering in world-space chat bubbles.

## Suggested Next Steps & Agents

### Suggested Agent: **World Designer / Content Specialist**
**Objective**: Expand the procedural world and deepen the lore using the new expressive systems.
- **Tasks**:
  - Add more procedural "Styles" (e.g., Skeleton, Golem, Dragon-kin) to `NPCAppearance.ts`.
  - Create more varied "Accessories" in `NPCAccessories.ts`.
  - Update `world_manifest.json` to leverage the new `set_skin` capability for scripted events.
  - Implement "Procedural Quests" where NPCs change their skin upon completion.

### Suggested Agent: **UX / Interaction Specialist**
**Objective**: Further polish the "game feel" and visual feedback loops.
- **Tasks**:
  - Add particle effects to procedural animations (e.g., sparkles when cheering, dust when jumping).
  - Implement a more advanced "Floating Text" system for relationship changes and mood shifts.
  - Polish the Interaction Panel further with character portraits rendered from the procedural meshes.

---
*State saved by Gemini CLI.*
