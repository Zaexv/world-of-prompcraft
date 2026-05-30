# Pull Request: Advanced Agentic Architecture & Social Persistence

## 🚀 Overview
This PR introduces the **"vNext" Agentic Architecture** for World of Promptcraft. It transforms NPCs from simple reactive agents into persistent, social beings with long-term memory and optimized reasoning. These changes provide the foundation for deep roleplay and complex player-NPC relationships.

## 🏗️ Major Architectural Changes

### 1. Hybrid Memory & Dual-Context Cognition
- **Episodic Memory System**: NPCs now possess a discrete memory layer that extracts key facts about the player (e.g., their origins, preferences, past deeds) from every conversation.
- **Dual-Context Prompting**: The reasoning engine now combines rolling **Conversation Summaries** with these extracted **Episodic Facts**, giving NPCs a consistent "memory" across sessions.
- **Token Optimization**: Implemented a sliding window for conversation history, ensuring NPCs stay within context limits while maintaining relevant recent memory.

### 2. SQLite Social Persistence
- **Stateful NPCs**: NPC HP, Position, Mood, and Relationship scores are now persisted in a SQLite backend.
- **World Continuity**: World state (weather, events, chat history) and NPC social data now survive server restarts, ensuring the world feels permanent.
- **Per-Player Relationships**: NPCs track unique relationship scores and personality notes for every player they interact with.

### 3. Social Tiers & Behavioral Evolution
- **Dynamic Relationship Scoring**: Implemented a -100 to +100 relationship scale that affects NPC dialogue and willingness to assist.
- **Social Tiers**: NPCs now categorize players into 5 tiers: **Enemy, Distrustful, Stranger, Friend, and Trusted Ally**.
- **Mood-Driven Animation**: The client now maps the NPC's mood (happy, angry, sad) to procedural animation parameters, making their emotional state visible in-game.

### 4. Deterministic Performance (Fast-Path)
- **O(1) Command Handling**: Added a regex-based "pre-check" node that intercepts direct commands like `attack`, `trade`, `follow`, and `stop`.
- **Zero-Latency Replies**: Common social interactions (greetings, thanks, farewells) are handled by a fast-path heuristic, bypassing the LLM entirely for a snappier user experience.
- **LLM Backpressure**: Maintained the `asyncio.Semaphore` system to prevent LLM provider overload during peak activity.

## 🐛 Bug Fixes & Refinements
- **Emote Syntax Leak (Bug 15)**: Fixed an issue where raw `emote('wave')` syntax would appear in chat bubbles when the message contained only an emote.
- **Jump Optimization**: Restored the `isGrounded` check for jumping to prevent multi-jump exploits.
- **Type Safety**: Passed full Mypy and TypeScript strict checks across the new architecture.

## 🧪 Verification & Quality
- **Server Tests**: 113/113 Pytest cases passing, including new integration tests for episodic memory and fast-path routing.
- **Client Tests**: 95/95 Vitest cases passing, including updated `AudioSystem` and `PlayerController` tests.
- **Social Persistence Verified**: Manually confirmed that NPC moods and memories persist across server reboots.

## 🗂️ New Agent Files
```
server/src/
├── agents/
│   ├── nodes/
│   │   ├── episodic_memory.py  # Fact extraction engine
│   │   ├── pre_check.py        # O(1) deterministic router
│   │   └── ...
├── persistence/
│   └── sqlite_store.py         # Social & World state persistence
└── ...
```
