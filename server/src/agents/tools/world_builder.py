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
_VALID_SHAPES = frozenset(["box", "cylinder", "sphere", "cone", "pyramid", "capsule", "torus"])

# Optional per-part material finishes the client knows how to render.
_VALID_MATS = frozenset(["metal", "glow", "glass"])


def _darken(hex_color: str, factor: float = 0.72) -> str:
    """Darken a #rrggbb color; fall back to a brown if unparseable."""
    try:
        h = hex_color.lstrip("#")
        r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    except (ValueError, IndexError):
        return "#5d3a1a"
    return f"#{int(r * factor):02x}{int(g * factor):02x}{int(b * factor):02x}"


def _quadruped_parts(
    body_length: float,
    body_radius: float,
    leg_length: float,
    color: str,
    ear_style: str,
) -> list[dict[str, Any]]:
    """Deterministic quadruped anatomy: body along x, head at +x, tail at -x.

    The LLM only chooses proportions and colors — the layout itself is fixed so
    legs, eyes and ears always land in the right place regardless of how the
    model is feeling today.
    """
    length = max(0.3, min(4.0, body_length))
    r = max(0.1, min(1.0, body_radius))
    leg_len = max(0.05, min(1.5, leg_length))
    accent = _darken(color)
    body_y = leg_len + r
    half = length / 2

    head_r = r * 1.15
    head_x = half + head_r * 0.4
    head_y = body_y + r * 0.7

    parts: list[dict[str, Any]] = [
        {
            "shape": "capsule",
            "size": [r, length],
            "position": [0, body_y, 0],
            "axis": "x",
            "color": color,
        },
        {
            "shape": "sphere",
            "size": [head_r, head_r, head_r],
            "position": [head_x, head_y, 0],
            "color": color,
        },
        # snout pokes forward from the head
        {
            "shape": "capsule",
            "size": [head_r * 0.35, head_r * 1.1],
            "position": [head_x + head_r * 0.85, head_y - head_r * 0.2, 0],
            "axis": "x",
            "color": accent,
        },
        # eyes on the front face, mirrored across z
        {
            "shape": "sphere",
            "size": [head_r * 0.16] * 3,
            "position": [head_x + head_r * 0.8, head_y + head_r * 0.3, head_r * 0.45],
            "color": "#1a1a1a",
        },
        {
            "shape": "sphere",
            "size": [head_r * 0.16] * 3,
            "position": [head_x + head_r * 0.8, head_y + head_r * 0.3, -head_r * 0.45],
            "color": "#1a1a1a",
        },
    ]

    if ear_style == "floppy":
        for side in (1.0, -1.0):
            parts.append(
                {
                    "shape": "sphere",
                    "size": [head_r * 0.2, head_r * 0.55, head_r * 0.32],
                    "position": [
                        head_x - head_r * 0.15,
                        head_y + head_r * 0.35,
                        side * head_r * 0.95,
                    ],
                    "color": accent,
                }
            )
    else:  # pointy
        for side in (1.0, -1.0):
            parts.append(
                {
                    "shape": "cone",
                    "size": [head_r * 0.28, head_r * 0.7],
                    "position": [
                        head_x - head_r * 0.15,
                        head_y + head_r * 1.05,
                        side * head_r * 0.5,
                    ],
                    "color": accent,
                }
            )

    leg_x = max(half - r * 0.6, 0.05)
    leg_z = r * 0.65
    for sx in (1.0, -1.0):
        for sz in (1.0, -1.0):
            parts.append(
                {
                    "shape": "cylinder",
                    "size": [r * 0.32, leg_len],
                    "position": [sx * leg_x, leg_len / 2, sz * leg_z],
                    "color": color,
                }
            )

    parts.append(
        {
            "shape": "capsule",
            "size": [r * 0.18, r * 1.6],
            "position": [-(half + r * 0.4), body_y + r * 0.6, 0],
            "axis": "x",
            "rotation": [0.0, 0.0, 0.7],
            "color": accent,
        }
    )
    return parts


