#!/usr/bin/env python3
"""Local-only acceptance runner for the private durable-session repository.

The runner deliberately imports the MP-08g/MP-08i fixtures for container
creation, private HTTP, source pins, and exact cleanup.  It accepts no input
and emits only stable scenario receipts and reviewed source hashes.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import re
import secrets
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_PATH = ROOT / "scripts" / "test-auth-fixture.py"
HTTP_FIXTURE_PATH = ROOT / "scripts" / "test-auth-http-fixture.py"
MIGRATION = ROOT / "supabase" / "migrations" / "20260101002300_private_bff_sessions.sql"
RPCS = (
    "bff_session_create", "bff_session_read", "bff_session_acquire_refresh",
    "bff_session_finalize_refresh", "bff_session_begin_revoke",
    "bff_session_claim_cleanup", "bff_session_complete_cleanup",
)
SCENARIOS = (
    "authority_surface", "create_read_expiry", "create_input_and_binding_denials",
    "refresh_fencing", "revoke_cleanup_fence", "claim_cleanup", "fair_claim_order", "concurrent_acquire",
    "concurrent_revoke_finalize", "concurrent_profile_deactivate_finalize",
    "concurrent_provider_delete_finalize", "concurrent_stale_clock_boundary",
)
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("owned fixture loader is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


h = _load("mp08j_auth_fixture", FIXTURE_PATH)
http_fixture = _load("mp08j_auth_http_fixture", HTTP_FIXTURE_PATH)


def fail(message: str) -> None:
    raise RuntimeError(message)


def redact(value: str) -> str:
    """Never turn an implementation exception into an identifier/token receipt."""
    value = h.safe_error(value)
    value = re.sub(r"(?i)\b[0-9a-f]{64}\b", "[redacted-hash]", value)
    value = re.sub(r"(?i)\b[0-9a-f]{8}-[0-9a-f-]{27,}\b", "[redacted-id]", value)
    value = re.sub(r"(?i)\b(?:eyJ|sealed-|ciphertext-)[A-Za-z0-9_.:-]+", "[redacted-secret]", value)
    value = re.sub(r"[A-Za-z0-9_-]{43,}", "[redacted-value]", value)
    return value[:300]


def q(value: str) -> str:
    """Quote generated-only fixture values; no caller supplies SQL input."""
    return "'" + value.replace("'", "''") + "'"


def fresh_hash(label: str) -> str:
    return hashlib.sha256((label + secrets.token_hex(24)).encode("ascii")).hexdigest()


def fresh_csrf() -> str:
    # 32 bytes in unpadded base64url is exactly the migration's 43-character shape.
    return secrets.token_urlsafe(32)


def envelope(label: str) -> str:
    # This is non-provider synthetic ciphertext-shaped fixture material, never plaintext.
    return "sealed-v1:" + label + ":" + secrets.token_urlsafe(24)


def sql(pair: dict, statement: str, *, role: str | None = None) -> str:
    prefix = "begin; set local statement_timeout = '12s'; set local lock_timeout = '8s'; "
    if role is not None:
        if role not in {"anon", "authenticated", "service_role"}:
            fail("fixture SQL role is outside the reviewed allowlist")
        prefix += "set local role " + role + "; "
    return h.psql(pair["db_id"], pair["cwd"], pair["password"], prefix + statement + "; commit;")


def service(pair: dict, statement: str) -> str:
    return sql(pair, statement, role="service_role")


def require_count(value: str, expected: int, message: str) -> None:
    if value.strip() != str(expected):
        fail(message)


def no_rows(value: str, message: str) -> None:
    if value.strip():
        fail(message)


def activate_profile(pair: dict, user_id: str, *, role: str = "owner", active: bool = True) -> None:
    if not UUID.fullmatch(user_id):
        fail("provider principal shape differs")
    if role not in {"owner", "helper", "support"}:
        fail("fixture profile role is outside the application allowlist")
    sql(pair, "insert into public.profiles (id, role, display_name, active) values (" + q(user_id)
        + "::uuid, " + q(role) + "::public.app_role, 'fixture staff', " + ("true" if active else "false")
        + ") on conflict (id) do update set role = excluded.role, active = excluded.active")


def synthetic_binding(pair: dict, *, role: str = "owner") -> tuple[str, str]:
    email = "fixture-" + secrets.token_hex(12) + "@example.test"
    password = secrets.token_urlsafe(30)
    status, _signup = http_fixture.http(pair, "/signup", body={"email": email, "password": password})
    if status != 200:
        fail("synthetic signup was not accepted")
    status, response = http_fixture.http(pair, "/token?grant_type=password", body={"email": email, "password": password})
    if status != 200:
        fail("synthetic login was not accepted")
    access, _refresh, user_id = http_fixture.token_result(response)
    verified_status, verified = http_fixture.http(pair, "/user", access_token=access)
    principal, provider_session = http_fixture.session_claims(access)
    if verified_status != 200 or not isinstance(verified, dict) or verified.get("id") != user_id or principal != user_id:
        fail("synthetic provider binding could not be confirmed")
    if http_fixture.count_bound_session(pair, user_id, provider_session) != 1:
        fail("synthetic provider session binding differs")
    activate_profile(pair, user_id, role=role)
    return user_id, provider_session


def create(pair: dict, user_id: str, provider_session: str, *, session_hash: str | None = None,
           csrf: str | None = None, material: str | None = None) -> tuple[str, str, str]:
    session_hash, csrf, material = session_hash or fresh_hash("session"), csrf or fresh_csrf(), material or envelope("create")
    out = service(pair, "select * from public.bff_session_create(" + q(session_hash) + ", " + q(csrf)
                  + ", " + q(user_id) + "::uuid, " + q(provider_session) + "::uuid, " + q(material) + ")")
    parts = out.strip().split("\t") if out.strip() else []
    if len(parts) != 3 or parts[0] != "owner" or parts[1] != csrf or not parts[2].isdigit():
        fail("session create returned an unsafe or unexpected projection")
    return session_hash, csrf, material


def create_row(pair: dict, user_id: str, provider_session: str) -> tuple[str, str, str]:
    """The sole normal creation path: create RPC after a real provider binding."""
    return create(pair, user_id, provider_session)


def new_bound_row(pair: dict) -> tuple[str, str, str, str, str]:
    """A provider session is unique by contract, so every independent row gets one."""
    user_id, provider_session = synthetic_binding(pair)
    session_hash, csrf, material = create_row(pair, user_id, provider_session)
    return user_id, provider_session, session_hash, csrf, material


def complete_pending_cleanup(pair: dict, session_hash: str, message: str) -> None:
    claim = service(pair, "select * from public.bff_session_begin_revoke(" + q(session_hash) + ")").strip().split("\t")
    if len(claim) != 5 or not service(pair, "select * from public.bff_session_complete_cleanup("
            + q(session_hash) + ", " + claim[-1] + ")").strip():
        fail(message)


def controlled_clock_setup(pair: dict, session_hash: str, fragment: str) -> None:
    """Private mutation is restricted to time/race setup named in the final receipt."""
    if fragment not in {"exact_expiry", "expired_active", "expired_lease", "retry_fence", "pending_unclaimed", "expired_attempt", "fair_pending_waiting"}:
        fail("private setup is outside the exact time-boundary allowlist")
    if fragment == "exact_expiry":
        update = "created_at = statement_timestamp() - interval '8 hours', absolute_expires_at = statement_timestamp()"
    elif fragment == "expired_active":
        update = "created_at = statement_timestamp() - interval '8 hours 1 second', absolute_expires_at = statement_timestamp() - interval '1 second'"
    elif fragment == "expired_lease":
        update = "refresh_lease_until = clock_timestamp() - interval '1 second'"
    elif fragment == "retry_fence":
        update = "cleanup_attempted_at = clock_timestamp() - interval '31 seconds'"
    elif fragment == "pending_unclaimed":
        update = "cleanup_attempted_at = null"
    elif fragment == "fair_pending_waiting":
        update = ("created_at = statement_timestamp() - interval '2 minutes', "
                  "absolute_expires_at = statement_timestamp() + interval '7 hours 58 minutes', "
                  "revoked_at = statement_timestamp() - interval '2 minutes', cleanup_attempted_at = null")
    else:
        update = "cleanup_attempted_at = clock_timestamp() - interval '31 seconds'"
    sql(pair, "update hco_private.bff_sessions set " + update + " where session_hash = " + q(session_hash))


def assert_authority(pair: dict, principals: dict[str, str]) -> None:
    # grantee 0 is PostgreSQL's PUBLIC pseudo-role; this avoids mistaking the
    # postgres owner connection for an application-facing authorization check.
    require_count(sql(pair, "select count(*) from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a where n.nspname='hco_private' and a.grantee=0 and a.privilege_type='USAGE'"),
                  0, "PUBLIC retained private schema usage")
    require_count(sql(pair, "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where n.nspname='hco_private' and c.relname='bff_sessions' and a.grantee=0"),
                  0, "PUBLIC retained private table access")
    for role in ("anon", "authenticated", "service_role"):
        for target in ("select 1 from hco_private.bff_sessions limit 1", "select * from hco_private.bff_sessions limit 1"):
            try:
                sql(pair, target, role=role)
            except RuntimeError as error:
                if "permission denied" not in str(error).lower():
                    raise
                continue
            fail("private schema/table direct access was granted")
    for name, call in rpc_calls().items():
        try:
            sql(pair, call, role="anon")
        except RuntimeError as error:
            if "permission denied for function" not in str(error).lower():
                raise
        else:
            fail("anonymous role executed private RPC")
        for app_role, principal in principals.items():
            if app_role not in {"owner", "helper", "support"} or not UUID.fullmatch(principal):
                fail("authority principal inventory differs")
            try:
                sql(pair, "select set_config('request.jwt.claim.sub', " + q(principal) + ", true); " + call,
                    role="authenticated")
            except RuntimeError as error:
                if "permission denied for function" not in str(error).lower():
                    raise
                continue
            fail("authenticated application profile executed private RPC directly")
    for call in rpc_calls().values():
        # Empty input is intentionally harmless; success here proves EXECUTE only.
        service(pair, call)


def rpc_calls() -> dict[str, str]:
    hash_value, csrf, uid, sid = "0" * 64, "A" * 43, "00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"
    return {
        "bff_session_create": "select * from public.bff_session_create(" + q(hash_value) + ", " + q(csrf) + ", " + q(uid) + "::uuid, " + q(sid) + "::uuid, 'sealed')",
        "bff_session_read": "select * from public.bff_session_read(" + q(hash_value) + ")",
        "bff_session_acquire_refresh": "select * from public.bff_session_acquire_refresh(" + q(hash_value) + ")",
        "bff_session_finalize_refresh": "select * from public.bff_session_finalize_refresh(" + q(hash_value) + ", 0, " + q(uid) + "::uuid, " + q(sid) + "::uuid, 1, 'sealed')",
        "bff_session_begin_revoke": "select * from public.bff_session_begin_revoke(" + q(hash_value) + ")",
        "bff_session_claim_cleanup": "select * from public.bff_session_claim_cleanup(1)",
        "bff_session_complete_cleanup": "select * from public.bff_session_complete_cleanup(" + q(hash_value) + ", 0)",
    }


def assert_create_read(pair: dict, user_id: str, provider_session: str) -> None:
    session_hash, csrf, material = create_row(pair, user_id, provider_session)
    read = service(pair, "select * from public.bff_session_read(" + q(session_hash) + ")").strip().split("\t")
    if len(read) != 4 or read[0] != user_id or read[1] != "owner" or read[2] != csrf or not read[3].isdigit():
        fail("read projection differs or exposes unsafe fields")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash = " + q(session_hash)
                      + " and absolute_expires_at = created_at + interval '8 hours'"), 1, "DB eight-hour expiry relation differs")
    no_rows(service(pair, "select * from public.bff_session_create(" + q(session_hash) + ", " + q(fresh_csrf())
                    + ", " + q(user_id) + "::uuid, " + q(provider_session) + "::uuid, " + q(envelope("duplicate")) + ")"),
            "duplicate session hash was accepted")
    no_rows(service(pair, "select * from public.bff_session_create(" + q(fresh_hash("provider-duplicate")) + ", " + q(fresh_csrf())
                    + ", " + q(user_id) + "::uuid, " + q(provider_session) + "::uuid, " + q(envelope("duplicate")) + ")"),
            "duplicate provider session was accepted")
    if material in read:
        fail("credential envelope escaped read projection")
    _expiry_user, _expiry_provider, expiry_hash, _expiry_csrf, _expiry_material = new_bound_row(pair)
    controlled_clock_setup(pair, expiry_hash, "exact_expiry")
    no_rows(service(pair, "select * from public.bff_session_read(" + q(expiry_hash) + ")"), "exact expiry boundary authorized a session")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash = " + q(expiry_hash)
                      + " and state = 'revoked'"), 1, "exact expiry boundary did not revoke")
    complete_pending_cleanup(pair, expiry_hash, "exact-boundary cleanup failed")


def assert_input_binding_denials(pair: dict, user_id: str, provider_session: str) -> None:
    invalid = (
        ("bad", fresh_csrf(), envelope("bad-hash")),
        (fresh_hash("bad-csrf"), "A" * 42, envelope("bad-csrf")),
        (fresh_hash("empty-envelope"), fresh_csrf(), ""),
        (fresh_hash("large-envelope"), fresh_csrf(), "x" * 90001),
    )
    for session_hash, csrf, material in invalid:
        no_rows(service(pair, "select * from public.bff_session_create(" + q(session_hash)
                        + ", " + q(csrf) + ", " + q(user_id) + "::uuid, "
                        + q(provider_session) + "::uuid, " + q(material) + ")"),
                "malformed create input was accepted")
    missing_user, missing_session = "00000000-0000-4000-8000-000000000011", "00000000-0000-4000-8000-000000000012"
    for uid, sid in ((missing_user, provider_session), (user_id, missing_session), (missing_user, missing_session)):
        no_rows(service(pair, "select * from public.bff_session_create(" + q(fresh_hash("missing")) + ", " + q(fresh_csrf())
                        + ", " + q(uid) + "::uuid, " + q(sid) + "::uuid, " + q(envelope("missing")) + ")"),
                "missing or wrong provider binding was accepted")
    cross_user, cross_session = synthetic_binding(pair)
    no_rows(service(pair, "select * from public.bff_session_create(" + q(fresh_hash("cross-user")) + ", " + q(fresh_csrf())
                    + ", " + q(user_id) + "::uuid, " + q(cross_session) + "::uuid, " + q(envelope("cross-user")) + ")"),
            "provider session bound to another real user was accepted")
    inactive_user, inactive_session = synthetic_binding(pair)
    sql(pair, "update public.profiles set active = false where id = " + q(inactive_user) + "::uuid")
    no_rows(service(pair, "select * from public.bff_session_create(" + q(fresh_hash("inactive")) + ", " + q(fresh_csrf())
                    + ", " + q(inactive_user) + "::uuid, " + q(inactive_session) + "::uuid, " + q(envelope("inactive")) + ")"),
            "inactive profile was accepted")
    sql(pair, "update public.profiles set active = true where id = " + q(inactive_user) + "::uuid")
    future_user, future_session = synthetic_binding(pair)
    sql(pair, "update auth.sessions set not_after = clock_timestamp() + interval '5 minutes' where id = " + q(future_session) + "::uuid")
    if not service(pair, "select * from public.bff_session_create(" + q(fresh_hash("future-not-after")) + ", " + q(fresh_csrf())
                       + ", " + q(future_user) + "::uuid, " + q(future_session) + "::uuid, " + q(envelope("future-not-after")) + ")").strip():
        fail("future provider expiry was rejected")
    past_user, past_session = synthetic_binding(pair)
    sql(pair, "update auth.sessions set not_after = clock_timestamp() - interval '1 second' where id = " + q(past_session) + "::uuid")
    no_rows(service(pair, "select * from public.bff_session_create(" + q(fresh_hash("past-not-after")) + ", " + q(fresh_csrf())
                    + ", " + q(past_user) + "::uuid, " + q(past_session) + "::uuid, " + q(envelope("past-not-after")) + ")"),
            "expired provider session was accepted")
    null_user, null_session = synthetic_binding(pair)
    sql(pair, "update auth.sessions set not_after = null where id = " + q(null_session) + "::uuid")
    if not service(pair, "select * from public.bff_session_create(" + q(fresh_hash("null-not-after")) + ", " + q(fresh_csrf())
                       + ", " + q(null_user) + "::uuid, " + q(null_session) + "::uuid, " + q(envelope("null-not-after")) + ")").strip():
        fail("NULL provider expiry was rejected")
    deleted_user, deleted_provider, deleted_hash, _csrf, _material = new_bound_row(pair)
    sql(pair, "delete from public.profiles where id = " + q(deleted_user) + "::uuid")
    no_rows(service(pair, "select * from public.bff_session_read(" + q(deleted_hash) + ")"), "deleted profile retained session authority")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash = " + q(deleted_hash)
                      + " and state = 'revoked'"), 1, "deleted profile did not revoke on read")
    complete_pending_cleanup(pair, deleted_hash, "deleted-profile cleanup failed")
    recheck_user, recheck_provider, recheck_hash, _csrf, _material = new_bound_row(pair)
    sql(pair, "update auth.sessions set not_after = statement_timestamp() where id = " + q(recheck_provider) + "::uuid")
    no_rows(service(pair, "select * from public.bff_session_acquire_refresh(" + q(recheck_hash) + ")"),
            "provider expiry boundary retained refresh authority")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash = " + q(recheck_hash)
                      + " and state = 'revoked'"), 1, "provider expiry boundary did not revoke")
    complete_pending_cleanup(pair, recheck_hash, "provider-expiry cleanup failed")


def assert_refresh_and_revoke(pair: dict, user_id: str, provider_session: str) -> None:
    refresh_user, refresh_provider, session_hash, csrf, original = new_bound_row(pair)
    acquire = service(pair, "select * from public.bff_session_acquire_refresh(" + q(session_hash) + ")").strip().split("\t")
    if len(acquire) != 7 or acquire[0] != refresh_user or acquire[1] != refresh_provider or acquire[2] != original:
        fail("acquire projection differs")
    fence, next_version = acquire[5], acquire[4]
    no_rows(service(pair, "select * from public.bff_session_acquire_refresh(" + q(session_hash) + ")"), "live refresh lease was reacquired")
    no_rows(service(pair, "select * from public.bff_session_finalize_refresh(" + q(session_hash) + ", " + fence
                    + ", '00000000-0000-4000-8000-000000000099'::uuid, " + q(refresh_provider) + "::uuid, " + next_version + ", "
                    + q(envelope("wrong-binding")) + ")"), "binding substitution finalized")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash = " + q(session_hash)
                      + " and state = 'revoked' and cleanup_state = 'pending'"), 1, "wrong binding did not revoke")
    complete = service(pair, "select * from public.bff_session_begin_revoke(" + q(session_hash) + ")").strip().split("\t")
    if len(complete) != 5: fail("revoked cleanup worker was not fenced")
    cleanup_fence = complete[-1]
    if not service(pair, "select * from public.bff_session_complete_cleanup(" + q(session_hash) + ", " + cleanup_fence + ")").strip():
        fail("fence-checked cleanup completion failed")
    no_rows(service(pair, "select * from public.bff_session_complete_cleanup(" + q(session_hash) + ", " + cleanup_fence + ")"), "repeat cleanup resurrected a row")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash = " + q(session_hash)
                      + " and state = 'revoked' and cleanup_state = 'complete' and credential_envelope is null"), 1,
                  "completion left credential material or resurrected the session")
    # A normal worker commits a new envelope/version, then stale fence/version attempts fail closed.
    happy_user, happy_provider, happy, happy_csrf, _old = new_bound_row(pair)
    happy_acquire = service(pair, "select * from public.bff_session_acquire_refresh(" + q(happy) + ")").strip().split("\t")
    if len(happy_acquire) != 7: fail("happy refresh acquire did not return bounded internal material")
    happy_fence, happy_next = happy_acquire[5], happy_acquire[4]
    replacement = envelope("happy-finalize")
    no_rows(service(pair, "select * from public.bff_session_finalize_refresh(" + q(happy) + ", " + str(int(happy_fence) - 1) + ", "
                    + q(happy_user) + "::uuid, " + q(happy_provider) + "::uuid, " + happy_next + ", " + q(envelope("stale-fence")) + ")"),
            "stale refresh fence finalized")
    no_rows(service(pair, "select * from public.bff_session_finalize_refresh(" + q(happy) + ", " + happy_fence + ", "
                    + q(happy_user) + "::uuid, " + q(happy_provider) + "::uuid, " + str(int(happy_next) + 1) + ", " + q(envelope("wrong-version")) + ")"),
            "credentials-version substitution finalized")
    finalized = service(pair, "select * from public.bff_session_finalize_refresh(" + q(happy) + ", " + happy_fence + ", "
                        + q(happy_user) + "::uuid, " + q(happy_provider) + "::uuid, " + happy_next + ", " + q(replacement) + ")").strip().split("\t")
    if len(finalized) != 3 or finalized[0] != "owner" or finalized[1] != happy_csrf or not finalized[2].isdigit():
        fail("happy finalize projection differs or exposes credential material")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash = " + q(happy)
                      + " and credential_envelope = " + q(replacement) + " and credentials_version = " + happy_next
                      + " and refresh_lease_until is null"), 1, "committed refresh was partial after a simulated lost response")
    later_read = service(pair, "select * from public.bff_session_read(" + q(happy) + ")").strip().split("\t")
    if len(later_read) != 4 or later_read[0] != happy_user or later_read[1] != "owner" or later_read[2] != happy_csrf:
        fail("later read did not observe the complete committed refresh state")
    # An expired uncertain lease must revoke, never be reused.
    uncertain_user, uncertain_provider, uncertain, _csrf, _material = new_bound_row(pair)
    if not service(pair, "select * from public.bff_session_acquire_refresh(" + q(uncertain) + ")").strip():
        fail("initial uncertain lease was not acquired")
    controlled_clock_setup(pair, uncertain, "expired_lease")
    no_rows(service(pair, "select * from public.bff_session_acquire_refresh(" + q(uncertain) + ")"), "expired uncertain lease was reacquired")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash = " + q(uncertain)
                      + " and state = 'revoked'"), 1, "expired uncertain lease did not revoke")
    uncertain_cleanup = service(pair, "select * from public.bff_session_begin_revoke(" + q(uncertain) + ")").strip().split("\t")
    if len(uncertain_cleanup) != 5 or not service(pair, "select * from public.bff_session_complete_cleanup("
            + q(uncertain) + ", " + uncertain_cleanup[-1] + ")").strip():
        fail("expired uncertain lease cleanup failed")
    # Controlled 31-second setup proves retry fencing without a sleep.
    retry_user, retry_provider, retry, _csrf, _material = new_bound_row(pair)
    first = service(pair, "select * from public.bff_session_begin_revoke(" + q(retry) + ")").strip().split("\t")
    no_rows(service(pair, "select * from public.bff_session_begin_revoke(" + q(retry) + ")"), "live cleanup worker was duplicated")
    controlled_clock_setup(pair, retry, "retry_fence")
    second = service(pair, "select * from public.bff_session_begin_revoke(" + q(retry) + ")").strip().split("\t")
    if len(first) != 5 or len(second) != 5 or int(second[-1]) <= int(first[-1]):
        fail("cleanup retry did not advance its fence")
    if not service(pair, "select * from public.bff_session_complete_cleanup(" + q(retry) + ", " + second[-1] + ")").strip():
        fail("retried cleanup did not complete")


def assert_claim_cleanup(pair: dict, user_id: str, provider_session: str) -> None:
    abandoned_user, abandoned_provider, abandoned, _csrf, _material = new_bound_row(pair)
    controlled_clock_setup(pair, abandoned, "expired_active")
    pending_user, pending_provider, pending, _csrf, _material = new_bound_row(pair)
    service(pair, "select * from public.bff_session_begin_revoke(" + q(pending) + ")")
    controlled_clock_setup(pair, pending, "pending_unclaimed")
    live_user, live_provider, live, _csrf, _material = new_bound_row(pair)
    service(pair, "select * from public.bff_session_begin_revoke(" + q(live) + ")")
    live_before = sql(pair, "select refresh_fence::text || '|' || cleanup_attempted_at::text from hco_private.bff_sessions where session_hash = " + q(live)).strip()
    expired_user, expired_provider, expired, _csrf, _material = new_bound_row(pair)
    service(pair, "select * from public.bff_session_begin_revoke(" + q(expired) + ")")
    controlled_clock_setup(pair, expired, "expired_attempt")
    for limit in (0, 51, -1):
        no_rows(service(pair, "select * from public.bff_session_claim_cleanup(" + str(limit) + ")"), "out-of-range cleanup limit claimed work")
    claimed = service(pair, "select * from public.bff_session_claim_cleanup(50)").strip().splitlines()
    if len(claimed) != 3 or any(len(row.split("\t")) != 6 for row in claimed):
        fail("cleanup claim projection or eligible row count differs")
    if {row.split("\t")[0] for row in claimed} != {abandoned, pending, expired}:
        fail("cleanup claim selected the wrong candidate set")
    live_after = sql(pair, "select refresh_fence::text || '|' || cleanup_attempted_at::text from hco_private.bff_sessions where session_hash = " + q(live)).strip()
    if live_before != live_after:
        fail("live cleanup attempt was reclaimed")
    no_rows(service(pair, "select * from public.bff_session_claim_cleanup(50)"), "live cleanup claims were duplicated")
    claimed_hashes = [row.split("\t")[0] for row in claimed]
    for row in claimed:
        fields = row.split("\t")
        if not service(pair, "select * from public.bff_session_complete_cleanup(" + q(fields[0]) + ", " + fields[-1] + ")").strip():
            fail("claimed cleanup did not complete")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash in ("
                      + ",".join(q(value) for value in claimed_hashes)
                      + ") and cleanup_state = 'complete' and credential_envelope is null"), 3,
                   "cleanup completion did not clear all claimed envelopes")
    skip_user, skip_provider, skip_hash, _csrf, _material = new_bound_row(pair)
    controlled_clock_setup(pair, skip_hash, "expired_active")
    locker_sql = ("begin; select 'ready' from hco_private.bff_sessions where session_hash = "
                  + q(skip_hash) + " for update; select pg_sleep(2); commit;")
    locker: subprocess.Popen | None = None
    try:
        locker = psql_process(pair, locker_sql)
        assert locker.stdin is not None and locker.stdout is not None
        locker.stdin.write(locker_sql); locker.stdin.close()
        if locker.stdout.readline().strip() != "ready":
            fail("cleanup skip-lock readiness sentinel was not observed")
        no_rows(service(pair, "select * from public.bff_session_claim_cleanup(50)"), "cleanup claim waited on a locked row")
        locker.wait(timeout=10)
        lock_out = locker.stdout.read()
        lock_err = locker.stderr.read() if locker.stderr is not None else ""
        if locker.returncode != 0 or lock_err or lock_out.strip():
            fail("cleanup skip-lock owner failed")
    finally:
        reap_processes(locker)
    skip_claim = service(pair, "select * from public.bff_session_claim_cleanup(50)").strip().split("\t")
    if len(skip_claim) != 6:
        fail("released expired cleanup row was not claimed")
    no_rows(service(pair, "select * from public.bff_session_claim_cleanup(50)"), "fresh cleanup lease was immediately reclaimed")
    if not service(pair, "select * from public.bff_session_complete_cleanup(" + q(skip_hash) + ", " + skip_claim[-1] + ")").strip():
        fail("skip-locked cleanup did not complete")


def assert_fair_claim_order(pair: dict) -> None:
    # Even while an old failed row is eligible, waiting early revocations must progress.
    _user, _provider, old_hash, _csrf, _material = new_bound_row(pair)
    controlled_clock_setup(pair, old_hash, "expired_active")
    first = service(pair, "select * from public.bff_session_claim_cleanup(1)").strip().split("\t")
    if len(first) != 6 or first[0] != old_hash:
        fail("fair_claim_initial_old_row_missing")
    no_rows(service(pair, "select * from public.bff_session_claim_cleanup(1)"),
            "fair_claim_retried_before_lease")
    controlled_clock_setup(pair, old_hash, "retry_fence")
    waiting_hashes: set[str] = set()
    for _ in range(3):
        _user, _provider, waiting_hash, _csrf, _material = new_bound_row(pair)
        service(pair, "select * from public.bff_session_begin_revoke(" + q(waiting_hash) + ")")
        controlled_clock_setup(pair, waiting_hash, "fair_pending_waiting")
        waiting_hashes.add(waiting_hash)
        claimed = service(pair, "select * from public.bff_session_claim_cleanup(1)").strip().split("\t")
        if len(claimed) != 6 or claimed[0] != waiting_hash:
            fail("fair_claim_old_failure_starved_early_revoke")
        if not service(pair, "select * from public.bff_session_complete_cleanup(" + q(waiting_hash) + ", " + claimed[-1] + ")").strip():
            fail("fair_claim_waiting_completion_failed")
    retried = service(pair, "select * from public.bff_session_claim_cleanup(1)").strip().split("\t")
    if len(retried) != 6 or retried[0] != old_hash or int(retried[-1]) <= int(first[-1]):
        fail("fair_claim_old_retry_lost_or_unfenced")
    no_rows(service(pair, "select * from public.bff_session_claim_cleanup(1)"),
            "fair_claim_retried_again_before_lease")
    if not service(pair, "select * from public.bff_session_complete_cleanup(" + q(old_hash) + ", " + retried[-1] + ")").strip():
        fail("fair_claim_old_completion_failed")
    require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash in ("
                      + ",".join(q(value) for value in waiting_hashes | {old_hash})
                      + ") and cleanup_state='complete' and credential_envelope is null"), 4,
                  "fair_claim_completion_left_credentials")


def psql_process(pair: dict, _statement: str) -> subprocess.Popen:
    """A distinct Docker exec/psql process; generated password stays child-only."""
    command = h.DOCKER + ["exec", "-e", "PGPASSWORD", "-i", pair["db_id"], "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
                           "-U", "postgres", "-d", "postgres", "-A", "-t", "-F", "\t"]
    return subprocess.Popen(command, cwd=pair["cwd"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             text=True, encoding="utf-8", errors="replace", env=h.LOCAL_ENV | {"PGPASSWORD": pair["password"]})


def reap_processes(*processes: subprocess.Popen | None) -> None:
    """Bounded error-path cleanup for every separately spawned psql worker."""
    for process in processes:
        if process is None:
            continue
        if process.poll() is None:
            process.kill()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def concurrent_calls(pair: dict, session_hash: str, first: str, second: str, *, first_role: str | None = "service_role") -> tuple[str, str]:
    """Use a row-lock owner and two independent psql connections, with a pipe-only sentinel."""
    lock_sql = ("begin; select 'ready' from hco_private.bff_sessions where session_hash = " + q(session_hash)
                + " for update; select pg_sleep(2); commit;")
    locker: subprocess.Popen | None = None
    workers: list[subprocess.Popen] = []
    try:
        locker = psql_process(pair, lock_sql)
        assert locker.stdin is not None and locker.stdout is not None
        locker.stdin.write(lock_sql); locker.stdin.close()
        if locker.stdout.readline().strip() != "ready":
            fail("concurrency lock readiness sentinel was not observed")
        workers = [psql_process(pair, query) for query in (first, second)]
        for worker, query, role in zip(workers, (first, second), (first_role, "service_role")):
            assert worker.stdin is not None
            role_sql = "set local role " + role + "; " if role is not None else ""
            worker.stdin.write("begin; set local statement_timeout = '12s'; set local lock_timeout = '8s'; " + role_sql + query + "; commit;")
            worker.stdin.close()
        locker.wait(timeout=10)
        lock_out, lock_err = locker.stdout.read(), locker.stderr.read() if locker.stderr is not None else ""
        if locker.returncode != 0 or lock_err or lock_out.strip(): fail("concurrency lock owner failed")
        outputs: list[str] = []
        for worker in workers:
            worker.wait(timeout=15)
            out = worker.stdout.read() if worker.stdout is not None else ""
            err = worker.stderr.read() if worker.stderr is not None else ""
            if worker.returncode != 0 or err: fail("concurrent psql worker failed")
            outputs.append(out)
        return outputs[0], outputs[1]
    finally:
        reap_processes(locker, *workers)


def locked_leader_then_call(pair: dict, leader_statement: str, follower_statement: str,
                            *, leader_role: str | None = None) -> str:
    """Commit a visible authority/session change while a real RPC waits on its row lock."""
    leader: subprocess.Popen | None = None
    follower: subprocess.Popen | None = None
    try:
        leader = psql_process(pair, leader_statement)
        assert leader.stdin is not None and leader.stdout is not None
        role_sql = "set local role " + leader_role + "; " if leader_role is not None else ""
        leader.stdin.write("begin; set local statement_timeout = '12s'; set local lock_timeout = '8s'; "
                           + role_sql + leader_statement + "; select pg_sleep(2); commit;")
        leader.stdin.close()
        if leader.stdout.readline().strip() != "ready":
            fail("concurrency leader readiness sentinel was not observed")
        follower = psql_process(pair, follower_statement)
        assert follower.stdin is not None
        follower.stdin.write("begin; set local statement_timeout = '12s'; set local lock_timeout = '8s'; "
                             "set local role service_role; " + follower_statement + "; commit;")
        follower.stdin.close()
        leader.wait(timeout=10)
        leader_out = leader.stdout.read()
        leader_err = leader.stderr.read() if leader.stderr is not None else ""
        if leader.returncode != 0 or leader_err or leader_out.strip():
            fail("concurrency leader failed after readiness")
        follower.wait(timeout=15)
        follower_out = follower.stdout.read() if follower.stdout is not None else ""
        follower_err = follower.stderr.read() if follower.stderr is not None else ""
        if follower.returncode != 0 or follower_err:
            fail("blocked repository RPC failed")
        return follower_out
    finally:
        reap_processes(leader, follower)


def assert_concurrency(pair: dict, user_id: str, provider_session: str) -> None:
    # Each named race uses separate psql subprocesses; only stable row counts escape this function.
    substage = "acquire"
    try:
        acquire_user, acquire_provider, acquire, _csrf, _material = new_bound_row(pair)
        first, second = concurrent_calls(pair, acquire,
            "select * from public.bff_session_acquire_refresh(" + q(acquire) + ")",
            "select * from public.bff_session_acquire_refresh(" + q(acquire) + ")")
        if sum(bool(value.strip()) for value in (first, second)) != 1: fail("competing acquire was not single-winner")
        substage = "revoke_finalize"
        revoke_user, revoke_provider, revoke, _csrf, _material = new_bound_row(pair)
        revoke_acquire = service(pair, "select * from public.bff_session_acquire_refresh(" + q(revoke) + ")").strip().split("\t")
        if len(revoke_acquire) != 7: fail("revoke/finalize race could not acquire refresh")
        revoke_fence, revoke_next = revoke_acquire[5], revoke_acquire[4]
        follower = locked_leader_then_call(
            pair,
            "with revoked as materialized (select * from public.bff_session_begin_revoke(" + q(revoke)
            + ")) select 'ready' from revoked limit 1",
            "select * from public.bff_session_finalize_refresh(" + q(revoke) + ", " + revoke_fence + ", "
            + q(revoke_user) + "::uuid, " + q(revoke_provider) + "::uuid, " + revoke_next + ", "
            + q(envelope("race")) + ")",
            leader_role="service_role",
        )
        no_rows(follower, "finalize crossed a committed revoke")
        require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash=" + q(revoke) + " and state='revoked'"), 1,
                      "revoke/finalize race left active credentials")
        substage = "expiry_finalize"
        stale_user, stale_provider, stale, _csrf, _material = new_bound_row(pair)
        stale_acquire = service(pair, "select * from public.bff_session_acquire_refresh(" + q(stale) + ")").strip().split("\t")
        if len(stale_acquire) != 7: fail("expiry/finalize race could not acquire refresh")
        stale_fence, stale_next = stale_acquire[5], stale_acquire[4]
        follower = locked_leader_then_call(
            pair,
            "update hco_private.bff_sessions set created_at = statement_timestamp() - interval '8 hours 1 second', "
            "absolute_expires_at = statement_timestamp() - interval '1 second', "
            "refresh_lease_until = statement_timestamp() - interval '1 second' where session_hash=" + q(stale)
            + "; select 'ready'",
            "select * from public.bff_session_finalize_refresh(" + q(stale) + ", " + stale_fence + ", "
            + q(stale_user) + "::uuid, " + q(stale_provider) + "::uuid, " + stale_next + ", "
            + q(envelope("expiry-race")) + ")",
        )
        no_rows(follower, "blocked finalize authorized after expiry")
        require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash=" + q(stale) + " and state='revoked'"), 1,
                      "blocked stale-clock boundary did not revoke")
        # Profile/provider races use the same lock discipline and a database-side state change as the competing actor.
        for label in ("profile", "provider"):
            substage = label + "_finalize"
            target_user, target_provider, target, _csrf, _material = new_bound_row(pair)
            target_acquire = service(pair, "select * from public.bff_session_acquire_refresh(" + q(target) + ")").strip().split("\t")
            if len(target_acquire) != 7: fail("authority/finalize race could not acquire refresh")
            target_fence, target_next = target_acquire[5], target_acquire[4]
            mutation = ("update public.profiles set active=false where id=" + q(target_user) + "::uuid"
                        if label == "profile" else "delete from auth.sessions where id=" + q(target_provider) + "::uuid")
            follower = locked_leader_then_call(
                pair,
                mutation + "; select 'ready'",
                "select * from public.bff_session_finalize_refresh(" + q(target) + ", " + target_fence + ", "
                + q(target_user) + "::uuid, " + q(target_provider) + "::uuid, " + target_next + ", "
                + q(envelope(label)) + ")",
            )
            no_rows(follower, "finalize crossed a committed authority change")
            require_count(sql(pair, "select count(*) from hco_private.bff_sessions where session_hash=" + q(target) + " and state='revoked'"), 1,
                          "authority-change/finalize race left an active session")
            if label == "profile": sql(pair, "update public.profiles set active=true where id=" + q(target_user) + "::uuid")
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        fail("failed concurrency_" + substage + ": " + redact(str(error)))
    # The provider-delete race intentionally ends the pair: it cannot be safely restored from a token or row copy.


def run_pair(index: int, inputs: list[tuple[str, bytes, str]]) -> dict:
    pair = h.empty_pair(index)
    completed: set[str] = set()
    stage = "fixture_start"
    try:
        h.create_pair(pair, synthetic_signup=True)
        h.wait_for_auth(pair["auth_id"], pair["db_id"], pair["cwd"], pair["password"])
        stage = "migration_replay"
        for _name, content, digest in inputs:
            if hashlib.sha256(content).hexdigest() != digest: fail("reviewed migration bytes changed before execution")
            h.psql(pair["db_id"], pair["cwd"], pair["password"], content.decode("utf-8"))
        if h.psql(pair["db_id"], pair["cwd"], pair["password"], h.DEMO_COUNTS).splitlines() != [
                "event_sale_items:0", "event_sales:0", "ledger_entries:0", "order_items:0", "orders:0"]:
            fail("fresh repository fixture contains demo transaction rows")
        stage = "authority_principals"
        user_id, provider_session = synthetic_binding(pair)
        helper_id, _helper_session = synthetic_binding(pair, role="helper")
        support_id, _support_session = synthetic_binding(pair, role="support")
        stage = "authority_surface"
        assert_authority(pair, {"owner": user_id, "helper": helper_id, "support": support_id})
        completed.add("authority_surface")
        stage = "create_read_expiry"
        assert_create_read(pair, user_id, provider_session); completed.add("create_read_expiry")
        stage = "create_input_and_binding_denials"
        assert_input_binding_denials(pair, user_id, provider_session); completed.add("create_input_and_binding_denials")
        stage = "refresh_and_revoke"
        assert_refresh_and_revoke(pair, user_id, provider_session); completed.add("refresh_fencing"); completed.add("revoke_cleanup_fence")
        stage = "claim_cleanup"
        assert_claim_cleanup(pair, user_id, provider_session); completed.add("claim_cleanup")
        stage = "fair_claim_order"
        assert_fair_claim_order(pair); completed.add("fair_claim_order")
        stage = "concurrency"
        assert_concurrency(pair, user_id, provider_session)
        completed.update(SCENARIOS[-5:])
        return {"status": "PASS", "scenarios": sorted(completed), "controlled_clock_setups": 12,
                "demo_transaction_rows": 0, "published_host_ports": 0}
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        fail("failed " + stage + ": " + redact(str(error)))
    finally:
        h.cleanup(pair)


def main() -> int:
    if len(sys.argv) != 1:
        fail("repository acceptance runner accepts no URLs, credentials, ports, project refs, or arguments")
    if not MIGRATION.is_file() or not FIXTURE_PATH.is_file() or not HTTP_FIXTURE_PATH.is_file():
        fail("reviewed repository source or owned fixture helper is missing")
    pins = h.source_pins()
    inputs = h.migration_inputs(pins)
    if len(inputs) != len(pins["migrations"]) or MIGRATION.name not in {name for name, _content, _digest in inputs}:
        fail("expected exactly the pinned migrations including the session repository")
    h.require_local_docker(ROOT)
    reports = [run_pair(index, inputs) for index in (1, 2)]
    if reports[0] != reports[1] or reports[0]["scenarios"] != sorted(SCENARIOS):
        fail("fresh repository acceptance receipts differ")
    print(json.dumps({"status": "PASS", "pairs": 2, "scenario_count": len(SCENARIOS), "scenarios": sorted(SCENARIOS),
                      "migration_hashes": {name: digest for name, _content, digest in inputs},
                      "cleanup": {"owned_containers": 0, "owned_networks": 0, "owned_workdirs": 0},
                      "controlled_clock_setups": 12, "demo_transaction_rows": 0}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "FAIL", "reason": redact(str(error))}, sort_keys=True))
        raise SystemExit(1)
