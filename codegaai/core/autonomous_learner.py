"""
codegaai.core.autonomous_learner
===================================

Otonom İnternet Öğrenme Motoru.

"Ben nasıl öğreniyorsam öyle öğrensin."

Claude'un öğrenmesi:
  - Trilyonlarca token: Wikipedia, ArXiv, GitHub, StackOverflow, kitaplar...
  - Konudan konuya bağlantılı gezme (hyperlink gibi)
  - Teknik + genel kültür dengesi
  - Sürekli, durmaksızın

CODEGA AI bunu şöyle yapar:
  1. Sistem boşta → öğrenme başlar (5 dk idle)
  2. Konu ağacından bir konu seç (ya önceden bilinmiyor ya popüler)
  3. Wikipedia + ArXiv + HackerNews + StackOverflow + GitHub'dan çek
  4. İçeriği temizle, özetle, kalite skoru ver
  5. RAG'a kaydet (hash ile tekrar engelle)
  6. Öğrenilen konudan yeni bağlantılı konular çıkar → kuyruğa ekle
  7. Uyku → tekrar

Konu Gezgini (Breadth-First Learning):
  "Python" → ["FastAPI", "asyncio", "type hints", "Pydantic"]
  "Transformer" → ["BERT", "GPT", "attention", "fine-tuning", "LoRA"]
  "PHP" → ["Laravel", "Composer", "PSR", "ORM", "REST API"]

Gizlilik: Tüm veri yerel RAG'a gider. Dışarıya bilgi gönderilmez.
"""

from __future__ import annotations

import hashlib
import json
import queue
import re
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

# ============================================================
# Sabitler
# ============================================================

LEARNER_DIR = DATA_DIR / "autonomous_learning"
KNOWLEDGE_MAP_FILE = LEARNER_DIR / "knowledge_map.json"   # Öğrenilen konular
TOPIC_QUEUE_FILE = LEARNER_DIR / "topic_queue.json"       # Sıradaki konular
STATS_FILE = LEARNER_DIR / "stats.json"
SEEN_HASHES_FILE = LEARNER_DIR / "seen_hashes.txt"        # Tekrar engeli

IDLE_THRESHOLD_S = 300        # 5 dakika idle → öğrenme başlar
LEARN_CYCLE_INTERVAL_S = 30   # Öğrenme döngüsü arası bekleme
MAX_ARTICLES_PER_CYCLE = 3    # Her döngüde kaç makale
MAX_QUEUE_SIZE = 500          # Konu kuyruğu max boyutu
MIN_CONTENT_CHARS = 200       # Minimum içerik uzunluğu

# ============================================================
# Başlangıç Konu Ağacı (Seed Topics)
# ============================================================

SEED_TOPICS = [
    # === Yapay Zeka / ML ===
    "large language model", "transformer neural network", "attention mechanism",
    "retrieval augmented generation", "fine-tuning language model",
    "LoRA low-rank adaptation", "RLHF reinforcement learning human feedback",
    "vector database embeddings", "semantic search", "llama.cpp GGUF",
    "Qwen language model", "sentence transformers", "ChromaDB",
    "chain of thought reasoning", "constitutional AI",

    # === Web Geliştirme ===
    "PHP 8.3 features", "Laravel framework", "FastAPI Python",
    "REST API best practices", "JavaScript ES2024",
    "React hooks", "Vue 3 composition API", "Tailwind CSS",
    "MySQL optimization", "Redis cache", "nginx configuration",
    "Docker containerization", "GitHub Actions CI/CD",

    # === Türkçe İçerik ===
    "Python programlama Türkçe", "yapay zeka Türkiye",
    "web geliştirme Türkçe", "yazılım mühendisliği",

    # === Sistem / DevOps ===
    "Linux server administration", "SSL TLS certificates",
    "PostgreSQL performance", "microservices architecture",
    "WebSocket real-time", "OAuth2 authentication",

    # === Akademik ===
    "attention is all you need", "neural network optimization",
    "computer vision deep learning", "natural language processing",

    # === Güncel Teknoloji ===
    "open source AI 2025", "edge computing AI",
    "multimodal AI vision language", "AI agent framework",
]

