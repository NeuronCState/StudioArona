import pytest
from app.services.translator import translate_to_chinese, is_chinese

def test_is_chinese_detects_chinese():
    assert is_chinese("这是一个中文字符串") is True

def test_is_chinese_detects_english():
    assert is_chinese("This is English") is False

def test_is_chinese_mixed():
    assert is_chinese("Hello 你好") is False
