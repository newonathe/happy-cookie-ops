-- B3a (final-plan.md version 2), cost core: one cost per ingredient, decided by one database function, stamped on every use when it
-- is written, so a later delivery or a correction never changes a period already reported.
--
--   item_prices            her usual price and pack for a stock item, dated and append-only (an edit is a new dated row)
--   inventory_items        avg_cost (centavos per unit): the average of what was paid, kept by record_stock_movement
--   stock_movements        seq (the order movements were applied), unit_cost and cost_source (stamped when a use or a waste is
--                          written; null when no cost was known), short_qty (what a use could not take, costed with the rest)
--   stock_cost_corrections used_cents: the part of a correction that belongs to stock already used
--   item_unit_cost()       THE one cost function: the average, else her usual price per unit, else the cheapest supplier quote
--                          per unit, else nothing. Internal: no API role can execute it.
--   use_stock_item()       the stock a recipe line or a packaging line takes, by item id; use_stock() (by name) calls it
--   record_stock_movement  redefined: a costed receipt moves the average; a waste is stamped
--   record_production      redefined: lines are taken by item id; a line naming no stock item takes nothing and is all short
--   record_cost_correction redefined: a correction moves the average by the share of the delivery still on hand and puts the rest
--                          into the books as cost of stock already used
--   get_books              redefined: stock used is the stamped cost (never re-priced), corrections add their used share, and the
--                          movements with no cost are listed apart (never a zero line)
--   save_item_price / get_item_costs / get_recipe_costs   the owner's price book, what each item costs, what each recipe costs
--
-- unit_price_at() is dropped: the cost of a use is no longer looked up when the books are read, it is the stamp. Existing uses and
-- wastes are stamped with what that rule gave, so no reported total moves. Each refusal is one `if ... then -- rule:name` line so the
-- SQL role suite can neutralise it. The books' default cost basis is NOT changed here: the screens cannot show the `uncosted` list yet,
-- so the flip to 'used' ships with the screen that does (B3b).
--
-- This migration needs the links of 20260101005500: recipe lines and supplier prices must already name their stock item by id, or the
-- migration stops (below) before it changes anything.

do $$
begin
  if (public.preview_identity_links() -> 'counts' ->> 'recipe_lines')::integer > 0
     or (public.preview_identity_links() -> 'counts' ->> 'supplier_prices')::integer > 0 then
    raise exception 'recipe lines or supplier prices still name their stock item by text only: run preview_identity_links() and apply_identity_links() first, then apply this migration'
      using errcode = 'P0001';
  end if;
end
$$;

create table public.item_prices (
  id uuid primary key,
  item_id text not null references public.inventory_items (id),
  price_cents bigint not null check (price_cents > 0),
  pack_size numeric(12, 3) not null check (pack_size > 0),
  as_of date not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete set null,
  received_at timestamptz not null default now()
);
create index item_prices_item_idx on public.item_prices (item_id, as_of desc, received_at desc);
alter table public.item_prices enable row level security;
revoke all on table public.item_prices from public, anon, authenticated;

alter table public.inventory_items
  add column avg_cost numeric check (avg_cost is null or avg_cost > 0),
  add column avg_cost_at timestamptz;

-- The order movements were applied: the existing rows are numbered by when the database received them, the new ones by the sequence.
alter table public.stock_movements add column seq bigint;
update public.stock_movements m set seq = x.n
  from (select s.id, row_number() over (order by s.received_at, s.at, s.id) as n from public.stock_movements s) x
 where x.id = m.id;
alter table public.stock_movements alter column seq set not null;
do $$
declare
  v_next bigint;
begin
  select coalesce(max(m.seq), 0) + 1 into v_next from public.stock_movements m;
  execute format('alter table public.stock_movements alter column seq add generated always as identity (start with %s)', v_next);
end
$$;
create unique index stock_movements_seq_uq on public.stock_movements (seq);
alter table public.stock_movements
  add column unit_cost numeric check (unit_cost is null or unit_cost > 0),
  add column cost_source text check (cost_source in ('average', 'usual', 'supplier', 'legacy')),
  add column short_qty numeric(12, 3) not null default 0 check (short_qty >= 0);

alter table public.stock_cost_corrections add column used_cents bigint not null default 0;

-- 1. Every existing use and waste keeps what the old rule gave (the latest costed receipt up to then, corrections included).
update public.stock_movements m set unit_cost = u.p, cost_source = 'legacy'
  from (select s.id, public.unit_price_at(s.item_id, s.at) as p from public.stock_movements s where s.kind in ('use', 'waste')) u
 where u.id = m.id and u.p > 0;
alter table public.stock_movements
  add constraint stock_movements_cost_stamp_check check ((unit_cost is null) = (cost_source is null));

