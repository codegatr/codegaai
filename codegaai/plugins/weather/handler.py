"""Hava durumu eklentisi — wttr.in (API key gerektirmez)."""
import httpx, re

def execute(command: str, params: dict) -> str:
    city = params.get("city", "Konya")
    # Komuttan şehir çıkar
    words = command.lower().split()
    for kw in ["hava", "durumu", "weather", "sıcaklık"]:
        if kw in words:
            idx = words.index(kw)
            if idx + 1 < len(words):
                city = " ".join(words[idx+1:])
    city = city.strip() or "Konya"
    try:
        r = httpx.get(f"https://wttr.in/{city}?format=3&lang=tr", timeout=8)
        return r.text.strip() or f"{city} için hava durumu alınamadı."
    except Exception as e:
        return f"Hava durumu hatası: {e}"
