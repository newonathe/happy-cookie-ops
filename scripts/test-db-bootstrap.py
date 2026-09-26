#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SUPABASE = ROOT / "node_modules/.pnpm/@supabase+cli-windows-x64@2.116.0/node_modules/@supabase/cli-windows-x64/bin/supabase.exe"
MIGRATIONS = ROOT / "supabase/migrations"
ASSERTIONS = ROOT / "tests/integration/db/bootstrap.sql"
PREFIX = ".hcb-bootstrap-"
DOCKER = ["docker", "--context", "default"]
LOCAL_ENV = {key: value for key, value in __import__("os").environ.items() if key.upper() in {"PATH", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "COMSPEC", "PATHEXT"}}
LOCAL_ENV["DOCKER_HOST"] = "npipe:////./pipe/docker_engine"
REPORT = ROOT / "docs/state/evidence/MP-05a-bootstrap.json"
IMAGE = "public.ecr.aws/supabase/postgres:15.8.1.085"
LABEL = "io.happy-cookie.bootstrap"


def fail(message: str) -> None:
    raise RuntimeError(message)

def safe_error(output: str) -> str:
    """Return only recognisable diagnostics; never persist raw CLI output."""
    lines = [re.sub(r'^psql:.*?:\s*(?=ERROR:|FATAL:)', '', line) for line in output.splitlines()]
    selected = [line.strip() for line in lines
                if re.match(r"\s*(?:ERROR:|FATAL:|Applying migration |failed to |error during connect)", line, re.I)]
    text = " ".join(selected[-4:]) or "raw command output suppressed"
    text = re.sub(r"(?:postgres(?:ql)?|https?)://\S+", "[redacted-url]", text, flags=re.I)
    text = re.sub(r"(?i)(password|token|jwt|apikey|api[_-]?key)\s*[=:]\s*\S+", r"\1=[redacted]", text)
    text = re.sub(r"eyJ[A-Za-z0-9_.-]+|sb_(?:secret|publishable)_[A-Za-z0-9_-]+", "[redacted-key]", text)
    text = re.sub(r"'[^']*'", "'[redacted-literal]'", text)
    return text[:1200]

def run(args: list[str], *, cwd: Path, timeout: int, input_text: str | None = None,
        extra_env: dict[str, str] | None = None) -> str:
    with subprocess.Popen(args, cwd=cwd, stdin=subprocess.PIPE, text=True, encoding="utf-8", errors="replace",
                          stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=LOCAL_ENV | (extra_env or {})) as child:
        try:
            output, _ = child.communicate(input_text, timeout=timeout)
        except subprocess.TimeoutExpired:
            try:
                subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], capture_output=True, timeout=10)
            finally:
                child.kill()
            child.communicate(timeout=10)
            fail(f"command exceeded {timeout}-second deadline; owned process terminated")
        if child.returncode:
            for value in (extra_env or {}).values():
                if value:
                    output = output.replace(value, "[redacted-generated-secret]")
            fail(f"command exit {child.returncode}: {safe_error(output)}")
        return output

def docker(args: list[str], *, cwd: Path, timeout: int, input_text: str | None = None) -> str:
    return run(DOCKER + args, cwd=cwd, timeout=timeout, input_text=input_text)

def require_local_docker(workdir: Path) -> None:
    host = docker(["context", "inspect", "default", "--format", "{{.Endpoints.docker.Host}}"], cwd=workdir, timeout=30).strip().lower()
    if host != LOCAL_ENV["DOCKER_HOST"]:
        fail("Docker default context does not match the pinned Windows local endpoint")
    docker(["version", "--format", "{{.Server.Version}}"], cwd=workdir, timeout=20)

def local_ports() -> tuple[int, int, int]:
    for base in range(45000 + secrets.randbelow(4000), 49000):
        ports = (base, base + 1, base + 2)
        probes: list[socket.socket] = []
        try:
            for port in ports:
                probe = socket.socket()
                probes.append(probe)
                probe.bind(("127.0.0.1", port))
            return ports
        except OSError:
            pass
        finally:
            for probe in probes:
                probe.close()
    fail("no free consecutive loopback ports for disposable Supabase project")