-- 2. Each item with a costed delivery gets its average by replaying its movements in the order they were applied (received_at, at, id, as seq is numbered): a costed delivery with h on hand and
-- the average (or, with none yet, its own price per unit) is worth (h x average + cost) / (h + quantity).
do $$
declare
  r record;
  v_item text;
  v_h numeric := 0;
  v_avg numeric;
  v_at timestamptz;
  v_cost bigint;
begin
  for r in select m.id, m.item_id, m.kind, m.qty_delta, m.at
             from public.stock_movements m
            where m.item_id in (select x.item_id from public.stock_movements x where x.kind = 'receipt' and x.cost_cents > 0)
            order by m.item_id, m.received_at, m.at, m.id loop
    if v_item is distinct from r.item_id then
      if v_item is not null and v_avg is not null then
        update public.inventory_items i set avg_cost = v_avg, avg_cost_at = v_at where i.id = v_item;
      end if;
      v_item := r.item_id;
      v_h := 0;
      v_avg := null;
      v_at := null;
    end if;
    if r.kind = 'receipt' and r.qty_delta > 0 then
      v_cost := public.receipt_cost(r.id);
      if v_cost > 0 then
        v_avg := (v_h * coalesce(v_avg, v_cost::numeric / r.qty_delta) + v_cost) / (v_h + r.qty_delta);
        v_at := r.at;
      end if;
    end if;
    v_h := greatest(v_h + r.qty_delta, 0);
  end loop;
  if v_item is not null and v_avg is not null then
    update public.inventory_items i set avg_cost = v_avg, avg_cost_at = v_at where i.id = v_item;
  end if;
end
$$;

-- Internal: the cost of one unit of an item right now (centavos, unrounded), and where it came from. The first that exists, never zero:
-- the average of what was paid, her usual price (the latest as_of, then the latest row) per unit of its pack, the cheapest active
-- supplier quote per unit (an active supplier, a pack size, a price above 0). No row when none exists. No API role can execute it.
create or replace function public.item_unit_cost(p_item text)
returns table (unit_cost numeric, source text)
language sql
stable
security definer
set search_path = ''
as $$
  select x.cost, x.src
    from (
      select i.avg_cost as cost, 'average'::text as src, 1 as ord
        from public.inventory_items i where i.id = p_item and i.avg_cost > 0
      union all
      (select p.price_cents::numeric / p.pack_size, 'usual'::text, 2
         from public.item_prices p where p.item_id = p_item
        order by p.as_of desc, p.received_at desc, p.id desc limit 1)
      union all
      select min(q.price_cents::numeric / q.pack_size), 'supplier'::text, 3
        from public.supplier_prices q join public.suppliers s on s.id = q.supplier_id
       where q.item_id = p_item and q.active and s.active and q.pack_size is not null and q.price_cents > 0
      having count(*) > 0
    ) x
   order by x.ord
   limit 1;
$$;
revoke execute on function public.item_unit_cost(text) from public, anon, authenticated, service_role;

