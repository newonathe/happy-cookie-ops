#!/usr/bin/env python3
"""Disposable local MP-08n.3 Workerd/provider TLS acceptance wrapper.

No command-line arguments, provider output, credentials, or raw child logs enter
the receipt. The existing fixture owns and verifies all Docker resources.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import secrets
import shutil
import subprocess
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


provider = load("mp08n3_provider", "test-pages-provider-fixture.py")
auth = load("mp08n3_auth", "test-auth-http-fixture.py")
repository = load("mp08n3_repository", "test-session-repository.py")


def fail(marker: str) -> None:
    raise RuntimeError(marker)


def exact_tool(command: list[str], cwd: Path, timeout: int = 15) -> bytes:
    result = subprocess.run(command, cwd=cwd, env=provider.h.LOCAL_ENV, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=timeout, check=False)
    if result.returncode != 0:
        fail("local_tool_failed")
    return result.stdout


def find_openssl() -> str:
    candidates = [Path("C:/Program Files/Git/usr/bin/openssl.exe"),
                  Path("C:/Program Files/Git/mingw64/bin/openssl.exe")]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    fail("git_openssl_unavailable")


def preflight() -> None:
    node = shutil.which("node.exe", path=provider.h.LOCAL_ENV.get("PATH"))
    if node is None or exact_tool([node, "--version"], ROOT).strip() != b"v24.20.0":
        fail("pinned_node_unavailable")
    find_openssl()
    if not (ROOT / "build" / "pages-spike" / "public").is_dir():
        fail("pages_export_missing")
    if not (ROOT / "node_modules" / "wrangler" / "bin" / "wrangler.js").is_file():
        fail("pinned_wrangler_missing")
    if any(path.name.startswith((".env", ".dev.vars")) for path in (ROOT / "spikes" / "pages").iterdir()):
        fail("pages_env_file_present")


def certificate(pair: dict) -> tuple[Path, Path, Path, str]:
    openssl = find_openssl()
    directory = pair["workdir"] / "runtime-tls"
    directory.mkdir()
    ca_key, ca_cert = directory / "ca-key.pem", directory / "ca.pem"
    leaf_key, csr, leaf_cert = directory / "leaf-key.pem", directory / "leaf.csr", directory / "leaf.pem"
    ext = directory / "leaf-ext.cnf"
    ext.write_text("subjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\n"
                   "keyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n", encoding="ascii")
    exact_tool([openssl, "req", "-x509", "-newkey", "rsa:2048", "-sha256", "-nodes",
                "-keyout", str(ca_key), "-out", str(ca_cert), "-days", "1",
                "-subj", "/CN=HCO MP08n3 local test CA",
                "-addext", "basicConstraints=critical,CA:TRUE",
                "-addext", "keyUsage=critical,keyCertSign,cRLSign"], directory, 30)
    exact_tool([openssl, "req", "-new", "-newkey", "rsa:2048", "-sha256", "-nodes",
                "-keyout", str(leaf_key), "-out", str(csr),
                "-subj", "/CN=127.0.0.1"], directory, 30)
    exact_tool([openssl, "x509", "-req", "-in", str(csr), "-CA", str(ca_cert),
                "-CAkey", str(ca_key), "-CAcreateserial", "-out", str(leaf_cert),
                "-days", "1", "-sha256", "-extfile", str(ext)], directory, 30)
    der = exact_tool([openssl, "x509", "-in", str(ca_cert), "-outform", "DER"], directory)
    if not der:
        fail("ca_certificate_missing")
    return ca_cert, leaf_cert, leaf_key, hashlib.sha256(der).hexdigest()


def stop_tree(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/pid", str(process.pid), "/t", "/f"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8, check=False)
    else:
        process.kill()
    try:
        process.wait(timeout=8)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=8)


def sql_count(pair: dict, statement: str, expected: str, marker: str) -> None:
    output = provider.h.psql(pair["db_id"], pair["cwd"], pair["password"], statement).strip()
    if output != expected:
        fail(marker)


def final_sql(pair: dict, user_id: str, baseline_session_ids: str) -> None:
    uid = repository.q(user_id)
    sql_count(pair, "select count(*) from hco_private.bff_sessions b left join auth.sessions s "
              "on s.id=b.provider_session_id where b.user_id=" + uid + "::uuid "
              "and b.state='revoked' and b.cleanup_state='complete' "
              "and b.credential_envelope is null and b.cleanup_completed_at is not null and s.id is null;",
              "1", "final_revocation_sql_invalid")
    sql_count(pair, "select count(*) from hco_private.bff_sessions;", "1", "final_session_count_invalid")
    sql_count(pair, "select count(*) from public.profiles where id=" + uid +
              "::uuid and role='helper'::public.app_role and active=true;", "1", "final_role_sql_invalid")
    sql_count(pair, "select coalesce(string_agg(id::text, ',' order by id), '') "
              "from auth.sessions where user_id=" + uid + "::uuid;",
              baseline_session_ids, "unrelated_auth_sessions_changed")


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
    baseline_session_ids = provider.h.psql(
        pair["db_id"], pair["cwd"], pair["password"],
        "select coalesce(string_agg(id::text, ',' order by id), '') "
        "from auth.sessions where user_id=" + repository.q(user_id) + "::uuid;").strip()
    if baseline_session_ids and not all(repository.UUID.fullmatch(value)
                                    for value in baseline_session_ids.split(',')):
        fail("baseline_auth_sessions_invalid")
    ca, cert, key, fingerprint = certificate(pair)
    node = shutil.which("node.exe", path=provider.h.LOCAL_ENV.get("PATH"))
    assert node is not None
    state = pair["workdir"] / "wrangler-state"
    state.mkdir()
    env = provider.h.LOCAL_ENV | {
        "NODE_ENV": "test", "CI": "1", "HCO_MP08N_DB_ID": pair["db_id"],
        "HCO_MP08N_AUTH_NAME": pair["auth_name"], "HCO_MP08N_REST_NAME": pair["postgrest_name"],
        "HCO_MP08N_EMAIL": email, "HCO_MP08N_PASSWORD": password,
        "HCO_MP08N_USER_ID": user_id, "HCO_MP08N_SERVICE_JWT": provider.service_token(pair["jwt_secret"]),
        "HCO_MP08N_CA_PATH": str(ca), "HCO_MP08N_CERT_PATH": str(cert),
        "HCO_MP08N_KEY_PATH": str(key), "HCO_MP08N_STATE_PATH": str(state),
    }
    child = subprocess.Popen([node, "--experimental-strip-types", str(ROOT / "scripts" /
                              "test-pages-runtime-provider.mjs")], cwd=ROOT, env=env,
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    watchdog = threading.Timer(120, stop_tree, args=(child,))
    watchdog.start()
    try:
        assert child.stdout is not None and child.stdin is not None
        first = child.stdout.readline().decode("utf-8", errors="replace").strip()
        if first != "RUNTIME_ROLE_CHANGE":
            early = re.fullmatch(r"RUNTIME_FAIL ([a-z_]+):([a-z_]+(?:_http_\d{3})?):g(\d+):p(\d+):d(\d+):u(\d+):t(\d+)", first)
            fail("runtime_" + "_".join(early.groups())
                 if early else "runtime_failed_before_role_change")
        provider.h.psql(pair["db_id"], pair["cwd"], pair["password"],
                         "update public.profiles set role='helper'::public.app_role where id=" +
                         repository.q(user_id) + "::uuid;")
        child.stdin.write(b"ROLE_CHANGED\n")
        child.stdin.flush()
        child.stdin.close()
        child.stdin = None
        stdout, _stderr = child.communicate(timeout=80)
        if child.returncode != 0:
            match = re.search(rb"RUNTIME_FAIL ([a-z_]+):([a-z_]+(?:_http_\d{3})?):g(\d+):p(\d+):d(\d+):u(\d+):t(\d+)", stdout)
            fail("runtime_" + "_".join(group.decode("ascii") for group in match.groups())
                 if match else "runtime_child_failed")
        receipts = [line[16:] for line in stdout.splitlines() if line.startswith(b"RUNTIME_RECEIPT ")]
        if len(receipts) != 1 or len(receipts[0]) > 4096:
            fail("runtime_receipt_invalid")
        receipt = json.loads(receipts[0])
        expected = {"denied_origin": 403, "denied_method": 405, "login": 200,
                    "read": 200, "denied_csrf": 403, "refresh": 200,
                    "changed_role": 200, "logout": 204, "post_logout": 401}
        if receipt.get("statuses") != expected or receipt.get("tls_negative_control") is not True or \
                receipt.get("gateway_loopback") is not True or receipt.get("wrangler_loopback") is not True or \
                not isinstance(receipt.get("provider_calls"), int) or receipt["provider_calls"] < 8:
            fail("runtime_receipt_contract_invalid")
        times = receipt.get("times")
        if not isinstance(times, dict) or set(times) != {"login_ms", "refresh_ms"} or any(
                type(value) is not int or value < 0 or value > 6000 for value in times.values()):
            fail("runtime_timing_invalid")
        final_sql(pair, user_id, baseline_session_ids)
        return {"statuses": expected, "timing_ms": times,
                "tls_negative_control": True, "ca_sha256": fingerprint,
                "provider_calls": receipt["provider_calls"], "final_sql": "PASS"}
    finally:
        watchdog.cancel()
        stop_tree(child)


def main() -> int:
    if len(sys.argv) != 1:
        fail("runtime_fixture_accepts_no_arguments")
    preflight()
    result = provider.run_fixture(verify)
    print(json.dumps({"status": "PASS", "checks": result, "migration_count": 27,
                      "published_provider_ports": 0,
                      "cleanup": {"owned_containers": 0, "owned_networks": 0,
                                  "owned_workdirs": 0}}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired, ValueError) as error:
        # Only fixed, synthetic failure markers are emitted; raw provider output is discarded.
        marker = str(error)
        if not re.fullmatch(r"[a-z0-9_]+", marker):
            marker = "runtime_fixture_failed"
        print(json.dumps({"status": "FAIL", "reason": marker}, sort_keys=True))
        raise SystemExit(1)
