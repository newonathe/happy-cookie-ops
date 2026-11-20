-- Café sale log, owner only. A café sale is a sale Cine has already made in bulk to a café: she logs it afterwards. (Migration 94's
-- `create_cafe_order` started café orders as unpaid orders waiting for a pickup; the owner's decision, 20 November 2026, is that café
-- sales are manual, finished, paid sale logs that never appear on a customer's side.) This migration:
--
-- 1. drops `create_cafe_order` (nothing else calls it; an old app then shows its existing "needs the next database update" note).
-- 2. adds `record_cafe_sale(jsonb)`: the sale is written in the state a confirmed, picked-up order ends in (state Completed, pay_state
--    confirmed, paid_cents = total), dated on the sale date, so the books count the money on that day exactly as for any paid order.
--    `orders.channel` already exists ('form' by default, 'shop' from the order form, 'cafe' from migration 94), so there is no new
--    column and nothing to backfill: every café row already says 'cafe'.
--      * capacity: unchanged from migration 94. With the setting "Café orders count toward the weekly limit" ON each line takes the
--        product's slots in the sale date's week and the sale is refused (ZC002) when that week is full; OFF stores zero slots.
--      * stock: with takeStock true the sale is packed through the existing `record_pack` in the same transaction, so packaging comes off
--        stock and the cookies off the latest drop exactly as when she packs an order. It is stamped when the sale is logged, not on
--        the sale date. A shortfall (stock that ran out, a missing packaging rule) is returned, never refused; only the Bazaar guard
--        (ZB001, cookies already sent to a stall) refuses the sale.
--      * payMethod is "Cash" or the label of an active payment method.
--    Idempotent on `clientId`.
-- 3. adds `get_cafe_sales()`: the log, for the Café sales page.
-- 4. keeps café rows off every customer surface: `get_staff_orders` (the one read behind Sell > Orders, Customers, customer messages
--    and the order digests) no longer returns them. `find_order` and `order_status` already cannot reach a café row (it has no status
--    token and no phone), and `prune_personal_data` is not changed. The only change to `get_books` is the label of a café sale's line.
--
-- Café rows entered under migration 94 stay as they are (unpaid, Payment review): they leave Orders and show in the log with their state.

drop function public.create_cafe_order(jsonb);

/**
 * Logs a café sale. p_sale is exactly { clientId, name, saleDate, payMethod, notes, takeStock, lines }; lines are 1 to 40 of exactly
 * { productId, qty, unitCents } (one line per product, qty 1 to 500, unitCents 1 to 100000000). Refuses, writing nothing: 42501 not the
 * owner; 22023 a malformed body, a name of 0 or over 80 characters, notes over 300, control characters in either, a sale date in the
 * future or over 90 days back, a payment method that is not Cash or active, a product that does not exist or was removed, a price or
 * quantity out of range, or a total over 100000000 centavos; 23505 the client id was used for another sale; ZC002 the sale date's
 * week has no room left (setting ON; detail is the room left); ZB001 the cookies have left the kitchen (takeStock).
 * Returns the order number, the total the server computed, the sale date, whether this was a replay, whether the sale takes slots in
 * its week and what stock could not cover (empty unless takeStock).
 */
create function public.record_cafe_sale(p_sale jsonb)
returns table (order_no text, total_cents bigint, sale_date date, replayed boolean, takes_slots boolean, short jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client   uuid;
  v_name     text;
  v_notes    text;
  v_method   text;
  v_take     boolean;
  v_date     date;
  v_today    date := (select c.today from public.business_clock() c);
  v_now      timestamptz := now();
  v_stamp    timestamptz;
  v_hash     text;
  v_existing public.orders;
  v_lines    jsonb;
  v_line     jsonb;
  v_n        numeric;
  v_pids     text[] := '{}';
  v_qtys     integer[] := '{}';
  v_prices   bigint[] := '{}';
  v_total    numeric := 0;
  v_count    boolean;
  v_rules    public.order_rules;
  v_capacity integer;
  v_week     date;
  v_committed numeric;
  v_units    numeric;
  v_id       text;
  v_short    jsonb := '[]'::jsonb;
begin
  if not public.is_owner() then -- rule:cafe-sale-owner
    raise exception 'only the owner may log a café sale' using errcode = '42501';
  end if;
  if p_sale is null or jsonb_typeof(p_sale) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_sale) k)
        is distinct from array['clientId', 'lines', 'name', 'notes', 'payMethod', 'saleDate', 'takeStock'] then -- rule:cafe-sale-keys
    raise exception 'a café sale has exactly clientId, name, saleDate, payMethod, notes, takeStock and lines' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sale -> 'clientId') <> 'string' or (p_sale ->> 'clientId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_sale -> 'name') <> 'string' or jsonb_typeof(p_sale -> 'notes') <> 'string'
     or jsonb_typeof(p_sale -> 'payMethod') <> 'string' or jsonb_typeof(p_sale -> 'takeStock') <> 'boolean'
     or jsonb_typeof(p_sale -> 'saleDate') <> 'string' or (p_sale ->> 'saleDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or jsonb_typeof(p_sale -> 'lines') <> 'array' then
    raise exception 'a café sale field has the wrong type' using errcode = '22023';
  end if;
  v_client := (p_sale ->> 'clientId')::uuid;
  v_name := btrim(p_sale ->> 'name');
  v_notes := btrim(p_sale ->> 'notes');
  v_method := btrim(p_sale ->> 'payMethod');
  v_take := (p_sale ->> 'takeStock')::boolean;
  if length(v_name) not between 1 and 80 or length(v_notes) > 300 or length(v_method) not between 1 and 30
     or v_name ~ '[[:cntrl:]]' or v_notes ~ '[[:cntrl:]]' or v_method ~ '[[:cntrl:]]' then -- rule:cafe-sale-text
    raise exception 'a café name is 1 to 80 characters and notes at most 300, with no control characters' using errcode = '22023';
  end if;
  begin
    v_date := (p_sale ->> 'saleDate')::date;
  exception when others then
    raise exception 'the sale date is not a date' using errcode = '22023';
  end;

  v_lines := p_sale -> 'lines';
  if jsonb_array_length(v_lines) not between 1 and 40 then -- rule:cafe-sale-lines
    raise exception 'a café sale has 1 to 40 lines' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(v_lines) loop
    if jsonb_typeof(v_line) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['productId', 'qty', 'unitCents']
       or jsonb_typeof(v_line -> 'productId') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number'
       or jsonb_typeof(v_line -> 'unitCents') <> 'number'
       or (v_line ->> 'productId') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
      raise exception 'a café sale line is exactly productId, qty and unitCents' using errcode = '22023';
    end if;
    v_n := (v_line ->> 'qty')::numeric;
    if v_n <> trunc(v_n) or v_n < 1 or v_n > 500 then -- rule:cafe-sale-qty
      raise exception 'a quantity is a whole number from 1 to 500' using errcode = '22023';
    end if;
    v_qtys := array_append(v_qtys, v_n::integer);
    v_pids := array_append(v_pids, v_line ->> 'productId');
    v_n := (v_line ->> 'unitCents')::numeric;
    if v_n <> trunc(v_n) or v_n < 1 or v_n > 100000000 then -- rule:cafe-sale-price
      raise exception 'a price is whole centavos from 1 to 100000000' using errcode = '22023';
    end if;
    v_prices := array_append(v_prices, v_n::bigint);
    v_total := v_total + v_qtys[cardinality(v_qtys)] * v_n;
  end loop;
  if cardinality(v_pids) <> (select count(distinct x) from unnest(v_pids) x) then -- rule:cafe-sale-duplicate
    raise exception 'a product is on two lines' using errcode = '22023';
  end if;
  if v_total > 100000000 then -- rule:cafe-sale-total
    raise exception 'a sale total is at most 100000000 centavos' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(p_sale::text, 'sha256'), 'hex');
  -- Idempotency comes before the limits: a retry of a sale that already counts is answered with that sale.
  perform pg_advisory_xact_lock(hashtextextended('order:client:' || v_client::text, 0));
  select * into v_existing from public.orders o where o.client_id = v_client;
  if found then -- rule:cafe-sale-replay
    if v_existing.payload_hash is distinct from v_hash or v_existing.channel <> 'cafe' then -- rule:cafe-sale-client-id-reuse
      raise exception 'sale id was already used for a different sale' using errcode = '23505';
    end if;
    return query select v_existing.id, v_existing.total_cents, v_existing.pickup_date, true,
                        exists (select 1 from public.order_items oi where oi.order_id = v_existing.id and oi.capacity_weight > 0),
                        coalesce((select r.short from public.production_records r where r.id = md5('pack:' || v_existing.id)::uuid and r.kind = 'pack'),
                                 '[]'::jsonb);
    return;
  end if;

  if v_date > v_today or v_date < v_today - 90 then -- rule:cafe-sale-date
    raise exception 'the sale date is today or up to 90 days back' using errcode = '22023';
  end if;
  -- (after the replay lookup: a retry of a sale that exists is answered even if its date has fallen out of the window since)
  if v_method <> 'Cash' and not exists (select 1 from public.payment_methods m where m.active and m.label = v_method) then -- rule:cafe-sale-method
    raise exception 'that payment method is not offered' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_pids) x where not exists (
               select 1 from public.products p where p.id = x and p.archived_at is null)) then -- rule:cafe-sale-product
    raise exception 'a product on the sale does not exist or was removed' using errcode = '22023';
  end if;

  select s.count_toward_limit into v_count from public.cafe_order_settings s where s.id;
  v_count := coalesce(v_count, true);

  if v_count then
    select * into v_rules from public.order_rules r where r.id;
    if not found then
      raise exception 'order rules are missing' using errcode = '55000';
    end if;
    select max(se.int_value) filter (where se.key = 'capacity') into v_capacity from public.settings_effective() se;
    v_week := date_trunc('week', v_date::timestamp)::date;
    perform pg_advisory_xact_lock(hashtextextended('order:week:' || v_week::text, 0));
    select coalesce(sum(oi.qty * oi.capacity_weight), 0) into v_committed
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where o.pickup_date >= v_week and o.pickup_date < v_week + 7
       and public.order_holds_capacity(o.state, o.pay_state, o.placed_at, v_now, v_rules.unpaid_hold_hours);
    select coalesce(sum(t.qty * p.capacity_weight), 0) into v_units
      from unnest(v_pids, v_qtys) as t(pid, qty)
      join public.products p on p.id = t.pid;
    if not public.capacity_allows(v_capacity, v_committed::integer, v_units::integer) then -- rule:cafe-sale-capacity
      raise exception 'not enough room left in that week' using errcode = 'ZC002',
        detail = greatest(0, v_capacity - v_committed)::text;
    end if;
  end if;

  -- The money is dated on the sale date: today it is now, an earlier day is noon of that day on the shop's clock. The zone is named
  -- only in business_clock(), so noon is found from the shop's offset from UTC at this moment (the shop has no summer time).
  v_stamp := case when v_date = v_today then v_now
                  else ((v_date::timestamp + interval '12 hours')
                        - ((select c.local_time from public.business_clock(v_now) c) - (v_now at time zone 'UTC'))) at time zone 'UTC' end;
  v_id := 'HC-' || nextval('public.order_number_seq');
  insert into public.orders (id, customer_name, phone, ig, channel, state, pay_state, pay_method, total_cents, paid_cents, paid_at,
                             collected_at, notes, pickup_date, client_id, payload_hash, status_token, placed_at)
  values (v_id, v_name, '', '', 'cafe', 'Completed', 'confirmed', v_method, v_total::bigint, v_total::bigint, v_stamp,
          v_stamp, v_notes, v_date, v_client, v_hash, null, v_stamp); -- rule:cafe-sale-paid
  insert into public.order_items (order_id, product_id, qty, unit_price_cents, capacity_weight)
  select v_id, t.pid, t.qty, t.price, case when v_count then p.capacity_weight else 0 end -- rule:cafe-sale-weight
    from unnest(v_pids, v_qtys, v_prices) as t(pid, qty, price)
    join public.products p on p.id = t.pid;

  if v_take then -- rule:cafe-sale-stock
    -- The packing step of an order, once: the cookies come off the latest drop's baked stock, the packaging off the shelf.
    select r.shortfall into v_short
      from public.record_pack(v_id, coalesce((select max(pr.drop_no) from public.production_records pr), 0)) r;
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'cafe.sale', 'orders', v_id,
    jsonb_build_object('name', v_name, 'date', v_date, 'total_cents', v_total::bigint, 'method', v_method, 'stock', v_take));

  return query select v_id, v_total::bigint, v_date, false, v_count and exists (
    select 1 from public.order_items oi where oi.order_id = v_id and oi.capacity_weight > 0), coalesce(v_short, '[]'::jsonb);
