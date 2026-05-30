"""Tool for NPC agents to compose music descriptions sent to the client."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool


def create_music_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
    """Create music-related tools closed over shared state.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player state.

    Returns:
        A list of LangChain tool objects.
    """

    @tool
    def compose_music(
        mood: str,
        description: str,
        duration: int = 30,
        tempo: int = 120,
        scale: str = "C_major",
    ) -> str:
        """Compose background music for the current scene. Call when the atmosphere should change dramatically.

        Args:
            mood: The emotional quality (battle, mystery, celebration, sadness, tension, triumph, exploration)
            description: A short description of what the music should convey
            duration: How long the music should play in seconds (default 30)
            tempo: Beats per minute (default 120)
            scale: Musical scale (C_major, A_minor, D_dorian, etc.)
        """
        pending_actions.append(
            {
                "kind": "play_music",
                "params": {
                    "mood": mood,
                    "description": description,
                    "duration": duration,
                    "tempo": tempo,
                    "scale": scale,
                },
            }
        )
        return f"Playing {mood} music: {description}"

    return [compose_music]
