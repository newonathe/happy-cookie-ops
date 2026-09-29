-- C1 (docs/state/finish-plan.md slice C1): the stock ledger. The quantity of an item is the sum of its movements.
--
-- Until now `inventory_items.on_hand` was written by nothing and the ported receive, waste, count and adjust actions changed only
-- the screen. Now every change is a movement written by one owner-only RPC:
--
--   record_stock_movement()   opening (the first quantity), receipt (with its cost), count (the total counted; the variance is
--                             worked out from what the database held), waste (a reason; never more than is there), adjust
--                             (a signed correction with a reason). Idempotent on the movement's client id.
--   get_last_paid()           the latest receipt with a cost for each item (what the cost per unit is worked out from)
--
-- A receipt with a cost also writes the cost to the books (`ledger_entries`, category = the item's kind), in the same
-- transaction, so a retry can never book it twice. Nothing is deleted or edited: a wrong movement is answered by another one.
-- Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it (as in B1, D4, A3 and A4).

create table public.stock_movements (
  id uuid primary key,
  item_id text not null references public.inventory_items (id),
  kind text not null check (kind in ('opening', 'receipt', 'count', 'waste', 'adjust')),
  qty_delta numeric(12, 3) not null,
  counted numeric(12, 3),
  cost_cents bigint check (cost_cents is null or cost_cents >= 0),
  supplier text not null default '' check (length(supplier) <= 80),
  reason text not null default '' check (length(reason) <= 80),
  at timestamptz not null,
  ledger_id uuid references public.ledger_entries (id) on delete set null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete set null,
  received_at timestamptz not null default now()
);
create index stock_movements_item_idx on public.stock_movements (item_id, at);
alter table public.stock_movements enable row level security;
revoke all on table public.stock_movements from public, anon, authenticated;

create or replace function public.get_last_paid()
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
    raise exception 'only the owner may read what was paid' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'item_name', q.name, 'cost_cents', q.cost_cents, 'qty', q.qty, 'supplier', q.supplier,
      'at', (extract(epoch from q.at) * 1000)::bigint) order by q.name), '[]'::jsonb)
    into v_out
    from (select distinct on (i.id) i.name, m.cost_cents, m.qty_delta as qty, m.supplier, m.at
            from public.stock_movements m join public.inventory_items i on i.id = m.item_id
           where m.kind = 'receipt' and m.cost_cents > 0 and m.qty_delta > 0
           order by i.id, m.at desc, m.received_at desc) q;
  return v_out;
end;
$$;
revoke execute on function public.get_last_paid() from public, anon, authenticated;
grant execute on function public.get_last_paid() to authenticated;

/**
 * Records one movement. The body is exactly: id (a uuid the browser mints), item_id, kind, qty, cost_cents (a whole number of
 * centavos for a receipt, else null), supplier, reason, at (epoch milliseconds). Returns the item's new quantity and whether
 * this id had already been recorded (an identical retry is answered; a different body under the same id is refused, 23505).
 */
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
    v_bad := exists (select 1 from public.stock_movements m where m.item_id = v_item_id);
    if v_bad then -- rule:mv-opening-first
      raise exception 'the opening quantity is the first movement of an item' using errcode = '22023';
    end if;
    v_delta := v_qty;
  elsif v_kind = 'count' then
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
  insert into public.stock_movements (id, item_id, kind, qty_delta, counted, cost_cents, supplier, reason, at, ledger_id,
                                      payload_hash, created_by)
  values (v_id, v_item_id, v_kind, v_delta, case when v_kind = 'count' then v_qty end, v_cost::bigint, v_supplier, v_reason,
          v_at, v_ledger, v_hash, auth.uid());
  update public.inventory_items as i
     set on_hand = i.on_hand + v_delta,
         last_counted = case when v_kind in ('count', 'opening') then v_at else i.last_counted end
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
