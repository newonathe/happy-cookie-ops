"""Target guards plus a real failure/cleanup probe; run directly with Python."""
import copy
import importlib.util
import json
from pathlib import Path
import secrets
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


class Guards(unittest.TestCase):
    def test_plain_adjacent_same_table_grant_order_is_irrelevant(self):
        a = 'GRANT SELECT ON TABLE public.orders TO anon;\n'
        b = 'GRANT ALL ON TABLE public.orders TO service_role;\n'
        self.assertEqual(h.normalize_schema_dump(a+b), h.normalize_schema_dump(b+a))

    def test_grant_changes_are_not_normalized_away(self):
        a = 'GRANT SELECT ON TABLE public.orders TO anon;\n'
        self.assertNotEqual(h.normalize_schema_dump(a), h.normalize_schema_dump(''))
        self.assertNotEqual(h.normalize_schema_dump(a), h.normalize_schema_dump(a.replace('SELECT','UPDATE')))
        self.assertNotEqual(h.normalize_schema_dump(a), h.normalize_schema_dump(a.replace('anon','authenticated')))

    def test_other_statement_order_is_preserved(self):
        a = 'GRANT SELECT ON TABLE public.orders TO anon;\n'
        b = 'GRANT ALL ON TABLE public.orders TO service_role;\n'
        barrier = 'REVOKE SELECT ON TABLE public.orders FROM anon;\n'
        self.assertNotEqual(h.normalize_schema_dump(a+barrier+b), h.normalize_schema_dump(b+barrier+a))

    def setUp(self):
        self.cid, self.project, self.image = "a" * 64, "hcb-abc123-123abc", "sha256:" + "b" * 64
        self.info = dict(id=self.cid, name="/" + self.project, image=self.image,
                         labels={h.LABEL: self.project}, mounts=[], network="bridge", running=True)
        self.info["bindings"] = {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": "46000"}]}
        self.info["ports"] = copy.deepcopy(self.info["bindings"])

    def test_exact_loopback_and_identity(self):
        h.assert_identity(self.info, self.cid, self.project, self.image)
        h.assert_loopback(self.info, 46000)

    def test_unsafe_bindings_rejected(self):
        for host in ("", "0.0.0.0", "::", "::1", "localhost", "192.0.2.1"):
            with self.subTest(host=host):
                info = copy.deepcopy(self.info)
                info["ports"]["5432/tcp"][0]["HostIp"] = host
                with self.assertRaises(RuntimeError):
                    h.assert_loopback(info, 46000)
        for key, value in (("ports", {}), ("running", False), ("network", "host")):
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                h.assert_loopback(self.info | {key: value}, 46000)
        with self.assertRaises(RuntimeError):
            h.assert_loopback(self.info, 46001)

    def test_replaced_container_and_host_mount_rejected(self):
        for key, value in (("id", "c" * 64), ("labels", {}), ("image", "different"),
                           ("name", "/other"), ("mounts", [{"Type": "bind"}])):
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                h.assert_identity(self.info | {key: value}, self.cid, self.project, self.image)

    def test_external_arguments_rejected_before_creation(self):
        with patch.object(sys, "argv", ["fixture", "--db-url", "https://example.invalid"]), \
                patch.object(h, "require_local_docker") as docker, self.assertRaises(RuntimeError):
            h.main()
        docker.assert_not_called()

    def test_generated_secret_not_reported_on_command_failure(self):
        secret = secrets.token_urlsafe(24)
        child = "import os,sys; print('ERROR: '+os.environ['PGPASSWORD']); sys.exit(1)"
        with self.assertRaises(RuntimeError) as caught:
            h.run([sys.executable, "-c", child], cwd=ROOT, timeout=10, extra_env={"PGPASSWORD": secret})
        self.assertNotIn(secret, str(caught.exception))
        self.assertIn("redacted-generated-secret", str(caught.exception))

    def test_cleanup_refuses_unowned_and_retains_on_remove_error(self):
        with patch.object(h, "owned", return_value=False), patch.object(h, "docker") as docker:
            with self.assertRaises(RuntimeError):
                h.cleanup(ROOT, self.project, self.image)
            docker.assert_not_called()
        with patch.object(h, "owned", return_value=True), \
                patch.object(h, "docker", side_effect=[self.cid, RuntimeError("remove failure")]), \
                patch.object(h, "inspect_container", return_value=self.info), \
                patch.object(Path, "is_file", return_value=True), patch.object(Path, "read_text", return_value=self.cid), \
                patch.object(h.shutil, "rmtree") as remove:
            with self.assertRaisesRegex(RuntimeError, "remove failure"):
                h.cleanup(ROOT / "nonexistent-owned-test", self.project, self.image)
            remove.assert_not_called()

    def test_cleanup_missing_or_mismatched_creation_id_retains_resources(self):
        for captured in ("", "bad-id", "c" * 64):
            with self.subTest(captured=captured), patch.object(h, "owned", return_value=True), \
                    patch.object(h, "docker", return_value=self.cid) as docker, \
                    patch.object(Path, "is_file", return_value=bool(captured)), \
                    patch.object(Path, "read_text", return_value=captured), \
                    patch.object(h.shutil, "rmtree") as remove:
                with self.assertRaisesRegex(RuntimeError, "captured creation ID"):
                    h.cleanup(ROOT / "nonexistent-owned-test", self.project, self.image)
                self.assertEqual(docker.call_count, 1)
                remove.assert_not_called()

    def test_real_failure_cleanup_preserves_unrelated_container(self):
        h.require_local_docker(ROOT)
        name = "hcb-cleanup-sentinel-" + secrets.token_hex(6)
        image = h.docker(["image", "inspect", "--format", "{{.Id}}", h.IMAGE], cwd=ROOT, timeout=20).strip()
        cid = h.docker(["create", "--name", name, "--network", "none", "--entrypoint", "sleep", image, "120"], cwd=ROOT, timeout=30).strip()
        report_dir = tempfile.TemporaryDirectory(prefix="hcb-bootstrap-guard-")
        self.addCleanup(report_dir.cleanup)
        report_path = Path(report_dir.name) / "failure-cleanup.json"
        try:
            with patch.object(h, "REPORT", report_path), patch.object(sys, "argv", ["fixture"]):
                self.assertEqual(h.main(fail_after_start=True), 1)
            report = json.loads(report_path.read_text())
            self.assertEqual(report["error"], "injected failure after owned container startup")
            self.assertEqual(report["cleanup"], "passed")
            self.assertEqual(report["resets"], 0)
            self.assertFalse(Path(report["workdir"]).exists())
            self.assertEqual(h.inspect_container(cid, ROOT)["id"], cid)
            report["unrelated_container_preserved"] = True
            report_path.write_text(json.dumps(report, indent=2) + "\n")
        finally:
            info = h.inspect_container(cid, ROOT)
            self.assertEqual((info["id"], info["name"], info["image"]), (cid, "/" + name, image))
            h.docker(["rm", "-v", cid], cwd=ROOT, timeout=30)


if __name__ == "__main__":
    unittest.main()
