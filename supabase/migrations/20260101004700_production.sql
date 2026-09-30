-- C2 (docs/state/finish-plan.md slice C2): production. Mixing dough, baking a batch and packing use stock on the database.
--
-- Until now the ported confirm actions changed only the screen. Now:
--
--   record_production()   owner only. A dough mix (balls, up to one recipe yield; a double is two mixes) or a baked batch
--                         (what was baked, rejects, the +/- steps on each ingredient). It works out every recipe line of the
--                         version it was made on (the same rounding as the ported screens: pieces round up, the rest to 0.1) and
--                         takes it off stock as `use` movements in ONE transaction, never more than is there: what could not
--                         be taken is the shortfall, kept on the record. A batch draws on chilled dough first; only the rest is
--                         mixed from ingredients. Idempotent on the record's client id.
--   record_pack()         owner only. Packing an order takes its packaging off stock, once per order however often it is
--                         packed again (the record id is derived from the order).
--   get_production()      the owner's batches and dough records, the dough and baked balances, the shortfalls
--   record_event_sale()   redefined: a bazaar sale also uses its pouches and bag, on its first insert only (a replay and a sale
--                         that arrives already voided add nothing), so the offline queue's replay is applied exactly once
--
-- `use` is not a kind `record_stock_movement` accepts: only these functions write it (through the internal `use_stock`, which no
-- API role can execute). Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it.

alter table public.stock_movements drop constraint stock_movements_kind_check;
alter table public.stock_movements
  add constraint stock_movements_kind_check check (kind in ('opening', 'receipt', 'count', 'waste', 'adjust', 'use'));

create table public.production_records (
  id uuid primary key,
  kind text not null check (kind in ('dough', 'batch', 'pack', 'sale')),
  product_id text references public.products (id),
  ref text not null default '' check (length(ref) <= 160),
  qty integer not null check (qty >= 0),
  target integer check (target is null or target >= 0),
  rejects integer not null default 0 check (rejects >= 0),
  dough_used integer not null default 0 check (dough_used >= 0),
  recipe_version integer check (recipe_version is null or recipe_version >= 1),
  drop_no integer not null default 0 check (drop_no >= 0),
  short jsonb not null default '[]'::jsonb check (jsonb_typeof(short) = 'array'),
  at timestamptz not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete set null,
  received_at timestamptz not null default now()
);
create index production_records_kind_idx on public.production_records (kind, at);
alter table public.production_records enable row level security;
revoke all on table public.production_records from public, anon, authenticated;

alter table public.stock_movements add column production_id uuid references public.production_records (id);

-- Internal: takes what it can of one item by name, never more than is there. Returns the part that could not be taken
-- (all of it when no active item has that name). No API role can execute it.
create or replace function public.use_stock(p_prod uuid, p_seq integer, p_name text, p_qty numeric, p_reason text, p_at timestamptz)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_items%rowtype;
  v_take numeric;
  v_key  text;
begin
  select * into v_item from public.inventory_items i where lower(i.name) = lower(p_name) and i.active order by i.id limit 1;
  if not found then
    return p_qty;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_item:' || v_item.id, 0));
  select * into v_item from public.inventory_items i where i.id = v_item.id for update;
  v_take := least(p_qty, v_item.on_hand);
  if v_take > 0 then
    v_key := p_prod::text || ':' || p_seq::text || ':' || v_item.id;
    insert into public.stock_movements (id, item_id, kind, qty_delta, reason, at, payload_hash, production_id, created_by)
    values (md5(v_key)::uuid, v_item.id, 'use', -v_take, left(p_reason, 80), p_at,
            encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), p_prod, auth.uid());
    update public.inventory_items as i set on_hand = i.on_hand - v_take where i.id = v_item.id;
  end if;
  return p_qty - v_take;
end;
$$;
revoke execute on function public.use_stock(uuid, integer, text, numeric, text, timestamptz) from public, anon, authenticated;

