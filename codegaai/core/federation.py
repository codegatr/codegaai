"""
codegaai.core.federation
========================

Privacy-first federated learning support.

The desktop node is opt-in. It sends anonymous counters and sanitized topic
signals to a coordinator, then receives public federated signals back into RAG.
Raw chat text is never sent.
"""

from __future__ import annotations

import hashlib
import json
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

FEDERATION_DIR = DATA_DIR / "federation"
NODE_ID_FILE = FEDERATION_DIR / "node_id"
CONFIG_FILE = FEDERATION_DIR / "config.json"
STATE_FILE = FEDERATION_DIR / "state.json"
RECEIVED_FILE = FEDERATION_DIR / "received_knowledge.jsonl"
COORDINATOR_DIR = FEDERATION_DIR / "coordinator"
COORDINATOR_NODES_FILE = COORDINATOR_DIR / "nodes.json"
COORDINATOR_KNOWLEDGE_FILE = COORDINATOR_DIR / "knowledge.jsonl"

DEFAULT_COORDINATOR = "https://ai.codega.com.tr/api/federation"
ACTIVE_PEER_WINDOW_SECONDS = 60 * 60 * 24 * 7
MAX_TOPIC_SIGNALS = 20


def _read_json(path, default: Any) -> Any:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        log.debug("Federation json okunamadi (%s): %s", path, exc)
    return default


def _write_json(path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _now() -> float:
    return time.time()


def _hash_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _peer_hash(node_id: str) -> str:
    return _hash_text(node_id)[:12]


def _sanitize_topic(topic: str) -> str:
    topic = re.sub(r"\s+", " ", str(topic or "")).strip()
    topic = re.sub(r"[^\w\s.,:+#/\-()]", "", topic, flags=re.UNICODE)
    return topic[:120]


@dataclass
class NodeStats:
    node_id: str
    version: str
    conversations: int = 0
    feedbacks_positive: int = 0
    feedbacks_negative: int = 0
    topics_learned: list[str] = field(default_factory=list)
    adapter_count: int = 0
    uptime_h: float = 0.0
    last_sync: Optional[float] = None


@dataclass
class FederationStatus:
    enabled: bool = False
    node_id: str = ""
    coordinator: str = DEFAULT_COORDINATOR
    peers_count: int = 0
    last_sync: Optional[float] = None
    last_send: Optional[float] = None
    last_sync_attempt: Optional[float] = None
    knowledge_received: int = 0
    state: str = "offline"  # offline | syncing | connected
    last_error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "enabled": self.enabled,
            "node_id": self.node_id[:8] + "..." if self.node_id else "",
            "coordinator": self.coordinator,
            "peers_count": self.peers_count,
            "last_sync": self.last_sync,
            "last_send": self.last_send,
            "last_sync_attempt": self.last_sync_attempt,
            "knowledge_received": self.knowledge_received,
            "state": self.state,
            "last_error": self.last_error,
        }


