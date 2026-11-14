"""Price changes on a started bazaar day (migration 20260101008500): refusals, versions, replay, the sale's price check and RPC
authority on a reset, plus the earlier bazaar suites that call record_event_sale."""
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
security = runpy.run_path(str(ROOT / "scripts/test-db-security.py"))

# Earlier suites that sell through record_event_sale, run whole on the reset: (file, the role-matrix rows each returns, or a pass line).
# bazaar-days.sql is left out: on this branch it stops at finalise_posts_rent_and_fees / each_once_dated_the_day_paid with the
# record_event_sale of 20260101004700 restored too (15 November 2026), so that failure is older than this migration.
REGRESSIONS = [
    ("bazaar-events.sql", 87),
    ("bazaar-closeout.sql", 80),
    ("make-bazaar-transfer.sql", "MAKE_BAZAAR|passed"),
    ("bazaar-delete.sql", "BAZAAR_DELETE|passed"),
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


def check(db_id, workdir, _password, _report):
    inventory = (ROOT / "tests/integration/db/schema-inventory.sql").read_text()
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    sql = (ROOT / "tests/integration/security/bazaar-day-prices.sql").read_text()
    migration = (ROOT / "supabase/migrations/20260101008500_bazaar_day_prices.sql").read_text()
    # Only the functions are restated: the table already exists on the reset.
    definition = migration[migration.index("create or replace function public.set_bazaar_day_price"):]

    def cut(old, new):
        if definition.count(old) != 1:
            raise RuntimeError("mutant text is not unique: " + old)
        return definition.replace(old, new, 1)

    # A sale rung before the change, sent after it, refused: what dropping the total check does.
    REFUSED_OLD_SALE = "sale total does not match the event prices"
    # Each mutant removes one rule; the scenario must name what broke.
    mutants = [
        ("grant execute on function public.set_bazaar_day_price(jsonb) to anon;", "PRICE_GRANTS"),
        ("grant execute on function public.get_event_prices(uuid) to anon;", "PRICE_GRANTS"),
        ("grant select on public.event_price_versions to authenticated;", "PRICE_GRANTS"),
        (cut("if not public.is_owner() then -- rule:price-owner", "if false then"), "not owner"),
        (cut("if not public.is_owner() then -- rule:prices-read-owner", "if false then"), "not owner read"),
        (cut("is distinct from array['eventId', 'priceCents', 'productId', 'requestId'] then -- rule:price-keys",
             "is null then"), "extra key"),
        (cut("or (p_change ->> 'priceCents')::bigint not between 1 and 100000000 then -- rule:price-range", "then"), "price zero"),
        (cut("if v_seen.payload_hash is distinct from v_hash then -- rule:price-replay-conflict", "if false then"), "other body"),
        (cut("if v_ev.closed_at is not null then -- rule:price-open", "if false then"), "closed day"),
        (cut("if not (v_ev.price_snapshot ? v_pid) then -- rule:price-product", "if false then"), "off list"),
        (cut("if v_from = v_cents then -- rule:price-same", "if false then"), "same price"),
        (cut("if exists (select 1 from public.events e where e.id = v_event) then -- rule:price-bazaar-day", "if false then"),
         "not a bazaar day"),
        (cut("values (v_event, 0, v_ev.price_snapshot, v_ev.starts_at); -- rule:price-version-zero",
             "values (v_event, 0, v_ev.price_snapshot || jsonb_build_object(v_pid, v_cents), v_ev.starts_at);"), "PRICE_VERSIONS"),
        (cut("update public.events e set price_snapshot = v_prices where e.id = v_event; -- rule:price-snapshot", ""), "PRICE_SNAPSHOT"),
        (cut("update public.bazaar_day_lines l set price_cents = v_cents where l.day_id = v_day.id and l.product_id = v_pid; -- rule:price-line",
             ""), "PRICE_LINE"),
        (cut("  perform pg_advisory_xact_lock(hashtextextended('event:' || v_event::text, 0));\n", ""), "PRICE_LOCK"),
        (cut("order by pv.version = coalesce((select max(x.version) from public.event_price_versions x\n"
             "                                                 where x.event_id = v_event and x.effective_at <= v_at), 0) desc,",
             "order by"), "PRICE_ORDER"),
        (cut("if v_fits and v_discount <= v_try_gross and v_total = v_try_gross - v_discount then -- rule:sale-version-match",
             "if v_fits then"), REFUSED_OLD_SALE),
        (cut("(v_prices ->> i.key)::bigint -- rule:sale-unit-price", "(v_ev.price_snapshot ->> i.key)::bigint"), "PRICE_OLD_SALE"),
        ("alter table public.event_price_versions drop constraint event_price_versions_event_id_fkey, "
         "add constraint event_price_versions_event_id_fkey foreign key (event_id) references public.events (id);",
         "delete changed day"),
    ]
    for mutation, wanted in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise RuntimeError(f"mutant for {wanted!r} failed differently: {error}") from error
        else:
            h.fail("bazaar-day-prices mutation was not detected: " + wanted)
    if "BAZAAR_DAY_PRICES|passed" not in h.psql(db_id, workdir, sql):
        h.fail("bazaar-day-prices contract did not complete")
    regressions(db_id, workdir)
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print(f"Bazaar day prices: refusals, versions, replay, old and new price sales, closed day, delete; {len(mutants)} mutants;"
          f" {len(REGRESSIONS)} earlier bazaar suites passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-bazaar-day-prices-fixture.json"
    raise SystemExit(h.main(after_reset=check))
