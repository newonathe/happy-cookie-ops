"""Aggregate returns preserve per-transfer limits, stock, costs and exact replay."""
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
    inventory = (ROOT / "tests/integration/db/schema-inventory.sql").read_text()
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    sql = (ROOT / "tests/integration/security/bazaar-return-volume.sql").read_text()
    mutants = [
        ("alter table public.bazaar_kitchen_moves drop constraint bazaar_kitchen_moves_qty_delta_check; "
         "alter table public.bazaar_kitchen_moves add constraint bazaar_kitchen_moves_qty_delta_check check(abs(qty_delta::bigint) between 1 and 9999);",
         'violates check constraint "bazaar_kitchen_moves_qty_delta_check"'),
        ("alter table public.bazaar_kitchen_moves drop constraint bazaar_kitchen_moves_qty_delta_check;",
         "oversized transfer journal entry admitted"),
        ("alter table public.bazaar_kitchen_moves disable trigger kitchen_moves_guard;",
         "over-return journal guard changed")
    ]
    for mutation, wanted in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise
        else:
            h.fail("return-volume mutation was not detected: " + wanted)
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    if "RETURN_VOLUME|passed" not in h.psql(db_id, workdir, sql):
        h.fail("aggregate return contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print("Aggregate16000 return, exact replay, ingredient/cost preservation and three mutants passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-bazaar-return-volume-fixture.json"
    raise SystemExit(h.main(after_reset=check))
