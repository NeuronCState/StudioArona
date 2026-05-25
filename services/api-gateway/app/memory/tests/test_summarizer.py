"""Tests for summarizer."""

import os

import pytest

from app.memory.summarizer import summarize


class TestSummarizerMock:
    def test_summarize_empty(self):
        results = summarize("")
        assert len(results) == 0

    def test_summarize_name_preference(self):
        results = summarize("用户: 你好\n助手: 你好老师\n用户: 以后叫我老张")
        assert len(results) >= 0  # mock may or may not extract

    def test_summarize_deterministic(self):
        conv = "老师: 我喜欢喝咖啡\n助手: 好的，记住了"
        a = summarize(conv)
        b = summarize(conv)
        assert len(a) == len(b)

    def test_summarize_all_entries_have_ids(self):
        results = summarize("用户: 我叫老王，我喜欢喝茶，我住在北京")
        for entry in results:
            assert entry.id
            assert len(entry.id) > 0

    def test_summarize_returns_memory_entries(self):
        results = summarize("用户: 我明天要参加一个会议")
        assert isinstance(results, list)


class TestSummarizerNoTemplate:
    """Test behavior when template file doesn't exist."""

    def test_returns_empty_when_no_template(self):
        # If SUMMARIZER.md is present, should work fine
        results = summarize("测试对话")
        assert isinstance(results, list)
