# Agentic Rework & Population Control State

## 1. Accomplishments

### NPC Population Control (Architectural Fix)
*   **Deterministic IDs:** Procedural NPCs now have IDs derived from their chunk coordinates and local index. This ensures multiple clients and the server agree on the same entity ID, preventing duplicate registrations.
*   **Memory Leak Protection:** Updated `EntityManager.ts` to automatically remove existing entities with the same ID before adding new ones.
*   **Proximity Streaming:** 
    *   Server now filters the initial `join_ok` NPC list to only include entities within 300 units of the player.
    *   Server now dynamically broadcasts nearby authoritative NPCs in `world_update` as the player moves.
*   **NPC Reaper:** Implemented a periodic background task on the server (every 60s) that deletes procedural NPCs more than 500 units away from any active player.

### Advanced Agent Autonomy
*   **Goal-Oriented Behavior:** Added `current_goal` to `NPCAgentState`. NPCs now set an internal mission after every conversation (e.g., "Survive the fight", "Sell a potion") and proactively steer the conversation toward it.
*   **Episodic Memory:** Agents now extract discrete, factual memories (e.g., "Player gave me a sword") stored as a list. This provides much sharper recall than a single text summary.
*   **Zero-Latency Pre-Check:** Replaced the LLM-based intent classifier with a Regex engine. Commands like "attack" or "trade" now trigger near-instant responses (bypassing the reasoning node).
*   **XML Prompt Engineering:** Reworked all prompts into a clean XML structure in `prompts.py`, with mission directives placed at the bottom to leverage LLM recency bias.

## 2. Technical Stability
*   **LangGraph Sequencing Fix:** Added unique UUID suffixes to fast-routed messages and tool calls. This prevents LangGraph from overwriting previous interactions, which was causing OpenAI `400 Bad Request` errors during fast typing.
*   **Test Suite Fixes:** Updated `MockChatModel` in `llm_fixtures.py` to return valid `ChatResult` and `ChatGeneration` objects, fixing `AttributeError` and `TypeError` in the test runner.
*   **Merge State:** Attempted to merge `main` and resolve conflicts in `ws/handler.py`, `EntityManager.ts`, and `ProceduralPopulator.ts`.

## 3. Current Blockers / Known Issues
*   **Vite Build Error:** User reported conflict markers in `ProceduralPopulator.ts:119`. Current investigation shows the file is clean in the workspace, suggesting a sync or caching issue between the "Development My Project" and "Development/My Project" directories.
*   **Directory Ambiguity:** The project exists in two similar paths: 
    1. `/Users/eduardo.pertierrapuche/Development My Project/world-of-prompcraft`
    2. `/Users/eduardo.pertierrapuche/Development/My Project/world-of-prompcraft`
    I have synchronized the source code from (1) to (2), but build tools might be looking at stale states.

## 4. Next Steps
*   [ ] Force a clean rebuild of the client.
*   [ ] Re-verify all files for literal conflict markers.
*   [ ] Ensure `main` is fully merged without any leftover markers.
