-- S1 (docs/state/bazaar-days.md, approved by Ethan on 13 October 2026): bazaar days.
--
-- A booking (scheduled_events) is the event. Each day of it is planned (flavours, how many, prices, the drawer float) and, when it starts,
-- becomes one `events` row: price_snapshot is that day's prices, loaded is that day's stock, selling_device is the phone that started it.
-- The till, record_event_sale and void_event_sale then work as they always did, and are NOT redefined (record_event_sale keeps its pinned
-- body, md5 8cf2bd63). Nothing of a bazaar day counts in the main books until the booking is finalised.
--
--   get_bazaar(booking)                  owner. Everything the screens show, with bazaar_summary.
--   save_bazaar_day(day, stamp)          owner. Create or change one day's plan. Refused once the day has started.
--   save_bazaar_fee(fee)                 owner. One fee for a day or for the whole event, keyed on a client id and a body hash.
--   save_bazaar_loss(loss)               owner. Cookies lost on an open day, keyed the same way; never below zero left.
--   save_bazaar_cost(booking, product, typed)  owner. Her typed cost per cookie, or null to go back to the recipe's. Audited.
--   save_bazaar_target(booking, cents)   owner. Her target profit.
--   start_bazaar_day(day, device, event) owner. Starts a planned day as an `events` row and reads each new flavour's recipe cost.
--   add_bazaar_day_stock(day, product, qty, kind, client id)  owner. More stock on an open day.
--   close_bazaar_day(close)              owner. Her count, the leftover split and the cash count. Posts nothing to the books.
--   finalise_bazaar(booking, expected, drop)  owner. Once: fees, rent, cash variances and stock use reach the books; cookies sent to
--                                        the shop are written as an ordinary batch of that drop.
--   bazaar_summary(booking)              internal. The one computation. bazaar_line_facts and bazaar_held_ledger are internal too.
--   recipe_stock_plan(product, cookies, kind, adj)  internal. The ONE scaling rule for a recipe's stock, moved out of record_production
--                                        (which now calls it) so finalise_bazaar scales exactly as a batch does.
--
-- Redefined whole, each exactly as last defined, with ONE change each:
--   record_production      (20260101005900) the scaling loop is the call to recipe_stock_plan.
--   record_sale_packaging  (20260101005900) a sale of a bazaar day takes nothing and records no shortfall: finalise takes it.
--   close_event            (20260101003300) refuses an event that is a bazaar day: that day is closed from its day review, or the
--                          drawer difference would be booked at once and again at finalise. (Not in the design's list: found while
--                          reading the old flow against the new one.)
--   get_books              (20260101006500, the last definition) a ledger line that belongs to a bazaar day of a booking not yet
--                          finalised is left out of `lines`; the new key `held` lists, per booking, their count and sums in the period.
--
-- The computation (whole centavos; a cost per cookie has four decimals). A cost line is quantity x cost per cookie, rounded half up to
-- the centavo per flavour line. Cookie cost = cost of cookies made - cost of cookies sent to the shop, each of those a rounded flavour
-- line. Its parts (sold, given away, lost, written off, not accounted) are rounded flavour lines too, so with a fractional cost they can
-- differ from the total by a few centavos: that difference is returned as its own part, "Rounding", so the parts always add up exactly.
-- A recipe's cost is used only when the recipe is complete (every line costed): a partial figure would understate the cost, so it is
-- stored as no cost and she types one. A flavour with cookies and no cost makes cookie cost and profit null, with the why; never 0.
--
-- Two things this file adds to the design's contracts, each because the contract could not be exact without it:
--   add_bazaar_day_stock takes a client id (and bazaar_stock_adds keeps it): the call ADDS, so a repeat after a lost reply could not be
--     told from a second add without a key.
--   bazaar_days has updated_at (the stamp save_bazaar_day is given) and plan_hash (so a repeated save is answered).
-- Cookies sent to the shop (Ethan's decision, 14 October): the app reads baked stock per drop number, a number only the phone holds, and
-- only a batch record adds to it. So finalise_bazaar takes the drop number and writes those cookies as an ordinary batch of that drop,
-- which takes its own ingredients once; the stock use of the cookies not sent to the shop is made - to the shop, so every cookie made takes
-- its ingredients exactly once. A flavour sent to the shop must have a recipe (rule:fin-shop-no-recipe); the recipe packaging of those
-- cookies is taken when they are packed for an order, not here.
--
-- Every table: row security on, no policy, no API grant. Every function: SECURITY DEFINER, search_path = '', an owner check inside,
-- explicit grants, exact keys. Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it.
-- No item name is written in this file.

alter table public.scheduled_events
  add column target_profit_cents bigint check (target_profit_cents is null or target_profit_cents between 0 and 10000000000),
  add column finalised_at timestamptz,
  add column final_summary jsonb,
  add column final_hash text check (final_hash is null or final_hash ~ '^[0-9a-f]{64}$');

create table public.bazaar_days (
  id uuid primary key,
  scheduled_id uuid not null references public.scheduled_events (id),
  day date not null,
  float_cents bigint not null default 0 check (float_cents between 0 and 100000000),
  event_id uuid unique references public.events (id),
  closed_review jsonb,
  closed_hash text check (closed_hash is null or closed_hash ~ '^[0-9a-f]{64}$'),
  plan_hash text not null check (plan_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  constraint bazaar_days_booking_day unique (scheduled_id, day)
);
alter table public.bazaar_days enable row level security;
revoke all on table public.bazaar_days from public, anon, authenticated;

create table public.bazaar_day_lines (
  day_id uuid not null references public.bazaar_days (id) on delete cascade,
  product_id text not null references public.products (id),
  made_qty integer not null check (made_qty between 0 and 9999),
  carried_qty integer not null check (carried_qty between 0 and 9999),
  price_cents bigint not null check (price_cents between 0 and 100000000),
  left_qty integer check (left_qty >= 0),
  carry_next_qty integer check (carry_next_qty >= 0),
  to_shop_qty integer check (to_shop_qty >= 0),
  written_off_qty integer check (written_off_qty >= 0),
  primary key (day_id, product_id),
  constraint bazaar_day_lines_split check (
    (left_qty is null and carry_next_qty is null and to_shop_qty is null and written_off_qty is null)
    or left_qty = carry_next_qty + to_shop_qty + written_off_qty)
);
alter table public.bazaar_day_lines enable row level security;
revoke all on table public.bazaar_day_lines from public, anon, authenticated;

create table public.bazaar_costs (
  scheduled_id uuid not null references public.scheduled_events (id),
  product_id text not null references public.products (id),
  recipe_cents numeric(14, 4) check (recipe_cents is null or recipe_cents >= 0),
  recipe_read_at timestamptz,
  typed_cents numeric(14, 4) check (typed_cents is null or typed_cents >= 0),
  typed_by uuid references public.profiles (id) on delete set null,
  typed_at timestamptz,
  primary key (scheduled_id, product_id)
);
alter table public.bazaar_costs enable row level security;
revoke all on table public.bazaar_costs from public, anon, authenticated;

create table public.bazaar_fees (
  client_id text primary key check (length(client_id) between 1 and 150),
  scheduled_id uuid not null references public.scheduled_events (id),
  day_id uuid references public.bazaar_days (id),
  label text not null check (btrim(label) <> '' and length(label) <= 80),
  category text not null check (btrim(category) <> '' and length(category) <= 40),
  amount_cents bigint not null check (amount_cents between 1 and 100000000),
  paid_on date not null,
  ledger_id uuid references public.ledger_entries (id) on delete set null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);
create index bazaar_fees_booking_idx on public.bazaar_fees (scheduled_id);
alter table public.bazaar_fees enable row level security;
revoke all on table public.bazaar_fees from public, anon, authenticated;

create table public.bazaar_losses (
  client_id text primary key check (length(client_id) between 1 and 160),
  day_id uuid not null references public.bazaar_days (id),
  product_id text not null references public.products (id),
  qty integer not null check (qty between 1 and 9999),
  reason text not null check (btrim(reason) <> '' and length(reason) <= 80),
  at timestamptz not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);
create index bazaar_losses_day_idx on public.bazaar_losses (day_id);
alter table public.bazaar_losses enable row level security;
revoke all on table public.bazaar_losses from public, anon, authenticated;

create table public.bazaar_stock_adds (
  client_id uuid primary key,
  day_id uuid not null references public.bazaar_days (id),
  product_id text not null references public.products (id),
  qty integer not null check (qty between 1 and 9999),
  kind text not null check (kind in ('made', 'carried')),
  at timestamptz not null default now()
);
create index bazaar_stock_adds_day_idx on public.bazaar_stock_adds (day_id);
alter table public.bazaar_stock_adds enable row level security;
revoke all on table public.bazaar_stock_adds from public, anon, authenticated;

-- ------------------------------------------------------------------ recipe_stock_plan: the one scaling rule

/**
 * Internal: what a number of cookies of one flavour takes from stock by its current recipe, ingredient lines only, as a list of
 * {name, unit, amount, item_id, why}. `dough` scales a mix (no rounding before the last step); anything else scales a batch (rounded to
 * 0.1, then the +/- steps of p_adj). Pieces round up, the rest to one decimal. Null when the flavour has no recipe. record_production
 * and finalise_bazaar both call it: there is no second copy of this rule.
 */
create or replace function public.recipe_stock_plan(p_product text, p_cookies numeric, p_kind text, p_adj jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pid     text := p_product;
  v_mixed   numeric := p_cookies;
  v_kind    text := p_kind;
  v_adj     jsonb := coalesce(p_adj, '{}'::jsonb);
  v_recipe  public.recipes%rowtype;
  v_line    record;
  v_base    numeric;
  v_step    numeric;
  v_raw     numeric;
  v_amount  numeric;
  v_plan    jsonb := '[]'::jsonb;
begin
  select * into v_recipe from public.recipes r where r.product_id = v_pid;
  if not found then
    return null;
  end if;
  -- Every line is qty x mixed / yield with the multiplication first: dividing first leaves a rounded quotient (5/9 has no exact
  -- decimal), and a piece line that is exactly 5 would round up to 6.
  for v_line in select i.item_name as name, i.qty as qty, i.unit as unit, i.item_id as item_id, it.unit as item_unit
                  from public.recipe_ingredients i left join public.inventory_items it on it.id = i.item_id
                 where i.product_id = v_pid and i.kind = 'ingredient' order by i.position, i.id loop
    if v_kind = 'dough' then
      v_raw := v_line.qty * v_mixed / v_recipe.yield_count;
    else
      v_base := round(v_line.qty * v_mixed / v_recipe.yield_count, 1);
      v_step := case v_line.unit when 'pcs' then 1 when 'ml' then 5 else 10 end;
      v_raw := greatest(0, v_base + coalesce((v_adj ->> v_line.name)::numeric, 0) * v_step);
    end if;
    v_amount := case when v_line.unit = 'pcs' then ceil(v_raw) else round(v_raw, 1) end;
    if v_amount > 0 then
      v_plan := v_plan || jsonb_build_object('name', v_line.name, 'unit', v_line.unit, 'amount', v_amount,
        'item_id', case when v_line.item_unit = v_line.unit then v_line.item_id end,
        'why', case when v_line.item_id is null then 'not a stock item' when v_line.item_unit <> v_line.unit then 'unit differs' end);
    end if;
  end loop;
  return v_plan;
end;
$$;
revoke execute on function public.recipe_stock_plan(text, numeric, text, jsonb) from public, anon, authenticated, service_role;

-- ------------------------------------------------------------------ redefined whole, one change each

-- record_production, as it was (20260101005900) with the scaling loop replaced by the call to recipe_stock_plan.
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
  v_left    numeric;
  v_plan    jsonb := '[]'::jsonb;
  v_short   jsonb := '[]'::jsonb;
  v_ids     text[];
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
                    where not exists (select 1 from public.recipe_ingredients i where i.product_id = v_pid and i.kind = 'ingredient' and i.item_name = k));
  if v_bad then -- rule:prod-adj-unknown
    raise exception 'an adjustment names an ingredient the recipe does not have' using errcode = '22023';
  end if;
  select p.name into v_flavour from public.products p where p.id = v_pid;

  if v_kind = 'batch' then
    select coalesce(sum(case r.kind when 'dough' then r.qty when 'discard_dough' then -r.qty else -r.dough_used end), 0) into v_bal
      from public.production_records r where r.product_id = v_pid and r.kind in ('dough', 'batch', 'discard_dough');
    v_used := least(greatest(v_bal, 0), v_qty)::integer;
    v_mixed := v_qty - v_used;
  else
    v_mixed := v_qty;
  end if;
  -- S1 (bazaar days): the scaling rule (qty x mixed / yield, the multiplication first; pieces up, the rest to 0.1) is
  -- recipe_stock_plan, which finalise_bazaar calls too. This is the one change from 20260101005900.
  v_plan := public.recipe_stock_plan(v_pid, v_mixed, v_kind, v_adj);
  select array_agg(x ->> 'item_id') into v_ids from jsonb_array_elements(v_plan) x where x ->> 'item_id' is not null;
  perform public.lock_stock_item_ids(coalesce(v_ids, array[]::text[]));

  insert into public.production_records (id, kind, product_id, qty, target, rejects, dough_used, recipe_version, drop_no, at,
                                         payload_hash, created_by)
  values (v_id, v_kind, v_pid, case when v_kind = 'batch' then v_qty::integer - v_rej::integer else v_qty::integer end,
          v_target::integer, v_rej::integer, v_used, v_ver::integer, v_drop::integer, v_at, v_hash, auth.uid());
  v_reason := (case v_kind when 'dough' then 'Mixed dough: ' else 'Baked: ' end) || v_flavour || ', Version ' || v_ver::integer;
  for v_p in select x from jsonb_array_elements(v_plan) x loop
    v_n := v_n + 1;
    if v_p ->> 'item_id' is not null then
      v_left := public.use_stock_item(v_id, v_n, v_p ->> 'item_id', (v_p ->> 'amount')::numeric, v_reason, v_at, true);
    else
      v_left := (v_p ->> 'amount')::numeric;
    end if;
    if v_left > 0 then -- rule:prod-shortfall
      v_short := v_short || (jsonb_build_object('name', v_p ->> 'name', 'by', round(v_left, 1), 'unit', v_p ->> 'unit')
                             || case when v_p ->> 'why' is not null then jsonb_build_object('why', v_p ->> 'why') else '{}'::jsonb end);
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

-- record_sale_packaging, as it was (20260101005900) with the bazaar-day rule first.
create or replace function public.record_sale_packaging(p_sale uuid, p_cookies integer, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_plan  jsonb;
  v_ids   text[];
  v_p     record;
  v_n     integer := 0;
  v_left  numeric;
  v_short jsonb := '[]'::jsonb;
begin
  -- S1 (bazaar days): a sale of a bazaar day takes nothing here and records no shortfall; finalise_bazaar takes the packaging.
  -- This is the one change from 20260101005900.
  if exists (select 1 from public.event_sales s join public.bazaar_days d on d.event_id = s.event_id where s.id = p_sale) then -- rule:sale-packaging-bazaar-day
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  select jsonb_agg(jsonb_build_object('item_id', a.item_id, 'amount', a.amount) order by a.first_at), array_agg(a.item_id)
    into v_plan, v_ids
    from (select n.item_id, sum(n.amount) as amount, min(n.ord) as first_at
            from (select row_number() over (order by x.src, x.pos, x.item_id) as ord, x.item_id, x.amount
                    from (select 1 as src, r.position as pos, r.item_id,
                                 r.qty * case r.per when 'cookie' then p_cookies else 1 end as amount
                            from public.packaging_rules r where r.container = 'bazaar_sale'
                          union all
                          select 2, l.position, l.item_id, l.qty * si.q
                            from (select s.product_id, sum(s.qty) as q from public.event_sale_items s where s.sale_id = p_sale group by s.product_id) si
                            join public.recipe_ingredients l on l.product_id = si.product_id and l.kind = 'packaging'
                            join public.inventory_items it on it.id = l.item_id and it.unit = l.unit) x) n
           group by n.item_id) a;
  perform public.lock_stock_item_ids(coalesce(v_ids, array[]::text[]));
  insert into public.production_records (id, kind, ref, qty, at, payload_hash, created_by)
  values (p_sale, 'sale', p_sale::text, p_cookies, p_at, encode(sha256(convert_to('sale:' || p_sale::text, 'UTF8')), 'hex'), auth.uid())
  on conflict (id) do nothing;
  if not found then
    return;
  end if;
  for v_p in select x ->> 'item_id' as item_id, (x ->> 'amount')::numeric as amount, it.name, it.unit
               from jsonb_array_elements(coalesce(v_plan, '[]'::jsonb)) with ordinality t(x, ord)
               join public.inventory_items it on it.id = x ->> 'item_id'
              order by t.ord loop
    v_n := v_n + 1;
    if v_p.amount > 0 then
      v_left := public.use_stock_item(p_sale, v_n, v_p.item_id, v_p.amount, 'Bazaar sale', p_at, false);
      if v_left > 0 then
        v_short := v_short || jsonb_build_object('name', v_p.name, 'by', round(v_left, 1), 'unit', v_p.unit);
      end if;
    end if;
  end loop;
  if not exists (select 1 from public.packaging_rules r where r.container = 'bazaar_sale') then -- rule:sale-no-rule
    v_short := v_short || jsonb_build_object('name', 'Bazaar sale', 'by', 1, 'unit', 'sale', 'why', 'no packaging rule');
  end if;
  for v_p in select l.item_name as name, l.unit, round(sum(l.qty * si.q), 1) as amount,
                    case when l.item_id is null then 'not a stock item' else 'unit differs' end as why
               from (select s.product_id, sum(s.qty) as q from public.event_sale_items s where s.sale_id = p_sale group by s.product_id) si
               join public.recipe_ingredients l on l.product_id = si.product_id and l.kind = 'packaging'
               left join public.inventory_items it on it.id = l.item_id
              where it.id is null or it.unit <> l.unit
              group by l.item_name, l.unit, l.item_id
              order by min(l.position), l.item_name loop
    v_short := v_short || jsonb_build_object('name', v_p.name, 'by', v_p.amount, 'unit', v_p.unit, 'why', v_p.why);
  end loop;
  update public.production_records r set short = v_short where r.id = p_sale;
end;
$$;
revoke execute on function public.record_sale_packaging(uuid, integer, timestamptz) from public, anon, authenticated, service_role;

-- close_event, as it was (20260101003300) with the refusal for a bazaar day.
create or replace function public.close_event(p_close jsonb)
returns table (
  event_id uuid, name text, closed boolean,
  sales_count integer, voided_count integer, freebie_count integer, cookies_sold integer,
  revenue_cents bigint, expenses_cents bigint, variance_cents bigint, profit_cents bigint,
  float_cents bigint, cash_expected_cents bigint, counted_cents bigint,
  loaded jsonb, returned jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event uuid;
  v_ev public.events%rowtype;
  v_at timestamptz;
  v_counted bigint;
  v_returned jsonb;
  v_hash text;
  v_cash bigint;
  v_float bigint;
  v_expected bigint;
  v_variance bigint;
begin
  if not public.is_owner() then
    raise exception 'only the owner may close an event' using errcode = '42501';
  end if;
  if p_close is null or jsonb_typeof(p_close) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_close) k where k <> all (array['eventId','at','countedCents','returned','floatCents','cashCents'])) then
    raise exception 'close has a missing or unknown key' using errcode = '22023';
  end if;
  if jsonb_typeof(p_close -> 'eventId') is distinct from 'string'
     or (p_close ->> 'eventId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_close -> 'at') is distinct from 'number' or (p_close ->> 'at') !~ '^[0-9]{12,14}$'
     or coalesce(jsonb_typeof(p_close -> 'countedCents'), '') not in ('number', 'null')
     or (jsonb_typeof(p_close -> 'countedCents') = 'number' and (p_close ->> 'countedCents') !~ '^[0-9]{1,12}$')
     or jsonb_typeof(p_close -> 'returned') is distinct from 'object'
     or jsonb_typeof(p_close -> 'floatCents') is distinct from 'number' or (p_close ->> 'floatCents') !~ '^[0-9]{1,12}$'
     or jsonb_typeof(p_close -> 'cashCents') is distinct from 'number' or (p_close ->> 'cashCents') !~ '^[0-9]{1,12}$' then
    raise exception 'close fields are malformed' using errcode = '22023';
  end if;
  v_event := (p_close ->> 'eventId')::uuid;
  v_at := to_timestamp((p_close ->> 'at')::bigint / 1000.0);
  v_counted := case when jsonb_typeof(p_close -> 'countedCents') = 'number' then (p_close ->> 'countedCents')::bigint end;
  v_returned := p_close -> 'returned';
  if v_at > now() + interval '1 day' then
    raise exception 'close time is in the future' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(v_returned) i
              where i.key !~ '^[a-z0-9][a-z0-9-]{0,31}$' or jsonb_typeof(i.value) <> 'number'
                 or (i.value #>> '{}') !~ '^[0-9]{1,5}$') then
    raise exception 'returned stock must be whole quantities by flavour' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event:' || v_event::text, 0));
  v_hash := encode(sha256(convert_to(p_close::text, 'UTF8')), 'hex');
  select * into v_ev from public.events e where e.id = v_event for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  -- S1 (bazaar days), the one change from 20260101003300: a bazaar day is closed from its day review (close_bazaar_day), which
  -- stores her count and posts nothing. This close would book the drawer difference at once and finalise_bazaar would book it again.
  if exists (select 1 from public.bazaar_days d where d.event_id = v_event) then -- rule:close-event-bazaar-day
    raise exception 'this event is a bazaar day: close it from its day review' using errcode = '55000';
  end if;

  if v_ev.closed_at is not null then
    if v_ev.closed_hash is distinct from v_hash then
      raise exception 'event was already closed differently' using errcode = '23505';
    end if;
    return query select * from public.event_summary(v_event);
    return;
  end if;

  if v_at < v_ev.starts_at - interval '1 day' then
    raise exception 'close time is before the event started' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(v_returned) i
              where not (v_ev.price_snapshot ? i.key)
                 or (v_ev.opened_at is not null and (i.value #>> '{}')::int > coalesce((v_ev.loaded ->> i.key)::int, 0))) then
    raise exception 'returned stock names a flavour off the menu or more than was loaded' using errcode = '22023';
  end if;

  if exists (select 1 from public.event_sales s where s.event_id = v_event and s.voided_at is null and s.sold_at > v_at) then
    raise exception 'a sale was made after the close time' using errcode = '22023';
  end if;
  select coalesce(sum(s.total_cents), 0)::bigint into v_cash
    from public.event_sales s
   where s.event_id = v_event and s.voided_at is null and s.pay_method = 'Cash';
  v_float := coalesce(v_ev.drawer_float_cents, 0);
  if (p_close ->> 'floatCents')::bigint <> v_float or (p_close ->> 'cashCents')::bigint <> v_cash then
    raise exception 'the server does not hold all of this phone''s sales or its stock load yet' using errcode = '40001';
  end if;
  v_expected := v_float + v_cash;
  v_variance := case when v_counted is null then null else v_counted - v_expected end;

  -- A short drawer is a real cost; an over drawer is a correction to takings (as the prototype books it).
  if v_variance is not null and v_variance <> 0 then
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
    values (case when v_variance < 0 then 'cost'::public.ledger_kind else 'sale'::public.ledger_kind end,
      case when v_variance < 0 then 'Cash variance' else 'Bazaar' end,
      v_ev.name || ' — drawer ' || case when v_variance < 0 then 'short' else 'over' end,
      v_variance, v_at, auth.uid());
  end if;

  update public.events e
     set closed_at = v_at, counted_cents = v_counted, variance_cents = v_variance,
         returned = v_returned, closed_hash = v_hash
   where e.id = v_event;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'event.closed', 'events', v_event::text,
    jsonb_build_object('counted_cents', v_counted, 'expected_cents', v_expected, 'variance_cents', v_variance));

  return query select * from public.event_summary(v_event);
end;
$$;

-- ------------------------------------------------------------------ the summary

/**
 * Internal: one row per day and flavour of a booking, from the rows every time. sold and given come from the sale items of sales that
 * are not voided (a sale with a zero total is given); lost from the recorded losses; the last four are her count, null until the day closes.
 */
create or replace function public.bazaar_line_facts(p_booking uuid)
returns table (day_id uuid, day date, event_id uuid, closed boolean, product_id text, name text, made integer, carried integer,
               price_cents bigint, sold integer, given integer, lost integer, left_qty integer, carry_next integer, to_shop integer,
               written_off integer)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.day, d.event_id, coalesce(e.closed_at is not null, false), l.product_id, p.name, l.made_qty, l.carried_qty, l.price_cents,
         coalesce(q.sold, 0)::integer, coalesce(q.given, 0)::integer, coalesce(x.lost, 0)::integer,
         l.left_qty, l.carry_next_qty, l.to_shop_qty, l.written_off_qty
    from public.bazaar_days d
    join public.bazaar_day_lines l on l.day_id = d.id
    join public.products p on p.id = l.product_id
    left join public.events e on e.id = d.event_id
    left join lateral (select sum(i.qty) filter (where s.total_cents > 0) as sold, sum(i.qty) filter (where s.total_cents = 0) as given
                         from public.event_sales s join public.event_sale_items i on i.sale_id = s.id
                        where s.event_id = d.event_id and s.voided_at is null and i.product_id = l.product_id) q on true
    left join lateral (select sum(o.qty) as lost from public.bazaar_losses o where o.day_id = d.id and o.product_id = l.product_id) x on true
   where d.scheduled_id = p_booking;
$$;
revoke execute on function public.bazaar_line_facts(uuid) from public, anon, authenticated, service_role;

/**
 * Internal: the one computation of a booking's figures, from the rows every time (the same rows give the same answer and the same hash;
 * it reads no clock). days: each day with its lines, takings, expected cash, fees, state and `hash` (the day's facts before her count,
 * which close_bazaar_day is given back as `expected`); once closed, her count per flavour with not_accounted = made + carried - sold -
 * given - lost - left, the counted cash and over or short. revenue: sale totals that are not voided, with gross, discounts (on sales
 * that were paid for), freebies at their price, and by how paid. fees: the rent and each fee. cookie_cost: per flavour (started days
 * only) the quantities, the cost per cookie and where it came from, and each rounded line; cents = made - to the shop; parts add up to
 * it, the last part being the rounding. profit = revenue - fees - cookie cost + cash over - cash short. Null for a booking that does
 * not exist. `counted` is false while a started day is open: not accounted then still includes what is on the table.
 */
create or replace function public.bazaar_summary(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s        public.scheduled_events%rowtype;
  v_d        record;
  v_t        record;
  v_r        record;
  v_c        record;
  v_days     jsonb := '[]'::jsonb;
  v_base     jsonb;
  v_lines    jsonb;
  v_count    jsonb;
  v_pay      jsonb;
  v_fee      bigint;
  v_hash     text;
  v_var      bigint;
  v_over     bigint := 0;
  v_short    bigint := 0;
  v_open     boolean := false;
  v_fees     jsonb;
  v_fee_all  bigint;
  v_fee_ev   bigint;
  v_cost     jsonb;
  v_cookie   bigint;
  v_why      text;
  v_profit   bigint;
  v_out      jsonb;
begin
  select * into v_s from public.scheduled_events s where s.id = p_booking;
  if not found then
    return null;
  end if;

  for v_d in select d.id, d.day, d.event_id, d.float_cents, d.closed_review, e.closed_at, e.counted_cents
               from public.bazaar_days d left join public.events e on e.id = d.event_id
              where d.scheduled_id = p_booking order by d.day loop
    select coalesce(jsonb_agg(jsonb_build_object('product_id', f.product_id, 'name', f.name, 'made', f.made, 'carried', f.carried,
             'price_cents', f.price_cents, 'sold', f.sold, 'given', f.given, 'lost', f.lost) order by f.product_id), '[]'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('product_id', f.product_id, 'left', f.left_qty, 'carry_next', f.carry_next,
             'to_shop', f.to_shop, 'written_off', f.written_off,
             'not_accounted', f.made + f.carried - f.sold - f.given - f.lost - f.left_qty) order by f.product_id), '[]'::jsonb)
      into v_lines, v_count
      from public.bazaar_line_facts(p_booking) f where f.day_id = v_d.id;
    select coalesce(sum(s.total_cents) filter (where s.voided_at is null), 0)::bigint as revenue,
           coalesce(sum(s.gross_cents) filter (where s.voided_at is null), 0)::bigint as gross,
           coalesce(sum(s.discount_cents) filter (where s.voided_at is null and s.total_cents > 0), 0)::bigint as discounts,
           coalesce(sum(s.gross_cents) filter (where s.voided_at is null and s.total_cents = 0), 0)::bigint as freebies,
           coalesce(sum(s.total_cents) filter (where s.voided_at is null and s.pay_method = 'Cash'), 0)::bigint as cash,
           (count(*) filter (where s.voided_at is null))::integer as n,
           (count(*) filter (where s.voided_at is not null))::integer as voided
      into v_t
      from public.event_sales s where s.event_id = v_d.event_id;
    select coalesce(jsonb_object_agg(b.pay_method, b.cents), '{}'::jsonb) into v_pay
      from (select s.pay_method, sum(s.total_cents)::bigint as cents from public.event_sales s
             where s.event_id = v_d.event_id and s.voided_at is null and s.total_cents > 0 group by s.pay_method) b;
    select coalesce(sum(f.amount_cents), 0)::bigint into v_fee from public.bazaar_fees f where f.day_id = v_d.id;
    -- An expense added at the till (add_event_expense) on this day's event is a fee of the day too, so she never closes over a cost she
    -- has not seen. The rows finalise itself writes (the rent, each saved fee) are left out: they are counted already.
    v_fee := v_fee + coalesce((select sum(x.amount_cents) from public.event_expenses x
                                where x.event_id = v_d.event_id and x.client_id <> 'rent:' || p_booking::text
                                  and not exists (select 1 from public.bazaar_fees g
                                                   where g.scheduled_id = p_booking and g.ledger_id = x.ledger_id)), 0)::bigint;
    v_base := jsonb_build_object('id', v_d.id, 'day', v_d.day, 'event_id', v_d.event_id, 'float_cents', v_d.float_cents, 'lines', v_lines,
      'revenue_cents', v_t.revenue, 'gross_cents', v_t.gross, 'discount_cents', v_t.discounts, 'freebie_cents', v_t.freebies,
      'by_pay', v_pay, 'sales', v_t.n, 'voided', v_t.voided, 'cash_sales_cents', v_t.cash,
      'cash_expected_cents', v_d.float_cents + v_t.cash, 'fees_cents', v_fee);
    v_hash := encode(sha256(convert_to(v_base::text, 'UTF8')), 'hex');
    v_var := case when v_d.closed_at is not null and v_d.counted_cents is not null then v_d.counted_cents - (v_d.float_cents + v_t.cash) end;
    v_over := v_over + greatest(coalesce(v_var, 0), 0);
    v_short := v_short + greatest(-coalesce(v_var, 0), 0);
    v_open := v_open or (v_d.event_id is not null and v_d.closed_at is null);
    v_days := v_days || (v_base || jsonb_build_object('hash', v_hash,
      'state', case when v_d.event_id is null then 'planned' when v_d.closed_at is null then 'open' else 'closed' end,
      'count', case when v_d.closed_at is not null then v_count end,
      'closed_at', (extract(epoch from v_d.closed_at) * 1000)::bigint,
      'counted_cents', case when v_d.closed_at is not null then v_d.counted_cents end,
      'over_cents', case when v_var is not null then greatest(v_var, 0) end,
      'short_cents', case when v_var is not null then greatest(-v_var, 0) end,
      'changed_after_close', v_d.closed_at is not null and (v_d.closed_review ->> 'hash') is distinct from v_hash));
  end loop;

  select coalesce(sum(s.total_cents) filter (where s.voided_at is null), 0)::bigint as revenue,
         coalesce(sum(s.gross_cents) filter (where s.voided_at is null), 0)::bigint as gross,
         coalesce(sum(s.discount_cents) filter (where s.voided_at is null and s.total_cents > 0), 0)::bigint as discounts,
         coalesce(sum(s.gross_cents) filter (where s.voided_at is null and s.total_cents = 0), 0)::bigint as freebies,
         (count(*) filter (where s.voided_at is null))::integer as n,
         (count(*) filter (where s.voided_at is not null))::integer as voided
    into v_r
    from public.event_sales s
   where s.event_id in (select d.event_id from public.bazaar_days d where d.scheduled_id = p_booking and d.event_id is not null);
  select coalesce(jsonb_object_agg(b.pay_method, b.cents), '{}'::jsonb) into v_pay
    from (select s.pay_method, sum(s.total_cents)::bigint as cents from public.event_sales s
           where s.event_id in (select d.event_id from public.bazaar_days d where d.scheduled_id = p_booking and d.event_id is not null)
             and s.voided_at is null and s.total_cents > 0 group by s.pay_method) b;

  select coalesce(jsonb_agg(p.j order by p.ord, p.paid_on, p.cid), '[]'::jsonb), coalesce(sum(p.amount), 0)::bigint,
         coalesce(sum(p.amount) filter (where p.day_id is null), 0)::bigint
    into v_fees, v_fee_all, v_fee_ev
    from (select 0 as ord, v_s.starts_on as paid_on, 'rent:' || v_s.id::text as cid, null::uuid as day_id, v_s.rent_cents as amount,
                 jsonb_build_object('client_id', 'rent:' || v_s.id::text, 'label', 'Stall rent', 'category', 'Bazaar rent', 'day_id', null,
                                    'paid_on', v_s.starts_on, 'amount_cents', v_s.rent_cents) as j
           where v_s.rent_cents > 0
          union all
          select 1, f.paid_on, f.client_id, f.day_id, f.amount_cents,
                 jsonb_build_object('client_id', f.client_id, 'label', f.label, 'category', f.category, 'day_id', f.day_id,
                                    'paid_on', f.paid_on, 'amount_cents', f.amount_cents)
            from public.bazaar_fees f where f.scheduled_id = p_booking
          union all
          select 2, c.today, x.client_id, d.id, x.amount_cents,
                 jsonb_build_object('client_id', x.client_id, 'label', x.label, 'category', x.category, 'day_id', d.id,
                                    'paid_on', c.today, 'amount_cents', x.amount_cents, 'at_the_till', true)
            from public.event_expenses x join public.bazaar_days d on d.event_id = x.event_id
            cross join lateral public.business_clock(x.spent_at) c
           where d.scheduled_id = p_booking and x.client_id <> 'rent:' || p_booking::text
             and not exists (select 1 from public.bazaar_fees bf where bf.scheduled_id = p_booking and bf.ledger_id = x.ledger_id)) p;

  select coalesce(jsonb_agg(to_jsonb(z) order by z.product_id), '[]'::jsonb) into v_cost
    from (select y.product_id, y.name, y.unit_cents, y.source, y.made, y.to_shop, y.sold, y.given, y.lost, y.written_off, y.not_accounted,
                 y.uncosted, y.made_cents, y.to_shop_cents, y.sold_cents, y.given_cents, y.lost_cents, y.written_off_cents,
                 y.not_accounted_cents, y.made_cents - y.to_shop_cents as cost_cents,
                 y.made_cents - y.to_shop_cents - y.sold_cents - y.given_cents - y.lost_cents - y.written_off_cents
                   - y.not_accounted_cents as rounding_cents
            from (select x.*,
                         case when x.uncosted then null else coalesce(round(x.made * x.unit_cents), 0)::bigint end as made_cents,
                         case when x.uncosted then null else coalesce(round(x.to_shop * x.unit_cents), 0)::bigint end as to_shop_cents,
                         case when x.uncosted then null else coalesce(round(x.sold * x.unit_cents), 0)::bigint end as sold_cents,
                         case when x.uncosted then null else coalesce(round(x.given * x.unit_cents), 0)::bigint end as given_cents,
                         case when x.uncosted then null else coalesce(round(x.lost * x.unit_cents), 0)::bigint end as lost_cents,
                         case when x.uncosted then null else coalesce(round(x.written_off * x.unit_cents), 0)::bigint end as written_off_cents,
                         case when x.uncosted then null else coalesce(round(x.not_accounted * x.unit_cents), 0)::bigint end as not_accounted_cents
                    from (select w.*, w.unit_cents is null and (w.made > 0 or w.sold + w.given + w.lost > 0) as uncosted
                            from (select f.product_id, f.name, c.cents as unit_cents, c.source,
                                         sum(f.made)::integer as made, sum(coalesce(f.to_shop, 0))::integer as to_shop,
                                         sum(f.sold)::integer as sold, sum(f.given)::integer as given, sum(f.lost)::integer as lost,
                                         sum(coalesce(f.written_off, 0))::integer as written_off,
                                         (sum(f.made) - sum(coalesce(f.to_shop, 0)) - sum(f.sold) - sum(f.given) - sum(f.lost)
                                           - sum(coalesce(f.written_off, 0)))::integer as not_accounted
                                    from public.bazaar_line_facts(p_booking) f
                                    left join lateral (select coalesce(k.typed_cents, k.recipe_cents) as cents,
                                                              case when k.typed_cents is not null then 'typed'
                                                                   when k.recipe_cents is not null then 'recipe' end as source
                                                         from public.bazaar_costs k
                                                        where k.scheduled_id = p_booking and k.product_id = f.product_id) c on true
                                   where f.event_id is not null
                                   group by f.product_id, f.name, c.cents, c.source) w) x) y) z;
  select a.uncosted, a.names, a.made, a.to_shop, a.sold, a.given, a.lost, a.written_off, a.not_accounted,
         case when a.uncosted then null else a.made_cents end as made_cents,
         case when a.uncosted then null else a.to_shop_cents end as to_shop_cents,
         case when a.uncosted then null else a.sold_cents end as sold_cents,
         case when a.uncosted then null else a.given_cents end as given_cents,
         case when a.uncosted then null else a.lost_cents end as lost_cents,
         case when a.uncosted then null else a.written_off_cents end as written_off_cents,
         case when a.uncosted then null else a.not_accounted_cents end as not_accounted_cents,
         case when a.uncosted then null else a.cost_cents end as cost_cents,
         case when a.uncosted then null else a.rounding_cents end as rounding_cents
    into v_c
    from (select coalesce(bool_or((l ->> 'uncosted')::boolean), false) as uncosted,
                 string_agg(l ->> 'name', ', ' order by l ->> 'product_id') filter (where (l ->> 'uncosted')::boolean) as names,
                 coalesce(sum((l ->> 'made')::integer), 0)::integer as made, coalesce(sum((l ->> 'to_shop')::integer), 0)::integer as to_shop,
                 coalesce(sum((l ->> 'sold')::integer), 0)::integer as sold, coalesce(sum((l ->> 'given')::integer), 0)::integer as given,
                 coalesce(sum((l ->> 'lost')::integer), 0)::integer as lost,
                 coalesce(sum((l ->> 'written_off')::integer), 0)::integer as written_off,
                 coalesce(sum((l ->> 'not_accounted')::integer), 0)::integer as not_accounted,
                 coalesce(sum((l ->> 'made_cents')::bigint), 0)::bigint as made_cents,
                 coalesce(sum((l ->> 'to_shop_cents')::bigint), 0)::bigint as to_shop_cents,
                 coalesce(sum((l ->> 'sold_cents')::bigint), 0)::bigint as sold_cents,
                 coalesce(sum((l ->> 'given_cents')::bigint), 0)::bigint as given_cents,
                 coalesce(sum((l ->> 'lost_cents')::bigint), 0)::bigint as lost_cents,
                 coalesce(sum((l ->> 'written_off_cents')::bigint), 0)::bigint as written_off_cents,
                 coalesce(sum((l ->> 'not_accounted_cents')::bigint), 0)::bigint as not_accounted_cents,
                 coalesce(sum((l ->> 'cost_cents')::bigint), 0)::bigint as cost_cents,
                 coalesce(sum((l ->> 'rounding_cents')::bigint), 0)::bigint as rounding_cents
            from jsonb_array_elements(v_cost) l) a;
  v_cookie := v_c.cost_cents;
  v_why := case when v_c.uncosted then 'no cost per cookie for: ' || v_c.names end;
  v_profit := v_r.revenue - v_fee_all - v_cookie + v_over - v_short;

  v_out := jsonb_build_object(
    'booking', jsonb_build_object('id', v_s.id, 'name', v_s.name, 'place', v_s.place, 'starts_on', v_s.starts_on, 'ends_on', v_s.ends_on,
                                  'rent_cents', v_s.rent_cents, 'active', v_s.active),
    'counted', not v_open,
    'days', v_days,
    'revenue', jsonb_build_object('revenue_cents', v_r.revenue, 'gross_cents', v_r.gross, 'discount_cents', v_r.discounts,
                                  'freebie_cents', v_r.freebies, 'by_pay', v_pay, 'sales', v_r.n, 'voided', v_r.voided),
    'cash', jsonb_build_object('over_cents', v_over, 'short_cents', v_short),
    'fees', jsonb_build_object('total_cents', v_fee_all, 'event_cents', v_fee_ev, 'parts', v_fees),
    'cookie_cost', jsonb_build_object('cents', v_cookie, 'why', v_why, 'made_cents', v_c.made_cents, 'to_shop_cents', v_c.to_shop_cents,
      'parts', jsonb_build_array(
        jsonb_build_object('label', 'Sold', 'quantity', v_c.sold, 'amount_cents', v_c.sold_cents),
        jsonb_build_object('label', 'Given away', 'quantity', v_c.given, 'amount_cents', v_c.given_cents),
        jsonb_build_object('label', 'Lost', 'quantity', v_c.lost, 'amount_cents', v_c.lost_cents),
        jsonb_build_object('label', 'Written off', 'quantity', v_c.written_off, 'amount_cents', v_c.written_off_cents),
        jsonb_build_object('label', 'Not accounted', 'quantity', v_c.not_accounted, 'amount_cents', v_c.not_accounted_cents),
        jsonb_build_object('label', 'Rounding', 'quantity', null, 'amount_cents', v_c.rounding_cents)),
      'made', v_c.made, 'to_shop', v_c.to_shop, 'lines', v_cost),
    'profit', jsonb_build_object('cents', v_profit, 'why', v_why, 'parts', jsonb_build_array(
        jsonb_build_object('label', 'Revenue', 'amount_cents', v_r.revenue),
        jsonb_build_object('label', 'Fees', 'amount_cents', -v_fee_all),
        jsonb_build_object('label', 'Cookie cost', 'amount_cents', -v_cookie),
        jsonb_build_object('label', 'Cash over', 'amount_cents', v_over),
        jsonb_build_object('label', 'Cash short', 'amount_cents', -v_short))),
    'target', jsonb_build_object('cents', v_s.target_profit_cents, 'against_cents', v_profit - v_s.target_profit_cents,
      'revenue_needed_cents', case when v_profit is null or v_s.target_profit_cents is null then null
                                   else greatest(v_s.target_profit_cents - v_profit, 0) end));
  return v_out || jsonb_build_object('hash', encode(sha256(convert_to(v_out::text, 'UTF8')), 'hex'));
end;
$$;
revoke execute on function public.bazaar_summary(uuid) from public, anon, authenticated, service_role;

/**
 * Internal: the ledger lines that belong to a bazaar day of a booking that is not finalised yet, each with its booking. A line belongs
 * through its sale (ledger_entries.sale_id, which a sale's line and its void's line both carry) or through an event expense.
 */
create or replace function public.bazaar_held_ledger()
returns table (ledger_id uuid, scheduled_id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, s.id, s.name
    from public.scheduled_events s
    join public.bazaar_days d on d.scheduled_id = s.id and d.event_id is not null
    join public.event_sales es on es.event_id = d.event_id
    join public.ledger_entries l on l.sale_id = es.id
   where s.finalised_at is null
  union
  select l.id, s.id, s.name
    from public.scheduled_events s
    join public.bazaar_days d on d.scheduled_id = s.id and d.event_id is not null
    join public.event_expenses x on x.event_id = d.event_id
    join public.ledger_entries l on l.id = x.ledger_id
   where s.finalised_at is null;
$$;
revoke execute on function public.bazaar_held_ledger() from public, anon, authenticated, service_role;

-- get_books, as it was (20260101006500) with the held lines left out of `lines` and summed in the new key `held` (an empty list
-- when there are none; every other key is unchanged).
create or replace function public.get_books(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_basis text;
  v_cut timestamptz;
  v_cut_seq bigint;
  v_cut_cseq bigint;
  v_lines jsonb;
  v_uncosted jsonb;
  v_receipts jsonb;
  v_held_ids uuid[];
  v_held jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the books' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '400 days' then -- rule:books-period
    raise exception 'a period is a from before a to, at most 400 days' using errcode = '22023';
  end if;
  select b.cost_basis, b.used_from into v_basis, v_cut from public.books_settings b where b.id;
  -- B4a-4: "when used" has no meaning without its date. A cutover cleared by hand (used_from null, the basis still used) would count every purchase
  -- and every use; with no cutover the books follow the bought rules.
  if v_cut is null then v_basis := 'bought'; end if;
  -- A cutover set by hand with no record (a test database) has no creation order: every row is after it.
  v_cut_seq := coalesce((select k.cut_seq from public.cost_cutover k), 0);
  v_cut_cseq := coalesce((select k.cut_corr_seq from public.cost_cutover k), 0);
  -- S1 (bazaar days), the one change from 20260101006500: a ledger line of a bazaar day whose booking is not finalised yet is held
  -- back from `lines` (the two `l.id <> all (v_held_ids)` below) and counted in `held`, per booking, for the period asked.
  select coalesce(array_agg(h.ledger_id), '{}'::uuid[]) into v_held_ids from public.bazaar_held_ledger() h;
  select coalesce(jsonb_agg(jsonb_build_object('scheduled_id', g.scheduled_id, 'name', g.name, 'count', g.n,
           'revenue_cents', g.revenue, 'expense_cents', g.expense) order by g.name, g.scheduled_id), '[]'::jsonb)
    into v_held
    from (select h.scheduled_id, h.name, count(*)::integer as n,
                 coalesce(sum(l.amount_cents) filter (where l.kind = 'sale'), 0)::bigint as revenue,
                 coalesce(sum(-l.amount_cents) filter (where l.kind <> 'sale'), 0)::bigint as expense
            from public.bazaar_held_ledger() h join public.ledger_entries l on l.id = h.ledger_id
           where l.occurred_at >= p_from and l.occurred_at < p_to
           group by h.scheduled_id, h.name) g;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'kind', x.kind, 'cat', x.cat, 'label', x.label,
           'amount_cents', x.amount_cents, 'at', (extract(epoch from x.at) * 1000)::bigint, 'short_qty', x.short_qty) order by x.at desc, x.id), '[]'::jsonb)
    into v_lines
    from (
      select 'o:' || o.id as id, 'revenue' as kind, 'Orders' as cat, 'Order ' || o.id || ' · ' || o.customer_name as label,
             o.paid_cents as amount_cents, o.paid_at as at, 0::numeric as short_qty
        from public.orders o where o.paid_at >= p_from and o.paid_at < p_to and o.paid_cents > 0
      union all
      select 'r:' || o.id, 'refund', 'Refunds', 'Refund · order ' || o.id, o.paid_cents, o.refunded_at, 0
        from public.orders o where o.refunded_at >= p_from and o.refunded_at < p_to and o.paid_cents > 0
      union all
      select 'l:' || l.id::text, 'revenue', l.category, l.memo, l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l where l.kind = 'sale' and l.occurred_at >= p_from and l.occurred_at < p_to
         and l.id <> all (v_held_ids)
      union all
      select 'l:' || l.id::text, 'expense', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind in ('cost', 'adjustment') and l.category <> 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
         and l.id <> all (v_held_ids)
         and (v_basis = 'bought' or v_cut is null
              -- a purchase that took stock in, or a correction's own line, is on the side its movement or correction was written on
              or case when exists (select 1 from public.stock_movements m where m.ledger_id = l.id)
                      then not exists (select 1 from public.stock_movements m where m.ledger_id = l.id and m.seq > v_cut_seq)
                      when exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id)
                      then not exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id and c.seq > v_cut_cseq)
                      else true end)
      union all
      select 'l:' || l.id::text, 'draw', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind = 'adjustment' and l.category = 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
      union all
      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'count' then 'Count: ' else 'Adjustment: ' end) || i.name,
             round(-m.qty_delta * m.unit_cost)::bigint, m.at, 0
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where v_basis = 'used' and m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is not null and m.at >= p_from and m.at < p_to
         and m.seq > v_cut_seq
      union all
      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use' then 'Used: ' else 'Waste: ' end) || i.name,
             round((-m.qty_delta + m.short_qty) * m.unit_cost)::bigint, m.at, m.short_qty
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where v_basis = 'used' and m.kind in ('use', 'waste') and m.unit_cost is not null and m.at >= p_from and m.at < p_to
         and m.short_qty - m.qty_delta <> 0 and m.seq > v_cut_seq
      union all
      select 'c:' || c.id::text, 'expense', i.category, coalesce(l.memo, 'Correction: ' || i.name), c.used_cents, c.at, 0
        from public.stock_cost_corrections c
        join public.stock_movements r on r.id = c.movement_id
        join public.inventory_items i on i.id = r.item_id
        left join public.ledger_entries l on l.id = c.ledger_id
       where v_basis = 'used' and c.used_cents <> 0 and c.at >= p_from and c.at < p_to and c.seq > v_cut_cseq
      union all
      select 'k:opening', 'expense', 'Stock', 'Opening stock carried in', -k.total_cents, v_cut - interval '1 millisecond', 0
        from public.cost_cutover k
       where v_basis = 'used' and v_cut is not null
         and v_cut - interval '1 millisecond' >= p_from and v_cut - interval '1 millisecond' < p_to
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'kind', u.kind, 'item', u.item, 'qty', u.qty, 'unit', u.unit,
           'at', (extract(epoch from u.at) * 1000)::bigint)
           || case when u.why is not null then jsonb_build_object('why', u.why) else '{}'::jsonb end order by u.at desc, u.id), '[]'::jsonb)
    into v_uncosted
    from (
      select 'm:' || m.id::text as id, m.kind as kind, i.name as item, m.short_qty - m.qty_delta as qty, i.unit as unit, m.at as at, null::text as why
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where m.kind in ('use', 'waste') and m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to
         and m.short_qty - m.qty_delta <> 0 and m.seq > v_cut_seq
      union all
      select 'p:' || r.id::text || ':' || (e.ord - 1)::text, 'use', e.value ->> 'name', (e.value ->> 'by')::numeric, e.value ->> 'unit', r.at, e.value ->> 'why'
        from public.production_records r
        cross join lateral jsonb_array_elements(r.short) with ordinality e(value, ord)
       where v_basis = 'used' and r.kind in ('dough', 'batch', 'pack', 'sale') and (e.value ? 'why') and r.at >= p_from and r.at < p_to and r.at >= v_cut
      union all
      select 'm:' || m.id::text, m.kind, i.name, -m.qty_delta, i.unit, m.at, null::text
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where m.kind in ('count', 'adjust') and m.qty_delta < 0 and m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to
         and m.seq > v_cut_seq
    ) u;
  select coalesce(jsonb_agg(jsonb_build_object('movement_id', r.id, 'item', i.name, 'qty', r.qty_delta,
           'cost_cents', public.receipt_cost(r.id), 'supplier', r.supplier, 'at', (extract(epoch from r.at) * 1000)::bigint)
           order by r.at desc), '[]'::jsonb)
    into v_receipts
    from public.stock_movements r join public.inventory_items i on i.id = r.item_id
   where r.kind = 'receipt' and r.ledger_id is not null and r.at >= now() - interval '90 days';
  return jsonb_build_object('basis', v_basis, 'lines', v_lines, 'uncosted', v_uncosted, 'receipts', v_receipts, 'held', v_held);
