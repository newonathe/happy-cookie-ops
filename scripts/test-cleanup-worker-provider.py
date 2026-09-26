#!/usr/bin/env python3
"""Disposable, private provider acceptance for the local scheduled Worker."""
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


def load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


provider = load("cleanup_provider", "test-pages-provider-fixture.py")
auth = load("cleanup_auth", "test-auth-http-fixture.py")
repository = load("cleanup_repository", "test-session-repository.py")
runtime = load("cleanup_runtime", "test-pages-runtime-provider.py")


def fail(marker: str) -> None:
    raise RuntimeError(marker)


def count(pair: dict, statement: str, expected: str, marker: str) -> None:
    actual = provider.h.psql(pair["db_id"], pair["cwd"], pair["password"], statement).strip()
    if actual != expected:
        fail(marker)


def verify(pair: dict) -> dict:
    email = "fixture-" + secrets.token_hex(12) + "@example.test"
    password = secrets.token_urlsafe(30)
    status, _ = auth.http(pair, "/signup", body={"email": email, "password": password})
    if status != 200:
        fail("synthetic_signup_failed")
    user_id = provider.h.psql(pair["db_id"], pair["cwd"], pair["password"],
                              "select id from auth.users where email=" + repository.q(email) + ";").strip()
    if not repository.UUID.fullmatch(user_id):
        fail("synthetic_user_invalid")
    repository.activate_profile(pair, user_id, role="owner")
    count(pair, "select count(*) from hco_private.bff_sessions;", "0", "initial_bff_rows")
    baseline_session_ids = provider.h.psql(
        pair["db_id"], pair["cwd"], pair["password"],
        "select coalesce(string_agg(id::text, ',' order by id), '') from auth.sessions "
        "where user_id=" + repository.q(user_id) + "::uuid;").strip()
    if not baseline_session_ids or not all(repository.UUID.fullmatch(value)
                                           for value in baseline_session_ids.split(',')):
        fail("initial_provider_sessions_invalid")
    ca, cert, key, ca_hash = runtime.certificate(pair)
    state = pair["workdir"] / "cleanup-wrangler-state"
    state.mkdir()
    node = shutil.which("node.exe", path=provider.h.LOCAL_ENV.get("PATH"))
    if node is None or runtime.exact_tool([node, "--version"], ROOT).strip() != b"v24.20.0":
        fail("pinned_node_unavailable")
    if not (ROOT / "node_modules" / "wrangler" / "bin" / "wrangler.js").is_file():
        fail("pinned_wrangler_missing")
    env = provider.h.LOCAL_ENV | {
        "CI": "1", "NODE_ENV": "test", "HCO_CLEANUP_DB_ID": pair["db_id"],
        "HCO_CLEANUP_AUTH_NAME": pair["auth_name"],
        "HCO_CLEANUP_REST_NAME": pair["postgrest_name"],
        "HCO_CLEANUP_EMAIL": email, "HCO_CLEANUP_PASSWORD": password,
        "HCO_CLEANUP_SERVICE_JWT": provider.service_token(pair["jwt_secret"]),
        "HCO_CLEANUP_CA": str(ca), "HCO_CLEANUP_CERT": str(cert),
        "HCO_CLEANUP_KEY": str(key), "HCO_CLEANUP_STATE": str(state),
    }
    pnpm = shutil.which("pnpm.cmd", path=provider.h.LOCAL_ENV.get("PATH"))
    if pnpm is None:
        fail("pinned_pnpm_unavailable")
    result = subprocess.run([pnpm, "exec", "vitest", "run", "--config", "vitest.mp08o4.config.ts"],
                            cwd=ROOT, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=150, check=False)
    # Vitest resolves TypeScript dependencies. Never print its raw output or stderr.
    receipts = re.findall(rb"CLEANUP_RECEIPT (\{[^\r\n]{1,4096}\})", result.stdout)
    if result.returncode or len(receipts) != 1:
        match = re.search(rb"CLEANUP_FAIL ([a-z_]+):([a-z_]+)", result.stdout[:8192])
        if match:
            fail("child_" + b"_".join(match.groups()).decode("ascii"))
        if receipts:
            fail("child_postreceipt_failure")
        fail("child_no_receipt")
    receipt = json.loads(receipts[0])
    if receipt != {"empty": {"claimed": 0, "completed": 0, "failed": 0, "timedOut": 0},
                   "cooldown": {"claimed": 0, "completed": 0, "failed": 0, "timedOut": 0},
                   "revoked": {"claimed": 1, "completed": 1, "failed": 0, "timedOut": 0},
                   "negative_key_denied": True, "tls_negative_control": True,
                   "ordinary_fetch_status": 500, "gateway_loopback": True,
                   "wrangler_loopback": True, "provider_calls": receipt.get("provider_calls")} or \
            type(receipt.get("provider_calls")) is not int or not 3 <= receipt["provider_calls"] <= 12:
        fail("child_receipt_invalid")
    uid = repository.q(user_id)
    count(pair, "select count(*) from hco_private.bff_sessions b left join auth.sessions s "
          "on s.id=b.provider_session_id where b.user_id=" + uid + "::uuid and "
          "b.state='revoked' and b.cleanup_state='complete' and b.credential_envelope is null "
          "and b.cleanup_completed_at is not null and s.id is null;", "1", "final_cleanup_invalid")
    count(pair, "select count(*) from hco_private.bff_sessions;", "1", "final_bff_count")
    count(pair, "select coalesce(string_agg(id::text, ',' order by id), '') "
          "from auth.sessions where user_id=" + uid + "::uuid;",
          baseline_session_ids, "unrelated_provider_sessions_changed")
    count(pair, "select count(*) from public.profiles where id=" + uid +
          "::uuid and role='owner'::public.app_role and active=true;", "1", "profile_changed")
    return {"scheduled_empty": receipt["empty"], "scheduled_cooldown": receipt["cooldown"],
            "scheduled_revoked": receipt["revoked"],
            "negative_key_denied": True, "tls_negative_control": True,
            "provider_calls": receipt["provider_calls"], "ca_sha256": ca_hash,
            "final_sql": "PASS"}


def main() -> int:
    if len(sys.argv) != 1:
        fail("fixture_accepts_no_arguments")
    checks = provider.run_fixture(verify)
    print(json.dumps({"status": "PASS", "checks": checks, "migration_count": 27,
                      "published_provider_ports": 0,
                      "cleanup": {"owned_containers": 0, "owned_networks": 0,
                                  "owned_workdirs": 0}}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired, ValueError) as error:
        marker = str(error)
        if not re.fullmatch(r"[a-z_]+", marker):
            marker = "cleanup_fixture_failed"
        print(json.dumps({"status": "FAIL", "reason": marker}))
        raise SystemExit(1)
