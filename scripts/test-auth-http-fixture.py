#!/usr/bin/env python3
"""Synthetic GoTrue HTTP lifecycle on two owned, unpublished local pairs."""
from __future__ import annotations

import base64
import hashlib
import http.client as http_client
import importlib.util
import io
import json
import re
import secrets
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("auth_fixture", ROOT / "scripts" / "test-auth-fixture.py")
assert SPEC is not None and SPEC.loader is not None
h = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(h)

UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
JWT_PART = re.compile(r"^[A-Za-z0-9_-]+$")
PATHS = {"/signup", "/token?grant_type=password", "/token?grant_type=refresh_token", "/user", "/logout?scope=local"}


def fail(message: str) -> None:
    raise RuntimeError(message)


def http(pair: dict, path: str, *, body: dict | None = None, post_empty: bool = False,
         access_token: str | None = None) -> tuple[int, dict | None]:
    if path not in PATHS:
        fail("HTTP target is outside the fixed local Auth route set")
    if access_token is not None and (not isinstance(access_token, str) or len(access_token) > 16384 or
                                     not re.fullmatch(r"[\x21-\x7e]+", access_token)):
        fail("provider token shape is invalid")
    if body is not None and path not in {"/signup", "/token?grant_type=password", "/token?grant_type=refresh_token"}:
        fail("HTTP body is not allowed on this route")
    if post_empty and (path != "/logout?scope=local" or body is not None):
        fail("empty POST is allowed only for local logout")
    # The token remains in a child environment variable, then one quoted
    # header argument inside the isolated container; no token is in host argv.
    shell = ("set -- wget -q -S -O - --header='Content-Type: application/json'; " +
             ("set -- \"$@\" --post-file=/dev/stdin; " if body is not None or post_empty else "") +
             "if [ -n \"${HC_AUTH_TOKEN:-}\" ]; then set -- \"$@\" --header=\"Authorization: Bearer $HC_AUTH_TOKEN\"; fi; " +
             f"exec \"$@\" 'http://127.0.0.1:9999{path}'")
    env = h.LOCAL_ENV | ({"HC_AUTH_TOKEN": access_token} if access_token is not None else {})
    command = h.DOCKER + ["exec", "-i"] + (["-e", "HC_AUTH_TOKEN"] if access_token is not None else []) + [
        pair["auth_id"], "/bin/sh", "-ec", shell]
    try:
        result = subprocess.run(command, cwd=pair["cwd"], input=json.dumps(body).encode() if body is not None else b"",
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, timeout=20, check=False)
    except (OSError, subprocess.TimeoutExpired):
        fail("private Auth HTTP request did not finish")
    statuses = re.findall(rb"HTTP/\d(?:\.\d)?\s+(\d{3})", result.stderr)
    if not statuses or len(result.stdout) > 65536 or len(result.stderr) > 65536:
        fail("private Auth HTTP response is missing or oversized")
    status = int(statuses[-1])
    if (result.returncode == 0) != (200 <= status < 300):
        fail("private Auth HTTP process status conflicts with response status")
    if not result.stdout:
        return status, None
    try:
        parsed = json.loads(result.stdout)
    except (UnicodeDecodeError, ValueError):
        fail("private Auth HTTP body is not JSON")
    if not isinstance(parsed, dict):
        fail("private Auth HTTP body shape differs")
    return status, parsed


def private_peer_response(pair: dict, access_token: str, *, path: str, method: str) -> tuple[int, dict | None]:
    """GoTrue's BusyBox wget discards error bodies; curl from its private DB peer."""
    if not isinstance(access_token, str) or not 1 <= len(access_token) <= 16384 or not re.fullmatch(r"[\x21-\x7e]+", access_token):
        fail("provider token shape is invalid")
    if (path, method) not in {("/user", "GET"), ("/logout?scope=local", "POST")}:
        fail("private Auth peer target is outside the fixed route set")
    auth_host = pair["auth_name"]
    if not re.fullmatch(r"[a-z0-9-]{1,63}", auth_host):
        fail("private Auth host name is invalid")
    shell = ("exec curl --silent --show-error --include --noproxy '*' --max-time 5 "
             f"--request {method} "
             "--header \"Authorization: Bearer $HC_AUTH_TOKEN\" "
             "--header 'Accept: application/json' "
             f"'http://{auth_host}:9999{path}'")
    try:
        result = subprocess.run(h.DOCKER + ["exec", "-e", "HC_AUTH_TOKEN", pair["db_id"], "/bin/sh", "-ec", shell],
                                cwd=pair["cwd"], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=h.LOCAL_ENV | {"HC_AUTH_TOKEN": access_token}, timeout=15, check=False)
        if result.returncode != 0 or len(result.stdout) > 65536 or len(result.stderr) > 65536:
            fail("private Auth error response is missing or oversized")
        class InMemorySocket:
            def makefile(self, _mode: str):
                return io.BytesIO(result.stdout)
        response = http_client.HTTPResponse(InMemorySocket())
        response.begin()
        status = response.status
        body = response.read(65537)
        if len(body) > 65536:
            fail("private Auth error body is oversized")
        parsed = json.loads(body) if body else None
        if parsed is not None and not isinstance(parsed, dict):
            fail("private Auth error body shape differs")
        return status, parsed
    except (OSError, ValueError, http_client.HTTPException, subprocess.TimeoutExpired):
        fail("private Auth error response could not be parsed")


