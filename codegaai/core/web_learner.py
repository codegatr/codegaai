"""
codegaai.core.web_learner
==========================

Faz 10 - Sürekli Öğrenme: İnternet Entegrasyonu.

CODEGA AI internetten kendi kendine öğrenir:

1. DuckDuckGo araması (API key yok, ücretsiz, gizlilik odaklı)
2. URL crawling (BeautifulSoup, temiz metin çıkarma)
3. RSS feed izleme (haber/blog/akademik kaynaklar)
4. Konuşmadan otomatik konu tespiti + web beslemesi
5. Zamanlanmış gece görevleri

Öğrenilen her içerik ChromaDB'ye `source=web` etiketiyle kaydedilir.
Sonraki sohbetlerde bu bilgi RAG üzerinden otomatik kullanılır.
"""

from __future__ import annotations

import json
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

WEB_LEARN_DIR = DATA_DIR / "web_learning"
FEED_SOURCES_FILE = WEB_LEARN_DIR / "feed_sources.json"
LEARN_LOG_FILE = WEB_LEARN_DIR / "learn_log.jsonl"

DEFAULT_FEEDS = [
    {
        "name": "arXiv AI",
        "url": "https://rss.arxiv.org/rss/cs.AI",
        "type": "rss",
        "category": "akademik",
        "enabled": True,
    },
    {
        "name": "Hacker News AI",
        "url": "https://hnrss.org/newest?q=AI+LLM",
        "type": "rss",
        "category": "teknoloji",
        "enabled": True,
    },
    {
        "name": "Hugging Face Blog",
        "url": "https://huggingface.co/blog/feed.xml",
        "type": "rss",
        "category": "ai_tools",
        "enabled": True,
    },
]

MAX_CONTENT_CHARS = 6000
MAX_RESULTS_PER_QUERY = 5


# ============================================================
# Veri yapıları
# ============================================================

@dataclass
class WebResult:
    title: str
    url: str
    snippet: str
    content: str = ""
    learned_at: float = field(default_factory=time.time)
    category: str = "web"
    source: str = "ddg_search"

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "content": self.content,
            "learned_at": self.learned_at,
            "category": self.category,
            "source": self.source,
        }


@dataclass
class LearnerStatus:
    state: str = "idle"   # idle | searching | crawling | storing | training
    last_run: Optional[float] = None
    last_topics: list[str] = field(default_factory=list)
    total_learned: int = 0
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "state": self.state,
            "last_run": self.last_run,
            "last_topics": self.last_topics,
            "total_learned": self.total_learned,
            "errors": self.errors[-5:],  # son 5 hata
        }


# ============================================================
# Ana sınıf
# ============================================================

