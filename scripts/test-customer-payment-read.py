"""Local private-token payment facts preserve existing owner transactions and privacy."""
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
    sql = (ROOT / "tests/integration/security/customer-payment-read.sql").read_text()
    migration = (ROOT / "supabase/migrations/20260101008200_customer_payment_read.sql").read_text()
    for replacement, wanted in [
        ("'paid_cents', o.total_cents,", "private payment facts differ"),
        ("'paid_cents', o.paid_cents, 'phone', o.phone,", "private status leaked contact or payment reference"),
    ]:
        broken = migration.replace("'paid_cents', o.paid_cents,", replacement)
        if broken == migration:
            h.fail("payment mutation anchor missing")
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + broken, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise
        else:
            h.fail("private payment mutation was not detected")
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    if "CUSTOMER_PAYMENT_READ|passed" not in h.psql(db_id, workdir, sql):
        h.fail("private payment read contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print("Private payment facts, owner confirmation/swaps/settlement/refund, tokens and privacy passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-customer-payment-read-fixture.json"
    raise SystemExit(h.main(after_reset=check))
