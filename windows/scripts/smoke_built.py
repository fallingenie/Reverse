from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def run(executable: Path, *arguments: str) -> dict:
    completed = subprocess.run(
        [str(executable), *arguments],
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if completed.returncode != 0:
        raise RuntimeError(
            f"Reverse.exe failed ({completed.returncode})\nstdout={completed.stdout}\nstderr={completed.stderr}"
        )
    return json.loads(completed.stdout)


def make_pdf(path: Path) -> None:
    from reportlab.pdfgen import canvas

    document = canvas.Canvas(str(path))
    document.drawString(72, 760, "Reverse packaged executable PDF smoke test.")
    document.drawString(72, 740, "This text must be extracted but not automatically verified.")
    document.save()


def main() -> int:
    if len(sys.argv) != 2:
        raise RuntimeError("Usage: smoke_built.py <Reverse.exe>")
    executable = Path(sys.argv[1]).resolve()
    if not executable.is_file():
        raise RuntimeError(f"Built executable not found: {executable}")

    with tempfile.TemporaryDirectory(prefix="reverse-built-smoke-") as directory:
        root = Path(directory)
        state = root / "state"
        context = root / "context"
        pdf = root / "reference.pdf"
        fact_path = root / "fact.json"
        make_pdf(pdf)
        fact = {
            "schema_version": "2.0.0",
            "fact_id": "FACT-PACKAGED-SMOKE-0001",
            "truth_domain": "SCENARIO_CANON",
            "subject": "packaged-smoke",
            "predicate": "branch",
            "value": "packaged host loads all runtime profiles",
            "epistemic_status": "SCENARIO",
            "durability": "T1",
            "authority": "TEACHER_CONFIRMED",
            "write_policy": "USER_APPROVAL",
            "provenance": [{"kind": "USER_DECISION", "ref": "BUILD-SMOKE", "content_sha256": None}],
            "caused_by": [],
            "causes": [],
            "prohibited_inferences": ["Do not infer a model identity from this fact."],
            "lifecycle": "ACTIVE",
            "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        fact_path.write_text(json.dumps(fact, ensure_ascii=False, indent=2), encoding="utf-8")

        doctor = run(executable, "--state-dir", str(state), "doctor")
        if doctor["dependencies"].get("pypdf") is None or doctor["dependencies"].get("pdfplumber") is None:
            raise RuntimeError("Built executable did not report bundled PDF dependency versions.")
        run(executable, "--state-dir", str(state), "init")
        run(
            executable,
            "--state-dir", str(state),
            "commit-fact",
            "--fact", str(fact_path),
            "--approval-ref", "BUILD-SMOKE",
        )
        exported = run(
            executable,
            "--state-dir", str(state),
            "build-context",
            "--target", "CHATGPT_FREE",
            "--required", "FACT-PACKAGED-SMOKE-0001",
            "--output", str(context),
        )
        if exported["status"] != "READY" or not (context / "CONTEXT_PACK.md").is_file():
            raise RuntimeError("Built executable failed to export a ChatGPT context pack.")
        pdf_result = run(
            executable,
            "--state-dir", str(state),
            "add-pdf",
            "--pdf", str(pdf),
            "--rights-basis", "OWNED",
        )
        if pdf_result["status"] != "NEEDS_REVIEW" or pdf_result["chunks"] < 1:
            raise RuntimeError("Built executable failed the text PDF boundary test.")
    print("Packaged executable smoke test passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