class WebLearner:
    """İnternet üzerinden otomatik öğrenme motoru. Singleton."""

    _instance: Optional["WebLearner"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        WEB_LEARN_DIR.mkdir(parents=True, exist_ok=True)
        self._status = LearnerStatus()
        self._cancel = threading.Event()

        # Feed kaynakları
        if not FEED_SOURCES_FILE.exists():
            FEED_SOURCES_FILE.write_text(
                json.dumps(DEFAULT_FEEDS, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    @classmethod
    def get(cls) -> "WebLearner":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    @property
    def status(self) -> dict:
        d = self._status.to_dict()
        d["feeds"] = self.list_feeds()
        return d

    # ============================================================
    # Web araması (DuckDuckGo, ücretsiz, API key yok)
    # ============================================================

    def search(self, query: str,
               max_results: int = MAX_RESULTS_PER_QUERY) -> list[WebResult]:
        """DuckDuckGo ile metin araması yap."""
        try:
            from duckduckgo_search import DDGS  # type: ignore
        except ImportError:
            raise RuntimeError(
                "duckduckgo-search paketi eksik. "
                "pip install duckduckgo-search"
            )

        log.info("Web araması: %r (max %d)", query, max_results)
        results: list[WebResult] = []

        try:
            with DDGS() as ddgs:
                for r in ddgs.text(
                    query,
                    max_results=max_results,
                    safesearch="moderate",
                ):
                    results.append(WebResult(
                        title=r.get("title", ""),
                        url=r.get("href", ""),
                        snippet=r.get("body", "")[:500],
                        source="ddg_search",
                    ))
        except Exception as exc:
            log.warning("DuckDuckGo arama hatası: %s", exc)

        log.info("Bulunan: %d sonuç", len(results))
        return results

    # ============================================================
    # URL Crawling
    # ============================================================

    def crawl(self, url: str,
              max_chars: int = MAX_CONTENT_CHARS) -> str:
        """Bir URL'yi çek, temiz metin döndür."""
        try:
            import httpx  # type: ignore
            from bs4 import BeautifulSoup  # type: ignore

            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (compatible; CODEGA-AI-Learner/1.0; "
                    "+https://codega.com.tr)"
                ),
                "Accept-Language": "tr,en;q=0.8",
            }

            r = httpx.get(url, headers=headers, follow_redirects=True,
                          timeout=20.0)
            if r.status_code != 200:
                log.warning("Crawl %d: %s", r.status_code, url)
                return ""

            soup = BeautifulSoup(r.text, "html.parser")

            # Gereksizleri kaldır
            for tag in soup(["script", "style", "nav", "footer",
                             "header", "aside", "form", "iframe",
                             "noscript", "advertisement"]):
                tag.decompose()

            # Ana içerik önce dene (article > main > body)
            content_el = (
                soup.find("article")
                or soup.find("main")
                or soup.find("body")
            )
            text = (content_el or soup).get_text(
                separator=" ", strip=True
            )

            # Çoklu boşlukları temizle
            text = re.sub(r"\s{2,}", " ", text)
            return text[:max_chars]

        except ImportError:
            raise RuntimeError(
                "BeautifulSoup4 eksik. pip install beautifulsoup4"
            )
        except Exception as exc:
            log.warning("Crawl hatası %s: %s", url, exc)
            return ""

    # ============================================================
    # RSS Feed okuma
    # ============================================================

    def read_rss(self, url: str,
                 max_items: int = 10) -> list[WebResult]:
        """RSS/Atom feed'ini oku."""
        try:
            import feedparser  # type: ignore
        except ImportError:
            raise RuntimeError("feedparser eksik. pip install feedparser")

        log.info("RSS okunuyor: %s", url)
        try:
            feed = feedparser.parse(url)
            results = []
            for entry in feed.entries[:max_items]:
                content = (
                    entry.get("summary", "")
                    or entry.get("description", "")
                )[:MAX_CONTENT_CHARS]
                results.append(WebResult(
                    title=entry.get("title", ""),
                    url=entry.get("link", url),
                    snippet=content[:300],
                    content=content,
                    source="rss",
                    category="rss_feed",
                ))
            return results
        except Exception as exc:
            log.warning("RSS okuma hatası %s: %s", url, exc)
            return []

    # ============================================================
    # RAG'a kaydetme
    # ============================================================

    def store_to_memory(self, results: list[WebResult],
                        collection: str = "archive") -> int:
        """
        Web sonuçlarını ChromaDB'ye (RAG belleğine) kaydet.
        Var olanları (aynı URL) güncelle.
        """
        from codegaai.core.memory import MemoryStore

        mem = MemoryStore.get()
        stored = 0

        for r in results:
            content = r.content or r.snippet
            if not content.strip():
                continue

            text = f"[{r.category.upper()}] {r.title}\n\n{content}"

            try:
                mem.add(
                    text=text,
                    metadata={
                        "source": r.source,
                        "url": r.url,
                        "title": r.title,
                        "category": r.category,
                        "learned_at": r.learned_at,
                    },
                    collection=collection,
                )
                stored += 1
                log.debug("RAG'a eklendi: %s", r.title[:60])
            except Exception as exc:
                log.warning("RAG kayıt hatası: %s → %s", r.title[:40], exc)

        return stored

    # ============================================================
    # Sohbetten konu çıkarımı
    # ============================================================

    def extract_topics_from_chat(self, messages: list[dict],
                                  max_topics: int = 3) -> list[str]:
        """
        Sohbet geçmişinden öğrenilecek konuları çıkar.
        LLM üzerinden çıkarım yapar (varsa). Yoksa basit keyword.
        """
        # Son 5 mesajı al
        recent = messages[-5:] if len(messages) > 5 else messages
        text = " ".join(
            m.get("content", "")
            for m in recent
            if m.get("role") in ("user", "assistant")
        )

        # LLM varsa konu çıkarımı yap
        from codegaai.core.engine import LLMEngine
        engine = LLMEngine.get()

        if engine.is_ready:
            try:
                prompt = (
                    f"Aşağıdaki sohbetten en önemli {max_topics} konuyu "
                    "listele. Kısa anahtar kelimeler (İngilizce), "
                    "her biri ayrı satırda, açıklama yok:\n\n"
                    f"{text[:2000]}"
                )
                response = engine.generate(prompt, max_tokens=100)
                topics = [
                    t.strip("- •*").strip()
                    for t in response.strip().split("\n")
                    if t.strip()
                ][:max_topics]
                if topics:
                    return topics
            except Exception as exc:
                log.warning("LLM konu çıkarımı başarısız: %s", exc)

        # Fallback: basit TF-IDF benzeri keyword extraction
        words = re.findall(r"\b[a-zA-ZğüşıöçĞÜŞİÖÇ]{4,}\b", text)
        freq: dict[str, int] = {}
        stopwords = {
            "bir", "bu", "ve", "ile", "için", "olan", "olan", "var",
            "the", "and", "for", "that", "this", "with", "have",
        }
        for w in words:
            w = w.lower()
            if w not in stopwords:
                freq[w] = freq.get(w, 0) + 1
        topics = [w for w, _ in sorted(
            freq.items(), key=lambda x: -x[1]
        )[:max_topics]]
        return topics

    # ============================================================
    # Ana öğrenme döngüsü
    # ============================================================

    def learn_from_topics(self, topics: list[str],
                           crawl: bool = True,
                           store: bool = True) -> dict:
        """
        Verilen konular hakkında web'den öğren ve RAG'a kaydet.

        Döngü:
        1. Her konu için DuckDuckGo araması
        2. Bulunan URL'leri crawl et (tam içerik)
        3. Sonuçları ChromaDB'ye kaydet
        4. Öğrenilen her şeyi log'a yaz
        """
        self._status.state = "searching"
        self._status.last_topics = topics
        self._status.last_run = time.time()
        self._cancel.clear()

        all_results: list[WebResult] = []

        for topic in topics:
            if self._cancel.is_set():
                break

            self._status.state = "searching"
            results = self.search(topic, max_results=3)

            if crawl:
                self._status.state = "crawling"
                for r in results:
                    if self._cancel.is_set():
                        break
                    if r.url:
                        r.content = self.crawl(r.url)
                        r.category = "web_search"

            all_results.extend(results)

        stored = 0
        if store and all_results:
            self._status.state = "storing"
            stored = self.store_to_memory(all_results)
            self._status.total_learned += stored

        # Log'a yaz
        self._write_log(topics, all_results, stored)

        self._status.state = "idle"
        return {
            "topics": topics,
            "results_found": len(all_results),
            "stored": stored,
        }

    def learn_from_feeds(self, enabled_only: bool = True) -> dict:
        """Tüm aktif RSS feed'lerinden öğren."""
        feeds = [
            f for f in self.list_feeds()
            if not enabled_only or f.get("enabled", True)
        ]

        all_results: list[WebResult] = []
        self._status.state = "searching"

        for feed in feeds:
            if self._cancel.is_set():
                break
            results = self.read_rss(feed["url"], max_items=5)
            for r in results:
                r.category = feed.get("category", "rss_feed")
            all_results.extend(results)

        stored = 0
        if all_results:
            self._status.state = "storing"
            stored = self.store_to_memory(all_results)
            self._status.total_learned += stored

        self._status.state = "idle"
        self._status.last_run = time.time()
        log.info("Feed öğrenmesi tamamlandı: %d sonuç, %d kaydedildi",
                 len(all_results), stored)

        return {
            "feeds_checked": len(feeds),
            "results_found": len(all_results),
            "stored": stored,
        }

    def learn_async(self, topics: list[str] = None,
                     feeds: bool = False) -> threading.Thread:
        """Arka planda öğrenme başlat."""
        def worker():
            try:
                if topics:
                    self.learn_from_topics(topics)
                if feeds:
                    self.learn_from_feeds()
            except Exception as exc:
                log.exception("Web öğrenme hatası: %s", exc)
                self._status.errors.append(str(exc))
                self._status.state = "idle"

        t = threading.Thread(target=worker, daemon=True,
                             name="web-learner")
        t.start()
        return t

    def cancel(self) -> bool:
        if self._status.state != "idle":
            self._cancel.set()
            return True
        return False

    # ============================================================
    # Feed yönetimi
    # ============================================================

    def list_feeds(self) -> list[dict]:
        try:
            return json.loads(FEED_SOURCES_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []

    def add_feed(self, name: str, url: str,
                 feed_type: str = "rss",
                 category: str = "genel") -> dict:
        feeds = self.list_feeds()
        entry = {
            "name": name,
            "url": url,
            "type": feed_type,
            "category": category,
            "enabled": True,
        }
        feeds.append(entry)
        FEED_SOURCES_FILE.write_text(
            json.dumps(feeds, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return entry

    def toggle_feed(self, index: int, enabled: bool) -> bool:
        feeds = self.list_feeds()
        if 0 <= index < len(feeds):
            feeds[index]["enabled"] = enabled
            FEED_SOURCES_FILE.write_text(
                json.dumps(feeds, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return True
        return False

    def delete_feed(self, index: int) -> bool:
        feeds = self.list_feeds()
        if 0 <= index < len(feeds):
            feeds.pop(index)
            FEED_SOURCES_FILE.write_text(
                json.dumps(feeds, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            return True
        return False

    # ============================================================
    # Yardımcılar
    # ============================================================

    def _write_log(self, topics: list[str],
                   results: list[WebResult], stored: int) -> None:
        entry = {
            "ts": time.time(),
            "topics": topics,
            "found": len(results),
            "stored": stored,
            "urls": [r.url for r in results[:10]],
        }
        with LEARN_LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def get_log(self, limit: int = 50) -> list[dict]:
        if not LEARN_LOG_FILE.exists():
            return []
        lines = LEARN_LOG_FILE.read_text(encoding="utf-8").strip().split("\n")
        result = []
        for line in reversed(lines):
            try:
                result.append(json.loads(line))
            except Exception:
                pass
            if len(result) >= limit:
                break
        return result
