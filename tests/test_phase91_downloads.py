"""
Faz 9.1 testleri — İndirme dayanıklılığı (416, URL değişimi, tam dosya).

416 senaryolarını gerçek HTTP olmadan mock ile doğrular.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import sys
import tempfile
import threading
import time
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, patch

from codegaai.core.models_registry import (
    LLMModelSpec, LLM_MODELS, ModelRegistry,
)


@contextmanager
def mock_httpx():
    """httpx lazy import edildiği için sys.modules üzerinden mock'la."""
    mock_mod = MagicMock()
    mock_client = MagicMock()
    # `with httpx.Client(...) as c:` desende c = mock_client
    mock_mod.Client.return_value = mock_client
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    original = sys.modules.get("httpx")
    sys.modules["httpx"] = mock_mod
    try:
        yield mock_client
    finally:
        if original is not None:
            sys.modules["httpx"] = original
        else:
            sys.modules.pop("httpx", None)


class TestDownloadResume(unittest.TestCase):
    """416 (Range Not Satisfiable) ve URL değişimi senaryoları."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmpdir = Path(tempfile.mkdtemp())
        ModelRegistry._instance = None
        # Test registry'sini geçici dizine bağla
        cls.reg = ModelRegistry()
        cls.reg.llm_dir = cls.tmpdir / "llm"
        cls.reg.embedding_dir = cls.tmpdir / "embedding"
        cls.reg.image_dir = cls.tmpdir / "image"
        cls.reg.audio_dir = cls.tmpdir / "audio"
        cls.reg.video_dir = cls.tmpdir / "video"
        for d in (cls.reg.llm_dir, cls.reg.embedding_dir,
                  cls.reg.image_dir, cls.reg.audio_dir, cls.reg.video_dir):
            d.mkdir(parents=True, exist_ok=True)
        ModelRegistry._instance = cls.reg

    @classmethod
    def tearDownClass(cls) -> None:
        ModelRegistry._instance = None
        shutil.rmtree(cls.tmpdir, ignore_errors=True)

    def _make_partial(self, model_id: str, size_bytes: int,
                      url: str = None) -> tuple[Path, Path, Path]:
        """Yapay partial + .url marker dosyası oluştur."""
        target = self.reg.llm_path(model_id)
        partial = target.with_suffix(target.suffix + ".part")
        url_marker = partial.with_suffix(".part.url")

        partial.parent.mkdir(parents=True, exist_ok=True)
        with partial.open("wb") as f:
            f.write(b"\x00" * size_bytes)

        if url:
            url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()
            url_marker.write_text(url_hash, encoding="utf-8")

        return target, partial, url_marker

    def test_finalize_download_renames_partial(self) -> None:
        """Tam partial → atomik rename → completed."""
        spec = LLM_MODELS[0]  # qwen2.5-7b-instruct-q4_k_m, 4.68 GB
        # Boyut testi için spec'in size_gb'ını mocklayamayacağımız için
        # gerçek bir partial yapma — sadece logic akışını test
        target = self.reg.llm_path(spec.id)
        partial = target.with_suffix(target.suffix + ".part")
        url_marker = partial.with_suffix(".part.url")

        partial.parent.mkdir(parents=True, exist_ok=True)
        # Tam beklenen boyut
        full_size = int(spec.size_gb * (1024 ** 3))
        with partial.open("wb") as f:
            f.write(b"\x00" * 1024)
            f.seek(full_size - 1)
            f.write(b"\x00")  # sparse file, hızlı

        url_marker.write_text("dummy_hash", encoding="utf-8")

        # Finalize çağır
        self.reg._finalize_download(spec, partial, target, url_marker)

        # Beklenen:
        self.assertFalse(partial.exists(), ".part silinmiş olmalı")
        self.assertFalse(url_marker.exists(), "url_marker silinmiş olmalı")
        self.assertTrue(target.exists(), ".gguf hedef dosya olmalı")
        self.assertEqual(target.stat().st_size, full_size)

        # Cleanup
        target.unlink()

    def test_finalize_rejects_too_small(self) -> None:
        """Eksik partial → hata."""
        spec = LLM_MODELS[0]
        target = self.reg.llm_path(spec.id)
        partial = target.with_suffix(target.suffix + ".part")
        url_marker = partial.with_suffix(".part.url")

        partial.parent.mkdir(parents=True, exist_ok=True)
        # Çok küçük (10 MB), oysa beklenen 4.68 GB
        partial.write_bytes(b"\x00" * (10 * 1024 * 1024))

        with self.assertRaises(RuntimeError) as ctx:
            self.reg._finalize_download(spec, partial, target, url_marker)
        self.assertIn("küçük", str(ctx.exception).lower())

        # Cleanup
        if partial.exists():
            partial.unlink()

    def test_url_marker_change_triggers_partial_delete(self) -> None:
        """
        URL hash değişikse partial silinmeli.
        Bunu doğrulamak için download_llm_async'i çağırırken
        httpx'i mock'la, URL marker farklı.
        """
        spec = LLM_MODELS[0]
        target = self.reg.llm_path(spec.id)
        partial = target.with_suffix(target.suffix + ".part")
        url_marker = partial.with_suffix(".part.url")

        partial.parent.mkdir(parents=True, exist_ok=True)
        partial.write_bytes(b"\x00" * 1024)  # 1 KB partial
        url_marker.write_text("ESKI_URL_HASH", encoding="utf-8")

        # download_llm_async çağrılırken httpx mock — HEAD failure (network
        # yok). Sadece URL değişimi tespit kısmını test edeceğiz.
        cancel = threading.Event()
        cancel.set()  # hemen iptal et, gerçek indirmeyi başlatma

        with mock_httpx() as mock_client:
            # HEAD'i 200 ile döndür (server boyutu küçük)
            head_resp = MagicMock()
            head_resp.status_code = 200
            head_resp.headers = {"content-length": "999999",
                                  "accept-ranges": "bytes"}
            mock_client.head.return_value = head_resp

            # GET stream — hemen iptal olduğu için içeri girmeyecek
            stream_ctx = MagicMock()
            stream_resp = MagicMock()
            stream_resp.status_code = 206
            stream_resp.headers = {"content-length": "0"}
            stream_resp.iter_bytes.return_value = iter([])
            stream_ctx.__enter__.return_value = stream_resp
            mock_client.stream.return_value = stream_ctx

            try:
                self.reg._download_llm_worker(spec, cancel)
            except Exception:
                pass

        # Yeni hash yazılmış olmalı (eski "ESKI_URL_HASH" silindi/değişti)
        self.assertTrue(url_marker.exists())
        new_hash = url_marker.read_text(encoding="utf-8").strip()
        self.assertNotEqual(new_hash, "ESKI_URL_HASH")
        self.assertEqual(len(new_hash), 64)  # SHA256 hex

        # Cleanup
        for p in (partial, url_marker, target):
            if p.exists():
                p.unlink()

    def test_416_treated_as_complete(self) -> None:
        """
        416 yanıtı → finalize çağrılmalı, exception yok.
        Partial tam boyut (sparse) ile hazırlanır.
        """
        spec = LLM_MODELS[0]
        target = self.reg.llm_path(spec.id)
        partial = target.with_suffix(target.suffix + ".part")
        url_marker = partial.with_suffix(".part.url")
        url = (f"https://huggingface.co/{spec.hf_repo}/resolve/main/"
               f"{spec.hf_file}")
        correct_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()

        partial.parent.mkdir(parents=True, exist_ok=True)
        full_size = int(spec.size_gb * (1024 ** 3))
        with partial.open("wb") as f:
            f.seek(full_size - 1)
            f.write(b"\x00")
        url_marker.write_text(correct_hash, encoding="utf-8")

        cancel = threading.Event()

        with mock_httpx() as mock_client:

            # HEAD: server boyutu = partial boyutu
            head_resp = MagicMock()
            head_resp.status_code = 200
            head_resp.headers = {
                "content-length": str(full_size),
                "accept-ranges": "bytes",
            }
            mock_client.head.return_value = head_resp

            # GET'e hiç gelmemeli (HEAD'de erken çıkar)
            mock_client.stream.side_effect = AssertionError(
                "GET çağrılmamalıydı — HEAD eşleşmesinde erken çıkmalı"
            )

            self.reg._download_llm_worker(spec, cancel)

        # Sonuç: partial → target rename oldu mu?
        self.assertFalse(partial.exists(), "Partial silinmiş olmalı")
        self.assertTrue(target.exists(), "Hedef dosya olmalı")
        self.assertFalse(url_marker.exists(), "URL marker silinmiş olmalı")
        self.assertEqual(target.stat().st_size, full_size)

        progress = self.reg.get_progress(spec.id)
        self.assertEqual(progress.status, "completed")

        # Cleanup
        target.unlink()

    def test_416_via_get_response(self) -> None:
        """HEAD başarısız ama GET 416 dönerse de tam dosya kabul et."""
        spec = LLM_MODELS[0]
        target = self.reg.llm_path(spec.id)
        partial = target.with_suffix(target.suffix + ".part")
        url_marker = partial.with_suffix(".part.url")
        url = (f"https://huggingface.co/{spec.hf_repo}/resolve/main/"
               f"{spec.hf_file}")
        correct_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()

        partial.parent.mkdir(parents=True, exist_ok=True)
        full_size = int(spec.size_gb * (1024 ** 3))
        with partial.open("wb") as f:
            f.seek(full_size - 1)
            f.write(b"\x00")
        url_marker.write_text(correct_hash, encoding="utf-8")

        cancel = threading.Event()

        with mock_httpx() as mock_client:

            # HEAD: hata at, GET'e geçsin
            mock_client.head.side_effect = Exception("HEAD blocked")

            # GET: 416 döndür
            stream_resp = MagicMock()
            stream_resp.status_code = 416
            stream_resp.headers = {}
            stream_ctx = MagicMock()
            stream_ctx.__enter__ = MagicMock(return_value=stream_resp)
            stream_ctx.__exit__ = MagicMock(return_value=False)
            mock_client.stream.return_value = stream_ctx

            self.reg._download_llm_worker(spec, cancel)

        # 416 başarılı yorumlandı mı?
        self.assertTrue(target.exists())
        self.assertFalse(partial.exists())

        progress = self.reg.get_progress(spec.id)
        self.assertEqual(progress.status, "completed")

        target.unlink()


if __name__ == "__main__":
    unittest.main()