def revoked_user_response(pair: dict, access_token: str) -> tuple[int, dict | None]:
    return private_peer_response(pair, access_token, path="/user", method="GET")


def revoked_logout_response(pair: dict, access_token: str) -> tuple[int, dict | None]:
    return private_peer_response(pair, access_token, path="/logout?scope=local", method="POST")


def sanitized_error(value: dict | None) -> tuple[int | None, str | None, list[str]]:
    if not isinstance(value, dict):
        return None, None, []
    code, error_code = value.get("code"), value.get("error_code")
    if not isinstance(code, int) or not isinstance(error_code, str) or not re.fullmatch(r"[a-z_]{1,64}", error_code):
        return None, None, sorted(value)
    return code, error_code, sorted(value)


def token_result(value: dict | None) -> tuple[str, str, str]:
    if not isinstance(value, dict) or not isinstance(value.get("user"), dict):
        fail("provider token response shape differs")
    access, refresh, user_id = value.get("access_token"), value.get("refresh_token"), value["user"].get("id")
    if (not isinstance(access, str) or len(access) > 16384 or not isinstance(refresh, str) or
            not 1 <= len(refresh) <= 16384 or not isinstance(user_id, str) or not UUID.fullmatch(user_id)):
        fail("provider token response fields differ")
    return access, refresh, user_id


def session_claims(access_token: str) -> tuple[str, str]:
    parts = access_token.split(".")
    if len(parts) != 3 or any(not JWT_PART.fullmatch(part) for part in parts) or len(parts[1]) > 8192:
        fail("provider JWT shape differs")
    encoded = parts[1]
    try:
        raw = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        if base64.urlsafe_b64encode(raw).rstrip(b"=").decode() != encoded:
            fail("provider JWT encoding is noncanonical")
        claims = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        fail("provider JWT claims are invalid")
    if (not isinstance(claims, dict) or not isinstance(claims.get("sub"), str) or
            not isinstance(claims.get("session_id"), str) or not UUID.fullmatch(claims["sub"]) or
            not UUID.fullmatch(claims["session_id"])):
        fail("provider JWT binding claims differ")
    return claims["sub"], claims["session_id"]


def count_bound_session(pair: dict, user_id: str, session_id: str) -> int:
    if not UUID.fullmatch(user_id) or not UUID.fullmatch(session_id):
        fail("synthetic session identifiers are malformed")
    sql = ("select count(*) from auth.sessions where id='" + session_id + "'::uuid " +
           "and user_id='" + user_id + "'::uuid;")
    result = h.psql(pair["db_id"], pair["cwd"], pair["password"], sql).strip()
    if result not in {"0", "1"}:
        fail("synthetic provider session count differs")
    return int(result)


