# How to Add NPCs and Lore to World of Promptcraft

This guide explains what information you should provide to the AI (Gemini CLI) so it can autonomously create, register, and integrate new NPCs and lore into the game world.

Instead of writing code or JSON, focus on providing a **Character Package** or a **Lore Briefing**. The AI will handle the technical implementation (updating manifests, personality templates, and agent registries).

---

## 1. The NPC Character Package

To create a high-quality NPC, provide the following details:

### A. Identity & Core Stats
*   **Name:** (e.g., "Ignathar the Ancient", "Paco el Churrero")
*   **Role:** (e.g., Merchant, Quest Giver, Guard, Hostile Boss, Lore Keeper)
*   **Level & HP:** A rough idea of their power level (e.g., "Level 60 Boss", "Level 5 Civilian").
*   **Location:** Where should they appear? (e.g., "In the center of Fort Malaka", "Near the lava pools in Ember Wastes").

### B. Personality & Voice (The "Vibe")
This is the most important part for the AI. Describe how they talk and act.
*   **Archetype:** (e.g., "Gruff but kind", "Arrogant and poetic", "Anxious gossip")
*   **Speech Patterns:** (e.g., "Speaks with a thick Andalusian accent", "Uses archaic English like 'thee' and 'thou'", "Always speaks in riddles").
*   **Key Traits:** (e.g., "Obsessed with perfect oil temperature", "Contemptuous of mortals", "Treats everyone like family").

### C. Lore & Backstory
How does this NPC fit into the world?
*   **Origin:** Where do they come from?
*   **Motivations:** What do they want? (e.g., "To protect the Ember Crown", "To sell the best churros in the realm").
*   **Relationships:** Do they know other NPCs? (e.g., "Has a friendly rivalry with Aurelia", "Fears the mages in the Suarezlands").

### D. Mechanics & Behavior
How should they react to the player?
*   **Greetings:** (e.g., "Waves warmly and says '¡Hola, cariño!'", "Threatens the player with fire if they get too close").
*   **Combat Triggers:** When do they attack? (e.g., "Attacks if insulted", "Attacks if the player touches the treasure").
*   **Tool Usage:** Specific actions they should take (e.g., "Spawns smoke effects while frying", "Heals the player if they answer a riddle correctly").

### E. Inventory or Quests (If applicable)
*   **Shop Items:** List of items, descriptions, and prices.
*   **Quest Details:** Quest name, what the player needs to do, and the reward.

---

## 2. World Lore & Knowledge Ingestion

If you want to expand the world's history or local legends without necessarily adding a specific NPC, provide a **Lore Briefing**:

*   **Historical Events:** (e.g., "The Great Shattering that created the Floating Isles").
*   **Geographic Lore:** (e.g., "The whispers heard in the Twilight Marsh are the ghosts of ancient mages").
*   **Cultural Rules:** (e.g., "In Teldrassil, it is considered a crime to harm a Moon Spider").
*   **Magic Systems:** How magic works in a specific region.

---

## 3. Example Request

Here is an example of what you can tell the AI:

> "Add a new NPC named **'El Tito de la Bahía'**. He's a retired pirate who now runs a small bait shop on the docks of Fort Malaka. He's very jolly but loses his temper if someone calls him a 'landlubber'. He should speak like a sailor, using words like 'ahoy', 'scallywag', and 'matey'. He sells 'Magic Bait' for 10 gold and 'Rusty Hooks' for 2 gold. He should use the 'wave' emote when players arrive and 'laugh' if they buy something. Put him near the water at coordinates [-120, 0, -290]."

---

## 4. What Happens Next?

Once you provide this info, the AI will:
1.  **Register the NPC** in `shared/data/world_manifest.json`.
2.  **Create a Personality Template** in `server/src/agents/personalities/templates.py`.
3.  **Configure the LangGraph Agent** so the NPC can interact with players using the defined voice and tools.
4.  **Update the RAG Knowledge Base** if you provided global lore, so other NPCs might eventually "know" about it.

---

**Ready to add a character? Just describe them to me!**
