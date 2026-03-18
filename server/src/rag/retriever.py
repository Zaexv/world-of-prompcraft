"""Simple keyword-based lore retriever for RAG.

No ML models needed — uses term frequency matching for fast retrieval.
"""

from __future__ import annotations

import re
from .knowledge_base import KNOWLEDGE_BASE


class LoreRetriever:
    """Retrieves relevant WoW lore entries based on keyword matching."""

    def __init__(self) -> None:
        self.entries = KNOWLEDGE_BASE
        # Pre-tokenize all entries for fast matching
        self._entry_tokens: list[set[str]] = []
        for entry in self.entries:
            text = f"{entry['topic']} {entry['category']} {entry['content']}"
            tokens = set(self._tokenize(text))
            self._entry_tokens.append(tokens)

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        """Split text into lowercase alphanumeric tokens."""
        return re.findall(r"[a-z0-9']+", text.lower())

    def retrieve(self, query: str, top_k: int = 3) -> list[dict]:
        """Find the most relevant lore entries for a query.

        Uses keyword overlap scoring: each matching token adds 1 point,
        topic matches get a 3x boost.
        """
        query_tokens = set(self._tokenize(query))
        if not query_tokens:
            return []

        scored: list[tuple[float, int]] = []
        for idx, entry in enumerate(self.entries):
            entry_tokens = self._entry_tokens[idx]

            # Base score: keyword overlap
            overlap = query_tokens & entry_tokens
            score = len(overlap)

            # Boost if query matches the topic directly
            topic_tokens = set(self._tokenize(entry["topic"]))
            topic_overlap = query_tokens & topic_tokens
            score += len(topic_overlap) * 3

            # Boost for category match
            cat_tokens = set(self._tokenize(entry["category"]))
            if query_tokens & cat_tokens:
                score += 1

            if score > 0:
                scored.append((score, idx))

        # Sort by score descending
        scored.sort(key=lambda x: -x[0])

        return [self.entries[idx] for _, idx in scored[:top_k]]


# Module-level singleton
_retriever: LoreRetriever | None = None


def get_retriever() -> LoreRetriever:
    """Get or create the singleton LoreRetriever."""
    global _retriever
    if _retriever is None:
        _retriever = LoreRetriever()
    return _retriever