end;
$$;
revoke execute on function public.get_books(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_books(timestamptz, timestamptz) to authenticated;

/** Owner only. Everything the bazaar screens show for one booking: the summary, the target, each day's stamp, the costs, the losses, the stock added, and what was stored when it was finalised. */
create or replace function public.get_bazaar(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.scheduled_events%rowtype;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read a bazaar' using errcode = '42501';
  end if;
  select * into v_s from public.scheduled_events s where s.id = p_booking;
  if not found then -- rule:get-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'summary', public.bazaar_summary(p_booking),
    'target_profit_cents', v_s.target_profit_cents,
    'updated_at', v_s.updated_at,
    'finalised_at', v_s.finalised_at, 'final_hash', v_s.final_hash, 'final_summary', v_s.final_summary,
    'stamps', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'day', d.day, 'updated_at', d.updated_at) order by d.day), '[]'::jsonb)
                 from public.bazaar_days d where d.scheduled_id = p_booking),
    'costs', (select coalesce(jsonb_agg(jsonb_build_object('product_id', k.product_id, 'recipe_cents', k.recipe_cents,
                       'recipe_read_at', k.recipe_read_at, 'typed_cents', k.typed_cents, 'typed_at', k.typed_at) order by k.product_id), '[]'::jsonb)
                from public.bazaar_costs k where k.scheduled_id = p_booking),
    'losses', (select coalesce(jsonb_agg(jsonb_build_object('client_id', o.client_id, 'day_id', o.day_id, 'product_id', o.product_id,
                        'qty', o.qty, 'reason', o.reason, 'at', (extract(epoch from o.at) * 1000)::bigint) order by o.at, o.client_id), '[]'::jsonb)
                 from public.bazaar_losses o join public.bazaar_days d on d.id = o.day_id where d.scheduled_id = p_booking),
    'stock_adds', (select coalesce(jsonb_agg(jsonb_build_object('client_id', a.client_id, 'day_id', a.day_id, 'product_id', a.product_id,
                            'qty', a.qty, 'kind', a.kind) order by a.at, a.client_id), '[]'::jsonb)
                     from public.bazaar_stock_adds a join public.bazaar_days d on d.id = a.day_id where d.scheduled_id = p_booking));
