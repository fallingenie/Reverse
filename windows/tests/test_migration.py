from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from reverse_app.canon import CanonStore
from reverse_app.errors import IntegrityError
from reverse_app.ledger import Ledger
from reverse_app.migration import migrate_v1_session
from reverse_app.profiles import load_named_profile


class MigrationTests(unittest.TestCase):
    def test_v1_migration_preserves_unknown_and_does_not_upgrade_memory_to_verified(self) -> None:
        profile = load_named_profile("WINDOWS_STANDALONE")
        fixture = Path(__file__).resolve().parents[2] / "skills" / "teach-grounded-scenarios" / "examples" / "grade-6" / "1945-no-atomic-bomb" / "session.json"
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory) / "ledger.ndjson")
            result = migrate_v1_session(fixture, ledger, profile)
            state = CanonStore(ledger, profile).state()
            migrated_memory = [
                fact for fact in state["active"].values()
                if fact["subject"] in {"legacy-canon", "legacy-negative_facts"}
            ]
            self.assertTrue(result["unknown_lock_ids"])
            self.assertTrue(migrated_memory)
            self.assertTrue(all(fact["epistemic_status"] == "SCENARIO" for fact in migrated_memory))
            self.assertTrue(all(fact["authority"] == "STORY_EVENT" for fact in migrated_memory))

    def test_migration_refuses_nonempty_ledger(self) -> None:
        profile = load_named_profile("WINDOWS_STANDALONE")
        fixture = Path(__file__).resolve().parents[2] / "skills" / "teach-grounded-scenarios" / "assets" / "session.template.json"
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(Path(directory) / "ledger.ndjson")
            ledger.initialize(profile)
            with self.assertRaisesRegex(IntegrityError, "비어 있는 새 원장"):
                migrate_v1_session(fixture, ledger, profile)


if __name__ == "__main__":
    unittest.main()
