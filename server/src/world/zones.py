from __future__ import annotations

ZONES: list[dict] = [
    {
        "name": "Elders' Village",
        "description": "A peaceful village at the heart of the world, where wise elders share ancient knowledge.",
        "min_x": -50.0,
        "max_x": 50.0,
        "min_z": -50.0,
        "max_z": 50.0,
    },
    {
        "name": "Dark Forest",
        "description": "A foreboding forest to the north, thick with shadows and strange whispers.",
        "min_x": -100.0,
        "max_x": 100.0,
        "min_z": 50.0,
        "max_z": 200.0,
    },
    {
        "name": "Ember Peaks",
        "description": "Volcanic mountains to the east, glowing with molten rivers and fire spirits.",
        "min_x": 50.0,
        "max_x": 200.0,
        "min_z": -100.0,
        "max_z": 100.0,
    },
    {
        "name": "Crystal Lake",
        "description": "A serene lake to the west, its waters shimmer with magical energy.",
        "min_x": -200.0,
        "max_x": -50.0,
        "min_z": -100.0,
        "max_z": 100.0,
    },
    # ── Expanded ecosystem zones (boundless world) ──────────────────────────
    {
        "name": "Ember Wastes",
        "description": "A vast volcanic wasteland stretching to the east. Rivers of lava carve through obsidian fields, and the air shimmers with scorching heat. Fire elementals and magma golems roam the jagged terrain.",
        "min_x": 200.0,
        "max_x": 99999.0,
        "min_z": -99999.0,
        "max_z": 99999.0,
    },
    {
        "name": "Crystal Tundra",
        "description": "An endless frozen expanse to the north. Towering ice spires catch the moonlight, and the ground sparkles with crystalline frost. Ancient beings sleep beneath the glaciers.",
        "min_x": -99999.0,
        "max_x": 99999.0,
        "min_z": 200.0,
        "max_z": 99999.0,
    },
    {
        "name": "Twilight Marsh",
        "description": "A sprawling swampland to the south, shrouded in perpetual mist. Bioluminescent fungi illuminate murky waters, and the air hums with strange life. Ancient secrets lie submerged in the bog.",
        "min_x": -99999.0,
        "max_x": 99999.0,
        "min_z": -99999.0,
        "max_z": -200.0,
    },
    {
        "name": "Sunlit Meadows",
        "description": "Rolling golden grasslands extending westward to the horizon. Warm breezes carry the scent of wildflowers, and gentle creatures graze beneath a sky touched by eternal sunset.",
        "min_x": -99999.0,
        "max_x": -200.0,
        "min_z": -99999.0,
        "max_z": 99999.0,
    },
    {
        "name": "Teldrassil Wilds",
        "description": "The ancient forest surrounding the Elders' Village. Massive trees draped with glowing vines tower above a carpet of luminescent mushrooms. Wisps drift between the trunks.",
        "min_x": -200.0,
        "max_x": 200.0,
        "min_z": -200.0,
        "max_z": 200.0,
    },
]


def get_zone(position: list[float]) -> str:
    """Return the zone name for a given world position.

    Zones are checked in order — more specific zones (smaller areas)
    are listed first so they take priority over the larger ecosystem zones.
    Falls back to 'Wilderness' if no zone matches.
    """
    x = position[0] if len(position) > 0 else 0.0
    z = position[2] if len(position) > 2 else 0.0

    for zone in ZONES:
        if zone["min_x"] <= x <= zone["max_x"] and zone["min_z"] <= z <= zone["max_z"]:
            return zone["name"]

    return "Wilderness"


def get_zone_description(zone_name: str) -> str:
    """Return the description for a named zone."""
    for zone in ZONES:
        if zone["name"] == zone_name:
            return zone["description"]
    return "An uncharted stretch of land."