-- Internal: the item locks of one production, always taken in item id order (two productions that share butter never deadlock).
create or replace function public.lock_stock_items(p_names text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  for v_id in select i.id from public.inventory_items i where i.active and lower(i.name) = any (p_names) order by i.id loop
    perform pg_advisory_xact_lock(hashtextextended('stock_item:' || v_id, 0));
  end loop;
end;
$$;
revoke execute on function public.lock_stock_items(text[]) from public, anon, authenticated;

/**
 * Records one dough mix or one baked batch and takes its ingredients off stock. The body is exactly: id (a uuid the browser
 * mints), kind (dough or batch), product_id, qty (dough: balls, 1 to one recipe yield; batch: everything that came out of the
 * oven), target (batch: what was planned; dough: null), rejects (batch), adj (batch: whole +/- steps by ingredient name; dough: {}),
 * recipe_version (the version the screen showed), drop_no, at (epoch milliseconds). A batch's stored quantity is the good ones
 * (qty - rejects). Returns the record's id, whether this id was already recorded, the chilled dough a batch drew on, and what
 * stock could not cover ([{name, by, unit}]).
 */
create or replace function public.record_production(p_rec jsonb)
returns table (record_id uuid, duplicate boolean, used_dough integer, shortfall jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys    text[];
  v_id      uuid;
  v_kind    text;
  v_pid     text;
  v_qty     numeric;
  v_target  numeric;
  v_rej     numeric;
  v_adj     jsonb;
  v_ver     numeric;
  v_drop    numeric;
  v_at      timestamptz;
  v_hash    text;
  v_seen    public.production_records%rowtype;
  v_recipe  public.recipes%rowtype;
  v_bal     numeric;
  v_used    integer := 0;
  v_mixed   numeric;
  v_line    record;
  v_base    numeric;
  v_step    numeric;
  v_raw     numeric;
  v_amount  numeric;
  v_left    numeric;
  v_plan    jsonb := '[]'::jsonb;
  v_short   jsonb := '[]'::jsonb;
  v_names   text[];
  v_flavour text;
  v_reason  text;
  v_n       integer := 0;
  v_bad     boolean;
  v_p       jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record production' using errcode = '42501';
  end if;
  if p_rec is null or jsonb_typeof(p_rec) <> 'object' then
    raise exception 'a production record must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rec) k;
  if v_keys is distinct from array['adj', 'at', 'drop_no', 'id', 'kind', 'product_id', 'qty', 'recipe_version', 'rejects', 'target'] then -- rule:prod-keys
    raise exception 'a production record carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rec -> 'id') <> 'string' or jsonb_typeof(p_rec -> 'kind') <> 'string'
     or jsonb_typeof(p_rec -> 'product_id') <> 'string' or jsonb_typeof(p_rec -> 'qty') <> 'number'
     or jsonb_typeof(p_rec -> 'target') not in ('number', 'null') or jsonb_typeof(p_rec -> 'rejects') <> 'number'
     or jsonb_typeof(p_rec -> 'adj') <> 'object' or jsonb_typeof(p_rec -> 'recipe_version') <> 'number'
     or jsonb_typeof(p_rec -> 'drop_no') <> 'number' or jsonb_typeof(p_rec -> 'at') <> 'number' then
    raise exception 'a production field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_rec ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:prod-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_rec ->> 'id')::uuid;
  v_kind := p_rec ->> 'kind';
  if v_kind not in ('dough', 'batch') then -- rule:prod-kind
    raise exception 'the kind is dough or batch' using errcode = '22023';
  end if;
  v_pid := p_rec ->> 'product_id';
  v_qty := (p_rec ->> 'qty')::numeric;
  v_rej := (p_rec ->> 'rejects')::numeric;
  v_target := (p_rec ->> 'target')::numeric;
  v_ver := (p_rec ->> 'recipe_version')::numeric;
  v_drop := (p_rec ->> 'drop_no')::numeric;
  v_adj := p_rec -> 'adj';
  v_bad := v_qty <> trunc(v_qty) or v_qty not between 1 and 10000;
  if v_bad then -- rule:prod-qty
    raise exception 'a quantity is a whole number from 1 to 10000' using errcode = '22023';
  end if;
  v_bad := v_rej <> trunc(v_rej) or v_rej < 0 or v_rej > v_qty or (v_kind = 'dough' and v_rej <> 0);
  if v_bad then -- rule:prod-rejects
    raise exception 'rejects are whole, not more than were baked, and only a batch has them' using errcode = '22023';
  end if;
  v_bad := (v_kind = 'dough' and v_target is not null)
           or (v_kind = 'batch' and (v_target is null or v_target <> trunc(v_target) or v_target not between 0 and 10000));
  if v_bad then -- rule:prod-target
    raise exception 'a batch has a planned whole number; dough has none' using errcode = '22023';
  end if;
  v_bad := v_ver <> trunc(v_ver) or v_ver < 1 or v_drop <> trunc(v_drop) or v_drop not between 0 and 100000;
  if v_bad then
    raise exception 'the version and the drop are whole numbers' using errcode = '22023';
  end if;
  if (p_rec ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_rec ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:prod-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;
  if v_kind = 'dough' and v_adj <> '{}'::jsonb then -- rule:prod-adj-dough
    raise exception 'dough has no adjustments' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_each(v_adj) a
                    where jsonb_typeof(a.value) <> 'number' or (a.value #>> '{}')::numeric <> trunc((a.value #>> '{}')::numeric)
                       or (a.value #>> '{}')::numeric not between -50 and 50);
  if v_bad then -- rule:prod-adj-range
    raise exception 'an adjustment is a whole number of steps from -50 to 50' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production_record:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_rec::text, 'UTF8')), 'hex');
  select * into v_seen from public.production_records r where r.id = v_id;
  if found then
    if v_seen.payload_hash <> v_hash then -- rule:prod-replay-conflict
      raise exception 'that id was already used for a different record' using errcode = '23505';
    end if;
    return query select v_id, true, v_seen.dough_used, v_seen.short;
    return;
  end if;

  -- The catalogue's lock, then the recipe's (save_recipe takes them in this order), then this flavour's production.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || v_pid, 0));
  perform pg_advisory_xact_lock(hashtextextended('production:' || v_pid, 0));
  select * into v_recipe from public.recipes r where r.product_id = v_pid;
  if not found then -- rule:prod-no-recipe
    raise exception 'that flavour has no recipe' using errcode = 'P0002';
  end if;
  if v_recipe.version <> v_ver::integer then -- rule:prod-stale-version
    raise exception 'the recipe changed since it was read' using errcode = 'P0002';
  end if;
  if v_kind = 'dough' and v_qty > v_recipe.yield_count then -- rule:prod-dough-size
    raise exception 'dough is mixed whole or halved: at most one recipe yield at a time' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_object_keys(v_adj) k
                    where not exists (select 1 from public.recipe_ingredients i where i.product_id = v_pid and i.item_name = k));
  if v_bad then -- rule:prod-adj-unknown
    raise exception 'an adjustment names an ingredient the recipe does not have' using errcode = '22023';
  end if;
  select p.name into v_flavour from public.products p where p.id = v_pid;

  if v_kind = 'batch' then
    select coalesce(sum(case r.kind when 'dough' then r.qty else -r.dough_used end), 0) into v_bal
      from public.production_records r where r.product_id = v_pid and r.kind in ('dough', 'batch');
    v_used := least(greatest(v_bal, 0), v_qty)::integer;
    v_mixed := v_qty - v_used;
  else
    v_mixed := v_qty;
  end if;
  -- Every line is qty x mixed / yield with the multiplication first: dividing first leaves a rounded quotient (5/9 has no exact
  -- decimal), and a piece line that is exactly 5 would round up to 6.
  for v_line in select i.item_name as name, i.qty as qty, i.unit as unit from public.recipe_ingredients i
                 where i.product_id = v_pid order by i.position, i.id loop
    if v_kind = 'dough' then
      v_raw := v_line.qty * v_mixed / v_recipe.yield_count;
    else
      v_base := round(v_line.qty * v_mixed / v_recipe.yield_count, 1);
      v_step := case v_line.unit when 'pcs' then 1 when 'ml' then 5 else 10 end;
      v_raw := greatest(0, v_base + coalesce((v_adj ->> v_line.name)::numeric, 0) * v_step);
    end if;
    v_amount := case when v_line.unit = 'pcs' then ceil(v_raw) else round(v_raw, 1) end;
    if v_amount > 0 then
      v_plan := v_plan || jsonb_build_object('name', v_line.name, 'unit', v_line.unit, 'amount', v_amount);
    end if;
  end loop;
  select array_agg(lower(x ->> 'name')) into v_names from jsonb_array_elements(v_plan) x;
  perform public.lock_stock_items(coalesce(v_names, array[]::text[]));

  insert into public.production_records (id, kind, product_id, qty, target, rejects, dough_used, recipe_version, drop_no, at,
                                         payload_hash, created_by)
  values (v_id, v_kind, v_pid, case when v_kind = 'batch' then v_qty::integer - v_rej::integer else v_qty::integer end,
          v_target::integer, v_rej::integer, v_used, v_ver::integer, v_drop::integer, v_at, v_hash, auth.uid());
  v_reason := (case v_kind when 'dough' then 'Mixed dough: ' else 'Baked: ' end) || v_flavour || ', Version ' || v_ver::integer;
  for v_p in select x from jsonb_array_elements(v_plan) x loop
    v_n := v_n + 1;
    v_left := public.use_stock(v_id, v_n, v_p ->> 'name', (v_p ->> 'amount')::numeric, v_reason, v_at);
    if v_left > 0 then -- rule:prod-shortfall
      v_short := v_short || jsonb_build_object('name', v_p ->> 'name', 'by', round(v_left, 1), 'unit', v_p ->> 'unit');
    end if;
  end loop;
  update public.production_records r set short = v_short where r.id = v_id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'production.' || v_kind, 'production_records', v_id::text,
    jsonb_build_object('product_id', v_pid, 'qty', v_qty, 'dough_used', v_used, 'short', v_short));
  return query select v_id, false, v_used, v_short;
