"""Tests for the radial (non-overlapping) zone lookup."""

from __future__ import annotations

import math

from src.world.zones import _LOCALE_DISCS, _SECTORS, get_zone, get_zone_description


def test_village_zone() -> None:
    assert get_zone([0.0, 0.0, 0.0]) == "Makaleta Strande"


def test_east_is_blasted_suarezlands() -> None:
    # Due east, well into the outer ring.
    assert get_zone([300.0, 0.0, 0.0]) == "Blasted Suarezlands"


def test_north_is_crystal_tundra() -> None:
    assert get_zone([0.0, 0.0, 300.0]) == "Crystal Tundra"


def test_south_is_moin_swamps() -> None:
    assert get_zone([0.0, 0.0, -300.0]) == "Moin Swamps"


def test_fort_malaka_locale_disc() -> None:
    # Inside the Fort Malaka locale disc centred at (-210, -260).
    assert get_zone([-210.0, 0.0, -260.0]) == "Fort Malaka"


def test_no_overlap_partition() -> None:
    # Sweep a dense grid: every point resolves to exactly one known zone and
    # never falls through to 'Wilderness'.
    known = {"Makaleta Strande", "Fort Malaka", "Teldrassil Wilds"}
    known |= {name for name, _ in _SECTORS}
    for ix in range(-60, 61):
        for iz in range(-60, 61):
            zone = get_zone([ix * 10.0, 0.0, iz * 10.0])
            assert zone in known, f"unexpected zone {zone!r} at {ix * 10},{iz * 10}"


def test_locale_discs_do_not_overlap() -> None:
    for i in range(len(_LOCALE_DISCS)):
        for j in range(i + 1, len(_LOCALE_DISCS)):
            _, ax, az, ar = _LOCALE_DISCS[i]
            _, bx, bz, br = _LOCALE_DISCS[j]
            assert math.hypot(ax - bx, az - bz) >= ar + br


def test_get_zone_description_known() -> None:
    desc = get_zone_description("Makaleta Strande")
    assert "village" in desc.lower()


def test_get_zone_description_unknown() -> None:
    desc = get_zone_description("Nonexistent Zone")
    assert desc == "An uncharted stretch of land."
