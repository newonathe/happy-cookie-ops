"""Artifact replacement and early failure tests; no Docker services needed."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("typegen", ROOT / "scripts/generate-db-types.py")
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


class Generation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        self.destination = self.directory / "database.ts"
        self.destination.write_text("original\n")
        self.override = patch.object(g, "DESTINATION", self.destination)
        self.override.start()

    def tearDown(self):
        self.override.stop()
        self.temp.cleanup()

    def test_check_rejects_drift_without_writing(self):
        with self.assertRaisesRegex(RuntimeError, "differ"):
            g.finish_artifact("changed\n", "--check")
        self.assertEqual(self.destination.read_text(), "original\n")

    def test_write_replaces_complete_artifact(self):
        g.finish_artifact("generated\n", "--write")
        self.assertEqual(self.destination.read_bytes(), b"generated\n")
        self.assertFalse(self.destination.with_suffix(".ts.pending").exists())

    def test_existing_pending_file_prevents_replacement(self):
        self.destination.with_suffix(".ts.pending").write_text("interrupted run\n")
        with self.assertRaises(FileExistsError):
            g.finish_artifact("changed\n", "--write")
        self.assertEqual(self.destination.read_text(), "original\n")

    def test_external_target_is_rejected_before_docker(self):
        with patch.object(sys, "argv", ["typegen", "--db-url", "https://example.invalid"]), \
                patch.object(g.h, "require_local_docker") as docker, self.assertRaises(RuntimeError):
            g.main()
        docker.assert_not_called()

    def test_early_failure_preserves_artifact_and_records_failure(self):
        with patch.object(sys, "argv", ["typegen", "--write"]), patch.object(g, "EVIDENCE", self.directory), \
                patch.object(g.h, "require_local_docker", side_effect=RuntimeError("injected readiness failure")):
            self.assertEqual(g.main(), 1)
        report = json.loads((self.directory / "MP-05b-types-write.json").read_text())
        self.assertEqual(report["status"], "failed")
        self.assertTrue(report["artifact_unchanged"])
        self.assertEqual(self.destination.read_text(), "original\n")

    def test_generator_identity_refusal_and_cleanup_id_mismatch(self):
        project, cid, image = "hcb-123-123abc", "a" * 64, "sha256:test"
        name = project + "-types-1"
        info = {"id": cid, "name": "/" + name, "image": image,
                "labels": {g.h.LABEL + ".types": name}, "network": "host", "bindings": {}, "mounts": []}
        for mismatch in (False, True):
            with self.subTest(mismatch=mismatch):
                def create(*args, **kwargs):
                    (self.directory / "types-1.id").write_text(cid)
                outputs = ["b" * 64] if mismatch else [cid, "removed", ""]
                with patch.object(g.h, "run", side_effect=create), patch.object(g.h, "owned", return_value=True), \
                        patch.object(g.h, "inspect_container", return_value=info), \
                        patch.object(g.h, "docker", side_effect=outputs) as docker, \
                        patch.object(g.subprocess, "run") as start:
                    with self.assertRaisesRegex(RuntimeError, "captured ID" if mismatch else "isolation differs"):
                        g.generate_one("c" * 64, self.directory, "test-only-password", {"project_id": project}, image, 1)
                    start.assert_not_called()
                    self.assertEqual(docker.call_count, 1 if mismatch else 3)
                self.assertEqual((self.directory / "retain-resources").exists(), mismatch)
        with patch.object(g.h, "owned", return_value=True), patch.object(g.h, "docker") as docker:
            with self.assertRaisesRegex(RuntimeError, "dependent fixture cleanup failed"):
                g.h.cleanup(self.directory, project, image)
            docker.assert_not_called()


if __name__ == "__main__":
    unittest.main()
