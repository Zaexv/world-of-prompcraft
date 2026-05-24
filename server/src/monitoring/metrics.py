"""Prometheus metrics for LLM and agent monitoring."""

from __future__ import annotations

import asyncio
import contextlib
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass
class MetricsCollector:
    """Collect and track real-time metrics for LLM operations."""

    # Counters
    total_agent_invocations: int = 0
    total_agent_timeouts: int = 0
    total_agent_errors: int = 0
    total_cache_hits: int = 0
    total_cache_misses: int = 0

    # Gauges
    current_semaphore_depth: int = 0
    max_semaphore_depth: int = 0
    current_concurrent_agents: int = 0
    max_concurrent_agents: int = 0

    # Latency tracking (milliseconds)
    agent_latencies: list[float] = field(default_factory=list)
    max_latency_history: int = 1000

    # Per-NPC stats
    npc_stats: dict[str, dict[str, any]] = field(default_factory=dict)

    # Per-player stats
    player_stats: dict[str, dict[str, any]] = field(default_factory=dict)

    # Time window tracking
    window_duration: timedelta = field(default_factory=lambda: timedelta(minutes=5))
    last_reset: datetime = field(default_factory=datetime.now)

    def record_agent_invocation(
        self,
        npc_id: str,
        player_id: str,
        duration_ms: float,
        success: bool = True,
        error: str | None = None,
        timeout: bool = False,
    ) -> None:
        """Record a single agent invocation."""
        self.total_agent_invocations += 1
        if timeout:
            self.total_agent_timeouts += 1
        if not success:
            self.total_agent_errors += 1

        # Track latency
        self.agent_latencies.append(duration_ms)
        if len(self.agent_latencies) > self.max_latency_history:
            self.agent_latencies.pop(0)

        # Update NPC stats
        if npc_id not in self.npc_stats:
            self.npc_stats[npc_id] = {
                "invocations": 0,
                "errors": 0,
                "timeouts": 0,
                "avg_latency": 0.0,
                "total_latency": 0.0,
            }
        stats = self.npc_stats[npc_id]
        stats["invocations"] += 1
        stats["total_latency"] += duration_ms
        stats["avg_latency"] = stats["total_latency"] / stats["invocations"]
        if not success:
            stats["errors"] += 1
        if timeout:
            stats["timeouts"] += 1

        # Update player stats
        if player_id not in self.player_stats:
            self.player_stats[player_id] = {
                "interactions": 0,
                "errors": 0,
            }
        self.player_stats[player_id]["interactions"] += 1
        if not success:
            self.player_stats[player_id]["errors"] += 1

    def record_cache_hit(self) -> None:
        """Record cache hit."""
        self.total_cache_hits += 1

    def record_cache_miss(self) -> None:
        """Record cache miss."""
        self.total_cache_misses += 1

    def record_semaphore_depth(self, depth: int) -> None:
        """Record current semaphore queue depth."""
        self.current_semaphore_depth = depth
        if depth > self.max_semaphore_depth:
            self.max_semaphore_depth = depth

    def record_concurrent_agents(self, count: int) -> None:
        """Record current concurrent agent count."""
        self.current_concurrent_agents = count
        if count > self.max_concurrent_agents:
            self.max_concurrent_agents = count

    def get_cache_hit_rate(self) -> float:
        """Get cache hit rate (0-1)."""
        total = self.total_cache_hits + self.total_cache_misses
        return self.total_cache_hits / total if total > 0 else 0.0

    def get_error_rate(self) -> float:
        """Get error rate (0-1)."""
        return (
            self.total_agent_errors / self.total_agent_invocations
            if self.total_agent_invocations > 0
            else 0.0
        )

    def get_timeout_rate(self) -> float:
        """Get timeout rate (0-1)."""
        return (
            self.total_agent_timeouts / self.total_agent_invocations
            if self.total_agent_invocations > 0
            else 0.0
        )

    def get_avg_latency(self) -> float:
        """Get average latency in milliseconds."""
        return (
            sum(self.agent_latencies) / len(self.agent_latencies) if self.agent_latencies else 0.0
        )

    def get_p99_latency(self) -> float:
        """Get 99th percentile latency."""
        if not self.agent_latencies:
            return 0.0
        sorted_latencies = sorted(self.agent_latencies)
        index = int(len(sorted_latencies) * 0.99)
        return sorted_latencies[min(index, len(sorted_latencies) - 1)]

    def get_summary(self) -> dict[str, any]:
        """Get summary of all metrics."""
        return {
            "total_invocations": self.total_agent_invocations,
            "total_errors": self.total_agent_errors,
            "total_timeouts": self.total_agent_timeouts,
            "error_rate": f"{self.get_error_rate() * 100:.2f}%",
            "timeout_rate": f"{self.get_timeout_rate() * 100:.2f}%",
            "cache_hit_rate": f"{self.get_cache_hit_rate() * 100:.2f}%",
            "avg_latency_ms": f"{self.get_avg_latency():.2f}",
            "p99_latency_ms": f"{self.get_p99_latency():.2f}",
            "max_semaphore_depth": self.max_semaphore_depth,
            "max_concurrent_agents": self.max_concurrent_agents,
            "current_semaphore_depth": self.current_semaphore_depth,
            "npc_count": len(self.npc_stats),
            "player_count": len(self.player_stats),
        }

    def reset(self) -> None:
        """Reset metrics (for testing or new window)."""
        self.total_agent_invocations = 0
        self.total_agent_timeouts = 0
        self.total_agent_errors = 0
        self.total_cache_hits = 0
        self.total_cache_misses = 0
        self.current_semaphore_depth = 0
        self.max_semaphore_depth = 0
        self.current_concurrent_agents = 0
        self.max_concurrent_agents = 0
        self.agent_latencies = []
        self.npc_stats = {}
        self.player_stats = {}
        self.last_reset = datetime.now()


