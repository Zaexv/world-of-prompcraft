"""World-modification tools for the WorldBuilder agent."""

from __future__ import annotations

import math
import random
import uuid
from typing import Any

from langchain_core.tools import tool

VALID_OBJECT_TYPES = frozenset(
    [
        "moonwell",
        "tower",
        "ruins",
        "campfire",
        "mushroom_cluster",
        "crystal_cluster",
        "ancient_tree",
        "altar",
        "runic_stone",
        "lantern",
        "wooden_fence",
        "pavilion",
        "bonfire",
        "portal_arch",
    ]
)


def create_world_builder_tools(pending_actions: list[Any]) -> list[Any]:
    """Create world-modification tools closed over pending_actions list."""

    @tool
    def spawn_structure(
        object_type: str,
        x: float,
        z: float,
        scale: float = 1.0,
        label: str = "",
    ) -> str:
        """Place a 3D structure or decoration in the game world at position (x, z).

        Args:
            object_type: Type of object. Must be one of:
                moonwell, tower, ruins, campfire, mushroom_cluster,
                crystal_cluster, ancient_tree, altar, runic_stone,
                lantern, wooden_fence, pavilion, bonfire, portal_arch.
            x: World X coordinate to place the object.
            z: World Z coordinate to place the object.
            scale: Size multiplier (default 1.0). Use 0.5 for small, 2.0 for large.
            label: Optional display label for the object.
        """
        if object_type not in VALID_OBJECT_TYPES:
            valid = ", ".join(sorted(VALID_OBJECT_TYPES))
            return f"Unknown object type '{object_type}'. Valid types: {valid}"

        object_id = f"wb_{uuid.uuid4().hex[:8]}"
        pending_actions.append(
            {
                "kind": "world_spawn",
                "params": {
                    "objectId": object_id,
                    "objectType": object_type,
                    "position": [x, 0, z],
                    "scale": scale,
                    "label": label or object_type,
                },
            }
        )
        return f"Placed {object_type} at ({x:.1f}, {z:.1f}) with id={object_id}"

    @tool
    def remove_structure(object_id: str) -> str:
        """Remove a previously placed world object by its ID.

        Args:
            object_id: The unique ID of the object to remove (starts with 'wb_').
        """
        pending_actions.append(
            {
                "kind": "world_remove",
                "params": {"objectId": object_id},
            }
        )
        return f"Removing object {object_id}"

    @tool
    def place_vegetation_cluster(
        vegetation_type: str,
        x: float,
        z: float,
        count: int = 5,
        radius: float = 4.0,
    ) -> str:
        """Place a cluster of vegetation objects scattered around a center point.

        Args:
            vegetation_type: Type of vegetation — "mushroom_cluster", "crystal_cluster",
                or "ancient_tree".
            x: Center X coordinate.
            z: Center Z coordinate.
            count: Number of objects to place (1-10).
            radius: Scatter radius in world units.
        """
        count = max(1, min(10, count))
        vtype = vegetation_type if vegetation_type in VALID_OBJECT_TYPES else "mushroom_cluster"
        for i in range(count):
            angle = (i / count) * math.pi * 2 + random.uniform(-0.3, 0.3)
            r = random.uniform(0.5, radius)
            ox = x + math.cos(angle) * r
            oz = z + math.sin(angle) * r
            object_id = f"wb_{uuid.uuid4().hex[:8]}"
            pending_actions.append(
                {
                    "kind": "world_spawn",
                    "params": {
                        "objectId": object_id,
                        "objectType": vtype,
                        "position": [ox, 0, oz],
                        "scale": random.uniform(0.7, 1.3),
                        "label": vtype,
                    },
                }
            )
        return f"Placed {count} {vtype} objects around ({x:.1f}, {z:.1f})"

    return [spawn_structure, remove_structure, place_vegetation_cluster]
