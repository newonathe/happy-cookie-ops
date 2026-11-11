"""Private kitchen journal and competing stock spenders on two local resets."""
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
    sql = (ROOT / "tests/integration/security/bazaar-kitchen-journal.sql").read_text(encoding="utf-8")
    if "KITCHEN_JOURNAL|passed" not in h.psql(db_id, workdir, sql):
        h.fail("private kitchen journal contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print("Private kitchen journal, spend refusals, replay, immutability and role boundaries passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-kitchen-journal-fixture.json"
    raise SystemExit(h.main(after_reset=check))