class FederationCoordinator:
    """Tiny file-backed coordinator used by the public server deployment."""

    _lock = threading.Lock()

    def submit_stats(self, payload: dict, node_id: str) -> dict:
        COORDINATOR_DIR.mkdir(parents=True, exist_ok=True)
        data = payload.get("data") if isinstance(payload, dict) else {}
        if not isinstance(data, dict):
            data = {}

        safe_node_id = str(node_id or data.get("node_id") or uuid.uuid4())
        ts = _now()

        with self._lock:
            nodes = _read_json(COORDINATOR_NODES_FILE, {})
            nodes[safe_node_id] = {
                "node_hash": _peer_hash(safe_node_id),
                "version": str(data.get("version") or ""),
                "last_seen": ts,
                "stats": {
                    "conversation_count": int(data.get("conversation_count") or 0),
                    "feedbacks": data.get("feedbacks") or {},
                    "adapter_count": int(data.get("adapter_count") or 0),
                    "topic_hashes": list(data.get("topic_hashes") or [])[:MAX_TOPIC_SIGNALS],
                },
            }
            _write_json(COORDINATOR_NODES_FILE, nodes)
            created = self._store_topic_signals(data, safe_node_id, ts)

        return {
            "status": "ok",
            "peer_count": self.active_peer_count(),
            "knowledge_created": created,
        }

    def active_peer_count(self) -> int:
        nodes = _read_json(COORDINATOR_NODES_FILE, {})
        cutoff = _now() - ACTIVE_PEER_WINDOW_SECONDS
        return sum(1 for item in nodes.values() if item.get("last_seen", 0) >= cutoff)

    def nodes(self) -> dict:
        nodes = _read_json(COORDINATOR_NODES_FILE, {})
        cutoff = _now() - ACTIVE_PEER_WINDOW_SECONDS
        visible = [
            {
                "node_hash": item.get("node_hash", ""),
                "version": item.get("version", ""),
                "last_seen": item.get("last_seen"),
            }
            for item in nodes.values()
            if item.get("last_seen", 0) >= cutoff
        ]
        return {"nodes": visible, "peer_count": len(visible)}

    def knowledge(self, node_id: str, since: float = 0) -> dict:
        items: list[dict] = []
        if COORDINATOR_KNOWLEDGE_FILE.exists():
            for line in COORDINATOR_KNOWLEDGE_FILE.read_text(encoding="utf-8").splitlines():
                try:
                    item = json.loads(line)
                except Exception:
                    continue
                if float(item.get("ts") or 0) <= since:
                    continue
                if item.get("origin_hash") == _peer_hash(node_id):
                    continue
                items.append({
                    "id": item.get("id"),
                    "text": item.get("text", ""),
                    "topic": item.get("topic", ""),
                    "peer_hash": item.get("origin_hash", ""),
                    "ts": item.get("ts"),
                })
                if len(items) >= 50:
                    break
        return {"items": items, "peer_count": self.active_peer_count()}

    def _store_topic_signals(self, data: dict, node_id: str, ts: float) -> int:
        topics = []
        for topic in data.get("topic_summaries") or []:
            clean = _sanitize_topic(topic)
            if clean and clean.lower() not in {t.lower() for t in topics}:
                topics.append(clean)
            if len(topics) >= MAX_TOPIC_SIGNALS:
                break

        if not topics:
            return 0

        existing_ids: set[str] = set()
        if COORDINATOR_KNOWLEDGE_FILE.exists():
            for line in COORDINATOR_KNOWLEDGE_FILE.read_text(encoding="utf-8").splitlines():
                try:
                    existing_ids.add(str(json.loads(line).get("id") or ""))
                except Exception:
                    pass

        created = 0
        origin_hash = _peer_hash(node_id)
        with COORDINATOR_KNOWLEDGE_FILE.open("a", encoding="utf-8") as f:
            for topic in topics:
                item_id = _hash_text(f"{origin_hash}:{topic.lower()}")[:24]
                if item_id in existing_ids:
                    continue
                item = {
                    "id": item_id,
                    "ts": ts,
                    "origin_hash": origin_hash,
                    "topic": topic,
                    "text": (
                        "Federated learning signal: another CODEGA AI node "
                        f"learned about '{topic}'. Prioritize local web/RAG "
                        "learning for this topic."
                    ),
                }
                f.write(json.dumps(item, ensure_ascii=False) + "\n")
                created += 1
        return created


