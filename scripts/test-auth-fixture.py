#!/usr/bin/env python3
"""Disposable private-network GoTrue fixture for the MP-08g metadata preflight.

This program accepts no arguments and never reads project configuration, hosted
credentials, or Auth rows.  Its only output is a redacted, metadata-only receipt.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEV_PARENT = ROOT.parent.resolve()
MIGRATIONS = ROOT / "supabase" / "migrations"
PREFLIGHT = ROOT / "tests" / "integration" / "auth" / "provider-session-preflight.sql"
PINS = ROOT / "tests" / "fixtures" / "mp08g-source-pins.json"
DOCKER = ["docker", "--context", "default"]
LOCAL_ENV = {k: v for k, v in os.environ.items() if k.upper() in {
    "PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA",
    "APPDATA", "COMSPEC", "PATHEXT"}}
LOCAL_ENV["DOCKER_HOST"] = "npipe:////./pipe/docker_engine"
POSTGRES_IMAGE = "public.ecr.aws/supabase/postgres:15.8.1.085"
GOTRUE_IMAGE = "public.ecr.aws/supabase/gotrue:v2.196.0"
POSTGRES_ID = "sha256:af083ef64d0408c8f098ee6f5c364a59b26f36fbc0f3a334a62c5c1d57362e9b"
GOTRUE_ID = "sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232"
LABEL = "io.happy-cookie.auth-fixture"
PREFIX = ".hcb-auth-fixture-"


def fail(message: str) -> None:
    raise RuntimeError(message)


def safe_error(output: str) -> str:
    """Keep diagnostics useful without retaining child stdout, URLs, or secrets."""
    selected = [line.strip() for line in output.splitlines()
                if re.search(r"\b(?:error|fatal|failed|cannot)\b", line, re.I)]
    text = " ".join(selected[-3:]) or "child diagnostic suppressed"
    text = re.sub(r"(?i)(?:postgres(?:ql)?|https?)://\S+", "[redacted-url]", text)
    text = re.sub(r"(?i)(password|token|jwt|secret|key)\s*[=:]\s*\S+", r"\1=[redacted]", text)
    text = re.sub(r"eyJ[A-Za-z0-9_.-]+", "[redacted-token]", text)
    return text[:600]


def run(args: list[str], *, cwd: Path, timeout: int, input_text: str | None = None,
        extra_env: dict[str, str] | None = None) -> str:
    env = LOCAL_ENV | (extra_env or {})
    with subprocess.Popen(args, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, text=True, encoding="utf-8",
                          errors="replace", env=env) as child:
        try:
            output, _ = child.communicate(input_text, timeout=timeout)
        except subprocess.TimeoutExpired:
            child.kill()
            child.communicate(timeout=10)
            fail(f"child exceeded {timeout}-second deadline")
    if child.returncode:
        for secret in (extra_env or {}).values():
            output = output.replace(secret, "[redacted-generated-secret]")
        fail(f"child exit {child.returncode}: {safe_error(output)}")
    return output


def docker(args: list[str], *, cwd: Path, timeout: int, input_text: str | None = None,
           extra_env: dict[str, str] | None = None) -> str:
    return run(DOCKER + args, cwd=cwd, timeout=timeout, input_text=input_text, extra_env=extra_env)


def require_local_docker(cwd: Path) -> None:
    host = docker(["context", "inspect", "default", "--format", "{{.Endpoints.docker.Host}}"], cwd=cwd, timeout=20).strip().lower()
    if host != LOCAL_ENV["DOCKER_HOST"]:
        fail("Docker default context does not match the pinned Windows named pipe")
    docker(["version", "--format", "{{.Server.Version}}"], cwd=cwd, timeout=20)


def resolve_image(image: str, expected_id: str, cwd: Path) -> str:
    actual = docker(["image", "inspect", "--format", "{{.Id}}", image], cwd=cwd, timeout=20).strip()
    if actual != expected_id:
        fail("cached pinned image identity differs from the reviewed fixture pin")
    return actual


def source_pins() -> dict:
    pins = json.loads(PINS.read_text(encoding="utf-8"))
    if (set(pins) != {"schema_version", "preflight_sha256", "migrations"}
            or pins["schema_version"] != 1 or not isinstance(pins["migrations"], dict)
            or not re.fullmatch(r"[a-f0-9]{64}", pins["preflight_sha256"])):
        fail("reviewed MP-08g source pins are invalid")
    return pins


def migration_inputs(pins: dict | None = None) -> list[tuple[str, bytes, str]]:
    pins = pins or source_pins()
    paths = sorted(MIGRATIONS.glob("[0-9]*_*.sql"))
    expected_count = len(pins["migrations"])
    expected = [f"{20260101000000 + 100 * index:014d}" for index in range(expected_count)]
    if ([path.name[:14] for path in paths] != expected
            or set(pins["migrations"]) != {path.name for path in paths}
            or any(not re.fullmatch(r"[a-f0-9]{64}", value) for value in pins["migrations"].values())):
        fail(f"expected exactly {expected_count} reviewed application migration files")
    ddl = re.compile(r"(?im)^\s*(?:create\s+(?:or\s+replace\s+)?(?:table|function|schema|view|sequence)|alter\s+(?:table|function)|drop\s+(?:table|function|schema)|grant\b.*\bon|revoke\b.*\bon)\b[^;\n]*\bauth\s*\.")
    inputs = [(path.name, path.read_bytes(), "") for path in paths]
    if any(ddl.search(content.decode("utf-8")) for _name, content, _hash in inputs):
        fail("reviewed public migrations contain Auth-targeting DDL")
    captured = [(name, content, hashlib.sha256(content).hexdigest()) for name, content, _hash in inputs]
    if any(digest != pins["migrations"][name] for name, _content, digest in captured):
        fail("public migration bytes differ from reviewed MP-08g source pins")
    return captured


def owned(workdir: Path, run_id: str) -> bool:
    try:
        return (workdir.resolve() == workdir and workdir.parent == DEV_PARENT and not workdir.is_symlink()
                and not workdir.is_junction() and workdir.name == PREFIX + run_id
                and json.loads((workdir / "owner.json").read_text(encoding="utf-8")) == {"run_id": run_id})
    except (OSError, ValueError):
        return False


def inspect_container(container_id: str, cwd: Path) -> dict:
    fields = {"id": ".Id", "name": ".Name", "image": ".Image", "labels": ".Config.Labels",
              "mounts": ".Mounts", "network": ".HostConfig.NetworkMode", "bindings": ".HostConfig.PortBindings",
              "ports": ".NetworkSettings.Ports", "running": ".State.Running"}
    template = "{" + ",".join('"' + key + '":{{json ' + value + '}}' for key, value in fields.items()) + "}"
    return json.loads(docker(["inspect", "--format", template, container_id], cwd=cwd, timeout=20))


def inspect_network(network_id: str, cwd: Path) -> dict:
    template = '{"id":{{json .Id}},"name":{{json .Name}},"labels":{{json .Labels}},"driver":{{json .Driver}},"internal":{{json .Internal}},"containers":{{json .Containers}}}'
    return json.loads(docker(["network", "inspect", "--format", template, network_id], cwd=cwd, timeout=20))


def assert_container(info: dict, *, container_id: str, name: str, image_id: str, run_id: str,
                     network_id: str, running: bool) -> list[str]:
    if (info.get("id") != container_id or info.get("name") != "/" + name or info.get("image") != image_id
            or (info.get("labels") or {}).get(LABEL) != run_id or info.get("network") != network_id
            or info.get("running") is not running):
        fail("captured container identity or ownership differs")
    if info.get("bindings") not in (None, {}):
        fail("private fixture container has a published host port")
    ports = info.get("ports")
    if ports is not None and (not isinstance(ports, dict) or any(value is not None for value in ports.values())):
        fail("private fixture container has a published host port")
    mounts = info.get("mounts") or []
    if any(mount.get("Type") == "bind" for mount in mounts):
        fail("private fixture container has a host bind mount")
    return [mount["Name"] for mount in mounts if mount.get("Type") == "volume" and isinstance(mount.get("Name"), str)]


def assert_network(info: dict, *, network_id: str, name: str, run_id: str, expected_ids: set[str], exact: bool) -> None:
    endpoints = info.get("containers") or {}
    if (info.get("id") != network_id or info.get("name") != name
            or info.get("driver") != "bridge" or info.get("internal") is not True
            or (info.get("labels") or {}).get(LABEL) != run_id
            or (set(endpoints) != expected_ids if exact else not set(endpoints).issubset(expected_ids))):
        fail("private network identity or endpoint set differs")


def psql(container_id: str, cwd: Path, password: str, sql: str, *, user: str = "postgres") -> str:
    if user not in {"postgres", "supabase_admin"}:
        fail("private SQL role is outside the fixture allowlist")
    return docker(["exec", "-e", "PGPASSWORD", "-i", container_id, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", user,
                   "-d", "postgres", "-A", "-t", "-F", "\t"], cwd=cwd, timeout=60, input_text=sql,
                  extra_env={"PGPASSWORD": password})


def gotrue_environment_args(*, synthetic_signup: bool = False) -> list[str]:
    """Literal settings use Docker NAME=value syntax; secrets stay child-env pass-through."""
    literal = {
        "GOTRUE_API_HOST": "0.0.0.0", "GOTRUE_API_PORT": "9999", "GOTRUE_DB_DRIVER": "postgres",
        "GOTRUE_DB_DB_NAMESPACE": "auth", "GOTRUE_SITE_URL": "http://localhost:3000", "GOTRUE_JWT_EXP": "3600",
        "API_EXTERNAL_URL": "http://localhost:9999",
        "GOTRUE_DISABLE_SIGNUP": "true",
    }
    if synthetic_signup:
        literal.update({"GOTRUE_DISABLE_SIGNUP": "false", "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true",
                        "GOTRUE_MAILER_AUTOCONFIRM": "true"})
    args = [part for name, value in literal.items() for part in ("-e", f"{name}={value}")]
    return args + ["-e", "GOTRUE_DB_DATABASE_URL", "-e", "GOTRUE_JWT_SECRET"]


AUTH_CATALOG = """select entry from (
  select 'relation:'||c.relname||':'||c.relkind::text||':'||c.relowner::text||':'||coalesce(c.relacl::text,'')||':'||c.relrowsecurity::text
    as entry from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='auth'
  union all select 'column:'||c.relname||'.'||a.attname||':'||a.atttypid::text||':'||a.attnotnull::text||':'||a.atthasdef::text
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='auth' and a.attnum>0 and not a.attisdropped
  union all select 'function:'||p.proname||':'||pg_get_function_identity_arguments(p.oid)||':'||p.proowner::text||':'||coalesce(p.proacl::text,'')
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth'
) entries order by entry;"""
PUBLIC_CATALOG = """select n.nspname||'.'||c.relname||':'||c.relkind::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','v','m','S','f','p') order by 1;"""
DEMO_COUNTS = """select entry from (
  select 'orders:'||count(*) from public.orders
  union all select 'order_items:'||count(*) from public.order_items
  union all select 'event_sales:'||count(*) from public.event_sales
  union all select 'event_sale_items:'||count(*) from public.event_sale_items
  union all select 'ledger_entries:'||count(*) from public.ledger_entries
) counts(entry) order by entry;"""