end;
$$;

-- ------------------------------------------------------------------ the plan

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one day's plan. The body is exactly: id (a uuid the browser mints),
 * scheduled_id, day (YYYY-MM-DD, inside the booking's dates), float_cents and lines (at most 50, each exactly product_id, made_qty,
 * carried_qty, price_cents). The lines are replaced whole. The same body again is answered, whatever happened since.
 */
create or replace function public.save_bazaar_day(p_day jsonb, p_expected_updated_at timestamptz)
returns table (id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id      uuid;
  v_booking uuid;
  v_date    date;
  v_lines   jsonb;
  v_hash    text;
  v_row     public.bazaar_days%rowtype;
  v_s       public.scheduled_events%rowtype;
  v_at      timestamptz;
  v_bad     boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may plan a bazaar day' using errcode = '42501';
  end if;
  if p_day is null or jsonb_typeof(p_day) <> 'object' then
    raise exception 'a bazaar day must be an object' using errcode = '22023';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(p_day) k) is distinct from array['day', 'float_cents', 'id', 'lines', 'scheduled_id']
           or jsonb_typeof(p_day -> 'id') <> 'string' or (p_day ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(p_day -> 'scheduled_id') <> 'string'
           or (p_day ->> 'scheduled_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(p_day -> 'day') <> 'string' or (p_day ->> 'day') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
           or jsonb_typeof(p_day -> 'float_cents') <> 'number' or (p_day ->> 'float_cents') !~ '^[0-9]{1,9}$'
           or (p_day ->> 'float_cents')::bigint > 100000000
           or jsonb_typeof(p_day -> 'lines') <> 'array' or jsonb_array_length(p_day -> 'lines') > 50;
  if v_bad then -- rule:day-shape
    raise exception 'a bazaar day carries exactly id, scheduled_id, day, float_cents (whole centavos) and at most 50 lines' using errcode = '22023';
  end if;
  v_lines := p_day -> 'lines';
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where case when jsonb_typeof(l) <> 'object' then true
                               else (select array_agg(k order by k) from jsonb_object_keys(l) k) is distinct from array['carried_qty', 'made_qty', 'price_cents', 'product_id']
                                    or jsonb_typeof(l -> 'product_id') <> 'string' or jsonb_typeof(l -> 'made_qty') <> 'number'
                                    or jsonb_typeof(l -> 'carried_qty') <> 'number' or jsonb_typeof(l -> 'price_cents') <> 'number' end);
  if v_bad then -- rule:day-line-shape
    raise exception 'a line carries exactly product_id, made_qty, carried_qty and price_cents' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where case when (l ->> 'made_qty') !~ '^[0-9]{1,4}$' or (l ->> 'carried_qty') !~ '^[0-9]{1,4}$'
                                    or (l ->> 'price_cents') !~ '^[0-9]{1,9}$' then true
                               else (l ->> 'price_cents')::bigint > 100000000 end);
  if v_bad then -- rule:day-line-values
    raise exception 'quantities are whole, 0 to 9,999; a price is whole centavos, 0 or more' using errcode = '22023';
  end if;
  v_bad := (select count(*) <> count(distinct l ->> 'product_id') from jsonb_array_elements(v_lines) l);
  if v_bad then -- rule:day-line-duplicate
    raise exception 'a flavour is listed twice' using errcode = '22023';
  end if;
  begin
    v_date := (p_day ->> 'day')::date;
  exception when others then
    raise exception 'the day is not a real date' using errcode = '22023';
  end;
  v_id := (p_day ->> 'id')::uuid;
  v_booking := (p_day ->> 'scheduled_id')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  select * into v_s from public.scheduled_events s where s.id = v_booking;
  if not found then -- rule:day-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  v_hash := encode(sha256(convert_to(p_day::text, 'UTF8')), 'hex');
  select * into v_row from public.bazaar_days d where d.id = v_id;
  -- The same body again (a lost reply's retry) is answered before anything else is judged.
  if v_row.id is not null and v_row.plan_hash = v_hash then -- rule:day-replay
    return query select v_row.id, v_row.updated_at;
    return;
  end if;
  if v_s.finalised_at is not null then -- rule:day-finalised
    raise exception 'that bazaar is finalised' using errcode = '55000';
  end if;
  if v_row.id is not null and v_row.event_id is not null then -- rule:day-started
    raise exception 'that day has started: its plan cannot change' using errcode = '55000';
  end if;
  if v_row.id is not null and v_row.scheduled_id <> v_booking then -- rule:day-id-taken
    raise exception 'that id is a day of another booking' using errcode = '23505';
  end if;
  if v_date < v_s.starts_on or v_date > v_s.ends_on then -- rule:day-outside
    raise exception 'the day is outside the booking''s dates' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l where not exists (select 1 from public.products p where p.id = l ->> 'product_id'));
  if v_bad then -- rule:day-flavour
    raise exception 'a line names a flavour that does not exist' using errcode = '22023';
  end if;
  -- A second day on the same date of the same booking is refused by the table itself (bazaar_days_booking_day, 23505).
  if v_row.id is null then
    if p_expected_updated_at is not null then -- rule:day-create-stamp
      raise exception 'that day does not exist' using errcode = 'P0002';
    end if;
    insert into public.bazaar_days (id, scheduled_id, day, float_cents, plan_hash)
    values (v_id, v_booking, v_date, (p_day ->> 'float_cents')::bigint, v_hash)
    returning updated_at into v_at;
  else
    v_bad := p_expected_updated_at is null
             or date_trunc('milliseconds', v_row.updated_at) is distinct from date_trunc('milliseconds', p_expected_updated_at);
    if v_bad then -- rule:day-stale
      raise exception 'the day changed since it was read' using errcode = 'P0002';
    end if;
    update public.bazaar_days as d
       set day = v_date, float_cents = (p_day ->> 'float_cents')::bigint, plan_hash = v_hash, updated_at = clock_timestamp()
     where d.id = v_id
    returning d.updated_at into v_at;
    delete from public.bazaar_day_lines l where l.day_id = v_id;
  end if;
  insert into public.bazaar_day_lines (day_id, product_id, made_qty, carried_qty, price_cents)
  select v_id, l ->> 'product_id', (l ->> 'made_qty')::integer, (l ->> 'carried_qty')::integer, (l ->> 'price_cents')::bigint
    from jsonb_array_elements(v_lines) l;
  return query select v_id, v_at;
