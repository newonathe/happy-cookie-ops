"""Live sync of the open bazaar day (migration 20260101009800): who may read the rows a day's changes are made of, which tables are published to
Supabase Realtime, and the grants of the two read wrappers, on a reset. Each rule is then removed in turn (a mutant) and the suite must say what
broke. The earlier suites that sell, void or read the day run whole afterwards (the event_sales read policy changed)."""
import importlib.util
import json
import os
from pathlib import Path
import runpy
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
verify = runpy.run_path(str(ROOT / "scripts/verify-function-authority.py"))["verify_functions"]
security = runpy.run_path(str(ROOT / "scripts/test-db-security.py"))

# Earlier suites that read event_sales or go through the day's commands, whole on the reset: (file, role-matrix rows or a pass line).
REGRESSIONS = [
    ("bazaar-events.sql", 87),
    ("bazaar-closeout.sql", 80),
    ("make-bazaar-transfer.sql", "MAKE_BAZAAR|passed"),
    ("bazaar-delete.sql", "BAZAAR_DELETE|passed"),
    ("bazaar-day-prices.sql", "BAZAAR_DAY_PRICES|passed"),
    ("bazaar-day-anywhere.sql", "BAZAAR_DAY_ANYWHERE|passed"),
    ("helpers.sql", "HELPERS_PEOPLE|passed"),
]


def regressions(db_id, workdir):
    for filename, wanted in REGRESSIONS:
        sql = (ROOT / "tests/integration/security" / filename).read_text()
        output = h.psql(db_id, workdir, security["historical_production_sql"](sql, filename))
        if isinstance(wanted, int):
            rows = [line for line in output.splitlines() if line.startswith("SEC_RESULT|")]
            if len(rows) != wanted or len(set(rows)) != wanted:
                h.fail(f"{filename} returned {len(rows)} role rows, wanted {wanted}")
        elif wanted not in output:
            h.fail(f"{filename} did not complete")


MUTANT_NAMES = []


def check(db_id, workdir, _password, _report):
    inventory = (ROOT / "tests/integration/db/schema-inventory.sql").read_text()
    dump = os.environ.get("HC_DUMP_INVENTORY")
    if dump:  # to regenerate the reviewed baseline: the inventory as the reset has it
        Path(dump).write_text(h.psql(db_id, workdir, inventory), encoding="utf-8")
        return
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    sql = (ROOT / "tests/integration/security/bazaar-live-sync.sql").read_text()
    output = h.psql(db_id, workdir, sql)
    if "BAZAAR_LIVE_SYNC|passed" not in output:
        h.fail("live sync contract did not complete")
    if os.environ.get("LIVE_SYNC_SKIP_MUTANTS") != "1":
        run_mutants(db_id, workdir, inventory, sql)
    regressions(db_id, workdir)
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print(f"Live sync: read rules, publication, grants; {len(set(MUTANT_NAMES))} mutants; {len(REGRESSIONS)} earlier suites passed.", flush=True)


def run_mutants(db_id, workdir, inventory, sql):
    def fn(name, body):
        arg = "p_event" if name == "bazaar_event_readable" else "p_day"
        return (f"create or replace function public.{name}({arg} uuid) returns boolean language sql stable security definer "
                f"set search_path = '' as $f$ {body} $f$;")

    mutants = [
        ("helper never reads sales", fn("bazaar_event_readable", "select public.is_owner();"), "LIVE_SYNC helper sales open"),
        ("helper reads any event", fn("bazaar_event_readable", "select public.is_owner() or public.is_active_helper();"), "LIVE_SYNC helper sales closed"),
        ("event read ignores the role", fn("bazaar_event_readable", "select p_event is not null;"), "LIVE_SYNC helper sales closed"),
        ("day read ignores the role", fn("bazaar_day_readable", "select true;"), "LIVE_SYNC helper adds closed"),
        ("day read owner only", fn("bazaar_day_readable", "select public.is_owner();"), "LIVE_SYNC helper adds open"),
        ("day read any helper", fn("bazaar_day_readable", "select public.is_owner() or public.is_active_helper();"), "LIVE_SYNC helper adds closed"),
        ("sales readable to everyone", 'alter policy "sales staff read" on public.event_sales to public using (true);', "LIVE_SYNC_POLICIES"),
        ("sales policy owner only", 'alter policy "sales staff read" on public.event_sales using ((select public.is_owner()));', "LIVE_SYNC helper sales open"),
        ("losses owner only", 'alter policy "bazaar losses read" on public.bazaar_losses using ((select public.is_owner()));', "LIVE_SYNC helper losses open"),
        ("stock adds readable to everyone", 'alter policy "bazaar stock adds read" on public.bazaar_stock_adds using (true);', "LIVE_SYNC helper adds closed"),
        ("a business table published", "alter publication supabase_realtime add table public.orders;", "LIVE_SYNC_PUBLICATION"),
        ("losses not published", "alter publication supabase_realtime drop table public.bazaar_losses;", "LIVE_SYNC_PUBLICATION"),
        ("sales not published", "alter publication supabase_realtime drop table public.event_sales;", "LIVE_SYNC_PUBLICATION"),
        ("losses writable", "grant insert on table public.bazaar_losses to authenticated;", "LIVE_SYNC_GRANTS"),
        ("stock adds readable by anon", "grant select on table public.bazaar_stock_adds to anon;", "LIVE_SYNC_GRANTS"),
        ("wrapper callable by anon", "grant execute on function public.bazaar_day_readable(uuid) to anon;", "LIVE_SYNC_GRANTS"),
        ("wrapper callable by service role", "grant execute on function public.bazaar_event_readable(uuid) to service_role;", "LIVE_SYNC_GRANTS"),
        ("wrapper not callable", "revoke execute on function public.bazaar_day_readable(uuid) from authenticated;", "LIVE_SYNC_GRANTS"),
    ]
    for name, mutation, wanted in mutants:
        MUTANT_NAMES.append(name)
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise RuntimeError(f"mutant {name!r} failed differently: {error}") from error
        else:
            h.fail("live sync mutation was not detected: " + name)
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-live-sync-fixture.json"
    raise SystemExit(h.main(after_reset=check))
