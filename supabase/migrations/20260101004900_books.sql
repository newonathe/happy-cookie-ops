-- E1 (docs/state/finish-plan.md slice E1): the owner's books. Revenue, refunds, costs, expenses and what stock cost when it was used.
--
--   orders.paid_at / refunded_at   when an order was first paid and when it was refunded (stamped by a trigger, so the paid tick, the
--                                  settle and the refund RPCs need no change; existing rows are backfilled from updated_at)
--   record_expense()               owner only. A plain expense (wages, transport, advertising ...) in her category, idempotent on a client id
--   record_draw()                  owner only. Money the owner took out. It is not an expense: profit does not move (the books keep it apart)
--   record_cost_correction()       owner only. A wrong receipt cost is answered by a correcting entry; nothing is edited or deleted.
--                                  get_last_paid() (redefined) and the cost of stock used read the corrected cost
--   set_cost_basis()               owner only. 'bought' (each receipt is a cost the day it is bought) or 'used' (stock is a cost when it is used)
--   get_books(from, to)            owner only. Every line of the books in the period, the cost basis, and the receipts that can be corrected
--
-- Revenue is dated when the order was first paid (a default Cine can change; DP-04). Cost when used = the quantity used or wasted times the
-- price per unit of the latest costed receipt up to that moment (the earliest later receipt if none is earlier), corrected costs included.
-- Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it.

alter table public.orders add column paid_at timestamptz, add column refunded_at timestamptz;
-- The backfill is not a change to an order: the stamp trigger of updated_at is off while it runs.
alter table public.orders disable trigger orders_touch;
update public.orders set paid_at = updated_at where paid_cents is not null;
update public.orders set refunded_at = updated_at where pay_state = 'refunded';
alter table public.orders enable trigger orders_touch;

create or replace function public.orders_books_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.paid_cents is not null and old.paid_cents is null and new.paid_at is null then
    new.paid_at := now();
  end if;
  if new.pay_state = 'refunded' and old.pay_state is distinct from 'refunded' and new.refunded_at is null then
    new.refunded_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.orders_books_stamp() from public, anon, authenticated;
create trigger orders_books_stamp before update on public.orders for each row execute function public.orders_books_stamp();

alter table public.ledger_entries add column client_id uuid unique, add column payload_hash text;

create table public.books_settings (
  id boolean primary key default true check (id),
  cost_basis text not null default 'bought' check (cost_basis in ('bought', 'used')),
  updated_at timestamptz not null default now()
);
insert into public.books_settings (id) values (true);
alter table public.books_settings enable row level security;
revoke all on table public.books_settings from public, anon, authenticated;

create table public.stock_cost_corrections (
  id uuid primary key,
  movement_id uuid not null references public.stock_movements (id),
  cost_cents bigint not null check (cost_cents >= 0),
  ledger_id uuid references public.ledger_entries (id) on delete set null,
  at timestamptz not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references public.profiles (id) on delete set null,
  received_at timestamptz not null default now()
);
create index stock_cost_corrections_movement_idx on public.stock_cost_corrections (movement_id, at);
alter table public.stock_cost_corrections enable row level security;
revoke all on table public.stock_cost_corrections from public, anon, authenticated;

-- Internal: what a receipt cost after the latest correction (the latest as the database saved it, whatever time the phone sent).
create or replace function public.receipt_cost(p_movement uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.cost_cents from public.stock_cost_corrections c where c.movement_id = p_movement
                    order by c.received_at desc, c.id desc limit 1),
                  (select m.cost_cents from public.stock_movements m where m.id = p_movement));
$$;
revoke execute on function public.receipt_cost(uuid) from public, anon, authenticated;

-- Internal: the price of one unit of an item at a moment (centavos, unrounded): the latest costed receipt up to then; 0 before any (a later delivery
-- never reprices a period already reported).
create or replace function public.unit_price_at(p_item text, p_at timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.receipt_cost(r.id)::numeric / r.qty_delta from public.stock_movements r
      where r.item_id = p_item and r.kind = 'receipt' and r.cost_cents > 0 and r.qty_delta > 0 and r.at <= p_at
      order by r.at desc, r.received_at desc limit 1),
    0);
