from __future__ import annotations

import math

# ── Zone design ──────────────────────────────────────────────────────────────
# Zones are DERIVED from the radial biome model used by the client
# (client/src/scene/Biomes.ts), not from overlapping rectangles. This guarantees
# zones never overlap:
#
#   1. Named LOCALE_DISCS (Makaleta Strande, Fort Malaka) are checked first. They
#      are placed so they never overlap each other.
#   2. A central disc resolves the hub spawn area.
#   3. Everything else falls back to the dominant biome sector — a clean
#      argmax-over-angle partition (boundaries at sector midpoints), so two ring
#      zones can never claim the same point.
#
# The angular targets and weight math below mirror Biomes.ts exactly so the
# client ZoneTracker and the server agree on zone names.
# ─────────────────────────────────────────────────────────────────────────────

# Biome-model constants (manifest defaults — see world_manifest.json environment).
_BIOME_START = 120.0
_TRANSITION_WIDTH = 100.0
_CENTER_RADIUS = 95.0

# Directional sector targets (radians; angle = atan2(z, x)).
_SECTORS: list[tuple[str, float]] = [
    ("Crystal Tundra", math.pi / 2),  # north
    ("Blasted Suarezlands", 0.0),  # east
    ("Moin Swamps", -math.pi / 2),  # south
    ("Malaka Area", -3 * math.pi / 4),  # southwest
    ("Tanis Desert", 3 * math.pi / 4),  # northwest
]

# Named inner locales that override the radial sector. Must not overlap.
# (name, x, z, radius)
_LOCALE_DISCS: list[tuple[str, float, float, float]] = [
    ("Makaleta Strande", 0.0, 0.0, 95.0),
    ("Fort Malaka", -210.0, -260.0, 135.0),
]

_DESCRIPTIONS: dict[str, str] = {
    "Makaleta Strande": (
        "A peaceful village at the heart of the world, where wise elders share ancient knowledge."
    ),
    "Fort Malaka": (
        "A fortified Mediterranean city built on ancient ley lines. White-walled "
        "casitas with terracotta roofs line palm-shaded streets, and the golden "
        "Playa de la Malagueta stretches along its southern shore."
    ),
    "Teldrassil Wilds": (
        "The ancient forest surrounding Makaleta Strande. Massive trees draped "
        "with glowing vines tower above a carpet of luminescent mushrooms. Wisps "
        "drift between the trunks."
    ),
    "Crystal Tundra": (
        "An endless frozen expanse to the north. Towering ice spires catch the "
        "moonlight, and the ground sparkles with crystalline frost."
    ),
    "Blasted Suarezlands": (
        "The volcanic east lands. Rivers of lava carve through obsidian fields "
        "and the air shimmers with scorching heat. Fire elementals and magma "
        "golems roam the jagged terrain."
    ),
    "Moin Swamps": (
        "Sprawling southern swamplands, shrouded in perpetual mist. Bioluminescent "
        "fungi illuminate murky waters and the air hums with strange life. Ancient "
        "secrets lie submerged in the bog."
    ),
    "Malaka Area": (
        "Sun-drenched plains and Mediterranean coastline to the southwest. Warm "
        "breezes carry the scent of wildflowers and sea salt."
    ),
    "Tanis Desert": (
        "Rolling dunes and wind-carved ridges to the northwest. Pale sand "
        "stretches to the horizon under a relentless sun."
    ),
}

# Exposed for parity with the previous module API (used by world __init__).
ZONES: list[dict[str, object]] = [
    {"name": name, "description": desc} for name, desc in _DESCRIPTIONS.items()
]


# ── Runtime helpers ───────────────────────────────────────────────────────────


def _directional_weight(angle: float, target: float) -> float:
    """Raised-cosine directional weight — mirrors Biomes.directionalWeight."""
    diff = angle - target
    while diff > math.pi:
        diff -= 2 * math.pi
    while diff < -math.pi:
        diff += 2 * math.pi
    half_width = math.pi * 0.30  # 54 degrees — mirror of Biomes.directionalWeight
    if abs(diff) > half_width:
        return 0.0
    return 0.5 + 0.5 * math.cos((diff / half_width) * math.pi)


def _dominant_sector(x: float, z: float) -> str:
    """Return the dominant biome-sector zone name at (x, z)."""
    dist = math.hypot(x, z)
    t = (dist - (_BIOME_START - _TRANSITION_WIDTH)) / _TRANSITION_WIDTH
    transition_t = min(1.0, max(0.0, t))
    center_weight = 1.0 - transition_t
    outer_weight = transition_t

    angle = math.atan2(z, x)

    best_name = "Teldrassil Wilds"
    best_weight = center_weight  # Teldrassil (center) contribution
    for name, target in _SECTORS:
        w = _directional_weight(angle, target) * outer_weight
        if w > best_weight:
            best_weight = w
            best_name = name
    return best_name


def get_zone(position: list[float]) -> str:
    """Return the zone name for a given world position.

    Named locale discs win first, then the central hub disc, then the dominant
    biome sector.
    """
    x = float(position[0]) if len(position) > 0 else 0.0
    z = float(position[2]) if len(position) > 2 else 0.0

    for name, dx, dz, radius in _LOCALE_DISCS:
        if (x - dx) ** 2 + (z - dz) ** 2 < radius * radius:
            return name

    if x * x + z * z < _CENTER_RADIUS * _CENTER_RADIUS:
        return "Makaleta Strande"

    return _dominant_sector(x, z)


def get_zone_description(zone_name: str) -> str:
    """Return the description for a named zone."""
    return _DESCRIPTIONS.get(zone_name, "An uncharted stretch of land.")