def _insect_parts(
    body_length: float, body_radius: float, color: str, accent: str
) -> list[dict[str, Any]]:
    """Hovering insect (bee, fly, beetle): striped abdomen, glass wings, stinger."""
    length = max(0.2, min(2.0, body_length))
    r = max(0.06, min(0.6, body_radius))
    y = r + 0.45  # hovers above the ground
    parts: list[dict[str, Any]] = [
        # abdomen at the back, with two accent stripe bands
        {
            "shape": "sphere",
            "size": [length * 0.35, r, r],
            "position": [-length * 0.25, y, 0],
            "color": color,
        },
        {
            "shape": "sphere",
            "size": [length * 0.07, r * 1.04, r * 1.04],
            "position": [-length * 0.18, y, 0],
            "color": accent,
        },
        {
            "shape": "sphere",
            "size": [length * 0.07, r * 1.04, r * 1.04],
            "position": [-length * 0.38, y, 0],
            "color": accent,
        },
        # thorax + head toward +x
        {
            "shape": "sphere",
            "size": [r * 0.9] * 3,
            "position": [length * 0.18, y, 0],
            "color": color,
        },
        {
            "shape": "sphere",
            "size": [r * 0.65] * 3,
            "position": [length * 0.45, y + r * 0.1, 0],
            "color": accent,
        },
        # big insect eyes, mirrored across z
        {
            "shape": "sphere",
            "size": [r * 0.22] * 3,
            "position": [length * 0.55, y + r * 0.25, r * 0.35],
            "color": "#1a1a1a",
        },
        {
            "shape": "sphere",
            "size": [r * 0.22] * 3,
            "position": [length * 0.55, y + r * 0.25, -r * 0.35],
            "color": "#1a1a1a",
        },
        # translucent wings above the thorax, mirrored across z
        {
            "shape": "sphere",
            "size": [length * 0.28, r * 0.07, r * 0.5],
            "position": [length * 0.05, y + r * 0.95, r * 0.75],
            "rotation": [0.25, 0.0, 0.0],
            "color": "#eef6ff",
            "mat": "glass",
        },
        {
            "shape": "sphere",
            "size": [length * 0.28, r * 0.07, r * 0.5],
            "position": [length * 0.05, y + r * 0.95, -r * 0.75],
            "rotation": [-0.25, 0.0, 0.0],
            "color": "#eef6ff",
            "mat": "glass",
        },
        # stinger pointing backwards
        {
            "shape": "cone",
            "size": [r * 0.25, r * 0.7],
            "position": [-length * 0.62, y, 0],
            "rotation": [0.0, 0.0, 1.57],
            "color": accent,
        },
    ]
    return parts


def _bird_parts(
    body_length: float, body_radius: float, leg_length: float, color: str, accent: str
) -> list[dict[str, Any]]:
    """Standing bird: ellipsoid body, beak, folded wings, two thin legs."""
    length = max(0.2, min(2.5, body_length))
    r = max(0.08, min(0.8, body_radius))
    leg_len = max(0.05, min(1.0, leg_length))
    y = leg_len + r
    head_y = y + r * 0.85
    head_x = length * 0.42
    parts: list[dict[str, Any]] = [
        {
            "shape": "sphere",
            "size": [length * 0.5, r, r * 0.85],
            "position": [0, y, 0],
            "color": color,
        },
        {
            "shape": "sphere",
            "size": [r * 0.72] * 3,
            "position": [head_x, head_y, 0],
            "color": color,
        },
        # beak pointing forward (+x)
        {
            "shape": "cone",
            "size": [r * 0.28, r * 0.9],
            "position": [head_x + r * 0.95, head_y, 0],
            "rotation": [0.0, 0.0, -1.57],
            "color": "#e69500",
        },
        {
            "shape": "sphere",
            "size": [r * 0.14] * 3,
            "position": [head_x + r * 0.55, head_y + r * 0.25, r * 0.4],
            "color": "#1a1a1a",
        },
        {
            "shape": "sphere",
            "size": [r * 0.14] * 3,
            "position": [head_x + r * 0.55, head_y + r * 0.25, -r * 0.4],
            "color": "#1a1a1a",
        },
        # folded wings on the flanks
        {
            "shape": "sphere",
            "size": [length * 0.32, r * 0.45, r * 0.16],
            "position": [-length * 0.05, y + r * 0.25, r * 0.85],
            "color": accent,
        },
        {
            "shape": "sphere",
            "size": [length * 0.32, r * 0.45, r * 0.16],
            "position": [-length * 0.05, y + r * 0.25, -r * 0.85],
            "color": accent,
        },
        # tail feathers angled up at the back
        {
            "shape": "sphere",
            "size": [length * 0.22, r * 0.12, r * 0.45],
            "position": [-length * 0.52, y + r * 0.4, 0],
            "rotation": [0.0, 0.0, 0.5],
            "color": accent,
        },
    ]
    for side in (1.0, -1.0):
        parts.append(
            {
                "shape": "cylinder",
                "size": [r * 0.1, leg_len],
                "position": [length * 0.05, leg_len / 2, side * r * 0.35],
                "color": "#e69500",
            }
        )
    return parts


