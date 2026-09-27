#!/usr/bin/env python3
"""Exercise MP-08o.2 cleanup RPCs on one owned private Auth/Postgres pair."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("fixed_fixture_missing")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


r = load("session_repository_fixture", ROOT / "scripts/test-session-repository.py")
h = r.h
RECOVERY_MIGRATION = ROOT / "supabase/migrations/20260101002400_bff_cleanup_recovery.sql"
FINAL_MIGRATION = ROOT / "supabase/migrations/20260101002500_bff_cleanup_fair_claims.sql"
LATEST_MIGRATION = ROOT / "supabase/migrations/20260101002700_function_default_privileges.sql"
RPCS = ("bff_session_save_cleanup_rotation", "bff_session_complete_if_provider_absent")


def fail(reason: str) -> None:
    raise RuntimeError(reason)


def save_statement(session_hash: str, fence: str, user: str, provider: str,
                   current: int, next_version: int, material: str) -> str:
    return "select * from public.bff_session_save_cleanup_rotation(" + ", ".join((
        r.q(session_hash), fence, r.q(user) + "::uuid", r.q(provider) + "::uuid",
        str(current), str(next_version), r.q(material))) + ")"


def save(pair: dict, session_hash: str, fence: str, user: str, provider: str,
         current: int, next_version: int, material: str, role: str = "service_role") -> str:
    return r.sql(pair, save_statement(session_hash, fence, user, provider,
                                      current, next_version, material), role=role).strip()


def assert_concurrent_save(pair: dict, statement: str) -> None:
    leader: subprocess.Popen | None = None
    follower: subprocess.Popen | None = None
    try:
        leader = r.psql_process(pair, statement)
        assert leader.stdin is not None and leader.stdout is not None
        leader.stdin.write("begin; set local statement_timeout='12s'; set local role service_role; "
                           "with accepted as (" + statement + ") "
                           "select 'leader_ready' from accepted where p_saved_credentials_version=1; "
                           "select pg_sleep(5); commit;")
        leader.stdin.close()
        if leader.stdout.readline().strip() != "leader_ready":
            fail("concurrent_save_leader_not_ready")
        follower = r.psql_process(pair, statement)
        assert follower.stdin is not None and follower.stdout is not None
        follower.stdin.write("begin; set local statement_timeout='12s'; set local role service_role; "
                             "select 'follower_ready:' || pg_backend_pid(); " + statement + "; commit;")
        follower.stdin.close()
        ready = follower.stdout.readline().strip()
        if not ready.startswith("follower_ready:") or not ready.removeprefix("follower_ready:").isdigit():
            fail("concurrent_save_follower_not_ready")
        pid = ready.removeprefix("follower_ready:")
        blocked = False
        until = time.monotonic() + 3
        while time.monotonic() < until and leader.poll() is None:
            if r.sql(pair, "select wait_event_type from pg_stat_activity where pid=" + pid).strip() == "Lock":
                blocked = True
                break
            time.sleep(0.05)
        if not blocked:
            fail("concurrent_save_lock_overlap_not_observed")
        leader.wait(timeout=12)
        follower.wait(timeout=12)
        leader_tail = leader.stdout.read()
        follower_tail = follower.stdout.read()
        leader_error = leader.stderr.read() if leader.stderr is not None else ""
        follower_error = follower.stderr.read() if follower.stderr is not None else ""
        if leader.returncode != 0 or follower.returncode != 0 or leader_error or follower_error:
            fail("concurrent_save_worker_failed")
        if leader_tail.strip() or follower_tail.strip():
            fail("concurrent_save_cas_result")
    finally:
        r.reap_processes(leader, follower)


def absent(pair: dict, session_hash: str, fence: str, user: str, provider: str,
           role: str = "service_role") -> str:
    statement = "select * from public.bff_session_complete_if_provider_absent(" + ", ".join((
        r.q(session_hash), fence, r.q(user) + "::uuid", r.q(provider) + "::uuid")) + ")"
    return r.sql(pair, statement, role=role).strip()


def require_empty(value: str, reason: str) -> None:
    if value:
        fail(reason)


def assert_roles(pair: dict, session_hash: str, fence: str, user: str,
                 provider: str, material: str) -> None:
    for name in RPCS:
        acl = r.sql(pair, "select proacl::text from pg_proc where oid = "
                    + r.q("public." + name) + "::regproc").strip()
        if "service_role=X/postgres" not in acl or "anon=" in acl or "authenticated=" in acl:
            fail("rpc_acl")
    for role in ("anon", "authenticated"):
        for operation in (
            lambda: save(pair, session_hash, fence, user, provider, 0, 1, material, role),
            lambda: absent(pair, session_hash, fence, user, provider, role),
        ):
            try:
                operation()
            except RuntimeError as error:
                if "permission denied" not in str(error).lower():
                    fail("unexpected_rpc_role_error")
            else:
                fail("application_role_executed_cleanup_rpc")


def live_probe() -> dict:
    pins = h.source_pins()
    inputs = h.migration_inputs(pins)
    if (len(inputs) != len(pins["migrations"]) or inputs[-1][0] != LATEST_MIGRATION.name or
            not {RECOVERY_MIGRATION.name, FINAL_MIGRATION.name}.issubset({name for name, _content, _digest in inputs})):
        fail("migration_pin_count")
    pair = h.empty_pair(1)
    try:
        h.create_pair(pair, synthetic_signup=True)
        h.wait_for_auth(pair["auth_id"], pair["db_id"], pair["cwd"], pair["password"])
        auth_digest = h.auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"])
        for _name, content, digest in inputs:
            if hashlib.sha256(content).hexdigest() != digest:
                fail("migration_changed_after_pin")
            h.psql(pair["db_id"], pair["cwd"], pair["password"], content.decode("utf-8"))
        if h.auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"]) != auth_digest:
            fail("managed_auth_schema_changed")
        preflight = h.PREFLIGHT.read_bytes()
        if hashlib.sha256(preflight).hexdigest() != pins["preflight_sha256"]:
            fail("managed_auth_preflight_changed")
        h.parse_preflight(h.psql(pair["db_id"], pair["cwd"], pair["password"],
                                   preflight.decode("utf-8")))
        if h.psql(pair["db_id"], pair["cwd"], pair["password"], h.DEMO_COUNTS).splitlines() != [
                "event_sale_items:0", "event_sales:0", "ledger_entries:0", "order_items:0", "orders:0"]:
            fail("commercial_rows_present")

        user, provider, session_hash, _csrf, _old = r.new_bound_row(pair)
        other_user, other_provider = r.synthetic_binding(pair)
        material = r.envelope("rotated")
        require_empty(save(pair, session_hash, "0", user, provider, 0, 1, material),
                      "active_row_rotation_accepted")
        claim = r.service(pair, "select * from public.bff_session_begin_revoke(" + r.q(session_hash) + ")").strip().split("\t")
        if len(claim) != 5 or claim[0] != user or claim[1] != provider or claim[3] != "0":
            fail("revoke_claim_shape")
        fence = claim[4]
        assert_roles(pair, session_hash, fence, user, provider, material)
        for args in (
            ("0", user, provider, 0, 1),
            (fence, other_user, provider, 0, 1),
            (fence, user, other_provider, 0, 1),
            (fence, user, provider, 1, 2),
            (fence, user, provider, 0, 2),
        ):
            require_empty(save(pair, session_hash, *args, material), "invalid_rotation_accepted")
        statement = save_statement(session_hash, fence, user, provider, 0, 1, material)
        assert_concurrent_save(pair, statement)
        result_type = r.sql(pair, "select pg_get_function_result(" +
                            r.q("public.bff_session_save_cleanup_rotation") +
                            "::regproc)").strip().lower()
        if "credential_envelope" in result_type or "access_token" in result_type or "refresh_token" in result_type:
            fail("rotation_rpc_return_contract_discloses_credentials")
        require_empty(save(pair, session_hash, fence, user, provider, 0, 1, r.envelope("stale")),
                      "stale_rotation_overwrote_current")
        stored = r.sql(pair, "select credentials_version, credential_envelope from hco_private.bff_sessions where session_hash = "
                       + r.q(session_hash)).strip().split("\t")
        if stored != ["1", material]:
            fail("rotated_envelope_not_durable")

        for args in (("0", user, provider), (fence, other_user, provider),
                     (fence, user, other_provider), (fence, user, provider)):
            require_empty(absent(pair, session_hash, *args), "present_provider_session_cleared")
        # A managed row with the same session ID but a different user is PRESENT.
        r.sql(pair, "update auth.sessions set user_id = " + r.q(other_user)
              + "::uuid where id = " + r.q(provider) + "::uuid")
        if r.sql(pair, "select count(*) from auth.sessions where id = " + r.q(provider)
                 + "::uuid and user_id = " + r.q(other_user) + "::uuid").strip() != "1":
            fail("wrong_user_auth_row_not_constructed")
        try:
            absent(pair, session_hash, fence, user, provider)
        except RuntimeError as error:
            if "provider_session_binding_mismatch" not in str(error):
                fail("wrong_user_auth_row_error_not_static")
        else:
            fail("wrong_user_auth_row_not_flagged")
        r.sql(pair, "delete from auth.sessions where id = " + r.q(provider) + "::uuid")
        completion = absent(pair, session_hash, fence, user, provider)
        if not completion or completion.count("\n") or completion.count("\t"):
            fail("absent_provider_session_not_completed")
        state = r.sql(pair, "select state, cleanup_state, credential_envelope is null, credentials_version "
                      "from hco_private.bff_sessions where session_hash = " + r.q(session_hash)).strip().split("\t")
        if state != ["revoked", "complete", "t", "1"]:
            fail("completion_state_or_envelope_wrong")
        require_empty(absent(pair, session_hash, fence, user, provider), "completed_row_replayed")
        return {"status": "PASS", "migration_count": len(pins["migrations"]), "role_denials": 4,
                "rotation_cas": True, "concurrent_rotation_cas": True,
                "opaque_envelope_not_returned": True,
                "present_and_wrong_user_auth_rows_retained": True,
                "wrong_user_binding_flagged": True,
                "absence_completed_once": True, "managed_auth_schema_unchanged": True,
                "commercial_rows": 0, "private_network": True, "published_host_ports": 0}
    finally:
        h.cleanup(pair)
        if pair["workdir"].exists() or h.docker(["ps", "-aq", "--filter", f"label={h.LABEL}={pair['run_id']}"], cwd=ROOT, timeout=20).strip() or h.docker(["network", "ls", "-q", "--filter", f"label={h.LABEL}={pair['run_id']}"], cwd=ROOT, timeout=20).strip():
            fail("owned_resource_remains")


def main() -> int:
    if len(sys.argv) != 1:
        fail("arguments_not_allowed")
    h.require_local_docker(ROOT)
    print(json.dumps(live_probe(), sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "FAIL", "reason": r.redact(str(error))}, sort_keys=True))
        raise SystemExit(1)