def auth_schema_digest(db_id: str, cwd: Path, password: str) -> str:
    # Schema-only dump covers Auth policies, triggers, constraints, ACLs and
    # functions as well as tables. It never reads or emits row data.
    dump = docker(["exec", "-e", "PGPASSWORD", db_id, "pg_dump", "-U", "supabase_admin",
                   "-d", "postgres", "--schema=auth", "--schema-only", "--no-owner"],
                  cwd=cwd, timeout=60, extra_env={"PGPASSWORD": password})
    normalized = re.sub(r"(?m)^\\(?:un)?restrict\s+[^\n]*\n", "", dump)
    if "CREATE SCHEMA auth" not in normalized and "CREATE SCHEMA IF NOT EXISTS auth" not in normalized:
        fail("managed Auth schema dump is incomplete")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def parse_preflight(output: str) -> dict:
    records = [json.loads(line) for line in output.splitlines() if line.startswith("{")]
    if len(records) != 1:
        fail("unchanged provider metadata preflight did not yield one contract record")
    record = records[0]
    relations = record.get("relations") if isinstance(record, dict) else None
    expected = {"auth.sessions", "auth.users", "public.profiles"}
    if (not isinstance(record, dict) or set(record) != {"contract", "server_version_num", "relations"}
            or record["contract"] != "provider-session-v1"
            or not isinstance(record["server_version_num"], str)
            or not re.fullmatch(r"\d{5,6}", record["server_version_num"])
            or not isinstance(relations, list) or len(relations) != 3
            or any(not isinstance(item, dict) or set(item) != {"name", "owner", "rls", "acl"}
                   or not isinstance(item["owner"], str) or not isinstance(item["rls"], bool)
                   or item["acl"] is not None and not isinstance(item["acl"], str) for item in relations)
            or {item["name"] for item in relations} != expected):
        fail("provider metadata result shape or relation set differs")
    return record