# Konudan türeyen alt konular (bilgi grafiği seeds)
TOPIC_EXPANSION = {
    "transformer": ["BERT", "GPT architecture", "attention heads", "positional encoding",
                    "tokenization", "vocabulary size"],
    "python": ["asyncio", "type hints", "Pydantic", "pytest", "Poetry"],
    "php": ["Laravel Eloquent", "Symfony components", "Composer packages",
            "PHP-FPM", "OPcache", "PDO prepared statements"],
    "machine learning": ["gradient descent", "backpropagation", "overfitting",
                         "cross-validation", "feature engineering"],
    "rag": ["vector similarity", "cosine distance", "chunking strategies",
            "hybrid search", "reranking"],
}


# ============================================================
# Veri Yapıları
# ============================================================

@dataclass
class LearnedArticle:
    title: str
    url: str
    source: str        # wikipedia | arxiv | hackernews | stackoverflow | github
    content: str
    summary: str
    topics: list[str]
    quality: float     # 0-1
    learned_at: float = field(default_factory=time.time)
    content_hash: str = ""

    def __post_init__(self):
        if not self.content_hash:
            self.content_hash = hashlib.md5(
                self.content[:500].encode()
            ).hexdigest()


@dataclass
class LearnerStats:
    total_articles: int = 0
    total_topics: int = 0
    total_chars: int = 0
    cycles_completed: int = 0
    last_learn_time: Optional[float] = None
    sources_breakdown: dict = field(default_factory=dict)
    current_topic: str = ""
    state: str = "idle"   # idle | learning | sleeping

    def to_dict(self) -> dict:
        return {
            "total_articles": self.total_articles,
            "total_topics": self.total_topics,
            "total_chars_mb": round(self.total_chars / 1e6, 2),
            "cycles_completed": self.cycles_completed,
            "last_learn_time": self.last_learn_time,
            "sources": self.sources_breakdown,
            "current_topic": self.current_topic,
            "state": self.state,
        }


# ============================================================
# Kaynak Adaptörleri
# ============================================================

class WikipediaSource:
    """Wikipedia REST API — ücretsiz, hızlı, Türkçe de var."""

    BASE_EN = "https://en.wikipedia.org/api/rest_v1"
    BASE_TR = "https://tr.wikipedia.org/api/rest_v1"

    def fetch(self, topic: str, lang: str = "en") -> Optional[LearnedArticle]:
        try:
            import httpx
            base = self.BASE_TR if lang == "tr" else self.BASE_EN
            # Arama
            search_r = httpx.get(
                f"https://{lang}.wikipedia.org/w/api.php",
                params={"action": "opensearch", "search": topic,
                        "limit": 1, "format": "json"},
                timeout=10.0,
            )
            results = search_r.json()
            if not results[1]:
                return None

            title = results[1][0]
            url = results[3][0] if results[3] else ""

            # İçerik
            content_r = httpx.get(
                f"{base}/page/summary/{title.replace(' ', '_')}",
                timeout=10.0,
                headers={"User-Agent": "CODEGA-AI/1.0 (education)"},
            )
            if content_r.status_code != 200:
                return None

            data = content_r.json()
            content = data.get("extract", "")
            if len(content) < MIN_CONTENT_CHARS:
                return None

            # Tam metin
            try:
                full_r = httpx.get(
                    f"{base}/page/sections/{title.replace(' ', '_')}",
                    timeout=10.0,
                    headers={"User-Agent": "CODEGA-AI/1.0 (education)"},
                )
                if full_r.status_code == 200:
                    sections = full_r.json().get("sections", [])
                    full_text = " ".join(
                        s.get("text", "")[:1000]
                        for s in sections[:5]
                    )
                    if len(full_text) > len(content):
                        content = content + "\n\n" + full_text
            except Exception:
                pass

            return LearnedArticle(
                title=title,
                url=url or f"https://{lang}.wikipedia.org/wiki/{title}",
                source="wikipedia",
                content=content[:5000],
                summary=content[:500],
                topics=[topic, title.lower()],
                quality=0.8,
            )
        except Exception as exc:
            log.debug("Wikipedia fetch hatası (%s): %s", topic, exc)
            return None


