"""Server-side static world geometry: authored landmark footprints.

The server moves NPCs (see `npc_wander.py`) but historically knew nothing about
structures, so wandering NPCs could clip through buildings — worst inside the
authored town clusters (Fort Malaka, Teldrassil) where buildings are dense.

Those clusters' footprints already live in `world_manifest.json` under
`zones[*].architecture.landmarks[*].visual.metadata.footprint` (the same file
the server already reads for NPC definitions). This module loads them into a
cheap point-in-rectangle test so the wander loop can reject steps that would
enter a structure.

Scope (Phase B of the NPC-movement plan): authored landmarks only. Procedurally
generated buildings are placed client-side at runtime and are not known here —
they are sparse and out of scope until the client reports their footprints.
"""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass

from .npc_definitions import DATA_FILE

logger = logging.getLogger(__name__)

# NPC body half-width (m): footprints are inflated by this so the NPC's body,
# not just its center point, stays clear of the structure. Matches the client
# collision half-extent (~0.55) with a touch of slack.
DEFAULT_MARGIN = 0.6

# Footprints whose inflated half-extent is below this (m) are ignored: tiny props
# (campfires, signposts, stalls) shouldn't trap a wanderer, and their visual mesh
# barely blocks anyway. Keeps NPCs from freezing next to decorative clutter.
MIN_HALF_EXTENT = 1.0


@dataclass(frozen=True)
class Footprint:
    """An axis-rotated rectangle on the XZ plane, inflated by the NPC margin."""

    cx: float
    cz: float
    half_w: float  # half extent along the structure's local X (incl. margin)
    half_d: float  # half extent along the structure's local Z (incl. margin)
    cos: float  # cos(rot_y), cached for the inverse rotation
    sin: float  # sin(rot_y)
    bound_sq: float  # squared bounding radius for a cheap broad-phase reject

    def contains(self, x: float, z: float) -> bool:
        dx = x - self.cx
        dz = z - self.cz
        # Broad phase: outside the bounding circle can't be inside the rect.
        if dx * dx + dz * dz > self.bound_sq:
            return False
        # Rotate the point into the footprint's local frame (inverse rotation)
        # and test against the axis-aligned half-extents.
        lx = dx * self.cos + dz * self.sin
        lz = -dx * self.sin + dz * self.cos
        return abs(lx) <= self.half_w and abs(lz) <= self.half_d


class WorldGeometry:
    """Collection of static footprints with a blocked-point query."""

    def __init__(self, footprints: list[Footprint]) -> None:
        self._footprints = footprints

    @property
    def footprint_count(self) -> int:
        return len(self._footprints)

    def is_blocked(self, x: float, z: float) -> bool:
        """True if (x, z) falls inside any structure footprint."""
        return any(fp.contains(x, z) for fp in self._footprints)


def _build_footprint(
    position: list[float],
    rotation: list[float] | None,
    scale: float,
    fp: dict[str, float],
    margin: float,
) -> Footprint | None:
    width = float(fp.get("width", 0.0)) * scale
    depth = float(fp.get("depth", width)) * scale
    half_w = width / 2.0 + margin
    half_d = depth / 2.0 + margin
    if half_w < MIN_HALF_EXTENT and half_d < MIN_HALF_EXTENT:
        return None
    rot_y = float(rotation[1]) if rotation and len(rotation) >= 2 else 0.0
    bound = math.hypot(half_w, half_d)
    return Footprint(
        cx=float(position[0]),
        cz=float(position[2]),
        half_w=half_w,
        half_d=half_d,
        cos=math.cos(rot_y),
        sin=math.sin(rot_y),
        bound_sq=bound * bound,
    )


def load_world_geometry(margin: float = DEFAULT_MARGIN) -> WorldGeometry:
    """Load authored landmark footprints from the world manifest.

    Only `rect` footprints are present today; unknown shapes and footprint-less
    landmarks are skipped. Failures degrade to empty geometry (NPCs wander as
    before) rather than crashing the wander loop.
    """
    footprints: list[Footprint] = []
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:  # pragma: no cover - defensive
        logger.error(f"world geometry: failed to read manifest: {e}")
        return WorldGeometry(footprints)

    for zone in data.get("zones", {}).values():
        for lm in zone.get("architecture", {}).get("landmarks", []):
            fp = lm.get("visual", {}).get("metadata", {}).get("footprint")
            if not fp or fp.get("shape") != "rect":
                continue
            transform = lm.get("transform", {})
            built = _build_footprint(
                position=transform.get("position", [0.0, 0.0, 0.0]),
                rotation=transform.get("rotation"),
                scale=float(transform.get("scale", 1.0)),
                fp=fp,
                margin=margin,
            )
            if built is not None:
                footprints.append(built)

    logger.info(f"world geometry: loaded {len(footprints)} landmark footprints")
    return WorldGeometry(footprints)
