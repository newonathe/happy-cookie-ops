"""Generate/check schema types only from the owned MP-05.a fixture; no remote inputs."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
META_IMAGE = "public.ecr.aws/supabase/postgres-meta:v0.98.0"
DESTINATION = ROOT / "src/lib/types/database.ts"
EVIDENCE = ROOT / "docs/state/evidence"
INVENTORY_SQL = ROOT / "tests/integration/db/schema-inventory.sql"


def generate_one(db_id, workdir, password, report, image_id, cycle):
    name = report["project_id"] + f"-types-{cycle}"
    cidfile = workdir / f"types-{cycle}.id"
    env = {"PG_META_DB_URL": f"postgresql://postgres:{password}@127.0.0.1:5432/postgres?sslmode=disable",
           "PG_CONN_TIMEOUT_SECS": "15", "PG_QUERY_TIMEOUT_SECS": "15", "PG_META_GENERATE_TYPES": "typescript",
           "PG_META_GENERATE_TYPES_INCLUDED_SCHEMAS": "public",
           "PG_META_GENERATE_TYPES_DETECT_ONE_TO_ONE_RELATIONSHIPS": "true"}
    try:
        h.run(h.DOCKER + ["create", "--name", name, "--label", f"{h.LABEL}.types={name}",
              "--cidfile", str(cidfile), "--network", f"container:{db_id}",
              *[arg for key in env for arg in ("-e", key)], image_id, "node", "dist/server/server.js"],
              cwd=workdir, timeout=30, extra_env=env)
        cid = cidfile.read_text().strip()
        info = h.inspect_container(cid, workdir)
        if (not re.fullmatch(r"[a-f0-9]{64}", cid) or info["id"] != cid or info["name"] != "/" + name
                or info["image"] != image_id or info["labels"].get(h.LABEL + ".types") != name
                or info["network"] != f"container:{db_id}" or info["bindings"] or info["mounts"]):
            h.fail("generator container identity/isolation differs from owned plan")
        result = subprocess.run(h.DOCKER + ["start", "-a", cid], cwd=workdir, env=h.LOCAL_ENV,
                                text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=60)
        if result.returncode:
            h.fail("type generator failed: " + h.safe_error((result.stderr + result.stdout).replace(password, "[redacted]")))
        generated = result.stdout.replace("\r\n", "\n").strip() + "\n"
        if (not generated.startswith("export type Json =") or "export type Database =" not in generated
                or re.search(r"\bany\b|PLACEHOLDER|Record<string,", generated) or password in generated):
            h.fail("type generator did not emit a valid non-placeholder TypeScript artifact")
        return generated
    finally:
        try:
            if not h.owned(workdir, report["project_id"]):
                h.fail("generator cleanup workdir ownership differs")
            ids = h.docker(["ps", "-aq", "--no-trunc", "--filter", f"label={h.LABEL}.types={name}"], cwd=workdir, timeout=20).split()
            captured = cidfile.read_text().strip() if cidfile.is_file() else ""
            if (ids or captured) and (not re.fullmatch(r"[a-f0-9]{64}", captured) or ids != [captured]):
                h.fail("generator cleanup requires matching captured ID; resources retained")
            for cid in ids:
                info = h.inspect_container(cid, workdir)
                if info["id"] != cid or info["name"] != "/" + name or info["image"] != image_id or info["labels"].get(h.LABEL + ".types") != name:
                    h.fail("generator cleanup ownership differs; resources retained")
                h.docker(["rm", "-f", "-v", cid], cwd=workdir, timeout=30)
            if h.docker(["ps", "-aq", "--filter", f"label={h.LABEL}.types={name}"], cwd=workdir, timeout=20).strip():
                h.fail("generator remains after cleanup")
        except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired):
            # The parent must not erase generator ownership evidence on cleanup failure.
            (workdir / "retain-resources").write_text("generator cleanup needs inspection\n")
            raise


def finish_artifact(text, mode):
    if mode == "--check":
        if DESTINATION.read_bytes() != text.encode("utf-8"):
            h.fail("checked-in database types differ from the regenerated schema; run db:types")
    else:
        temporary = DESTINATION.with_suffix(".ts.pending")
        with temporary.open("x", encoding="utf-8", newline="\n") as output:
            output.write(text)
        temporary.replace(DESTINATION)


def main(*, evidence_prefix="MP-05b"):
    if not re.fullmatch(r"MP-\d{2}[a-z](?:[1-9]\d*)?", evidence_prefix):
        h.fail("invalid internal evidence prefix")
    if sys.argv[1:] not in (["--write"], ["--check"]):
        h.fail("choose --write or --check; external URLs/project refs are not accepted")
    mode = sys.argv[1]
    report = {"status": "failed", "mode": mode, "scope": "public schema types and catalog only; no auth/RLS acceptance"}
    original_hash = hashlib.sha256(DESTINATION.read_bytes()).hexdigest()
    try:
        h.require_local_docker(ROOT)
        image_id = h.docker(["image", "inspect", "--format", "{{.Id}}", META_IMAGE], cwd=ROOT, timeout=20).strip()
        outputs, inventories = [], []

        def after_reset(db_id, workdir, password, fixture_report):
            outputs.append(generate_one(db_id, workdir, password, fixture_report, image_id, len(outputs) + 1))
            inventories.append(json.loads(h.psql(db_id, workdir, INVENTORY_SQL.read_text())))

        h.REPORT = EVIDENCE / f"{evidence_prefix}-types-bootstrap.json"
        argv = sys.argv
        try:
            sys.argv = [argv[0]]
            if h.main(after_reset=after_reset) != 0:
                h.fail("type generation fixture failed; see sanitized bootstrap evidence")
        finally:
            sys.argv = argv
        if len(outputs) != 2 or outputs[0] != outputs[1] or inventories[0] != inventories[1]:
            h.fail("types or schema/grants inventory differ across the two real resets")
        (EVIDENCE / f"{evidence_prefix}-schema-inventory.json").write_text(json.dumps(inventories[0], indent=2) + "\n", encoding="utf-8")
        finish_artifact(outputs[0], mode)
        report.update(status="passed", generations=2, outputs_equal=True, inventory_equal=True,
                      generator_image=META_IMAGE, generator_image_id=image_id,
                      types_sha256=hashlib.sha256(outputs[0].encode()).hexdigest(),
                      generator_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                      fixture_sha256=hashlib.sha256((ROOT / "scripts/test-db-bootstrap.py").read_bytes()).hexdigest())
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        report["error"] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
    finally:
        report["artifact_unchanged"] = hashlib.sha256(DESTINATION.read_bytes()).hexdigest() == original_hash
        (EVIDENCE / f"{evidence_prefix}-types-{mode[2:]}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
