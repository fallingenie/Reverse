from __future__ import annotations

import subprocess
import sys
import unittest


class EntrypointTests(unittest.TestCase):
    def test_module_entrypoint_runs_doctor(self) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "reverse_app", "doctor"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('"profile_id": "WINDOWS_STANDALONE"', result.stdout)


if __name__ == "__main__":
    unittest.main()
