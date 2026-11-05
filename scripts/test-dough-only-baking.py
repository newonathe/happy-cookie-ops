"""Prepare -> partial bake/rejects/costs and competing bakes on disposable local fixtures."""
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
    tests = (ROOT / "tests/integration/security/dough-only-baking.sql").read_text(encoding="utf-8")
    if "BAKE|passed" not in h.psql(db_id, workdir, tests):
        h.fail("bake transaction contract did not complete")
    setup = tests.split("create function pg_temp.body", 1)[0]
    prep = json.dumps({"id": "d0721000-0000-4000-8000-000000000001", "product_id": "d072-a",
                       "recipe_version": 1, "recipe_amount": 1, "balls": 13, "drop_no": 5, "at": 1793836800000})
    actor = "set local role authenticated; set local request.jwt.claim.sub='d0720000-0000-4000-8000-000000000001';"
    h.psql(db_id, workdir, setup + actor + f"select * from public.record_dough_preparation('{prep}'::jsonb); commit;")

    def body(n):
        return json.dumps({"id": f"d0722000-0000-4000-8000-{n:012}", "product_id": "d072-a",
                           "qty": 7, "target": 7, "rejects": 1, "recipe_version": 1, "drop_no": 5, "at": 1793836800000})

    def submit(n):
        sql = ("begin; " + actor + " do $$ begin "
               f"perform public.record_bake('{body(n)}'::jsonb); "
               "perform set_config('hc_bake.outcome','saved',true); "
               "exception when sqlstate 'ZD001' then perform set_config('hc_bake.outcome','short',true); end $$; "
               "select current_setting('hc_bake.outcome'); commit;")
        return h.psql(db_id, workdir, sql).strip()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(submit, [1, 2]))
    if sorted(results) != ["saved", "short"]:
        h.fail("competing bakes did not serialize to one accepted and one shortage")
    accepted = results.index("saved") + 1
    replay = h.psql(db_id, workdir, "begin; " + actor + f"select duplicate from public.record_bake('{body(accepted)}'::jsonb); commit;").strip()
    facts = h.psql(db_id, workdir, """
      select (select on_hand=1700 from public.inventory_items where id='d072-flour')
        and (select count(*)=1 from public.stock_movements where item_id='d072-flour')
        and (select count(*)=1 and sum(qty)=6 and sum(dough_used)=7 from public.production_records where kind='batch' and product_id='d072-a');
    """).strip()
    if replay != "t" or facts != "t":
        h.fail("concurrent bake replay duplicated output or ingredient use")
    print("Dough-only bake roles, partial/rejected output, costs and concurrent/replay tests passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-bake-fixture.json"
    raise SystemExit(h.main(after_reset=check))
