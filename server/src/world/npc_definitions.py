"""Data-driven NPC definitions loaded from world_manifest.json."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Path to the data file
# In Docker, we mount to /shared. Locally, we use relative paths.
DOCKER_PATH = "/shared/data/world_manifest.json"
LOCAL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "shared", "data", "world_manifest.json"
)

DATA_FILE = DOCKER_PATH if os.path.exists(DOCKER_PATH) else LOCAL_PATH


def load_npc_definitions() -> dict[str, dict[str, Any]]:
    """Load NPC definitions from the World Manifest JSON file."""
    if not os.path.exists(DATA_FILE):
        logger.error(f"World manifest NOT FOUND at: {DATA_FILE}")
        return {}

    try:
        with open(DATA_FILE) as f:
            data = json.load(f)
    except Exception as e:
        logger.error(f"Failed to parse world manifest: {e}")
        return {}

    npc_registry: dict[str, dict[str, Any]] = {}

    # Version 2.1.0+: Zonal Hybrid Structure
    zones = data.get("zones", {})
    for zone_id, zone_data in zones.items():
        population = zone_data.get("population", {})
        npcs = population.get("npcs", [])
        for n in npcs:
            # Flatten the nested structure for backward compatibility with the legacy engine
            npc_registry[n["id"]] = {
                "id": n["id"],
                "name": n["identity"]["name"],
                "role": n["identity"].get("role", "citizen"),
                "position": n["transform"]["position"],
                "initial_hp": n["stats"].get("max_hp", 100),
                "personality_key": n["ai"].get("personality_key", n["id"]),
                "zone_id": zone_id,
            }

    return npc_registry


def get_npc_definitions() -> dict[str, dict[str, Any]]:
    """Get the current NPC definitions from the manifest."""
    return load_npc_definitions()


# For backward compatibility
NPC_DEFINITIONS = load_npc_definitions()
