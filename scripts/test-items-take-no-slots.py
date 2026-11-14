"""Plain items take no cookie slots (migration 20260101008600): capacity_allows() against every shared case, the weight trigger,
the order-line weight and authority, on two resets."""
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


def scenario():
    """The SQL: every case of tests/fixtures/capacity-cases.json against capacity_allows(), then the item weights."""
    cases = json.loads((ROOT / "tests/fixtures/capacity-cases.json").read_text(encoding="utf-8"))["cases"]
    checks = "\n".join(
        f"  if public.capacity_allows({c['capacity']}, {c['committed']}, {c['requested']}) is distinct from {str(c['ok']).lower()} then\n"
        # Dollar quoting: a case name can never break out of the SQL string.
        "    raise exception 'SLOTS_CASE % differs', $c$" + c["name"] + "$c$;\n  end if;"
        for c in cases
        # As tests/e2e/capacity-parity.spec.ts: a case marked "sql": false is TypeScript only.
        if c.get("sql") is not False
    )
    return f"""begin;
insert into auth.users(id) values ('b0860000-0000-4000-8000-000000000001');
insert into public.profiles(id,role,display_name,active) values ('b0860000-0000-4000-8000-000000000001','owner','Slots owner',true);
select set_config('request.jwt.claim.sub', 'b0860000-0000-4000-8000-000000000001', true),
       set_config('request.jwt.claims', json_build_object('sub','b0860000-0000-4000-8000-000000000001','role','authenticated')::text, true);
do $$
declare at timestamptz;
begin
{checks}
  -- Her item type, and a product of it: it weighs 0 slots, whatever was sent.
  perform public.save_product_type(jsonb_build_object('id','slots-item','label','Slots item','behaves_as','item','sort_order',5,'active',true), null);
  perform public.save_flavour('slots-sticker', jsonb_build_object('active', true, 'allergens', 'None', 'capacity_weight', 1,
    'description', '', 'image_path', '', 'item_type', 'item', 'kind', 'Permanent', 'name', 'Slots sticker', 'price_cents', 5000,
    'short_name', 'Sticker', 'sort_order', 900, 'tag', '', 'type_id', 'slots-item'), null);
  if (select capacity_weight from public.products where id = 'slots-sticker') <> 0 then
    raise exception 'SLOTS_ITEM_WEIGHT an item must weigh 0 slots';
  end if;
  -- A direct write cannot give it slots back, and a cookie never weighs 0.
  update public.products set capacity_weight = 3 where id = 'slots-sticker';
  if (select capacity_weight from public.products where id = 'slots-sticker') <> 0 then
    raise exception 'SLOTS_ITEM_WEIGHT a direct write gave an item slots';
  end if;
  select updated_at into at from public.products where id = 'slots-sticker';
  perform public.save_flavour('slots-sticker', jsonb_build_object('active', true, 'allergens', 'None', 'capacity_weight', 2,
    'description', '', 'image_path', '', 'item_type', 'cookie', 'kind', 'Permanent', 'name', 'Slots sticker', 'price_cents', 5000,
    'short_name', 'Sticker', 'sort_order', 900, 'tag', '', 'type_id', 'cookie'), at);
  if (select capacity_weight from public.products where id = 'slots-sticker') <> 2 then
    raise exception 'SLOTS_COOKIE_WEIGHT a cookie keeps the weight it was given';
  end if;
  insert into public.products(id, name, short_name, price_cents, kind, item_type, capacity_weight)
    values ('slots-zero-cookie', 'Zero cookie', 'Zero', 100, 'Permanent', 'cookie', 0);
  if (select capacity_weight from public.products where id = 'slots-zero-cookie') <> 1 then
    raise exception 'SLOTS_COOKIE_FLOOR a cookie must weigh at least 1 slot';
  end if;
  -- An order line may carry 0 slots; more than 48 is still refused.
  begin
    insert into public.order_items(order_id, product_id, qty, unit_price_cents, capacity_weight) values ('nope', 'slots-sticker', 1, 1, 49);
    raise exception 'SLOTS_LINE_CAP a line over 48 slots was accepted';
  exception when check_violation or foreign_key_violation then null;
  end;
  if not exists (select 1 from pg_constraint where conname = 'order_items_capacity_weight_check'
                   and pg_get_constraintdef(oid) like '%capacity_weight >= 0%') then
    raise exception 'SLOTS_LINE_ZERO order lines must allow 0 slots';
  end if;
  if not has_function_privilege('anon', 'public.capacity_allows(integer,integer,integer)', 'EXECUTE') then
    raise exception 'SLOTS_GRANTS capacity_allows must stay callable by the shop';
  end if;
end $$;
select 'ITEMS_NO_SLOTS|passed';
rollback;
"""


def check(db_id, workdir, _password, _report):
    inventory = (ROOT / "tests/integration/db/schema-inventory.sql").read_text()
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    sql = scenario()
    definition = (ROOT / "supabase/migrations/20260101008600_items_take_no_slots.sql").read_text()

    def fn(name):
        start = definition.index("create or replace function public." + name + "(")
        end = definition.index(chr(10) + "$$;" + chr(10), start) + 5
        return definition[start:end]

    trigger, allows = fn("product_type_behaviour"), fn("capacity_allows")
    mutants = [
        (allows.replace("select p_requested >= 0", "select p_requested > 0", 1), "SLOTS_CASE"),
        (allows.replace("and p_requested <= greatest(", "and p_requested <= 1 + greatest(", 1), "SLOTS_CASE"),
        (trigger.replace("new.capacity_weight := 0;", "null;", 1), "SLOTS_ITEM_WEIGHT"),
        (trigger.replace("new.capacity_weight := 1;", "null;", 1), "products_capacity_weight"),  # the table check catches it first
        ("revoke execute on function public.capacity_allows(integer,integer,integer) from public, anon;", "SLOTS_GRANTS"),
    ]
    for mutation, wanted in mutants:
        try:
            h.psql(db_id, workdir, sql.replace("begin;", "begin;\n" + mutation, 1))
        except RuntimeError as error:
            if wanted not in str(error):
                raise RuntimeError(f"mutant for {wanted!r} failed differently: {error}") from error
        else:
            h.fail("items-take-no-slots mutation was not detected: " + wanted)
    if "ITEMS_NO_SLOTS|passed" not in h.psql(db_id, workdir, sql):
        h.fail("items-take-no-slots contract did not complete")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    print("Items take no slots: every shared capacity case, item and cookie weights, order lines, grants; five mutants passed.", flush=True)


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-items-no-slots-fixture.json"
    raise SystemExit(h.main(after_reset=check))
