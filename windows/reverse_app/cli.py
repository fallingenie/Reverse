from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import platform
import sys
from pathlib import Path
from typing import Any

from . import __version__
from .canon import CanonStore
from .context import build_context, write_context_pack
from .errors import ReverseError
from .ledger import Ledger, sha256_text
from .pdf_refs import ingest_pdf, review_reference
from .profiles import PROFILE_IDS, load_bundled_profile, load_named_profile
from .migration import migrate_v1_session


def default_state_directory() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    if base:
        return Path(base) / "Reverse" / "state"
    return Path.home() / "AppData" / "Local" / "Reverse" / "state"


def _state_paths(state_directory: str | Path) -> tuple[Path, Ledger]:
    state = Path(state_directory).resolve()
    return state, Ledger(state / "ledger.ndjson")


def _read_json(path: str | Path) -> dict[str, Any]:
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as error:
        raise ReverseError(f"JSON 파일을 읽지 못했습니다: {error}") from error
    if not isinstance(value, dict):
        raise ReverseError("JSON 루트는 object여야 합니다.")
    return value


def _package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        try:
            module = __import__(name)
        except ImportError:
            return None
        version = getattr(module, "__version__", None)
        return str(version) if version is not None else None


def doctor(state_directory: str | Path) -> dict[str, Any]:
    profile = load_bundled_profile()
    state, ledger = _state_paths(state_directory)
    ledger_status = "NOT_INITIALIZED"
    event_count = 0
    try:
        events = ledger.read_events()
        event_count = len(events)
        ledger_status = "VALID" if events else "NOT_INITIALIZED"
    except ReverseError as error:
        ledger_status = f"INVALID: {error}"
    return {
        "ok": ledger_status in {"VALID", "NOT_INITIALIZED"},
        "app_version": __version__,
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "profile_id": profile.id,
        "assurance": profile.assurance,
        "state_directory": str(state),
        "ledger_status": ledger_status,
        "event_count": event_count,
        "dependencies": {
            "pypdf": _package_version("pypdf"),
            "pdfplumber": _package_version("pdfplumber"),
        },
        "hard_boundaries": [
            "LLM 생성 기능은 내장하지 않음",
            "텍스트 기반 PDF만 지원",
            "OCR과 DRM 우회는 지원하지 않음",
            "PDF 주장을 자동 VERIFIED 처리하지 않음",
        ],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reverse Windows 무결성 호스트")
    parser.add_argument("--state-dir", default=str(default_state_directory()))
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("doctor")
    subcommands.add_parser("init")
    subcommands.add_parser("verify-ledger")

    migrate = subcommands.add_parser("migrate-v1")
    migrate.add_argument("--session", required=True)

    propose = subcommands.add_parser("propose-fact")
    propose.add_argument("--fact", required=True)
    propose.add_argument("--actor", choices=["MODEL", "TEACHER", "STUDENT"], default="MODEL")

    commit = subcommands.add_parser("commit-fact")
    commit.add_argument("--fact", required=True)
    commit.add_argument("--approval-ref")

    unknown = subcommands.add_parser("lock-unknown")
    unknown.add_argument("--id", required=True)
    unknown.add_argument("--subject", required=True)
    unknown.add_argument("--predicate", required=True)
    unknown.add_argument("--reason", required=True)
    unknown.add_argument("--required-input", required=True)

    context = subcommands.add_parser("build-context")
    context.add_argument("--target", choices=sorted(PROFILE_IDS), required=True)
    context.add_argument("--required", nargs="+", required=True)
    context.add_argument("--output", required=True)
    context.add_argument("--allow-blocked", action="store_true")

    pdf = subcommands.add_parser("add-pdf")
    pdf.add_argument("--pdf", required=True)
    pdf.add_argument("--rights-basis", choices=["OWNED", "LICENSED", "EDUCATIONAL_USE_REVIEWED", "UNKNOWN"], default="UNKNOWN")
    pdf.add_argument("--engine", choices=["pypdf", "pdfplumber"], default="pypdf")

    review = subcommands.add_parser("review-pdf")
    review.add_argument("--manifest", required=True)
    decision = review.add_mutually_exclusive_group(required=True)
    decision.add_argument("--accept", action="store_true")
    decision.add_argument("--reject", action="store_true")
    return parser


def run_command(arguments: argparse.Namespace) -> dict[str, Any]:
    profile = load_bundled_profile()
    state, ledger = _state_paths(arguments.state_dir)
    command = arguments.command
    if command == "doctor":
        return doctor(state)
    if command == "init":
        event = ledger.initialize(profile)
        return {"ok": True, "ledger": str(ledger.path), "genesis_event": event["event_id"]}
    if command == "verify-ledger":
        events = ledger.read_events()
        return {"ok": True, "ledger": str(ledger.path), "events": len(events), "head": events[-1]["event_hash"] if events else None}
    if command == "migrate-v1":
        return migrate_v1_session(arguments.session, ledger, profile)

    ledger.initialize(profile)
    canon = CanonStore(ledger, profile)
    if command == "propose-fact":
        event = canon.propose(_read_json(arguments.fact), actor=arguments.actor)
        return {"ok": True, "status": "PROPOSED_NOT_COMMITTED", "event_id": event["event_id"]}
    if command == "commit-fact":
        event = canon.commit(_read_json(arguments.fact), approval_ref=arguments.approval_ref)
        return {"ok": True, "status": "COMMITTED", "event_id": event["event_id"]}
    if command == "lock-unknown":
        event = canon.lock_unknown(
            lock_id=arguments.id,
            subject=arguments.subject,
            predicate=arguments.predicate,
            reason=arguments.reason,
            required_input=arguments.required_input,
        )
        return {"ok": True, "status": "UNKNOWN_LOCKED", "event_id": event["event_id"]}
    if command == "build-context":
        target_profile = load_named_profile(arguments.target)
        manifest = build_context(ledger, target_profile, arguments.required)
        manifest_path, pack_path = write_context_pack(arguments.output, manifest, allow_blocked=arguments.allow_blocked)
        ledger.append(
            "CONTEXT_EXPORTED",
            "HOST",
            {
                "target_profile": target_profile.id,
                "status": manifest["status"],
                "manifest_sha256": sha256_text(manifest_path.read_text(encoding="utf-8")),
                "included_fact_ids": manifest["included_fact_ids"],
            },
            profile,
        )
        return {"ok": True, "status": manifest["status"], "manifest": str(manifest_path), "pack": str(pack_path)}
    if command == "add-pdf":
        manifest, destination = ingest_pdf(
            arguments.pdf,
            state / "references",
            rights_basis=arguments.rights_basis,
            engine=arguments.engine,
        )
        ledger.append(
            "PDF_REFERENCE_ADDED",
            "TEACHER",
            {
                "document_id": manifest["document_id"],
                "document_sha256": manifest["sha256"],
                "status": manifest["status"],
                "rights_basis": manifest["rights_basis"],
                "chunk_count": len(manifest["chunks"]),
            },
            profile,
        )
        return {"ok": True, "status": manifest["status"], "output": str(destination), "chunks": len(manifest["chunks"])}
    if command == "review-pdf":
        manifest = review_reference(arguments.manifest, accept=arguments.accept)
        return {"ok": True, "status": manifest["status"], "document_id": manifest["document_id"]}
    raise ReverseError(f"지원하지 않는 명령입니다: {command}")


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    parser = build_parser()
    arguments = parser.parse_args(argv)
    try:
        result = run_command(arguments)
    except ReverseError as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
