#!/usr/bin/env python3
"""MP-06 rollback-only future function default-privilege hardening probe.

Proves that after the 28th migration's default-privilege hardening, a
brand-new public or non-public function is not executable by anon,
authenticated or PUBLIC, while the reviewed service_role grant on new
public functions is retained and every existing function ACL is unchanged.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/integration/security/future-function-defaults.sql"
REPORT = ROOT / "docs/state/evidence/MP-06n-function-defaults.json"
BOOTSTRAP_REPORT = ROOT / "docs/state/evidence/MP-06n-bootstrap.json"
EXPECTED = [
    "SEC_RESULT|mp06n|global_and_public_defaults|both_revokes_present",
    "SEC_RESULT|mp06n|managed_and_existing_acls|unchanged",
    "SEC_RESULT|mp06n|new_public_function|anon_authenticated_public_denied",
    "SEC_RESULT|mp06n|new_public_function|service_role_retained",
    "SEC_RESULT|mp06n|new_scratch_function|all_application_roles_denied",
]
ABSENT_SQL = """
select to_regnamespace('mp06n_scratch') is null
 and to_regprocedure('public.mp06n_public()') is null
 and to_regprocedure('mp06n_scratch.mp06n_scratch_fn()') is null;
"""
CATALOG_SQL = """
select json_build_object(
  'defaults', coalesce((select json_agg(x order by x) from (
    select concat(d.defaclrole::regrole, '|', coalesce(d.defaclnamespace::regnamespace::text, ''), '|', d.defaclobjtype, '|', coalesce(d.defaclacl::text, 'NULL')) x
    from pg_default_acl d where d.defaclobjtype = 'f') q), '[]'::json),
  'functions', coalesce((select json_agg(x order by x) from (
    select concat(p.oid::regprocedure::text, '|', coalesce(p.proacl::text, 'NULL')) x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog','information_schema')
      and n.nspname !~ '^pg_(toast|temp)' and p.prokind = 'f') q), '[]'::json)
)::text;
"""


def load_bootstrap():
    spec = importlib.util.spec_from_file_location("mp06n_bootstrap", ROOT / "scripts/test-db-bootstrap.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("bootstrap harness could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    if len(sys.argv) != 1:
        raise RuntimeError("MP-06n accepts no URLs, project references or arguments")
    h = load_bootstrap()
    pinned_count = len(json.loads((ROOT / "tests/fixtures/mp08g-source-pins.json").read_text(encoding="utf-8"))["migrations"])
    report = {"status": "failed", "scope": "rollback-only PostgreSQL 15 local diagnostic; not a hosted or managed-upgrade acceptance", "resets": 0, "runs": [], "cleanup": "pending"}
    h.REPORT = BOOTSTRAP_REPORT
    BOOTSTRAP_REPORT.parent.mkdir(parents=True, exist_ok=True)
    BOOTSTRAP_REPORT.write_text(json.dumps({"status": "failed", "resets": 0, "cleanup": "pending"}, indent=2) + "\n", encoding="utf-8")

    def check(db_id, workdir, password, harness_report):
        before = h.psql(db_id, workdir, CATALOG_SQL).strip()
        output = h.psql(db_id, workdir, FIXTURE.read_text(encoding="utf-8-sig"))
        rows = sorted(line.strip() for line in output.splitlines() if line.startswith("SEC_RESULT|mp06n|"))
        if rows != EXPECTED:
            raise RuntimeError("fixture returned an incomplete or unexpected result matrix")
        # Each call opens a fresh psql connection after the fixture's explicit ROLLBACK.
        if h.psql(db_id, workdir, ABSENT_SQL).strip() != "t":
            raise RuntimeError("rollback left a probe schema or function")
        restored = h.psql(db_id, workdir, CATALOG_SQL).strip()
        if restored != before:
            raise RuntimeError("fresh connection found default or existing function ACL drift after rollback")
        report["runs"].append({"result_rows": rows, "catalog_restored": True, "probe_objects_absent": True})
        report["resets"] += 1

    try:
        code = h.main(after_reset=check)
        receipt = json.loads(BOOTSTRAP_REPORT.read_text(encoding="utf-8"))
        report["cleanup"] = receipt.get("cleanup", "unknown")
        if code != 0 or receipt.get("resets") != 2 or report["resets"] != 2 or report["cleanup"] != "passed":
            raise RuntimeError("guarded two-reset bootstrap or owned cleanup did not pass")
        if report["runs"][0] != report["runs"][1]:
            raise RuntimeError("two reset fixture results differ")
        report.update(status="passed", identical_resets=True, expected_migrations=pinned_count,
                      fixture_sha256=hashlib.sha256(FIXTURE.read_bytes()).hexdigest())
    except Exception as error:
        report["error"] = type(error).__name__
        report["phase"] = "two-reset bootstrap probe"
        try:
            receipt = json.loads(BOOTSTRAP_REPORT.read_text(encoding="utf-8"))
            report["cleanup"] = receipt.get("cleanup", report["cleanup"])
            report["resets"] = min(int(receipt.get("resets", report["resets"])), 2)
        except (OSError, ValueError, TypeError):
            pass
    try:
        receipt = json.loads(BOOTSTRAP_REPORT.read_text(encoding="utf-8"))
        BOOTSTRAP_REPORT.write_text(json.dumps({
            "status": receipt.get("status", "failed"),
            "resets": min(int(receipt.get("resets", 0)), 2),
            "cleanup": receipt.get("cleanup", "unknown"),
            "catalogs_equal": receipt.get("catalogs_equal", False),
            "schemas_equal": receipt.get("schemas_equal", False),
            "expected_migration_count": len(receipt.get("expected_versions", [])),
        }, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, TypeError):
        pass
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report.get(key) for key in ("status", "resets", "cleanup", "error")}))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