class ArXivSource:
    """ArXiv API — akademik makaleler, ML/AI için mükemmel."""

    def fetch(self, topic: str) -> Optional[LearnedArticle]:
        try:
            import httpx
            r = httpx.get(
                "http://export.arxiv.org/api/query",
                params={
                    "search_query": f"ti:{topic} OR abs:{topic}",
                    "start": 0,
                    "max_results": 1,
                    "sortBy": "relevance",
                    "sortOrder": "descending",
                },
                timeout=15.0,
            )
            if r.status_code != 200:
                return None

            # XML parse
            import xml.etree.ElementTree as ET
            root = ET.fromstring(r.text)
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            entries = root.findall("atom:entry", ns)
            if not entries:
                return None

            entry = entries[0]
            title = entry.findtext("atom:title", "", ns).strip()
            summary = entry.findtext("atom:summary", "", ns).strip()
            url_el = entry.find("atom:id", ns)
            url = url_el.text if url_el is not None else ""

            if len(summary) < MIN_CONTENT_CHARS:
                return None

            content = f"# {title}\n\n{summary}"

            return LearnedArticle(
                title=title,
                url=url,
                source="arxiv",
                content=content[:5000],
                summary=summary[:500],
                topics=[topic, "research", "academic"],
                quality=0.9,  # Akademik kaynak = yüksek kalite
            )
        except Exception as exc:
            log.debug("ArXiv fetch hatası (%s): %s", topic, exc)
            return None


