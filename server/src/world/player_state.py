from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PlayerData:
    hp: int = 100
    max_hp: int = 100
    mana: int = 50
    max_mana: int = 50
    level: int = 1
    inventory: list[str] = field(default_factory=list)
    position: list[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])

    def to_dict(self) -> dict:
        return {
            "hp": self.hp,
            "maxHp": self.max_hp,
            "mana": self.mana,
            "maxMana": self.max_mana,
            "level": self.level,
            "inventory": list(self.inventory),
            "position": list(self.position),
        }
