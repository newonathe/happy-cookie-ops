-- B3 (finish-plan slice B3): the shop's open state comes from, and is enforced by, the server.
--
-- Until now the owner's "close now" / "sold out" switch (the engine's `shopOverride`) lived only in
-- the browser, so it stopped nothing, and an anonymous customer's engine judged open or closed from
-- its built-in default schedule instead of the owner's window. Two pieces:
--
--   shop_state          one row (id = true) with the override: null (follow the window) or one of the
--                       engine's four holds: 'open', 'soon' (closing soon: still open), 'closed', 'soldout'. No API grant and no policy; only set_shop_override writes it.
--   get_shop_status()   the one public read: the owner's ordering window (settings openDow .. extendH)
--                       and the override, nothing else. The customer's page feeds its schedule from it.
--   set_shop_override() the owner's switch. Owner only, idempotent by target (setting what is already
--                       set changes nothing); last write wins, because there is one switch and one owner.
--   place_order()       redefined below: two more rules (override-closed, override-soldout), placed after
--                       the replay check (an order that already went through still answers) and before
--                       the window check, and the window check itself is skipped while the owner holds
--                       the shop open ('open' or 'soon'). The rest is byte-for-byte the B1 function.
--
-- Deviation from the goal text ("persist the override as a setting"): a setting row holds an int or
-- text value validated by a key list in three places (settings_effective, get_settings, save_setting),
-- so a fourth allowed key would have meant redefining all three. One small table keeps it to one place.

create table public.shop_state (
  id boolean primary key default true check (id),
  override text check (override in ('open', 'soon', 'closed', 'soldout')),
  updated_at timestamptz not null default now()
);
insert into public.shop_state (id, override) values (true, null);
alter table public.shop_state enable row level security;
revoke all on table public.shop_state from public, anon, authenticated;
create trigger shop_state_touch before update on public.shop_state
for each row execute function public.touch_updated_at();

/** The ordering window and the override: exactly what a customer's page needs to say open or closed. */
create or replace function public.get_shop_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'open_dow',  max(se.int_value) filter (where se.key = 'openDow'),
    'open_h',    max(se.int_value) filter (where se.key = 'openH'),
    'open_m',    max(se.int_value) filter (where se.key = 'openM'),
    'close_dow', max(se.int_value) filter (where se.key = 'closeDow'),
    'close_h',   max(se.int_value) filter (where se.key = 'closeH'),
    'close_m',   max(se.int_value) filter (where se.key = 'closeM'),
    'extend_h',  max(se.int_value) filter (where se.key = 'extendH'),
    'override',  (select s.override from public.shop_state s where s.id))
  from public.settings_effective() se;
$$;
revoke execute on function public.get_shop_status() from public, anon, authenticated;
grant execute on function public.get_shop_status() to anon, authenticated;