end;
$$;

/**
 * One fee for a day (day_id) or for the whole event (day_id null): never ingredients or packaging. The body is exactly: client_id,
 * scheduled_id, day_id, label, category, amount_cents, paid_on (YYYY-MM-DD). Keyed on the client id and a hash of the body, as
 * add_event_expense is: the same body again is answered, the same id with another body is refused. Nothing reaches the ledger until
 * the bazaar is finalised. `rent:` ids are the booking's own rent and cannot be used.
 */
create or replace function public.save_bazaar_fee(p_fee jsonb)
returns table (client_id text, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client  text;
  v_booking uuid;
  v_day     uuid;
  v_paid    date;
  v_hash    text;
  v_seen    text;
  v_s       public.scheduled_events%rowtype;
  v_bad     boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may add a bazaar fee' using errcode = '42501';
  end if;
  if p_fee is null or jsonb_typeof(p_fee) <> 'object' then
    raise exception 'a fee must be an object' using errcode = '22023';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(p_fee) k) is distinct from array['amount_cents', 'category', 'client_id', 'day_id', 'label', 'paid_on', 'scheduled_id']
           or jsonb_typeof(p_fee -> 'client_id') <> 'string' or length(p_fee ->> 'client_id') not between 1 and 150
           or jsonb_typeof(p_fee -> 'scheduled_id') <> 'string'
           or (p_fee ->> 'scheduled_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(p_fee -> 'day_id') not in ('string', 'null')
           or (jsonb_typeof(p_fee -> 'day_id') = 'string' and (p_fee ->> 'day_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
           or jsonb_typeof(p_fee -> 'label') <> 'string' or length(btrim(p_fee ->> 'label')) not between 1 and 80
           or jsonb_typeof(p_fee -> 'category') <> 'string' or length(btrim(p_fee ->> 'category')) not between 1 and 40
           or (p_fee ->> 'label') ~ '[[:cntrl:]]' or (p_fee ->> 'category') ~ '[[:cntrl:]]'
           or jsonb_typeof(p_fee -> 'amount_cents') <> 'number' or (p_fee ->> 'amount_cents') !~ '^[1-9][0-9]{0,8}$'
           or (p_fee ->> 'amount_cents')::bigint > 100000000
           or jsonb_typeof(p_fee -> 'paid_on') <> 'string' or (p_fee ->> 'paid_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  if v_bad then -- rule:fee-shape
    raise exception 'a fee carries exactly client_id, scheduled_id, day_id, label, category, amount_cents (whole, above 0) and paid_on' using errcode = '22023';
  end if;
  v_client := p_fee ->> 'client_id';
  if v_client like 'rent:%' then -- rule:fee-client
    raise exception 'that id is kept for the stall rent' using errcode = '22023';
  end if;
  begin
    v_paid := (p_fee ->> 'paid_on')::date;
  exception when others then
    raise exception 'paid_on is not a real date' using errcode = '22023';
  end;
  v_booking := (p_fee ->> 'scheduled_id')::uuid;
  v_day := (p_fee ->> 'day_id')::uuid;

  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  v_hash := encode(sha256(convert_to(p_fee::text, 'UTF8')), 'hex');
  select f.payload_hash into v_seen from public.bazaar_fees f where f.client_id = v_client;
  if found then
    if v_seen <> v_hash then -- rule:fee-replay-conflict
      raise exception 'that id was already used for a different fee' using errcode = '23505';
    end if;
    return query select v_client, true;
    return;
  end if;
  select * into v_s from public.scheduled_events s where s.id = v_booking;
  if not found then -- rule:fee-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  if v_s.finalised_at is not null then -- rule:fee-finalised
    raise exception 'that bazaar is finalised' using errcode = '55000';
  end if;
  -- A mistyped year would put the fee in the profit and in no period of the books she ever opens.
  if v_paid < v_s.starts_on - 366 or v_paid > v_s.ends_on + 366 then -- rule:fee-date
    raise exception 'paid_on is more than a year from the bazaar' using errcode = '22023';
  end if;
  v_bad := v_day is not null and not exists (select 1 from public.bazaar_days d where d.id = v_day and d.scheduled_id = v_booking);
  if v_bad then -- rule:fee-day
    raise exception 'that day is not a day of this booking' using errcode = '22023';
  end if;
  insert into public.bazaar_fees (client_id, scheduled_id, day_id, label, category, amount_cents, paid_on, payload_hash)
  values (v_client, v_booking, v_day, btrim(p_fee ->> 'label'), btrim(p_fee ->> 'category'), (p_fee ->> 'amount_cents')::bigint, v_paid, v_hash);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.fee_saved', 'bazaar_fees', v_client,
    jsonb_build_object('scheduled_id', v_booking, 'day_id', v_day, 'amount_cents', (p_fee ->> 'amount_cents')::bigint));
  return query select v_client, false;
end;
$$;

/**
 * Cookies lost on an open day. The body is exactly: client_id, day_id, product_id, qty (whole, 1 to 9,999), reason, at (epoch
 * milliseconds). Keyed as a fee is. Refused before the day starts and once it is closed, for a flavour that is not on the day, and when
 * it would take the flavour below zero left (made + carried - sold - given - lost).
 */
create or replace function public.save_bazaar_loss(p_loss jsonb)
returns table (client_id text, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client  text;
  v_day     uuid;
  v_booking uuid;
  v_pid     text;
  v_qty     integer;
  v_at      timestamptz;
  v_hash    text;
  v_seen    text;
  v_bad     boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record a bazaar loss' using errcode = '42501';
  end if;
  if p_loss is null or jsonb_typeof(p_loss) <> 'object' then
    raise exception 'a loss must be an object' using errcode = '22023';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(p_loss) k) is distinct from array['at', 'client_id', 'day_id', 'product_id', 'qty', 'reason']
           or jsonb_typeof(p_loss -> 'client_id') <> 'string' or length(p_loss ->> 'client_id') not between 1 and 160
           or jsonb_typeof(p_loss -> 'day_id') <> 'string'
           or (p_loss ->> 'day_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(p_loss -> 'product_id') <> 'string'
           or jsonb_typeof(p_loss -> 'qty') <> 'number' or (p_loss ->> 'qty') !~ '^[1-9][0-9]{0,3}$'
           or jsonb_typeof(p_loss -> 'reason') <> 'string' or length(btrim(p_loss ->> 'reason')) not between 1 and 80
           or (p_loss ->> 'reason') ~ '[[:cntrl:]]'
           or jsonb_typeof(p_loss -> 'at') <> 'number' or (p_loss ->> 'at') !~ '^[0-9]{12,14}$';
  if v_bad then -- rule:loss-shape
    raise exception 'a loss carries exactly client_id, day_id, product_id, qty (whole, 1 to 9,999), reason and at' using errcode = '22023';
  end if;
  v_client := p_loss ->> 'client_id';
  v_day := (p_loss ->> 'day_id')::uuid;
  v_pid := p_loss ->> 'product_id';
  v_qty := (p_loss ->> 'qty')::integer;
  v_at := to_timestamp((p_loss ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:loss-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;
  select d.scheduled_id into v_booking from public.bazaar_days d where d.id = v_day;
  if v_booking is null then -- rule:loss-day-missing
    raise exception 'that day does not exist' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  v_hash := encode(sha256(convert_to(p_loss::text, 'UTF8')), 'hex');
  select o.payload_hash into v_seen from public.bazaar_losses o where o.client_id = v_client;
  if found then
    if v_seen <> v_hash then -- rule:loss-replay-conflict
      raise exception 'that id was already used for a different loss' using errcode = '23505';
    end if;
    return query select v_client, true;
    return;
  end if;
  v_bad := not exists (select 1 from public.bazaar_days d join public.events e on e.id = d.event_id where d.id = v_day and e.closed_at is null);
  if v_bad then -- rule:loss-day-open
    raise exception 'a loss is recorded on a day that has started and is not closed' using errcode = '55000';
  end if;
  v_bad := not exists (select 1 from public.bazaar_day_lines l where l.day_id = v_day and l.product_id = v_pid);
  if v_bad then -- rule:loss-flavour
    raise exception 'that flavour is not on this day' using errcode = '22023';
  end if;
  v_bad := (select f.made + f.carried - f.sold - f.given - f.lost - v_qty < 0
              from public.bazaar_line_facts(v_booking) f where f.day_id = v_day and f.product_id = v_pid);
  if v_bad then -- rule:loss-below-zero
    raise exception 'that would take the flavour below zero left' using errcode = '22023';
  end if;
  insert into public.bazaar_losses (client_id, day_id, product_id, qty, reason, at, payload_hash)
  values (v_client, v_day, v_pid, v_qty, btrim(p_loss ->> 'reason'), v_at, v_hash);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.loss_saved', 'bazaar_losses', v_client, jsonb_build_object('day_id', v_day, 'product_id', v_pid, 'qty', v_qty));
  return query select v_client, false;
end;
$$;

/**
 * Her typed cost per cookie for one flavour of one booking (centavos, at most four decimals), or null to go back to the recipe's. The
 * same value again is answered and writes no second audit row. Refused once the bazaar is finalised.
 */
create or replace function public.save_bazaar_cost(p_booking uuid, p_product text, p_typed_cents numeric)
returns table (product_id text, typed_cents numeric, recipe_cents numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_s    public.scheduled_events%rowtype;
  v_row  public.bazaar_costs%rowtype;
  v_bad  boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may type a bazaar cost' using errcode = '42501';
  end if;
  v_bad := p_booking is null or p_product is null
           or (p_typed_cents is not null and (p_typed_cents < 0 or p_typed_cents > 100000000 or p_typed_cents <> round(p_typed_cents, 4)));
  if v_bad then -- rule:cost-value
    raise exception 'a cost per cookie is 0 or more, in centavos with at most four decimals' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || p_booking::text, 0));
  select * into v_s from public.scheduled_events s where s.id = p_booking;
  if not found then -- rule:cost-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.products p where p.id = p_product) then -- rule:cost-flavour
    raise exception 'no such flavour' using errcode = '22023';
  end if;
  select * into v_row from public.bazaar_costs k where k.scheduled_id = p_booking and k.product_id = p_product;
  -- The same value again is answered, also after the bazaar was finalised.
  if v_row.typed_cents is not distinct from p_typed_cents and (v_row.scheduled_id is not null or p_typed_cents is null) then -- rule:cost-replay
    return query select p_product, v_row.typed_cents, v_row.recipe_cents;
    return;
  end if;
  if v_s.finalised_at is not null then -- rule:cost-finalised
    raise exception 'that bazaar is finalised' using errcode = '55000';
  end if;
  insert into public.bazaar_costs as k (scheduled_id, product_id, typed_cents, typed_by, typed_at)
  values (p_booking, p_product, p_typed_cents, auth.uid(), now())
  on conflict (scheduled_id, product_id) do update
    set typed_cents = excluded.typed_cents, typed_by = excluded.typed_by, typed_at = excluded.typed_at;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.cost_typed', 'bazaar_costs', p_booking::text || ':' || p_product,
    jsonb_build_object('scheduled_id', p_booking, 'product_id', p_product, 'from_cents', v_row.typed_cents, 'to_cents', p_typed_cents));
  return query select p_product, p_typed_cents, v_row.recipe_cents;
end;
$$;

/** Her target profit for one booking, in whole centavos, or null for none. Refused once the bazaar is finalised; the same value again is answered. */
create or replace function public.save_bazaar_target(p_booking uuid, p_cents bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.scheduled_events%rowtype;
begin
  if not public.is_owner() then
    raise exception 'only the owner may set a bazaar target' using errcode = '42501';
  end if;
  if p_booking is null or (p_cents is not null and p_cents not between 0 and 10000000000) then -- rule:target-value
    raise exception 'a target is whole centavos, 0 or more' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || p_booking::text, 0));
  select * into v_s from public.scheduled_events s where s.id = p_booking;
  if not found then -- rule:target-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  if v_s.target_profit_cents is not distinct from p_cents then -- rule:target-replay
    return p_cents;
  end if;
  if v_s.finalised_at is not null then -- rule:target-finalised
    raise exception 'that bazaar is finalised' using errcode = '55000';
  end if;
  update public.scheduled_events as s set target_profit_cents = p_cents where s.id = p_booking;
  return p_cents;
end;
$$;

-- ------------------------------------------------------------------ the day

/**
 * Starts a planned day as an `events` row (the id is minted by the phone, so a retry is the same event): name is the booking and the
 * date, price_snapshot the day's prices, loaded the day's stock (made + carried), and the drawer float. Each flavour of the day that has
 * no recipe cost read yet gets one now: the recipe's per_cookie_cents when the recipe is complete, else none. Returns what start_event
 * returns, plus loaded and the float. A repeat with the same event id is answered with the event as it is.
 */
create or replace function public.start_bazaar_day(p_day uuid, p_device text, p_event_id uuid)
returns table (event_id uuid, starts_at timestamptz, selling_device text, prices jsonb, loaded jsonb, float_cents bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking uuid;
  v_d       public.bazaar_days%rowtype;
  v_s       public.scheduled_events%rowtype;
  v_e       public.events%rowtype;
  v_prev    uuid;
  v_prices  jsonb;
  v_loaded  jsonb;
  v_costs   jsonb;
  v_now     timestamptz := now();
  v_bad     boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may start a bazaar day' using errcode = '42501';
  end if;
  v_bad := p_day is null or p_event_id is null or p_device is null or p_device !~ '^[A-Za-z0-9_-]{1,64}$';
  if v_bad then -- rule:start-shape
    raise exception 'a day, a selling device id and an event id are required' using errcode = '22023';
  end if;
  select d.scheduled_id into v_booking from public.bazaar_days d where d.id = p_day;
  if v_booking is null then -- rule:start-day-missing
    raise exception 'that day does not exist' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  select * into v_d from public.bazaar_days d where d.id = p_day for update;
  if v_d.event_id is not null then
    if v_d.event_id <> p_event_id then -- rule:start-replay-conflict
      raise exception 'that day already started as another event' using errcode = '23505';
    end if;
    select * into v_e from public.events e where e.id = v_d.event_id;
    return query select v_e.id, v_e.starts_at, v_e.selling_device, v_e.price_snapshot, v_e.loaded, v_e.drawer_float_cents;
    return;
  end if;
  if exists (select 1 from public.events e where e.id = p_event_id) then -- rule:start-event-used
    raise exception 'that event id was already used' using errcode = '23505';
  end if;
  select * into v_s from public.scheduled_events s where s.id = v_booking;
  if not v_s.active then -- rule:start-booking
    raise exception 'that booking is switched off' using errcode = '22023';
  end if;
  if v_s.finalised_at is not null then -- rule:start-finalised
    raise exception 'that bazaar is finalised' using errcode = '55000';
  end if;
  v_bad := exists (select 1 from public.bazaar_days d join public.events e on e.id = d.event_id
                    where d.scheduled_id = v_booking and e.closed_at is null);
  if v_bad then -- rule:start-other-open
    raise exception 'another day of this bazaar is still open: close it first' using errcode = '55000';
  end if;
  -- Days start in date order: an earlier day started after a later one could carry in the same cookies a second time.
  v_bad := exists (select 1 from public.bazaar_days d where d.scheduled_id = v_booking and d.day > v_d.day and d.event_id is not null);
  if v_bad then -- rule:start-later-started
    raise exception 'a later day of this bazaar has already started' using errcode = '55000';
  end if;
  v_bad := not exists (select 1 from public.bazaar_day_lines l where l.day_id = p_day and l.made_qty + l.carried_qty > 0);
  if v_bad then -- rule:start-empty
    raise exception 'the day has no stock to sell' using errcode = '22023';
  end if;
  -- What may be carried in is what the day before, the latest closed one, set aside to carry (nothing on the first day).
  select d.id into v_prev from public.bazaar_days d join public.events e on e.id = d.event_id
   where d.scheduled_id = v_booking and d.day < v_d.day and e.closed_at is not null order by d.day desc limit 1;
  v_bad := exists (select 1 from public.bazaar_day_lines l
                    where l.day_id = p_day
                      and l.carried_qty > coalesce((select p.carry_next_qty from public.bazaar_day_lines p
                                                     where p.day_id = v_prev and p.product_id = l.product_id), 0));
  if v_bad then -- rule:start-carry
    raise exception 'a flavour carries in more than the day before set aside' using errcode = '22023';
  end if;

  select jsonb_object_agg(l.product_id, l.price_cents), jsonb_object_agg(l.product_id, l.made_qty + l.carried_qty)
    into v_prices, v_loaded
    from public.bazaar_day_lines l where l.day_id = p_day;
  insert into public.events (id, name, starts_at, float_cents, selling_device, price_snapshot, opened_at, drawer_float_cents, loaded)
  values (p_event_id, left(v_s.name, 69) || ' ' || to_char(v_d.day, 'YYYY-MM-DD'), v_now, v_d.float_cents, p_device, v_prices, v_now,
          v_d.float_cents, v_loaded);
  update public.bazaar_days as d set event_id = p_event_id where d.id = p_day;
  -- The recipe's cost is read once, at the flavour's first day, and only from a complete recipe: a partial figure is no cost.
  v_costs := public.get_recipe_costs();
  insert into public.bazaar_costs as k (scheduled_id, product_id, recipe_cents, recipe_read_at)
  select v_booking, l.product_id,
         (select (r ->> 'per_cookie_cents')::numeric from jsonb_array_elements(v_costs) r
           where r ->> 'product_id' = l.product_id and (r ->> 'complete')::boolean),
         v_now
    from public.bazaar_day_lines l where l.day_id = p_day
  on conflict (scheduled_id, product_id) do update
    set recipe_cents = excluded.recipe_cents, recipe_read_at = excluded.recipe_read_at
    where k.recipe_read_at is null;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.day_started', 'bazaar_days', p_day::text,
    jsonb_build_object('scheduled_id', v_booking, 'event_id', p_event_id, 'device', p_device, 'float_cents', v_d.float_cents));
  return query select p_event_id, v_now, p_device, v_prices, v_loaded, v_d.float_cents;
end;
$$;

/**
 * More stock on an open day: adds to made_qty, or to carried_qty within what the day before set aside, and to the event's loaded. The
 * flavour must be on the day (it has a price there). The call adds, so it is keyed on a client id: the same id and body again is
 * answered and adds nothing; the same id with another body is refused.
 */
create or replace function public.add_bazaar_day_stock(p_day uuid, p_product text, p_qty integer, p_kind text, p_client_id uuid)
returns table (product_id text, made_qty integer, carried_qty integer, loaded integer, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking uuid;
  v_event   uuid;
  v_date    date;
  v_prev    uuid;
  v_seen    public.bazaar_stock_adds%rowtype;
  v_l       public.bazaar_day_lines%rowtype;
  v_bad     boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may add bazaar stock' using errcode = '42501';
  end if;
  v_bad := p_day is null or p_product is null or p_client_id is null or p_qty is null or p_qty not between 1 and 9999
           or p_kind is null or p_kind not in ('made', 'carried');
  if v_bad then -- rule:add-shape
    raise exception 'a day, a flavour, a whole quantity of 1 to 9,999, made or carried, and a client id are required' using errcode = '22023';
  end if;
  select d.scheduled_id, d.event_id, d.day into v_booking, v_event, v_date from public.bazaar_days d where d.id = p_day;
  if v_booking is null then -- rule:add-day-missing
    raise exception 'that day does not exist' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  select * into v_seen from public.bazaar_stock_adds a where a.client_id = p_client_id;
  if found then
    v_bad := v_seen.day_id <> p_day or v_seen.product_id <> p_product or v_seen.qty <> p_qty or v_seen.kind <> p_kind;
    if v_bad then -- rule:add-replay-conflict
      raise exception 'that id was already used for a different stock change' using errcode = '23505';
    end if;
    return query select l.product_id, l.made_qty, l.carried_qty, l.made_qty + l.carried_qty, true
                   from public.bazaar_day_lines l where l.day_id = p_day and l.product_id = p_product;
    return;
  end if;
  v_bad := not exists (select 1 from public.events e where e.id = v_event and e.closed_at is null);
  if v_bad then -- rule:add-day-open
    raise exception 'stock is added to a day that has started and is not closed' using errcode = '55000';
  end if;
  select * into v_l from public.bazaar_day_lines l where l.day_id = p_day and l.product_id = p_product for update;
  if not found then -- rule:add-flavour
    raise exception 'that flavour has no price on this day' using errcode = '22023';
  end if;
  v_bad := (case p_kind when 'made' then v_l.made_qty else v_l.carried_qty end) + p_qty > 9999;
  if v_bad then -- rule:add-max
    raise exception 'a day holds at most 9,999 of a flavour' using errcode = '22023';
  end if;
  select d.id into v_prev from public.bazaar_days d join public.events e on e.id = d.event_id
   where d.scheduled_id = v_booking and d.day < v_date and e.closed_at is not null order by d.day desc limit 1;
  v_bad := p_kind = 'carried'
           and v_l.carried_qty + p_qty > coalesce((select p.carry_next_qty from public.bazaar_day_lines p
                                                    where p.day_id = v_prev and p.product_id = p_product), 0);
  if v_bad then -- rule:add-carry
    raise exception 'that carries in more than the day before set aside' using errcode = '22023';
  end if;
  insert into public.bazaar_stock_adds (client_id, day_id, product_id, qty, kind) values (p_client_id, p_day, p_product, p_qty, p_kind);
  update public.bazaar_day_lines as l
     set made_qty = l.made_qty + case p_kind when 'made' then p_qty else 0 end,
         carried_qty = l.carried_qty + case p_kind when 'carried' then p_qty else 0 end
   where l.day_id = p_day and l.product_id = p_product
  returning l.* into v_l;
  update public.events as e set loaded = jsonb_set(e.loaded, array[p_product], to_jsonb(v_l.made_qty + v_l.carried_qty)) where e.id = v_event;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.stock_added', 'bazaar_stock_adds', p_client_id::text,
    jsonb_build_object('day_id', p_day, 'product_id', p_product, 'qty', p_qty, 'kind', p_kind));
  return query select p_product, v_l.made_qty, v_l.carried_qty, v_l.made_qty + v_l.carried_qty, false;
end;
$$;

/**
 * Closes a day. The body is exactly: day_id, at (epoch milliseconds), counted_cents (whole, or null for no count), lines (for EVERY
 * flavour of the day: left, carry_next, to_shop, written_off) and expected (the day's hash from the summary she was shown). The day is
 * worked out again from the rows: a different hash is refused with 40001 (read again), so she never closes over a sale, a loss or a fee
 * she has not seen. left = carry_next + to_shop + written_off; nothing is carried on the booking's last day; a flavour may not be left
 * with more than made + carried - sold - given - lost. Sets the event's closed_at, counted_cents, variance_cents and returned (the left
 * map) and stores her review. Posts nothing to the books. Returns the summary. The same close again is answered.
 */
create or replace function public.close_bazaar_day(p_close jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day     uuid;
  v_booking uuid;
  v_at      timestamptz;
  v_counted bigint;
  v_lines   jsonb;
  v_hash    text;
  v_d       public.bazaar_days%rowtype;
  v_e       public.events%rowtype;
  v_s       public.scheduled_events%rowtype;
  v_sum     jsonb;
  v_dayj    jsonb;
  v_bad     boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may close a bazaar day' using errcode = '42501';
  end if;
  if p_close is null or jsonb_typeof(p_close) <> 'object' then
    raise exception 'a close must be an object' using errcode = '22023';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(p_close) k) is distinct from array['at', 'counted_cents', 'day_id', 'expected', 'lines']
           or jsonb_typeof(p_close -> 'day_id') <> 'string'
           or (p_close ->> 'day_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(p_close -> 'at') <> 'number' or (p_close ->> 'at') !~ '^[0-9]{12,14}$'
           or jsonb_typeof(p_close -> 'counted_cents') not in ('number', 'null')
           or (jsonb_typeof(p_close -> 'counted_cents') = 'number' and (p_close ->> 'counted_cents') !~ '^[0-9]{1,12}$')
           or jsonb_typeof(p_close -> 'expected') <> 'string' or (p_close ->> 'expected') !~ '^[0-9a-f]{64}$'
           or jsonb_typeof(p_close -> 'lines') <> 'object';
  if v_bad then -- rule:close-shape
    raise exception 'a close carries exactly day_id, at, counted_cents (whole or null), lines and expected' using errcode = '22023';
  end if;
  v_lines := p_close -> 'lines';
  v_bad := exists (select 1 from jsonb_each(v_lines) i
                    where case when jsonb_typeof(i.value) <> 'object' then true
                               else (select array_agg(k order by k) from jsonb_object_keys(i.value) k) is distinct from array['carry_next', 'left', 'to_shop', 'written_off']
                                    or exists (select 1 from jsonb_each(i.value) q
                                                where jsonb_typeof(q.value) <> 'number' or (q.value #>> '{}') !~ '^[0-9]{1,5}$') end);
  if v_bad then -- rule:close-line-shape
    raise exception 'each flavour carries exactly left, carry_next, to_shop and written_off, whole and 0 or more' using errcode = '22023';
  end if;
  v_day := (p_close ->> 'day_id')::uuid;
  v_at := to_timestamp((p_close ->> 'at')::bigint / 1000.0);
  v_counted := (p_close ->> 'counted_cents')::bigint;
  select d.scheduled_id into v_booking from public.bazaar_days d where d.id = v_day;
  if v_booking is null then -- rule:close-day-missing
    raise exception 'that day does not exist' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  v_hash := encode(sha256(convert_to(p_close::text, 'UTF8')), 'hex');
  select * into v_d from public.bazaar_days d where d.id = v_day for update;
  if v_d.event_id is null then -- rule:close-not-started
    raise exception 'that day has not started' using errcode = '55000';
  end if;
  select * into v_e from public.events e where e.id = v_d.event_id for update;
  if v_e.closed_at is not null then
    if v_d.closed_hash is distinct from v_hash then -- rule:close-replay-conflict
      raise exception 'that day was already closed differently' using errcode = '23505';
    end if;
    return public.bazaar_summary(v_booking);
  end if;
  select * into v_s from public.scheduled_events s where s.id = v_booking;
  v_bad := v_at > now() + interval '1 day' or v_at < v_e.starts_at - interval '1 day';
  if v_bad then -- rule:close-at
    raise exception 'the close time is in the future or before the day started' using errcode = '22023';
  end if;
  select public.bazaar_summary(v_booking) into v_sum;
  select x into v_dayj from jsonb_array_elements(v_sum -> 'days') x where x ->> 'id' = v_day::text;
  if (v_dayj ->> 'hash') is distinct from (p_close ->> 'expected') then -- rule:close-stale
    raise exception 'the day changed since it was shown: read it again' using errcode = '40001';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(v_lines) k)
           is distinct from (select array_agg(l.product_id order by l.product_id) from public.bazaar_day_lines l where l.day_id = v_day);
  if v_bad then -- rule:close-lines
    raise exception 'the count names every flavour of the day and no other' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_each(v_lines) i
                    where (i.value ->> 'left')::integer
                          <> (i.value ->> 'carry_next')::integer + (i.value ->> 'to_shop')::integer + (i.value ->> 'written_off')::integer);
  if v_bad then -- rule:close-split
    raise exception 'what is left is what carries over, goes to the shop and is written off, together' using errcode = '22023';
  end if;
  v_bad := v_d.day = v_s.ends_on and exists (select 1 from jsonb_each(v_lines) i where (i.value ->> 'carry_next')::integer > 0);
  if v_bad then -- rule:close-carry-last-day
    raise exception 'nothing carries over from the booking''s last day' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_dayj -> 'lines') f
                    where (f ->> 'made')::integer + (f ->> 'carried')::integer - (f ->> 'sold')::integer - (f ->> 'given')::integer
                          - (f ->> 'lost')::integer - (v_lines -> (f ->> 'product_id') ->> 'left')::integer < 0);
  if v_bad then -- rule:close-negative
    raise exception 'a flavour has more left than was there: if more was made than the plan says, add that stock first' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from public.event_sales s where s.event_id = v_d.event_id and s.voided_at is null and s.sold_at > v_at);
  if v_bad then -- rule:close-sale-after
    raise exception 'a sale was made after the close time' using errcode = '22023';
  end if;

  update public.bazaar_day_lines as l
     set left_qty = (i.value ->> 'left')::integer, carry_next_qty = (i.value ->> 'carry_next')::integer,
         to_shop_qty = (i.value ->> 'to_shop')::integer, written_off_qty = (i.value ->> 'written_off')::integer
    from jsonb_each(v_lines) i
   where l.day_id = v_day and l.product_id = i.key;
  update public.events as e
     set closed_at = v_at, counted_cents = v_counted,
         variance_cents = v_counted - (v_dayj ->> 'cash_expected_cents')::bigint,
         returned = (select coalesce(jsonb_object_agg(i.key, i.value -> 'left'), '{}'::jsonb) from jsonb_each(v_lines) i),
         closed_hash = v_hash
   where e.id = v_d.event_id;
  -- Her review is the day as the summary gives it now, with her count: what she was shown and what she answered.
  select public.bazaar_summary(v_booking) into v_sum;
  select x into v_dayj from jsonb_array_elements(v_sum -> 'days') x where x ->> 'id' = v_day::text;
  update public.bazaar_days as d set closed_review = v_dayj, closed_hash = v_hash where d.id = v_day;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.day_closed', 'bazaar_days', v_day::text,
    jsonb_build_object('scheduled_id', v_booking, 'event_id', v_d.event_id, 'counted_cents', v_counted,
      'expected_cents', (v_dayj ->> 'cash_expected_cents')::bigint, 'hash', v_dayj ->> 'hash'));
  return public.bazaar_summary(v_booking);
