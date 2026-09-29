-- B3 (finish-plan slice B3), database half: the owner's side of an order. Customers place orders
-- through place_order (20260101003500); nothing let the owner read or move one. Everything here
-- is owner only (orders RLS is owner only since 20260101002100; helper access to pack and collect
-- is an open decision, so a helper is refused).
--
--   get_staff_orders()                      the owner's list: open orders plus 60 days of history
--   staff_confirm_payment(id, at, force)    the paid tick: Payment review -> Confirmed, paid_cents = total
--   staff_reject_payment(id, at)            Payment review -> Cancelled
--   staff_reopen_order(id, at)              Cancelled (never refunded) -> Payment review
--   staff_set_status(id, to, at)            baking, packed, collected, undo collect, no-show
--   staff_flag_item(id, product, on, at)    an unavailable flavour on one order
--   staff_swap_item(id, from, to, cid, at)  the agreed swap, re-priced from today's menu
--   staff_refund(id, ref, at)               Cancelled + refunded (the money side is E1's ledger)
--   staff_settle_balance(id, at)            paid_cents = total_cents
--
-- Every function: SECURITY DEFINER, search_path '', in-function is_owner(), explicit grants.
-- Idempotent: "already in the target state" returns the current row (replayed = true) BEFORE the
-- stale-stamp check, so a retry after a lost reply never fails with P0002. Stale stamp: P0002
-- (compared to the millisecond, as save_payment_method does). Unknown order: 02000. An edge the
-- state machine does not allow: 55000. Each business rule is one `if ... then -- rule:<name>` line so
-- scripts/test-db-security.py can neutralise exactly that line and prove the refusal case fails.
--
-- The table UPDATE grants the explicit-authority migration left on orders/order_items are revoked
-- from the API roles: with RLS "is_owner()" they let the owner bypass every rule below with one
-- .update() call. The definer functions write as their owner.

alter table public.orders
  add column paid_cents bigint check (paid_cents is null or paid_cents >= 0),
  add column refund_ref text check (refund_ref is null or length(refund_ref) <= 60);
alter table public.order_items
  add column unavailable boolean not null default false;

revoke update on table public.orders, public.order_items from public, anon, authenticated;

create table public.order_swaps (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  order_id text not null references public.orders on delete cascade,
  from_product text not null references public.products,
  to_product text not null references public.products,
  qty integer not null check (qty > 0),
  price_delta_cents bigint not null,
  swapped_at timestamptz not null default now()
);
create index order_swaps_order_idx on public.order_swaps (order_id);
alter table public.order_swaps enable row level security;
revoke all on table public.order_swaps from public, anon, authenticated;

-- ------------------------------------------------------------------ the owner's list

/**
 * Open orders and the last 60 days, newest first, at most 500. `holds` says whether the order still
 * holds slots (the D1 predicate), so the screen can tell a lapsed unpaid order from a live one.
 * `status_token` is the customer's status-link credential: the owner sends the link by hand.
 */
create or replace function public.get_staff_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hold integer;
  v_out jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the orders' using errcode = '42501';
  end if;
  select r.unpaid_hold_hours into v_hold from public.order_rules r where r.id;
  select coalesce(jsonb_agg(q.x order by q.placed desc), '[]'::jsonb) into v_out
    from (
      select o.placed_at as placed,
             jsonb_build_object(
               'id', o.id, 'name', o.customer_name, 'phone', o.phone, 'ig', o.ig,
               'state', o.state, 'pay_state', o.pay_state, 'pay_method', o.pay_method, 'pay_ref', o.pay_ref,
               'total_cents', o.total_cents, 'paid_cents', o.paid_cents, 'refund_ref', o.refund_ref,
               'notes', o.notes, 'pickup_date', o.pickup_date, 'pickup_window', o.pickup_window,
               'placed_at', o.placed_at, 'collected_at', o.collected_at, 'updated_at', o.updated_at,
               'status_token', o.status_token,
               'holds', public.order_holds_capacity(o.state, o.pay_state, o.placed_at, now(), coalesce(v_hold, 24)),
               'items', (select coalesce(jsonb_agg(jsonb_build_object(
                                'product_id', i.product_id, 'qty', i.qty,
                                'unit_price_cents', i.unit_price_cents, 'unavailable', i.unavailable)
                              order by i.product_id, i.unit_price_cents), '[]'::jsonb)
                           from public.order_items i where i.order_id = o.id),
               'swaps', (select coalesce(jsonb_agg(jsonb_build_object(
                                'from', s.from_product, 'to', s.to_product, 'qty', s.qty,
                                'delta_cents', s.price_delta_cents, 'at', s.swapped_at)
                              order by s.swapped_at), '[]'::jsonb)
                           from public.order_swaps s where s.order_id = o.id)
             ) as x
        from public.orders o
       where o.state in ('Payment review', 'Confirmed', 'Preparing', 'Ready')
          or o.placed_at > now() - interval '60 days'
       order by o.placed_at desc
       limit 500
    ) q;
  return v_out;
end;
$$;
revoke execute on function public.get_staff_orders() from public, anon, authenticated;
grant execute on function public.get_staff_orders() to authenticated;

-- ------------------------------------------------------------------ the paid tick

create or replace function public.staff_confirm_payment(
  p_order_id text,
  p_expected_updated_at timestamptz,
  p_force boolean default false
)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_rules public.order_rules;
  v_capacity integer;
  v_committed numeric;
  v_units numeric;
  v_week date;
  v_now timestamptz := now();
begin
  if not public.is_owner() then
    raise exception 'only the owner may mark an order paid' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  if v_o.pay_state = 'confirmed' then -- rule:confirm-replay
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if v_o.state <> 'Payment review' then -- rule:confirm-state
    raise exception 'only an order awaiting payment can be marked paid' using errcode = '55000';
  end if;

  select * into v_rules from public.order_rules r where r.id;
  if not public.order_holds_capacity(v_o.state, v_o.pay_state, v_o.placed_at, v_now, v_rules.unpaid_hold_hours)
     and not coalesce(p_force, false) and v_o.pickup_date is not null then
    -- The unpaid hold lapsed, so the order no longer holds its slots: paying it takes them again.
    v_week := date_trunc('week', v_o.pickup_date::timestamp)::date;
    perform pg_advisory_xact_lock(hashtextextended('order:week:' || v_week::text, 0));
    select max(se.int_value) filter (where se.key = 'capacity') into v_capacity from public.settings_effective() se;
    select coalesce(sum(oi.qty * oi.capacity_weight), 0) into v_committed
      from public.orders o join public.order_items oi on oi.order_id = o.id
     where o.pickup_date >= v_week and o.pickup_date < v_week + 7 and o.id <> v_o.id
       and public.order_holds_capacity(o.state, o.pay_state, o.placed_at, v_now, v_rules.unpaid_hold_hours);
    select coalesce(sum(oi.qty * oi.capacity_weight), 0) into v_units
      from public.order_items oi where oi.order_id = v_o.id;
    if not public.capacity_allows(v_capacity, v_committed::integer, v_units::integer) then -- rule:confirm-capacity
      raise exception 'not enough room left in that pickup week' using errcode = 'ZC002',
        detail = greatest(0, v_capacity - v_committed)::text;
    end if;
  end if;

  update public.orders o
     set state = 'Confirmed',
         pay_state = 'confirmed', paid_cents = o.total_cents
   where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_confirm_payment(text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.staff_confirm_payment(text, timestamptz, boolean) to authenticated;

-- ------------------------------------------------------------------ reject and reopen

create or replace function public.staff_reject_payment(p_order_id text, p_expected_updated_at timestamptz)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  if not public.is_owner() then
    raise exception 'only the owner may reject a payment' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  if v_o.state = 'Cancelled' then -- rule:reject-replay
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if v_o.state <> 'Payment review' then -- rule:reject-state
    raise exception 'only an order awaiting payment can be rejected' using errcode = '55000';
  end if;
  update public.orders o set state = 'Cancelled', cancelled_at = now() where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_reject_payment(text, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_reject_payment(text, timestamptz) to authenticated;

create or replace function public.staff_reopen_order(p_order_id text, p_expected_updated_at timestamptz)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  if not public.is_owner() then
    raise exception 'only the owner may reopen an order' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  if v_o.state = 'Payment review' then -- rule:reopen-replay
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if v_o.state <> 'Cancelled' or v_o.pay_state = 'refunded' then -- rule:reopen-state
    raise exception 'only a cancelled, unrefunded order can be reopened' using errcode = '55000';
  end if;
  update public.orders o set state = 'Payment review', cancelled_at = null where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_reopen_order(text, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_reopen_order(text, timestamptz) to authenticated;

-- ------------------------------------------------------------------ baking, packing, collecting

/**
 * The baking / packed / collected edges. Only a paid order moves (Payment review has its own
 * functions): Confirmed -> Preparing, Confirmed|Preparing|Completed -> Ready (Completed is "undo
 * collected"), Ready -> Completed | No-show. A flavour flagged unavailable blocks packing until it
 * is swapped or cleared, as the ported screen's "settle it before packing" does.
 */
create or replace function public.staff_set_status(
  p_order_id text,
  p_to public.order_state,
  p_expected_updated_at timestamptz
)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change an order status' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  if v_o.state = p_to then -- rule:status-replay
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if not ((p_to = 'Preparing' and v_o.state = 'Confirmed') or (p_to = 'Ready' and v_o.state in ('Confirmed', 'Preparing', 'Completed')) or (p_to in ('Completed', 'No-show') and v_o.state = 'Ready')) then -- rule:status-transition
    raise exception 'that status change is not allowed from %', v_o.state using errcode = '55000';
  end if;
  if p_to = 'Ready' and v_o.state <> 'Completed' and exists (select 1 from public.order_items i where i.order_id = v_o.id and i.unavailable) then -- rule:pack-flagged
    raise exception 'settle the unavailable flavour before packing' using errcode = '55000';
  end if;
  update public.orders o
     set state = p_to,
         collected_at = case when p_to = 'Completed' then now() when p_to = 'Ready' then null else o.collected_at end
   where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_set_status(text, public.order_state, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_set_status(text, public.order_state, timestamptz) to authenticated;

-- ------------------------------------------------------------------ an unavailable flavour, and its swap

create or replace function public.staff_flag_item(
  p_order_id text,
  p_product_id text,
  p_flagged boolean,
  p_expected_updated_at timestamptz
)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_now boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may flag a flavour' using errcode = '42501';
  end if;
  if p_flagged is null then
    raise exception 'flagged must be true or false' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  select bool_or(i.unavailable) into v_now from public.order_items i
   where i.order_id = v_o.id and i.product_id = p_product_id;
  if v_now is null then -- rule:flag-item
    raise exception 'that flavour is not on the order' using errcode = '55000';
  end if;
  if v_now = p_flagged then -- rule:flag-replay
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if v_o.state not in ('Payment review', 'Confirmed', 'Preparing') then -- rule:flag-state
    raise exception 'a packed or finished order cannot be flagged' using errcode = '55000';
  end if;
  update public.order_items i set unavailable = p_flagged where i.order_id = v_o.id and i.product_id = p_product_id;
  update public.orders o set updated_at = now() where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_flag_item(text, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_flag_item(text, text, boolean, timestamptz) to authenticated;

/**
 * Swaps every unit of one flavour on an order for another the customer agreed to. The new line is
 * priced from today's menu, the total and capacity weights follow, and the swap is written down
 * (`order_swaps`, unique on the client id, so a resend is a replay). paid_cents is untouched: a
 * dearer swap on a paid order shows as a balance (total - paid), a cheaper one as money owed back.
 */
create or replace function public.staff_swap_item(
  p_order_id text,
  p_from_product text,
  p_to_product text,
  p_client_id uuid,
  p_expected_updated_at timestamptz
)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
  v_prior public.order_swaps;
  v_from public.order_items;
  v_to public.products;
  v_rules public.order_rules;
  v_capacity integer;
  v_committed numeric;
  v_units numeric;
  v_week date;
  v_old_total bigint;
  v_new_total bigint;
  v_now timestamptz := now();
begin
  if not public.is_owner() then
    raise exception 'only the owner may swap a flavour' using errcode = '42501';
  end if;
  if p_client_id is null or p_from_product is null or p_to_product is null then
    raise exception 'swap needs a client id and two flavours' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  select * into v_prior from public.order_swaps s where s.client_id = p_client_id;
  if found then
    if v_prior.order_id <> v_o.id or v_prior.from_product <> p_from_product or v_prior.to_product <> p_to_product then -- rule:swap-client-id-reuse
      raise exception 'swap id was already used for a different swap' using errcode = '23505';
    end if;
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if v_o.state not in ('Payment review', 'Confirmed', 'Preparing') then -- rule:swap-state
    raise exception 'a packed or finished order cannot be swapped' using errcode = '55000';
  end if;
  if p_from_product = p_to_product then -- rule:swap-same
    raise exception 'pick a different flavour to swap in' using errcode = '22023';
  end if;
  select * into v_from from public.order_items i
   where i.order_id = v_o.id and i.product_id = p_from_product order by i.unit_price_cents limit 1;
  if not found then -- rule:swap-item
    raise exception 'that flavour is not on the order' using errcode = '55000';
  end if;
  select * into v_to from public.products p where p.id = p_to_product and p.published and p.active for share;
  if not found then -- rule:swap-menu
    raise exception 'that flavour is not on the menu' using errcode = '22023';
  end if;
  if exists (select 1 from public.order_items i where i.order_id = v_o.id and i.product_id = p_to_product and i.unit_price_cents <> v_to.price_cents) then -- rule:swap-price-clash
    raise exception 'that flavour is already on the order at another price' using errcode = '55000';
  end if;

  if v_from.qty * v_to.capacity_weight > v_from.qty * v_from.capacity_weight and v_o.pickup_date is not null
     and public.order_holds_capacity(v_o.state, v_o.pay_state, v_o.placed_at, v_now,
           (select r.unpaid_hold_hours from public.order_rules r where r.id)) then
    -- A heavier flavour takes more of the pickup week: the same rule place_order applies.
    select * into v_rules from public.order_rules r where r.id;
    v_week := date_trunc('week', v_o.pickup_date::timestamp)::date;
    perform pg_advisory_xact_lock(hashtextextended('order:week:' || v_week::text, 0));
    select max(se.int_value) filter (where se.key = 'capacity') into v_capacity from public.settings_effective() se;
    select coalesce(sum(oi.qty * oi.capacity_weight), 0) into v_committed
      from public.orders o join public.order_items oi on oi.order_id = o.id
     where o.pickup_date >= v_week and o.pickup_date < v_week + 7 and o.id <> v_o.id
       and public.order_holds_capacity(o.state, o.pay_state, o.placed_at, v_now, v_rules.unpaid_hold_hours);
    select coalesce(sum(oi.qty * oi.capacity_weight), 0) + v_from.qty * (v_to.capacity_weight - v_from.capacity_weight)
      into v_units from public.order_items oi where oi.order_id = v_o.id;
    if not public.capacity_allows(v_capacity, v_committed::integer, v_units::integer) then -- rule:swap-capacity
      raise exception 'not enough room left in that pickup week' using errcode = 'ZC002',
        detail = greatest(0, v_capacity - v_committed)::text;
    end if;
  end if;

  select coalesce(sum(i.qty * i.unit_price_cents), 0) into v_old_total from public.order_items i where i.order_id = v_o.id;
  -- Merge into an existing line of the new flavour (same price, checked above), else relabel the line.
  if exists (select 1 from public.order_items i where i.order_id = v_o.id and i.product_id = p_to_product) then
    update public.order_items i set qty = i.qty + v_from.qty
     where i.order_id = v_o.id and i.product_id = p_to_product;
    delete from public.order_items i where i.id = v_from.id;
  else
    update public.order_items i
       set product_id = p_to_product, unit_price_cents = v_to.price_cents,
           capacity_weight = v_to.capacity_weight, unavailable = false
     where i.id = v_from.id;
  end if;
  select coalesce(sum(i.qty * i.unit_price_cents), 0) into v_new_total from public.order_items i where i.order_id = v_o.id;
  insert into public.order_swaps (client_id, order_id, from_product, to_product, qty, price_delta_cents)
  values (p_client_id, v_o.id, p_from_product, p_to_product, v_from.qty, v_new_total - v_old_total);
  update public.orders o set total_cents = v_new_total where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_swap_item(text, text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_swap_item(text, text, text, uuid, timestamptz) to authenticated;

-- ------------------------------------------------------------------ money: refund and balance

create or replace function public.staff_refund(p_order_id text, p_ref text, p_expected_updated_at timestamptz)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record a refund' using errcode = '42501';
  end if;
  if p_ref is not null and length(p_ref) > 60 then
    raise exception 'the refund reference is at most 60 characters' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  if v_o.pay_state = 'refunded' then -- rule:refund-replay
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if v_o.pay_state <> 'confirmed' then -- rule:refund-paid
    raise exception 'only a paid order can be refunded' using errcode = '55000';
  end if;
  update public.orders o
     set state = 'Cancelled', pay_state = 'refunded', cancelled_at = now(),
         refund_ref = nullif(btrim(p_ref), '')
   where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_refund(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_refund(text, text, timestamptz) to authenticated;

create or replace function public.staff_settle_balance(p_order_id text, p_expected_updated_at timestamptz)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  if not public.is_owner() then
    raise exception 'only the owner may settle a balance' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  if v_o.pay_state = 'confirmed' and v_o.paid_cents = v_o.total_cents then -- rule:settle-replay
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if v_o.pay_state <> 'confirmed' then -- rule:settle-paid
    raise exception 'only a paid order has a balance to settle' using errcode = '55000';
  end if;
  update public.orders o set paid_cents = o.total_cents where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_settle_balance(text, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_settle_balance(text, timestamptz) to authenticated;
