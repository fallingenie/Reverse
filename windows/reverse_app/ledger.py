from __future__ import annotations

import hashlib
import json
import os
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from .errors import IntegrityError
from .profiles import RuntimeProfile


EVENT_TYPES = {
    "SESSION_CREATED",
    "CANON_PROPOSED",
    "CANON_COMMITTED",
    "CANON_SUPERSEDED",
    "UNKNOWN_LOCKED",
    "CORRECTION_RECORDED",
    "CONTEXT_EXPORTED",
    "PDF_REFERENCE_ADDED",
}
ACTORS = {"HOST", "TEACHER", "STUDENT", "MODEL", "MIGRATION"}


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def event_digest(event_without_hash: dict[str, Any]) -> str:
    return sha256_text(canonical_json(event_without_hash))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@contextmanager
def exclusive_lock(lock_path: Path) -> Iterator[None]:
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        descriptor = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as error:
        raise IntegrityError(f"원장 잠금이 이미 존재합니다: {lock_path}") from error
    try:
        os.write(descriptor, f"pid={os.getpid()}\n".encode("ascii"))
        os.fsync(descriptor)
        yield
    finally:
        os.close(descriptor)
        try:
            lock_path.unlink()
        except FileNotFoundError:
            pass


class Ledger:
    def __init__(self, path: str | Path):
        self.path = Path(path).resolve()
        self.lock_path = self.path.with_suffix(f"{self.path.suffix}.lock")

    def read_events(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        raw = self.path.read_bytes()
        if raw and not raw.endswith(b"\n"):
            raise IntegrityError("원장 마지막 줄이 불완전합니다. 자동 복구하지 않았습니다.")
        events: list[dict[str, Any]] = []
        previous_hash: str | None = None
        for line_number, raw_line in enumerate(raw.splitlines(), start=1):
            try:
                event = json.loads(raw_line.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise IntegrityError(f"원장 {line_number}번째 줄을 읽지 못했습니다.") from error
            self._validate_event(event, line_number, previous_hash)
            events.append(event)
            previous_hash = event["event_hash"]
        return events

    @staticmethod
    def _validate_event(event: Any, line_number: int, previous_hash: str | None) -> None:
        if not isinstance(event, dict):
            raise IntegrityError(f"원장 {line_number}번째 이벤트가 object가 아닙니다.")
        required = {
            "schema_version", "sequence", "event_id", "occurred_at", "event_type",
            "actor", "profile_id", "payload", "previous_hash", "event_hash",
        }
        if set(event) != required:
            raise IntegrityError(f"원장 {line_number}번째 이벤트 필드가 계약과 다릅니다.")
        if event["schema_version"] != "2.0.0":
            raise IntegrityError(f"원장 {line_number}번째 이벤트 버전을 지원하지 않습니다.")
        if event["sequence"] != line_number:
            raise IntegrityError(f"원장 {line_number}번째 이벤트 순서가 끊겼습니다.")
        if event["event_type"] not in EVENT_TYPES or event["actor"] not in ACTORS:
            raise IntegrityError(f"원장 {line_number}번째 이벤트 종류 또는 행위자가 유효하지 않습니다.")
        if event["previous_hash"] != previous_hash:
            raise IntegrityError(f"원장 {line_number}번째 이전 해시가 일치하지 않습니다.")
        without_hash = {key: value for key, value in event.items() if key != "event_hash"}
        if event_digest(without_hash) != event["event_hash"]:
            raise IntegrityError(f"원장 {line_number}번째 이벤트 해시가 일치하지 않습니다.")

    def append(
        self,
        event_type: str,
        actor: str,
        payload: dict[str, Any],
        profile: RuntimeProfile,
    ) -> dict[str, Any]:
        if event_type not in EVENT_TYPES:
            raise IntegrityError(f"지원하지 않는 이벤트 종류입니다: {event_type}")
        if actor not in ACTORS:
            raise IntegrityError(f"지원하지 않는 행위자입니다: {actor}")
        if not isinstance(payload, dict):
            raise IntegrityError("원장 payload는 object여야 합니다.")
        if not profile.permits("persist_local_state"):
            raise IntegrityError(f"{profile.id} 프로파일은 로컬 원장 저장을 허용하지 않습니다.")

        self.path.parent.mkdir(parents=True, exist_ok=True)
        with exclusive_lock(self.lock_path):
            events = self.read_events()
            previous_hash = events[-1]["event_hash"] if events else None
            event_without_hash = {
                "schema_version": "2.0.0",
                "sequence": len(events) + 1,
                "event_id": f"EVT-{uuid.uuid4().hex.upper()}",
                "occurred_at": utc_now(),
                "event_type": event_type,
                "actor": actor,
                "profile_id": profile.id,
                "payload": payload,
                "previous_hash": previous_hash,
            }
            event = {**event_without_hash, "event_hash": event_digest(event_without_hash)}
            serialized = f"{canonical_json(event)}\n".encode("utf-8")
            with self.path.open("ab", buffering=0) as stream:
                stream.write(serialized)
                os.fsync(stream.fileno())
            self._validate_event(event, len(events) + 1, previous_hash)
            return event

    def initialize(self, profile: RuntimeProfile) -> dict[str, Any]:
        events = self.read_events()
        if events:
            return events[0]
        return self.append(
            "SESSION_CREATED",
            "HOST",
            {"assurance": profile.assurance, "truth_rule": "Transparency and Truth"},
            profile,
        )
