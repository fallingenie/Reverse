from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Iterable

from .errors import IntegrityError, PdfRejected
from .ledger import utc_now


RIGHTS_BASES = {"OWNED", "LICENSED", "EDUCATIONAL_USE_REVIEWED", "UNKNOWN"}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _meaningful_count(text: str) -> int:
    return sum(character.isalnum() for character in text)


def _normalize_text(text: str) -> str:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def _split_text(text: str, limit: int = 1800) -> list[str]:
    if len(text) <= limit:
        return [text] if text else []
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text) if part.strip()]
    chunks: list[str] = []
    current = ""
    for paragraph in paragraphs:
        pieces = [paragraph]
        if len(paragraph) > limit:
            pieces = [paragraph[index:index + limit] for index in range(0, len(paragraph), limit)]
        for piece in pieces:
            candidate = f"{current}\n\n{piece}".strip() if current else piece
            if len(candidate) <= limit:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = piece
    if current:
        chunks.append(current)
    return chunks


def _object_keys(value: Any) -> set[str]:
    try:
        resolved = value.get_object() if hasattr(value, "get_object") else value
    except Exception:
        return set()
    return set(resolved.keys()) if isinstance(resolved, dict) else set()


def _active_content(reader: Any) -> bool:
    try:
        root = reader.trailer["/Root"].get_object()
    except Exception:
        return True
    if {"/OpenAction", "/AA"} & set(root.keys()):
        return True
    names = root.get("/Names")
    if names is not None and "/JavaScript" in _object_keys(names):
        return True
    for page in reader.pages:
        if "/AA" in page:
            return True
        annotations = page.get("/Annots", [])
        for annotation in annotations:
            try:
                item = annotation.get_object()
                action = item.get("/A")
                if action is not None and action.get_object().get("/S") == "/JavaScript":
                    return True
            except Exception:
                return True
    return False


def _extract_with_pypdf(path: Path) -> tuple[list[tuple[int, str | None, str]], dict[str, Any]]:
    try:
        import pypdf
        from pypdf import PdfReader
    except ImportError as error:
        raise PdfRejected("pypdf가 설치되지 않아 PDF를 읽을 수 없습니다.") from error
    try:
        reader = PdfReader(str(path), strict=True)
    except Exception as error:
        raise PdfRejected(f"PDF 구조를 읽지 못했습니다: {error}") from error
    if reader.is_encrypted:
        raise PdfRejected("암호화된 PDF는 지원하지 않습니다. DRM 또는 암호를 우회하지 않았습니다.")
    active = _active_content(reader)
    labels: list[str | None]
    try:
        labels = list(reader.page_labels)
    except Exception:
        labels = [None] * len(reader.pages)
    pages: list[tuple[int, str | None, str]] = []
    warnings: list[str] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            extracted = page.extract_text(extraction_mode="layout") or ""
        except TypeError:
            extracted = page.extract_text() or ""
        except Exception as error:
            warnings.append(f"{index}쪽 텍스트 추출 실패: {error}")
            extracted = ""
        label = labels[index - 1] if index - 1 < len(labels) else None
        pages.append((index, label, _normalize_text(extracted)))
    return pages, {
        "engine": "pypdf",
        "engine_version": pypdf.__version__,
        "encrypted": False,
        "active_content_detected": active,
        "warnings": warnings,
    }


def _extract_with_pdfplumber(path: Path) -> tuple[list[tuple[int, str | None, str]], dict[str, Any]]:
    try:
        import pdfplumber
    except ImportError as error:
        raise PdfRejected("pdfplumber가 설치되지 않아 PDF를 읽을 수 없습니다.") from error
    pages: list[tuple[int, str | None, str]] = []
    warnings: list[str] = []
    try:
        with pdfplumber.open(path) as document:
            for index, page in enumerate(document.pages, start=1):
                try:
                    text = page.extract_text(layout=True) or ""
                except Exception as error:
                    warnings.append(f"{index}쪽 텍스트 추출 실패: {error}")
                    text = ""
                pages.append((index, None, _normalize_text(text)))
    except Exception as error:
        message = str(error).lower()
        if "password" in message or "encrypt" in message:
            raise PdfRejected("암호화된 PDF는 지원하지 않습니다. DRM 또는 암호를 우회하지 않았습니다.") from error
        raise PdfRejected(f"PDF 구조를 읽지 못했습니다: {error}") from error
    return pages, {
        "engine": "pdfplumber",
        "engine_version": pdfplumber.__version__,
        "encrypted": False,
        "active_content_detected": False,
        "warnings": warnings,
    }


