#!/usr/bin/env python3
"""Measure pinned local GoTrue refresh-token parent reuse in a disposable fixture."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import secrets
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTTP_SPEC = importlib.util.spec_from_file_location(
    "auth_http_fixture", ROOT / "scripts" / "test-auth-http-fixture.py"
)
assert HTTP_SPEC is not None and HTTP_SPEC.loader is not None
http_fixture = importlib.util.module_from_spec(HTTP_SPEC)
HTTP_SPEC.loader.exec_module(http_fixture)
h = http_fixture.h

PROBE_SPEC = importlib.util.spec_from_file_location(
    "expired_provider_probe", ROOT / "scripts" / "test-expired-provider-logout.py"
)
assert PROBE_SPEC is not None and PROBE_SPEC.loader is not None
probe = importlib.util.module_from_spec(PROBE_SPEC)
PROBE_SPEC.loader.exec_module(probe)


class ProbeFailure(RuntimeError):
    pass


def fail(marker: str) -> None:
    raise ProbeFailure(marker)


def claims_for(local_pair: dict, access: str, secret: str, expected_user: str, expected_session: str) -> None:
    _header, claims = probe.verified_claims(access, secret)
    if claims.get("sub") != expected_user or claims.get("session_id") != expected_session:
        fail("provider_binding_changed")
    if http_fixture.count_bound_session(local_pair, expected_user, expected_session) != 1:
        fail("provider_session_row_missing")


def create_user(local_pair: dict, label: str) -> tuple[str, str, str, str, str, str]:
    email = f"fixture-{label}-{secrets.token_hex(12)}@example.test"
    password = secrets.token_urlsafe(30)
    signup_status, signup = http_fixture.http(
        local_pair, "/signup", body={"email": email, "password": password}
    )
    if signup_status != 200 or not isinstance(signup, dict):
        fail("synthetic_signup")
    login_status, login = http_fixture.http(
        local_pair, "/token?grant_type=password", body={"email": email, "password": password}
    )
    if login_status != 200:
        fail("synthetic_login")
    access, refresh, user_id = http_fixture.token_result(login)
    user_status, user = http_fixture.http(local_pair, "/user", access_token=access)
    user_id_claim, session_id = http_fixture.session_claims(access)
    if (user_status != 200 or not isinstance(user, dict) or user.get("id") != user_id
            or user_id_claim != user_id
            or http_fixture.count_bound_session(local_pair, user_id, session_id) != 1):
        fail("initial_provider_binding")
    return access, refresh, user_id, session_id, email, password


def live_probe() -> dict:
    pair = h.empty_pair(1)
    try:
        h.create_pair(pair, synthetic_signup=True)
        h.wait_for_auth(pair["auth_id"], pair["db_id"], pair["cwd"], pair["password"])
        before = h.auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"])
        pins = h.source_pins()
        inputs = h.migration_inputs(pins)
        preflight = h.PREFLIGHT.read_bytes()
        if hashlib.sha256(preflight).hexdigest() != pins["preflight_sha256"]:
            fail("reviewed_preflight_changed")
        for _name, content, digest in inputs:
            if hashlib.sha256(content).hexdigest() != digest:
                fail("migration_hash_changed")
            h.psql(pair["db_id"], pair["cwd"], pair["password"], content.decode("utf-8"))
        if h.auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"]) != before:
            fail("managed_auth_schema_changed")
        h.parse_preflight(h.psql(pair["db_id"], pair["cwd"], pair["password"], preflight.decode("utf-8")))
        counts = h.psql(pair["db_id"], pair["cwd"], pair["password"], h.DEMO_COUNTS).splitlines()
        if counts != ["event_sale_items:0", "event_sales:0", "ledger_entries:0", "order_items:0", "orders:0"]:
            fail("commercial_rows_present")

        access_0, refresh_0, user_0, session_0, email, password = create_user(pair, "primary")
        claims_for(pair, access_0, pair["jwt_secret"], user_0, session_0)
        refresh_status_1, first_rotation = http_fixture.http(
            pair, "/token?grant_type=refresh_token", body={"refresh_token": refresh_0}
        )
        if refresh_status_1 != 200:
            fail("first_parent_refresh_denied")
        access_1, refresh_1, user_1 = http_fixture.token_result(first_rotation)
        if user_1 != user_0:
            fail("first_refresh_user_changed")
        claims_for(pair, access_1, pair["jwt_secret"], user_0, session_0)

        time.sleep(11)
        refresh_status_2, replay = http_fixture.http(
            pair, "/token?grant_type=refresh_token", body={"refresh_token": refresh_0}
        )
        if refresh_status_2 != 200:
            fail("parent_replay_not_reused")
        access_2, refresh_2, user_2 = http_fixture.token_result(replay)
        if user_2 != user_0 or refresh_2 != refresh_1:
            fail("parent_replay_rotation_mismatch")
        claims_for(pair, access_2, pair["jwt_secret"], user_0, session_0)
        user_status, user = http_fixture.http(pair, "/user", access_token=access_2)
        if user_status != 200 or not isinstance(user, dict) or user.get("id") != user_0:
            fail("replayed_access_not_current")

        control_status, control_login = http_fixture.http(
            pair, "/token?grant_type=password", body={"email": email, "password": password}
        )
        if control_status != 200:
            fail("same_user_second_login_denied")
        control_access, _control_refresh, control_user = http_fixture.token_result(control_login)
        _control_subject, control_session = http_fixture.session_claims(control_access)
        if control_user != user_0 or control_session == session_0:
            fail("same_user_second_session_binding")
        claims_for(pair, control_access, pair["jwt_secret"], user_0, control_session)
        logout_status, logout_body = http_fixture.http(
            pair, "/logout?scope=local", post_empty=True, access_token=access_2
        )
        primary_rows = http_fixture.count_bound_session(pair, user_0, session_0)
        control_rows = http_fixture.count_bound_session(pair, user_0, control_session)
        if logout_status != 204 or logout_body is not None or primary_rows != 0:
            fail("latest_token_logout_failed")
        if control_rows != 1:
            fail("logout_removed_same_user_other_session")
        control_user_status, control_user_body = http_fixture.http(
            pair, "/user", access_token=control_access
        )
        if (control_user_status != 200 or not isinstance(control_user_body, dict)
                or control_user_body.get("id") != user_0):
            fail("same_user_other_session_unusable")
        post_status, post_body = http_fixture.revoked_user_response(pair, access_2)
        post_code, post_error, post_keys = http_fixture.sanitized_error(post_body)
        if (post_status != 403 or post_code != 403 or post_error != "session_not_found"
                or post_keys != ["code", "error_code", "msg"]):
            fail("post_logout_not_revoked")
        return {
            "status": "PASS",
            "first_refresh_http": refresh_status_1,
            "parent_replay_http": refresh_status_2,
            "replay_returned_same_child_refresh": True,
            "same_user_and_session": True,
            "latest_access_user_http": user_status,
            "logout_http": logout_status,
            "primary_session_rows_after_logout": primary_rows,
            "same_user_second_session_rows_after_logout": control_rows,
            "same_user_second_session_user_http": control_user_status,
            "post_logout_user_http": post_status,
            "post_logout_error": post_error,
            "private_network": True,
            "published_host_ports": 0,
        }
    finally:
        h.cleanup(pair)
        if pair["workdir"].exists():
            fail("owned_workdir_remains")
        if (h.docker(["ps", "-aq", "--filter", f"label={h.LABEL}={pair['run_id']}"],
                     cwd=ROOT, timeout=20).strip()
                or h.docker(["network", "ls", "-q", "--filter", f"label={h.LABEL}={pair['run_id']}"],
                            cwd=ROOT, timeout=20).strip()):
            fail("owned_docker_resource_remains")


def main() -> int:
    if len(sys.argv) != 1:
        fail("arguments_not_allowed")
    h.require_local_docker(ROOT)
    print(json.dumps(live_probe(), sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ProbeFailure as error:
        print(json.dumps({"status": "FAIL", "reason": str(error)}, sort_keys=True))
        raise SystemExit(1)
    except (RuntimeError, OSError, subprocess.TimeoutExpired):
        print(json.dumps({"status": "FAIL", "reason": "fixture_dependency_or_cleanup_failure"}, sort_keys=True))
        raise SystemExit(1)
