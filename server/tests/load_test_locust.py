"""Load testing script using Locust for concurrent player simulation."""

from __future__ import annotations

import json
import asyncio
from locust import HttpUser, task, between, TaskSet, constant_pacing


class GamePlayerTasks(TaskSet):
    """Simulated player interactions."""

    def on_start(self) -> None:
        """Initialize player on test start."""
        self.player_id = f"loadtest_player_{self.user.client.get_id()}"
        self.npc_id = "warrior_test"

    @task(3)
    def interact_with_npc(self) -> None:
        """Send interaction to NPC."""
        prompts = [
            "Attack me!",
            "What's your name?",
            "Trade with me",
            "Help me!",
            "Tell me a story",
        ]
        import random

        prompt = random.choice(prompts)

        message = {
            "type": "interaction",
            "player_id": self.player_id,
            "npc_id": self.npc_id,
            "prompt": prompt,
        }

        with self.client.post(
            "/ws",
            json=message,
            catch_response=True,
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Got status code {response.status_code}")

    @task(1)
    def get_metrics(self) -> None:
        """Fetch metrics."""
        with self.client.get("/metrics", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Failed to get metrics: {response.status_code}")


class GamePlayer(HttpUser):
    """Simulated game player."""

    wait_time = between(1, 5)  # Wait 1-5 seconds between tasks
    tasks = [GamePlayerTasks]


# Configuration for load test
def run_load_test(
    url: str = "http://localhost:8000",
    users: int = 50,
    spawn_rate: int = 10,
    run_time: str = "5m",
) -> None:
    """Run load test with Locust."""
    import subprocess

    cmd = [
        "locust",
        "-f",
        __file__,
        "-u",
        str(users),
        "-r",
        str(spawn_rate),
        "-t",
        run_time,
        "--host",
        url,
        "--headless",
    ]

    subprocess.run(cmd, check=True)


if __name__ == "__main__":
    run_load_test(users=100, spawn_rate=20, run_time="10m")
