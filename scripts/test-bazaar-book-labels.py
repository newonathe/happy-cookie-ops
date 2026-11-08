"""Human Bazaar ledger labels; unchanged accounting and RPC authority on two resets."""
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


def scenario():
    previous = (ROOT / "supabase/migrations/20260101006700_bazaar_days.sql").read_text()
    start = previous.index("create or replace function public.get_books(")
    end = previous.index("\n$$;", start) + 4
    oracle = previous[start:end].replace("public.get_books(", "pg_temp.book_names_before_labels(", 1)
    sql = (ROOT / "tests/integration/security/bazaar-book-labels.sql").read_text()
    return sql.replace("begin;", "begin;\ncreate temporary table book_names_init(id integer);\n" + oracle, 1)


def check(db_id, workdir, _password, _report):
    inventory = (ROOT / "tests/integration/db/schema-inventory.sql").read_text()
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    sql = scenario()
    definition = (ROOT / "supabase/migrations/20260101008000_bazaar_book_labels.sql").read_text()
    mutants = [
        ("grant execute on function public.get_books(timestamptz,timestamptz) to anon;", "book RPC grants changed"),
        (definition.replace("when l.memo = 'Void of stall sale ' || s.client_id", "when false", 1), "void must retain"),
        (definition.replace("else l.memo end, l.amount_cents,", "else l.memo end, l.amount_cents + case when l.amount_cents>0 then 1 else 0 end,", 1), "labels changed accounting"),
        (definition.replace("else l.memo end", "else 'Changed note' end", 1), "custom note changed")
    ]
    for mutation, wanted in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise
        else:
            h.fail("book-label mutation was not detected: " + wanted)
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    if "BOOK_NAMES|passed" not in h.psql(db_id, workdir, sql):
        h.fail("book-label contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print("Book labels, original accounting oracle, role/grant contracts and four mutants passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-book-labels-fixture.json"
    raise SystemExit(h.main(after_reset=check))
