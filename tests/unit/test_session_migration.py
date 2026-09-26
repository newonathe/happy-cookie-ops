"""Static fail-closed guards for the MP-08j private durable-session migration."""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260101002300_private_bff_sessions.sql"


class SessionMigrationContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql = MIGRATION.read_text(encoding="utf-8").lower()

    def test_private_table_has_required_boundary_and_lifecycle_shape(self):
        self.assertEqual(self.sql.count("create table hco_private.bff_sessions"), 1)
        for fragment in (
            "create schema hco_private authorization postgres",
            "alter table hco_private.bff_sessions enable row level security",
            "revoke all on table hco_private.bff_sessions from public, anon, authenticated, service_role",
            "session_hash text primary key",
            "provider_session_id uuid not null unique",
            "credentials_version integer not null default 0 check (credentials_version >= 0)",
            "refresh_fence bigint not null default 0 check (refresh_fence >= 0)",
            "state text not null check (state in ('active', 'revoked'))",
            "cleanup_state text not null check (cleanup_state in ('not_required', 'pending', 'complete'))",
            "absolute_expires_at = created_at + interval '8 hours'",
            "refresh_lease_until is null or refresh_lease_until <= absolute_expires_at",
            "create index bff_sessions_cleanup_idx",
            "where cleanup_state <> 'complete'",
        ):
            self.assertIn(fragment, self.sql)
        self.assertRegex(self.sql, r"session_hash operator\(pg_catalog\.~\) '\^\[a-f0-9\]\{64\}\$'")
        self.assertRegex(self.sql, r"csrf_token operator\(pg_catalog\.~\) '\^\[a-za-z0-9_-\]\{43\}\$'")
        self.assertNotIn("create policy", self.sql)

    def test_exact_service_only_definer_function_surface(self):
        signatures = (
            "bff_session_create(\n  p_session_hash text,\n  p_csrf_token text,\n  p_user_id uuid,\n  p_provider_session_id uuid,\n  p_credential_envelope text\n)",
            "bff_session_read(p_session_hash text)",
            "bff_session_acquire_refresh(p_session_hash text)",
            "bff_session_finalize_refresh(\n  p_session_hash text,\n  p_refresh_fence bigint,\n  p_user_id uuid,\n  p_provider_session_id uuid,\n  p_next_credentials_version integer,\n  p_credential_envelope text\n)",
            "bff_session_begin_revoke(p_session_hash text)",
            "bff_session_claim_cleanup(p_limit integer)",
            "bff_session_complete_cleanup(\n  p_session_hash text,\n  p_refresh_fence bigint\n)",
        )
        self.assertEqual(len(re.findall(r"create or replace function public\.bff_session_", self.sql)), 7)
        for signature in signatures:
            self.assertIn(signature, self.sql)
        self.assertEqual(self.sql.count("security definer set search_path = ''"), 7)
        self.assertEqual(self.sql.count("owner to postgres"), 7)
        for name in (
            "bff_session_create(text, text, uuid, uuid, text)",
            "bff_session_read(text)",
            "bff_session_acquire_refresh(text)",
            "bff_session_finalize_refresh(text, bigint, uuid, uuid, integer, text)",
            "bff_session_begin_revoke(text)",
            "bff_session_claim_cleanup(integer)",
            "bff_session_complete_cleanup(text, bigint)",
        ):
            self.assertIn(f"revoke all on function public.{name} from public, anon, authenticated, service_role", self.sql)
            self.assertIn(f"grant execute on function public.{name} to service_role", self.sql)

    def test_source_keeps_crypto_and_provider_checks_narrow(self):
        self.assertNotRegex(self.sql, r"\b(access|refresh)[_ ]token\b")
        self.assertNotRegex(self.sql, r"\b(insert\s+into|update|delete\s+from|truncate|alter)\s+auth\.")
        self.assertNotRegex(self.sql, r"\b(grant|revoke)\b[^;]*\bon\s+(?:table|schema|function)\s+auth\.")
        self.assertEqual(self.sql.count("auth.sessions as provider_session"), 4)
        self.assertIn("provider_session.user_id", self.sql)
        self.assertGreaterEqual(self.sql.count("v_provider_not_after is not null and v_provider_not_after <= v_now"), 4)
        self.assertEqual(self.sql.count("for share of profile, provider_session"), 4)
        self.assertEqual(self.sql.count("pg_catalog.clock_timestamp()"), 8)
        self.assertIn("interval '30 seconds'", self.sql)
        self.assertIn("v_session.credentials_version + 1 <> p_next_credentials_version", self.sql)
        self.assertIn("refresh_lease_until = null", self.sql)
        self.assertIn("credential_envelope = null", self.sql)
        for name in ("bff_session_read", "bff_session_acquire_refresh", "bff_session_finalize_refresh"):
            block = re.search(rf"create or replace function public\.{name}.*?\n\$\$;", self.sql, re.S)
            self.assertIsNotNone(block)
            self.assertIn("for share of profile, provider_session", block.group(0))
            self.assertIn("or not v_authority_found", block.group(0))
            self.assertIn("update hco_private.bff_sessions set state = 'revoked'", block.group(0))
        self.assertGreaterEqual(self.sql.count("cleanup_state = 'pending', cleanup_attempted_at = null"), 3)
        self.assertIn("v_session.state = 'revoked' and v_session.cleanup_state = 'pending'", self.sql)
        self.assertIn("update hco_private.bff_sessions set cleanup_attempted_at = v_now", self.sql)
        self.assertIn("for update skip locked", self.sql)
        self.assertIn("p_limit < 1 or p_limit > 50", self.sql)
        self.assertEqual(self.sql.count("pg_catalog.floor(extract(epoch from"), 3)

        for name in ("bff_session_read", "bff_session_acquire_refresh", "bff_session_finalize_refresh"):
            block = re.search(rf"create or replace function public\.{name}.*?\n\$\$;", self.sql, re.S).group(0)
            self.assertLess(block.index("for update"), block.index("for share of profile, provider_session"))
            self.assertLess(block.index("for share of profile, provider_session"), block.index("v_now := pg_catalog.clock_timestamp()"))
        cleanup = re.search(r"create or replace function public\.bff_session_claim_cleanup.*?\n\$\$;", self.sql, re.S).group(0)
        self.assertLess(cleanup.index("for update skip locked"), cleanup.index("v_claimed_at := pg_catalog.clock_timestamp()"))

    def test_projections_do_not_expose_envelope_except_internal_acquire_and_revoke(self):
        read = re.search(r"create or replace function public\.bff_session_read.*?\n\$\$;", self.sql, re.S)
        finalize = re.search(r"create or replace function public\.bff_session_finalize_refresh.*?\n\$\$;", self.sql, re.S)
        self.assertIsNotNone(read)
        self.assertIsNotNone(finalize)
        self.assertNotIn("credential_envelope", read.group(0).split("returns table", 1)[1].split("language", 1)[0])
        self.assertNotIn("credential_envelope", finalize.group(0).split("returns table", 1)[1].split("language", 1)[0])
        for name in ("bff_session_acquire_refresh", "bff_session_begin_revoke"):
            block = re.search(rf"create or replace function public\.{name}.*?\n\$\$;", self.sql, re.S)
            self.assertIsNotNone(block)
            self.assertIn("p_credential_envelope text", block.group(0).split("returns table", 1)[1].split("language", 1)[0])


if __name__ == "__main__":
    unittest.main()
