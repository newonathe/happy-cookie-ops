"""Fail-closed security evidence tests; no Docker or application changes."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("security", ROOT / "scripts/test-db-security.py")
s = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)


class SecurityEvidence(unittest.TestCase):
    def test_preflight_exception_replaces_stale_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "security.json"
            report.write_text('{"status":"passed"}')
            with patch.object(s, "REPORT", report), patch.object(sys, "argv", ["security"]), \
                    patch.object(s.h, "main", side_effect=RuntimeError("injected preflight failure")):
                self.assertEqual(s.main(), 1)
            result = json.loads(report.read_text())
            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["error"], "injected preflight failure")
            self.assertEqual(result["runs"], [])

    def test_bootstrap_success_without_role_checks_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            report = Path(directory) / "security.json"
            with patch.object(s, "REPORT", report), patch.object(sys, "argv", ["security"]), \
                    patch.object(s.h, "main", return_value=0):
                self.assertEqual(s.main(), 1)
            result = json.loads(report.read_text())
            self.assertEqual(result["status"], "failed")
            self.assertEqual(result["regressions_detected"], [])


if __name__ == "__main__":
    unittest.main()
