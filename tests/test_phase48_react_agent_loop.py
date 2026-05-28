"""
Faz 48 — Gerçek ReAct Ajan Döngüsü testleri.

Bu testler MODEL/GPU/AĞ gerektirmez: sahte bir generate_fn enjekte edilir ve
yalnızca offline+deterministik `calculate` aracı kullanılır. Amaç, döngünün
araç sonucunu modele GERİ beslediğini ve sentez yaptığını kanıtlamaktır.
"""

from __future__ import annotations

from codegaai.core.agent_loop import AgentResult, has_tool_call, run_react


def test_has_tool_call_detection():
    assert has_tool_call('Bakıyorum. <tool>calculate("2+2")</tool>') is True
    assert has_tool_call("Sadece düz metin, araç yok.") is False
    assert has_tool_call("") is False


def test_react_loop_feeds_observation_back_and_synthesizes():
    """
    Tur 1: model araç çağırır.
    Tur 2: model GÖZLEMİ görmüş olarak final cevabı verir.
    Doğrulanan: araç çalıştı, sonucu (42) 2. turun mesajlarına enjekte edildi,
    döngü final_answer ile durdu.
    """
    seen_messages: list[list[dict]] = []

    def fake_llm(messages: list[dict]) -> str:
        # Modele giden konuşmanın kopyasını sakla (geri-besleme kanıtı için)
        seen_messages.append([dict(m) for m in messages])
        turn = len(seen_messages)
        if turn == 1:
            return 'Hesaplıyorum. <tool>calculate("21*2")</tool>'
        return "İşlemin sonucu 42."

    result: AgentResult = run_react(
        messages=[{"role": "user", "content": "21 çarpı 2 kaç eder?"}],
        generate_fn=fake_llm,
        max_iters=4,
    )

    # İki tur çalıştı ve final cevapla bitti
    assert result.iterations == 2
    assert result.stopped_reason == "final_answer"
    assert result.content == "İşlemin sonucu 42."

    # Araç gerçekten çalıştı ve 42 üretti
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0]["name"] == "calculate"
    assert "42" in (result.tool_calls[0]["result"] or "")

    # KRİTİK: 2. turda model gözlemi (araç sonucu) görmüş olmalı
    second_turn_msgs = seen_messages[1]
    joined = "\n".join(m["content"] for m in second_turn_msgs)
    assert "Araç Sonuçları (Gözlem)" in joined
    assert "42" in joined
    # Gözlem turu doğru rolde eklendi mi?
    assert any(m["role"] == "user" and "Gözlem" in m["content"] for m in second_turn_msgs)


def test_react_loop_respects_max_iters():
    """Model sürekli araç çağırırsa döngü max_iters'te durmalı ve sentez istemeli."""
    calls = {"n": 0}

    def always_tool(messages: list[dict]) -> str:
        calls["n"] += 1
        # Son sentez turunda (araçsız talimat geldiğinde) düz cevap dön
        last = messages[-1]["content"] if messages else ""
        if "ARAÇ KULLANMA" in last:
            return "Toplanan bilgiyle final cevap."
        return 'Devam. <tool>calculate("1+1")</tool>'

    result = run_react(
        messages=[{"role": "user", "content": "döngü testi"}],
        generate_fn=always_tool,
        max_iters=3,
    )

    assert result.stopped_reason == "max_iters"
    assert result.iterations == 3
    assert result.content == "Toplanan bilgiyle final cevap."
    # 3 döngü turu + 1 final sentez turu = 4 üretim
    assert calls["n"] == 4


def test_react_loop_direct_answer_no_tools():
    """Araç gerekmeyen soru tek turda biter."""
    def direct(messages: list[dict]) -> str:
        return "Merhaba Yunus, nasıl yardımcı olabilirim?"

    result = run_react(
        messages=[{"role": "user", "content": "selam"}],
        generate_fn=direct,
        max_iters=4,
    )
    assert result.iterations == 1
    assert result.stopped_reason == "final_answer"
    assert result.tool_calls == []
    assert "Yunus" in result.content


def test_react_loop_handles_generation_error():
    """generate_fn patlarsa döngü güvenle hata döndürmeli, çökmemeli."""
    def boom(messages: list[dict]) -> str:
        raise RuntimeError("model yüklü değil")

    result = run_react(
        messages=[{"role": "user", "content": "x"}],
        generate_fn=boom,
        max_iters=4,
    )
    assert result.stopped_reason == "error"
    assert "model yüklü değil" in result.content
