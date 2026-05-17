"""
Otonom Öğrenme uç noktaları.

GET  /api/autolearn/status    — anlık durum ve istatistikler
GET  /api/autolearn/topics    — bilgi haritası (öğrenilen konular)
POST /api/autolearn/start     — öğrenmeyi başlat
POST /api/autolearn/stop      — durdur
POST /api/autolearn/trigger   — şimdi öğren (idle beklemeden)
GET  /api/autolearn/queue     — konu kuyruğu
POST /api/autolearn/add-topic — kuyruğa konu ekle
"""

from __future__ import annotations

import threading

from fastapi import APIRouter
from pydantic import BaseModel

from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()


@router.get("/status")
async def status() -> dict:
    from codegaai.core.autonomous_learner import AutonomousLearner
    return {
        **AutonomousLearner.get().stats,
        "phase": "Faz 13",
    }


@router.post("/start")
async def start() -> dict:
    from codegaai.core.autonomous_learner import AutonomousLearner
    lrn = AutonomousLearner.get()
    lrn.start()
    return {"started": True, "status": lrn.stats}


@router.post("/stop")
async def stop() -> dict:
    from codegaai.core.autonomous_learner import AutonomousLearner
    lrn = AutonomousLearner.get()
    lrn.stop()
    return {"stopped": True}


@router.post("/trigger")
async def trigger_now() -> dict:
    """Idle beklemeden hemen bir öğrenme döngüsü başlat."""
    from codegaai.core.autonomous_learner import AutonomousLearner
    lrn = AutonomousLearner.get()

    def _run():
        try:
            saved = lrn._learn_cycle()
            log.info("Manuel tetikleme: +%d makale", saved)
        except Exception as exc:
            log.warning("Manuel tetikleme hatası: %s", exc)

    threading.Thread(target=_run, daemon=True, name="trigger-learn").start()
    return {"triggered": True, "message": "Öğrenme döngüsü başlatıldı"}


@router.get("/topics")
async def topics(limit: int = 100) -> dict:
    from codegaai.core.autonomous_learner import AutonomousLearner
    lrn = AutonomousLearner.get()
    km = lrn._knowledge_map
    return {
        "total": len(km),
        "topics": {k: v[:5] for k, v in list(km.items())[:limit]},
    }


@router.get("/queue")
async def queue_list(limit: int = 20) -> dict:
    from codegaai.core.autonomous_learner import AutonomousLearner
    lrn = AutonomousLearner.get()
    items = []
    temp = []
    while len(items) < limit:
        try:
            t = lrn._topic_queue.get_nowait()
            items.append(t)
            temp.append(t)
        except Exception:
            break
    for t in temp:
        try:
            lrn._topic_queue.put_nowait(t)
        except Exception:
            break
    return {"queue_size": lrn._topic_queue.qsize(), "next_topics": items}


class AddTopicRequest(BaseModel):
    topic: str
    priority: bool = True  # True = önce ekle


@router.post("/add-topic")
async def add_topic(req: AddTopicRequest) -> dict:
    from codegaai.core.autonomous_learner import AutonomousLearner
    lrn = AutonomousLearner.get()
    try:
        lrn._topic_queue.put_nowait(req.topic)
        return {"added": True, "topic": req.topic,
                "queue_size": lrn._topic_queue.qsize()}
    except Exception:
        return {"added": False, "error": "Kuyruk dolu"}


@router.post("/refill")
async def refill_queue() -> dict:
    """Manuel queue yenileme — trend kaynaklarından yeni konular çek."""
    from codegaai.core.autonomous_learner import AutonomousLearner
    lrn = AutonomousLearner.get()
    try:
        added = lrn._refill_from_trends()
        return {
            "success": True,
            "added": added,
            "queue_size": lrn._topic_queue.qsize(),
            "message": f"+{added} yeni konu eklendi"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.get("/learned-topics")
async def learned_topics(limit: int = 50) -> dict:
    """Öğrenilen konuların listesi (knowledge_map)."""
    from codegaai.core.autonomous_learner import AutonomousLearner
    lrn = AutonomousLearner.get()
    topics = list(lrn._knowledge_map.keys())[:limit]
    return {
        "total": len(lrn._knowledge_map),
        "topics": [
            {
                "topic": t,
                "subtopics_count": len(lrn._knowledge_map.get(t, [])),
                "subtopics": lrn._knowledge_map.get(t, [])[:5],
            }
            for t in topics
        ]
    }