def ingest_pdf(
    source: str | Path,
    output_root: str | Path,
    *,
    rights_basis: str = "UNKNOWN",
    engine: str = "pypdf",
) -> tuple[dict[str, Any], Path]:
    path = Path(source).resolve()
    if path.suffix.lower() != ".pdf" or not path.is_file():
        raise PdfRejected("존재하는 .pdf 파일만 추가할 수 있습니다.")
    if rights_basis not in RIGHTS_BASES:
        raise PdfRejected("rights_basis 값이 유효하지 않습니다.")
    raw = path.read_bytes()
    if not raw.startswith(b"%PDF-"):
        raise PdfRejected("PDF 시그니처가 없는 파일입니다.")
    document_sha = sha256_bytes(raw)
    document_id = f"PDF-{document_sha[:12].upper()}"
    extractor = {
        "pypdf": _extract_with_pypdf,
        "pdfplumber": _extract_with_pdfplumber,
    }.get(engine)
    if extractor is None:
        raise PdfRejected("engine은 pypdf 또는 pdfplumber만 지원합니다.")
    pages, extraction = extractor(path)
    chunks: list[dict[str, Any]] = []
    empty_pages = 0
    for physical_page, printed_label, text in pages:
        if _meaningful_count(text) < 10:
            empty_pages += 1
            continue
        for chunk_index, chunk_text in enumerate(_split_text(text), start=1):
            text_sha = sha256_bytes(chunk_text.encode("utf-8"))
            chunks.append({
                "chunk_id": f"CH-{document_sha[:12].upper()}-P{physical_page:04d}-{chunk_index:03d}",
                "document_sha256": document_sha,
                "physical_page": physical_page,
                "printed_page_label": printed_label,
                "text": chunk_text,
                "text_sha256": text_sha,
                "extraction_status": "LAYOUT_WARNING" if "�" in chunk_text else "EXTRACTED",
                "teacher_review": "PENDING",
            })
    if empty_pages:
        extraction["warnings"].append(f"텍스트가 없거나 너무 적은 페이지: {empty_pages}/{len(pages)}")
    if extraction["active_content_detected"]:
        extraction["warnings"].append("PDF의 JavaScript 또는 자동 실행 동작 가능성을 탐지했으며 실행하지 않았습니다.")
    status = "OCR_REQUIRED" if not chunks else "NEEDS_REVIEW"
    manifest = {
        "schema_version": "2.0.0",
        "document_id": document_id,
        "source_name": path.name,
        "sha256": document_sha,
        "byte_size": len(raw),
        "page_count": len(pages),
        "status": status,
        "rights_basis": rights_basis,
        "extraction": extraction,
        "chunks": chunks,
        "created_at": utc_now(),
    }
    destination = Path(output_root).resolve() / document_id
    destination.mkdir(parents=True, exist_ok=True)
    manifest_path = destination / "reference-manifest.json"
    pack_path = destination / "reference-pack.md"
    _atomic_write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _atomic_write(pack_path, render_reference_pack(manifest), encoding="utf-8-sig")
    return manifest, destination


def render_reference_pack(manifest: dict[str, Any]) -> str:
    lines = [
        f"# Reference Pack: {manifest['source_name']}",
        "",
        f"- document_id: `{manifest['document_id']}`",
        f"- document_sha256: `{manifest['sha256']}`",
        f"- status: `{manifest['status']}`",
        f"- rights_basis: `{manifest['rights_basis']}`",
        f"- extraction_engine: `{manifest['extraction']['engine']} {manifest['extraction']['engine_version']}`",
        "",
        "이 문서는 PDF에서 추출한 텍스트다. 교과서 수록 여부는 교육과정상 권위를 뜻할 수 있지만 각 주장의 학술적 사실성을 자동 확정하지 않는다.",
        "",
    ]
    if manifest["status"] == "OCR_REQUIRED":
        lines.extend(["## OCR_REQUIRED", "", "추출 가능한 텍스트가 없어 중단했다. 이 도구는 OCR을 지원하지 않는다.", ""])
    if manifest["extraction"]["warnings"]:
        lines.extend(["## 추출 경고", ""])
        lines.extend(f"- {warning}" for warning in manifest["extraction"]["warnings"])
        lines.append("")
    current_page: int | None = None
    for chunk in manifest["chunks"]:
        if chunk["physical_page"] != current_page:
            current_page = chunk["physical_page"]
            printed = f" / 인쇄면 {chunk['printed_page_label']}" if chunk["printed_page_label"] else ""
            lines.extend([f"## PDF {current_page}쪽{printed}", ""])
        lines.extend([
            f"<!-- {chunk['chunk_id']} sha256:{chunk['text_sha256']} -->",
            chunk["text"],
            "",
        ])
    return "\n".join(lines).rstrip() + "\n"


def review_reference(manifest_path: str | Path, *, accept: bool) -> dict[str, Any]:
    path = Path(manifest_path).resolve()
    try:
        manifest = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as error:
        raise IntegrityError(f"참조 manifest를 읽지 못했습니다: {error}") from error
    if manifest.get("status") == "OCR_REQUIRED":
        raise IntegrityError("OCR_REQUIRED 문서는 승인할 수 없습니다.")
    if accept and manifest.get("rights_basis") == "UNKNOWN":
        raise IntegrityError("권리 근거가 UNKNOWN인 문서는 ACTIVE로 승인할 수 없습니다.")
    manifest["status"] = "ACTIVE" if accept else "REJECTED"
    for chunk in manifest.get("chunks", []):
        chunk["teacher_review"] = "ACCEPTED" if accept else "REJECTED"
    _atomic_write(path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _atomic_write(path.with_name("reference-pack.md"), render_reference_pack(manifest), encoding="utf-8-sig")
    return manifest


def _atomic_write(path: Path, content: str, *, encoding: str) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    with temporary.open("w", encoding=encoding, newline="\n") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
