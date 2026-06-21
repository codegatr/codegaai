from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_short_qa_examples_use_instant_answers() -> None:
    from codegaai.core.instant_answers import instant_answer_for

    php = instant_answer_for("PHP nedir? Tek cumle.")
    laravel = instant_answer_for("Laravel nedir?")
    capital = instant_answer_for("Turkiye'nin baskenti?")

    assert php is not None
    assert php.intent == "short_qa"
    assert "PHP" in php.content
    assert laravel is not None
    assert laravel.intent == "short_qa"
    assert "Laravel" in laravel.content
    assert capital is not None
    assert capital.content == "Ankara"


def test_direct_output_preserves_requested_value() -> None:
    from codegaai.core.instant_answers import instant_answer_for

    answer = instant_answer_for("Sadece MAVI yaz. Baska hicbir sey yazma.")

    assert answer is not None
    assert answer.intent == "direct_output"
    assert answer.content == "MAVI"


def test_short_qa_does_not_stream() -> None:
    from codegaai.core.agent_brain import decide_response

    decision = decide_response("PHP nedir?")

    assert decision.intent == "short_qa"
    assert decision.should_stream is False
    assert decision.needs_memory is False


def test_general_is_not_forced_into_fast_response_bucket() -> None:
    from codegaai.api.routes.jobs import _is_fast_response_task

    assert _is_fast_response_task("short_qa", "PHP nedir?") is True
    assert _is_fast_response_task("general", "Arac sigorta sistemi icin detayli plan hazirla") is False


def test_chat_jobs_use_stream_watchdog() -> None:
    jobs = read("codegaai/api/routes/jobs.py")

    assert "import queue" in jobs
    assert "def _stream_with_watchdog" in jobs
    assert "_stream_with_watchdog(job, engine, messages, cfg)" in jobs
    assert "stream_closed" in jobs
    assert "response_completed" in jobs


def test_version_bumped_to_4518() -> None:
    init = read("codegaai/__init__.py")

    assert '__version__ = "4.5.18"' in init
    assert "Fast Router Watchdog" in init