def wait_for_auth(auth_id: str, db_id: str, cwd: Path, password: str) -> None:
    # The health request stays inside the container network and returns no response body.
    health = ["exec", auth_id, "/bin/sh", "-ec", "wget -q -T 2 -O /dev/null http://127.0.0.1:9999/health"]
    for _ in range(45):
        try:
            docker(health, cwd=cwd, timeout=5)
            tables = psql(db_id, cwd, password, "select to_regclass('auth.users'), to_regclass('auth.sessions');").strip()
            if tables == "auth.users\tauth.sessions":
                return
        except RuntimeError:
            pass
        time.sleep(1)
    fail("GoTrue did not reach private health and managed-schema readiness")


def wait_for_db(db_id: str, db_name: str, cwd: Path, password: str) -> None:
    # The image briefly runs an init-only Unix-socket server. GoTrue uses TCP,
    # so wait for the final TCP listener rather than accepting that transient.
    for _ in range(45):
        try:
            docker(["exec", db_id, "pg_isready", "-h", "127.0.0.1", "-p", "5432",
                    "-U", "postgres", "-d", "postgres"], cwd=cwd, timeout=5)
            break
        except RuntimeError:
            time.sleep(1)
    else:
        fail("private PostgreSQL did not become ready")
    # The bare image omits Compose's roles.sql password setup. Scope this to the
    # captured disposable DB, then prove the role can log in over network TCP.
    role = psql(db_id, cwd, password, "select rolname from pg_roles where rolname='supabase_auth_admin' and not rolsuper").strip()
    if role != "supabase_auth_admin":
        fail("private Auth database role contract differs")
    admin = psql(db_id, cwd, password, "select current_user, current_setting('is_superuser')", user="supabase_admin").strip()
    if admin != "supabase_admin\ton":
        fail("private database admin role contract differs")
    psql(db_id, cwd, password, "alter role supabase_auth_admin with password '" + password + "';", user="supabase_admin")
    login = docker(["exec", "-e", "PGPASSWORD", db_id, "psql", "-X", "-A", "-t",
                    "-h", db_name, "-U", "supabase_auth_admin", "-d", "postgres",
                    "-c", "select current_user"], cwd=cwd, timeout=5,
                   extra_env={"PGPASSWORD": password}).strip()
    if login != "supabase_auth_admin":
        fail("private Auth database role TCP login differs")


