"""Fail-closed guards for the local-only MP-08j repository acceptance runner."""
import importlib.util
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "test-session-repository.py"
SPEC = importlib.util.spec_from_file_location("session_repository", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)


class SessionRepositoryGuards(unittest.TestCase):
    def test_arguments_are_rejected_before_import_docker_or_fixture_creation(self):
        with patch.object(sys, "argv", ["runner", "--host=outside"]), \
                patch.object(r.h, "require_local_docker") as docker, \
                patch.object(r, "run_pair") as pair:
            with self.assertRaisesRegex(RuntimeError, "accepts no"):
                r.main()
        docker.assert_not_called(); pair.assert_not_called()

    def test_fixed_owned_helpers_and_repository_migration_are_the_only_targets(self):
        self.assertEqual(r.FIXTURE_PATH, ROOT / "scripts" / "test-auth-fixture.py")
        self.assertEqual(r.HTTP_FIXTURE_PATH, ROOT / "scripts" / "test-auth-http-fixture.py")
        self.assertEqual(r.MIGRATION, ROOT / "supabase/migrations/20260101002300_private_bff_sessions.sql")
        self.assertEqual(r.RPCS, (
            "bff_session_create", "bff_session_read", "bff_session_acquire_refresh", "bff_session_finalize_refresh",
            "bff_session_begin_revoke", "bff_session_claim_cleanup", "bff_session_complete_cleanup"))

    def test_runner_source_has_no_host_publish_bind_mount_or_arbitrary_target_surface(self):
        source = SCRIPT.read_text(encoding="utf-8").lower()
        for forbidden in ("--publish", "-p ", "bind mount", "supabase start", "config.env", "http://outside", "argparse"):
            self.assertNotIn(forbidden, source)
        self.assertIn("h.create_pair", source); self.assertIn("h.cleanup(pair)", source)

    def test_redaction_removes_common_sensitive_shapes(self):
        message = "ERROR postgres://user:password@host/db eyJabc.def.ghi 00000000-0000-4000-8000-000000000001 " + "a" * 64
        safe = r.redact(message)
        self.assertNotIn("postgres://", safe); self.assertNotIn("eyJabc", safe)
        self.assertNotIn("00000000-0000", safe); self.assertNotIn("a" * 64, safe)

    def test_required_scenario_inventory_includes_lifecycle_cleanup_and_real_races(self):
        required = {"authority_surface", "create_read_expiry", "create_input_and_binding_denials", "refresh_fencing",
                    "revoke_cleanup_fence", "claim_cleanup", "fair_claim_order", "concurrent_acquire", "concurrent_revoke_finalize",
                    "concurrent_profile_deactivate_finalize", "concurrent_provider_delete_finalize", "concurrent_stale_clock_boundary"}
        self.assertEqual(set(r.SCENARIOS), required)
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("subprocess.Popen", source)
        self.assertIn("for update", source.lower())
        self.assertIn("readline().strip()", source)
        self.assertIn("pg_sleep(2)", source)
        self.assertIn('"exact_expiry"', source)
        self.assertIn("committed refresh was partial after a simulated lost response", source)
        self.assertIn('{"owner": user_id, "helper": helper_id, "support": support_id}', source)
        self.assertIn("provider session bound to another real user was accepted", source)
        self.assertIn("cleanup claim selected the wrong candidate set", source)

    def test_private_mutation_is_limited_to_named_clock_setups_and_cleanup_stays_owned(self):
        with self.assertRaises(RuntimeError):
            r.controlled_clock_setup({}, "0" * 64, "arbitrary")
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn("h.empty_pair", source); self.assertIn("h.cleanup(pair)", source)
        self.assertIn("controlled_clock_setups", source)
        self.assertIn("def reap_processes", source)
        self.assertGreaterEqual(source.count("finally:\n        reap_processes"), 2)


if __name__ == "__main__":
    unittest.main()