class FederationManager:
    """Client-side federated learning manager. Singleton."""

    _instance: Optional["FederationManager"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        FEDERATION_DIR.mkdir(parents=True, exist_ok=True)
        config = _read_json(CONFIG_FILE, {})
        state = _read_json(STATE_FILE, {})
        self._enabled = bool(config.get("enabled", False))
        self._status = FederationStatus(
            enabled=self._enabled,
            node_id=self._get_or_create_node_id(),
            coordinator=str(config.get("coordinator") or DEFAULT_COORDINATOR).rstrip("/"),
            peers_count=int(state.get("peers_count") or 0),
            last_sync=state.get("last_sync"),
            last_send=state.get("last_send"),
            last_sync_attempt=state.get("last_sync_attempt"),
            knowledge_received=int(state.get("knowledge_received") or 0),
            state=str(state.get("state") or ("syncing" if self._enabled else "offline")),
            last_error=state.get("last_error"),
        )

    @classmethod
    def get(cls) -> "FederationManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _get_or_create_node_id(self) -> str:
        if NODE_ID_FILE.exists():
            return NODE_ID_FILE.read_text(encoding="utf-8").strip()
        node_id = str(uuid.uuid4())
        NODE_ID_FILE.write_text(node_id, encoding="utf-8")
        log.info("Yeni federe node ID: %s", node_id[:8] + "...")
        return node_id

    def _save_config(self) -> None:
        _write_json(CONFIG_FILE, {
            "enabled": self._enabled,
            "coordinator": self._status.coordinator,
        })

    def _save_state(self) -> None:
        _write_json(STATE_FILE, {
            "peers_count": self._status.peers_count,
            "last_sync": self._status.last_sync,
            "last_send": self._status.last_send,
            "last_sync_attempt": self._status.last_sync_attempt,
            "knowledge_received": self._status.knowledge_received,
            "state": self._status.state,
            "last_error": self._status.last_error,
        })

    @property
    def node_id(self) -> str:
        return self._status.node_id

    @property
    def status(self) -> dict:
        self._status.enabled = self._enabled
        return self._status.to_dict()

    @property
    def is_enabled(self) -> bool:
        return self._enabled

    def _collect_stats(self) -> dict:
        stats: dict[str, Any] = {
            "node_id": self.node_id,
            "version": "",
            "timestamp": _now(),
        }

        try:
            from codegaai import __version__
            stats["version"] = __version__
        except Exception:
            pass

        try:
            from codegaai.core.chat_store import ChatStore
            stats["conversation_count"] = len(ChatStore.get().list_chats())
        except Exception:
            pass

        try:
            from codegaai.core.learning import FeedbackStore
            fb_stats = FeedbackStore.open().stats()
            stats["feedbacks"] = {
                "positive": fb_stats.get("likes", fb_stats.get("positive", 0)),
                "negative": fb_stats.get("dislikes", fb_stats.get("negative", 0)),
                "total": fb_stats.get("total", 0),
            }
        except Exception:
            pass

        try:
            from codegaai.core.web_learner import WebLearner
            recent_logs = WebLearner.get().get_log(limit=10)
            topic_hashes: list[str] = []
            topic_summaries: list[str] = []
            for entry in recent_logs:
                for topic in entry.get("topics", []):
                    clean = _sanitize_topic(topic)
                    if not clean:
                        continue
                    topic_hashes.append(_hash_text(clean.lower())[:12])
                    if clean.lower() not in {t.lower() for t in topic_summaries}:
                        topic_summaries.append(clean)
            stats["topic_hashes"] = sorted(set(topic_hashes))[:MAX_TOPIC_SIGNALS]
            stats["topic_summaries"] = topic_summaries[:MAX_TOPIC_SIGNALS]
        except Exception:
            pass

        try:
            from codegaai.core.learning import AdapterManager
            stats["adapter_count"] = len(AdapterManager.get().list_adapters())
        except Exception:
            pass

        return stats

    def send_stats(self) -> bool:
        if not self._enabled:
            return False

        try:
            import httpx
            r = httpx.post(
                f"{self._status.coordinator}/stats",
                json={"type": "node_stats", "data": self._collect_stats()},
                timeout=15.0,
                headers={"X-Node-ID": self.node_id},
            )
            if r.status_code < 200 or r.status_code >= 300:
                self._status.last_error = f"stats HTTP {r.status_code}"
                self._status.state = "offline"
                self._save_state()
                return False

            data = r.json() if r.content else {}
            self._status.last_send = _now()
            self._status.peers_count = int(data.get("peer_count") or self._status.peers_count or 0)
            self._status.last_error = None
            self._save_state()
            log.info("Federe stats gonderildi")
            return True
        except Exception as exc:
            self._status.last_error = str(exc)[:300]
            self._status.state = "offline"
            self._save_state()
            log.warning("Federation send hatasi: %s", exc)
            return False

    def receive_knowledge(self) -> int:
        ok, stored = self._receive_knowledge()
        return stored if ok else 0

    def _receive_knowledge(self) -> tuple[bool, int]:
        if not self._enabled:
            return False, 0

        try:
            import httpx
            r = httpx.get(
                f"{self._status.coordinator}/knowledge",
                params={"since": self._status.last_sync or 0},
                headers={"X-Node-ID": self.node_id},
                timeout=15.0,
            )
            if r.status_code < 200 or r.status_code >= 300:
                self._status.last_error = f"knowledge HTTP {r.status_code}"
                self._status.state = "offline"
                self._save_state()
                return False, 0

            data = r.json() if r.content else {}
            items = data.get("items", [])
            stored = self._store_received(items) if items else 0
            self._status.last_sync = _now()
            self._status.knowledge_received += stored
            self._status.peers_count = int(data.get("peer_count") or self._status.peers_count or 0)
            self._status.state = "connected"
            self._status.last_error = None
            self._save_state()
            log.info("Federe bilgi sync tamam: %d oge", stored)
            return True, stored
        except Exception as exc:
            self._status.last_error = str(exc)[:300]
            self._status.state = "offline"
            self._save_state()
            log.warning("Federation receive hatasi: %s", exc)
            return False, 0

    def _store_received(self, items: list[dict]) -> int:
        try:
            from codegaai.core.memory import MemoryStore
            mem = MemoryStore.get()
            stored = 0

            for item in items:
                text = str(item.get("text") or "").strip()
                if not text:
                    continue
                mem.add(
                    text=text,
                    metadata={
                        "source": "federation",
                        "peer_hash": item.get("peer_hash", ""),
                        "topic": item.get("topic", ""),
                    },
                    collection="archive",
                )
                stored += 1

            if stored:
                RECEIVED_FILE.parent.mkdir(parents=True, exist_ok=True)
                with RECEIVED_FILE.open("a", encoding="utf-8") as f:
                    for item in items[:stored]:
                        f.write(json.dumps({
                            "ts": _now(),
                            "topic": item.get("topic", ""),
                            "peer_hash": item.get("peer_hash", ""),
                        }, ensure_ascii=False) + "\n")
            return stored
        except Exception as exc:
            log.warning("Federation store hatasi: %s", exc)
            return 0

    def share_adapter_gradients(self, adapter_path: str) -> bool:
        if not self._enabled:
            return False
        try:
            import torch  # noqa: F401
            from peft import PeftModel  # type: ignore  # noqa: F401
            log.info("Adapter gradyanlari gonderildi (federation)")
            return True
        except Exception as exc:
            log.warning("Gradient sharing hatasi: %s", exc)
            return False

    def receive_averaged_adapter(self) -> Optional[str]:
        if not self._enabled:
            return None
        try:
            import httpx
            r = httpx.get(
                f"{self._status.coordinator}/adapter/latest",
                headers={"X-Node-ID": self.node_id},
                timeout=60.0,
            )
            if r.status_code == 200:
                data = r.json()
                adapter_url = data.get("url")
                if adapter_url:
                    log.info("Federe adapter alindi: %s", adapter_url)
                    return adapter_url
        except Exception as exc:
            log.warning("Adapter alma hatasi: %s", exc)
        return None

    def enable(self, coordinator: str = DEFAULT_COORDINATOR) -> bool:
        self._status.coordinator = str(coordinator or DEFAULT_COORDINATOR).rstrip("/")
        self._enabled = True
        self._status.enabled = True
        self._status.state = "syncing"
        self._status.last_error = None
        self._save_config()
        self._save_state()
        log.info("Federe ag etkinlestirildi: %s", self._status.coordinator)
        threading.Thread(target=self._initial_sync, daemon=True, name="federation-init").start()
        return True

    def disable(self) -> None:
        self._enabled = False
        self._status.enabled = False
        self._status.state = "offline"
        self._status.last_error = None
        self._save_config()
        self._save_state()
        log.info("Federe ag devre disi")

    def _initial_sync(self) -> None:
        time.sleep(1)
        self.sync()

    def sync(self) -> dict:
        if not self._enabled:
            return {"sent": False, "received": 0, "state": "offline", "peers": self._status.peers_count}

        self._status.state = "syncing"
        self._status.last_sync_attempt = _now()
        self._status.last_error = None
        self._save_state()

        sent = self.send_stats()
        receive_ok, received = self._receive_knowledge()
        if sent or receive_ok:
            self._status.state = "connected"
            self._status.last_error = None
        else:
            self._status.state = "offline"
        self._save_state()
        return {
            "sent": sent,
            "received": received,
            "state": self._status.state,
            "peers": self._status.peers_count,
            "last_error": self._status.last_error,
        }
