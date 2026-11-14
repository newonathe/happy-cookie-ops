"""Private transfer contract and a first-source transfer/discard race, on two resets."""
import concurrent.futures
import importlib.util
import json
from pathlib import Path
import runpy
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
verify = runpy.run_path(str(ROOT / "scripts/verify-function-authority.py"))["verify_functions"]


def check(db_id, workdir, _password, _report):
    inventory = (ROOT / "tests/integration/db/schema-inventory.sql").read_text(encoding="utf-8")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    tests = (ROOT / "tests/integration/security/bazaar-kitchen-transfer.sql").read_text(encoding="utf-8")
    if "KITCHEN_TRANSFER|passed" not in h.psql(db_id, workdir, tests):
        h.fail("private kitchen transfer contract did not complete")
    h.psql(db_id, workdir, tests.split("create function pg_temp.transfer_body", 1)[0] + "commit;")
    # The transfer's time comes from the database clock that stamped the batch, never the host clock: Docker's clock runs
    # ahead of Windows (22.7 ms measured on 14 November 2026, more after sleep), and a host time earlier than the batch is
    # correctly refused as ZB003 (kitchen stock cannot support this transfer date).
    at = int(h.psql(db_id, workdir, "select (extract(epoch from clock_timestamp()) * 1000)::bigint;").strip())
    transfer = json.dumps({"id": "b0764000-0000-4000-8000-000000000001",
        "day_id": "b0752000-0000-4000-8000-000000000001", "product_id": "p075-cookie", "source_drop": 5, "qty": 4, "at": at})
    discard = json.dumps({"id": "b0765000-0000-4000-8000-000000000001", "kind": "baked",
        "product_id": "p075-cookie", "qty": 3, "reason": "Synthetic competing waste", "drop_no": 5, "at": at})
    actor = "set local request.jwt.claim.sub='b0750000-0000-4000-8000-000000000001';"
    barrier = threading.Barrier(2)

    def submit(operation):
        barrier.wait(timeout=10)
        return h.psql(db_id, workdir, "begin; " + actor + " do $$ begin " + operation +
            "perform set_config('hc_transfer.outcome','saved',true); exception when sqlstate 'ZB001' then "
            "perform set_config('hc_transfer.outcome','short',true); end $$; "
            "select current_setting('hc_transfer.outcome'); commit;").strip()

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(submit, [f"perform public.transfer_bazaar_stock('{transfer}'::jsonb); ",
            f"perform public.record_discard('{discard}'::jsonb); "]))
    if sorted(results) != ["saved", "short"]:
        h.fail("first-source transfer and discard spent the same kitchen cookies")
    expected = 2 if results[0] == "saved" else 3
    facts = h.psql(db_id, workdir, f"select public.kitchen_cookie_balance('p075-cookie',5)={expected};").strip()
    if facts != "t":
        h.fail("competing kitchen spend left the wrong physical balance")
    if results[0] == "saved":
        replay = h.psql(db_id, workdir, "begin; " + actor +
            f"select public.transfer_bazaar_stock('{transfer}'::jsonb)->>'duplicate'; commit;").strip()
        if replay != "true":
            h.fail("concurrent transfer lost its exact replay")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print("Private transfer, chronology, replay, source guards and competing first-source spend passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-kitchen-transfer-fixture.json"
    raise SystemExit(h.main(after_reset=check))
