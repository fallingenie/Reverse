from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

from .errors import IntegrityError, PermissionDenied
from .ledger import Ledger, canonical_json, sha256_text, utc_now
from .profiles import RuntimeProfile


DURABILITIES = {"T0", "T1", "T2", "T3", "T4"}
TRUTH_DOMAINS = {"REAL_WORLD", "SCENARIO_CANON", "SESSION_EVENT", "PEDAGOGICAL_POLICY"}
EPISTEMIC_STATES = {"VERIFIED", "DERIVED", "SCENARIO", "UNKNOWN"}
AUTHORITIES = {"EXTERNAL_SOURCE", "USER_CONFIRMED", "TEACHER_CONFIRMED", "SYSTEM_DERIVED", "STORY_EVENT"}
WRITE_POLICIES = {"HOST_ONLY", "USER_APPROVAL", "RUNTIME_ALLOWED", "EPHEMERAL_ONLY"}
FACT_ID = re.compile(r"^FACT-[A-Z0-9-]{4,80}$")


def validate_fact(fact: dict[str, Any]) -> dict[str, Any]:
    required = {
        "schema_version", "fact_id", "truth_domain", "subject", "predicate", "value",
        "epistemic_status", "durability", "authority", "write_policy", "provenance",
        "caused_by", "causes", "prohibited_inferences", "lifecycle", "created_at",
    }
    optional = {"supersedes", "superseded_by"}
    if set(fact) - (required | optional) or not required.issubset(fact):
        raise IntegrityError("Canon 사실 필드가 v2 계약과 일치하지 않습니다.")
    if fact["schema_version"] != "2.0.0" or not FACT_ID.fullmatch(str(fact["fact_id"])):
        raise IntegrityError("Canon 사실 버전 또는 ID가 유효하지 않습니다.")
    if fact["truth_domain"] not in TRUTH_DOMAINS:
        raise IntegrityError("알 수 없는 truth_domain입니다.")
    if fact["epistemic_status"] not in EPISTEMIC_STATES:
        raise IntegrityError("알 수 없는 epistemic_status입니다.")
    if fact["durability"] not in DURABILITIES or fact["authority"] not in AUTHORITIES:
        raise IntegrityError("Canon 내구성 또는 권한이 유효하지 않습니다.")
    if fact["write_policy"] not in WRITE_POLICIES:
        raise IntegrityError("Canon write_policy가 유효하지 않습니다.")
    if fact["lifecycle"] not in {"ACTIVE", "SUPERSEDED", "CONFLICTED", "RETRACTED"}:
        raise IntegrityError("Canon lifecycle이 유효하지 않습니다.")
    for key in ("subject", "predicate", "created_at"):
        if not isinstance(fact[key], str) or not fact[key].strip():
            raise IntegrityError(f"Canon {key} 값이 비어 있습니다.")
    for key in ("provenance", "caused_by", "causes", "prohibited_inferences"):
        if not isinstance(fact[key], list):
            raise IntegrityError(f"Canon {key}는 배열이어야 합니다.")
    for item in fact["provenance"]:
        if not isinstance(item, dict) or not item.get("kind") or not item.get("ref"):
            raise IntegrityError("Canon provenance 항목이 불완전합니다.")
    if fact["truth_domain"] == "REAL_WORLD" and fact["epistemic_status"] == "VERIFIED":
        if fact["authority"] != "EXTERNAL_SOURCE":
            raise IntegrityError("현실 세계 VERIFIED 사실은 EXTERNAL_SOURCE 권한이 필요합니다.")
        if not any(item.get("kind") in {"SOURCE", "PDF_CHUNK"} for item in fact["provenance"]):
            raise IntegrityError("현실 세계 VERIFIED 사실에는 출처 provenance가 필요합니다.")
    if fact["truth_domain"] == "REAL_WORLD" and fact["epistemic_status"] == "SCENARIO":
        raise IntegrityError("현실 세계 사실을 SCENARIO 상태로 확정할 수 없습니다.")
    if fact["lifecycle"] == "SUPERSEDED" and not fact.get("superseded_by"):
        raise IntegrityError("SUPERSEDED Canon 레코드에는 새 사실 연결을 명시해야 합니다.")
    return fact


def make_fact(
    *,
    fact_id: str,
    truth_domain: str,
    subject: str,
    predicate: str,
    value: Any,
    epistemic_status: str,
    durability: str,
    authority: str,
    write_policy: str,
    provenance: list[dict[str, Any]],
    caused_by: list[str] | None = None,
    causes: list[str] | None = None,
    prohibited_inferences: list[str] | None = None,
    supersedes: str | None = None,
) -> dict[str, Any]:
    fact = {
        "schema_version": "2.0.0",
        "fact_id": fact_id,
        "truth_domain": truth_domain,
        "subject": subject,
        "predicate": predicate,
        "value": value,
        "epistemic_status": epistemic_status,
        "durability": durability,
        "authority": authority,
        "write_policy": write_policy,
        "provenance": provenance,
        "caused_by": caused_by or [],
        "causes": causes or [],
        "prohibited_inferences": prohibited_inferences or [],
        "lifecycle": "ACTIVE",
        "created_at": utc_now(),
    }
    if supersedes is not None:
        fact["supersedes"] = supersedes
    return validate_fact(fact)