def expected_versions() -> list[str]:
    versions = []
    for path in sorted(MIGRATIONS.glob("[0-9]*_*.sql")):
        match = re.match(r"(\d+)_", path.name)
        if match:
            versions.append(match.group(1))
    expected = [str(20260101000000 + 100 * index) for index in range(27)]
    if versions != expected:
        fail("source migrations differ from the 27 reviewed contiguous versions")
    return versions

def copy_project(workdir: Path, project_id: str, ports: tuple[int, int, int]) -> None:
    destination = workdir / "supabase"
    shutil.copytree(MIGRATIONS, destination / "migrations")
    config = (ROOT / "supabase/config.toml").read_text(encoding="utf-8")
    parsed = tomllib.loads(config)
    if parsed.get("auth", {}).get("site_url") != "http://localhost:3000" or parsed.get("auth", {}).get("additional_redirect_urls") != ["http://localhost:3000"]:
        fail("source config auth URLs differ from the reviewed local-only URLs")
    remaining = config.replace("http://localhost:3000", "")
    if re.search(r"project_ref|https?://|postgres(?:ql)?://|env\(", remaining, re.I):
        fail("source config contains unreviewed external/environment references")
    config = re.sub(r'(?m)^project_id\s*=\s*"[^"]+"', f'project_id = "{project_id}"', config, count=1)
    for section, port in zip(("api", "db", "studio"), ports):
        pattern = rf"(?ms)(^\[{section}\]\s*.*?^port\s*=\s*)\d+"
        config, count = re.subn(pattern, rf"\g<1>{port}", config, count=1)
        if count != 1:
            fail(f"temporary config lacks one [{section}] port")
    (destination / "config.toml").write_text(config.rstrip() + "\n\n[db.seed]\nenabled = false\n", encoding="utf-8")
    (workdir / "owner.json").write_text(json.dumps({"project_id": project_id}), encoding="utf-8")
    if (destination / ".temp").exists() or (destination / "seed.sql").exists():
        fail("temporary project inherited a project link or seed fixture")

def owned(workdir: Path, project_id: str) -> bool:
    try:
        return (workdir.resolve() == workdir and workdir.parent == ROOT.parent.resolve()
                and not workdir.is_symlink() and not workdir.is_junction()
                and workdir.name == PREFIX + project_id.removeprefix("hcb-")
                and re.fullmatch(r"hcb-[a-f0-9]+-[a-f0-9]{6}", project_id) is not None
                and json.loads((workdir / "owner.json").read_text(encoding="utf-8"))["project_id"] == project_id)
    except (OSError, ValueError, KeyError):
        return False

def inspect_container(container_id: str, workdir: Path) -> dict:
    # Select metadata only: full inspect includes the generated password in Config.Env.
    fields = {"id": ".Id", "name": ".Name", "image": ".Image", "labels": ".Config.Labels",
              "bindings": ".HostConfig.PortBindings", "ports": ".NetworkSettings.Ports",
              "network": ".HostConfig.NetworkMode", "running": ".State.Running", "mounts": ".Mounts"}
    template = "{" + ",".join('"' + k + '":{{json ' + v + '}}' for k, v in fields.items()) + "}"
    return json.loads(docker(["inspect", "--format", template, container_id], cwd=workdir, timeout=20))


def assert_identity(info: dict, container_id: str, project_id: str, image_id: str) -> None:
    if (not re.fullmatch(r"[a-f0-9]{64}", container_id) or info["id"] != container_id
            or info["name"] != "/" + project_id or info["image"] != image_id
            or (info["labels"] or {}).get(LABEL) != project_id
            or any(mount["Type"] != "volume" for mount in info["mounts"])):
        fail("container identity, ownership, image or mount contract differs")


