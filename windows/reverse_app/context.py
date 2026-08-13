from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .canon import CanonStore
from .errors import ContextBlocked, IntegrityError
from .ledger import Ledger, canonical_json, sha256_text, utc_now
from .profiles import RuntimeProfile


def _causal_closure(active: dict[str, dict[str, Any]], required_ids: list[str]) -> tuple[list[str], list[str]]:
    pending = list(dict.fromkeys(required_ids))
    included: list[str] = []
    missing: list[str] = []
    while pending:
        fact_id = pending.pop(0)
        if fact_id in included or fact_id in missing:
            continue
        fact = active.get(fact_id)
        if fact is None:
            missing.append(fact_id)
            continue
        included.append(fact_id)
        pending.extend(fact.get("caused_by", []))
    return included, missing


def build_context(
    ledger: Ledger,
    profile: RuntimeProfile,
    required_ids: list[str],
) -> dict[str, Any]:
    if not profile.permits("read_canon"):
        raise IntegrityError(f"{profile.id} 프로파일은 Canon 읽기를 허용하지 않습니다.")
    state = CanonStore(ledger, profile).state()
    required_lock_ids = [item for item in required_ids if item.startswith("UNK-")]
    required_fact_ids = [item for item in required_ids if not item.startswith("UNK-")]
    included_ids, missing_ids = _causal_closure(state["active"], required_fact_ids)
    blockers: list[dict[str, Any]] = []
    for fact_id in missing_ids:
        historical = state["all"].get(fact_id)
        blockers.append({
            "fact_id": fact_id,
            "state": "SUPERSEDED" if historical else "NOT_LOADED",
            "reason": "필수 사실 또는 인과 앵커가 현재 ACTIVE Canon에 없습니다.",
        })
    for lock_id in required_lock_ids:
        lock = state["unknown_locks"].get(lock_id)
        if lock is None:
            blockers.append({
                "lock_id": lock_id,
                "state": "NOT_LOADED",
                "reason": "요청한 UNKNOWN lock이 원장에 없습니다.",
            })
            continue
        blockers.append({
            "lock_id": lock["lock_id"],
            "state": "UNKNOWN_LOCKED",
            "subject": lock["subject"],
            "predicate": lock["predicate"],
            "reason": lock["reason"],
            "required_input": lock["required_input"],
        })
    facts = [state["active"][fact_id] for fact_id in included_ids]
    manifest = {
        "schema_version": "2.0.0",
        "status": "BLOCKED" if blockers else "READY",
        "generated_at": utc_now(),
        "source_ledger": str(ledger.path),
        "source_ledger_sha256": sha256_text(ledger.path.read_text(encoding="utf-8")) if ledger.path.exists() else None,
        "target_profile": profile.id,
        "assurance": profile.assurance,
        "required_fact_ids": required_fact_ids,
        "required_unknown_lock_ids": required_lock_ids,
        "included_fact_ids": included_ids,
        "facts": [
            {"fact": fact, "content_sha256": sha256_text(canonical_json(fact))}
            for fact in facts
        ],
        "blockers": blockers,
        "canon_write": "HOST_ONLY" if profile.id == "WINDOWS_STANDALONE" else "T2_T3_CANDIDATE_ONLY",
    }
    return manifest


def render_context_markdown(manifest: dict[str, Any]) -> str:
    lines = [
        "# Reverse Context Pack",
        "",
        f"- status: `{manifest['status']}`",
        f"- target_profile: `{manifest['target_profile']}`",
        f"- assurance: `{manifest['assurance']}`",
        f"- canon_write: `{manifest['canon_write']}`",
        f"- source_ledger_sha256: `{manifest['source_ledger_sha256']}`",
        "",
        "이 문서는 원장의 읽기 전용 투영이다. 누락된 사실을 창작 허가로 해석하지 않는다.",
        "",
    ]
    if manifest["blockers"]:
        lines.extend(["## BLOCKERS", ""])
        for blocker in manifest["blockers"]:
            lines.append(f"- `{blocker.get('fact_id', blocker.get('lock_id'))}` / `{blocker['state']}`: {blocker['reason']}")
        lines.extend(["", "BLOCKED 상태에서는 수업 서사를 이어가지 않는다.", ""])
    lines.extend(["## Canon facts", ""])
    for record in manifest["facts"]:
        fact = record["fact"]
        lines.extend([
            f"### {fact['fact_id']}",
            "",
            f"- domain/status/durability: `{fact['truth_domain']}` / `{fact['epistemic_status']}` / `{fact['durability']}`",
            f"- triple: `{fact['subject']}` / `{fact['predicate']}` / `{json.dumps(fact['value'], ensure_ascii=False)}`",
            f"- authority/write_policy: `{fact['authority']}` / `{fact['write_policy']}`",
            f"- caused_by: `{', '.join(fact['caused_by']) or 'NONE'}`",
            f"- prohibited_inferences: `{'; '.join(fact['prohibited_inferences']) or 'NONE'}`",
            f"- content_sha256: `{record['content_sha256']}`",
            "",
        ])
    return "\n".join(lines).rstrip() + "\n"


def write_context_pack(
    output_directory: str | Path,
    manifest: dict[str, Any],
    *,
    allow_blocked: bool = False,
) -> tuple[Path, Path]:
    if manifest["status"] == "BLOCKED" and not allow_blocked:
        raise ContextBlocked("필수 사실 또는 UNKNOWN lock 때문에 Context Pack 생성이 차단되었습니다.")
    output = Path(output_directory).resolve()
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / "CONTEXT_MANIFEST.json"
    markdown_path = output / "CONTEXT_PACK.md"
    _atomic_write(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    _atomic_write(markdown_path, render_context_markdown(manifest), encoding="utf-8-sig")
    return manifest_path, markdown_path


def _atomic_write(path: Path, content: str, *, encoding: str) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    with temporary.open("w", encoding=encoding, newline="\n") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
