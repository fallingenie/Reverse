from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .errors import IntegrityError


PROFILE_IDS = {"CHATGPT_FREE", "COPILOT_M365", "WINDOWS_STANDALONE"}
ASSURANCE_LEVELS = {"PROMPT_GUARDED", "PLATFORM_CONFIGURED", "HOST_ENFORCED"}


@dataclass(frozen=True)
class RuntimeProfile:
    raw: dict[str, Any]

    @property
    def id(self) -> str:
        return str(self.raw["id"])

    @property
    def assurance(self) -> str:
        return str(self.raw["assurance"])

    def permits(self, permission: str) -> bool:
        return self.raw.get("permissions", {}).get(permission) is True


def _validate_profile(data: dict[str, Any]) -> None:
    if data.get("schema_version") != "2.0.0":
        raise IntegrityError("지원하지 않는 런타임 프로파일 버전입니다.")
    if data.get("id") not in PROFILE_IDS:
        raise IntegrityError("알 수 없는 런타임 프로파일 ID입니다.")
    if data.get("assurance") not in ASSURANCE_LEVELS:
        raise IntegrityError("알 수 없는 보장 수준입니다.")
    permissions = data.get("permissions")
    if not isinstance(permissions, dict):
        raise IntegrityError("런타임 권한 표가 없습니다.")
    required_permissions = {
        "read_canon",
        "propose_t0_t1",
        "commit_t0_t1",
        "write_t2_t3",
        "persist_local_state",
        "execute_validators",
    }
    if set(permissions) != required_permissions:
        raise IntegrityError("런타임 권한 키가 계약과 일치하지 않습니다.")
    if any(not isinstance(value, bool) for value in permissions.values()):
        raise IntegrityError("런타임 권한 값은 boolean이어야 합니다.")
    if data["assurance"] != "HOST_ENFORCED" and permissions["commit_t0_t1"]:
        raise IntegrityError("호스트 강제가 아닌 프로파일에는 T0/T1 커밋 권한을 줄 수 없습니다.")
    model = data.get("model", {})
    if model.get("identity_attested") is True or model.get("observed_label_trusted") is True:
        raise IntegrityError("이 프로토타입은 모델 신원을 증명하거나 화면 별칭을 신뢰하지 않습니다.")


def load_profile(path: str | Path) -> RuntimeProfile:
    profile_path = Path(path).resolve()
    try:
        data = json.loads(profile_path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as error:
        raise IntegrityError(f"런타임 프로파일을 읽지 못했습니다: {error}") from error
    if not isinstance(data, dict):
        raise IntegrityError("런타임 프로파일 루트는 object여야 합니다.")
    _validate_profile(data)
    return RuntimeProfile(data)


def bundled_profile_path() -> Path:
    candidates: list[Path] = []
    bundle_root = getattr(sys, "_MEIPASS", None)
    if bundle_root:
        candidates.append(Path(bundle_root) / "RUNTIME_PROFILE.json")
    candidates.append(Path(__file__).resolve().parent.parent / "RUNTIME_PROFILE.json")
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise IntegrityError("WINDOWS_STANDALONE 런타임 프로파일을 찾지 못했습니다.")


def load_bundled_profile() -> RuntimeProfile:
    return load_profile(bundled_profile_path())


def load_named_profile(profile_id: str) -> RuntimeProfile:
    if profile_id not in PROFILE_IDS:
        raise IntegrityError(f"알 수 없는 프로파일 ID입니다: {profile_id}")
    bundle_root = getattr(sys, "_MEIPASS", None)
    candidates: list[Path] = []
    if bundle_root:
        candidates.append(Path(bundle_root) / "profiles" / profile_id / "RUNTIME_PROFILE.json")
    windows_root = Path(__file__).resolve().parent.parent
    repository_root = windows_root.parent
    source_mapping = {
        "CHATGPT_FREE": repository_root / "chatgpt" / "RUNTIME_PROFILE.json",
        "COPILOT_M365": repository_root / "copilot" / "RUNTIME_PROFILE.json",
        "WINDOWS_STANDALONE": windows_root / "RUNTIME_PROFILE.json",
    }
    candidates.append(source_mapping[profile_id])
    for candidate in candidates:
        if candidate.is_file():
            return load_profile(candidate)
    raise IntegrityError(f"{profile_id} 런타임 프로파일을 찾지 못했습니다.")
