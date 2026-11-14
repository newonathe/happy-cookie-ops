"""Deleting an event that never sold (migration 20260101008300): refusals, removal, replay and RPC authority on a reset."""
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
    sql = (ROOT / "tests/integration/security/bazaar-delete.sql").read_text()
    definition = (ROOT / "supabase/migrations/20260101008300_bazaar_delete_unsold.sql").read_text()
    # Each mutant removes one rule; the scenario must name what broke.
    mutants = [
        ("grant execute on function public.delete_bazaar_booking(uuid,text) to anon;", "DELETE_GRANTS"),
        (definition.replace("if not public.is_owner() then", "if false then", 1), "not owner"),
        (definition.replace("if v_s.name is distinct from p_confirm_name then", "if false then", 1), "wrong name"),
        (definition.replace("if exists (select 1 from public.event_sales x where x.event_id = any (v_events)) then", "if false then", 1), "DELETE_EXPECTED sale"),
        (definition.replace("coalesce(e.variance_cents, 0) <> 0", "false", 1), "DELETE_EXPECTED drawer"),
        (definition.replace("and f.ledger_id is not null", "and false", 1), "fee in books"),
        (definition.replace("if v_s.finalised_at is not null or v_s.reversed_at is not null then", "if false then", 1), "finalised"),
        (definition.replace("return v_out - 'name' - 'starts_on' - 'ends_on';", "return null;", 1), "DELETE_REPLAY"),
        (definition.replace("and e.closed_at is null) then", "and false) then", 1), "DELETE_EXPECTED open day"),
        (definition.replace("if exists (select 1 from public.event_expenses x where x.event_id = any (v_events)) then", "if false then", 1), "DELETE_EXPECTED expense"),
        (definition.replace("if exists (select 1 from public.bazaar_kitchen_sources k where k.scheduled_id = p_booking)", "if false", 1), "DELETE_EXPECTED kitchen"),
        (definition.replace("if v_s.event_id is not null then", "if false then", 1), "DELETE_EXPECTED legacy link"),
    ]
    for mutation, wanted in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise RuntimeError(f"mutant for {wanted!r} failed differently: {error}") from error
        else:
            h.fail("bazaar-delete mutation was not detected: " + wanted)
    if "BAZAAR_DELETE|passed" not in h.psql(db_id, workdir, sql):
        h.fail("bazaar-delete contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print("Delete unsold event: refusals, removal, replay, bystander, books and stock unchanged, twelve mutants passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-bazaar-delete-fixture.json"
    raise SystemExit(h.main(after_reset=check))
