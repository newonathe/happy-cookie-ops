#!/usr/bin/env python3
"""Run the real local Pages composition against owned private Auth/PostgREST HTTP."""
from __future__ import annotations

import importlib.util
import json
import re
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / file)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


p = load("mp08n_provider", "test-pages-provider-fixture.py")
auth = load("mp08n_auth_http", "test-auth-http-fixture.py")
repository = load("mp08n_repository", "test-session-repository.py")


def fail(message: str) -> None:
    raise RuntimeError(message)


def timing_receipt(output: str) -> dict | None:
    match = re.search(r"FIXTURE_TIMING (\{[^\r\n]*\})", output)
    if not match:
        return None
    try:
        raw = json.loads(match.group(1))
        phases = {key: value for key, value in raw["phaseMs"].items()
                  if key in ("login", "refresh") and type(value) is int and 0 <= value <= 180_000}
        calls = [{"operation": call["operation"], "elapsed_ms": call["elapsedMs"],
                  "outcome": call["outcome"]} for call in raw["providerCalls"][:32]
                 if isinstance(call, dict)
                 and isinstance(call.get("operation"), str)
                 and re.fullmatch(r"(?:auth|rest)_[a-z_]{1,80}", call["operation"])
                 and type(call.get("elapsedMs")) is int and 0 <= call["elapsedMs"] <= 180_000
                 and isinstance(call.get("outcome"), str)
                 and re.fullmatch(r"(?:http_[1-5]\d\d|failed|aborted)", call["outcome"])]
        return {"phase_ms": phases, "provider_calls": calls}
    except (KeyError, TypeError, ValueError, AttributeError):
        return None


def verify(pair: dict) -> dict:
    email = "fixture-" + secrets.token_hex(12) + "@example.test"
    password = secrets.token_urlsafe(30)
    status, _signup = auth.http(pair, "/signup", body={"email": email, "password": password})
    if status != 200:
        fail("synthetic owner signup failed")
    user_id = p.h.psql(pair["db_id"], pair["cwd"], pair["password"],
                       "select id from auth.users where email = " + repository.q(email) + ";").strip()
    if not repository.UUID.fullmatch(user_id):
        fail("synthetic owner identity did not resolve uniquely")
    repository.activate_profile(pair, user_id, role="owner")

    env = p.h.LOCAL_ENV | {
        "NODE_ENV": "test", "CI": "1",
        "HCO_MP08N_DB_ID": pair["db_id"],
        "HCO_MP08N_DB_PASSWORD": pair["password"],
        "HCO_MP08N_AUTH_NAME": pair["auth_name"],
        "HCO_MP08N_REST_NAME": pair["postgrest_name"],
        "HCO_MP08N_EMAIL": email,
        "HCO_MP08N_PASSWORD": password,
        "HCO_MP08N_USER_ID": user_id,
        "HCO_MP08N_SERVICE_JWT": p.service_token(pair["jwt_secret"]),
    }
    pnpm_command = shutil.which("pnpm.cmd", path=env.get("PATH"))
    if pnpm_command is None:
        fail("pinned local pnpm launcher is unavailable")
    try:
        result = subprocess.run(
            [pnpm_command, "exec", "vitest", "run", "--config", "vitest.mp08n.config.ts"],
            cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            timeout=180, check=False,
        )
    except OSError as error:
        fail("private integration test could not start: " + type(error).__name__ +
             ":" + str(getattr(error, "winerror", "unknown")))
    except subprocess.TimeoutExpired:
        fail("private integration test exceeded its deadline")
    # Never emit child output: failures may contain synthetic passwords or provider tokens.
    output = result.stdout.decode("utf-8", errors="replace")
    timing = timing_receipt(output)
    if result.returncode != 0:
        markers = [marker for marker in (
            "fixture_transport_unavailable", "fixture_http_invalid", "fixture_sql_check_failed",
            "fixture_cookie_contract_failed", "fixture_response_leak", "fixture_session_projection_invalid",
            "fixture_target_denied", "AssertionError", "Test timed out",
        ) if marker in output]
        stage = re.search(r"fixture_stage_[a-z_]+", output)
        if stage:
            markers.append(stage.group(0))
        http_status = re.search(r"fixture_(?:refresh|login)_http_\d{3}", output)
        if http_status:
            markers.append(http_status.group(0))
        locations = re.findall(r"pages-provider\.test\.ts:(\d+):\d+", output)
        if locations:
            markers.append("test_line_" + locations[-1])
        comparison = re.search(r"expected: (\d+)\s+received: (\d+)", output, re.I)
        if comparison:
            markers.append("expected_" + comparison.group(1) + "_received_" + comparison.group(2))
        fail("private integration test failed: " + (",".join(markers) if markers else "unclassified") +
             (" timing=" + json.dumps(timing, sort_keys=True) if timing else ""))
    return {"vitest_exit": 0, "integrated_test_files": 1,
            "provider_components": ["GoTrue", "PostgREST", "PostgreSQL"],
            "private_network": True, "timing": timing}


def main() -> int:
    if len(sys.argv) != 1:
        fail("private lifecycle fixture accepts no arguments")
    receipt = p.run_fixture(verify)
    print(json.dumps({"status": "PASS", "checks": receipt, "migration_count": 27,
                      "published_host_ports": 0,
                      "cleanup": {"owned_containers": 0, "owned_networks": 0,
                                  "owned_workdirs": 0}}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "FAIL", "reason": p.redact(str(error))}, sort_keys=True))
        raise SystemExit(1)
