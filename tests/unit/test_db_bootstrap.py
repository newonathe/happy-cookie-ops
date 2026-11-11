"""Portable fixture selection must never inherit a remote Docker endpoint."""
import importlib.util
import os
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'scripts/test-db-bootstrap.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)


class LocalFixtureTests(unittest.TestCase):
    def test_platform_cli_is_pinned_and_installed(self):
        self.assertTrue(h.SUPABASE.is_file())
        self.assertIn('@2.116.0', str(h.SUPABASE))
        self.assertIn('cli-windows' if os.name == 'nt' else 'cli-linux', str(h.SUPABASE))

    def test_inherited_remote_selectors_cannot_redirect_fixture(self):
        self.assertEqual(h.DOCKER, ['docker', '--host', h.LOCAL_ENDPOINT])
        self.assertEqual(h.LOCAL_ENV['DOCKER_HOST'], h.LOCAL_ENDPOINT)
        for key in ('DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 'SUPABASE_ACCESS_TOKEN', 'PGPASSWORD'):
            self.assertNotIn(key, h.LOCAL_ENV)

    @unittest.skipIf(os.name == 'nt', 'Linux socket guard')
    def test_missing_socket_refuses_before_running_docker(self):
        with patch.object(Path, 'is_socket', return_value=False), patch.object(h, 'docker') as docker:
            with self.assertRaisesRegex(RuntimeError, 'explicit local Docker Unix socket'):
                h.require_local_docker(ROOT)
            docker.assert_not_called()

    @unittest.skipIf(os.name == 'nt', 'Linux socket guard')
    def test_only_local_socket_health_check_is_run(self):
        with patch.object(Path, 'is_socket', return_value=True), patch.object(h, 'docker') as docker:
            h.require_local_docker(ROOT)
            docker.assert_called_once_with(['version', '--format', '{{.Server.Version}}'], cwd=ROOT, timeout=20)

    def test_remote_or_broadened_port_binding_is_still_refused(self):
        for host in ('0.0.0.0', '::', '192.0.2.1'):
            with self.assertRaisesRegex(RuntimeError, 'loopback-only'):
                h.assert_loopback({'bindings': {'5432/tcp': [{'HostIp': host, 'HostPort': '45123'}]}}, 45123)

    def test_unknown_create_outcome_never_reports_successful_cleanup(self):
        with tempfile.TemporaryDirectory() as temp:
            workdir = Path(temp)
            (workdir / 'create-started').touch()
            with patch.object(h, 'owned', return_value=True), patch.object(h, 'docker', return_value=''), patch.object(h.shutil, 'rmtree') as remove:
                with self.assertRaisesRegex(RuntimeError, 'creation outcome is unknown'):
                    h.cleanup(workdir, 'hcb-test', 'sha256:test')
                remove.assert_not_called()


if __name__ == '__main__':
    unittest.main()