-- Internal: the item locks of one production by item id, always taken in id order (two productions that share butter never deadlock).
create or replace function public.lock_stock_item_ids(p_ids text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  for v_id in select distinct x from unnest(p_ids) x order by x loop
    perform pg_advisory_xact_lock(hashtextextended('stock_item:' || v_id, 0));
  end loop;
end;
$$;
revoke execute on function public.lock_stock_item_ids(text[]) from public, anon, authenticated, service_role;

-- Internal: takes what it can of one item by id, never more than is there (nothing from an item that is switched off), and stamps the
-- cost of what it took. The movement id is the same as it always was (the production record, the line's place and the item). With
-- p_cost_short the part that could not be taken is kept on the row (short_qty) and costed with the rest, and a row is written even when
-- nothing could be taken. Returns the part that could not be taken (all of it for an item that does not exist).
create or replace function public.use_stock_item(p_prod uuid, p_seq integer, p_item text, p_qty numeric, p_reason text, p_at timestamptz, p_cost_short boolean)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item  public.inventory_items%rowtype;
  v_take  numeric;
  v_short numeric;
  v_key   text;
  v_cost  numeric;
  v_src   text;
begin
  select * into v_item from public.inventory_items i where i.id = p_item;
  if not found then
    return p_qty;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_item:' || v_item.id, 0));
  select * into v_item from public.inventory_items i where i.id = v_item.id for update;
  v_take := case when v_item.active then least(p_qty, v_item.on_hand) else 0 end;
  v_short := p_qty - v_take;
  if v_take > 0 or (p_cost_short and v_short > 0) then
    select c.unit_cost, c.source into v_cost, v_src from public.item_unit_cost(v_item.id) c;
    v_key := p_prod::text || ':' || p_seq::text || ':' || v_item.id;
    insert into public.stock_movements (id, item_id, kind, qty_delta, reason, at, payload_hash, production_id, created_by,
                                        unit_cost, cost_source, short_qty)
    values (md5(v_key)::uuid, v_item.id, 'use', -v_take, left(p_reason, 80), p_at,
            encode(sha256(convert_to(v_key, 'UTF8')), 'hex'), p_prod, auth.uid(),
            v_cost, v_src, case when p_cost_short then v_short else 0 end);
    if v_take > 0 then
      update public.inventory_items as i set on_hand = i.on_hand - v_take where i.id = v_item.id;
    end if;
  end if;
  return v_short;
end;
$$;
revoke execute on function public.use_stock_item(uuid, integer, text, numeric, text, timestamptz, boolean) from public, anon, authenticated, service_role;

-- use_stock, by name as it always was (an active item of that name, the lowest id): packing and bazaar sales write the rows they wrote
-- before, plus the stamp.
create or replace function public.use_stock(p_prod uuid, p_seq integer, p_name text, p_qty numeric, p_reason text, p_at timestamptz)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text;
begin
  select i.id into v_id from public.inventory_items i where lower(i.name) = lower(p_name) and i.active order by i.id limit 1;
  if v_id is null then
    return p_qty;
  end if;
  return public.use_stock_item(p_prod, p_seq, v_id, p_qty, p_reason, p_at, false);
end;
$$;
revoke execute on function public.use_stock(uuid, integer, text, numeric, text, timestamptz) from public, anon, authenticated, service_role;

-- record_stock_movement, as it was (20260101004600) with a costed receipt moving the average and a waste being stamped.
create or replace function public.record_stock_movement(p_movement jsonb)
returns table (item_id text, on_hand numeric, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys     text[];
  v_id       uuid;
  v_item_id  text;
  v_kind     text;
  v_qty      numeric;
  v_cost     numeric;
  v_supplier text;
  v_reason   text;
  v_at       timestamptz;
  v_hash     text;
  v_seen     text;
  v_item     public.inventory_items%rowtype;
  v_delta    numeric;
  v_new      numeric;
  v_ledger   uuid;
  v_bad      boolean;
  v_base     numeric;
  v_avg      numeric;
  v_ucost    numeric;
  v_usrc     text;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record stock movements' using errcode = '42501';
  end if;
  if p_movement is null or jsonb_typeof(p_movement) <> 'object' then
    raise exception 'a movement must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_movement) k;
  if v_keys is distinct from array['at', 'cost_cents', 'id', 'item_id', 'kind', 'qty', 'reason', 'supplier'] then -- rule:mv-keys
    raise exception 'a movement carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_movement -> 'id') <> 'string' or jsonb_typeof(p_movement -> 'item_id') <> 'string'
     or jsonb_typeof(p_movement -> 'kind') <> 'string' or jsonb_typeof(p_movement -> 'qty') <> 'number'
     or jsonb_typeof(p_movement -> 'cost_cents') not in ('number', 'null')
     or jsonb_typeof(p_movement -> 'supplier') <> 'string' or jsonb_typeof(p_movement -> 'reason') <> 'string'
     or jsonb_typeof(p_movement -> 'at') <> 'number' then
    raise exception 'a movement field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_movement ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:mv-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_movement ->> 'id')::uuid;
  v_item_id := p_movement ->> 'item_id';
  v_kind := p_movement ->> 'kind';
  if v_kind not in ('opening', 'receipt', 'count', 'waste', 'adjust') then -- rule:mv-kind
    raise exception 'the kind is opening, receipt, count, waste or adjust' using errcode = '22023';
  end if;
  v_qty := (p_movement ->> 'qty')::numeric;
  v_bad := v_qty <> round(v_qty, 3) or abs(v_qty) > 999999999
           or (v_kind = 'count' and v_qty < 0) or (v_kind = 'adjust' and v_qty = 0)
           or (v_kind in ('opening', 'receipt', 'waste') and v_qty <= 0);
  if v_bad then -- rule:mv-qty
    raise exception 'a quantity has at most 3 decimals; a count is 0 or more, an adjustment is not 0, the rest are above 0' using errcode = '22023';
  end if;
  v_cost := (p_movement ->> 'cost_cents')::numeric;
  v_bad := v_cost is not null and (v_cost <> trunc(v_cost) or v_cost not between 0 and 100000000);
  if v_bad then -- rule:mv-cost
    raise exception 'a cost is whole centavos from 0 to 1,000,000 pesos' using errcode = '22023';
  end if;
  if v_cost is not null and v_kind <> 'receipt' then -- rule:mv-cost-kind
    raise exception 'only a receipt has a cost' using errcode = '22023';
  end if;
  v_supplier := btrim(p_movement ->> 'supplier');
  v_reason := btrim(p_movement ->> 'reason');
  v_bad := length(v_supplier) > 80 or length(v_reason) > 80 or (v_supplier || v_reason) ~ '[[:cntrl:]]';
  if v_bad then -- rule:mv-text
    raise exception 'the supplier and the reason are at most 80 characters' using errcode = '22023';
  end if;
  if v_kind in ('waste', 'adjust') and v_reason = '' then -- rule:mv-reason
    raise exception 'a waste or an adjustment needs a reason' using errcode = '22023';
  end if;
  if (p_movement ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_movement ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:mv-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stock_movement:' || v_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('stock_item:' || v_item_id, 0));
  v_hash := encode(sha256(convert_to(p_movement::text, 'UTF8')), 'hex');
  select m.payload_hash into v_seen from public.stock_movements m where m.id = v_id;
  if found then
    if v_seen <> v_hash then -- rule:mv-replay-conflict
      raise exception 'that id was already used for a different movement' using errcode = '23505';
    end if;
    select i.on_hand into v_new from public.inventory_items i
      join public.stock_movements m on m.item_id = i.id where m.id = v_id;
    return query select v_item_id, v_new, true;
    return;
  end if;
  select * into v_item from public.inventory_items i where i.id = v_item_id for update;
  if not found then -- rule:mv-item-missing
    raise exception 'no such item' using errcode = 'P0002';
  end if;
  if not v_item.active then -- rule:mv-item-inactive
    raise exception 'that item is switched off' using errcode = '22023';
  end if;
  if v_kind = 'opening' then
    v_bad := exists (select 1 from public.stock_movements m where m.item_id = v_item_id) or v_item.on_hand <> 0;
    if v_bad then -- rule:mv-opening-first
      raise exception 'the opening quantity is the first movement of an item, with nothing on hand' using errcode = '22023';
    end if;
    v_delta := v_qty;
  elsif v_kind = 'count' then
    -- A count is a picture of one moment. If anything moved after it was taken (a delivery, waste, another count), applying
    -- it would wipe that out: it is refused, and she counts again.
    v_bad := exists (select 1 from public.stock_movements m where m.item_id = v_item_id and m.at > v_at);
    if v_bad then -- rule:mv-count-stale
      raise exception 'something moved after this count was taken: count again' using errcode = '22023';
    end if;
    v_delta := v_qty - v_item.on_hand;
  elsif v_kind = 'waste' then
    v_delta := -v_qty;
    if v_qty > v_item.on_hand then -- rule:mv-waste-clamp
      v_delta := -v_item.on_hand;
    end if;
  elsif v_kind = 'adjust' then
    v_delta := greatest(v_qty, -v_item.on_hand);
  else
    v_delta := v_qty;
  end if;
  if v_kind = 'receipt' and coalesce(v_cost, 0) > 0 then -- rule:mv-receipt-books
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
    values ('cost', v_item.category, v_item.name || case when v_supplier = '' then '' else ' · ' || v_supplier end,
            -v_cost::bigint, v_at, auth.uid())
    returning id into v_ledger;
  end if;
  -- B3a: a costed receipt moves the average: h on hand before, q received, c paid, and a base per unit for what is on hand: the average,
  -- else (nothing paid for it yet) her usual price or a quote, else this delivery's own price. An uncosted receipt, an opening, a count
  -- and an adjustment leave the average alone; with nothing on hand the last average stands until the next costed delivery.
  if v_kind = 'receipt' and coalesce(v_cost, 0) > 0 then
    v_base := v_item.avg_cost;
    if v_base is null and v_item.on_hand > 0 then
      select c.unit_cost into v_base from public.item_unit_cost(v_item_id) c;
    end if;
    v_base := coalesce(v_base, v_cost / v_qty);
    v_avg := (v_item.on_hand * v_base + v_cost) / (v_item.on_hand + v_qty);
  end if;
  -- B3a: a waste is stamped with the cost known at this moment (nothing is stamped when none is known).
  if v_kind = 'waste' then
    select c.unit_cost, c.source into v_ucost, v_usrc from public.item_unit_cost(v_item_id) c;
  end if;
  insert into public.stock_movements (id, item_id, kind, qty_delta, counted, cost_cents, supplier, reason, at, ledger_id,
                                      payload_hash, created_by, unit_cost, cost_source)
  values (v_id, v_item_id, v_kind, v_delta, case when v_kind = 'count' then v_qty end, v_cost::bigint, v_supplier, v_reason,
          v_at, v_ledger, v_hash, auth.uid(), v_ucost, v_usrc);
  update public.inventory_items as i
     set on_hand = i.on_hand + v_delta,
         last_counted = case when v_kind in ('count', 'opening') then v_at else i.last_counted end,
         avg_cost = coalesce(v_avg, i.avg_cost),
         avg_cost_at = case when v_avg is not null then v_at else i.avg_cost_at end
   where i.id = v_item_id
  returning i.on_hand into v_new;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'stock.movement', 'stock_movements', v_id::text,
    jsonb_build_object('item_id', v_item_id, 'kind', v_kind, 'qty_delta', v_delta, 'cost_cents', v_cost));
  return query select v_item_id, v_new, false;
end;
$$;
revoke execute on function public.record_stock_movement(jsonb) from public, anon, authenticated;
grant execute on function public.record_stock_movement(jsonb) to authenticated;

-- record_production, as it was (20260101004800) with the lines taken by item id: a linked line goes through use_stock_item (its short
-- part kept and costed on the row); a line that names no stock item, or is in another unit than its item, takes nothing and is all
-- short. A short entry keeps {name, by, unit} and adds "why" ('not a stock item' or 'unit differs') for a line that could not be taken at
-- all (a line that is merely short has no why): the books list those as uncosted.
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
                    where not exists (select 1 from public.recipe_ingredients i where i.product_id = v_pid and i.item_name = k));
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
  -- Every line is qty x mixed / yield with the multiplication first: dividing first leaves a rounded quotient (5/9 has no exact
  -- decimal), and a piece line that is exactly 5 would round up to 6.
  for v_line in select i.item_name as name, i.qty as qty, i.unit as unit, i.item_id as item_id, it.unit as item_unit
                  from public.recipe_ingredients i left join public.inventory_items it on it.id = i.item_id
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
      v_plan := v_plan || jsonb_build_object('name', v_line.name, 'unit', v_line.unit, 'amount', v_amount,
        'item_id', case when v_line.item_unit = v_line.unit then v_line.item_id end,
        'why', case when v_line.item_id is null then 'not a stock item' when v_line.item_unit <> v_line.unit then 'unit differs' end);
    end if;
  end loop;
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

-- record_cost_correction, as it was (20260101004900) with the change shared between the stock still on hand and the stock already
-- used. f is the share of that delivery still on hand: walking the item's later movements from the newest back, each use or waste that
-- was taken from h_before leaving h_after scales f by h_after / h_before (f is 0 if nothing was on hand before it, and stays between 0 and 1).
-- Every later movement that took stock away counts: a use, a waste, a count that found less, an adjustment down. On hand times f of the
-- change moves the average; the rest is cost of stock already used (or gone) and goes to the books on the day of the correction. If that
-- would take the average to 0 or below the average is dropped (the cost falls through to the usual price, a quote, unknown); the on-hand
-- share is still not cost used. Stamps already written are never changed.
create or replace function public.record_cost_correction(p_corr jsonb)
returns table (correction_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys text[];
  v_id uuid;
  v_mid uuid;
  v_cost numeric;
  v_at timestamptz;
  v_hash text;
  v_seen text;
  v_m public.stock_movements%rowtype;
  v_orig public.ledger_entries%rowtype;
  v_now bigint;
  v_item text;
  v_ledger uuid;
  v_bad boolean;
  v_stock public.inventory_items%rowtype;
  v_mv record;
  v_delta numeric;
  v_f numeric := 1;
  v_h_after numeric;
  v_h_before numeric;
  v_part numeric;
  v_used numeric;
  v_new_avg numeric;
begin
  if not public.is_owner() then
    raise exception 'only the owner may correct a cost' using errcode = '42501';
  end if;
  if p_corr is null or jsonb_typeof(p_corr) <> 'object' then
    raise exception 'a correction must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_corr) k;
  if v_keys is distinct from array['at', 'cost_cents', 'id', 'movement_id'] then -- rule:cor-keys
    raise exception 'a correction carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_corr -> 'id') <> 'string' or jsonb_typeof(p_corr -> 'movement_id') <> 'string'
     or jsonb_typeof(p_corr -> 'cost_cents') <> 'number' or jsonb_typeof(p_corr -> 'at') <> 'number' then
    raise exception 'a correction field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_corr ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or (p_corr ->> 'movement_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:cor-id
    raise exception 'the ids must be lowercase uuids' using errcode = '22023';
  end if;
  v_id := (p_corr ->> 'id')::uuid;
  v_mid := (p_corr ->> 'movement_id')::uuid;
  v_cost := (p_corr ->> 'cost_cents')::numeric;
  v_bad := v_cost <> trunc(v_cost) or v_cost not between 0 and 100000000;
  if v_bad then -- rule:cor-cost
    raise exception 'a cost is whole centavos from 0 to 1,000,000 pesos' using errcode = '22023';
  end if;
  if (p_corr ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_corr ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:cor-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('correction:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_corr::text, 'UTF8')), 'hex');
  select c.payload_hash into v_seen from public.stock_cost_corrections c where c.id = v_id;
  if found then
    if v_seen <> v_hash then -- rule:cor-replay-conflict
      raise exception 'that id was already used for a different correction' using errcode = '23505';
    end if;
    return query select v_id, true;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('receipt:' || v_mid::text, 0));
  select * into v_m from public.stock_movements m where m.id = v_mid;
  if not found then -- rule:cor-movement-missing
    raise exception 'no such delivery' using errcode = 'P0002';
  end if;
  if v_m.kind <> 'receipt' or v_m.ledger_id is null then -- rule:cor-not-costed
    raise exception 'only a delivery that was costed can be corrected' using errcode = '22023';
  end if;
  v_now := public.receipt_cost(v_mid);
  if v_now = v_cost::bigint then -- rule:cor-no-change
    raise exception 'that is already what it cost' using errcode = '22023';
  end if;
  -- B3a: the item's lock, after the correction's and the delivery's (a use or a delivery of this item waits here).
  perform pg_advisory_xact_lock(hashtextextended('stock_item:' || v_m.item_id, 0));
  select * into v_stock from public.inventory_items i where i.id = v_m.item_id for update;
  v_delta := v_cost::bigint - v_now;
  v_h_after := v_stock.on_hand;
  for v_mv in select m.kind, m.qty_delta from public.stock_movements m
               where m.item_id = v_m.item_id and m.seq > v_m.seq order by m.seq desc loop
    v_h_before := v_h_after - v_mv.qty_delta;
    if v_mv.qty_delta < 0 then
      if v_h_before > 0 then
        v_f := least(1, greatest(0, v_f * v_h_after / v_h_before));
      else
        v_f := 0;
      end if;
    end if;
    v_h_after := v_h_before;
  end loop;
  v_part := round(v_delta * v_f);
  v_used := v_delta - v_part;
  if v_stock.on_hand > 0 and v_stock.avg_cost is not null then
    v_new_avg := v_stock.avg_cost + v_part / v_stock.on_hand;
    if v_new_avg > 0 then
      update public.inventory_items i set avg_cost = v_new_avg where i.id = v_stock.id;
    else
      update public.inventory_items i set avg_cost = null where i.id = v_stock.id;
    end if;
  else
    v_used := v_delta;
  end if;
  select * into v_orig from public.ledger_entries l where l.id = v_m.ledger_id;
  select i.name into v_item from public.inventory_items i where i.id = v_m.item_id;
  insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
  values ('adjustment', v_orig.category, 'Correction: ' || v_item || ' cost ' || v_now || ' -> ' || v_cost::bigint || ' centavos',
          v_now - v_cost::bigint, v_at, auth.uid())
  returning id into v_ledger;
  insert into public.stock_cost_corrections (id, movement_id, cost_cents, ledger_id, at, payload_hash, created_by, used_cents)
  values (v_id, v_mid, v_cost::bigint, v_ledger, v_at, v_hash, auth.uid(), v_used::bigint);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'books.cost_correction', 'stock_cost_corrections', v_id::text,
    jsonb_build_object('movement_id', v_mid, 'was', v_now, 'now', v_cost, 'used_cents', v_used));
  return query select v_id, false;
end;
$$;
revoke execute on function public.record_cost_correction(jsonb) from public, anon, authenticated;
grant execute on function public.record_cost_correction(jsonb) to authenticated;

/**
 * The owner's books for a period (from inclusive, to exclusive): the cost basis, every line (kind revenue, refund, expense or draw; `amount_cents`
 * is positive except a correcting expense, which is negative when it lowers a cost; `at` in epoch milliseconds; `short_qty` the part of a use that
 * stock could not cover, costed with the rest), what has no cost (`uncosted`, never a zero line: the movements of stock used or wasted with no
 * cost, and each production line that could not be taken at all, with its why; an unknown cost is never reported as nothing) and the
 * delivery receipts of the last 90 days that can be corrected. Revenue is dated when the order was first paid. On the used basis stock is the cost
 * stamped on each use when it was written, plus each correction's share of stock already used.
 */
create or replace function public.get_books(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_basis text;
  v_lines jsonb;
  v_uncosted jsonb;
  v_receipts jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the books' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '400 days' then -- rule:books-period
    raise exception 'a period is a from before a to, at most 400 days' using errcode = '22023';
  end if;
  select b.cost_basis into v_basis from public.books_settings b where b.id;
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
      union all
      select 'l:' || l.id::text, 'expense', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind in ('cost', 'adjustment') and l.category <> 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
         and (v_basis = 'bought'
              or (not exists (select 1 from public.stock_movements m where m.ledger_id = l.id)
                  and not exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id)))
      union all
      select 'l:' || l.id::text, 'draw', l.category, l.memo, -l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
       where l.kind = 'adjustment' and l.category = 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
      union all
      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use' then 'Used: ' else 'Waste: ' end) || i.name,
             round((-m.qty_delta + m.short_qty) * m.unit_cost)::bigint, m.at, m.short_qty
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where v_basis = 'used' and m.kind in ('use', 'waste') and m.unit_cost is not null and m.at >= p_from and m.at < p_to
         and m.short_qty - m.qty_delta <> 0
      union all
      select 'c:' || c.id::text, 'expense', i.category, coalesce(l.memo, 'Correction: ' || i.name), c.used_cents, c.at, 0
        from public.stock_cost_corrections c
        join public.stock_movements r on r.id = c.movement_id
        join public.inventory_items i on i.id = r.item_id
        left join public.ledger_entries l on l.id = c.ledger_id
       where v_basis = 'used' and c.used_cents <> 0 and c.at >= p_from and c.at < p_to
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'kind', u.kind, 'item', u.item, 'qty', u.qty, 'unit', u.unit,
           'at', (extract(epoch from u.at) * 1000)::bigint)
           || case when u.why is not null then jsonb_build_object('why', u.why) else '{}'::jsonb end order by u.at desc, u.id), '[]'::jsonb)
    into v_uncosted
    from (
      select 'm:' || m.id::text as id, m.kind as kind, i.name as item, m.short_qty - m.qty_delta as qty, i.unit as unit, m.at as at, null::text as why
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where m.kind in ('use', 'waste') and m.unit_cost is null and v_basis = 'used' and m.at >= p_from and m.at < p_to
         and m.short_qty - m.qty_delta <> 0
      union all
      select 'p:' || r.id::text || ':' || (e.ord - 1)::text, 'use', e.value ->> 'name', (e.value ->> 'by')::numeric, e.value ->> 'unit', r.at, e.value ->> 'why'
        from public.production_records r
        cross join lateral jsonb_array_elements(r.short) with ordinality e(value, ord)
       where v_basis = 'used' and r.kind in ('dough', 'batch') and (e.value ? 'why') and r.at >= p_from and r.at < p_to
    ) u;
  select coalesce(jsonb_agg(jsonb_build_object('movement_id', r.id, 'item', i.name, 'qty', r.qty_delta,
           'cost_cents', public.receipt_cost(r.id), 'supplier', r.supplier, 'at', (extract(epoch from r.at) * 1000)::bigint)
           order by r.at desc), '[]'::jsonb)
    into v_receipts
    from public.stock_movements r join public.inventory_items i on i.id = r.item_id
   where r.kind = 'receipt' and r.ledger_id is not null and r.at >= now() - interval '90 days';
  return jsonb_build_object('basis', v_basis, 'lines', v_lines, 'uncosted', v_uncosted, 'receipts', v_receipts);
