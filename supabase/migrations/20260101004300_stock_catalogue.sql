-- A3 (docs/state/finish-plan.md slice A3): Cine's stock items, suppliers and supplier prices, owner-managed.
--
-- The tables already exist (suppliers, inventory_items, supplier_prices) but only the demo seed filled them and no API role
-- can write to them (their grants were revoked in 20260101001900; architecture A routes every write through an RPC).
-- This migration adds what a real catalogue needs and the owner-only RPCs:
--
--   get_stock_catalogue()     suppliers, items and prices, each with the stamp to change it with (owner only)
--   save_supplier()           create or change one supplier (exact keys, stale stamp P0002, replay-safe create)
--   save_stock_item()         create or change one item (an ingredient or packaging); the quantity on hand is NOT
--                             written here: stock movements (receive, count, waste) are slice C1
--   save_supplier_price()     create or change one supplier's price for one item; a changed price pushes the old one
--                             onto the "was ..." history (three kept)
--
-- Nothing is deleted: a supplier, item or price is switched off (`active = false`). Names must be unique
-- (case-insensitive) because the recipes and the grocery list refer to an item by its name.
-- Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it (as in B1 and D4).

alter table public.suppliers
  add column active boolean not null default true,
  add column updated_at timestamptz not null default now();
alter table public.inventory_items
  add column active boolean not null default true;
alter table public.supplier_prices
  add column active boolean not null default true,
  add column updated_at timestamptz not null default now();

-- Every change now goes through the RPCs below (bounds, unique names, stale stamps): the legacy direct-write grants
-- (kept only by RLS until now, as B3 did for orders) are revoked. Reads stay owner-only through RLS and the RPC.
revoke insert, update, delete on table public.suppliers, public.inventory_items, public.supplier_prices
  from public, anon, authenticated;

create trigger suppliers_touch before update on public.suppliers
for each row execute function public.touch_updated_at();
create trigger supplier_prices_touch before update on public.supplier_prices
for each row execute function public.touch_updated_at();

create or replace function public.get_stock_catalogue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_suppliers jsonb;
  v_items jsonb;
  v_prices jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the stock catalogue' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'phone', s.phone, 'notes', s.notes, 'place', s.place,
           'active', s.active, 'updated_at', s.updated_at) order by lower(s.name), s.id), '[]'::jsonb)
    into v_suppliers from public.suppliers s;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'name', i.name, 'category', i.category, 'unit', i.unit, 'on_hand', i.on_hand,
           'par_level', i.par_level, 'pack_size', i.pack_size, 'pack_label', i.pack_label,
           'supplier_id', i.supplier_id, 'use_by_days', i.use_by_days, 'last_counted', i.last_counted,
           'active', i.active, 'updated_at', i.updated_at) order by i.category, lower(i.name), i.id), '[]'::jsonb)
    into v_items from public.inventory_items i;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'supplier_id', p.supplier_id, 'item_name', p.item_name, 'pack_label', p.pack_label,
           'price_cents', p.price_cents, 'previous_cents', to_jsonb(p.previous_cents),
           'last_bought', p.last_bought, 'preferred', p.preferred, 'active', p.active,
           'updated_at', p.updated_at) order by lower(p.item_name), p.price_cents, p.id), '[]'::jsonb)
    into v_prices from public.supplier_prices p;
  return jsonb_build_object('suppliers', v_suppliers, 'items', v_items, 'prices', v_prices);
end;
$$;
revoke execute on function public.get_stock_catalogue() from public, anon, authenticated;
grant execute on function public.get_stock_catalogue() to authenticated;

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one supplier. The body is exactly these keys:
 * id, name, phone, notes, place, active. The id is a lowercase slug or uuid the browser mints for a new supplier.
 */