$$;
revoke execute on function public.unit_price_at(text, timestamptz) from public, anon, authenticated;

-- get_last_paid, as it was (20260101004600) but reading the corrected cost.
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
    from (select distinct on (i.id) i.name, public.receipt_cost(m.id) as cost_cents, m.qty_delta as qty, m.supplier, m.at
            from public.stock_movements m join public.inventory_items i on i.id = m.item_id
           where m.kind = 'receipt' and m.cost_cents > 0 and m.qty_delta > 0 and public.receipt_cost(m.id) > 0
           order by i.id, m.at desc, m.received_at desc) q;
  return v_out;
end;
$$;
revoke execute on function public.get_last_paid() from public, anon, authenticated;
grant execute on function public.get_last_paid() to authenticated;

/**
 * Records a plain expense. The body is exactly: id (a uuid the browser mints), category (1 to 60 characters), memo (up to 120),
 * amount_cents (whole centavos above 0, at most 1,000,000 pesos), at (epoch milliseconds). Returns the entry's id and whether this id
 * was already recorded (an identical retry is answered; a different body under the same id is refused, 23505).
 */
create or replace function public.record_expense(p_expense jsonb)
returns table (client_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys text[];
  v_id uuid;
  v_category text;
  v_memo text;
  v_amount numeric;
  v_at timestamptz;
  v_hash text;
  v_seen text;
  v_bad boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record an expense' using errcode = '42501';
  end if;
  if p_expense is null or jsonb_typeof(p_expense) <> 'object' then
    raise exception 'an expense must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_expense) k;
  if v_keys is distinct from array['amount_cents', 'at', 'category', 'id', 'memo'] then -- rule:exp-keys
    raise exception 'an expense carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_expense -> 'id') <> 'string' or jsonb_typeof(p_expense -> 'category') <> 'string'
     or jsonb_typeof(p_expense -> 'memo') <> 'string' or jsonb_typeof(p_expense -> 'amount_cents') <> 'number'
     or jsonb_typeof(p_expense -> 'at') <> 'number' then
    raise exception 'an expense field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_expense ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:exp-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_expense ->> 'id')::uuid;
  v_category := btrim(p_expense ->> 'category');
  v_memo := btrim(p_expense ->> 'memo');
  v_bad := length(v_category) not between 1 and 60 or length(v_memo) > 120 or (v_category || v_memo) ~ '[[:cntrl:]]';
  if v_bad then -- rule:exp-text
    raise exception 'a category is 1 to 60 characters and a memo at most 120' using errcode = '22023';
  end if;
  if lower(v_category) = 'owner draw' then -- rule:exp-reserved
    raise exception 'money the owner takes out is a draw, not an expense' using errcode = '22023';
  end if;
  v_amount := (p_expense ->> 'amount_cents')::numeric;
  v_bad := v_amount <> trunc(v_amount) or v_amount not between 1 and 100000000;
  if v_bad then -- rule:exp-amount
    raise exception 'an amount is whole centavos from 1 to 1,000,000 pesos' using errcode = '22023';
  end if;
  if (p_expense ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_expense ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:exp-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('expense:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_expense::text, 'UTF8')), 'hex');
  select l.payload_hash into v_seen from public.ledger_entries l where l.client_id = v_id;
  if found then
    if v_seen <> v_hash then -- rule:exp-replay-conflict
      raise exception 'that id was already used for a different expense' using errcode = '23505';
    end if;
    return query select v_id, true;
    return;
  end if;
  insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by, client_id, payload_hash)
  values ('cost', v_category, v_memo, -v_amount::bigint, v_at, auth.uid(), v_id, v_hash);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'books.expense', 'ledger_entries', v_id::text,
    jsonb_build_object('category', v_category, 'amount_cents', v_amount));
  return query select v_id, false;
end;
$$;
revoke execute on function public.record_expense(jsonb) from public, anon, authenticated;
grant execute on function public.record_expense(jsonb) to authenticated;

/**
 * Records money the owner took out. The body is exactly: id (a uuid the browser mints), memo (up to 120), amount_cents (whole centavos
 * above 0, at most 1,000,000 pesos), at (epoch milliseconds). It is kept in the books under 'Owner draw' and never counts as an
 * expense. Returns the entry's id and whether this id was already recorded.
 */
create or replace function public.record_draw(p_draw jsonb)
returns table (client_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys text[];
  v_id uuid;
  v_memo text;
  v_amount numeric;
  v_at timestamptz;
  v_hash text;
  v_seen text;
  v_bad boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record a draw' using errcode = '42501';
  end if;
  if p_draw is null or jsonb_typeof(p_draw) <> 'object' then
    raise exception 'a draw must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_draw) k;
  if v_keys is distinct from array['amount_cents', 'at', 'id', 'memo'] then -- rule:draw-keys
    raise exception 'a draw carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_draw -> 'id') <> 'string' or jsonb_typeof(p_draw -> 'memo') <> 'string'
     or jsonb_typeof(p_draw -> 'amount_cents') <> 'number' or jsonb_typeof(p_draw -> 'at') <> 'number' then
    raise exception 'a draw field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_draw ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:draw-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_draw ->> 'id')::uuid;
  v_memo := btrim(p_draw ->> 'memo');
  if length(v_memo) > 120 or v_memo ~ '[[:cntrl:]]' then
    raise exception 'a memo is at most 120 characters' using errcode = '22023';
  end if;
  v_amount := (p_draw ->> 'amount_cents')::numeric;
  v_bad := v_amount <> trunc(v_amount) or v_amount not between 1 and 100000000;
  if v_bad then -- rule:draw-amount
    raise exception 'an amount is whole centavos from 1 to 1,000,000 pesos' using errcode = '22023';
  end if;
  if (p_draw ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_draw ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:draw-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('expense:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_draw::text, 'UTF8')), 'hex');
  select l.payload_hash into v_seen from public.ledger_entries l where l.client_id = v_id;
  if found then
    if v_seen <> v_hash then -- rule:draw-replay-conflict
      raise exception 'that id was already used for a different draw' using errcode = '23505';
    end if;
    return query select v_id, true;
    return;
  end if;
  insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by, client_id, payload_hash)
  values ('adjustment', 'Owner draw', v_memo, -v_amount::bigint, v_at, auth.uid(), v_id, v_hash);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'books.draw', 'ledger_entries', v_id::text, jsonb_build_object('amount_cents', v_amount));
  return query select v_id, false;
end;
$$;
revoke execute on function public.record_draw(jsonb) from public, anon, authenticated;
grant execute on function public.record_draw(jsonb) to authenticated;

/**
 * Corrects what a delivery cost. The body is exactly: id (a uuid the browser mints), movement_id (the receipt), cost_cents (what it
 * really cost, whole centavos from 0 to 1,000,000 pesos), at (epoch milliseconds). The books get an adjusting entry for the difference
 * (positive when the cost was too high); the receipt itself is never edited. Returns the correction's id and whether it was already recorded.
 */
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
  select * into v_orig from public.ledger_entries l where l.id = v_m.ledger_id;
  select i.name into v_item from public.inventory_items i where i.id = v_m.item_id;
  insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
  values ('adjustment', v_orig.category, 'Correction: ' || v_item || ' cost ' || v_now || ' -> ' || v_cost::bigint || ' centavos',
          v_now - v_cost::bigint, v_at, auth.uid())
  returning id into v_ledger;
  insert into public.stock_cost_corrections (id, movement_id, cost_cents, ledger_id, at, payload_hash, created_by)
  values (v_id, v_mid, v_cost::bigint, v_ledger, v_at, v_hash, auth.uid());
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'books.cost_correction', 'stock_cost_corrections', v_id::text,
    jsonb_build_object('movement_id', v_mid, 'was', v_now, 'now', v_cost));
  return query select v_id, false;
end;
$$;
revoke execute on function public.record_cost_correction(jsonb) from public, anon, authenticated;
grant execute on function public.record_cost_correction(jsonb) to authenticated;

create or replace function public.set_cost_basis(p_basis text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may choose how stock is costed' using errcode = '42501';
  end if;
  if p_basis is null or p_basis not in ('bought', 'used') then -- rule:basis-value
    raise exception 'the cost basis is bought or used' using errcode = '22023';
  end if;
  update public.books_settings b set cost_basis = p_basis, updated_at = now() where b.id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'books.cost_basis', 'books_settings', 'cost_basis', jsonb_build_object('basis', p_basis));
  return p_basis;
end;
$$;
revoke execute on function public.set_cost_basis(text) from public, anon, authenticated;
grant execute on function public.set_cost_basis(text) to authenticated;

/**
 * The owner's books for a period (from inclusive, to exclusive): the cost basis, every line (kind revenue, refund, expense or draw; `amount_cents`
 * is positive except a correcting expense, which is negative when it lowers a cost; `at` in epoch milliseconds), and the delivery receipts
 * of the last 90 days that can be corrected. Revenue is dated when the order was first paid.
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
           'amount_cents', x.amount_cents, 'at', (extract(epoch from x.at) * 1000)::bigint) order by x.at desc, x.id), '[]'::jsonb)
    into v_lines
    from (
      select 'o:' || o.id as id, 'revenue' as kind, 'Orders' as cat, 'Order ' || o.id || ' · ' || o.customer_name as label,
             o.paid_cents as amount_cents, o.paid_at as at
        from public.orders o where o.paid_at >= p_from and o.paid_at < p_to and o.paid_cents > 0
      union all
      select 'r:' || o.id, 'refund', 'Refunds', 'Refund · order ' || o.id, o.paid_cents, o.refunded_at
        from public.orders o where o.refunded_at >= p_from and o.refunded_at < p_to and o.paid_cents > 0
      union all
      select 'l:' || l.id::text, 'revenue', l.category, l.memo, l.amount_cents, l.occurred_at
        from public.ledger_entries l where l.kind = 'sale' and l.occurred_at >= p_from and l.occurred_at < p_to
      union all
      select 'l:' || l.id::text, 'expense', l.category, l.memo, -l.amount_cents, l.occurred_at
        from public.ledger_entries l
       where l.kind in ('cost', 'adjustment') and l.category <> 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
         and (v_basis = 'bought'
              or (not exists (select 1 from public.stock_movements m where m.ledger_id = l.id)
                  and not exists (select 1 from public.stock_cost_corrections c where c.ledger_id = l.id)))
      union all
      select 'l:' || l.id::text, 'draw', l.category, l.memo, -l.amount_cents, l.occurred_at
        from public.ledger_entries l
       where l.kind = 'adjustment' and l.category = 'Owner draw' and l.occurred_at >= p_from and l.occurred_at < p_to
      union all
      select 'm:' || m.id::text, 'expense', i.category, (case m.kind when 'use' then 'Used: ' else 'Waste: ' end) || i.name,
             round(-m.qty_delta * public.unit_price_at(m.item_id, m.at))::bigint, m.at
        from public.stock_movements m join public.inventory_items i on i.id = m.item_id
       where v_basis = 'used' and m.kind in ('use', 'waste') and m.at >= p_from and m.at < p_to
    ) x;
  select coalesce(jsonb_agg(jsonb_build_object('movement_id', r.id, 'item', i.name, 'qty', r.qty_delta,
           'cost_cents', public.receipt_cost(r.id), 'supplier', r.supplier, 'at', (extract(epoch from r.at) * 1000)::bigint)
           order by r.at desc), '[]'::jsonb)
    into v_receipts
    from public.stock_movements r join public.inventory_items i on i.id = r.item_id
   where r.kind = 'receipt' and r.ledger_id is not null and r.at >= now() - interval '90 days';
  return jsonb_build_object('basis', v_basis, 'lines', v_lines, 'receipts', v_receipts);
end;
$$;
revoke execute on function public.get_books(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_books(timestamptz, timestamptz) to authenticated;
