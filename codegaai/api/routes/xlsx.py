"""XLSX skill API routes."""

from __future__ import annotations

import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from codegaai.core.xlsx_skill import (
    XlsxDependencyError,
    XlsxSkillError,
    apply_workbook_operations,
    inspect_workbook,
    resolve_allowed_xlsx_path,
    save_uploaded_workbook,
)
from codegaai.utils.logger import get_logger

log = get_logger(__name__)
router = APIRouter()

_workbook_store: dict[str, dict[str, Any]] = {}


def _cleanup_store(max_items: int = 30) -> None:
    if len(_workbook_store) <= max_items:
        return
    for key in sorted(_workbook_store, key=lambda k: _workbook_store[k].get("ts", 0))[: len(_workbook_store) - max_items]:
        _workbook_store.pop(key, None)


def _user_error(exc: Exception) -> HTTPException:
    if isinstance(exc, XlsxDependencyError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, XlsxSkillError):
        return HTTPException(status_code=400, detail=str(exc))
    log.exception("XLSX skill failed: %s", exc)
    return HTTPException(status_code=500, detail="XLSX operation failed.")


def _path_from_ref(workbook_id: str | None, path: str | None) -> Path:
    if workbook_id:
        item = _workbook_store.get(workbook_id)
        if not item:
            raise XlsxSkillError("Workbook id was not found.")
        return resolve_allowed_xlsx_path(item["path"])
    if path:
        return resolve_allowed_xlsx_path(path)
    raise XlsxSkillError("workbook_id or path is required.")


class XlsxInspectRequest(BaseModel):
    workbook_id: str | None = None
    path: str | None = None
    preview_rows: int = Field(default=20, ge=1, le=100)


class XlsxEditRequest(BaseModel):
    workbook_id: str | None = None
    path: str | None = None
    output_name: str | None = None
    operations: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/upload")
async def upload_xlsx(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = file.filename or "workbook.xlsx"
    try:
        content = await file.read()
        workbook_path = save_uploaded_workbook(filename, content)
        workbook_id = uuid.uuid4().hex[:10]
        _workbook_store[workbook_id] = {
            "filename": filename,
            "path": str(workbook_path),
            "ts": time.time(),
        }
        _cleanup_store()
        summary = inspect_workbook(workbook_path, preview_rows=20)
        log.info("XLSX upload: %s (%d bytes)", filename, len(content))
        return {"ok": True, "workbook_id": workbook_id, "summary": summary}
    except Exception as exc:
        raise _user_error(exc) from exc


@router.post("/inspect")
async def inspect_xlsx(req: XlsxInspectRequest) -> dict[str, Any]:
    try:
        workbook_path = _path_from_ref(req.workbook_id, req.path)
        return {"ok": True, "summary": inspect_workbook(workbook_path, req.preview_rows)}
    except Exception as exc:
        raise _user_error(exc) from exc


@router.post("/edit")
async def edit_xlsx(req: XlsxEditRequest) -> dict[str, Any]:
    try:
        workbook_path = _path_from_ref(req.workbook_id, req.path)
        result = apply_workbook_operations(workbook_path, req.operations, req.output_name)
        log.info("XLSX edit: %s operations=%d", workbook_path.name, len(req.operations))
        return result
    except Exception as exc:
        raise _user_error(exc) from exc


@router.get("/capabilities")
async def xlsx_capabilities() -> dict[str, Any]:
    return {
        "ok": True,
        "skill": "xlsx",
        "operations": [
            "create_sheet",
            "update_cell",
            "insert_row",
            "delete_row",
            "insert_column",
            "delete_column",
            "format_range",
            "add_chart",
        ],
        "chart_types": ["line", "bar", "pie", "scatter"],
        "path_policy": "Only DATA_DIR/temp/xlsx and DATA_DIR/outputs/xlsx are allowed.",
    }