create or replace function public.save_supplier(
  p_supplier jsonb,
  p_expected_updated_at timestamptz
)
returns table (id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bad    boolean;
  v_keys   text[];
  v_id     text;
  v_name   text;
  v_phone  text;
  v_notes  text;
  v_place  text;
  v_active boolean;
  v_row    public.suppliers%rowtype;
  v_at     timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the suppliers' using errcode = '42501';
  end if;
  if p_supplier is null or jsonb_typeof(p_supplier) <> 'object' then
    raise exception 'a supplier must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_supplier) k;
  if v_keys is distinct from array['active', 'id', 'name', 'notes', 'phone', 'place'] then -- rule:supplier-keys
    raise exception 'a supplier carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_supplier -> 'id') <> 'string' or jsonb_typeof(p_supplier -> 'name') <> 'string'
     or jsonb_typeof(p_supplier -> 'phone') <> 'string' or jsonb_typeof(p_supplier -> 'notes') <> 'string'
     or jsonb_typeof(p_supplier -> 'place') <> 'string' or jsonb_typeof(p_supplier -> 'active') <> 'boolean' then
    raise exception 'a supplier field has the wrong type' using errcode = '22023';
  end if;
  v_id := p_supplier ->> 'id';
  if v_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' then -- rule:supplier-id
    raise exception 'the id is a lowercase slug or uuid' using errcode = '22023';
  end if;
  v_name := btrim(p_supplier ->> 'name');
  v_phone := btrim(p_supplier ->> 'phone');
  v_notes := btrim(p_supplier ->> 'notes');
  v_place := btrim(p_supplier ->> 'place');
  v_bad := length(v_name) not between 1 and 80 or length(v_phone) > 40 or length(v_place) > 80 or length(v_notes) > 300
     or (v_name || v_phone || v_place) ~ '[[:cntrl:]]' or replace(v_notes, E'\n', '') ~ '[[:cntrl:]]';
  if v_bad then -- rule:supplier-text
    raise exception 'a supplier name is 1 to 80 characters; phone 40, place 80 and notes 300 at most' using errcode = '22023';
  end if;
  v_active := (p_supplier ->> 'active')::boolean;

  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:suppliers', 0));
  if exists (select 1 from public.suppliers s where lower(s.name) = lower(v_name) and s.id <> v_id) then -- rule:supplier-name-taken
    raise exception 'another supplier already has that name' using errcode = '22023';
  end if;
  select * into v_row from public.suppliers s where s.id = v_id;
  if not found then
    if p_expected_updated_at is not null then -- rule:supplier-create-stamp
      raise exception 'that supplier does not exist' using errcode = 'P0002';
    end if;
    insert into public.suppliers (id, name, phone, notes, place, active)
    values (v_id, v_name, v_phone, v_notes, v_place, v_active)
    returning updated_at into v_at;
    return query select v_id, v_at;
    return;
  end if;
  -- A lost reply on a create: the same body again is answered with the row that exists.
  if p_expected_updated_at is null then
    v_bad := v_row.name = v_name and v_row.phone = v_phone and v_row.notes = v_notes and v_row.place = v_place
       and v_row.active = v_active;
    if v_bad then -- rule:supplier-replay
      return query select v_row.id, v_row.updated_at;
      return;
    end if;
    raise exception 'that supplier already exists with other values' using errcode = 'P0002';
  end if;
  update public.suppliers as s set name = v_name, phone = v_phone, notes = v_notes, place = v_place, active = v_active
    where s.id = v_id and date_trunc('milliseconds', s.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning s.updated_at into v_at;
  if v_at is null then -- rule:supplier-stale
    raise exception 'the supplier changed since it was read' using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.save_supplier(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_supplier(jsonb, timestamptz) to authenticated;

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one stock item. Exactly these keys: id, name,
 * category ('Ingredients' or 'Packaging'), unit, par_level, pack_size (or null), pack_label, supplier_id (or null),
 * use_by_days (or null), active. The quantity on hand is never written here.
 */
create or replace function public.save_stock_item(
  p_item jsonb,
  p_expected_updated_at timestamptz
)
returns table (id text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bad    boolean;
  v_keys   text[];
  v_id     text;
  v_name   text;
  v_cat    text;
  v_unit   text;
  v_par    numeric;
  v_pack   numeric;
  v_label  text;
  v_sup    text;
  v_useby  numeric;
  v_active boolean;
  v_row    public.inventory_items%rowtype;
  v_at     timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the stock items' using errcode = '42501';
  end if;
  if p_item is null or jsonb_typeof(p_item) <> 'object' then
    raise exception 'a stock item must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_item) k;
  v_bad := v_keys is distinct from array['active', 'category', 'id', 'name', 'pack_label', 'pack_size', 'par_level',
                                   'supplier_id', 'unit', 'use_by_days'];
  if v_bad then -- rule:item-keys
    raise exception 'a stock item carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_item -> 'id') <> 'string' or jsonb_typeof(p_item -> 'name') <> 'string'
     or jsonb_typeof(p_item -> 'category') <> 'string' or jsonb_typeof(p_item -> 'unit') <> 'string'
     or jsonb_typeof(p_item -> 'pack_label') <> 'string' or jsonb_typeof(p_item -> 'active') <> 'boolean'
     or jsonb_typeof(p_item -> 'par_level') <> 'number'
     or jsonb_typeof(p_item -> 'pack_size') not in ('number', 'null')
     or jsonb_typeof(p_item -> 'supplier_id') not in ('string', 'null')
     or jsonb_typeof(p_item -> 'use_by_days') not in ('number', 'null') then
    raise exception 'a stock item field has the wrong type' using errcode = '22023';
  end if;
  v_id := p_item ->> 'id';
  if v_id !~ '^[a-z0-9][a-z0-9-]{0,39}$' then -- rule:item-id
    raise exception 'the id is a lowercase slug or uuid' using errcode = '22023';
  end if;
  v_name := btrim(p_item ->> 'name');
  v_unit := btrim(p_item ->> 'unit');
  v_label := btrim(p_item ->> 'pack_label');
  v_cat := p_item ->> 'category';
  v_bad := length(v_name) not between 1 and 80 or length(v_unit) not between 1 and 12 or length(v_label) > 40
     or (v_name || v_unit || v_label) ~ '[[:cntrl:]]';
  if v_bad then -- rule:item-text
    raise exception 'an item name is 1 to 80 characters, its unit 1 to 12 and its pack label at most 40' using errcode = '22023';
  end if;
  if v_cat not in ('Ingredients', 'Packaging') then -- rule:item-category
    raise exception 'the category is Ingredients or Packaging' using errcode = '22023';
  end if;
  v_par := (p_item ->> 'par_level')::numeric;
  v_pack := (p_item ->> 'pack_size')::numeric;
  v_bad := v_par <> round(v_par, 3) or v_par not between 0 and 999999999
     or (v_pack is not null and (v_pack <> round(v_pack, 3) or v_pack not between 0.001 and 999999999));
  if v_bad then -- rule:item-numbers
    raise exception 'quantities are from 0 to 999,999,999 with at most 3 decimals; a pack size is above 0' using errcode = '22023';
  end if;
  v_useby := (p_item ->> 'use_by_days')::numeric;
  if v_useby is not null and (v_useby <> trunc(v_useby) or v_useby not between 1 and 3650) then -- rule:item-useby
    raise exception 'use-by days are a whole number from 1 to 3650' using errcode = '22023';
  end if;
  v_sup := p_item ->> 'supplier_id';
  v_active := (p_item ->> 'active')::boolean;

  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  if v_sup is not null and not exists (select 1 from public.suppliers s where s.id = v_sup) then -- rule:item-supplier
    raise exception 'that supplier does not exist' using errcode = '22023';
  end if;
  if exists (select 1 from public.inventory_items i where lower(i.name) = lower(v_name) and i.id <> v_id) then -- rule:item-name-taken
    raise exception 'another item already has that name' using errcode = '22023';
  end if;
  select * into v_row from public.inventory_items i where i.id = v_id;
  if not found then
    if p_expected_updated_at is not null then -- rule:item-create-stamp
      raise exception 'that item does not exist' using errcode = 'P0002';
    end if;
    insert into public.inventory_items (id, name, category, unit, par_level, pack_size, pack_label, supplier_id, use_by_days, active)
    values (v_id, v_name, v_cat, v_unit, v_par, v_pack, v_label, v_sup, v_useby::integer, v_active)
    returning updated_at into v_at;
    return query select v_id, v_at;
    return;
  end if;
  if p_expected_updated_at is null then
    v_bad := v_row.name = v_name and v_row.category = v_cat and v_row.unit = v_unit and v_row.par_level = v_par
       and v_row.pack_size is not distinct from v_pack and v_row.pack_label = v_label
       and v_row.supplier_id is not distinct from v_sup and v_row.use_by_days is not distinct from v_useby::integer
       and v_row.active = v_active;
    if v_bad then -- rule:item-replay
      return query select v_row.id, v_row.updated_at;
      return;
    end if;
    raise exception 'that item already exists with other values' using errcode = 'P0002';
  end if;
  v_bad := v_row.name <> v_name and (exists (select 1 from public.supplier_prices p where p.item_name = v_row.name)
      or exists (select 1 from public.recipe_ingredients r where r.item_name = v_row.name));
  if v_bad then -- rule:item-rename-referenced
    raise exception 'an item with prices or recipes cannot be renamed: switch it off and add the new one' using errcode = '22023';
  end if;
  update public.inventory_items as i set name = v_name, category = v_cat, unit = v_unit, par_level = v_par,
      pack_size = v_pack, pack_label = v_label, supplier_id = v_sup, use_by_days = v_useby::integer, active = v_active
    where i.id = v_id and date_trunc('milliseconds', i.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning i.updated_at into v_at;
  if v_at is null then -- rule:item-stale
    raise exception 'the item changed since it was read' using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.save_stock_item(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_stock_item(jsonb, timestamptz) to authenticated;

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one supplier's price for one item. Exactly these
 * keys: id (uuid), supplier_id, item_name, pack_label, price_cents, last_bought (text as she reads it), preferred,
 * active. A changed price pushes the old one onto `previous_cents` (the last three are kept).
 */
create or replace function public.save_supplier_price(
  p_price jsonb,
  p_expected_updated_at timestamptz
)
returns table (id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_bad    boolean;
  v_keys   text[];
  v_id     uuid;
  v_sup    text;
  v_item   text;
  v_label  text;
  v_cents  numeric;
  v_bought text;
  v_pref   boolean;
  v_active boolean;
  v_row    public.supplier_prices%rowtype;
  v_prev   bigint[];
  v_at     timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the supplier prices' using errcode = '42501';
  end if;
  if p_price is null or jsonb_typeof(p_price) <> 'object' then
    raise exception 'a supplier price must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_price) k;
  v_bad := v_keys is distinct from array['active', 'id', 'item_name', 'last_bought', 'pack_label', 'preferred',
                                   'price_cents', 'supplier_id'];
  if v_bad then -- rule:price-keys
    raise exception 'a supplier price carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_price -> 'id') <> 'string' or jsonb_typeof(p_price -> 'supplier_id') <> 'string'
     or jsonb_typeof(p_price -> 'item_name') <> 'string' or jsonb_typeof(p_price -> 'pack_label') <> 'string'
     or jsonb_typeof(p_price -> 'last_bought') <> 'string' or jsonb_typeof(p_price -> 'price_cents') <> 'number'
     or jsonb_typeof(p_price -> 'preferred') <> 'boolean' or jsonb_typeof(p_price -> 'active') <> 'boolean' then
    raise exception 'a supplier price field has the wrong type' using errcode = '22023';
  end if;
  if (p_price ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_price ->> 'id')::uuid;
  v_sup := p_price ->> 'supplier_id';
  v_item := btrim(p_price ->> 'item_name');
  v_label := btrim(p_price ->> 'pack_label');
  v_bought := btrim(p_price ->> 'last_bought');
  if length(v_label) not between 1 and 40 or length(v_bought) > 20 or (v_label || v_bought) ~ '[[:cntrl:]]' then -- rule:price-text
    raise exception 'a pack label is 1 to 40 characters and the last-bought text at most 20' using errcode = '22023';
  end if;
  v_cents := (p_price ->> 'price_cents')::numeric;
  if v_cents <> trunc(v_cents) or v_cents not between 0 and 100000000 then -- rule:price-cents
    raise exception 'a price is whole centavos from 0 to 1,000,000 pesos' using errcode = '22023';
  end if;
  v_pref := (p_price ->> 'preferred')::boolean;
  v_active := (p_price ->> 'active')::boolean;

  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:prices', 0));
  if not exists (select 1 from public.suppliers s where s.id = v_sup) then -- rule:price-supplier
    raise exception 'that supplier does not exist' using errcode = '22023';
  end if;
  if not exists (select 1 from public.inventory_items i where i.name = v_item) then -- rule:price-item
    raise exception 'no stock item has that exact name' using errcode = '22023';
  end if;
  if exists (select 1 from public.supplier_prices p where p.supplier_id = v_sup and p.item_name = v_item and p.id <> v_id) then -- rule:price-duplicate
    raise exception 'that supplier already has a price for that item' using errcode = '22023';
  end if;
  select * into v_row from public.supplier_prices p where p.id = v_id;
  if not found then
    if p_expected_updated_at is not null then -- rule:price-create-stamp
      raise exception 'that price does not exist' using errcode = 'P0002';
    end if;
    insert into public.supplier_prices (id, supplier_id, item_name, pack_label, price_cents, last_bought, preferred, active)
    values (v_id, v_sup, v_item, v_label, v_cents::bigint, v_bought, v_pref, v_active)
    returning updated_at into v_at;
    return query select v_id, v_at;
    return;
  end if;
  if p_expected_updated_at is null then
    v_bad := v_row.supplier_id = v_sup and v_row.item_name = v_item and v_row.pack_label = v_label
       and v_row.price_cents = v_cents::bigint and v_row.last_bought = v_bought and v_row.preferred = v_pref
       and v_row.active = v_active;
    if v_bad then -- rule:price-replay
      return query select v_row.id, v_row.updated_at;
      return;
    end if;
    raise exception 'that price already exists with other values' using errcode = 'P0002';
  end if;
  v_prev := v_row.previous_cents;
  if v_row.price_cents <> v_cents::bigint then -- rule:price-history
    v_prev := (array[v_row.price_cents] || v_row.previous_cents)[1:3];
  end if;
  update public.supplier_prices as p set supplier_id = v_sup, item_name = v_item, pack_label = v_label,
      price_cents = v_cents::bigint, previous_cents = v_prev, last_bought = v_bought, preferred = v_pref, active = v_active
    where p.id = v_id and date_trunc('milliseconds', p.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning p.updated_at into v_at;
  if v_at is null then -- rule:price-stale
    raise exception 'the price changed since it was read' using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.save_supplier_price(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_supplier_price(jsonb, timestamptz) to authenticated;