class HackerNewsSource:
    """HackerNews API — güncel teknoloji haberleri."""

    def fetch_top(self, count: int = 5) -> list[LearnedArticle]:
        try:
            import httpx
            # Top stories
            ids_r = httpx.get(
                "https://hacker-news.firebaseio.com/v0/topstories.json",
                timeout=10.0,
            )
            ids = ids_r.json()[:20]

            articles = []
            for story_id in ids[:count * 3]:  # Daha fazla dene
                try:
                    item_r = httpx.get(
                        f"https://hacker-news.firebaseio.com/v0/item/{story_id}.json",
                        timeout=5.0,
                    )
                    item = item_r.json()
                    if not item or item.get("type") != "story":
                        continue

                    title = item.get("title", "")
                    url = item.get("url", "")
                    score = item.get("score", 0)

                    if score < 50 or not url:
                        continue

                    # URL içeriğini çek
                    content = self._fetch_url_content(url)
                    if not content or len(content) < MIN_CONTENT_CHARS:
                        content = title  # En azından başlık

                    articles.append(LearnedArticle(
                        title=title,
                        url=url,
                        source="hackernews",
                        content=content[:3000],
                        summary=f"HN #{score} puan: {title}",
                        topics=self._extract_topics_from_title(title),
                        quality=min(0.9, score / 500),
                    ))

                    if len(articles) >= count:
                        break
                except Exception:
                    continue

            return articles
        except Exception as exc:
            log.debug("HackerNews fetch hatası: %s", exc)
            return []

    def _fetch_url_content(self, url: str) -> str:
        """URL içeriğini BeautifulSoup ile çek."""
        try:
            import httpx
            from bs4 import BeautifulSoup  # type: ignore
            r = httpx.get(url, timeout=8.0, follow_redirects=True,
                          headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code != 200:
                return ""
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
                tag.decompose()
            text = soup.get_text(separator=" ", strip=True)
            return " ".join(text.split())[:4000]
        except Exception:
            return ""

    def _extract_topics_from_title(self, title: str) -> list[str]:
        keywords = re.findall(r'\b[A-Z][A-Za-z]{2,}\b', title)
        return [k.lower() for k in keywords[:5]] + ["hackernews", "technology"]


class StackOverflowSource:
    """StackOverflow API — teknik soru-cevaplar."""

    def fetch(self, topic: str) -> list[LearnedArticle]:
        try:
            import httpx
            r = httpx.get(
                "https://api.stackexchange.com/2.3/search/advanced",
                params={
                    "q": topic,
                    "site": "stackoverflow",
                    "pagesize": 3,
                    "sort": "votes",
                    "order": "desc",
                    "filter": "withbody",
                },
                timeout=10.0,
            )
            if r.status_code != 200:
                return []

            data = r.json()
            articles = []

            for item in data.get("items", [])[:2]:
                title = item.get("title", "")
                body = re.sub(r'<[^>]+>', ' ', item.get("body", ""))
                body = " ".join(body.split())
                score = item.get("score", 0)
                link = item.get("link", "")

                if score < 5 or len(body) < MIN_CONTENT_CHARS:
                    continue

                articles.append(LearnedArticle(
                    title=f"SO: {title}",
                    url=link,
                    source="stackoverflow",
                    content=f"Q: {title}\n\n{body[:3000]}",
                    summary=body[:300],
                    topics=[topic, "programming", "stackoverflow"],
                    quality=min(0.85, score / 100),
                ))

            return articles
        except Exception as exc:
            log.debug("StackOverflow fetch hatası (%s): %s", topic, exc)
            return []


class GitHubSource:
    """GitHub Trending — popüler ve yeni projeler."""

    def fetch_trending(self, lang: str = "") -> list[LearnedArticle]:
        try:
            import httpx
            from bs4 import BeautifulSoup
            url = "https://github.com/trending"
            if lang:
                url += f"/{lang}"
            r = httpx.get(url, timeout=10.0,
                          headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code != 200:
                return []

            soup = BeautifulSoup(r.text, "html.parser")
            repos = soup.select("article.Box-row")[:5]
            articles = []

            for repo in repos:
                try:
                    name_el = repo.select_one("h2 a")
                    if not name_el:
                        continue
                    name = name_el.get_text(strip=True).replace("\n", "").replace(" ", "")
                    desc_el = repo.select_one("p")
                    desc = desc_el.get_text(strip=True) if desc_el else ""
                    stars_el = repo.select_one("a[href*='/stargazers']")
                    stars = stars_el.get_text(strip=True) if stars_el else "?"

                    content = f"GitHub Trending: {name}\nYıldız: {stars}\nAçıklama: {desc}"
                    articles.append(LearnedArticle(
                        title=f"GitHub: {name}",
                        url=f"https://github.com/{name}",
                        source="github",
                        content=content,
                        summary=f"{name}: {desc[:200]}",
                        topics=self._topics_from_repo(name, desc),
                        quality=0.7,
                    ))
                except Exception:
                    continue

            return articles
        except Exception as exc:
            log.debug("GitHub trending hatası: %s", exc)
            return []

    def _topics_from_repo(self, name: str, desc: str) -> list[str]:
        text = (name + " " + desc).lower()
        found = []
        keywords = ["python", "javascript", "rust", "go", "ai", "ml",
                    "llm", "api", "web", "cli", "data", "docker"]
        for kw in keywords:
            if kw in text:
                found.append(kw)
        return found + ["github", "open-source"]


# ============================================================
# Ana Motor
# ============================================================

class AutonomousLearner:
    """Otonom öğrenme motoru. Singleton."""

    _instance: Optional["AutonomousLearner"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        LEARNER_DIR.mkdir(parents=True, exist_ok=True)
        self._stats = LearnerStats()
        self._topic_queue: queue.Queue = queue.Queue(maxsize=MAX_QUEUE_SIZE)
        self._seen_hashes: set[str] = set()
        self._knowledge_map: dict[str, list[str]] = {}  # topic → subtopics
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_activity = time.time()  # Son kullanıcı aktivitesi

        # Kaynaklar
        self._wiki = WikipediaSource()
        self._arxiv = ArXivSource()
        self._hn = HackerNewsSource()
        self._so = StackOverflowSource()
        self._gh = GitHubSource()

        self._load_state()
        self._seed_queue()

    @classmethod
    def get(cls) -> "AutonomousLearner":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ============================================================
    # Durum Kaydet/Yükle
    # ============================================================

    def _load_state(self) -> None:
        try:
            if KNOWLEDGE_MAP_FILE.exists():
                self._knowledge_map = json.loads(
                    KNOWLEDGE_MAP_FILE.read_text(encoding="utf-8")
                )
            if SEEN_HASHES_FILE.exists():
                self._seen_hashes = set(
                    SEEN_HASHES_FILE.read_text(encoding="utf-8").splitlines()
                )
            if STATS_FILE.exists():
                d = json.loads(STATS_FILE.read_text(encoding="utf-8"))
                self._stats.total_articles = d.get("total_articles", 0)
                self._stats.total_topics = d.get("total_topics", 0)
                self._stats.total_chars = d.get("total_chars", 0)
                self._stats.cycles_completed = d.get("cycles_completed", 0)
                self._stats.sources_breakdown = d.get("sources", {})
            if TOPIC_QUEUE_FILE.exists():
                saved_topics = json.loads(
                    TOPIC_QUEUE_FILE.read_text(encoding="utf-8")
                )
                for t in saved_topics[:200]:
                    try:
                        self._topic_queue.put_nowait(t)
                    except queue.Full:
                        break
            log.info("Otonom öğrenme durumu yüklendi: %d makale, %d konu",
                     self._stats.total_articles, self._topic_queue.qsize())
        except Exception as exc:
            log.debug("Durum yüklenemedi: %s", exc)

    def _save_state(self) -> None:
        try:
            KNOWLEDGE_MAP_FILE.write_text(
                json.dumps(self._knowledge_map, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            SEEN_HASHES_FILE.write_text(
                "\n".join(list(self._seen_hashes)[-10000:]),
                encoding="utf-8",
            )
            STATS_FILE.write_text(
                json.dumps(self._stats.to_dict(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            # Kuyruğu kaydet (önden 200 tanesini)
            queue_snapshot = []
            temp = []
            while not self._topic_queue.empty():
                try:
                    t = self._topic_queue.get_nowait()
                    temp.append(t)
                    queue_snapshot.append(t)
                except queue.Empty:
                    break
            for t in temp:
                try:
                    self._topic_queue.put_nowait(t)
                except queue.Full:
                    break
            TOPIC_QUEUE_FILE.write_text(
                json.dumps(queue_snapshot[:200], ensure_ascii=False),
                encoding="utf-8",
            )
        except Exception as exc:
            log.debug("Durum kaydedilemedi: %s", exc)

    # ============================================================
    # Konu Yönetimi
    # ============================================================

    def _seed_queue(self) -> None:
        """Başlangıç konularını kuyruğa ekle."""
        import random
        topics = SEED_TOPICS.copy()
        random.shuffle(topics)
        for topic in topics:
            if topic not in self._knowledge_map:
                try:
                    self._topic_queue.put_nowait(topic)
                except queue.Full:
                    break

    def _next_topic(self) -> str:
        """Sıradaki öğrenilecek konuyu seç."""
        # Önce kuyruktan
        try:
            return self._topic_queue.get_nowait()
        except queue.Empty:
            pass

        # Kuyruk boşsa: bilgi haritasından henüz işlenmemiş konu bul
        for topic, subtopics in self._knowledge_map.items():
            for sub in subtopics:
                if sub not in self._knowledge_map:
                    return sub

        # Hâlâ boşsa: seed'leri yeniden ekle
        self._seed_queue()
        return self._topic_queue.get(timeout=5)

    def _expand_topic(self, topic: str, article: LearnedArticle) -> None:
        """
        Öğrenilen konudan yeni alt konular türet.
        Bilgi grafiğini genişlet.
        """
        new_subtopics = []

        # Statik genişletme haritasından
        for key, subs in TOPIC_EXPANSION.items():
            if key in topic.lower():
                new_subtopics.extend(subs)

        # Makale başlığından anahtar kelimeler çek
        title_words = re.findall(r'\b[A-Za-z][a-z]{3,}\b', article.title)
        new_subtopics.extend([w.lower() for w in title_words[:5]])

        # Makale konularından
        new_subtopics.extend(article.topics)

        # LLM varsa daha akıllı genişletme
        new_subtopics.extend(self._llm_expand(topic))

        # Deduplicate + kaydet
        new_subtopics = list(set(new_subtopics))
        self._knowledge_map[topic] = new_subtopics

        # Bilinmeyenleri kuyruğa ekle
        added = 0
        for sub in new_subtopics:
            if sub and sub not in self._knowledge_map and len(sub) > 3:
                try:
                    self._topic_queue.put_nowait(sub)
                    added += 1
                except queue.Full:
                    break

        if added:
            log.debug("Konu genişleme: '%s' → %d yeni konu", topic, added)

    def _llm_expand(self, topic: str) -> list[str]:
        """LLM ile konudan ilgili alt konuları çıkar."""
        try:
            from codegaai.core.engine import LLMEngine
            engine = LLMEngine.get()
            if not engine.is_ready:
                return []

            prompt = (
                f"'{topic}' konusuyla ilgili öğrenilmesi gereken "
                f"5 alt konu veya bağlantılı kavramı listele. "
                f"Sadece virgülle ayrılmış liste (başka hiçbir şey yok):"
            )
            result = engine.generate(
                [{"role": "user", "content": prompt}],
                use_tools=False,
            )
            text = result.get("content", "")
            # Parse: "transformer, BERT, attention, GPT, tokenization"
            items = [i.strip().lower() for i in text.split(",") if i.strip()]
            return items[:5]
        except Exception:
            return []

    # ============================================================
    # İçerik İşleme + RAG'a Kaydetme
    # ============================================================

    def _is_duplicate(self, article: LearnedArticle) -> bool:
        return article.content_hash in self._seen_hashes

    def _store_article(self, article: LearnedArticle) -> bool:
        """Makaleyi RAG belleğine kaydet."""
        try:
            from codegaai.core.memory import MemoryStore
            mem = MemoryStore.get()

            # Büyük içeriği parçalara böl (chunking)
            chunks = self._chunk_text(article.content, chunk_size=800)

            for i, chunk in enumerate(chunks):
                mem.add(
                    text=chunk,
                    metadata={
                        "source": f"auto_learn:{article.source}",
                        "title": article.title,
                        "url": article.url,
                        "topics": ",".join(article.topics[:3]),
                        "quality": article.quality,
                        "chunk": i,
                        "learned_at": article.learned_at,
                    },
                    collection="archive" if i > 0 else "core",
                )

            # Hash kaydet (tekrar engeli)
            self._seen_hashes.add(article.content_hash)

            # İstatistik güncelle
            self._stats.total_articles += 1
            self._stats.total_chars += len(article.content)
            src = article.source
            self._stats.sources_breakdown[src] = (
                self._stats.sources_breakdown.get(src, 0) + 1
            )

            log.debug("Öğrenildi: '%s' (%s, %d chr)",
                      article.title[:50], article.source, len(article.content))
            return True

        except Exception as exc:
            log.warning("Makale kaydetme hatası: %s", exc)
            return False

    def _chunk_text(self, text: str, chunk_size: int = 800) -> list[str]:
        """Metni örtüşen parçalara böl."""
        if len(text) <= chunk_size:
            return [text]
        chunks = []
        overlap = 100
        i = 0
        while i < len(text):
            chunk = text[i:i + chunk_size]
            if chunk:
                chunks.append(chunk)
            i += chunk_size - overlap
        return chunks

    def _assess_quality(self, content: str) -> float:
        """İçerik kalitesini değerlendir (0-1)."""
        score = 0.5
        if len(content) > 1000:
            score += 0.2
        if len(content) > 3000:
            score += 0.1
        # Teknik içerik göstergesi
        tech_markers = ["```", "def ", "function", "class ", "import ",
                        "algorithm", "model", "parameter"]
        matches = sum(1 for m in tech_markers if m in content.lower())
        score += min(0.2, matches * 0.03)
        return min(1.0, score)

    # ============================================================
    # Idle Tespiti
    # ============================================================

    def mark_activity(self) -> None:
        """Kullanıcı aktivitesi bildiri — idle sayacını sıfırla."""
        self._last_activity = time.time()

    def is_idle(self) -> bool:
        """5 dakikadan fazla idle mi?"""
        return (time.time() - self._last_activity) >= IDLE_THRESHOLD_S

    # ============================================================
    # Öğrenme Döngüsü
    # ============================================================

    def _learn_cycle(self) -> int:
        """Tek bir öğrenme döngüsü. Dönüş: kaydedilen makale sayısı."""
        saved = 0

        try:
            topic = self._next_topic()
        except Exception:
            return 0

        self._stats.current_topic = topic
        log.info("Otonom öğrenme: '%s'", topic)

        # Tüm kaynaklardan paralel çek
        articles: list[LearnedArticle] = []

        # Wikipedia (en güvenilir)
        wiki_art = self._wiki.fetch(topic)
        if wiki_art:
            articles.append(wiki_art)

        # ArXiv (ML/AI konularında)
        if any(kw in topic.lower() for kw in
               ["model", "neural", "learning", "ai", "attention",
                "transformer", "nlp", "vision", "algorithm"]):
            arxiv_art = self._arxiv.fetch(topic)
            if arxiv_art:
                articles.append(arxiv_art)

        # StackOverflow (teknik konularda)
        if any(kw in topic.lower() for kw in
               ["python", "php", "javascript", "sql", "api",
                "code", "programming", "function", "class"]):
            so_arts = self._so.fetch(topic)
            articles.extend(so_arts[:1])

        # Kaydet
        for article in articles:
            article.quality = self._assess_quality(article.content)

            if self._is_duplicate(article):
                log.debug("Atlandı (tekrar): %s", article.title[:40])
                continue

            if len(article.content) < MIN_CONTENT_CHARS:
                continue

            if self._store_article(article):
                saved += 1
                self._expand_topic(topic, article)

        # Periodic: HackerNews + GitHub trending
        if self._stats.cycles_completed % 10 == 0:
            hn_arts = self._hn.fetch_top(count=2)
            for art in hn_arts:
                if not self._is_duplicate(art):
                    self._store_article(art)
                    saved += 1

        if self._stats.cycles_completed % 20 == 0:
            gh_arts = self._gh.fetch_trending()
            for art in gh_arts[:2]:
                if not self._is_duplicate(art):
                    self._store_article(art)
                    saved += 1

        self._stats.cycles_completed += 1
        self._stats.total_topics = len(self._knowledge_map)
        self._stats.last_learn_time = time.time()

        # Her 10 döngüde kaydet
        if self._stats.cycles_completed % 10 == 0:
            self._save_state()

        return saved

    # ============================================================
    # Arka Plan Thread
    # ============================================================

    def start(self) -> None:
        """Otonom öğrenme thread'ini başlat."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._loop,
            daemon=True,
            name="autonomous-learner",
        )
        self._thread.start()
        log.info("Otonom öğrenme başlatıldı")

    def stop(self) -> None:
        self._running = False
        self._save_state()
        log.info("Otonom öğrenme durduruldu")

    def _loop(self) -> None:
        """Ana döngü: idle'da öğren, meşgulken uyu."""
        while self._running:
            try:
                if self.is_idle():
                    self._stats.state = "learning"
                    saved = self._learn_cycle()
                    if saved:
                        log.info("Öğrenme döngüsü: +%d makale "
                                 "(toplam: %d, %d bilinen konu)",
                                 saved, self._stats.total_articles,
                                 len(self._knowledge_map))
                    # Kısa uyku (yoğun internet kullanımı engeli)
                    time.sleep(LEARN_CYCLE_INTERVAL_S)
                else:
                    self._stats.state = "idle"
                    time.sleep(10)  # 10 sn bekle, idle kontrol et

            except Exception as exc:
                log.warning("Öğrenme döngüsü hatası: %s", exc)
                time.sleep(60)

    @property
    def stats(self) -> dict:
        return {
            **self._stats.to_dict(),
            "queue_size": self._topic_queue.qsize(),
            "knowledge_map_size": len(self._knowledge_map),
            "seen_hashes": len(self._seen_hashes),
            "idle": self.is_idle(),
            "running": self._running,
            "idle_seconds": int(time.time() - self._last_activity),
        }