end;
$$;
revoke execute on function public.record_cafe_sale(jsonb) from public, anon, authenticated;
grant execute on function public.record_cafe_sale(jsonb) to authenticated;

/**
 * The café sale log, newest sale first (at most 500). Owner only (42501). Includes any café row entered under migration 94 that was
 * never paid: its pay_state says so.
 */
create function public.get_cafe_sales()
returns table (order_no text, name text, sale_date date, total_cents bigint, pay_method text, state text, pay_state text,
               cookies bigint, notes text, items jsonb, logged_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then -- rule:cafe-sales-read-owner
    raise exception 'only the owner may read the café sales' using errcode = '42501';
  end if;
  return query
    select o.id, o.customer_name, o.pickup_date, o.total_cents, coalesce(o.pay_method, ''), o.state::text, o.pay_state::text,
           coalesce((select sum(i.qty) from public.order_items i where i.order_id = o.id), 0)::bigint, o.notes,
           coalesce((select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'name', p.name, 'qty', i.qty,
                                      'unit_price_cents', i.unit_price_cents) order by p.sort_order, p.id)
                       from public.order_items i join public.products p on p.id = i.product_id where i.order_id = o.id), '[]'::jsonb),
           o.updated_at
      from public.orders o
     where o.channel = 'cafe'
     order by o.pickup_date desc nulls last, o.id desc
     limit 500;