def cleanup(pair: dict) -> None:
    cwd, run_id, workdir = pair["cwd"], pair["run_id"], pair["workdir"]
    if not owned(workdir, run_id):
        fail("refusing cleanup of a non-owned fixture workdir")
    expected = {container_id for container_id in (pair.get("db_id"), pair.get("auth_id")) if container_id}
    claimed = set(docker(["ps", "-aq", "--no-trunc", "--filter", f"label={LABEL}={run_id}"], cwd=cwd, timeout=20).split())
    if claimed != expected:
        (workdir / "retain-resources").write_text("uncertain container ownership\n", encoding="utf-8")
        fail("cleanup requires exactly both captured owned container IDs")
    networks = set(docker(["network", "ls", "-q", "--no-trunc", "--filter", f"label={LABEL}={run_id}"], cwd=cwd, timeout=20).split())
    expected_network = {pair["network_id"]} if pair.get("network_id") else set()
    if networks != expected_network:
        (workdir / "retain-resources").write_text("uncertain network ownership\n", encoding="utf-8")
        fail("cleanup requires the captured exact owned network ID")
    if pair.get("network_id"):
        assert_network(inspect_network(pair["network_id"], cwd), network_id=pair["network_id"], name=pair["network_name"],
                       run_id=run_id, expected_ids=expected, exact=False)
    for container_id, name, image in ((pair.get("db_id"), pair["db_name"], pair.get("postgres_image")),
                                      (pair.get("auth_id"), pair["auth_name"], pair.get("gotrue_image"))):
        if not container_id:
            continue
        info = inspect_container(container_id, cwd)
        volumes = assert_container(info, container_id=container_id, name=name, image_id=image, run_id=run_id,
                                   network_id=pair["network_id"], running=bool(info.get("running")))
        pair["volumes"].update(volumes)
        docker(["rm", "-f", "-v", container_id], cwd=cwd, timeout=30)
    if docker(["ps", "-aq", "--filter", f"label={LABEL}={run_id}"], cwd=cwd, timeout=20).strip():
        fail("owned container remains after cleanup")
    if pair.get("network_id"):
        net = inspect_network(pair["network_id"], cwd)
        assert_network(net, network_id=pair["network_id"], name=pair["network_name"], run_id=run_id, expected_ids=set(), exact=True)
        docker(["network", "rm", pair["network_id"]], cwd=cwd, timeout=30)
    if docker(["network", "ls", "-q", "--no-trunc", "--filter", f"label={LABEL}={run_id}"], cwd=cwd, timeout=20).strip():
        fail("owned network remains after cleanup")
    for volume in pair["volumes"]:
        if docker(["volume", "ls", "-q", "--filter", f"name=^{volume}$"], cwd=cwd, timeout=20).strip():
            fail("captured owned volume remains after container cleanup")
    shutil.rmtree(workdir)


