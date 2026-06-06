"""World-modification tools for the WorldBuilder agent."""

from __future__ import annotations

import math
import random
import uuid
from typing import Any

from langchain_core.tools import tool

# The client mesh registry is the single source of truth for placeable types.
# It is sent by each client on join and stored here so the agent can place any
# of the 400+ registered meshes — not a hardcoded subset. Empty until the first
# client joins; while empty, spawn_structure accepts any type and the client
# falls back to a visible marker for anything it can't build.
KNOWN_MESH_TYPES: set[str] = set()

# Primitive shapes the generative create_custom_mesh tool may compose.
_VALID_SHAPES = frozenset(["box", "cylinder", "sphere", "cone", "pyramid"])


def set_known_mesh_types(types: list[str]) -> None:
    """Replace the known mesh catalog (called when a client sends its registry)."""
    KNOWN_MESH_TYPES.clear()
    KNOWN_MESH_TYPES.update(t for t in types if isinstance(t, str) and t)


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
        """Place a pre-made 3D structure or decoration from the world catalog at (x, z).

        Prefer this for anything that exists in the catalog (towers, temples, houses,
        trees, lanterns, etc.). Use create_custom_mesh only for novel shapes the
        catalog lacks.

        Args:
            object_type: Catalog type id (e.g. "tower", "elven_tower", "moonwell",
                "ancient_tree", "malaka_house"). See the catalog provided in context.
            x: World X coordinate to place the object.
            z: World Z coordinate to place the object.
            scale: Size multiplier (default 1.0). Use 0.5 for small, 2.0 for large.
            label: Optional display label for the object.
        """
        # Always emit the spawn. If the type isn't in the catalog the client
        # renders a visible marker rather than dropping the object silently — a
        # near-miss id must never result in "nothing happened".
        unknown = bool(KNOWN_MESH_TYPES) and object_type not in KNOWN_MESH_TYPES
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
        if unknown:
            return (
                f"Placed '{object_type}' at ({x:.1f}, {z:.1f}) as a placeholder marker "
                f"(not in catalog) with id={object_id}. Use create_custom_mesh for novel shapes."
            )
        return f"Placed {object_type} at ({x:.1f}, {z:.1f}) with id={object_id}"

    @tool
    def create_custom_mesh(
        label: str,
        x: float,
        z: float,
        parts: list[dict[str, Any]],
        scale: float = 1.0,
    ) -> str:
        """Build a brand-new object out of primitive shapes when nothing in the catalog fits.

        Compose the object from simple parts. The client renders each part as a
        colored mesh, stacked at the given local offsets, then places the whole
        group at (x, z) snapped to the ground.

        Args:
            label: Display name for the new object (e.g. "Crimson Obelisk").
            x: World X coordinate.
            z: World Z coordinate.
            parts: List of primitive parts. Each is a dict:
                - shape: one of "box", "cylinder", "sphere", "cone", "pyramid".
                - size: [x, y, z] dimensions in world units (box), or
                    [radius, height, radius] for cylinder/cone/pyramid,
                    or [radius] for sphere.
                - position: [x, y, z] local offset from the object base (y is up).
                - color: hex string like "#cc2233".
                - rotation: optional [x, y, z] euler radians.
                Example part: {"shape": "box", "size": [2, 1, 2],
                    "position": [0, 0.5, 0], "color": "#3344cc"}
            scale: Overall size multiplier (default 1.0).
        """
        clean_parts: list[dict[str, Any]] = []
        for raw in parts[:32]:  # cap part count to keep payloads sane
            if not isinstance(raw, dict):
                continue
            shape = str(raw.get("shape", "box"))
            if shape not in _VALID_SHAPES:
                shape = "box"
            part: dict[str, Any] = {
                "shape": shape,
                "size": [float(v) for v in raw.get("size", [1, 1, 1])][:3] or [1.0, 1.0, 1.0],
                "position": [float(v) for v in raw.get("position", [0, 0, 0])][:3] or [0.0, 0.0, 0.0],
                "color": str(raw.get("color", "#aaaaaa")),
            }
            rot = raw.get("rotation")
            if isinstance(rot, list) and len(rot) >= 3:
                part["rotation"] = [float(rot[0]), float(rot[1]), float(rot[2])]
            clean_parts.append(part)

        if not clean_parts:
            return "Cannot create a custom mesh with no valid parts."

        object_id = f"wb_{uuid.uuid4().hex[:8]}"
        pending_actions.append(
            {
                "kind": "world_spawn",
                "params": {
                    "objectId": object_id,
                    "objectType": "custom",
                    "position": [x, 0, z],
                    "scale": scale,
                    "label": label or "custom creation",
                    "spec": {"parts": clean_parts},
                },
            }
        )
        return (
            f"Created custom mesh '{label}' from {len(clean_parts)} parts "
            f"at ({x:.1f}, {z:.1f}) with id={object_id}"
        )

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
        """Place a cluster of vegetation/prop objects scattered around a center point.

        Args:
            vegetation_type: Catalog type to scatter (e.g. "ancient_tree",
                "mushroom_cluster", "crystal_cluster").
            x: Center X coordinate.
            z: Center Z coordinate.
            count: Number of objects to place (1-10).
            radius: Scatter radius in world units.
        """
        count = max(1, min(10, count))
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
                        "objectType": vegetation_type,
                        "position": [ox, 0, oz],
                        "scale": random.uniform(0.7, 1.3),
                        "label": vegetation_type,
                    },
                }
            )
        return f"Placed {count} {vegetation_type} objects around ({x:.1f}, {z:.1f})"

    return [spawn_structure, create_custom_mesh, remove_structure, place_vegetation_cluster]