end;
$$;
revoke execute on function public.get_cafe_sales() from public, anon, authenticated;
grant execute on function public.get_cafe_sales() to authenticated;

-- get_staff_orders as in 20260101008800_pickup_location.sql; the changes are that a café row is not returned and each row says its channel
-- (the app also drops a café row it is handed, so an old answer can never put one on the Orders or Customers pages).
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
               'id', o.id, 'channel', o.channel, 'name', o.customer_name, 'phone', o.phone, 'ig', o.ig,
               'state', o.state, 'pay_state', o.pay_state, 'pay_method', o.pay_method, 'pay_ref', o.pay_ref,
               'total_cents', o.total_cents, 'paid_cents', o.paid_cents, 'refund_ref', o.refund_ref,
               'surcharge_cents', o.surcharge_cents, 'same_day', o.same_day,
               'notes', o.notes, 'pickup_date', o.pickup_date, 'pickup_window', o.pickup_window,
               'pickup_label', o.pickup_label, 'placed_at', o.placed_at, 'collected_at', o.collected_at, 'updated_at', o.updated_at,
               'status_token', o.status_token,
               'holds', public.order_holds_capacity(o.state, o.pay_state, o.placed_at, now(), coalesce(v_hold, 24)),
               'items', (select coalesce(jsonb_agg(jsonb_build_object(
                                'product_id', i.product_id, 'qty', i.qty,
                                'unit_price_cents', i.unit_price_cents, 'unavailable', i.unavailable)
                              order by i.product_id, i.unit_price_cents), '[]'::jsonb)
                           from public.order_items i where i.order_id = o.id),
               'add_ons', (select coalesce(jsonb_agg(jsonb_build_object(
                                'name', a.name, 'qty', a.qty, 'unit_price_cents', a.unit_price_cents,
                                'variant', a.variant, 'note', a.note)
                              order by a.line_no), '[]'::jsonb)
                           from public.order_add_ons a where a.order_id = o.id),
               'boxes', (select coalesce(jsonb_agg(jsonb_build_object(
                                'size', b.size, 'qty', b.qty, 'charge_cents', b.charge_cents)
                              order by b.size), '[]'::jsonb)
                           from public.order_boxes b where b.order_id = o.id),
               'swaps', (select coalesce(jsonb_agg(jsonb_build_object(
                                'from', s.from_product, 'to', s.to_product, 'qty', s.qty,
                                'delta_cents', s.price_delta_cents, 'at', s.swapped_at)
                              order by s.swapped_at), '[]'::jsonb)
                           from public.order_swaps s where s.order_id = o.id)
             ) as x
        from public.orders o
       where o.channel <> 'cafe' -- rule:staff-orders-no-cafe
         and (o.state in ('Payment review', 'Confirmed', 'Preparing', 'Ready')
              or o.placed_at > now() - interval '60 days')
       order by (o.state in ('Payment review', 'Confirmed', 'Preparing', 'Ready')) desc, o.placed_at desc
       limit 500
    ) q;
  return v_out;