def empty_pair(index: int) -> dict:
    run_id = f"{int(time.time()):x}{index}-{secrets.token_hex(4)}"
    workdir = DEV_PARENT / (PREFIX + run_id)
    workdir.mkdir()
    (workdir / "owner.json").write_text(json.dumps({"run_id": run_id}), encoding="utf-8")
    return {"cwd": workdir, "run_id": run_id, "workdir": workdir, "network_name": f"hcb-auth-{run_id}",
            "db_name": f"hcb-auth-db-{run_id}", "auth_name": f"hcb-auth-gotrue-{run_id}", "volumes": set(), "network_id": None,
            "db_id": None, "auth_id": None, "postgres_image": None, "gotrue_image": None, "checks": {}}


def create_pair(pair: dict, *, synthetic_signup: bool = False) -> None:
    workdir, run_id = pair["cwd"], pair["run_id"]
    pair["postgres_image"] = resolve_image(POSTGRES_IMAGE, POSTGRES_ID, workdir)
    pair["gotrue_image"] = resolve_image(GOTRUE_IMAGE, GOTRUE_ID, workdir)
    for name in (pair["network_name"], pair["db_name"], pair["auth_name"]):
        if docker(["ps", "-aq", "--filter", f"name=^/{name}$"], cwd=workdir, timeout=20).strip():
            fail("fixture resource name collision")
    if (docker(["network", "ls", "-q", "--filter", f"name=^{pair['network_name']}$"], cwd=workdir, timeout=20).strip()
            or docker(["ps", "-aq", "--filter", f"label={LABEL}={run_id}"], cwd=workdir, timeout=20).strip()
            or docker(["network", "ls", "-q", "--filter", f"label={LABEL}={run_id}"], cwd=workdir, timeout=20).strip()):
        fail("fixture resource name or label collision")
    network_id = docker(["network", "create", "--driver", "bridge", "--internal", "--label", f"{LABEL}={run_id}", pair["network_name"]], cwd=workdir, timeout=30).strip()
    pair["network_id"] = network_id
    password, jwt = secrets.token_urlsafe(36), secrets.token_urlsafe(48)
    db_id = docker(["create", "--name", pair["db_name"], "--label", f"{LABEL}={run_id}", "--network", network_id,
                    "-e", "POSTGRES_PASSWORD", pair["postgres_image"]], cwd=workdir, timeout=30,
                   extra_env={"POSTGRES_PASSWORD": password}).strip()
    pair["db_id"] = db_id
    database_url = f"postgres://supabase_auth_admin:{password}@{pair['db_name']}:5432/postgres?sslmode=disable"
    auth_env = {"GOTRUE_DB_DATABASE_URL": database_url, "GOTRUE_JWT_SECRET": jwt}
    auth_id = docker(["create", "--name", pair["auth_name"], "--label", f"{LABEL}={run_id}", "--network", network_id,
                      *gotrue_environment_args(synthetic_signup=synthetic_signup), pair["gotrue_image"]],
                     cwd=workdir, timeout=30, extra_env=auth_env).strip()
    # This generated signing secret is deliberately retained only in the in-memory
    # pair.  A later local provider fixture needs to mint a disposable service-role
    # JWT that GoTrue and PostgREST verify with the same key.
    pair["auth_id"], pair["password"], pair["jwt_secret"] = auth_id, password, jwt
    expected = {db_id, auth_id}
    network_info = inspect_network(network_id, workdir)
    assert_network(network_info, network_id=network_id, name=pair["network_name"], run_id=run_id, expected_ids=expected, exact=False)
    pair["checks"]["network_before_start"] = {"driver": network_info["driver"], "internal": network_info["internal"],
                                                 "endpoint_count": len(network_info.get("containers") or {})}
    for cid, name, image in ((db_id, pair["db_name"], pair["postgres_image"]), (auth_id, pair["auth_name"], pair["gotrue_image"])):
        info = inspect_container(cid, workdir)
        pair["volumes"].update(assert_container(info, container_id=cid, name=name, image_id=image,
                                                  run_id=run_id, network_id=network_id, running=False))
        pair["checks"][name.removeprefix("hcb-auth-").split("-")[0] + "_before_start"] = {"bindings": info["bindings"], "ports": info["ports"]}
    docker(["start", db_id], cwd=workdir, timeout=30)
    wait_for_db(db_id, pair["db_name"], workdir, password)
    docker(["start", auth_id], cwd=workdir, timeout=30)
    for cid, name, image in ((db_id, pair["db_name"], pair["postgres_image"]), (auth_id, pair["auth_name"], pair["gotrue_image"])):
        info = inspect_container(cid, workdir)
        pair["volumes"].update(assert_container(info, container_id=cid, name=name, image_id=image,
                                                  run_id=run_id, network_id=network_id, running=True))
        pair["checks"][name.removeprefix("hcb-auth-").split("-")[0] + "_after_start"] = {"bindings": info["bindings"], "ports": info["ports"]}
    network_info = inspect_network(network_id, workdir)
    assert_network(network_info, network_id=network_id, name=pair["network_name"], run_id=run_id, expected_ids=expected, exact=True)
    pair["checks"]["network_after_start"] = {"driver": network_info["driver"], "internal": network_info["internal"],
                                                "endpoint_count": len(network_info.get("containers") or {})}