class AdaptiveBackpressure:
    """Adaptive backpressure controller based on metrics."""

    def __init__(
        self,
        initial_semaphore_size: int = 10,
        metrics: MetricsCollector | None = None,
    ):
        """Initialize adaptive backpressure controller.

        Args:
            initial_semaphore_size: Starting concurrency limit
            metrics: Optional metrics collector to monitor
        """
        self.semaphore = asyncio.Semaphore(initial_semaphore_size)
        self.current_limit = initial_semaphore_size
        self.metrics = metrics
        self.min_limit = 2
        self.max_limit = 50
        self.last_adjustment = time.time()
        self.adjustment_interval = 10  # seconds

    async def acquire_with_backpressure(self) -> None:
        """Acquire semaphore with adaptive adjustment."""
        # Check if we should adjust limits
        if time.time() - self.last_adjustment > self.adjustment_interval:
            await self._adjust_limits()

        # Wait for semaphore
        await self.semaphore.acquire()
        if self.metrics:
            self.metrics.record_semaphore_depth(self.semaphore._value)  # type: ignore[attr-defined]

    async def _adjust_limits(self) -> None:
        """Adjust semaphore limit based on metrics."""
        if not self.metrics:
            return

        self.last_adjustment = time.time()

        error_rate = self.metrics.get_error_rate()
        timeout_rate = self.metrics.get_timeout_rate()
        avg_latency = self.metrics.get_avg_latency()

        # If error/timeout rates are high, reduce limit
        if error_rate > 0.05 or timeout_rate > 0.02:
            new_limit = max(self.min_limit, int(self.current_limit * 0.8))
            if new_limit < self.current_limit:
                await self._resize_semaphore(new_limit)

        # If latency is low and no errors, increase limit
        elif avg_latency < 500 and error_rate < 0.01:
            new_limit = min(self.max_limit, int(self.current_limit * 1.1))
            if new_limit > self.current_limit:
                await self._resize_semaphore(new_limit)

    async def _resize_semaphore(self, new_limit: int) -> None:
        """Resize semaphore to new limit."""
        difference = new_limit - self.current_limit
        if difference > 0:
            # Add permits
            for _ in range(difference):
                self.semaphore.release()
        elif difference < 0:
            # Remove permits (acquire them)
            for _ in range(abs(difference)):
                with contextlib.suppress(AttributeError, ValueError):
                    self.semaphore._value -= 1
        self.current_limit = new_limit

    def release(self) -> None:
        """Release semaphore permit."""
        self.semaphore.release()


# Global metrics instance
_metrics = MetricsCollector()


def get_metrics() -> MetricsCollector:
    """Get global metrics collector."""
    return _metrics
