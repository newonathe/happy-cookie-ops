"""Manual managed-schema check through the existing owned local fixture only."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "tests/integration/auth/provider-session-preflight.sql"


def main() -> int:
    if len(sys.argv) != 1:
        raise SystemExit("No arguments accepted; owned local fixture only")
    spec = importlib.util.spec_from_file_location("owned_bootstrap", ROOT / "scripts/test-db-bootstrap.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("owned fixture loader unavailable")
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    run_id = uuid.uuid4().hex[:12]
    out = ROOT / "docs/state/evidence"
    report_path = out / f"MP-08e-provider-{run_id}.json"
    fixture.REPORT = out / f"MP-08e-bootstrap-{run_id}.json"
    report = {"status": "NOT_RUN", "sql_sha256": hashlib.sha256(SQL.read_bytes()).hexdigest(),
              "fixture_created": False, "runs": [], "bootstrap_report": fixture.REPORT.name}
    try:
        # Fail before allocating another retained workdir when the engine is unavailable.
        fixture.require_local_docker(ROOT)
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        report.update(status="BLOCKED_ENVIRONMENT", error_type=type(error).__name__)
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"status": report["status"], "report": report_path.name}))
        return 1

    def check(container_id, workdir, _password, _bootstrap_report):
        output = fixture.psql(container_id, workdir, SQL.read_text(encoding="utf-8"))
        rows = [json.loads(line) for line in output.splitlines() if line.startswith("{")]
        if len(rows) != 1 or rows[0].get("contract") != "provider-session-v1":
            raise RuntimeError("provider metadata result mismatch")
        report["runs"].append(rows[0])

    try:
        report["fixture_created"] = "delegated to owned fixture; see bootstrap report"
        code = fixture.main(after_reset=check)
        if code == 0 and len(report["runs"]) == 2 and report["runs"][0] == report["runs"][1]:
            report["status"] = "PASS"
        else:
            report["status"] = "FAIL"
    except (RuntimeError, OSError, ValueError, subprocess.TimeoutExpired) as error:
        report.update(status="FAIL", error_type=type(error).__name__)
    finally:
        report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "report": report_path.name}))
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
