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
]


def get_zone(position: list[float]) -> str:
    """Return the zone name for a given world position. Falls back to 'Wilderness'."""
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