end;
$$;
revoke execute on function public.get_books(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_books(timestamptz, timestamptz) to authenticated;

-- The price of one unit of an item at a moment is no longer looked up when the books are read: it is the stamp on the use.
drop function public.unit_price_at(text, timestamptz);

/**
 * Records her usual price and pack for a stock item, from a date. Append-only: an edit is a new dated row, and the latest date (then
 * the latest row) is her usual price. The body is exactly: id (a uuid the browser mints), item_id, price_cents (whole centavos from 1
 * to 1,000,000 pesos for the whole pack), pack_size (in the item's unit, above 0, at most 3 decimals), as_of (YYYY-MM-DD, not after
 * today in the shop's calendar). Returns the row's id and whether this id was already recorded (an identical retry is answered; a
 * different body under the same id is refused, 23505).
 */
create or replace function public.save_item_price(p_price jsonb)
returns table (price_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys  text[];
  v_id    uuid;
  v_item  text;
  v_cents numeric;
  v_pack  numeric;
  v_date  date;
  v_hash  text;
  v_seen  text;
  v_bad   boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the usual prices' using errcode = '42501';
  end if;
  if p_price is null or jsonb_typeof(p_price) <> 'object' then
    raise exception 'a price must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_price) k;
  if v_keys is distinct from array['as_of', 'id', 'item_id', 'pack_size', 'price_cents'] then -- rule:itemprice-keys
    raise exception 'a price carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_price -> 'id') <> 'string' or jsonb_typeof(p_price -> 'item_id') <> 'string'
     or jsonb_typeof(p_price -> 'price_cents') <> 'number' or jsonb_typeof(p_price -> 'pack_size') <> 'number'
     or jsonb_typeof(p_price -> 'as_of') <> 'string' then
    raise exception 'a price field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_price ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:itemprice-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_price ->> 'id')::uuid;
  v_item := p_price ->> 'item_id';
  v_cents := (p_price ->> 'price_cents')::numeric;
  v_bad := v_cents <> trunc(v_cents) or v_cents not between 1 and 100000000;
  if v_bad then -- rule:itemprice-cents
    raise exception 'a price is whole centavos from 1 to 1,000,000 pesos' using errcode = '22023';
  end if;
  v_pack := (p_price ->> 'pack_size')::numeric;
  v_bad := v_pack <> round(v_pack, 3) or v_pack not between 0.001 and 999999999;
  if v_bad then -- rule:itemprice-pack
    raise exception 'a pack size is above 0 and at most 999,999,999 with at most 3 decimals' using errcode = '22023';
  end if;
  v_bad := (p_price ->> 'as_of') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
  if not v_bad then
    begin
      v_date := (p_price ->> 'as_of')::date;
      v_bad := to_char(v_date, 'YYYY-MM-DD') <> (p_price ->> 'as_of');
    exception when others then
      v_bad := true;
    end;
  end if;
  if v_bad then -- rule:itemprice-date
    raise exception 'the date is a real day written YYYY-MM-DD' using errcode = '22023';
  end if;
  if v_date > (select c.today from public.business_clock() c) then -- rule:itemprice-future
    raise exception 'the date is in the future' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('item_price:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_price::text, 'UTF8')), 'hex');
  select p.payload_hash into v_seen from public.item_prices p where p.id = v_id;
  if found then
    if v_seen <> v_hash then -- rule:itemprice-replay-conflict
      raise exception 'that id was already used for a different price' using errcode = '23505';
    end if;
    return query select v_id, true;
    return;
  end if;
  if not exists (select 1 from public.inventory_items i where i.id = v_item) then -- rule:itemprice-item-missing
    raise exception 'no such item' using errcode = 'P0002';
  end if;
  insert into public.item_prices (id, item_id, price_cents, pack_size, as_of, payload_hash, created_by)
  values (v_id, v_item, v_cents::bigint, v_pack, v_date, v_hash, auth.uid());
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'items.price', 'item_prices', v_id::text,
    jsonb_build_object('item_id', v_item, 'price_cents', v_cents, 'pack_size', v_pack, 'as_of', v_date));
  return query select v_id, false;
end;
$$;
revoke execute on function public.save_item_price(jsonb) from public, anon, authenticated;
grant execute on function public.save_item_price(jsonb) to authenticated;

/**
 * What every stock item costs now: the cost per unit and where it came from (average, usual, supplier, or null when none is known),
 * the average, her current usual price, and the cheapest supplier quote per unit. Unit costs are rounded to 6 decimals.
 */
create or replace function public.get_item_costs()
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
    raise exception 'only the owner may read item costs' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', i.id, 'name', i.name, 'unit', i.unit, 'active', i.active, 'on_hand', i.on_hand,
      'unit_cost', round(c.unit_cost, 6), 'source', c.source, 'avg_cost', round(i.avg_cost, 6),
      'usual', (select jsonb_build_object('id', p.id, 'price_cents', p.price_cents, 'pack_size', p.pack_size, 'as_of', p.as_of)
                  from public.item_prices p where p.item_id = i.id order by p.as_of desc, p.received_at desc, p.id desc limit 1),
      'quote', (select jsonb_build_object('price_id', q.id, 'supplier_id', q.supplier_id, 'price_cents', q.price_cents, 'pack_size', q.pack_size)
                  from public.supplier_prices q join public.suppliers s on s.id = q.supplier_id
                 where q.item_id = i.id and q.active and s.active and q.pack_size is not null and q.price_cents > 0
                 order by q.price_cents::numeric / q.pack_size, q.price_cents, q.id limit 1)
    ) order by i.category, lower(i.name), i.id), '[]'::jsonb)
    into v_out
    from public.inventory_items i left join lateral public.item_unit_cost(i.id) c on true;
  return v_out;