def _fish_parts(
    body_length: float, body_radius: float, color: str, accent: str
) -> list[dict[str, Any]]:
    """Fish: laterally flattened body, tail fin, dorsal fin (hovers as if swimming)."""
    length = max(0.2, min(3.0, body_length))
    r = max(0.06, min(0.8, body_radius))
    y = r + 0.35
    parts: list[dict[str, Any]] = [
        {
            "shape": "sphere",
            "size": [length * 0.5, r, r * 0.45],
            "position": [0, y, 0],
            "color": color,
        },
        # tail fin, vertical lobe at the back
        {
            "shape": "sphere",
            "size": [length * 0.16, r * 0.85, r * 0.08],
            "position": [-length * 0.58, y, 0],
            "color": accent,
        },
        # dorsal fin on top
        {
            "shape": "sphere",
            "size": [length * 0.2, r * 0.5, r * 0.07],
            "position": [0, y + r * 0.85, 0],
            "color": accent,
        },
        # side fins, mirrored across z
        {
            "shape": "sphere",
            "size": [length * 0.12, r * 0.08, r * 0.4],
            "position": [length * 0.1, y - r * 0.3, r * 0.5],
            "rotation": [0.5, 0.0, 0.0],
            "color": accent,
        },
        {
            "shape": "sphere",
            "size": [length * 0.12, r * 0.08, r * 0.4],
            "position": [length * 0.1, y - r * 0.3, -r * 0.5],
            "rotation": [-0.5, 0.0, 0.0],
            "color": accent,
        },
        {
            "shape": "sphere",
            "size": [r * 0.13] * 3,
            "position": [length * 0.38, y + r * 0.2, r * 0.38],
            "color": "#1a1a1a",
        },
        {
            "shape": "sphere",
            "size": [r * 0.13] * 3,
            "position": [length * 0.38, y + r * 0.2, -r * 0.38],
            "color": "#1a1a1a",
        },
    ]
    return parts


def set_known_mesh_types(types: list[str]) -> None:
    """Replace the known mesh catalog (called when a client sends its registry)."""
    KNOWN_MESH_TYPES.clear()
    KNOWN_MESH_TYPES.update(t for t in types if isinstance(t, str) and t)


def _bounding_radius(part: dict[str, Any]) -> float:
    """Approximate radius of the sphere enclosing a part (for burial checks)."""
    s: list[float] = part["size"]
    if part["shape"] == "sphere":
        return max(s)
    if part["shape"] in ("cylinder", "cone", "pyramid", "capsule"):
        radius = s[0]
        height = s[1] if len(s) > 1 else s[0]
        return max(radius, height / 2)
    return max(s) / 2  # box: half the largest dimension