def execute_pair(index: int, inputs: list[tuple[str, bytes, str]], preflight: str) -> tuple[dict, str, dict]:
    pair = empty_pair(index)
    try:
        create_pair(pair)
        wait_for_auth(pair["auth_id"], pair["db_id"], pair["cwd"], pair["password"])
        before = psql(pair["db_id"], pair["cwd"], pair["password"], AUTH_CATALOG)
        schema_before = auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"])
        migration_hashes = []
        for name, content, digest in inputs:
            if hashlib.sha256(content).hexdigest() != digest:
                fail("captured migration bytes no longer match their recorded hash")
            psql(pair["db_id"], pair["cwd"], pair["password"], content.decode("utf-8"))
            migration_hashes.append(digest)
        after = psql(pair["db_id"], pair["cwd"], pair["password"], AUTH_CATALOG)
        schema_after = auth_schema_digest(pair["db_id"], pair["cwd"], pair["password"])
        if before != after or schema_before != schema_after:
            fail("public application migrations changed managed Auth catalog metadata")
        record = parse_preflight(psql(pair["db_id"], pair["cwd"], pair["password"], preflight))
        counts = psql(pair["db_id"], pair["cwd"], pair["password"], DEMO_COUNTS).splitlines()
        if counts != ["event_sale_items:0", "event_sales:0", "ledger_entries:0", "order_items:0", "orders:0"]:
            fail("fresh fixture contains demo transaction rows or transaction table set differs")
        result = {"postgres_image": pair["postgres_image"], "gotrue_image": pair["gotrue_image"],
                "migration_hashes": migration_hashes, "public_catalog": psql(pair["db_id"], pair["cwd"], pair["password"], PUBLIC_CATALOG).splitlines(),
                "auth_schema_sha256": schema_before, "preflight": record}
        return result, pair["run_id"], pair["checks"]
    finally:
        cleanup(pair)


