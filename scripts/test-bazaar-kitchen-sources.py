"""Owner-only source provenance, booking isolation and genuine absence on two resets."""
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
    sql = (ROOT / "tests/integration/security/bazaar-kitchen-sources.sql").read_text(encoding="utf-8")
    definition = (ROOT / "supabase/migrations/20260101007900_bazaar_kitchen_source_read.sql").read_text()
    definition = definition.split("revoke all on function", 1)[0].replace("create function", "create or replace function", 1)
    mutants = [
        ("grant execute on function public.get_bazaar_kitchen_sources(uuid) to anon;", "RPC grants"),
        (definition.replace("if not public.is_owner() then", "if false then", 1), "refusal expected 42501"),
        (definition.replace("where s.scheduled_id = p_booking order by", "where true order by", 1), "booking isolation")
    ]
    for mutation, wanted in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise
        else:
            h.fail("source provenance mutation was not detected: " + wanted)
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    if "KITCHEN_SOURCES|passed" not in h.psql(db_id, workdir, sql):
        h.fail("kitchen source read contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print("Kitchen source roles, ACL, booking isolation, read-only contracts and three mutants passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-kitchen-sources-fixture.json"
    raise SystemExit(h.main(after_reset=check))
