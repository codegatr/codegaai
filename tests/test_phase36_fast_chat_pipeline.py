from codegaai.core.agent_brain import decide_response
from codegaai.core.fast_answers import (
    CHAT,
    DIRECT_INSTRUCTION,
    FAST_RESPONSE,
    SHORT_QA,
    classify_task,
    fast_answer_for,
)


def test_short_qa_is_not_routed_as_coding():
    for message in ["PHP nedir?", "Laravel nedir?"]:
        decision = decide_response(message)
        assert classify_task(message) == SHORT_QA
        assert decision.intent == "short_qa"
        assert decision.needs_memory is False
        assert decision.needs_careful_reasoning is False
        assert decision.should_stream is False


def test_fast_path_answers_common_timeout_cases():
    assert classify_task("OK yaz") == DIRECT_INSTRUCTION
    assert fast_answer_for("OK yaz") == "OK"
    assert fast_answer_for("2 + 2 kaç eder? Sadece sonucu yaz.") == "4"
    assert classify_task("Sadece MAVİ yaz. Başka hiçbir şey yazma.") == DIRECT_INSTRUCTION
    assert fast_answer_for("Sadece MAVİ yaz. Başka hiçbir şey yazma.") == "MAVİ"
    assert fast_answer_for("Sadece OK yaz.") == "OK"
    assert fast_answer_for("Türkiye'nin başkenti?") == "Ankara"
    assert fast_answer_for("Merhaba") == "Merhaba, nasıl yardımcı olabilirim?"


def test_chat_greetings_skip_heavy_pipeline():
    decision = decide_response("Merhaba")
    assert classify_task("Merhaba") == CHAT
    assert decision.intent == "chat"
    assert decision.needs_memory is False
    assert decision.should_stream is False


def test_fast_job_bypasses_all_heavy_layers():
    import asyncio

    from codegaai.api.routes.jobs import ChatJob, _run_chat_job

    cases = [
        ("Sadece MAVİ yaz. Başka hiçbir şey yazma.", "MAVİ", DIRECT_INSTRUCTION, "rule_based"),
        ("Sadece OK yaz.", "OK", DIRECT_INSTRUCTION, "rule_based"),
        ("2 + 2 kaç eder? Sadece sonucu yaz.", "4", FAST_RESPONSE, "rule_based"),
        ("Merhaba", "Merhaba, nasıl yardımcı olabilirim?", CHAT, "rule_based"),
        ("PHP nedir? Tek cümle.", "PHP", SHORT_QA, "hafif_model"),
    ]

    for message, expected, task_class, selected_model in cases:
        job = ChatJob("test", message, chat_id=None, max_tokens=64)
        asyncio.run(_run_chat_job(job))
        data = job.to_dict()
        diag = data["diagnostics"]

        assert data["status"] == "done"
        assert expected in data["content"]
        assert diag["task"] == task_class
        assert diag["fast_path_used"] is True
        assert diag["planner_enabled"] is False
        assert diag["executor_enabled"] is False
        assert diag["verifier_enabled"] is False
        assert diag["adversarial_review_enabled"] is False
        assert diag["rag_enabled"] is False
        assert diag["memory_enabled"] is False
        assert diag["federation_enabled"] is False
        assert diag["tool_selection_enabled"] is False
        assert diag["selected_model"] == selected_model
        assert diag["response_completed"] is True
        assert diag["timeout"] is False
        assert data["elapsed_ms"] < 1000
