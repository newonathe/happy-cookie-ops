#!/usr/bin/env python3
"""Probe expired access-token logout against one owned, private GoTrue fixture.

The program accepts no arguments or external credentials. Token material stays
in memory and in the existing private HTTP helper's child environment only.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import importlib.util
import json
import re
import secrets
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("auth_http_fixture", ROOT / "scripts" / "test-auth-http-fixture.py")
assert SPEC is not None and SPEC.loader is not None
http_fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(http_fixture)
h = http_fixture.h

JWT_PART = re.compile(r"^[A-Za-z0-9_-]+$")


class ProbeFailure(RuntimeError):
    pass


def fail(marker: str) -> None:
    raise ProbeFailure(marker)


def b64_decode(part: str) -> bytes:
    if not JWT_PART.fullmatch(part) or len(part) > 8192:
        fail("jwt_encoding")
    try:
        raw = base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))
    except (binascii.Error, ValueError):
        fail("jwt_encoding")
    if base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii") != part:
        fail("jwt_encoding")
    return raw


def b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def verified_claims(token: str, secret: str) -> tuple[str, dict]:
    parts = token.split(".")
    if len(parts) != 3 or len(token) > 16384:
        fail("jwt_shape")
    header_raw, payload_raw, signature = (b64_decode(part) for part in parts)
    try:
        header, claims = json.loads(header_raw), json.loads(payload_raw)
    except (UnicodeDecodeError, ValueError):
        fail("jwt_json")
    if (not isinstance(header, dict) or header.get("alg") != "HS256" or
            header.get("typ") != "JWT" or "crit" in header or not isinstance(claims, dict)):
        fail("jwt_header_or_claims")
    expected = hmac.new(secret.encode("utf-8"), f"{parts[0]}.{parts[1]}".encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(expected, signature):
        fail("jwt_signature")
    if (not isinstance(claims.get("sub"), str) or not http_fixture.UUID.fullmatch(claims["sub"]) or
            not isinstance(claims.get("session_id"), str) or
            not http_fixture.UUID.fullmatch(claims["session_id"]) or
            type(claims.get("exp")) is not int):
        fail("jwt_binding")
    return parts[0], claims


def expired_copy(access: str, secret: str) -> tuple[str, dict]:
    header, claims = verified_claims(access, secret)
    if claims["exp"] <= int(time.time()) + 30:
        fail("issued_token_not_current")
    expired_claims = dict(claims)
    expired_claims["exp"] = int(time.time()) - 60
    payload = b64_encode(json.dumps(expired_claims, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    content = f"{header}.{payload}"
    signature = b64_encode(hmac.new(secret.encode("utf-8"), content.encode("ascii"), hashlib.sha256).digest())
    token = f"{content}.{signature}"
    _, verified = verified_claims(token, secret)
    if verified != expired_claims or verified["exp"] >= int(time.time()):
        fail("expired_token_contract")
    return token, claims


def assert_error(status: int, body: dict | None) -> str:
    code, error_code, keys = http_fixture.sanitized_error(body)
    if (status != 403 or code != 403 or error_code != "bad_jwt" or
            keys != ["code", "error_code", "msg"]):
        fail(f"expired_logout_error_shape_http_{status}")
    return error_code


def live_probe(inputs: list[tuple[str, bytes, str]], preflight: str) -> dict:
    pair = h.empty_pair(1)
    try:
        h.create_pair(pair, synthetic_signup=True)
        h.wait_for_auth(pair["auth_id"], pair["db_id"], pair["cwd"], pair["password"])
        before = h.auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"])
        for _name, content, digest in inputs:
            if hashlib.sha256(content).hexdigest() != digest:
                fail("migration_hash_changed")
            h.psql(pair["db_id"], pair["cwd"], pair["password"], content.decode("utf-8"))
        if h.auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"]) != before:
            fail("managed_auth_schema_changed")
        h.parse_preflight(h.psql(pair["db_id"], pair["cwd"], pair["password"], preflight))
        if h.psql(pair["db_id"], pair["cwd"], pair["password"], h.DEMO_COUNTS).splitlines() != [
                "event_sale_items:0", "event_sales:0", "ledger_entries:0", "order_items:0", "orders:0"]:
            fail("commercial_rows_present")

        email = f"fixture-{secrets.token_hex(12)}@example.test"
        password = secrets.token_urlsafe(30)
        signup_status, signup = http_fixture.http(pair, "/signup", body={"email": email, "password": password})
        if signup_status != 200 or not isinstance(signup, dict):
            fail("synthetic_signup")
        login_status, login = http_fixture.http(pair, "/token?grant_type=password", body={"email": email, "password": password})
        if login_status != 200:
            fail(f"synthetic_login_http_{login_status}")
        access, refresh, user_id = http_fixture.token_result(login)
        expired, claims = expired_copy(access, pair["jwt_secret"])
        session_id = claims["session_id"]
        if claims["sub"] != user_id or http_fixture.count_bound_session(pair, user_id, session_id) != 1:
            fail("initial_session_binding")
        user_status, user = http_fixture.http(pair, "/user", access_token=access)
        if user_status != 200 or not isinstance(user, dict) or user.get("id") != user_id:
            fail("initial_user_binding")

        expired_status, expired_body = http_fixture.revoked_logout_response(pair, expired)
        expired_code = assert_error(expired_status, expired_body)
        retained = http_fixture.count_bound_session(pair, user_id, session_id)
        if retained != 1:
            fail("expired_logout_removed_session")

        refresh_status, renewed = http_fixture.http(pair, "/token?grant_type=refresh_token", body={"refresh_token": refresh})
        if refresh_status != 200:
            fail(f"original_refresh_http_{refresh_status}")
        fresh_access, _fresh_refresh, fresh_user_id = http_fixture.token_result(renewed)
        _, fresh_claims = verified_claims(fresh_access, pair["jwt_secret"])
        if (fresh_claims["exp"] <= int(time.time()) or fresh_user_id != user_id or
                fresh_claims["sub"] != user_id or fresh_claims["session_id"] != session_id or
                http_fixture.count_bound_session(pair, user_id, session_id) != 1):
            fail("refreshed_session_binding")
        fresh_user_status, fresh_user = http_fixture.http(pair, "/user", access_token=fresh_access)
        if fresh_user_status != 200 or not isinstance(fresh_user, dict) or fresh_user.get("id") != user_id:
            fail("refreshed_user_binding")
        logout_status, logout_body = http_fixture.http(pair, "/logout?scope=local", post_empty=True,
                                                        access_token=fresh_access)
        if logout_status != 204 or logout_body is not None or http_fixture.count_bound_session(pair, user_id, session_id) != 0:
            fail(f"fresh_logout_http_{logout_status}")
        post_status, post_body = http_fixture.revoked_user_response(pair, fresh_access)
        post_code, post_error, post_keys = http_fixture.sanitized_error(post_body)
        if (post_status != 403 or post_code != 403 or post_error != "session_not_found" or
                post_keys != ["code", "error_code", "msg"]):
            fail(f"post_logout_user_http_{post_status}")
        return {"status": "PASS", "expired_logout_http": expired_status, "expired_logout_code": expired_code,
                "rows_after_expired_logout": retained, "refresh_http": refresh_status,
                "fresh_logout_http": logout_status, "rows_after_fresh_logout": 0,
                "post_logout_user_http": post_status, "post_logout_code": post_error,
                "private_network": True, "published_host_ports": 0}
    finally:
        h.cleanup(pair)
        if pair["workdir"].exists():
            fail("owned_workdir_remains")
        if (h.docker(["ps", "-aq", "--filter", f"label={h.LABEL}={pair['run_id']}"],
                     cwd=ROOT, timeout=20).strip() or
                h.docker(["network", "ls", "-q", "--filter", f"label={h.LABEL}={pair['run_id']}"],
                         cwd=ROOT, timeout=20).strip()):
            fail("owned_docker_resource_remains")


def main() -> int:
    if len(sys.argv) != 1:
        fail("arguments_not_allowed")
    pins = h.source_pins()
    inputs = h.migration_inputs(pins)
    preflight_bytes = h.PREFLIGHT.read_bytes()
    if hashlib.sha256(preflight_bytes).hexdigest() != pins["preflight_sha256"]:
        fail("reviewed_preflight_changed")
    h.require_local_docker(ROOT)
    report = live_probe(inputs, preflight_bytes.decode("utf-8"))
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ProbeFailure as error:
        print(json.dumps({"status": "FAIL", "reason": str(error)}))
        raise SystemExit(1)
    except (RuntimeError, OSError, subprocess.TimeoutExpired):
        print(json.dumps({"status": "FAIL", "reason": "fixture_dependency_or_cleanup_failure"}))
        raise SystemExit(1)
