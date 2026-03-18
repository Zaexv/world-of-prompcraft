"""Tests for the RAG lore retriever."""

from __future__ import annotations

from src.rag.retriever import LoreRetriever


def test_retrieve_returns_results() -> None:
    r = LoreRetriever()
    results = r.retrieve("Teldrassil night elf")
    assert len(results) > 0
    assert all("topic" in entry and "content" in entry for entry in results)


def test_retrieve_respects_top_k() -> None:
    r = LoreRetriever()
    results = r.retrieve("dragon fire", top_k=2)
    assert len(results) <= 2


def test_retrieve_empty_query() -> None:
    r = LoreRetriever()
    results = r.retrieve("")
    assert results == []


def test_retrieve_no_match() -> None:
    r = LoreRetriever()
    results = r.retrieve("xyzzyplugh")
    assert results == []


def test_topic_boost() -> None:
    """Entries where the query matches the topic should rank higher."""
    r = LoreRetriever()
    results = r.retrieve("Teldrassil", top_k=5)
    topics = [entry["topic"] for entry in results]
    # At least one result should have Teldrassil in its topic
    assert any("Teldrassil" in t for t in topics)