class CanonStore:
    def __init__(self, ledger: Ledger, profile: RuntimeProfile):
        self.ledger = ledger
        self.profile = profile

    def state(self) -> dict[str, Any]:
        active: dict[str, dict[str, Any]] = {}
        all_facts: dict[str, dict[str, Any]] = {}
        unknown_locks: dict[str, dict[str, Any]] = {}
        proposals: list[dict[str, Any]] = []
        for event in self.ledger.read_events():
            payload = event["payload"]
            if event["event_type"] == "CANON_PROPOSED":
                proposals.append(payload)
            elif event["event_type"] == "CANON_COMMITTED":
                fact = validate_fact(deepcopy(payload["fact"]))
                all_facts[fact["fact_id"]] = fact
                active[fact["fact_id"]] = fact
            elif event["event_type"] == "CANON_SUPERSEDED":
                old_id = payload["old_fact_id"]
                if old_id in active:
                    old = deepcopy(active.pop(old_id))
                    old["lifecycle"] = "SUPERSEDED"
                    old["superseded_by"] = payload["new_fact_id"]
                    all_facts[old_id] = old
            elif event["event_type"] == "UNKNOWN_LOCKED":
                unknown_locks[payload["lock_id"]] = deepcopy(payload)
        return {
            "active": active,
            "all": all_facts,
            "unknown_locks": unknown_locks,
            "proposals": proposals,
        }

    def propose(self, fact: dict[str, Any], actor: str = "MODEL") -> dict[str, Any]:
        validate_fact(fact)
        if fact["durability"] in {"T0", "T1"} and not self.profile.permits("propose_t0_t1"):
            raise PermissionDenied(f"{self.profile.id} 프로파일은 T0/T1 제안도 허용하지 않습니다.")
        return self.ledger.append(
            "CANON_PROPOSED",
            actor,
            {"fact": deepcopy(fact), "content_sha256": sha256_text(canonical_json(fact))},
            self.profile,
        )

    def commit(self, fact: dict[str, Any], actor: str = "TEACHER", approval_ref: str | None = None) -> dict[str, Any]:
        validate_fact(fact)
        current = self.state()
        if fact["fact_id"] in current["all"]:
            raise IntegrityError("같은 fact_id를 덮어쓸 수 없습니다. 새 ID와 supersedes를 사용하세요.")
        if fact["durability"] in {"T0", "T1"}:
            if not self.profile.permits("commit_t0_t1") or self.profile.assurance != "HOST_ENFORCED":
                raise PermissionDenied(f"{self.profile.id} 프로파일은 T0/T1을 커밋할 수 없습니다.")
            if fact["write_policy"] == "USER_APPROVAL" and not approval_ref:
                raise PermissionDenied("USER_APPROVAL Canon에는 명시적인 approval_ref가 필요합니다.")
        elif not self.profile.permits("write_t2_t3") and fact["durability"] in {"T2", "T3"}:
            raise PermissionDenied(f"{self.profile.id} 프로파일은 T2/T3을 기록할 수 없습니다.")
        missing_causes = [cause for cause in fact["caused_by"] if cause not in current["active"]]
        if missing_causes:
            raise IntegrityError(f"존재하지 않는 인과 앵커를 참조합니다: {', '.join(missing_causes)}")
        supersedes = fact.get("supersedes")
        if supersedes and supersedes not in current["active"]:
            raise IntegrityError("교정 대상 Canon 사실이 현재 ACTIVE가 아닙니다.")
        event = self.ledger.append(
            "CANON_COMMITTED",
            actor,
            {
                "fact": deepcopy(fact),
                "approval_ref": approval_ref,
                "content_sha256": sha256_text(canonical_json(fact)),
            },
            self.profile,
        )
        if supersedes:
            self.ledger.append(
                "CANON_SUPERSEDED",
                actor,
                {"old_fact_id": supersedes, "new_fact_id": fact["fact_id"], "approval_ref": approval_ref},
                self.profile,
            )
        return event

    def lock_unknown(
        self,
        *,
        lock_id: str,
        subject: str,
        predicate: str,
        reason: str,
        required_input: str,
        actor: str = "TEACHER",
    ) -> dict[str, Any]:
        if not lock_id.startswith("UNK-"):
            raise IntegrityError("UNKNOWN lock ID는 UNK-로 시작해야 합니다.")
        payload = {
            "lock_id": lock_id,
            "subject": subject,
            "predicate": predicate,
            "state": "UNKNOWN_LOCKED",
            "reason": reason,
            "required_input": required_input,
        }
        return self.ledger.append("UNKNOWN_LOCKED", actor, payload, self.profile)
