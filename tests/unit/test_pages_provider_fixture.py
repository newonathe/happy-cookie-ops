"""Focused static and simulated guards for the private MP-08n.1 provider fixture."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "test-pages-provider-fixture.py"
SPEC = importlib.util.spec_from_file_location("pages_provider_fixture", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
p = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(p)


class PagesProviderFixtureGuards(unittest.TestCase):
    def test_token_is_hs256_service_role_and_does_not_echo_secret(self):
        token = p.service_token("x" * 32)
        self.assertEqual(len(token.split(".")), 3)
        self.assertNotIn("x" * 32, token)

    def test_source_keeps_private_targets_and_no_publish_or_config_surface(self):
        source = SCRIPT.read_text(encoding="utf-8").lower()
        for forbidden in ("--publish", "-p ", "bind mount", "supabase start", "config.env", "argparse", "http://outside"):
            self.assertNotIn(forbidden, source)
        self.assertIn("postgrest/postgrest:v14.16", source)
        self.assertIn("run_fixture(callback", source)
        self.assertIn("cleanup_postgrest(pair)", source)

    def test_private_rpc_refuses_invalid_target_before_subprocess(self):
        pair = {"postgrest_name": "Bad_Target", "db_id": "a" * 64, "cwd": ROOT}
        with patch.object(p.subprocess, "run") as run:
            with self.assertRaises(RuntimeError):
                p.private_rpc(pair, None)
            run.assert_not_called()

    def test_postgrest_cleanup_refuses_uncertain_claim_set(self):
        with tempfile.TemporaryDirectory() as workdir:
            pair = {"postgrest_id": "p" * 64, "postgrest_name": "hcb-auth-postgrest-run", "postgrest_image": p.POSTGREST_ID,
                    "cwd": ROOT, "run_id": "run", "network_id": "n" * 64, "network_name": "hcb-auth-run",
                    "db_id": "d" * 64, "auth_id": "a" * 64, "workdir": Path(workdir)}
            with patch.object(p.h, "docker", return_value=pair["postgrest_id"]):
                with self.assertRaises(RuntimeError):
                    p.cleanup_postgrest(pair)
            self.assertTrue((Path(workdir) / "retain-resources").is_file())


if __name__ == "__main__":
    unittest.main()
