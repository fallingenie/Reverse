from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from reverse_app.canon import CanonStore
from reverse_app.context import build_context, write_context_pack
from reverse_app.errors import ContextBlocked
from reverse_app.ledger import Ledger
from reverse_app.profiles import load_named_profile

from test_canon import scenario_fact


class ContextTests(unittest.TestCase):
    def test_causal_closure_includes_parent(self) -> None:
        host = load_named_profile("WINDOWS_STANDALONE")
        target = load_named_profile("CHATGPT_FREE")
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory) / "ledger.ndjson")
            ledger.initialize(host)
            store = CanonStore(ledger, host)
            store.commit(scenario_fact("FACT-PARENT-0001"), approval_ref="USER-YES")
            store.commit(scenario_fact("FACT-CHILD-0001", caused_by=["FACT-PARENT-0001"]), approval_ref="USER-YES")
            manifest = build_context(ledger, target, ["FACT-CHILD-0001"])
            self.assertEqual(manifest["status"], "READY")
            self.assertEqual(manifest["included_fact_ids"], ["FACT-CHILD-0001", "FACT-PARENT-0001"])
            self.assertEqual(manifest["canon_write"], "T2_T3_CANDIDATE_ONLY")

    def test_unknown_lock_blocks_only_when_requested(self) -> None:
        host = load_named_profile("WINDOWS_STANDALONE")
        target = load_named_profile("COPILOT_M365")
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory) / "ledger.ndjson")
            ledger.initialize(host)
            store = CanonStore(ledger, host)
            store.lock_unknown(
                lock_id="UNK-CAUSE-0001",
                subject="등장인물",
                predicate="질병 원인",
                reason="이전 원문이 현재 Context에 없음",
                required_input="원문 Canon 또는 교사 결정",
            )
            unrelated = build_context(ledger, target, [])
            self.assertEqual(unrelated["status"], "READY")
            blocked = build_context(ledger, target, ["UNK-CAUSE-0001"])
            self.assertEqual(blocked["status"], "BLOCKED")
            with self.assertRaises(ContextBlocked):
                write_context_pack(Path(directory) / "context", blocked)

    def test_human_context_markdown_uses_utf8_sig_but_manifest_does_not(self) -> None:
        host = load_named_profile("WINDOWS_STANDALONE")
        target = load_named_profile("CHATGPT_FREE")
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory) / "ledger.ndjson")
            ledger.initialize(host)
            manifest = build_context(ledger, target, [])
            manifest_path, pack_path = write_context_pack(Path(directory) / "context", manifest)
            self.assertTrue(pack_path.read_bytes().startswith(b"\xef\xbb\xbf"))
            self.assertFalse(manifest_path.read_bytes().startswith(b"\xef\xbb\xbf"))


if __name__ == "__main__":
    unittest.main()
