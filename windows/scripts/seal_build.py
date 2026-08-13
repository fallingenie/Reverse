from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def expected_manifest(root: Path) -> dict:
    manifest_path = root / "BUILD_MANIFEST.json"
    files = sorted(path for path in root.rglob("*") if path.is_file() and path != manifest_path)
    digests = {path.relative_to(root).as_posix(): sha256(path) for path in files}
    sizes = {path.relative_to(root).as_posix(): path.stat().st_size for path in files}
    without_seal = {
        "schema_version": "1.0.0",
        "package_id": "reverse-windows-onedir",
        "app_version": "0.3.0",
        "platform": "Windows x64",
        "assurance": "HOST_ENFORCED",
        "license": "Apache-2.0",
        "file_count": len(files),
        "total_bytes": sum(sizes.values()),
        "executable_sha256": digests.get("Reverse.exe"),
        "file_digests": digests,
    }
    seal = hashlib.sha256(canonical_json(without_seal).encode("utf-8")).hexdigest()
    return {**without_seal, "seal_sha256": seal}


def main() -> int:
    if len(sys.argv) not in {2, 3}:
        raise RuntimeError("Usage: seal_build.py <distribution-directory> [--verify]")
    root = Path(sys.argv[1]).resolve()
    verify = len(sys.argv) == 3 and sys.argv[2] == "--verify"
    if not (root / "Reverse.exe").is_file():
        raise RuntimeError(f"Reverse.exe not found in distribution: {root}")
    expected = expected_manifest(root)
    manifest_path = root / "BUILD_MANIFEST.json"
    if verify:
        actual = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
        if canonical_json(actual) != canonical_json(expected):
            raise RuntimeError("BUILD_MANIFEST.json does not match the distribution contents.")
        print(f"Windows build seal verified: {expected['seal_sha256']}")
    else:
        manifest_path.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Windows build sealed: {expected['seal_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
