from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .canon import CanonStore, make_fact
from .errors import IntegrityError
from .ledger import Ledger, canonical_json, sha256_text
from .profiles import RuntimeProfile


def _safe_id(prefix: str, original: str, index: int) -> str:
    normalized = re.sub(r"[^A-Z0-9-]+", "-", original.upper()).strip("-")
    return f"FACT-{prefix}-{normalized or index:0>4}"[:85].rstrip("-")


def migrate_v1_session(
    session_path: str | Path,
    ledger: Ledger,
    profile: RuntimeProfile,
) -> dict[str, Any]:
    if ledger.read_events():
        raise IntegrityError("v1 마이그레이션은 비어 있는 새 원장에서만 실행할 수 있습니다.")
    path = Path(session_path).resolve()
    source_text = path.read_text(encoding="utf-8-sig")
    try:
        session = json.loads(source_text)
    except json.JSONDecodeError as error:
        raise IntegrityError(f"v1 세션 JSON을 읽지 못했습니다: {error}") from error
    if session.get("schema_version") != "1.0.0":
        raise IntegrityError("schema_version 1.0.0 세션만 마이그레이션할 수 있습니다.")
    ledger.initialize(profile)
    store = CanonStore(ledger, profile)
    imported: list[str] = []
    unknown_locks: list[str] = []

    evidence_by_id = {item["id"]: item for item in session.get("evidence", [])}
    for index, evidence in enumerate(session.get("evidence", []), start=1):
        evidence_id = str(evidence.get("id", index))
        if evidence.get("status") == "UNKNOWN":
            lock_id = f"UNK-MIGRATED-{re.sub(r'[^A-Z0-9-]+', '-', evidence_id.upper())}"
            store.lock_unknown(
                lock_id=lock_id,
                subject="legacy-evidence",
                predicate=evidence.get("claim", evidence.get("text", evidence_id)),
                reason="v1 세션에서 UNKNOWN으로 보존된 항목",
                required_input="원문 출처 또는 교사 확인",
                actor="MIGRATION",
            )
            unknown_locks.append(lock_id)
            continue
        status = evidence.get("status")
        truth_domain = "REAL_WORLD" if status == "VERIFIED" else "SCENARIO_CANON"
        authority = "EXTERNAL_SOURCE" if status == "VERIFIED" else (
            "SYSTEM_DERIVED" if status == "DERIVED" else "STORY_EVENT"
        )
        source_ids = evidence.get("source_ids", [])
        provenance = [
            {"kind": "SOURCE", "ref": source_id, "content_sha256": None}
            for source_id in source_ids
        ] or [{
            "kind": "TURN",
            "ref": f"legacy-evidence:{evidence_id}",
            "content_sha256": sha256_text(canonical_json(evidence)),
        }]
        fact = make_fact(
            fact_id=_safe_id("MIGRATED-EVIDENCE", evidence_id, index),
            truth_domain=truth_domain,
            subject="legacy-evidence",
            predicate="claim",
            value=evidence.get("claim", evidence.get("text", evidence_id)),
            epistemic_status=status,
            durability="T0" if status == "VERIFIED" else "T1",
            authority=authority,
            write_policy="HOST_ONLY",
            provenance=provenance,
            caused_by=[_safe_id("MIGRATED-EVIDENCE", parent, index) for parent in evidence.get("derived_from", [])],
        )
        store.commit(fact, actor="MIGRATION")
        imported.append(fact["fact_id"])

    memory = session.get("memory", {})
    for group_name, prefix in (("canon", "MIGRATED-CANON"), ("negative_facts", "MIGRATED-NEGATIVE")):
        for index, item in enumerate(memory.get(group_name, []), start=1):
            original_id = str(item.get("id", index))
            fact = make_fact(
                fact_id=_safe_id(prefix, original_id, index),
                truth_domain="SCENARIO_CANON",
                subject=f"legacy-{group_name}",
                predicate="text",
                value=item.get("text", original_id),
                epistemic_status="SCENARIO",
                durability="T1",
                authority="STORY_EVENT",
                write_policy="HOST_ONLY",
                provenance=[{
                    "kind": "TURN",
                    "ref": f"legacy-memory:{original_id}",
                    "content_sha256": sha256_text(canonical_json(item)),
                }],
            )
            store.commit(fact, actor="MIGRATION")
            imported.append(fact["fact_id"])

    for correction in memory.get("corrections", []):
        ledger.append(
            "CORRECTION_RECORDED",
            "MIGRATION",
            {
                "legacy_record": correction,
                "legacy_content_sha256": sha256_text(canonical_json(correction)),
                "status": "IMPORTED_NOT_REAPPLIED",
            },
            profile,
        )

    ledger.append(
        "CORRECTION_RECORDED",
        "MIGRATION",
        {
            "migration": "v1-session-to-v2-ledger",
            "source_name": path.name,
            "source_sha256": sha256_text(source_text),
            "legacy_session_id": session.get("session_id"),
            "imported_fact_ids": imported,
            "unknown_lock_ids": unknown_locks,
            "notice": "v1 memory text is preserved as scenario/story authority; it was not silently upgraded to real-world VERIFIED.",
        },
        profile,
    )
    return {
        "ok": True,
        "source_sha256": sha256_text(source_text),
        "imported_fact_ids": imported,
        "unknown_lock_ids": unknown_locks,
        "event_count": len(ledger.read_events()),
    }
