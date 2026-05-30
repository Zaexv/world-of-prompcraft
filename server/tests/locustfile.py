import random

from locust import HttpUser, between, task


class NPCUser(HttpUser):
    wait_time = between(1, 5)

    @task
    def chat_with_npc(self):
        npc_ids = ["guard_1", "blacksmith_1"]
        player_id = f"test_player_{random.randint(1, 100)}"
        message = random.choice(
            [
                "Hello there!",
                "What's the news?",
                "Can you help me with a quest?",
                "Where is the tavern?",
                "Nice weather today.",
            ]
        )

        payload = {"npc_id": random.choice(npc_ids), "player_id": player_id, "message": message}

        with self.client.post("/api/chat/", json=payload, catch_response=True) as response:
            if response.status_code == 200:
                data = response.json()
                if data.get("cached"):
                    response.success()
                else:
                    response.success()
            else:
                response.failure(f"Status code: {response.status_code}")

    @task
    def health_check(self):
        self.client.get("/health")