end;
$$;
revoke execute on function public.get_staff_orders() from public, anon, authenticated;
grant execute on function public.get_staff_orders() to authenticated;

-- get_books as in 20260101008000_bazaar_book_labels.sql; the only change is the label of a café sale's line (category, amount and date are unchanged).
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
      select 'o:' || o.id as id, 'revenue' as kind, 'Orders' as cat, case when o.channel = 'cafe' then 'Café sale ' else 'Order ' end || o.id || ' · ' || o.customer_name as label, -- rule:books-cafe-label
             o.paid_cents as amount_cents, o.paid_at as at, 0::numeric as short_qty
        from public.orders o where o.paid_at >= p_from and o.paid_at < p_to and o.paid_cents > 0
      union all
      select 'r:' || o.id, 'refund', 'Refunds', 'Refund · order ' || o.id, o.paid_cents, o.refunded_at, 0
        from public.orders o where o.refunded_at >= p_from and o.refunded_at < p_to and o.paid_cents > 0
      union all
      select 'l:' || l.id::text, 'revenue', l.category,
             case when l.memo = 'Stall sale ' || s.client_id then
                    'Stall sale · ' || coalesce(nullif(e.name, ''), 'Bazaar')
                  when l.memo = 'Void of stall sale ' || s.client_id then
                    'Void of stall sale · ' || coalesce(nullif(e.name, ''), 'Bazaar')
                  else l.memo end, l.amount_cents, l.occurred_at, 0
        from public.ledger_entries l
        left join public.event_sales s on s.id = l.sale_id
        left join public.events e on e.id = s.event_id
       where l.kind = 'sale' and l.occurred_at >= p_from and l.occurred_at < p_to
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
