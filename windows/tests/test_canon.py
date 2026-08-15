from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from reverse_app.canon import CanonStore, make_fact
from reverse_app.errors import IntegrityError, PermissionDenied
from reverse_app.ledger import Ledger
from reverse_app.profiles import load_named_profile


def scenario_fact(fact_id: str, *, durability: str = "T1", caused_by: list[str] | None = None) -> dict:
    return make_fact(
        fact_id=fact_id,
        truth_domain="SCENARIO_CANON",
        subject="수업 세계",
        predicate="분기점",
        value="검증용 분기",
        epistemic_status="SCENARIO",
        durability=durability,
        authority="TEACHER_CONFIRMED",
        write_policy="USER_APPROVAL" if durability in {"T0", "T1"} else "RUNTIME_ALLOWED",
        provenance=[{"kind": "USER_DECISION", "ref": "TEST-APPROVAL", "content_sha256": None}],
        caused_by=caused_by,
    )


class CanonTests(unittest.TestCase):
    def test_prompt_guarded_profile_cannot_commit_t0_t1(self) -> None:
        profile = load_named_profile("CHATGPT_FREE")
        with tempfile.TemporaryDirectory() as directory:
            store = CanonStore(Ledger(Path(directory) / "ledger.ndjson"), profile)
            with self.assertRaisesRegex(PermissionDenied, "T0/T1"):
                store.commit(scenario_fact("FACT-CHATGPT-0001"), approval_ref="USER-YES")

    def test_windows_host_commits_t1_with_explicit_approval(self) -> None:
        profile = load_named_profile("WINDOWS_STANDALONE")
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory) / "ledger.ndjson")
            ledger.initialize(profile)
            store = CanonStore(ledger, profile)
            store.commit(scenario_fact("FACT-WINDOWS-0001"), approval_ref="USER-YES")
            self.assertIn("FACT-WINDOWS-0001", store.state()["active"])

    def test_missing_causal_anchor_is_rejected_before_commit(self) -> None:
        profile = load_named_profile("WINDOWS_STANDALONE")
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory) / "ledger.ndjson")
            ledger.initialize(profile)
            store = CanonStore(ledger, profile)
            with self.assertRaisesRegex(IntegrityError, "인과 앵커"):
                store.commit(
                    scenario_fact("FACT-WINDOWS-0002", durability="T2", caused_by=["FACT-MISSING-0001"])
                )


if __name__ == "__main__":
    unittest.main()