end;
$$;
revoke execute on function public.record_production(jsonb) from public, anon, authenticated;
grant execute on function public.record_production(jsonb) to authenticated;

/**
 * Packing an order takes its packaging off stock, once per order: the record id is derived from the order, so packing the
 * same order again (a reopened or corrected order) answers the first record and takes nothing more. Full sixes go in a box,
 * the loose ones in pouches, each box or loose cookie gets a sticker, a card goes in each box (one card if none): the
 * ported rule, a default the owner can change (DP-03). Returns the record's id, whether it was already recorded and the shortfall.
 */
create or replace function public.record_pack(p_order text, p_drop integer)
returns table (record_id uuid, duplicate boolean, shortfall jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id     uuid;
  v_count  integer;
  v_boxes  integer;
  v_loose  integer;
  v_seen   public.production_records%rowtype;
  v_at     timestamptz := now();
  v_use    jsonb;
  v_p      record;
  v_n      integer := 0;
  v_left   numeric;
  v_short  jsonb := '[]'::jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record packing' using errcode = '42501';
  end if;
  if p_order is null or length(p_order) not between 1 and 64 or p_drop is null or p_drop not between 0 and 100000 then
    raise exception 'an order id and a drop are required' using errcode = '22023';
  end if;
  v_id := md5('pack:' || p_order)::uuid;
  perform pg_advisory_xact_lock(hashtextextended('production_record:' || v_id::text, 0));
  select * into v_seen from public.production_records r where r.id = v_id;
  if found then
    return query select v_id, true, v_seen.short;
    return;
  end if;
  if not exists (select 1 from public.orders o where o.id = p_order) then -- rule:pack-order-missing
    raise exception 'no such order' using errcode = 'P0002';
  end if;
  select coalesce(sum(i.qty), 0)::integer into v_count from public.order_items i where i.order_id = p_order;
  if v_count < 1 then -- rule:pack-empty
    raise exception 'that order has no cookies to pack' using errcode = '22023';
  end if;
  v_boxes := v_count / 6;
  v_loose := v_count % 6;
  v_use := jsonb_build_array(
    jsonb_build_object('name', 'Box of 6', 'amount', v_boxes),
    jsonb_build_object('name', 'Single cookie pouch', 'amount', v_loose),
    jsonb_build_object('name', 'Brand sticker', 'amount', v_boxes + v_loose),
    jsonb_build_object('name', 'Thank-you card', 'amount', greatest(v_boxes, 1)));
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform public.lock_stock_items(array['box of 6', 'single cookie pouch', 'brand sticker', 'thank-you card']);
  insert into public.production_records (id, kind, ref, qty, drop_no, at, payload_hash, created_by)
  values (v_id, 'pack', p_order, v_count, p_drop, v_at,
          encode(sha256(convert_to('pack:' || p_order, 'UTF8')), 'hex'), auth.uid());
  for v_p in select x ->> 'name' as name, (x ->> 'amount')::numeric as amount from jsonb_array_elements(v_use) x loop
    v_n := v_n + 1;
    if v_p.amount > 0 then
      v_left := public.use_stock(v_id, v_n, v_p.name, v_p.amount, 'Packed order ' || p_order, v_at);
      if v_left > 0 then -- rule:pack-shortfall
        v_short := v_short || jsonb_build_object('name', v_p.name, 'by', round(v_left, 1), 'unit', 'pcs');
      end if;
    end if;
  end loop;
  update public.production_records r set short = v_short where r.id = v_id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'production.pack', 'production_records', v_id::text,
    jsonb_build_object('order_id', p_order, 'cookies', v_count, 'short', v_short));
  return query select v_id, false, v_short;
