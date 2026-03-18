"""Canonical NPC definitions used to initialize world state.

Each entry maps an NPC id to its static metadata. The ``personality_key``
references a template in ``agents.personalities.templates.NPC_PERSONALITIES``.
"""

from __future__ import annotations

from ..agents.personalities.templates import NPC_PERSONALITIES

NPC_DEFINITIONS: dict[str, dict] = {
    # --- Ignathar the Ancient --- Ember Peaks ---
    "dragon_01": {
        "id": "dragon_01",
        "name": NPC_PERSONALITIES["dragon_01"]["name"],
        "position": NPC_PERSONALITIES["dragon_01"]["position"],   # [120, 15, -80]
        "initial_hp": NPC_PERSONALITIES["dragon_01"]["initial_hp"],  # 500
        "personality_key": "dragon_01",
    },
    # --- Thornby the Merchant --- Village center ---
    "merchant_01": {
        "id": "merchant_01",
        "name": NPC_PERSONALITIES["merchant_01"]["name"],
        "position": NPC_PERSONALITIES["merchant_01"]["position"],  # [5, 0, 8]
        "initial_hp": NPC_PERSONALITIES["merchant_01"]["initial_hp"],  # 80
        "personality_key": "merchant_01",
    },
    # --- Elyria the Sage --- Crystal Lake ---
    "sage_01": {
        "id": "sage_01",
        "name": NPC_PERSONALITIES["sage_01"]["name"],
        "position": NPC_PERSONALITIES["sage_01"]["position"],  # [-40, 5, -30]
        "initial_hp": NPC_PERSONALITIES["sage_01"]["initial_hp"],  # 120
        "personality_key": "sage_01",
    },
    # --- Captain Aldric --- Village entrance ---
    "guard_01": {
        "id": "guard_01",
        "name": NPC_PERSONALITIES["guard_01"]["name"],
        "position": NPC_PERSONALITIES["guard_01"]["position"],  # [15, 0, 2]
        "initial_hp": NPC_PERSONALITIES["guard_01"]["initial_hp"],  # 200
        "personality_key": "guard_01",
    },
    # --- Sister Mira --- Village temple area ---
    "healer_01": {
        "id": "healer_01",
        "name": NPC_PERSONALITIES["healer_01"]["name"],
        "position": NPC_PERSONALITIES["healer_01"]["position"],  # [-5, 0, 12]
        "initial_hp": NPC_PERSONALITIES["healer_01"]["initial_hp"],  # 100
        "personality_key": "healer_01",
    },
    # --- El Tito --- Next to Sentinel Tower ---
    "eltito_01": {
        "id": "eltito_01",
        "name": NPC_PERSONALITIES["eltito_01"]["name"],
        "position": NPC_PERSONALITIES["eltito_01"]["position"],  # [18, 0, -35]
        "initial_hp": NPC_PERSONALITIES["eltito_01"]["initial_hp"],  # 420
        "personality_key": "eltito_01",
    },
}