/** The owner's switch: null follows the window; 'open'/'soon' hold it open, 'closed'/'soldout' stop orders now. */
create or replace function public.set_shop_override(p_mode text)
returns table (override text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may open or close the shop' using errcode = '42501';
  end if;
  if p_mode is not null and p_mode not in ('open', 'soon', 'closed', 'soldout') then -- rule:override-mode
    raise exception 'the shop switch is open, soon, closed, soldout or off' using errcode = '22023';
  end if;
  update public.shop_state s set override = p_mode
   where s.id and s.override is distinct from p_mode;
  return query select s.override, s.updated_at from public.shop_state s where s.id;
end;
$$;
revoke execute on function public.set_shop_override(text) from public, anon, authenticated;
grant execute on function public.set_shop_override(text) to authenticated;

-- ------------------------------------------------------------------ place_order (B1, plus the override)

create or replace function public.place_order(p_order jsonb)
returns table (order_no text, status_token text, total_cents bigint, pickup_date date,
               pickup_window text, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys    text[];
  v_client  uuid;
  v_name    text;
  v_ig      text;
  v_phone   text;
  v_method  text;
  v_ref     text;
  v_notes   text;
  v_raw     text;
  v_date    date;
  v_window  text;
  v_hash    text;
  v_line    jsonb;
  v_pids    text[] := '{}';
  v_qtys    integer[] := '{}';
  v_qty_n   numeric;
  v_found   integer;
  v_qty     integer;
  v_units   integer;
  v_total   bigint;
  v_existing public.orders%rowtype;
  v_rules   public.order_rules%rowtype;
  v_now     timestamptz := now();
  v_local   timestamp := now() at time zone 'Asia/Manila';
  v_today   date := (now() at time zone 'Asia/Manila')::date;
  v_capacity integer;
  v_max_qty integer;
  v_open_dow integer;
  v_open_h  integer;
  v_open_m  integer;
  v_close_dow integer;
  v_close_h integer;
  v_close_m integer;
  v_extend_h integer;
  v_open    timestamp;
  v_close   timestamp;
  v_week    date;
  v_minute  integer;
  v_committed integer;
  v_unpaid  integer;
  v_id      text;
  v_token   text;
  v_override text;
begin
  -- ---- shape: exactly the customer's own fields, nothing the server decides
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'order must be an object' using errcode = '22023';
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_keys from jsonb_object_keys(p_order) k;
  if not (v_keys @> array['client_id', 'items', 'ig', 'mobile', 'name', 'pay_method', 'pickup_date', 'pickup_window']) then -- rule:keys-required
    raise exception 'order is missing a required field' using errcode = '22023';
  end if;
  if not (v_keys <@ array['client_id', 'items', 'ig', 'mobile', 'name', 'notes', 'pay_method', 'pay_ref', 'pickup_date', 'pickup_window']) then -- rule:keys-unknown
    raise exception 'order carries a field the server does not accept' using errcode = '22023';
  end if;
  if jsonb_typeof(p_order -> 'client_id') <> 'string' or jsonb_typeof(p_order -> 'name') <> 'string'
     or jsonb_typeof(p_order -> 'ig') <> 'string' or jsonb_typeof(p_order -> 'mobile') <> 'string'
     or jsonb_typeof(p_order -> 'pickup_date') <> 'string' or jsonb_typeof(p_order -> 'pickup_window') <> 'string'
     or jsonb_typeof(p_order -> 'pay_method') <> 'string' or jsonb_typeof(p_order -> 'items') <> 'array'
     or jsonb_typeof(coalesce(p_order -> 'pay_ref', '""'::jsonb)) <> 'string'
     or jsonb_typeof(coalesce(p_order -> 'notes', '""'::jsonb)) <> 'string' then
    raise exception 'order field has the wrong type' using errcode = '22023';
  end if;

  if (p_order ->> 'client_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'client id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_client := (p_order ->> 'client_id')::uuid;

  v_name := btrim(p_order ->> 'name');
  v_ig := btrim(p_order ->> 'ig');
  v_ref := btrim(coalesce(p_order ->> 'pay_ref', ''));
  v_notes := btrim(coalesce(p_order ->> 'notes', ''));
  v_method := p_order ->> 'pay_method';
  v_window := p_order ->> 'pickup_window';
  if length(v_name) not between 1 and 80 or length(v_ig) > 31 or length(v_ref) > 40 or length(v_notes) > 300
     or length(v_method) not between 1 and 30
     or (v_name || v_ig || v_ref || v_notes || v_method || v_window) ~ '[[:cntrl:]]' then
    raise exception 'order text out of bounds' using errcode = '22023';
  end if;
  if v_ig <> '' then
    v_ig := ltrim(v_ig, '@');
    if v_ig !~ '^[A-Za-z0-9._]{1,30}$' then
      raise exception 'instagram handle is not valid' using errcode = '22023';
    end if;
    v_ig := '@' || v_ig;
  end if;

  -- Must match anonymise_customer() and normalisePhone(): digits only, a leading 63 becomes 0, and the
  -- ten-digit form 9xxxxxxxxx gets its 0.
  v_phone := regexp_replace(p_order ->> 'mobile', '\D', '', 'g');
  if left(v_phone, 2) = '63' then v_phone := '0' || substr(v_phone, 3); end if;
  if v_phone ~ '^9[0-9]{9}$' then v_phone := '0' || v_phone; end if;
  if v_phone !~ '^09[0-9]{9}$' then
    raise exception 'mobile number is not a Philippine mobile number' using errcode = '22023';
  end if;

  if (p_order ->> 'pickup_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'pickup date must be YYYY-MM-DD' using errcode = '22023';
  end if;
  begin
    v_date := (p_order ->> 'pickup_date')::date;
  exception when others then
    raise exception 'pickup date is not a real date' using errcode = '22023';
  end;

  if jsonb_array_length(p_order -> 'items') not between 1 and 50 then
    raise exception 'an order carries 1 to 50 different items' using errcode = '22023';
  end if;
  for v_line in select i from jsonb_array_elements(p_order -> 'items') i loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'an item must be an object' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(v_line)) <> 2 or not (v_line ?& array['product_id', 'qty']) then
      raise exception 'an item carries exactly a product id and a quantity' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'product_id') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number'
       or (v_line ->> 'product_id') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
      raise exception 'an item has the wrong type' using errcode = '22023';
    end if;
    v_qty_n := (v_line ->> 'qty')::numeric;
    if v_qty_n <> trunc(v_qty_n) or v_qty_n < 1 or v_qty_n > 120 then
      raise exception 'an item quantity must be a whole number from 1 to 120' using errcode = '22023';
    end if;
    v_pids := v_pids || (v_line ->> 'product_id');
    v_qtys := v_qtys || v_qty_n::integer;
  end loop;
  if cardinality(v_pids) <> (select count(distinct x) from unnest(v_pids) x) then
    raise exception 'an item is listed twice' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(p_order::text, 'sha256'), 'hex');

  -- ---- idempotency comes before every limit: a retry of an order that already counts must be
  -- answered with that order, not refused because the first attempt now counts against the limit.
  perform pg_advisory_xact_lock(hashtextextended('order:client:' || v_client::text, 0));
  select * into v_existing from public.orders o where o.client_id = v_client;
  if found then -- rule:replay
    if v_existing.payload_hash is distinct from v_hash then -- rule:client-id-reuse
      raise exception 'order id was already used for a different order' using errcode = '23505';
    end if;
    return query select v_existing.id, v_existing.status_token, v_existing.total_cents,
                        v_existing.pickup_date, v_existing.pickup_window, true;
    return;
  end if;

  -- ---- the owner's settings and rules
  select * into v_rules from public.order_rules r where r.id;
  if not found then
    raise exception 'order rules are missing' using errcode = '55000';
  end if;
  select max(se.int_value) filter (where se.key = 'capacity'), max(se.int_value) filter (where se.key = 'maxPerOrder'),
         max(se.int_value) filter (where se.key = 'openDow'), max(se.int_value) filter (where se.key = 'openH'),
         max(se.int_value) filter (where se.key = 'openM'), max(se.int_value) filter (where se.key = 'closeDow'),
         max(se.int_value) filter (where se.key = 'closeH'), max(se.int_value) filter (where se.key = 'closeM'),
         max(se.int_value) filter (where se.key = 'extendH')
    into v_capacity, v_max_qty, v_open_dow, v_open_h, v_open_m, v_close_dow, v_close_h, v_close_m, v_extend_h
    from public.settings_effective() se;

  -- ---- the owner's "close now" / "sold out" switch: it stops orders even inside the window
  select s.override into v_override from public.shop_state s where s.id;
  if v_override = 'closed' then -- rule:override-closed
    raise exception 'ordering is closed' using errcode = 'ZC001';
  end if;
  if v_override = 'soldout' then -- rule:override-soldout
    raise exception 'not enough room left in that pickup week' using errcode = 'ZC002', detail = '0';
  end if;

  -- ---- the ordering window: the engine's dropCycle(), in Asia/Manila (the business clock).
  -- Open from the latest opening instant to the owner's closing time plus any extension.
  v_open := (v_local::date - ((extract(dow from v_local)::integer - v_open_dow + 7) % 7))::timestamp
            + make_interval(hours => v_open_h, mins => v_open_m);
  if v_local < v_open then v_open := v_open - interval '7 days'; end if;
  v_close := (v_open::date + ((v_close_dow - v_open_dow + 7) % 7))::timestamp
             + make_interval(hours => v_close_h, mins => v_close_m) + make_interval(hours => v_extend_h);
  if (v_local < v_open or v_local >= v_close) and v_override is distinct from 'open' and v_override is distinct from 'soon' then -- rule:window
    raise exception 'ordering is closed' using errcode = 'ZC001';
  end if;

  if not exists (select 1 from public.payment_methods m where m.active and m.label = v_method) then -- rule:method
    raise exception 'that payment method is not offered' using errcode = 'ZC005';
  end if;

  -- ---- pickup date and time (Cine's form: Monday and Thursday, before 5 pm, or the campus slot)
  if extract(isodow from v_date)::integer <> all (v_rules.pickup_days) then -- rule:pickup-day
    raise exception 'pickup is not offered on that day' using errcode = 'ZC004';
  end if;
  if v_date - v_today < v_rules.lead_min_days or v_date - v_today > v_rules.lead_max_days then -- rule:pickup-lead
    raise exception 'pickup date is outside the allowed lead time' using errcode = 'ZC004';
  end if;
  if v_window <> 'campus' then
    if v_window !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'pickup time must be HH:MM or campus' using errcode = '22023';
    end if;
    v_minute := substr(v_window, 1, 2)::integer * 60 + substr(v_window, 4, 2)::integer;
    if v_minute < v_rules.pickup_from_hour * 60 or v_minute >= v_rules.pickup_cutoff_hour * 60 then -- rule:pickup-time
      raise exception 'pickup time is outside the pickup hours' using errcode = 'ZC004';
    end if;
  end if;

  -- ---- price and weigh the items from the menu, never from the request
  -- A share lock keeps a concurrent price change from landing between pricing and writing the lines.
  perform 1 from public.products p where p.id = any (v_pids) for share;
  select coalesce(sum(p.price_cents * t.qty), 0), coalesce(sum(t.qty * p.capacity_weight), 0),
         count(*), coalesce(sum(t.qty), 0)
    into v_total, v_units, v_found, v_qty
    from unnest(v_pids, v_qtys) as t(pid, qty)
    join public.products p on p.id = t.pid and p.published and p.active;
  if v_found <> cardinality(v_pids) then -- rule:menu
    raise exception 'an item is not on the menu' using errcode = '22023';
  end if;
  if v_qty > v_max_qty then -- rule:max-per-order
    raise exception 'an order carries at most % cookies', v_max_qty using errcode = '22023';
  end if;

  -- ---- serialise the counting: phone, then pickup week, always in this order
  v_week := date_trunc('week', v_date::timestamp)::date;
  perform pg_advisory_xact_lock(hashtextextended('order:phone:' || v_phone, 0));
  perform pg_advisory_xact_lock(hashtextextended('order:week:' || v_week::text, 0));

  select count(*) into v_unpaid
    from public.orders o
   where o.phone = v_phone and o.state = 'Payment review' and o.pay_state = 'unpaid'
     and public.order_holds_capacity(o.state, o.pay_state, o.placed_at, v_now, v_rules.unpaid_hold_hours);
  if v_unpaid >= v_rules.max_unpaid_per_phone then -- rule:phone-limit
    raise exception 'too many unpaid orders on this number' using errcode = 'ZC003';
  end if;

  select coalesce(sum(oi.qty * oi.capacity_weight), 0) into v_committed
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
   where o.pickup_date >= v_week and o.pickup_date < v_week + 7
     and public.order_holds_capacity(o.state, o.pay_state, o.placed_at, v_now, v_rules.unpaid_hold_hours);
  if not public.capacity_allows(v_capacity, v_committed, v_units) then -- rule:capacity
    raise exception 'not enough room left in that pickup week' using errcode = 'ZC002',
      detail = greatest(0, v_capacity - v_committed)::text;
  end if;

  -- ---- write
  v_id := 'HC-' || nextval('public.order_number_seq');
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.orders (id, customer_name, phone, ig, channel, pay_method, pay_ref, total_cents, notes,
                             pickup_date, pickup_window, client_id, payload_hash, status_token, placed_at)
  values (v_id, v_name, v_phone, v_ig, 'shop', v_method, nullif(v_ref, ''), v_total, v_notes,
          v_date, v_window, v_client, v_hash, v_token, v_now);
  insert into public.order_items (order_id, product_id, qty, unit_price_cents, capacity_weight)
  select v_id, t.pid, t.qty, p.price_cents, p.capacity_weight
    from unnest(v_pids, v_qtys) as t(pid, qty)
    join public.products p on p.id = t.pid;

  return query select v_id, v_token, v_total, v_date, v_window, false;
end;
$$;
revoke execute on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to anon, authenticated;