def main() -> int:
    if len(sys.argv) != 1:
        fail("this fixture accepts no URLs, credentials, or other arguments")
    if not PREFLIGHT.is_file() or not MIGRATIONS.is_dir():
        fail("reviewed preflight or migration source is missing")
    pins = source_pins()
    inputs = migration_inputs(pins)
    preflight_bytes = PREFLIGHT.read_bytes()
    preflight_hash = hashlib.sha256(preflight_bytes).hexdigest()
    if preflight_hash != pins["preflight_sha256"]:
        fail("provider preflight bytes differ from reviewed MP-08g source pin")
    preflight = preflight_bytes.decode("utf-8")
    require_local_docker(ROOT)
    pairs = [execute_pair(1, inputs, preflight), execute_pair(2, inputs, preflight)]
    results, run_ids = [pair[0] for pair in pairs], [pair[1] for pair in pairs]
    if results[0] != results[1]:
        fail("fresh private fixture metadata differs across initializations")
    for run_id in run_ids:
        if (docker(["ps", "-aq", "--filter", f"label={LABEL}={run_id}"], cwd=ROOT, timeout=20).strip()
                or docker(["network", "ls", "-q", "--filter", f"label={LABEL}={run_id}"], cwd=ROOT, timeout=20).strip()
                or (DEV_PARENT / (PREFIX + run_id)).exists()):
            fail("owned fixture resource remains after two clean initializations")
    report = {"status": "PASS", "pairs": 2, "run_ids": run_ids,
              "pair_checks": [{"run_id": pair[1], "checks": pair[2], "cleanup": "passed"} for pair in pairs],
              "postgres_image": POSTGRES_ID, "gotrue_image": GOTRUE_ID,
              "preflight_sha256": preflight_hash,
              "migration_hashes": {name: digest for name, _content, digest in inputs},
              "auth_schema_sha256": results[0]["auth_schema_sha256"],
              "public_catalog_sha256": hashlib.sha256("\n".join(results[0]["public_catalog"]).encode()).hexdigest(),
              "preflight": results[0]["preflight"],
              "cleanup": {"owned_containers": 0, "owned_networks": 0, "owned_workdirs": 0}}
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print(json.dumps({"status": "FAIL", "error": safe_error(str(error))}))
        raise SystemExit(1)
