-- Café orders, owner only. Cine takes orders from cafés and events herself and sells to them at café prices (migration 91). Until
-- now an order could only come from the public order form (`place_order`). This adds:
--
-- 1. `cafe_order_settings`: one owner setting, "Café orders count toward the weekly limit" (default ON: café cookies use the same oven
--    time). A dedicated row rather than a `settings` key, so `settings_effective`, `save_setting` and `save_order_rules` are not
--    redefined here. Read and written only through `get_cafe_order_settings()` / `save_cafe_order_settings(boolean)` (owner only).
-- 2. `create_cafe_order(jsonb)`: the owner enters an order for a café. It is an ordinary row in `orders` and `order_items`, in the
--    state a public order starts in (Payment review, unpaid), so it shows in Sell > Orders and she marks it paid later with the
--    existing `staff_confirm_payment`; the books count it from that payment exactly as they count any order. What differs:
--      * the unit price of each line is the one she sends (the café price, editable per line); the server stores those prices and
--        computes the total itself. It never takes a total from the client.
--      * channel 'cafe', no phone ('' : no number is texted or looked up), no status token (no customer status page).
--      * capacity. When the setting is ON each line takes the product's slots (`capacity_weight`) for its pickup week exactly like
--        a public order, and the order is refused (ZC002, with the room left) when the week is full. When it is OFF every line is
--        stored with zero slots, so it never takes room from the public form and never blocks `staff_confirm_payment`. The weights are
--        stored when the order is entered; changing the setting later does not rewrite orders already entered.
--    Idempotent on `clientId`: the same body again returns the same order; another body under the same id is refused (23505).

