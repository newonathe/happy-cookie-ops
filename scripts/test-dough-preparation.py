"""Dough SQL contracts and competing requests on owned disposable loopback fixtures."""
import concurrent.futures
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
    tests = (ROOT / "tests/integration/security/dough-preparation.sql").read_text(encoding="utf-8")
    if "DOUGH|passed" not in h.psql(db_id, workdir, tests):
        h.fail("dough transaction contract did not complete")
    # Commit synthetic fixtures only inside this disposable container so four sessions can see them.
    setup = tests.split("create function pg_temp.body", 1)[0] + "commit;"
    h.psql(db_id, workdir, setup)

    def submit(n):
        body = json.dumps({"id": f"d0712000-0000-4000-8000-{n:012}",
                           "product_id": "d071-a" if n == 1 else "d071-b",
                           "recipe_version": 1, "recipe_amount": 1, "balls": 10 + n,
                           "drop_no": 5, "at": 1793836800000})
        sql = ("begin; set local role authenticated; "
               "set local request.jwt.claim.sub='d0710000-0000-4000-8000-000000000001'; "
               f"select duplicate::integer from public.record_dough_preparation('{body}'::jsonb); commit;")
        return h.psql(db_id, workdir, sql).strip()

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(submit, [1, 2, 1, 2]))
    if sorted(results) != ["0", "0", "1", "1"]:
        h.fail("concurrent duplicate preparations did not each apply once")
    facts = h.psql(db_id, workdir, """
      select (select on_hand=1600 from public.inventory_items where id='d071-flour')
        and (select on_hand=19 from public.inventory_items where id='d071-egg')
        and (select count(*)=2 and sum(qty)=23 from public.production_records where product_id in ('d071-a','d071-b'))
        and (select count(*)=3 from public.stock_movements where item_id in ('d071-flour','d071-egg'));
    """).strip()
    if facts != "t":
        h.fail("concurrent flavours lost an ingredient deduction or duplicated production")
    print("Dough role/transaction tests and four concurrent requests passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-dough-fixture.json"
    raise SystemExit(h.main(after_reset=check))
