from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from reverse_app.errors import IntegrityError
from reverse_app.ledger import Ledger
from reverse_app.profiles import load_bundled_profile


class LedgerTests(unittest.TestCase):
    def test_hash_chain_detects_same_id_content_mutation(self) -> None:
        profile = load_bundled_profile()
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory) / "ledger.ndjson")
            ledger.initialize(profile)
            ledger.append("CORRECTION_RECORDED", "TEACHER", {"text": "원본"}, profile)
            lines = ledger.path.read_text(encoding="utf-8").splitlines()
            event = json.loads(lines[1])
            event["payload"]["text"] = "같은 ID로 바꾼 내용"
            lines[1] = json.dumps(event, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            ledger.path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(IntegrityError, "이벤트 해시"):
                ledger.read_events()

    def test_incomplete_trailing_event_fails_closed(self) -> None:
        profile = load_bundled_profile()
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory) / "ledger.ndjson")
            ledger.initialize(profile)
            with ledger.path.open("ab") as stream:
                stream.write(b'{"partial":')
            with self.assertRaisesRegex(IntegrityError, "불완전"):
                ledger.read_events()


if __name__ == "__main__":
    unittest.main()