create table public.cafe_order_settings (
  id boolean primary key default true check (id),
  count_toward_limit boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.cafe_order_settings enable row level security;
revoke all on table public.cafe_order_settings from public, anon, authenticated;
insert into public.cafe_order_settings (id) values (true);

/** The café order setting. Owner only (42501 otherwise). */
create function public.get_cafe_order_settings()
returns table (count_toward_limit boolean, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then -- rule:cafe-settings-read-owner
    raise exception 'only the owner may read the café order setting' using errcode = '42501';
  end if;
  return query select s.count_toward_limit, s.updated_at from public.cafe_order_settings s where s.id;
end;
$$;
revoke execute on function public.get_cafe_order_settings() from public, anon, authenticated;
grant execute on function public.get_cafe_order_settings() to authenticated;

/** Sets whether café orders count toward the weekly limit. Owner only (42501); a null is refused (22023). */
create function public.save_cafe_order_settings(p_count_toward_limit boolean)
returns table (count_toward_limit boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then -- rule:cafe-settings-save-owner
    raise exception 'only the owner may change the café order setting' using errcode = '42501';
  end if;
  if p_count_toward_limit is null then -- rule:cafe-settings-null
    raise exception 'the café order setting is on or off' using errcode = '22023';
  end if;
  update public.cafe_order_settings s
     set count_toward_limit = p_count_toward_limit, updated_at = now()
   where s.id and s.count_toward_limit is distinct from p_count_toward_limit;
  return query select s.count_toward_limit, s.updated_at from public.cafe_order_settings s where s.id;
end;
$$;
revoke execute on function public.save_cafe_order_settings(boolean) from public, anon, authenticated;
grant execute on function public.save_cafe_order_settings(boolean) to authenticated;

/**
 * Enters a café order. p_order is exactly { clientId, name, pickupDate, notes, lines }; lines are 1 to 40 of exactly
 * { productId, qty, unitCents } (one line per product, qty 1 to 500, unitCents 1 to 100000000). Refuses, writing nothing: 42501 not the
 * owner; 22023 a malformed body, a name of 0 or over 80 characters, notes over 300, control characters in either, a pickup date before today or over a year ahead,
 * a product that does not exist or was removed, a price or quantity out of range, or a total over 100000000 centavos; 23505 the
 * client id was used for another order; ZC002 the pickup week has no room left (setting ON; detail is the room left).
 * Returns the order number, the total the server computed, the pickup date, whether this was a replay and whether the order
 * takes slots in its pickup week.
 */
create function public.create_cafe_order(p_order jsonb)
returns table (order_no text, total_cents bigint, pickup_date date, replayed boolean, takes_slots boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client   uuid;
  v_name     text;
  v_notes    text;
  v_date     date;
  v_today    date := (select c.today from public.business_clock() c);
  v_now      timestamptz := now();
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
begin
  if not public.is_owner() then -- rule:cafe-order-owner
    raise exception 'only the owner may enter a café order' using errcode = '42501';
  end if;
  if p_order is null or jsonb_typeof(p_order) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_order) k)
        is distinct from array['clientId', 'lines', 'name', 'notes', 'pickupDate'] then -- rule:cafe-order-keys
    raise exception 'a café order has exactly clientId, name, pickupDate, notes and lines' using errcode = '22023';
  end if;
  if jsonb_typeof(p_order -> 'clientId') <> 'string' or (p_order ->> 'clientId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_order -> 'name') <> 'string' or jsonb_typeof(p_order -> 'notes') <> 'string'
     or jsonb_typeof(p_order -> 'pickupDate') <> 'string' or (p_order ->> 'pickupDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or jsonb_typeof(p_order -> 'lines') <> 'array' then
    raise exception 'a café order field has the wrong type' using errcode = '22023';
  end if;
  v_client := (p_order ->> 'clientId')::uuid;
  v_name := btrim(p_order ->> 'name');
  v_notes := btrim(p_order ->> 'notes');
  if length(v_name) not between 1 and 80 or length(v_notes) > 300
     or v_name ~ '[[:cntrl:]]' or v_notes ~ '[[:cntrl:]]' then -- rule:cafe-order-text
    raise exception 'a café name is 1 to 80 characters and notes at most 300, with no control characters' using errcode = '22023';
  end if;
  begin
    v_date := (p_order ->> 'pickupDate')::date;
  exception when others then
    raise exception 'the pickup date is not a date' using errcode = '22023';
  end;

  v_lines := p_order -> 'lines';
  if jsonb_array_length(v_lines) not between 1 and 40 then -- rule:cafe-order-lines
    raise exception 'a café order has 1 to 40 lines' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(v_lines) loop
    if jsonb_typeof(v_line) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['productId', 'qty', 'unitCents']
       or jsonb_typeof(v_line -> 'productId') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number'
       or jsonb_typeof(v_line -> 'unitCents') <> 'number'
       or (v_line ->> 'productId') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
      raise exception 'a café order line is exactly productId, qty and unitCents' using errcode = '22023';
    end if;
    v_n := (v_line ->> 'qty')::numeric;
    if v_n <> trunc(v_n) or v_n < 1 or v_n > 500 then -- rule:cafe-order-qty
      raise exception 'a quantity is a whole number from 1 to 500' using errcode = '22023';
    end if;
    v_qtys := array_append(v_qtys, v_n::integer);
    v_pids := array_append(v_pids, v_line ->> 'productId');
    v_n := (v_line ->> 'unitCents')::numeric;
    if v_n <> trunc(v_n) or v_n < 1 or v_n > 100000000 then -- rule:cafe-order-price
      raise exception 'a price is whole centavos from 1 to 100000000' using errcode = '22023';
    end if;
    v_prices := array_append(v_prices, v_n::bigint);
    v_total := v_total + v_qtys[cardinality(v_qtys)] * v_n;
  end loop;
  if cardinality(v_pids) <> (select count(distinct x) from unnest(v_pids) x) then -- rule:cafe-order-duplicate
    raise exception 'a product is on two lines' using errcode = '22023';
  end if;
  if v_total > 100000000 then -- rule:cafe-order-total
    raise exception 'an order total is at most 100000000 centavos' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(p_order::text, 'sha256'), 'hex');
  -- Idempotency comes before the limits: a retry of an order that already counts is answered with that order.
  perform pg_advisory_xact_lock(hashtextextended('order:client:' || v_client::text, 0));
  select * into v_existing from public.orders o where o.client_id = v_client;
  if found then -- rule:cafe-order-replay
    if v_existing.payload_hash is distinct from v_hash or v_existing.channel <> 'cafe' then -- rule:cafe-order-client-id-reuse
      raise exception 'order id was already used for a different order' using errcode = '23505';
    end if;
    return query select v_existing.id, v_existing.total_cents, v_existing.pickup_date, true,
                        exists (select 1 from public.order_items oi where oi.order_id = v_existing.id and oi.capacity_weight > 0);
    return;
  end if;

  if v_date < v_today or v_date > v_today + 365 then -- rule:cafe-order-date
    raise exception 'the pickup date is today or up to a year ahead' using errcode = '22023';
  end if;
  -- (after the replay lookup, like place_order: a retry of an order that exists is answered even if its pickup day has passed since)

  if exists (select 1 from unnest(v_pids) x where not exists (
               select 1 from public.products p where p.id = x and p.archived_at is null)) then -- rule:cafe-order-product
    raise exception 'a product on the order does not exist or was removed' using errcode = '22023';
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
    if not public.capacity_allows(v_capacity, v_committed::integer, v_units::integer) then -- rule:cafe-order-capacity
      raise exception 'not enough room left in that pickup week' using errcode = 'ZC002',
        detail = greatest(0, v_capacity - v_committed)::text;
    end if;
  end if;

  v_id := 'HC-' || nextval('public.order_number_seq');
  insert into public.orders (id, customer_name, phone, ig, channel, total_cents, notes, pickup_date, client_id, payload_hash,
                             status_token, placed_at)
  values (v_id, v_name, '', '', 'cafe', v_total::bigint, v_notes, v_date, v_client, v_hash, null, v_now);
  insert into public.order_items (order_id, product_id, qty, unit_price_cents, capacity_weight)
  select v_id, t.pid, t.qty, t.price, case when v_count then p.capacity_weight else 0 end -- rule:cafe-order-weight
    from unnest(v_pids, v_qtys, v_prices) as t(pid, qty, price)
    join public.products p on p.id = t.pid;

  return query select v_id, v_total::bigint, v_date, false, v_count and exists (
    select 1 from public.order_items oi where oi.order_id = v_id and oi.capacity_weight > 0);
end;
$$;
revoke execute on function public.create_cafe_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_cafe_order(jsonb) to authenticated;
