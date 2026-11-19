"""Café orders (migration 20260101009400): owner-only entry, exact keys and ranges, prices stored as sent with the server's total,
replay, capacity ON and OFF, confirm payment, and the closed settings table; then each rule removed in turn (a mutant) must be
caught, and the function inventory must match tests/fixtures/function-authority.json before and after."""
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
    sql = (ROOT / "tests/integration/security/cafe-orders.sql").read_text()
    migration = (ROOT / "supabase/migrations/20260101009400_cafe_orders.sql").read_text()
    # Only the functions are restated (create or replace keeps their grants): the table already exists on the reset.
    definition = migration[migration.index("create function public.get_cafe_order_settings"):].replace(
        "create function", "create or replace function")

    def cut(old, new):
        if definition.count(old) < 1:
            raise RuntimeError("mutant text is missing: " + old)
        return definition.replace(old, new)

    mutants = [
        ("any settings reader", cut("if not public.is_owner() then -- rule:cafe-settings-read-owner", "if false then")),
        ("any settings writer", cut("if not public.is_owner() then -- rule:cafe-settings-save-owner", "if false then")),
        ("null setting", cut("if p_count_toward_limit is null then -- rule:cafe-settings-null", "if false then")),
        ("any caller", cut("if not public.is_owner() then -- rule:cafe-order-owner", "if false then")),
        ("extra keys", cut("is distinct from array['clientId', 'lines', 'name', 'notes', 'pickupDate'] then -- rule:cafe-order-keys", "is null then")),
        ("no text limits", cut("if length(v_name) not between 1 and 80 or length(v_notes) > 300\n     or v_name ~ '[[:cntrl:]]' or v_notes ~ '[[:cntrl:]]' then -- rule:cafe-order-text", "if false then")),
        ("control characters", cut("or v_name ~ '[[:cntrl:]]' or v_notes ~ '[[:cntrl:]]' then -- rule:cafe-order-text", "then -- rule:cafe-order-text")),
        ("any date", cut("if v_date < v_today or v_date > v_today + 365 then -- rule:cafe-order-date", "if false then")),
        ("any line count", cut("if jsonb_array_length(v_lines) not between 1 and 40 then -- rule:cafe-order-lines", "if false then")),
        ("any quantity", cut("if v_n <> trunc(v_n) or v_n < 1 or v_n > 500 then -- rule:cafe-order-qty", "if false then")),
        ("any price", cut("if v_n <> trunc(v_n) or v_n < 1 or v_n > 100000000 then -- rule:cafe-order-price", "if false then")),
        ("two lines of one product", cut("if cardinality(v_pids) <> (select count(distinct x) from unnest(v_pids) x) then -- rule:cafe-order-duplicate", "if false then")),
        ("any total", cut("if v_total > 100000000 then -- rule:cafe-order-total", "if false then")),
        ("no replay", cut("if found then -- rule:cafe-order-replay", "if false then")),
        ("id reuse", cut("if v_existing.payload_hash is distinct from v_hash or v_existing.channel <> 'cafe' then -- rule:cafe-order-client-id-reuse", "if false then")),
        ("removed product", cut("p.id = x and p.archived_at is null)) then -- rule:cafe-order-product", "p.id = x)) then -- rule:cafe-order-product")),
        ("ignores capacity", cut("if not public.capacity_allows(v_capacity, v_committed::integer, v_units::integer) then -- rule:cafe-order-capacity", "if false then")),
        ("off still takes slots", cut("case when v_count then p.capacity_weight else 0 end -- rule:cafe-order-weight", "p.capacity_weight")),
        ("off ignored", cut("select s.count_toward_limit into v_count from public.cafe_order_settings s where s.id;", "v_count := true;")),
        ("anon creates", definition + "\ngrant execute on function public.create_cafe_order(jsonb) to anon;"),
        ("anon reads", definition + "\ngrant execute on function public.get_cafe_order_settings() to anon;"),
        ("anon saves", definition + "\ngrant execute on function public.save_cafe_order_settings(boolean) to anon;"),
        ("table open", definition + "\ngrant select on public.cafe_order_settings to authenticated;"),
    ]
    # What a mutant's failure may say besides the scenario's own words: the database's own refusal when a rule is gone.
    ALSO = {"no replay": "orders_client_id_key", "off ignored": "not enough room left"}
    problems = []
    for name, mutation in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if "cafe orders" not in str(error) and ALSO.get(name, "-none-") not in str(error):
                problems.append(f"mutant {name!r} failed differently: {error}")
        else:
            problems.append("cafe orders mutation was not detected: " + name)
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    if problems:
        h.fail("; ".join(problems))
    if "CAFE_ORDERS|passed" not in h.psql(db_id, workdir, sql):
        h.fail("cafe orders contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print(f"Café orders: owner-only entry, keys and ranges, stored prices and server total, replay, capacity on and off, confirm payment; {len(mutants)} mutants.",
          flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-cafe-orders-fixture.json"
    raise SystemExit(h.main(after_reset=check))