def assert_loopback(info: dict, port: int, *, running: bool = True) -> None:
    expected = {"5432/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(port)}]}
    if (info["bindings"] != expected or info["network"] != "bridge"
            or (running and (not info["running"] or info["ports"] != expected))):
        fail("disposable database does not have the exact loopback-only port binding")


def sql_for(versions: list[str]) -> str:
    values = ", ".join("'" + version + "'" for version in versions)
    template = ASSERTIONS.read_text(encoding="utf-8")
    if template.count("__EXPECTED_MIGRATIONS__") != 2:
        fail("bootstrap SQL expected-migration marker is invalid")
    return template.replace("__EXPECTED_MIGRATIONS__", values)


def psql(container_id: str, workdir: Path, sql: str) -> str:
    return docker(["exec", "-i", container_id, "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-A", "-t", "-F", "\t"], cwd=workdir, timeout=60, input_text=sql)


def normalize_schema_dump(schema: str) -> str:
    """Canonicalize only adjacent plain table grants for one identical object."""
    schema = re.sub(r"(?m)^\\(?:un)?restrict .*\n?", "", schema)
    lines = schema.splitlines(keepends=True)
    output, block, target = [], [], None
    pattern = re.compile(r'^GRANT [A-Z, ]+ ON TABLE (public\.[a-z_]+) TO [a-z_]+;\n?$')
    for line in lines:
        match = pattern.fullmatch(line)
        current = match.group(1) if match else None
        if current is None or current != target:
            output.extend(sorted(block))
            block = []
        if current is None:
            output.append(line)
        else:
            block.append(line)
        target = current
    output.extend(sorted(block))
    return ''.join(output)


def catalog(container_id: str, workdir: Path, sql: str) -> str:
    output = psql(container_id, workdir, sql)
    lines = sorted(line for line in output.splitlines() if line.strip())
    if not lines or any(line.count("\t") != 2 for line in lines):
        fail("catalog assertion emitted an invalid inventory")
    return "\n".join(lines)


def cleanup(workdir: Path, project_id: str, image_id: str) -> None:
    if not owned(workdir, project_id):
        fail("refusing cleanup of a non-owned project target")
    if (workdir / "retain-resources").exists():
        fail("dependent fixture cleanup failed; retain owned resources for inspection")
    ids = docker(["ps", "-aq", "--no-trunc", "--filter", f"label={LABEL}={project_id}"], cwd=workdir, timeout=20).split()
    if len(ids) > 1:
        fail("multiple containers claim this run; retain workdir for inspection")
    cid_path = workdir / "container.id"
    captured = cid_path.read_text().strip() if cid_path.is_file() else ""
    if ((ids or captured) and (not re.fullmatch(r"[a-f0-9]{64}", captured) or ids != [captured])):
        fail("cleanup requires the captured creation ID and exactly one matching owned container")
    for container_id in ids:
        assert_identity(inspect_container(container_id, workdir), container_id, project_id, image_id)
        docker(["rm", "-f", "-v", container_id], cwd=workdir, timeout=30)
    if docker(["ps", "-aq", "--filter", f"label={LABEL}={project_id}"], cwd=workdir, timeout=20).strip():
        fail("owned container remains after cleanup")
    shutil.rmtree(workdir)


def main(*, fail_after_start: bool = False, after_reset=None) -> int:
    if len(sys.argv) != 1:
        fail("this harness accepts no URLs, project refs, or other arguments")
    if not SUPABASE.is_file() or not ASSERTIONS.is_file():
        fail("pinned Supabase CLI or bootstrap SQL is missing")
    token = f"{int(time.time()):x}-{secrets.token_hex(3)}"
    project_id = f"hcb-{token}"
    workdir = ROOT.parent / f"{PREFIX}{token}"
    created = False
    image_id = ""
    report = {"status": "failed", "scope": "explicit-connection CLI reset on disposable loopback PostgreSQL; not managed --local or auth/RLS acceptance",
              "project_id": project_id, "workdir": str(workdir), "cleanup": "pending", "resets": 0,
              "harness_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              "assertions_sha256": hashlib.sha256(ASSERTIONS.read_bytes()).hexdigest(), "binding_checks": [],
              "source_hashes": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(MIGRATIONS.glob("*.sql"))}}
    try:
        workdir.mkdir()
        created = True
        (workdir / "owner.json").write_text(json.dumps({"project_id": project_id}), encoding="utf-8")
        require_local_docker(workdir)
        ports = local_ports()
        copy_project(workdir, project_id, ports)
        port = ports[0]  # Intentionally distinct from temporary config db.port (ports[1]).
        config = tomllib.loads((workdir / "supabase/config.toml").read_text())
        if port in {config["db"]["port"], config["db"].get("shadow_port", 54320)}:
            fail("explicit target would select CLI managed-local recreation")
        sql = sql_for(expected_versions())
        image_id = docker(["image", "inspect", "--format", "{{.Id}}", IMAGE], cwd=workdir, timeout=20).strip()
        password = secrets.token_urlsafe(32)
        run(DOCKER + ["create", "--name", project_id, "--label", f"{LABEL}={project_id}",
            "--cidfile", str(workdir / "container.id"), "--network", "bridge", "-p", f"127.0.0.1:{port}:5432",
            "-e", "POSTGRES_PASSWORD", image_id], cwd=workdir, timeout=30, extra_env={"POSTGRES_PASSWORD": password})
        container_id = (workdir / "container.id").read_text().strip()

        def check_binding(running: bool = True) -> None:
            info = inspect_container(container_id, workdir)
            assert_identity(info, container_id, project_id, image_id)
            assert_loopback(info, port, running=running)
            report["binding_checks"].append({"running_required": running, "bindings": info["ports"] if running else info["bindings"]})

        check_binding(False)
        docker(["start", container_id], cwd=workdir, timeout=30)
        check_binding()
        if fail_after_start:
            fail("injected failure after owned container startup")
        for attempt in range(45):
            try:
                docker(["exec", container_id, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], cwd=workdir, timeout=5)
                break
            except RuntimeError:
                time.sleep(1)
        else:
            fail("disposable PostgreSQL did not become ready")
        version = psql(container_id, workdir, "show server_version_num;").strip()
        if not version.isdigit() or int(version) // 10000 != 15:
            fail("disposable server is not PostgreSQL 15")
        cli_version = run([str(SUPABASE), "--version"], cwd=workdir, timeout=20).splitlines()[0]
        if cli_version != "2.116.0":
            fail("installed Supabase CLI differs from the reviewed pinned version")
        report.update(database_image=image_id, postgres_version_num=version, cli_version=cli_version,
                      loopback_port=port, container_id=container_id)
        inventories, schemas = [], []
        target = f"postgresql://postgres@127.0.0.1:{port}/postgres?sslmode=disable&connect_timeout=5"
        for cycle in range(2):
            check_binding()
            print(f"Running explicit loopback CLI reset {cycle + 1} and catalog assertions.", flush=True)
            run([str(SUPABASE), "db", "reset", "--workdir", str(workdir), "--yes", "--no-seed", "--db-url", target],
                cwd=workdir, timeout=120, extra_env={"PGPASSWORD": password})
            check_binding()
            inventories.append(catalog(container_id, workdir, sql))
            if psql(container_id, workdir, "select to_regclass('public.mp05_reset_sentinel') is null;").strip() != "t":
                fail("reset did not remove the disposable sentinel table")
            schema = docker(["exec", container_id, "pg_dump", "-U", "postgres", "-d", "postgres", "--schema-only", "--schema=public"], cwd=workdir, timeout=30)
            schemas.append(normalize_schema_dump(schema))
            if after_reset is not None:
                after_reset(container_id, workdir, password, report)
                check_binding()
            report["resets"] = cycle + 1
            if cycle == 0:
                psql(container_id, workdir, "create table public.mp05_reset_sentinel (id integer); insert into public.mp05_reset_sentinel values (1);")
        if inventories[0] != inventories[1] or schemas[0] != schemas[1]:
            # Preserve exact schema-only evidence; do not normalize away real drift.
            import difflib
            report['reset_catalog_diff'] = list(difflib.unified_diff(
                inventories[0].splitlines(), inventories[1].splitlines(), lineterm=''))
            report['reset_schema_diff'] = list(difflib.unified_diff(
                schemas[0].splitlines(), schemas[1].splitlines(), lineterm=''))
            fail("catalog or public schema differs across two explicit loopback resets")
        report.update(status="passed", expected_versions=expected_versions(), catalog=inventories[0].splitlines(),
                      catalog_sha256=hashlib.sha256(inventories[0].encode()).hexdigest(), catalogs_equal=True,
                      schema_sha256=hashlib.sha256(schemas[0].encode()).hexdigest(), schemas_equal=True, sentinel_removed=True)
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        report["error"] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
    finally:
        if created:
            try:
                cleanup(workdir, project_id, image_id)
                report["cleanup"] = "passed"
            except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
                report.update(status="failed", cleanup="failed; owned workdir retained", cleanup_error=type(error).__name__)
        REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report.get(key) for key in ("status", "error", "cleanup")}))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"bootstrap replay failed: {error}", file=sys.stderr)
        raise SystemExit(1)