end;
$$;
revoke execute on function public.record_pack(text, integer) from public, anon, authenticated;
grant execute on function public.record_pack(text, integer) to authenticated;

-- Internal: a bazaar sale uses a pouch per cookie and a bag per customer (the ported rule), on the sale's own id.
create or replace function public.record_sale_packaging(p_sale uuid, p_cookies integer, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_short jsonb := '[]'::jsonb;
  v_left  numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform public.lock_stock_items(array['single cookie pouch', 'paper bag']);
  insert into public.production_records (id, kind, ref, qty, at, payload_hash, created_by)
  values (p_sale, 'sale', p_sale::text, p_cookies, p_at, encode(sha256(convert_to('sale:' || p_sale::text, 'UTF8')), 'hex'), auth.uid())
  on conflict (id) do nothing;
  if not found then
    return;
  end if;
  v_left := public.use_stock(p_sale, 1, 'Single cookie pouch', p_cookies, 'Bazaar sale', p_at);
  if v_left > 0 then
    v_short := v_short || jsonb_build_object('name', 'Single cookie pouch', 'by', round(v_left, 1), 'unit', 'pcs');
  end if;
  v_left := public.use_stock(p_sale, 2, 'Paper bag', 1, 'Bazaar sale', p_at);
  if v_left > 0 then
    v_short := v_short || jsonb_build_object('name', 'Paper bag', 'by', round(v_left, 1), 'unit', 'pcs');
  end if;
  update public.production_records r set short = v_short where r.id = p_sale;
end;
$$;
revoke execute on function public.record_sale_packaging(uuid, integer, timestamptz) from public, anon, authenticated;

/**
 * The owner's production books: every baked batch (what "baked on this version" counts), the chilled dough by flavour, the
 * cookies baked and not yet packed in one drop, and what stock could not cover. `p_drop` is the drop the screens are on.
 */
create or replace function public.get_production(p_drop integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read production' using errcode = '42501';
  end if;
  if p_drop is null or p_drop not between 0 and 100000 then
    raise exception 'a drop is required' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'batches', coalesce((select jsonb_agg(jsonb_build_object('product_id', b.product_id, 'qty', b.qty, 'target', b.target,
        'rejects', b.rejects, 'version', b.recipe_version, 'at', (extract(epoch from b.at) * 1000)::bigint) order by b.at, b.received_at)
      from (select * from public.production_records r where r.kind = 'batch' order by r.at desc, r.received_at desc limit 2000) b), '[]'::jsonb),
    'dough', coalesce((select jsonb_agg(jsonb_build_object('product_id', d.product_id, 'balls', d.balls, 'at', d.at) order by d.product_id)
      from (select r.product_id,
                   sum(case r.kind when 'dough' then r.qty else -r.dough_used end)::integer as balls,
                   (extract(epoch from max(r.at) filter (where r.kind = 'dough')) * 1000)::bigint as at
              from public.production_records r where r.kind in ('dough', 'batch') group by r.product_id
             having sum(case r.kind when 'dough' then r.qty else -r.dough_used end) > 0) d), '[]'::jsonb),
    'baked', coalesce((select jsonb_agg(jsonb_build_object('product_id', k.product_id, 'qty', k.qty) order by k.product_id)
      from (select x.product_id, greatest(sum(x.qty), 0)::integer as qty
              from (select r.product_id, r.qty from public.production_records r where r.kind = 'batch' and r.drop_no = p_drop
                    union all
                    select oi.product_id, -oi.qty from public.production_records r
                      join public.order_items oi on oi.order_id = r.ref where r.kind = 'pack' and r.drop_no = p_drop) x
             group by x.product_id having greatest(sum(x.qty), 0) > 0) k), '[]'::jsonb),
    'shortfalls', coalesce((select jsonb_agg(jsonb_build_object('kind', s.kind, 'product_id', s.product_id, 'ref', s.ref,
        'short', s.short, 'at', (extract(epoch from s.at) * 1000)::bigint) order by s.at)
      from (select * from public.production_records r where r.short <> '[]'::jsonb order by r.at desc limit 500) s), '[]'::jsonb))
    into v_out;
  return v_out;
end;
$$;
revoke execute on function public.get_production(integer) from public, anon, authenticated;
grant execute on function public.get_production(integer) to authenticated;

-- record_event_sale, as it was (20260101003200) with the one packaging call marked rule:sale-packaging-live.
create or replace function public.record_event_sale(p_sale jsonb)
returns table (client_id text, sale_id uuid, duplicate boolean, voided boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client text;
  v_device text;
  v_event uuid;
  v_ev public.events%rowtype;
  v_at timestamptz;
  v_pay text;
  v_ref text;
  v_clerk text;
  v_items jsonb;
  v_item record;
  v_gross bigint := 0;
  v_discount bigint;
  v_total bigint;
  v_tendered bigint;
  v_change bigint;
  v_voided timestamptz;
  v_ledger uuid;
  v_sale uuid;
  v_hash text;
  v_seen text;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record a bazaar sale' using errcode = '42501';
  end if;
  if p_sale is null or jsonb_typeof(p_sale) <> 'object' then
    raise exception 'sale must be an object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_sale) k
              where k <> all (array['clientId','deviceId','eventId','items','discountCents',
                'totalCents','pay','ref','clerk','at','tenderedCents','changeCents'])) then
    raise exception 'sale has an unknown key' using errcode = '22023';
  end if;

  v_client := p_sale ->> 'clientId';
  v_device := p_sale ->> 'deviceId';
  if jsonb_typeof(p_sale -> 'clientId') is distinct from 'string' or length(v_client) not between 1 and 160
     or jsonb_typeof(p_sale -> 'deviceId') is distinct from 'string' or v_device !~ '^[A-Za-z0-9_-]{1,64}$'
     or left(v_client, length(v_device) + 1) <> v_device || ':' then
    raise exception 'clientId must start with the device id' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sale -> 'eventId') is distinct from 'string'
     or (p_sale ->> 'eventId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'eventId must be an event uuid' using errcode = '22023';
  end if;
  v_event := (p_sale ->> 'eventId')::uuid;
  if jsonb_typeof(p_sale -> 'at') is distinct from 'number' or (p_sale ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'at must be milliseconds since 1970' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_sale ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then
    raise exception 'sale time is in the future' using errcode = '22023';
  end if;
  v_pay := p_sale ->> 'pay';
  if jsonb_typeof(p_sale -> 'pay') is distinct from 'string'
     or v_pay <> all (array['Cash','GCash','Maya','GoTyme','Freebie']) then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;
  v_ref := p_sale ->> 'ref';
  v_clerk := p_sale ->> 'clerk';
  if jsonb_typeof(p_sale -> 'ref') is distinct from 'string' or length(v_ref) > 32
     or jsonb_typeof(p_sale -> 'clerk') is distinct from 'string' or length(v_clerk) > 40 then
    raise exception 'ref or clerk is malformed' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sale -> 'discountCents') is distinct from 'number' or (p_sale ->> 'discountCents') !~ '^[0-9]{1,12}$'
     or jsonb_typeof(p_sale -> 'totalCents') is distinct from 'number' or (p_sale ->> 'totalCents') !~ '^[0-9]{1,12}$'
     or jsonb_typeof(p_sale -> 'tenderedCents') is distinct from 'number' or (p_sale ->> 'tenderedCents') !~ '^[0-9]{1,12}$'
     or jsonb_typeof(p_sale -> 'changeCents') is distinct from 'number' or (p_sale ->> 'changeCents') !~ '^[0-9]{1,12}$' then
    raise exception 'money fields must be whole centavos, zero or more' using errcode = '22023';
  end if;
  v_discount := (p_sale ->> 'discountCents')::bigint;
  v_total := (p_sale ->> 'totalCents')::bigint;
  v_tendered := (p_sale ->> 'tenderedCents')::bigint;
  v_change := (p_sale ->> 'changeCents')::bigint;
  v_items := p_sale -> 'items';
  if jsonb_typeof(v_items) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_items)) not between 1 and 50 then
    raise exception 'items must list 1-50 flavours' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(v_items) i
              where i.key !~ '^[a-z0-9][a-z0-9-]{0,31}$' or jsonb_typeof(i.value) <> 'number'
                 or (i.value #>> '{}') !~ '^[0-9]{1,3}$' or (i.value #>> '{}')::int < 1) then
    raise exception 'each item needs a flavour id and a whole quantity of 1-999' using errcode = '22023';
  end if;

  -- One writer per client id at a time, for both this command and the void command, so a
  -- void can never slip between "is there a void?" and "insert the sale".
  perform pg_advisory_xact_lock(hashtextextended('event_sale:' || v_client, 0));

  -- A repeat is acknowledged before anything else is judged: the event may have closed or
  -- moved to another phone since the first delivery, and the phone must still stop retrying.
  v_hash := encode(sha256(convert_to(p_sale::text, 'UTF8')), 'hex');
  select s.id, s.voided_at, s.payload_hash into v_sale, v_voided, v_seen
    from public.event_sales s where s.client_id = v_client;
  if found then
    if v_seen is distinct from v_hash then
      raise exception 'client id was already used for a different sale' using errcode = '23505';
    end if;
    return query select v_client, v_sale, true, v_voided is not null;
    return;
  end if;

  select * into v_ev from public.events e where e.id = v_event;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if v_ev.selling_device is null or (v_device <> v_ev.selling_device and v_device <> all (v_ev.former_devices)) then
    raise exception 'this phone is not the selling device for the event' using errcode = '42501';
  end if;
  if v_ev.closed_at is not null and v_at > v_ev.closed_at then
    raise exception 'event closed before this sale' using errcode = '55000';
  end if;
  if v_at < v_ev.starts_at - interval '1 day' then
    raise exception 'sale time is before the event started' using errcode = '22023';
  end if;

  for v_item in select i.key as pid, (i.value #>> '{}')::int as qty from jsonb_each(v_items) i loop
    if not (v_ev.price_snapshot ? v_item.pid) then
      raise exception 'flavour % is not in the event price snapshot', v_item.pid using errcode = '22023';
    end if;
    v_gross := v_gross + v_item.qty * (v_ev.price_snapshot ->> v_item.pid)::bigint;
  end loop;
  if v_discount > v_gross or v_total <> v_gross - v_discount then
    raise exception 'sale total does not match the event prices' using errcode = '22023';
  end if;
  if v_pay = 'Freebie' and v_total <> 0 then
    raise exception 'a freebie has no charge' using errcode = '22023';
  end if;

  select vd.voided_at into v_voided from public.event_sale_voids vd where vd.client_id = v_client;

  insert into public.event_sales (client_id, event_id, gross_cents, discount_cents, total_cents,
    pay_method, pay_ref, tendered_cents, change_cents, clerk, sold_at, voided_at, payload_hash)
  values (v_client, v_event, v_gross, v_discount, v_total, v_pay, v_ref, v_tendered, v_change,
    v_clerk, v_at, v_voided, v_hash)
  on conflict on constraint event_sales_client_id_key do nothing
  returning id into v_sale;
  if v_sale is null then
    select s.id, s.voided_at, s.payload_hash into v_sale, v_voided, v_seen
      from public.event_sales s where s.client_id = v_client;
    if v_seen is distinct from v_hash then
      raise exception 'client id was already used for a different sale' using errcode = '23505';
    end if;
    return query select v_client, v_sale, true, v_voided is not null;
    return;
  end if;

  insert into public.event_sale_items (sale_id, product_id, qty, unit_price_cents)
  select v_sale, i.key, (i.value #>> '{}')::int, (v_ev.price_snapshot ->> i.key)::bigint
    from jsonb_each(v_items) i;
  if v_total > 0 and v_voided is null then
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, sale_id, created_by)
    values ('sale', 'Bazaar', 'Stall sale ' || v_client, v_total, v_at, v_sale, auth.uid())
    returning id into v_ledger;
    update public.event_sales s set ledger_id = v_ledger where s.id = v_sale;
  end if;

  -- C2: the sale's pouches and bag come off stock on this first insert only; a replay returned above, and a sale that
  -- arrives already voided uses nothing.
  if v_voided is null then -- rule:sale-packaging-live
    perform public.record_sale_packaging(v_sale, (select sum((i.value #>> '{}')::int) from jsonb_each(v_items) i)::integer, v_at);
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'event_sale.recorded', 'event_sales', v_sale::text,
    jsonb_build_object('client_id', v_client, 'event_id', v_event, 'total_cents', v_total,
      'voided_on_arrival', v_voided is not null));

  return query select v_client, v_sale, false, v_voided is not null;
end;
$$;
revoke execute on function public.record_event_sale(jsonb) from public, anon, authenticated;
grant execute on function public.record_event_sale(jsonb) to authenticated;
