"""A bazaar selling day on any device (migration 20260101009300): get_bazaar_day, record_event_sale without the selling-device
refusal, the owner-only read, and the earlier bazaar suites that sell through record_event_sale, on a reset. Each rule is then
removed in turn (a mutant) and the suite must say what broke."""
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

# Earlier suites that sell through record_event_sale, run whole on the reset: (file, the role-matrix rows each returns, or a pass line).
REGRESSIONS = [
    ("bazaar-events.sql", 87),
    ("bazaar-closeout.sql", 80),
    ("make-bazaar-transfer.sql", "MAKE_BAZAAR|passed"),
    ("bazaar-delete.sql", "BAZAAR_DELETE|passed"),
    ("bazaar-day-prices.sql", "BAZAAR_DAY_PRICES|passed"),
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
    dump = os.environ.get("HC_DUMP_INVENTORY")
    if dump:  # to regenerate the reviewed baseline: the inventory as the reset has it
        Path(dump).write_text(h.psql(db_id, workdir, inventory), encoding="utf-8")
        return
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    sql = (ROOT / "tests/integration/security/bazaar-day-anywhere.sql").read_text()
    migration = (ROOT / "supabase/migrations/20260101009300_bazaar_day_on_any_device.sql").read_text()
    # The functions are restated whole (create or replace keeps their grants), so each mutant changes exactly one place.
    definition = migration[migration.index("create or replace function public.bazaar_day_access"):]

    def cut(old, new):
        if definition.count(old) < 1:
            raise RuntimeError("mutant text is missing: " + old)
        return definition.replace(old, new)

    refusal = ("  if v_ev.selling_device is null or (v_device <> v_ev.selling_device and v_device <> all (v_ev.former_devices)) then\n"
               "    raise exception 'this phone is not the selling device for the event' using errcode = '42501';\n"
               "  end if;\n")
    mutants = [
        ("any reader", cut("if not public.bazaar_day_access(p_day) then -- rule:day-read-access", "if false then"), "not owner read"),
        ("helper allows all", cut("  select public.is_owner();", "  select true;"), "not owner read"),
        ("voided sale counted", cut("where s.event_id = v_d.event_id and s.voided_at is null and i.product_id = l.product_id",
                                    "where s.event_id = v_d.event_id and i.product_id = l.product_id"), "a void reads wrong"),
        ("voided loss counted", cut(" and o.voided_at is null) x on true", ") x on true"), "stock with a freebie and losses wrong"),
        ("losses ignored", cut("l.made_qty + l.carried_qty - coalesce(q.sold, 0) - coalesce(x.lost, 0)",
                               "l.made_qty + l.carried_qty - coalesce(q.sold, 0)"), "stock with a freebie and losses wrong"),
        ("every day's sales", cut("from public.event_sales s where s.event_id = v_d.event_id;", "from public.event_sales s;"),
         "another day leaked sales"),
        ("unordered", cut("order by s.sold_at, s.client_id)", "order by s.client_id desc)"), "sales out of order"),
        ("void flag lost", cut("'voided', s.voided_at is not null,", "'voided', false,"), "a void reads wrong"),
        ("always open", cut("when v_e.closed_at is null then 'open' else 'closed' end", "else 'open' end"), "a closed day reads wrong"),
        ("old prices", cut("else v_e.price_snapshot end", "else '{}'::jsonb end"), "the price change is not on the read"),
        ("device refusal back", cut("  -- S2: no refusal of a device that is not the selling one; any device of the owner may sell (the client id still carries its device).\n",
                                    refusal), "not the selling device"),
        ("any seller", cut("  if not public.is_owner() then\n    raise exception 'only the owner may record a bazaar sale' using errcode = '42501';",
                           "  if false then\n    raise exception 'only the owner may record a bazaar sale' using errcode = '42501';"),
         "not owner sale"),
        ("other body accepted", cut("v_seen is distinct from v_hash", "false"), "same id other body"),
        ("client id not the device's", cut("     or left(v_client, length(v_device) + 1) <> v_device || ':' then", "     then"),
         "client id of another device"),
        ("anon reads", definition + "\ngrant execute on function public.get_bazaar_day(uuid) to anon;", "DAY_GRANTS"),
        ("helper callable", definition + "\ngrant execute on function public.bazaar_day_access(uuid) to authenticated;", "DAY_GRANTS"),
        ("anon sells", definition + "\ngrant execute on function public.record_event_sale(jsonb) to anon;", "DAY_GRANTS"),
    ]
    for name, mutation, wanted in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise RuntimeError(f"mutant {name!r} failed differently: {error}") from error
        else:
            h.fail("bazaar-day-anywhere mutation was not detected: " + name)
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    if "BAZAAR_DAY_ANYWHERE|passed" not in h.psql(db_id, workdir, sql):
        h.fail("bazaar-day-anywhere contract did not complete")
    regressions(db_id, workdir)
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print(f"Bazaar day on any device: owner-only read, two devices selling, void either way, stock, closed day; {len(mutants)} mutants;"
          f" {len(REGRESSIONS)} earlier bazaar suites passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-bazaar-day-anywhere-fixture.json"
    raise SystemExit(h.main(after_reset=check))
