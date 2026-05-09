"""
codegaai.core.user_profile
============================

Kullanıcı Profili — Otomatik Uzun Dönemli Bellek.

Her sohbetten kullanıcı hakkında bilgi çıkarır ve profilini günceller:
- Ad, meslek, şehir
- İlgi alanları ve uzmanlıkları
- Proje ve görevler
- Tercihler (iletişim tonu, detay seviyesi)
- Öğrenilmiş bilgiler

Bu profil her sohbetin sistem promptuna eklenir, böylece model
kullanıcıyı hatırlar ve kişiselleştirilmiş yanıtlar üretir.
"""

from __future__ import annotations

import json
import time
import threading
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any, Optional

from codegaai.config import DATA_DIR
from codegaai.utils.logger import get_logger

log = get_logger(__name__)

PROFILE_PATH = DATA_DIR / "user_profile.json"


@dataclass
class UserProfile:
    # Temel bilgiler
    name: str = ""
    location: str = ""
    occupation: str = ""
    language: str = "tr"  # Tercih edilen dil

    # Uzmanlık ve ilgi alanları
    expertise: list[str] = field(default_factory=list)
    interests: list[str] = field(default_factory=list)

    # Aktif projeler
    projects: list[dict] = field(default_factory=list)

    # İletişim tercihleri
    preferred_tone: str = "professional"  # casual | professional | technical
    detail_level: str = "medium"          # brief | medium | detailed
    prefers_code_examples: bool = True

    # Öğrenilmiş bilgiler (araç veya sohbetten)
    facts: list[str] = field(default_factory=list)

    # Metadata
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    conversation_count: int = 0

    def to_dict(self) -> dict:
        return asdict(self)

    def to_system_prompt(self) -> str:
        """Profili sistem prompt bölümüne çevir."""
        parts = []

        if self.name:
            parts.append(f"Kullanıcının adı: {self.name}")
        if self.occupation:
            parts.append(f"Meslek: {self.occupation}")
        if self.location:
            parts.append(f"Konum: {self.location}")
        if self.expertise:
            parts.append(f"Uzmanlık: {', '.join(self.expertise[:5])}")
        if self.interests:
            parts.append(f"İlgi alanları: {', '.join(self.interests[:5])}")
        if self.projects:
            proj_names = [p.get("name", "") for p in self.projects[:3]]
            parts.append(f"Aktif projeler: {', '.join(proj_names)}")
        if self.facts:
            parts.append("Bilinen bilgiler:\n" +
                        "\n".join(f"  - {f}" for f in self.facts[-10:]))

        if not parts:
            return ""

        tone_map = {
            "casual": "samimi ve arkadaşça",
            "professional": "profesyonel ve net",
            "technical": "teknik ve detaylı",
        }
        detail_map = {
            "brief": "kısa ve öz",
            "medium": "orta detaylı",
            "detailed": "kapsamlı ve detaylı",
        }

        parts.append(
            f"İletişim tarzı: {tone_map.get(self.preferred_tone, 'profesyonel')}, "
            f"{detail_map.get(self.detail_level, 'orta detaylı')} yanıtlar"
        )

        return "## Kullanıcı Profili\n" + "\n".join(parts)


class ProfileManager:
    """Kullanıcı profili yöneticisi. Singleton."""

    _instance: Optional["ProfileManager"] = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._profile = self._load()

    @classmethod
    def get(cls) -> "ProfileManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ====== Profil okuma/yazma ======

    def _load(self) -> UserProfile:
        try:
            if PROFILE_PATH.exists():
                data = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
                return UserProfile(**{k: v for k, v in data.items()
                                     if k in UserProfile.__dataclass_fields__})
        except Exception as exc:
            log.warning("Profil yükleme hatası: %s", exc)
        return UserProfile()

    def _save(self) -> None:
        try:
            PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
            PROFILE_PATH.write_text(
                json.dumps(self._profile.to_dict(), ensure_ascii=False,
                           indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            log.warning("Profil kayıt hatası: %s", exc)

    @property
    def profile(self) -> UserProfile:
        return self._profile

    def to_dict(self) -> dict:
        return self._profile.to_dict()

    def to_system_prompt(self) -> str:
        return self._profile.to_system_prompt()

    # ====== Güncelleme ======

    def update(self, **kwargs) -> None:
        """Profili kısmen güncelle."""
        p = self._profile
        for k, v in kwargs.items():
            if hasattr(p, k):
                setattr(p, k, v)
        p.updated_at = time.time()
        self._save()

    def add_fact(self, fact: str) -> None:
        if fact and fact not in self._profile.facts:
            self._profile.facts.append(fact)
            self._profile.updated_at = time.time()
            self._save()

    def add_project(self, name: str, description: str = "") -> None:
        existing = [p["name"] for p in self._profile.projects]
        if name not in existing:
            self._profile.projects.append({
                "name": name,
                "description": description,
                "added_at": time.time(),
            })
            self._profile.updated_at = time.time()
            self._save()

    def increment_conversations(self) -> None:
        self._profile.conversation_count += 1
        self._profile.updated_at = time.time()
        self._save()

    # ====== Otomatik çıkarım ======

    def extract_from_messages(self, messages: list[dict]) -> None:
        """
        Sohbet mesajlarından kullanıcı bilgisi çıkar.
        LLM üzerinden meta-öğrenme.
        """
        from codegaai.core.engine import LLMEngine
        engine = LLMEngine.get()
        if not engine.is_ready:
            return

        text = "\n".join(
            f"{m.get('role', 'user')}: {m.get('content', '')[:500]}"
            for m in messages[-6:]
        )

        prompt = (
            "Aşağıdaki sohbetten kullanıcı hakkında BİLGİ VARSA "
            "JSON formatında çıkar. Yoksa boş JSON döndür. "
            "Format:\n"
            '{"name":"", "occupation":"", "location":"", '
            '"interests":[], "projects":[], "facts":[]}\n\n'
            f"Sohbet:\n{text}\n\n"
            "JSON (SADECE JSON, açıklama yok):"
        )

        try:
            response = engine.generate(prompt, max_tokens=300)
            # JSON bul
            import re
            m = re.search(r"\{.*\}", response, re.DOTALL)
            if not m:
                return
            data = json.loads(m.group(0))

            if data.get("name") and not self._profile.name:
                self._profile.name = data["name"]
            if data.get("occupation") and not self._profile.occupation:
                self._profile.occupation = data["occupation"]
            if data.get("location") and not self._profile.location:
                self._profile.location = data["location"]

            for interest in data.get("interests", []):
                if interest not in self._profile.interests:
                    self._profile.interests.append(interest)

            for project in data.get("projects", []):
                if isinstance(project, str):
                    self.add_project(project)
                elif isinstance(project, dict):
                    self.add_project(
                        project.get("name", ""),
                        project.get("description", ""),
                    )

            for fact in data.get("facts", []):
                self.add_fact(fact)

            if any([data.get("name"), data.get("occupation"),
                    data.get("location"), data.get("interests"),
                    data.get("projects"), data.get("facts")]):
                self._profile.updated_at = time.time()
                self._save()
                log.info("Profil güncellendi: %s", {
                    k: v for k, v in data.items() if v
                })

        except Exception as exc:
            log.debug("Profil çıkarımı başarısız: %s", exc)

    def extract_async(self, messages: list[dict]) -> None:
        """Arka planda profil çıkarımı."""
        threading.Thread(
            target=self.extract_from_messages,
            args=(messages,),
            daemon=True,
            name="profile-extractor",
        ).start()
