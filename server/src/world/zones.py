from __future__ import annotations

ZONES: list[dict[str, object]] = [
    # ── Specific small zones (checked first — highest priority) ─────────────
    {
        "name": "Blasted Suarezlands",
        "description": "The mage district of Fort Malaka, a chaotic quarter crackling with arcane energy. Rogue spellcasters, eccentric wizards, and mystical scholars fill the streets. Glowing pylons hum with power and runic circles pulse underfoot.",
        "min_x": -80.0,
        "max_x": 80.0,
        "min_z": -155.0,
        "max_z": -90.0,
    },
    {
        "name": "Fort Malaka",
        "description": "A fortified Mediterranean city to the south of Elders' Village, inspired by Málaga and built around ancient arcane ley lines. White-walled casitas with terracotta roofs line palm-shaded streets. The infamous Blasted Suarezlands mage district lies at its heart, and the golden Playa de la Malagueta stretches along its southern shore.",
        "min_x": -150.0,
        "max_x": 150.0,
        "min_z": -400.0,
        "max_z": -80.0,
    },
    {
        "name": "Elders' Village",
        "description": "A peaceful village at the heart of the world, where wise elders share ancient knowledge.",
        "min_x": -120.0,
        "max_x": 120.0,
        "min_z": -80.0,
        "max_z": 120.0,
    },
    {
        "name": "Dark Forest",
        "description": "A foreboding forest to the north, thick with shadows and strange whispers.",
        "min_x": -200.0,
        "max_x": 200.0,
        "min_z": 120.0,
        "max_z": 400.0,
    },
    {
        "name": "Ember Peaks",
        "description": "Volcanic mountains to the east, glowing with molten rivers and fire spirits.",
        "min_x": 120.0,
        "max_x": 400.0,
        "min_z": -200.0,
        "max_z": 200.0,
    },
    {
        "name": "Crystal Lake",
        "description": "A serene lake to the west, its waters shimmer with magical energy.",
        "min_x": -400.0,
        "max_x": -120.0,
        "min_z": -200.0,
        "max_z": 200.0,
    },
    # ── Expanded ecosystem zones (boundless world) ──────────────────────────
    {
        "name": "Ember Wastes",
        "description": "A vast volcanic wasteland stretching to the east. Rivers of lava carve through obsidian fields, and the air shimmers with scorching heat. Fire elementals and magma golems roam the jagged terrain.",
        "min_x": 400.0,
        "max_x": 99999.0,
        "min_z": -99999.0,
        "max_z": 99999.0,
    },
    {
        "name": "Crystal Tundra",
        "description": "An endless frozen expanse to the north. Towering ice spires catch the moonlight, and the ground sparkles with crystalline frost. Ancient beings sleep beneath the glaciers.",
        "min_x": -99999.0,
        "max_x": 99999.0,
        "min_z": 400.0,
        "max_z": 99999.0,
    },
    {
        "name": "Twilight Marsh",
        "description": "A sprawling swampland to the south, shrouded in perpetual mist. Bioluminescent fungi illuminate murky waters, and the air hums with strange life. Ancient secrets lie submerged in the bog.",
        "min_x": -99999.0,
        "max_x": 99999.0,
        "min_z": -99999.0,
        "max_z": -400.0,
    },
    {
        "name": "Sunlit Meadows",
        "description": "Rolling golden grasslands extending westward to the horizon. Warm breezes carry the scent of wildflowers, and gentle creatures graze beneath a sky touched by eternal sunset.",
        "min_x": -99999.0,
        "max_x": -400.0,
        "min_z": -99999.0,
        "max_z": 99999.0,
    },
    # ── Catch-all zone — MUST be last so specific zones take priority ───────
    {
        "name": "Teldrassil Wilds",
        "description": "The ancient forest surrounding the Elders' Village. Massive trees draped with glowing vines tower above a carpet of luminescent mushrooms. Wisps drift between the trunks.",
        "min_x": -400.0,
        "max_x": 400.0,
        "min_z": -400.0,
        "max_z": 400.0,
    },
]


def get_zone(position: list[float]) -> str:
    """Return the zone name for a given world position.

    Zones are checked in order — more specific zones (smaller areas)
    are listed first so they take priority over the larger catch-all zone.
    Uses exclusive upper bounds (< on max) to prevent overlapping matches
    on shared edges, except for the last zone (Teldrassil Wilds) which
    uses inclusive bounds as the catch-all.
    Falls back to 'Wilderness' if no zone matches.
    """
    x = position[0] if len(position) > 0 else 0.0
    z = position[2] if len(position) > 2 else 0.0

    last_idx = len(ZONES) - 1
    for i, zone in enumerate(ZONES):
        min_x = zone["min_x"]
        max_x = zone["max_x"]
        min_z = zone["min_z"]
        max_z = zone["max_z"]
        if i < last_idx:
            # Exclusive upper bounds to avoid overlap on shared edges
            if min_x <= x < max_x and min_z <= z < max_z:  # type: ignore[operator]
                return str(zone["name"])
        else:
            # Last zone (catch-all): inclusive upper bounds
            if min_x <= x <= max_x and min_z <= z <= max_z:  # type: ignore[operator]
                return str(zone["name"])

    return "Wilderness"


def get_zone_description(zone_name: str) -> str:
    """Return the description for a named zone."""
    for zone in ZONES:
        if zone["name"] == zone_name:
            return str(zone["description"])
    return "An uncharted stretch of land."
