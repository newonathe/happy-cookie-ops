"""Helper accounts (migration 20260101009500): expiry, the owner's commands, and an active helper limited to the open bazaar day, on a reset.
Each rule is then removed in turn (a mutant) and the suite must say what broke. The earlier bazaar suites that go through the four
redefined commands run whole afterwards."""
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

# Earlier suites that go through record_event_sale, void_event_sale, add_event_expense, close_bazaar_day or the bazaar read, whole on the reset.
REGRESSIONS = [
    ("bazaar-events.sql", 87),
    ("bazaar-closeout.sql", 80),
    ("make-bazaar-transfer.sql", "MAKE_BAZAAR|passed"),
    ("bazaar-delete.sql", "BAZAAR_DELETE|passed"),
    ("bazaar-day-prices.sql", "BAZAAR_DAY_PRICES|passed"),
    ("bazaar-day-anywhere.sql", "BAZAAR_DAY_ANYWHERE|passed"),
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
    sql = (ROOT / "tests/integration/security/helpers.sql").read_text()
    migration = (ROOT / "supabase/migrations/20260101009500_helpers.sql").read_text()
    # The functions are restated whole (create or replace keeps their grants), so each mutant changes exactly one place.
    definition = migration[migration.index("create or replace function public.current_role_name"):]
    if os.environ.get("HELPERS_SKIP_MUTANTS") != "1":
        run_mutants(db_id, workdir, inventory, sql, definition)
    output = h.psql(db_id, workdir, sql)
    if "HELPERS_DAY|passed" not in output or "HELPERS_PEOPLE|passed" not in output:
        h.fail("helpers contract did not complete")
    regressions(db_id, workdir)
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print(f"Helper accounts: expiry, owner commands, open-day-only rights; {len(set(MUTANT_NAMES))} mutants; {len(REGRESSIONS)} earlier suites passed.", flush=True)


MUTANT_NAMES = []


def run_mutants(db_id, workdir, inventory, sql, definition):
    def cut(old, new):
        if definition.count(old) < 1:
            raise RuntimeError("mutant text is missing: " + old)
        return definition.replace(old, new)

    mutants = [
        ("expiry ignored", cut("and (p.access_expires_at is null or p.access_expires_at > now())", ""), "expired helper still has a role"),
        ("any helper day read", cut("select public.is_owner() or (public.is_active_helper() and public.bazaar_day_open(p_day));",
                                    "select public.is_owner() or public.is_active_helper();"), "read closed day"),
        ("open is not checked on read", cut("where d.id = p_day and e.closed_at is null);", "where d.id = p_day);"), "what is open reads wrong"),
        ("sale on any day", cut("  if not public.is_owner() and not public.bazaar_event_accepts(v_event, v_at) then -- rule:helper-sale-open-day",
                                "  if false then -- rule:helper-sale-open-day"), "sale on a closed day"),
        ("sale role closed", cut("if not (public.is_owner() or public.is_active_helper()) then -- rule:sale-role",
                                 "if not public.is_owner() then -- rule:sale-role"), "only the owner may record a bazaar sale"),
        ("who rang it up lost", cut("v_clerk, v_at, v_voided, v_hash, auth.uid())", "v_clerk, v_at, v_voided, v_hash, null)"),
         "late sale was not recorded under the helper"),
        ("void anyone", cut("  if not public.is_owner() and not (v_hit and coalesce(v_sale.recorded_by = auth.uid(), false)\n", "  if false and not (v_hit and coalesce(v_sale.recorded_by = auth.uid(), false)\n"),
         "void the owner sale"),
        ("void on closed day", cut("and (v_sale.voided_at is not null or public.bazaar_event_accepts(v_sale.event_id, v_at))) then -- rule:helper-void-own",
                                   ") then -- rule:helper-void-own"), "take back an own sale after the close"),
        ("void marker planted", cut("not (v_hit and coalesce(v_sale.recorded_by = auth.uid(), false)", "not (not v_hit or coalesce(v_sale.recorded_by = auth.uid(), false)"),
         "void a sale that is not known"),
        ("expense on any day", cut("  if not public.is_owner() and not public.bazaar_event_open(v_event) then -- rule:helper-expense-open-day",
                                   "  if false then -- rule:helper-expense-open-day"), "expense on a closed day"),
        ("expense role closed", cut("if not (public.is_owner() or public.is_active_helper()) then -- rule:expense-role",
                                    "if not public.is_owner() then -- rule:expense-role"), "only the owner may add an event expense"),
        ("close role closed", cut("if not (public.is_owner() or public.is_active_helper()) then -- rule:close-role",
                                  "if not public.is_owner() then -- rule:close-role"), "close"),
        ("close reply leaks", cut("  if v_helper then\n    return jsonb_build_object('closed', true, 'day_id', v_day);\n  end if;\n  return public.bazaar_summary(v_booking);",
                                  "  return public.bazaar_summary(v_booking);"), "close reply leaks"),
        ("helper split kept", cut("  if v_helper then -- rule:helper-close-split", "  if false then -- rule:helper-close-split"), "did not decide the split"),
        ("people open to all", cut("  if not public.is_owner() then -- rule:people-owner\n    raise exception 'only the owner may list the people'",
                                   "  if false then -- rule:people-owner\n    raise exception 'only the owner may list the people'"), "helper: list_people"),
        ("revoke an owner", cut("    if v_role <> 'helper' then -- rule:helper-only\n      raise exception 'only a helper can be removed here'",
                                "    if false then -- rule:helper-only\n      raise exception 'only a helper can be removed here'"), "revoke: the owner"),
        ("expiry in the past", cut("p_expires_at <= now() or p_expires_at > now() + interval '5 years') then -- rule:expiry-range\n    raise exception 'the expiry must be in the future, within five years, or none' using errcode = '22023';\n  end if;\n  select p.role",
                                   "false) then -- rule:expiry-range\n    raise exception 'the expiry must be in the future, within five years, or none' using errcode = '22023';\n  end if;\n  select p.role"),
         "expiry: past"),
        ("owner email taken", cut("if v_role is distinct from 'helper' then -- rule:add-not-helper", "if false then -- rule:add-not-helper"), "the owner email"),
        ("open day to anyone", cut("  if not (public.is_owner() or public.is_active_helper()) then -- rule:open-day-role", "  if false then -- rule:open-day-role"), "refused open day"),
        ("late sale refused", cut("where d.event_id = p_event and (e.closed_at is null or p_at <= e.closed_at));",
                                  "where d.event_id = p_event and e.closed_at is null);"), "late sale before the close"),
        ("late void after the close accepted", cut("where d.event_id = p_event and (e.closed_at is null or p_at <= e.closed_at));",
                                                   "where d.event_id = p_event);"), "sale on a closed day"),
        ("late void stamped after the close accepted", cut("public.bazaar_event_accepts(v_sale.event_id, v_at))) then -- rule:helper-void-own",
                                                           "public.bazaar_event_accepts(v_sale.event_id, '-infinity'::timestamptz))) then -- rule:helper-void-own"),
         "take back an own sale after the close"),
        ("accepts callable", definition + "\ngrant execute on function public.bazaar_event_accepts(uuid, timestamptz) to authenticated;", "HELPERS_GRANTS"),
        ("internal callable", definition + "\ngrant execute on function public.is_active_helper() to authenticated;", "HELPERS_GRANTS"),
        ("invites reachable", definition + "\ngrant select on table public.helper_invites to authenticated;", "HELPERS_GRANTS"),
        ("anon lists people", definition + "\ngrant execute on function public.list_people() to anon;", "HELPERS_GRANTS"),
    ]
    for name, mutation, wanted in mutants:
        MUTANT_NAMES.append(name)
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise RuntimeError(f"mutant {name!r} failed differently: {error}") from error
        else:
            h.fail("helpers mutation was not detected: " + name)
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-helpers-fixture.json"
    raise SystemExit(h.main(after_reset=check))
