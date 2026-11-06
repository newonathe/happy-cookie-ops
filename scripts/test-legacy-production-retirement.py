"""Prove replay-only legacy production against two disposable local database resets."""
import importlib.util
import json
from pathlib import Path
import runpy
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
verify = runpy.run_path(str(ROOT / "scripts/verify-function-authority.py"))["verify_functions"]


def check(db_id, workdir, _password, _report):
    inventory = (ROOT / "tests/integration/db/schema-inventory.sql").read_text(encoding="utf-8")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    tests = (ROOT / "tests/integration/security/legacy-production-retirement.sql").read_text(encoding="utf-8")
    if "LEGACY|passed" not in h.psql(db_id, workdir, tests):
        h.fail("legacy production retirement contract did not complete")
    print("Legacy production exact replay, roles and side-effect-free retirement passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-legacy-production-fixture.json"
    raise SystemExit(h.main(after_reset=check))