end;
$$;

/**
 * Finalises a bazaar, once: only now do its fees, its rent, its cash variances and its stock use reach the books (its sales' ledger
 * lines are no longer held back by get_books). `expected` is the hash of the summary she was shown; a different summary is refused with
 * 40001. In one transaction: the rent (under the client id `rent:<booking id>`, the key the old link used, so it is booked once) and
 * each fee become an event_expenses row and a ledger cost dated the day it was paid (the rent: the booking's first day); each day's cash
 * variance becomes a ledger line as close_event books it; for each flavour, cookies made less cookies sent to the shop take their
 * ingredients by the current recipe (recipe_stock_plan, as a batch) and the recipe's per-cookie packaging lines; the bazaar-sale
 * container rule is taken once per sale that is not voided. A shortfall is recorded with its why and never refuses the finalise. The
 * summary and its hash are stored. The same call again is answered with the stored summary.
 */
create or replace function public.finalise_bazaar(p_booking uuid, p_expected text, p_drop integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s       public.scheduled_events%rowtype;
  v_sum     jsonb;
  v_first   uuid;
  v_at      timestamptz := now();
  v_when    timestamptz;
  v_ledger  uuid;
  v_f       record;
  v_d       record;
  v_p       record;
  v_k       record;
  v_x       jsonb;
  v_plan    jsonb;
  v_id      uuid;
  v_n       integer;
  v_left    numeric;
  v_short   jsonb;
  v_reason  text;
  v_sales   integer;
  v_cookies integer;
  v_bad     boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may finalise a bazaar' using errcode = '42501';
  end if;
  if p_booking is null or p_expected is null or p_expected !~ '^[0-9a-f]{64}$' then -- rule:fin-shape
    raise exception 'a booking and the hash of the summary shown are required' using errcode = '22023';
  end if;
  if p_drop is null or p_drop not between 0 and 100000 then -- rule:fin-drop
    raise exception 'the drop the cookies sent to the shop belong to is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || p_booking::text, 0));
  select * into v_s from public.scheduled_events s where s.id = p_booking for update;
  if not found then -- rule:fin-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  if v_s.finalised_at is not null then
    if v_s.final_hash is distinct from p_expected then -- rule:fin-replay-conflict
      raise exception 'that bazaar was already finalised on another summary' using errcode = '23505';
    end if;
    return v_s.final_summary;
  end if;
  select d.event_id into v_first from public.bazaar_days d
   where d.scheduled_id = p_booking and d.event_id is not null order by d.day limit 1;
  if v_first is null then -- rule:fin-no-day
    raise exception 'no day of this bazaar was started' using errcode = '55000';
  end if;
  v_bad := exists (select 1 from public.bazaar_days d join public.events e on e.id = d.event_id
                    where d.scheduled_id = p_booking and e.closed_at is null);
  if v_bad then -- rule:fin-open-day
    raise exception 'a day of this bazaar is still open: close it first' using errcode = '55000';
  end if;
  select public.bazaar_summary(p_booking) into v_sum;
  if (v_sum ->> 'hash') is distinct from p_expected then -- rule:fin-stale
    raise exception 'the bazaar changed since it was shown: read it again' using errcode = '40001';
  end if;

  -- The rent, once, under the key the old link used. A cost is dated noon UTC of the day it was paid: that instant is the same
  -- calendar day in the shop's zone (which only business_clock names), so the line falls on the day she paid.
  v_when := (v_s.starts_on + time '12:00') at time zone 'UTC';
  if v_s.rent_cents > 0 and not exists (select 1 from public.event_expenses x where x.client_id = 'rent:' || p_booking::text) then -- rule:fin-rent
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
    values ('cost', 'Bazaar rent', v_s.name || ' — Stall rent', -v_s.rent_cents, v_when, auth.uid())
    returning id into v_ledger;
    insert into public.event_expenses (client_id, event_id, label, category, amount_cents, spent_at, ledger_id, payload_hash)
    values ('rent:' || p_booking::text, v_first, 'Stall rent', 'Bazaar rent', v_s.rent_cents, v_when, v_ledger,
            encode(sha256(convert_to('rent:' || p_booking::text || ':' || v_s.rent_cents::text, 'UTF8')), 'hex'));
  end if;
  for v_f in select f.client_id, f.label, f.category, f.amount_cents, f.paid_on, f.payload_hash, coalesce(d.event_id, v_first) as ev
               from public.bazaar_fees f left join public.bazaar_days d on d.id = f.day_id
              where f.scheduled_id = p_booking and f.ledger_id is null order by f.paid_on, f.client_id loop
    v_when := (v_f.paid_on + time '12:00') at time zone 'UTC';
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
    values ('cost', v_f.category, v_s.name || ' — ' || v_f.label, -v_f.amount_cents, v_when, auth.uid())
    returning id into v_ledger;
    insert into public.event_expenses (client_id, event_id, label, category, amount_cents, spent_at, ledger_id, payload_hash)
    values ('fee:' || v_f.client_id, v_f.ev, v_f.label, v_f.category, v_f.amount_cents, v_when, v_ledger, v_f.payload_hash);
    update public.bazaar_fees as f set ledger_id = v_ledger where f.client_id = v_f.client_id;
  end loop;
  -- Each day's cash variance, as close_event books it: a short drawer is a cost, an over drawer a correction to takings.
  for v_d in select e.name, e.closed_at, (x ->> 'over_cents')::bigint as over, (x ->> 'short_cents')::bigint as short
               from jsonb_array_elements(v_sum -> 'days') x join public.events e on e.id = (x ->> 'event_id')::uuid
              order by x ->> 'day' loop
    if v_d.over > 0 or v_d.short > 0 then
      insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
      values (case when v_d.short > 0 then 'cost'::public.ledger_kind else 'sale'::public.ledger_kind end,
        case when v_d.short > 0 then 'Cash variance' else 'Bazaar' end,
        v_d.name || ' — drawer ' || case when v_d.short > 0 then 'short' else 'over' end,
        v_d.over - v_d.short, v_d.closed_at, auth.uid());
    end if;
  end loop;

  -- Stock. The catalogue's lock first, as every production takes it, so the recipes and rules read here hold for the whole take.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  -- Cookies sent to the shop are an ordinary batch of the drop given: baked stock reads it as it reads any batch, and the batch takes
  -- its own ingredients once (the loop after this one takes ingredients only for the cookies that were not sent to the shop).
  for v_p in select l ->> 'product_id' as pid, l ->> 'name' as name, (l ->> 'to_shop')::integer as qty
               from jsonb_array_elements(v_sum -> 'cookie_cost' -> 'lines') l where (l ->> 'to_shop')::integer > 0 order by l ->> 'product_id' loop
    v_id := md5('bazaar:' || p_booking::text || ':shop:' || v_p.pid)::uuid;
    v_n := 0;
    v_short := '[]'::jsonb;
    v_reason := 'Baked: ' || v_p.name || ', for the shop from ' || left(v_s.name, 40);
    insert into public.production_records (id, kind, product_id, ref, qty, target, rejects, dough_used, recipe_version, drop_no, at,
                                           payload_hash, created_by)
    select v_id, 'batch', v_p.pid, 'bazaar:' || p_booking::text, v_p.qty, v_p.qty, 0, 0, r.version, p_drop, v_at,
           encode(sha256(convert_to('bazaar:' || p_booking::text || ':shop:' || v_p.pid || ':' || p_drop::text, 'UTF8')), 'hex'), auth.uid()
      from public.recipes r where r.product_id = v_p.pid;
    if not found then -- rule:fin-shop-no-recipe
      raise exception 'a flavour sent to the shop has no recipe: a batch cannot be written for it' using errcode = '55000';
    end if;
    select public.recipe_stock_plan(v_p.pid, v_p.qty, 'batch', '{}'::jsonb) into v_plan;
    for v_x in select x from jsonb_array_elements(coalesce(v_plan, '[]'::jsonb)) x loop
      v_n := v_n + 1;
      if v_x ->> 'item_id' is not null then
        v_left := public.use_stock_item(v_id, v_n, v_x ->> 'item_id', (v_x ->> 'amount')::numeric, v_reason, v_at, true);
      else
        v_left := (v_x ->> 'amount')::numeric;
      end if;
      if v_left > 0 then
        v_short := v_short || (jsonb_build_object('name', v_x ->> 'name', 'by', round(v_left, 1), 'unit', v_x ->> 'unit')
                               || case when v_x ->> 'why' is not null then jsonb_build_object('why', v_x ->> 'why') else '{}'::jsonb end);
      end if;
    end loop;
    update public.production_records as r set short = v_short where r.id = v_id;
  end loop;
  for v_p in select l ->> 'product_id' as pid, l ->> 'name' as name, (l ->> 'made')::integer - (l ->> 'to_shop')::integer as qty
               from jsonb_array_elements(v_sum -> 'cookie_cost' -> 'lines') l order by l ->> 'product_id' loop
    if v_p.qty > 0 then
      v_id := md5('bazaar:' || p_booking::text || ':flavour:' || v_p.pid)::uuid;
      v_n := 0;
      v_short := '[]'::jsonb;
      v_reason := 'Bazaar: ' || v_s.name || ', ' || v_p.name;
      insert into public.production_records (id, kind, product_id, ref, qty, at, payload_hash, created_by)
      values (v_id, 'sale', v_p.pid, 'bazaar:' || p_booking::text, v_p.qty, v_at,
              encode(sha256(convert_to('bazaar:' || p_booking::text || ':flavour:' || v_p.pid, 'UTF8')), 'hex'), auth.uid());
      select public.recipe_stock_plan(v_p.pid, v_p.qty, 'batch', '{}'::jsonb) into v_plan;
      if v_plan is null then -- rule:fin-no-recipe
        v_short := v_short || jsonb_build_object('name', v_p.name, 'by', v_p.qty, 'unit', 'cookie', 'why', 'no recipe');
      end if;
      for v_x in select x from jsonb_array_elements(coalesce(v_plan, '[]'::jsonb)) x loop
        v_n := v_n + 1;
        if v_x ->> 'item_id' is not null then
          v_left := public.use_stock_item(v_id, v_n, v_x ->> 'item_id', (v_x ->> 'amount')::numeric, v_reason, v_at, true);
        else
          v_left := (v_x ->> 'amount')::numeric;
        end if;
        if v_left > 0 then
          v_short := v_short || (jsonb_build_object('name', v_x ->> 'name', 'by', round(v_left, 1), 'unit', v_x ->> 'unit')
                                 || case when v_x ->> 'why' is not null then jsonb_build_object('why', v_x ->> 'why') else '{}'::jsonb end);
        end if;
      end loop;
      for v_k in select l.item_id, l.item_name as name, l.unit, l.qty * v_p.qty as amount, it.id is not null and it.unit = l.unit as ok,
                        case when it.id is null then 'not a stock item' else 'unit differs' end as why
                   from public.recipe_ingredients l left join public.inventory_items it on it.id = l.item_id
                  where l.product_id = v_p.pid and l.kind = 'packaging' order by l.position, l.id loop
        v_n := v_n + 1;
        if v_k.ok then
          v_left := public.use_stock_item(v_id, v_n, v_k.item_id, v_k.amount, v_reason, v_at, false);
          if v_left > 0 then
            v_short := v_short || jsonb_build_object('name', v_k.name, 'by', round(v_left, 1), 'unit', v_k.unit);
          end if;
        else
          v_short := v_short || jsonb_build_object('name', v_k.name, 'by', round(v_k.amount, 1), 'unit', v_k.unit, 'why', v_k.why);
        end if;
      end loop;
      update public.production_records as r set short = v_short where r.id = v_id;
    end if;
  end loop;
  -- The bazaar-sale container rule, once per sale that is not voided (a line per cookie: once per cookie in those sales).
  select count(*)::integer, coalesce(sum(q.cookies), 0)::integer into v_sales, v_cookies
    from (select (select sum(i.qty) from public.event_sale_items i where i.sale_id = s.id) as cookies
            from public.event_sales s
           where s.voided_at is null
             and s.event_id in (select d.event_id from public.bazaar_days d where d.scheduled_id = p_booking and d.event_id is not null)) q;
  if v_sales > 0 then
    v_id := md5('bazaar:' || p_booking::text || ':sales')::uuid;
    v_n := 0;
    v_short := '[]'::jsonb;
    insert into public.production_records (id, kind, ref, qty, at, payload_hash, created_by)
    values (v_id, 'sale', 'bazaar:' || p_booking::text, v_cookies, v_at,
            encode(sha256(convert_to('bazaar:' || p_booking::text || ':sales', 'UTF8')), 'hex'), auth.uid());
    for v_k in select r.item_id, it.name, it.unit, r.qty * case r.per when 'cookie' then v_cookies else v_sales end as amount
                 from public.packaging_rules r join public.inventory_items it on it.id = r.item_id
                where r.container = 'bazaar_sale' order by r.position loop
      v_n := v_n + 1;
      v_left := public.use_stock_item(v_id, v_n, v_k.item_id, v_k.amount, 'Bazaar sales: ' || v_s.name, v_at, false);
      if v_left > 0 then
        v_short := v_short || jsonb_build_object('name', v_k.name, 'by', round(v_left, 1), 'unit', v_k.unit);
      end if;
    end loop;
    if not exists (select 1 from public.packaging_rules r where r.container = 'bazaar_sale') then
      v_short := v_short || jsonb_build_object('name', 'Bazaar sale', 'by', v_sales, 'unit', 'sale', 'why', 'no packaging rule');
    end if;
    update public.production_records as r set short = v_short where r.id = v_id;
  end if;

  update public.scheduled_events as s set finalised_at = v_at, final_summary = v_sum, final_hash = p_expected where s.id = p_booking;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.finalised', 'scheduled_events', p_booking::text,
    jsonb_build_object('hash', p_expected, 'revenue_cents', v_sum -> 'revenue' -> 'revenue_cents',
      'fees_cents', v_sum -> 'fees' -> 'total_cents', 'profit_cents', v_sum -> 'profit' -> 'cents'));
  return v_sum;
