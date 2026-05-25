"""Tests for embedder."""

from app.memory.embedder import cosine_similarity, embed


def test_embed_returns_correct_dimension():
    v = embed("hello")
    assert len(v) == 384


def test_embed_empty_string():
    v = embed("")
    assert len(v) == 384
    assert all(x == 0.0 for x in v)


def test_embed_is_deterministic():
    a = embed("hello")
    b = embed("hello")
    assert a == b


def test_embed_different_inputs_different_vectors():
    a = embed("hello")
    b = embed("world")
    assert a != b


def test_embed_unit_norm():
    v = embed("hello")
    norm = sum(x * x for x in v) ** 0.5
    assert abs(norm - 1.0) < 0.001


def test_cosine_similarity_identical():
    v = embed("hello")
    assert cosine_similarity(v, v) > 0.999


def test_cosine_similarity_zero_vector():
    zeros = [0.0] * 384
    assert cosine_similarity(zeros, embed("hello")) == 0.0
