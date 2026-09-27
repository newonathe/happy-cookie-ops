#!/usr/bin/env python3
"""Private, disposable PostgREST smoke fixture for MP-08n.1.

The public entry point accepts no arguments. ``run_fixture`` is intentionally
narrow: a later local integration may run a callback while the owned provider
pair is alive, but it receives no host URL and all generated credentials stay
in the in-memory pair or child environments.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import importlib.util
import json
import re
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("auth_fixture", ROOT / "scripts" / "test-auth-fixture.py")
assert SPEC is not None and SPEC.loader is not None
h = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(h)

POSTGREST_IMAGE = "postgrest/postgrest:v14.16"
POSTGREST_ID = "sha256:bea1c76a856fa39d1e542d25911cf95d02fe2bf971992d033044ff209f1504b8"
POSTGREST_PREFIX = "hcb-auth-postgrest-"
RPC_PATH = "/rpc/consume_rate_limit"
RPC_BODY = '{"p_key":"fixture:smoke","p_limit":1,"p_window_s":60}'


def fail(message: str) -> None:
    raise RuntimeError(message)


def redact(message: str) -> str:
    message = re.sub(r"(?i)(?:postgres(?:ql)?|https?)://\S+", "[redacted-url]", message)
    message = re.sub(r"eyJ[A-Za-z0-9_.-]+", "[redacted-token]", message)
    message = re.sub(r"(?i)(password|token|jwt|secret|key)\s*[=:]\s*\S+", r"\1=[redacted]", message)
    return message[:600]


def b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def service_token(secret: str) -> str:
    if not isinstance(secret, str) or not 32 <= len(secret) <= 256:
        fail("generated JWT secret shape is invalid")
    header = b64(b'{"alg":"HS256","typ":"JWT"}')
    payload = b64(json.dumps({"role": "service_role", "exp": int(time.time()) + 300}, separators=(",", ":")).encode())
    signature = b64(hmac.new(secret.encode(), f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{signature}"


def assert_pair_ready(pair: dict) -> None:
    required = ("run_id", "network_id", "network_name", "db_id", "db_name", "auth_id", "auth_name", "password", "jwt_secret")
    if not isinstance(pair.get("cwd"), Path) or any(not isinstance(pair.get(name), str) or not pair[name] for name in required):
        fail("owned provider pair is incomplete")


def start_postgrest(pair: dict) -> None:
    assert_pair_ready(pair)
    image = h.resolve_image(POSTGREST_IMAGE, POSTGREST_ID, pair["cwd"])
    name = POSTGREST_PREFIX + pair["run_id"]
    if h.docker(["ps", "-aq", "--filter", f"name=^/{name}$"], cwd=pair["cwd"], timeout=20).strip():
        fail("PostgREST fixture resource name collision")
    role = h.psql(pair["db_id"], pair["cwd"], pair["password"], "select rolname from pg_roles where rolname='authenticator';", user="supabase_admin").strip()
    if role != "authenticator":
        fail("private database authenticator role contract differs")
    h.psql(pair["db_id"], pair["cwd"], pair["password"], "alter role authenticator with login password '" + pair["password"] + "';", user="supabase_admin")
    db_uri = f"postgres://authenticator:{pair['password']}@{pair['db_name']}:5432/postgres"
    env = {"PGRST_DB_URI": db_uri, "PGRST_JWT_SECRET": pair["jwt_secret"]}
    container_id = h.docker([
        "create", "--name", name, "--label", f"{h.LABEL}={pair['run_id']}", "--network", pair["network_id"],
        "-e", "PGRST_DB_URI", "-e", "PGRST_JWT_SECRET", "-e", "PGRST_DB_ANON_ROLE=anon",
        "-e", "PGRST_DB_SCHEMAS=public", "-e", "PGRST_SERVER_HOST=0.0.0.0", "-e", "PGRST_SERVER_PORT=3000",
        image
    ], cwd=pair["cwd"], timeout=30, extra_env=env).strip()
    pair["postgrest_id"], pair["postgrest_name"], pair["postgrest_image"] = container_id, name, image
    expected = {pair["db_id"], pair["auth_id"], container_id}
    h.assert_network(h.inspect_network(pair["network_id"], pair["cwd"]), network_id=pair["network_id"],
                     name=pair["network_name"], run_id=pair["run_id"], expected_ids=expected, exact=False)
    info = h.inspect_container(container_id, pair["cwd"])
    h.assert_container(info, container_id=container_id, name=name, image_id=image, run_id=pair["run_id"],
                       network_id=pair["network_id"], running=False)
    h.docker(["start", container_id], cwd=pair["cwd"], timeout=30)
    info = h.inspect_container(container_id, pair["cwd"])
    h.assert_container(info, container_id=container_id, name=name, image_id=image, run_id=pair["run_id"],
                       network_id=pair["network_id"], running=True)
    h.assert_network(h.inspect_network(pair["network_id"], pair["cwd"]), network_id=pair["network_id"],
                     name=pair["network_name"], run_id=pair["run_id"], expected_ids=expected, exact=True)
    wait_for_postgrest(pair)


def private_rpc(pair: dict, token: str | None) -> tuple[int, object]:
    if not isinstance(pair.get("postgrest_name"), str) or not re.fullmatch(r"[a-z0-9-]{1,63}", pair["postgrest_name"]):
        fail("private PostgREST target is invalid")
    if token is not None and (not isinstance(token, str) or len(token) > 16384 or not re.fullmatch(r"[A-Za-z0-9_.-]+", token)):
        fail("service token shape is invalid")
    shell = ("set -- --silent --show-error --noproxy '*' --max-time 5 --request POST "
             "--header 'Content-Type: application/json'; "
             "if [ -n \"${HC_RPC_TOKEN:-}\" ]; then set -- \"$@\" --header \"Authorization: Bearer $HC_RPC_TOKEN\"; fi; "
             "exec curl \"$@\" --data '" + RPC_BODY + "' --write-out '\\n%{http_code}' "
             "'http://" + pair["postgrest_name"] + ":3000" + RPC_PATH + "'")
    result = subprocess.run(h.DOCKER + ["exec", "-i"] + (["-e", "HC_RPC_TOKEN"] if token else []) +
                            [pair["db_id"], "/bin/sh", "-ec", shell], cwd=pair["cwd"], stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, env=h.LOCAL_ENV | ({"HC_RPC_TOKEN": token} if token else {}),
                            timeout=15, check=False)
    if result.returncode != 0 or len(result.stdout) > 65536 or len(result.stderr) > 65536:
        fail("private PostgREST HTTP request failed")
    try:
        body, raw_status = result.stdout.rsplit(b"\n", 1)
        status = int(raw_status)
        parsed = json.loads(body) if body else None
    except (ValueError, UnicodeDecodeError):
        fail("private PostgREST HTTP response is malformed")
    if not isinstance(parsed, (list, dict)):
        fail("private PostgREST HTTP response shape differs")
    return status, parsed


def wait_for_postgrest(pair: dict) -> None:
    for _ in range(30):
        try:
            status, _body = private_rpc(pair, service_token(pair["jwt_secret"]))
            if status == 200:
                return
        except (RuntimeError, OSError, subprocess.TimeoutExpired):
            pass
        time.sleep(1)
    fail("PostgREST did not become ready on the private network")


def smoke(pair: dict) -> dict:
    token = service_token(pair["jwt_secret"])
    service_status, service_body = private_rpc(pair, token)
    anonymous_status, anonymous_body = private_rpc(pair, None)
    if (service_status != 200 or not isinstance(service_body, list) or len(service_body) != 1
            or not isinstance(service_body[0], dict)
            or set(service_body[0]) != {"allowed", "remaining", "reset_at"}):
        fail("service-role consume_rate_limit response differs")
    if anonymous_status not in {401, 403} or not isinstance(anonymous_body, dict):
        fail("anonymous consume_rate_limit was not denied")
    return {"service_status": service_status, "anonymous_status": anonymous_status,
            "service_rows": len(service_body), "anonymous_rows": 0}


def cleanup_postgrest(pair: dict) -> None:
    container_id = pair.get("postgrest_id")
    if container_id is None:
        return
    if (not isinstance(pair.get("cwd"), Path) or
            not all(isinstance(pair.get(name), str) for name in ("run_id", "network_id", "network_name", "postgrest_name", "postgrest_image", "db_id", "auth_id"))):
        fail("PostgREST cleanup ownership is incomplete")
    claimed = set(h.docker(["ps", "-aq", "--no-trunc", "--filter", f"label={h.LABEL}={pair['run_id']}"], cwd=pair["cwd"], timeout=20).split())
    expected = {pair["db_id"], pair["auth_id"], container_id}
    if claimed != expected:
        (pair["workdir"] / "retain-resources").write_text("uncertain PostgREST container ownership\n", encoding="utf-8")
        fail("PostgREST cleanup requires exactly captured owned container IDs")
    info = h.inspect_container(container_id, pair["cwd"])
    h.assert_container(info, container_id=container_id, name=pair["postgrest_name"], image_id=pair["postgrest_image"],
                       run_id=pair["run_id"], network_id=pair["network_id"], running=bool(info.get("running")))
    h.docker(["rm", "-f", "-v", container_id], cwd=pair["cwd"], timeout=30)
    h.assert_network(h.inspect_network(pair["network_id"], pair["cwd"]), network_id=pair["network_id"],
                     name=pair["network_name"], run_id=pair["run_id"], expected_ids={pair["db_id"], pair["auth_id"]}, exact=True)
    pair["postgrest_id"] = None


def run_fixture(callback: Callable[[dict], dict]) -> dict:
    """Run ``callback(pair)`` while the private services are alive.

    The in-memory dictionary supplies ``db_id``, ``password``, ``auth_name``,
    ``postgrest_id``, ``postgrest_name``, and ``jwt_secret``.  Callers may
    pass those values only to a child environment; they must not log or return
    them.  The helper always removes the verified PostgREST ID before handing
    the pair to the original guarded cleanup.
    """
    if not callable(callback):
        fail("fixture callback must be callable")
    h.require_local_docker(ROOT)
    pins = h.source_pins()
    inputs = h.migration_inputs(pins)
    if len(inputs) != len(pins["migrations"]):
        fail("expected exactly the pinned migration count")
    pair = h.empty_pair(1)
    try:
        h.create_pair(pair, synthetic_signup=True)
        h.wait_for_auth(pair["auth_id"], pair["db_id"], pair["cwd"], pair["password"])
        for _name, content, digest in inputs:
            if hashlib.sha256(content).hexdigest() != digest:
                fail("reviewed migration bytes changed before execution")
            h.psql(pair["db_id"], pair["cwd"], pair["password"], content.decode())
        if h.psql(pair["db_id"], pair["cwd"], pair["password"], h.DEMO_COUNTS).splitlines() != [
                "event_sale_items:0", "event_sales:0", "ledger_entries:0", "order_items:0", "orders:0"]:
            fail("fresh provider fixture contains commercial transaction rows")
        start_postgrest(pair)
        result = callback(pair)
        if not isinstance(result, dict):
            fail("fixture callback result must be a receipt object")
        return result
    finally:
        try:
            cleanup_postgrest(pair)
        finally:
            h.cleanup(pair)


def main() -> int:
    if len(sys.argv) != 1:
        fail("provider fixture accepts no URLs, credentials, ports, or arguments")
    receipt = run_fixture(smoke)
    print(json.dumps({"status": "PASS", "checks": receipt, "migration_count": len(h.source_pins()["migrations"]),
                      "postgrest_image": POSTGREST_ID, "published_host_ports": 0,
                      "cleanup": {"owned_containers": 0, "owned_networks": 0, "owned_workdirs": 0}}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "FAIL", "reason": redact(str(error))}, sort_keys=True))
        raise SystemExit(1)