end;
$$;

-- ------------------------------------------------------------------ authority

revoke execute on function public.get_bazaar(uuid) from public, anon, authenticated;
grant execute on function public.get_bazaar(uuid) to authenticated;
revoke execute on function public.save_bazaar_day(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_bazaar_day(jsonb, timestamptz) to authenticated;
revoke execute on function public.save_bazaar_fee(jsonb) from public, anon, authenticated;
grant execute on function public.save_bazaar_fee(jsonb) to authenticated;
revoke execute on function public.save_bazaar_loss(jsonb) from public, anon, authenticated;
grant execute on function public.save_bazaar_loss(jsonb) to authenticated;
revoke execute on function public.save_bazaar_cost(uuid, text, numeric) from public, anon, authenticated;
grant execute on function public.save_bazaar_cost(uuid, text, numeric) to authenticated;
revoke execute on function public.save_bazaar_target(uuid, bigint) from public, anon, authenticated;
grant execute on function public.save_bazaar_target(uuid, bigint) to authenticated;
revoke execute on function public.start_bazaar_day(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.start_bazaar_day(uuid, text, uuid) to authenticated;
revoke execute on function public.add_bazaar_day_stock(uuid, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.add_bazaar_day_stock(uuid, text, integer, text, uuid) to authenticated;
revoke execute on function public.close_bazaar_day(jsonb) from public, anon, authenticated;
grant execute on function public.close_bazaar_day(jsonb) to authenticated;
revoke execute on function public.finalise_bazaar(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.finalise_bazaar(uuid, text, integer) to authenticated;