def _unbury_details(parts: list[dict[str, Any]]) -> None:
    """Push small parts fully swallowed by a bigger sphere out to its surface.

    Local models routinely place detail parts (eyes, ears, gems) with centers
    too close to the parent part's center; a part wholly inside another is
    invisible. Re-anchor the small part's center on the parent's surface so it
    pokes out, preserving the direction the model chose.
    """
    spheres = [p for p in parts if p["shape"] == "sphere"]
    for small in parts:
        r_small = _bounding_radius(small)
        for big in spheres:
            if big is small:
                continue
            r_big = min(big["size"])  # conservative for ellipsoids
            if r_small >= r_big:
                continue
            dx = small["position"][0] - big["position"][0]
            dy = small["position"][1] - big["position"][1]
            dz = small["position"][2] - big["position"][2]
            d = math.sqrt(dx * dx + dy * dy + dz * dz)
            if d + r_small >= r_big:
                continue  # already pokes out of this part
            if d == 0:  # concentric — no direction to preserve, push forward
                dx, d = 1.0, 1.0
            k = r_big / d
            small["position"] = [
                big["position"][0] + dx * k,
                big["position"][1] + dy * k,
                big["position"][2] + dz * k,
            ]
            break


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
    def create_creature(
        label: str,
        x: float,
        z: float,
        kind: str = "quadruped",
        color: str = "#8B4513",
        body_length: float = 1.0,
        body_radius: float = 0.25,
        leg_length: float = 0.35,
        ear_style: str = "pointy",
        scale: float = 1.0,
    ) -> str:
        """Create an animal with correct anatomy. ALWAYS prefer this over
        create_custom_mesh for any animal — the body plan is laid out
        automatically; you only choose kind, proportions and look.

        Args:
            label: Display name (e.g. "Perro Salchicha").
            x: World X coordinate.
            z: World Z coordinate.
            kind: Body plan — "quadruped" (dog, cat, horse, pig, fox, sheep),
                "insect" (bee, fly, beetle, butterfly), "bird" (chicken, duck,
                eagle), "fish" (any fish).
            color: Body color hex (e.g. "#8B4513" brown dog, "#FFD700" bee yellow).
            body_length: Body length in meters. Dachshund 1.3, horse 2.2,
                cat 0.7, bee 0.5.
            body_radius: Body thickness. Slim cat 0.15, plump pig 0.4, bee 0.15.
            leg_length: Leg height (quadruped/bird). Dachshund 0.12, horse 1.0,
                cat 0.25. Ignored for insect/fish (they hover/swim).
            ear_style: Quadrupeds only — "pointy" (cat, fox, horse) or
                "floppy" (dachshund, beagle).
            scale: Overall size multiplier (default 1.0).
        """
        accent = _darken(str(color))
        kind_norm = str(kind).lower()
        if kind_norm == "insect":
            parts = _insect_parts(float(body_length), float(body_radius), str(color), accent)
        elif kind_norm == "bird":
            parts = _bird_parts(
                float(body_length), float(body_radius), float(leg_length), str(color), accent
            )
        elif kind_norm == "fish":
            parts = _fish_parts(float(body_length), float(body_radius), str(color), accent)
        else:
            parts = _quadruped_parts(
                body_length=float(body_length),
                body_radius=float(body_radius),
                leg_length=float(leg_length),
                color=str(color),
                ear_style="floppy" if str(ear_style).lower().startswith("flop") else "pointy",
            )
        object_id = f"wb_{uuid.uuid4().hex[:8]}"
        pending_actions.append(
            {
                "kind": "world_spawn",
                "params": {
                    "objectId": object_id,
                    "objectType": "custom",
                    "position": [x, 0, z],
                    "scale": scale,
                    "label": label or "creature",
                    "spec": {"parts": parts},
                },
            }
        )
        return f"Created creature '{label}' at ({x:.1f}, {z:.1f}) with id={object_id}"

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
                - shape: one of "box", "cylinder", "sphere", "cone", "pyramid",
                    "capsule", "torus".
                - size: [x, y, z] dimensions in world units (box), or
                    [radius, height] for cylinder/cone/pyramid/capsule,
                    [rx, ry, rz] for sphere (unequal radii make an ellipsoid —
                    best for organic shapes like bodies, heads, leaves),
                    or [radius, tube_radius] for torus.
                - position: [x, y, z] local offset from the object base (y is up).
                - color: hex string like "#cc2233".
                - axis: optional "x" or "z". Capsules, cylinders and cones stand
                    UPRIGHT by default — set axis to lay one horizontally along
                    that axis (animal bodies, fallen logs, pipes).
                - rotation: optional [x, y, z] euler radians for free tilting.
                - mat: optional finish — "metal" (shiny), "glow" (emissive),
                    "glass" (translucent). Omit for matte.
                A part fully inside a bigger part is INVISIBLE — small details
                    (eyes, buttons, gems) must poke out of the surface they sit
                    on: place their center about one parent-radius away from the
                    parent's center.
                Example horizontal body: {"shape": "capsule", "size": [0.3, 1.4],
                    "position": [0, 0.4, 0], "axis": "x", "color": "#8B4513"}
                    spans x from -0.7 to 0.7 at height 0.4. Head (sphere radius
                    0.25) at [0.7, 0.55, 0]; eyes (radius 0.05) ON its surface at
                    [0.93, 0.62, 0.1] and [0.93, 0.62, -0.1]; legs below at
                    [0.5, 0.15, 0.15], [0.5, 0.15, -0.15], [-0.5, 0.15, 0.15],
                    [-0.5, 0.15, -0.15].
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
                "position": [float(v) for v in raw.get("position", [0, 0, 0])][:3]
                or [0.0, 0.0, 0.0],
                "color": str(raw.get("color", "#aaaaaa")),
            }
            rot = raw.get("rotation")
            if isinstance(rot, list) and len(rot) >= 3:
                part["rotation"] = [float(rot[0]), float(rot[1]), float(rot[2])]
            axis = raw.get("axis")
            if axis in ("x", "z"):  # "y" is the upright default — omit it
                part["axis"] = axis
            mat = raw.get("mat")
            if isinstance(mat, str) and mat in _VALID_MATS:
                part["mat"] = mat
            clean_parts.append(part)

        if not clean_parts:
            return "Cannot create a custom mesh with no valid parts."

        _unbury_details(clean_parts)

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

    return [
        spawn_structure,
        create_creature,
        create_custom_mesh,
        remove_structure,
        place_vegetation_cluster,
    ]
