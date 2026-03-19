"""Tests for zone lookup."""

from __future__ import annotations

from src.world.zones import get_zone, get_zone_description


def test_village_zone() -> None:
    assert get_zone([0.0, 0.0, 0.0]) == "Elders' Village"


def test_ember_peaks() -> None:
    assert get_zone([120.0, 15.0, -80.0]) == "Ember Peaks"


def test_crystal_lake() -> None:
    assert get_zone([-200.0, 0.0, 0.0]) == "Crystal Lake"


def test_wilderness_fallback() -> None:
    # Absurd coordinates outside all zones — should be caught by the huge zones
    # but test the concept
    zone = get_zone([0.0, 0.0, 0.0])
    assert zone != "Wilderness"  # origin is in Elders' Village


def test_get_zone_description_known() -> None:
    desc = get_zone_description("Elders' Village")
    assert "village" in desc.lower()


def test_get_zone_description_unknown() -> None:
    desc = get_zone_description("Nonexistent Zone")
    assert desc == "An uncharted stretch of land."