def live_pair(index: int, inputs: list[tuple[str, bytes, str]], preflight: str) -> dict:
    pair = h.empty_pair(index)
    try:
        h.create_pair(pair, synthetic_signup=True)
        h.wait_for_auth(pair["auth_id"], pair["db_id"], pair["cwd"], pair["password"])
        before = h.auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"])
        for _name, content, digest in inputs:
            if hashlib.sha256(content).hexdigest() != digest:
                fail("captured migration hash changed before execution")
            h.psql(pair["db_id"], pair["cwd"], pair["password"], content.decode("utf-8"))
        if h.auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"]) != before:
            fail("application migrations changed managed Auth schema")
        h.parse_preflight(h.psql(pair["db_id"], pair["cwd"], pair["password"], preflight))
        if h.psql(pair["db_id"], pair["cwd"], pair["password"], h.DEMO_COUNTS).splitlines() != [
                "event_sale_items:0", "event_sales:0", "ledger_entries:0", "order_items:0", "orders:0"]:
            fail("synthetic Auth fixture contains demo transactions")
        email = f"fixture-{secrets.token_hex(12)}@example.test"
        password = secrets.token_urlsafe(30)
        signup_status, signup = http(pair, "/signup", body={"email": email, "password": password})
        if signup_status != 200 or not isinstance(signup, dict):
            fail("synthetic signup did not return an auto-confirmed account")
        login_status, login = http(pair, "/token?grant_type=password", body={"email": email, "password": password})
        if login_status != 200:
            fail("synthetic password login did not succeed")
        access, refresh, user_id = token_result(login)
        user_status, user = http(pair, "/user", access_token=access)
        if user_status != 200 or not isinstance(user, dict) or user.get("id") != user_id:
            fail("Auth user lookup did not confirm the exchanged principal")
        sub, session_id = session_claims(access)
        if sub != user_id or count_bound_session(pair, user_id, session_id) != 1:
            fail("Auth session row is not bound to the confirmed principal")
        refresh_status, renewed = http(pair, "/token?grant_type=refresh_token", body={"refresh_token": refresh})
        if refresh_status != 200:
            fail("synthetic provider refresh did not succeed")
        new_access, _new_refresh, new_user_id = token_result(renewed)
        new_user_status, new_user = http(pair, "/user", access_token=new_access)
        new_sub, new_session_id = session_claims(new_access)
        if (new_user_status != 200 or not isinstance(new_user, dict) or new_user.get("id") != user_id or
                new_user_id != user_id or new_sub != user_id or new_session_id != session_id or
                count_bound_session(pair, user_id, session_id) != 1):
            fail("provider refresh did not preserve the confirmed session binding")
        raw_user_status, raw_user = revoked_user_response(pair, new_access)
        if raw_user_status != 200 or not isinstance(raw_user, dict) or raw_user.get("id") != user_id:
            fail(f"raw private HTTP probe is not equivalent to wget before logout; status={raw_user_status}")
        logout_status, _logout = http(pair, "/logout?scope=local", post_empty=True, access_token=new_access)
        session_after_logout = count_bound_session(pair, user_id, session_id)
        after_status, after = revoked_user_response(pair, new_access)
        after_numeric_code, after_code, after_keys = sanitized_error(after)
        if after_numeric_code is None or after_code is None:
            fail(f"revoked provider error shape differs; safe_keys={after_keys}")
        duplicate_logout_status, duplicate_logout = revoked_logout_response(pair, new_access)
        duplicate_numeric_code, duplicate_code, duplicate_keys = sanitized_error(duplicate_logout)
        if duplicate_numeric_code is None or duplicate_code is None:
            fail(f"duplicate local logout error shape differs; safe_keys={duplicate_keys}")
        if (logout_status != 204 or session_after_logout != 0 or after_status != 403 or after_code != "session_not_found" or
                after_numeric_code != 403 or duplicate_logout_status != 403 or duplicate_code != "session_not_found" or
                duplicate_numeric_code != 403 or duplicate_keys != ["code", "error_code", "msg"]):
            safe_keys = after_keys
            fail(f"provider local logout mismatch: status={logout_status}, session_rows={session_after_logout}, user_status={after_status}, safe_keys={safe_keys}, error_code={after_code}")
        return {"run_id": pair["run_id"], "status": "PASS", "signup": signup_status, "login": login_status,
                "user": user_status, "refresh": refresh_status, "logout": logout_status,
                "post_logout_user": after_status, "post_logout_code": after_code, "session_row_after_logout": 0,
                "duplicate_logout": duplicate_logout_status, "duplicate_logout_code": duplicate_code,
                "duplicate_logout_body_keys": duplicate_keys,
                "network": "internal", "published_host_ports": 0}
    finally:
        h.cleanup(pair)


def main() -> int:
    if len(sys.argv) != 1:
        fail("fixture accepts no target URLs, accounts, or credentials")
    pins = h.source_pins()
    inputs = h.migration_inputs(pins)
    preflight_bytes = h.PREFLIGHT.read_bytes()
    if hashlib.sha256(preflight_bytes).hexdigest() != pins["preflight_sha256"]:
        fail("reviewed provider preflight source changed")
    h.require_local_docker(ROOT)
    reports = [live_pair(index, inputs, preflight_bytes.decode("utf-8")) for index in (1, 2)]
    print(json.dumps({"status": "PASS", "pairs": reports, "cleanup": "guarded per pair"}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "FAIL", "reason": str(error)[:300]}))
        raise SystemExit(1)