end;
$$;
revoke execute on function public.get_item_costs() from public, anon, authenticated;
grant execute on function public.get_item_costs() to authenticated;

/**
 * What every recipe costs per batch and per cookie, line by line. A line is costed when it names a stock item measured in the line's
 * unit and that item has a cost; a line that is not (why: not a stock item, unit differs, no cost) is listed in `missing` and is not in
 * the total (null when no line has a cost, never 0). `complete` is true when there is at least one line and none is missing. Unit costs are
 * rounded to 6 decimals, amounts to 4.
 */
create or replace function public.get_recipe_costs()
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
    raise exception 'only the owner may read recipe costs' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', r.product_id, 'version', r.version, 'yield', r.yield_count,
      'batch_cents', round(t.batch, 4), 'per_cookie_cents', round(t.batch / r.yield_count, 4),
      'complete', t.n > 0 and t.miss = 0, 'missing', t.missing, 'lines', t.lines) order by r.product_id), '[]'::jsonb)
    into v_out
    from public.recipes r
    cross join lateral (
      select count(*) as n, count(*) filter (where l.why is not null) as miss, sum(l.cents) as batch,
             coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'why', l.why) order by l.position, l.id) filter (where l.why is not null), '[]'::jsonb) as missing,
             coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'item_id', l.item_id, 'qty', l.qty, 'unit', l.unit,
                                                   'unit_cost', round(l.uc, 6), 'source', l.src, 'cents', round(l.cents, 4))
                                order by l.position, l.id), '[]'::jsonb) as lines
        from (select i.id, i.position, i.item_name as name, i.item_id, i.qty, i.unit, c.unit_cost as uc, c.source as src,
                     i.qty * c.unit_cost as cents,
                     case when i.item_id is null then 'not a stock item'
                          when it.unit <> i.unit then 'unit differs'
                          when c.unit_cost is null then 'no cost' end as why
                from public.recipe_ingredients i
                left join public.inventory_items it on it.id = i.item_id
                left join lateral public.item_unit_cost(i.item_id) c on it.id is not null and it.unit = i.unit
               where i.product_id = r.product_id) l
    ) t;
  return v_out;
end;
$$;
revoke execute on function public.get_recipe_costs() from public, anon, authenticated;
grant execute on function public.get_recipe_costs() to authenticated;
