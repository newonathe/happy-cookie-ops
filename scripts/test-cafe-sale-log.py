"""Café sale log (migration 20260101009600; the setting is migration 20260101009400): owner-only entry, exact keys and ranges, a sale that is
paid and completed on its date, prices as sent with the server's total, stock taken like a packed order, replay, capacity on and off,
the books' revenue and label, café rows kept out of the staff orders and the customer side, and the closed settings table; then each rule
removed in turn (a mutant) must be caught, and the function inventory must match tests/fixtures/function-authority.json before and after."""
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
    sql = (ROOT / "tests/integration/security/cafe-sale-log.sql").read_text(encoding="utf-8")
    # Only the functions are restated (create or replace keeps their grants): the table already exists on the reset.
    m94 = (ROOT / "supabase/migrations/20260101009400_cafe_orders.sql").read_text(encoding="utf-8")
    settings = m94[m94.index("create function public.get_cafe_order_settings"):m94.index("/**\n * Enters a café order")].replace(
        "create function", "create or replace function")
    m96 = (ROOT / "supabase/migrations/20260101009600_cafe_sale_log.sql").read_text(encoding="utf-8")
    m97 = (ROOT / "supabase/migrations/20260101009700_cafe_expenses.sql").read_text(encoding="utf-8")
    # The functions as they stand after migration 97, with the staff orders and the books as migration 96 left them.
    sale = (m97[m97.index("create or replace function public.record_cafe_sale"):].replace("drop function public.get_cafe_sales();\n", "").replace(
        "create function", "create or replace function")
        + "\n" + m96[m96.index("create or replace function public.get_staff_orders"):])

    def cut(source, old, new):
        if source.count(old) < 1:
            raise RuntimeError("mutant text is missing: " + old)
        return source.replace(old, new)

    def s(old, new):
        return cut(sale, old, new)

    def t(old, new):
        return cut(settings, old, new)

    mutants = [
        ("any settings reader", t("if not public.is_owner() then -- rule:cafe-settings-read-owner", "if false then")),
        ("any settings writer", t("if not public.is_owner() then -- rule:cafe-settings-save-owner", "if false then")),
        ("null setting", t("if p_count_toward_limit is null then -- rule:cafe-settings-null", "if false then")),
        ("any caller", s("if not public.is_owner() then -- rule:cafe-sale-owner", "if false then")),
        ("any log reader", s("if not public.is_owner() then -- rule:cafe-sales-read-owner", "if false then")),
        ("extra keys", s("and v_keys <@ array['clientId', 'expenses', 'lines', 'name', 'notes', 'payMethod', 'saleDate', 'takeStock']", "and true")),
        ("missing keys", s("if not (v_keys @> array['clientId', 'lines', 'name', 'notes', 'payMethod', 'saleDate', 'takeStock']", "if not (true")),
        ("any expenses", s("if p_sale ? 'expenses' then -- rule:cafe-sale-expenses", "if false then")),
        ("too many expenses", s("jsonb_array_length(p_sale -> 'expenses') > 10", "false")),
        ("expense draw", s("or lower(v_exp_cats[cardinality(v_exp_cats)]) = 'owner draw' then -- rule:cafe-sale-expense-text", "then -- rule:cafe-sale-expense-text")),
        ("expense text", s("if length(v_exp_cats[cardinality(v_exp_cats)]) not between 1 and 60 or", "if false and")),
        ("expense amount", s("if v_n <> trunc(v_n) or v_n < 1 or v_n > 100000000 then -- rule:cafe-sale-expense-amount", "if false then")),
        ("expense dated now", s("-v_exp_amts[v_i], v_stamp, v_id,", "-v_exp_amts[v_i], v_now, v_id,")),
        ("expense not tied", s("-v_exp_amts[v_i], v_stamp, v_id,", "-v_exp_amts[v_i], v_stamp, null,")),
        ("expense positive", s("-v_exp_amts[v_i], v_stamp, v_id,", "v_exp_amts[v_i], v_stamp, v_id,")),
        ("expense any caller", s("if not public.is_owner() then -- rule:cafe-expense-owner", "if false then")),
        ("expense keys", s("is distinct from array['amountCents', 'category', 'clientId', 'note', 'orderNo'] then -- rule:cafe-expense-keys", "is null then")),
        ("expense add text", s("or lower(v_cat) = 'owner draw' then -- rule:cafe-expense-text", "then -- rule:cafe-expense-text")),
        ("expense add amount", s("if v_amount <> trunc(v_amount) or v_amount < 1 or v_amount > 100000000 then -- rule:cafe-expense-amount", "if false then")),
        ("expense add replay", s("if found then -- rule:cafe-expense-replay", "if false then")),
        ("expense add id reuse", s("if v_seen.payload_hash is distinct from v_hash or v_seen.order_id is distinct from v_no then -- rule:cafe-expense-client-id-reuse", "if false then")),
        ("expense add any order", s("o.channel = 'cafe' and o.pay_state = 'confirmed';", "true;")),
        ("expense add limit", s("kind = 'cost') >= 10 then -- rule:cafe-expense-limit", "kind = 'cost') >= 100 then -- rule:cafe-expense-limit")),
        ("expense add dated now", s("v_order.placed_at, v_no, auth.uid()", "now(), v_no, auth.uid()")),
        ("log ignores expenses", s("where l.order_id = o.id and l.kind = 'cost'), 0)::bigint", "where false), 0)::bigint")),
        ("anon adds expense", sale + "\ngrant execute on function public.add_cafe_expense(jsonb) to anon;"),
        ("no text limits", s("if length(v_name) not between 1 and 80 or length(v_notes) > 300 or length(v_method) not between 1 and 30\n     or v_name ~ '[[:cntrl:]]' or v_notes ~ '[[:cntrl:]]' or v_method ~ '[[:cntrl:]]' then -- rule:cafe-sale-text", "if false then")),
        ("control characters", s("or v_name ~ '[[:cntrl:]]' or v_notes ~ '[[:cntrl:]]' or v_method ~ '[[:cntrl:]]' then -- rule:cafe-sale-text", "then -- rule:cafe-sale-text")),
        ("any date", s("if v_date > v_today or v_date < v_today - 90 then -- rule:cafe-sale-date", "if false then")),
        ("future date", s("if v_date > v_today or v_date < v_today - 90 then -- rule:cafe-sale-date", "if v_date < v_today - 90 then -- rule:cafe-sale-date")),
        ("any method", s("if v_method <> 'Cash' and not exists (select 1 from public.payment_methods m where m.active and m.label = v_method) then -- rule:cafe-sale-method", "if false then")),
        ("inactive method", s("m.active and m.label = v_method", "m.label = v_method")),
        ("any line count", s("if jsonb_array_length(v_lines) not between 1 and 40 then -- rule:cafe-sale-lines", "if false then")),
        ("any quantity", s("if v_n <> trunc(v_n) or v_n < 1 or v_n > 500 then -- rule:cafe-sale-qty", "if false then")),
        ("any price", s("if v_n <> trunc(v_n) or v_n < 1 or v_n > 100000000 then -- rule:cafe-sale-price", "if false then")),
        ("two lines of one product", s("if cardinality(v_pids) <> (select count(distinct x) from unnest(v_pids) x) then -- rule:cafe-sale-duplicate", "if false then")),
        ("any total", s("if v_total > 100000000 then -- rule:cafe-sale-total", "if false then")),
        ("no replay", s("if found then -- rule:cafe-sale-replay", "if false then")),
        ("id reuse", s("if v_existing.payload_hash is distinct from v_hash or v_existing.channel <> 'cafe' then -- rule:cafe-sale-client-id-reuse", "if false then")),
        ("removed product", s("p.id = x and p.archived_at is null)) then -- rule:cafe-sale-product", "p.id = x)) then -- rule:cafe-sale-product")),
        ("ignores capacity", s("if not public.capacity_allows(v_capacity, v_committed::integer, v_units::integer) then -- rule:cafe-sale-capacity", "if false then")),
        ("off still takes slots", s("case when v_count then p.capacity_weight else 0 end -- rule:cafe-sale-weight", "p.capacity_weight")),
        ("off ignored", s("select s.count_toward_limit into v_count from public.cafe_order_settings s where s.id;", "v_count := true;")),
        ("not paid", s("'Completed', 'confirmed', v_method, v_total::bigint, v_total::bigint", "'Completed', 'unpaid', v_method, v_total::bigint, v_total::bigint")),
        ("not completed", s("'Completed', 'confirmed', v_method", "'Payment review', 'confirmed', v_method")),
        ("paid amount", s("v_method, v_total::bigint, v_total::bigint, v_stamp,", "v_method, v_total::bigint, 1, v_stamp,")),
        ("paid today", s("v_total::bigint, v_total::bigint, v_stamp,\n          v_stamp, v_notes", "v_total::bigint, v_total::bigint, v_now,\n          v_stamp, v_notes")),
        ("collected today", s("v_total::bigint, v_total::bigint, v_stamp,\n          v_stamp, v_notes", "v_total::bigint, v_total::bigint, v_stamp,\n          v_now, v_notes")),
        ("future stamp", s("v_stamp := case when v_date = v_today then v_now", "v_stamp := case when false then v_now")),
        ("customer token", s("v_notes, v_date, v_client, v_hash, null, v_stamp); -- rule:cafe-sale-paid", "v_notes, v_date, v_client, v_hash, repeat('c', 64), v_stamp); -- rule:cafe-sale-paid")),
        ("audit action changed", s("'cafe.sale', 'orders', v_id", "'cafe.sold', 'orders', v_id")),
        ("stock never taken", s("if v_take then -- rule:cafe-sale-stock", "if false then -- rule:cafe-sale-stock")),
        ("stock always taken", s("if v_take then -- rule:cafe-sale-stock", "if true then -- rule:cafe-sale-stock")),
        ("café in staff orders", s("where o.channel <> 'cafe' -- rule:staff-orders-no-cafe", "where true -- rule:staff-orders-no-cafe")),
        ("books label unchanged", s("case when o.channel = 'cafe' then 'Café sale ' else 'Order ' end", "'Order '")),
        ("log lists orders", s("where o.channel = 'cafe'\n     order by o.pickup_date desc", "where true\n     order by o.pickup_date desc")),
        ("anon sells", sale + "\ngrant execute on function public.record_cafe_sale(jsonb) to anon;"),
        ("anon reads log", sale + "\ngrant execute on function public.get_cafe_sales() to anon;"),
        ("anon reads", settings + "\ngrant execute on function public.get_cafe_order_settings() to anon;"),
        ("anon saves", settings + "\ngrant execute on function public.save_cafe_order_settings(boolean) to anon;"),
        ("table open", settings + "\ngrant select on public.cafe_order_settings to authenticated;"),
        ("old entry point back", sale + "\ncreate function public.create_cafe_order(p_order jsonb) returns void language sql as $f$ select 1 $f$;"),
    ]
    # Mutants that restate only part of the functions still need the others from the migration; the settings and the sale pieces are
    # separate texts, so a sale mutant is applied on top of the unchanged settings (already installed on the reset) and the reverse.
    # What a mutant's failure may say besides the scenario's own words: the database's own refusal when a rule is gone.
    ALSO = {"expense add replay": "ledger_entries_client_id_key", "no replay": "orders_client_id_key", "off ignored": "not enough room left", "stock always taken": "cafe sales"}
    problems = []
    for name, mutation in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if "cafe sales" not in str(error) and ALSO.get(name, "-none-") not in str(error):
                problems.append(f"mutant {name!r} failed differently: {error}")
        else:
            problems.append("cafe sales mutation was not detected: " + name)
        verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    if problems:
        h.fail("; ".join(problems))
    if "CAFE_SALES|passed" not in h.psql(db_id, workdir, sql):
        h.fail("cafe sales contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print(f"Café sale log: owner-only entry, keys and ranges, paid and completed on the sale date, stored prices and server total, stock like a packed order, replay, capacity on and off, books revenue and label, kept off the staff orders and the customer side; {len(mutants)} mutants.",
          flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-cafe-sale-log-fixture.json"
    raise SystemExit(h.main(after_reset=check))
