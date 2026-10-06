-- B3a (final-plan.md version 2), database half: one clock, and row-security policies that call their helper once.
--
-- ONE CLOCK. business_clock() is the only function that names the shop's time zone, and it now also answers the shop's wall
-- clock (local_time, a timestamp). place_order() and join_waitlist() used to write the zone inline; they take their day, and
-- place_order() its time of day, from business_clock() instead. Only the declaration lines differ from the definitions they
-- replace (migration 20260101004000 for place_order, 20260101003500 for join_waitlist); tests/unit/clock-continuity.test.ts
-- puts the old lines back and requires the rest to be identical, character for character. get_shop_status() never named
-- the zone and is not redefined. business_clock() is dropped and created again because its result gains a column; it keeps
-- its attributes and its ACL (no grant to anon or authenticated; service_role and the owner keep EXECUTE as before).
--
-- POLICIES. Every policy in force that calls a helper called it bare, which Postgres evaluates for every row it looks at.
-- Each is restated, one statement each, with the call wrapped as a scalar sub-select (select public.is_owner()) and
-- (select auth.uid()), which Postgres evaluates once per statement. Nothing else about a policy changes: ALTER POLICY cannot
-- change a command or the roles, and each expression is the same text with only the call wrapped. 38 of the 40 policies
-- restated; "orders public insert" and "order_items public insert" call no helper and stay as they are. No policy in force
-- calls is_staff(). The four storage.objects policies are altered in place (the migration role may alter them). No policy
-- filters on a column, so no index is added here. tests/fixtures/policies-before-58.json lists the 40 policies as they were;
-- tests/integration/security/policies.sql holds the database to it.

/**
 * The shop's day, week and wall clock for an instant: today is the shop's calendar date, week_start is the Monday on or before
 * it, local_time is the instant on the shop's own clock. Pure: no table access, no browser grant. The only place that names
 * the zone.
 */
drop function public.business_clock(timestamptz);
create or replace function public.business_clock(p_at timestamptz default now())
returns table (today date, week_start date, local_time timestamp)
language sql
stable
set search_path = ''
as $$
  select c.t::date, date_trunc('week', c.t)::date, c.t
    from (select p_at at time zone 'Asia/Manila' as t) c;
$$;
revoke execute on function public.business_clock(timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------------ place_order (B3a: the clock)

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
  v_local   timestamp := (select c.local_time from public.business_clock() c);
  v_today   date := (select c.today from public.business_clock() c);
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
  -- B4: boxes, add-ons, same-day
  v_extras  public.order_extras%rowtype;
  v_lkeys   text[];
  v_cfg     jsonb;
  v_i       integer;
  v_variant text;
  v_text    text;
  v_ao_ids  text[] := '{}';
  v_ao_qtys integer[] := '{}';
  v_ao_variants text[] := '{}';
  v_ao_texts text[] := '{}';
  v_ao_names text[] := '{}';
  v_ao_prices bigint[] := '{}';
  v_bx_sizes integer[] := '{}';
  v_bx_qtys integer[] := '{}';
  v_bx_charges bigint[] := '{}';
  v_cookie_qty integer;
  v_boxed   integer := 0;
  v_sampler_qty integer;
  v_addon_total bigint := 0;
  v_box_total bigint := 0;
  v_surcharge bigint := 0;
  v_base    bigint;
  v_same_day boolean := false;
  v_now_min integer;
  v_slot_end integer;
  v_ao_distinct integer;
  v_ao_total integer;
begin
  -- ---- shape: exactly the customer's own fields, nothing the server decides
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'order must be an object' using errcode = '22023';
  end if;
  select coalesce(array_agg(k order by k), '{}') into v_keys from jsonb_object_keys(p_order) k;
  if not (v_keys @> array['client_id', 'items', 'ig', 'mobile', 'name', 'pay_method', 'pickup_date', 'pickup_window']) then -- rule:keys-required
    raise exception 'order is missing a required field' using errcode = '22023';
  end if;
  if not (v_keys <@ array['add_ons', 'boxes', 'client_id', 'items', 'ig', 'mobile', 'name', 'notes', 'pay_method', 'pay_ref', 'pickup_date', 'pickup_window']) then -- rule:keys-unknown
    raise exception 'order carries a field the server does not accept' using errcode = '22023';
  end if;
  if jsonb_typeof(p_order -> 'client_id') <> 'string' or jsonb_typeof(p_order -> 'name') <> 'string'
     or jsonb_typeof(p_order -> 'ig') <> 'string' or jsonb_typeof(p_order -> 'mobile') <> 'string'
     or jsonb_typeof(p_order -> 'pickup_date') <> 'string' or jsonb_typeof(p_order -> 'pickup_window') <> 'string'
     or jsonb_typeof(p_order -> 'pay_method') <> 'string' or jsonb_typeof(p_order -> 'items') <> 'array'
     or jsonb_typeof(coalesce(p_order -> 'add_ons', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_order -> 'boxes', '[]'::jsonb)) <> 'array'
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

  -- ---- B4 shape: add-on lines and box lines (their rules come after the owner's configuration is read)
  if jsonb_array_length(coalesce(p_order -> 'add_ons', '[]'::jsonb)) > 20
     or jsonb_array_length(coalesce(p_order -> 'boxes', '[]'::jsonb)) > 12 then
    raise exception 'an order carries at most 20 add-on lines and 12 box lines' using errcode = '22023';
  end if;
  for v_line in select i from jsonb_array_elements(coalesce(p_order -> 'add_ons', '[]'::jsonb)) i loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'an add-on must be an object' using errcode = '22023';
    end if;
    select coalesce(array_agg(k order by k), '{}') into v_lkeys from jsonb_object_keys(v_line) k;
    if not (v_lkeys @> array['id', 'qty']) or not (v_lkeys <@ array['id', 'qty', 'text', 'variant']) then
      raise exception 'an add-on carries an id and a quantity, and at most a variant and a text' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'id') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number'
       or jsonb_typeof(coalesce(v_line -> 'variant', '""'::jsonb)) <> 'string'
       or jsonb_typeof(coalesce(v_line -> 'text', '""'::jsonb)) <> 'string'
       or (v_line ->> 'id') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
      raise exception 'an add-on has the wrong type' using errcode = '22023';
    end if;
    v_qty_n := (v_line ->> 'qty')::numeric;
    if v_qty_n <> trunc(v_qty_n) or v_qty_n < 1 or v_qty_n > 50 then
      raise exception 'an add-on quantity must be a whole number from 1 to 50' using errcode = '22023';
    end if;
    v_variant := nullif(btrim(coalesce(v_line ->> 'variant', '')), '');
    v_text := nullif(btrim(coalesce(v_line ->> 'text', '')), '');
    if length(v_variant) > 20 or length(v_text) > 300 or (coalesce(v_variant, '') || coalesce(v_text, '')) ~ '[[:cntrl:]]' then
      raise exception 'add-on text out of bounds' using errcode = '22023';
    end if;
    v_ao_ids := array_append(v_ao_ids, v_line ->> 'id');
    v_ao_qtys := array_append(v_ao_qtys, v_qty_n::integer);
    v_ao_variants := array_append(v_ao_variants, v_variant);
    v_ao_texts := array_append(v_ao_texts, v_text);
  end loop;
  for v_line in select i from jsonb_array_elements(coalesce(p_order -> 'boxes', '[]'::jsonb)) i loop
    if jsonb_typeof(v_line) is distinct from 'object' then
      raise exception 'a box must be an object' using errcode = '22023';
    end if;
    if (select count(*) from jsonb_object_keys(v_line)) <> 2 or not (v_line ?& array['size', 'qty']) then
      raise exception 'a box carries exactly a size and a quantity' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'size') <> 'number' or jsonb_typeof(v_line -> 'qty') <> 'number' then
      raise exception 'a box has the wrong type' using errcode = '22023';
    end if;
    v_qty_n := (v_line ->> 'size')::numeric;
    if v_qty_n <> trunc(v_qty_n) or v_qty_n < 2 or v_qty_n > 48 then
      raise exception 'a box size must be a whole number from 2 to 48' using errcode = '22023';
    end if;
    v_bx_sizes := array_append(v_bx_sizes, v_qty_n::integer);
    v_qty_n := (v_line ->> 'qty')::numeric;
    if v_qty_n <> trunc(v_qty_n) or v_qty_n < 1 or v_qty_n > 50 then
      raise exception 'a box quantity must be a whole number from 1 to 50' using errcode = '22023';
    end if;
    v_bx_qtys := array_append(v_bx_qtys, v_qty_n::integer);
  end loop;
  if cardinality(v_bx_sizes) <> (select count(distinct x) from unnest(v_bx_sizes) x) then
    raise exception 'a box size is listed twice' using errcode = '22023';
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
  select * into v_extras from public.order_extras x where x.id;
  if not found then
    raise exception 'order extras are missing' using errcode = '55000';
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
  -- Same-day pickup (Cine's form: +40%): the server derives it from the date, so a customer cannot skip the surcharge.
  if v_date = v_today then
    if not v_extras.same_day_enabled then -- rule:same-day-off
      raise exception 'same-day pickup is not offered' using errcode = 'ZC004';
    end if;
    v_same_day := true;
  end if;
  if v_date <> v_today and (v_date - v_today < v_rules.lead_min_days or v_date - v_today > v_rules.lead_max_days) then -- rule:pickup-lead
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
  v_now_min := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;
  v_slot_end := case when v_window = 'campus'
                     then substr(v_rules.campus_from, 1, 2)::integer * 60 + substr(v_rules.campus_from, 4, 2)::integer
                     else v_minute end;
  if v_same_day and v_slot_end <= v_now_min then -- rule:same-day-time
    raise exception 'that pickup time has already passed today' using errcode = 'ZC004';
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

  -- ---- B4: the sampler limit, boxes and add-ons, priced from the owner's configuration
  select coalesce(sum(t.qty), 0) into v_sampler_qty
    from unnest(v_pids, v_qtys) as t(pid, qty) where t.pid = v_extras.sampler_product_id;
  if v_sampler_qty > v_extras.sampler_max_qty then -- rule:sampler-cap
    raise exception 'an order carries at most % sampler boxes', v_extras.sampler_max_qty using errcode = '22023';
  end if;

  select coalesce(sum(t.qty), 0) into v_cookie_qty
    from unnest(v_pids, v_qtys) as t(pid, qty)
    join public.products p on p.id = t.pid and p.item_type = 'cookie';
  for v_i in 1 .. cardinality(v_bx_sizes) loop
    select b into v_cfg from jsonb_array_elements(v_extras.box_sizes) b
     where (b ->> 'size')::integer = v_bx_sizes[v_i] and (b ->> 'active')::boolean;
    if v_cfg is null then -- rule:box-size
      raise exception 'that box size is not offered' using errcode = 'ZC007';
    end if;
    v_bx_charges := array_append(v_bx_charges, (v_cfg ->> 'charge_cents')::bigint);
    v_boxed := v_boxed + v_bx_sizes[v_i] * v_bx_qtys[v_i];
    v_box_total := v_box_total + (v_cfg ->> 'charge_cents')::bigint * v_bx_qtys[v_i];
  end loop;
  if v_boxed > v_cookie_qty then -- rule:box-fit
    raise exception 'more cookies are boxed than the order holds' using errcode = '22023';
  end if;

  select count(distinct t.id || '|' || coalesce(t.variant, '') || '|' || coalesce(t.txt, '')) into v_ao_distinct
    from unnest(v_ao_ids, v_ao_variants, v_ao_texts) as t(id, variant, txt);
  if cardinality(v_ao_ids) <> v_ao_distinct then -- rule:addon-dup
    raise exception 'an add-on is listed twice' using errcode = '22023';
  end if;
  for v_i in 1 .. cardinality(v_ao_ids) loop
    select a into v_cfg from jsonb_array_elements(v_extras.add_ons) a
     where a ->> 'id' = v_ao_ids[v_i] and (a ->> 'active')::boolean;
    if v_cfg is null then -- rule:addon-unknown
      raise exception 'that add-on is not offered' using errcode = 'ZC007';
    end if;
    if (jsonb_array_length(v_cfg -> 'variants') > 0) is distinct from (v_ao_variants[v_i] is not null) or (v_ao_variants[v_i] is not null and not ((v_cfg -> 'variants') ? v_ao_variants[v_i])) then -- rule:addon-variant
      raise exception 'that add-on needs one of its variants' using errcode = '22023';
    end if;
    if ((v_cfg ->> 'text_label') is null and v_ao_texts[v_i] is not null) or ((v_cfg ->> 'text_label') is not null and (v_ao_texts[v_i] is null or length(v_ao_texts[v_i]) > coalesce((v_cfg ->> 'text_max')::integer, 0) or v_ao_qtys[v_i] <> 1)) then -- rule:addon-text
      raise exception 'that add-on takes a message of its own, one card at a time' using errcode = '22023';
    end if;
    select coalesce(sum(t.q), 0) into v_ao_total from unnest(v_ao_ids, v_ao_qtys) as t(id, q) where t.id = v_ao_ids[v_i];
    if v_ao_total > coalesce((v_cfg ->> 'max_qty')::integer, 0) then -- rule:addon-qty
      raise exception 'too many of that add-on' using errcode = '22023';
    end if;
    v_ao_names := array_append(v_ao_names, v_cfg ->> 'name');
    v_ao_prices := array_append(v_ao_prices, (v_cfg ->> 'price_cents')::bigint);
    v_addon_total := v_addon_total + (v_cfg ->> 'price_cents')::bigint * v_ao_qtys[v_i];
  end loop;

  if v_same_day then
    v_base := v_total + case when v_extras.same_day_on_extras then v_addon_total + v_box_total else 0 end;
    v_surcharge := (v_base * v_extras.same_day_percent + 50) / 100;
  end if;
  v_total := v_total + v_addon_total + v_box_total + v_surcharge;

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
                             pickup_date, pickup_window, client_id, payload_hash, status_token, placed_at,
                             surcharge_cents, same_day)
  values (v_id, v_name, v_phone, v_ig, 'shop', v_method, nullif(v_ref, ''), v_total, v_notes,
          v_date, v_window, v_client, v_hash, v_token, v_now, v_surcharge, v_same_day);
  insert into public.order_items (order_id, product_id, qty, unit_price_cents, capacity_weight)
  select v_id, t.pid, t.qty, p.price_cents, p.capacity_weight
    from unnest(v_pids, v_qtys) as t(pid, qty)
    join public.products p on p.id = t.pid;
  insert into public.order_add_ons (order_id, line_no, add_on_id, name, qty, unit_price_cents, variant, note)
  select v_id, t.n, t.id, t.nm, t.qty, t.price, t.variant, t.txt
    from unnest(v_ao_ids, v_ao_names, v_ao_qtys, v_ao_prices, v_ao_variants, v_ao_texts)
         with ordinality as t(id, nm, qty, price, variant, txt, n);
  insert into public.order_boxes (order_id, size, qty, charge_cents)
  select v_id, t.size, t.qty, t.charge
    from unnest(v_bx_sizes, v_bx_qtys, v_bx_charges) as t(size, qty, charge);

  return query select v_id, v_token, v_total, v_date, v_window, false;
end;
$$;
revoke execute on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------ join_waitlist (B3a: the clock)

create or replace function public.join_waitlist(p_entry jsonb)
returns table (waitlist_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys   text[];
  v_client uuid;
  v_name   text;
  v_ig     text;
  v_phone  text;
  v_date   date;
  v_hash   text;
  v_today  date := (select c.today from public.business_clock() c);
  v_existing public.waitlist_entries%rowtype;
  v_open   integer;
  v_id     uuid;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception 'waitlist entry must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_entry) k;
  if v_keys is distinct from array['client_id', 'ig', 'mobile', 'name', 'wanted_date'] then
    raise exception 'waitlist entry must carry exactly its own fields' using errcode = '22023';
  end if;
  if jsonb_typeof(p_entry -> 'client_id') <> 'string' or jsonb_typeof(p_entry -> 'name') <> 'string'
     or jsonb_typeof(p_entry -> 'ig') <> 'string' or jsonb_typeof(p_entry -> 'mobile') <> 'string'
     or jsonb_typeof(p_entry -> 'wanted_date') <> 'string' then
    raise exception 'waitlist field has the wrong type' using errcode = '22023';
  end if;
  if (p_entry ->> 'client_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'client id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_client := (p_entry ->> 'client_id')::uuid;
  v_name := btrim(p_entry ->> 'name');
  v_ig := btrim(p_entry ->> 'ig');
  if length(v_name) not between 1 and 80 or length(v_ig) > 31 or (v_name || v_ig) ~ '[[:cntrl:]]' then
    raise exception 'waitlist text out of bounds' using errcode = '22023';
  end if;
  if v_ig <> '' then
    v_ig := ltrim(v_ig, '@');
    if v_ig !~ '^[A-Za-z0-9._]{1,30}$' then
      raise exception 'instagram handle is not valid' using errcode = '22023';
    end if;
    v_ig := '@' || v_ig;
  end if;
  v_phone := regexp_replace(p_entry ->> 'mobile', '\D', '', 'g');
  if left(v_phone, 2) = '63' then v_phone := '0' || substr(v_phone, 3); end if;
  if v_phone ~ '^9[0-9]{9}$' then v_phone := '0' || v_phone; end if;
  if v_phone !~ '^09[0-9]{9}$' then
    raise exception 'mobile number is not a Philippine mobile number' using errcode = '22023';
  end if;
  if (p_entry ->> 'wanted_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'wanted date must be YYYY-MM-DD' using errcode = '22023';
  end if;
  begin
    v_date := (p_entry ->> 'wanted_date')::date;
  exception when others then
    raise exception 'wanted date is not a real date' using errcode = '22023';
  end;
  if v_date < v_today or v_date > v_today + 90 then -- rule:waitlist-date
    raise exception 'wanted date must be within the next 90 days' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(p_entry::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('waitlist:client:' || v_client::text, 0));
  select * into v_existing from public.waitlist_entries w where w.client_id = v_client;
  if found then -- rule:waitlist-replay
    if v_existing.payload_hash is distinct from v_hash then -- rule:waitlist-client-id-reuse
      raise exception 'waitlist id was already used for a different entry' using errcode = '23505';
    end if;
    return query select v_existing.id, true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('waitlist:phone:' || v_phone, 0));
  -- The same number asking for the same date again is the same request: answer with the first.
  select * into v_existing from public.waitlist_entries w where w.phone = v_phone and w.wanted_date = v_date;
  if found then -- rule:waitlist-dedupe
    return query select v_existing.id, true;
    return;
  end if;
  select count(*) into v_open from public.waitlist_entries w where w.phone = v_phone and w.wanted_date >= v_today;
  if v_open >= 5 then -- rule:waitlist-limit
    raise exception 'too many waitlist entries on this number' using errcode = 'ZC006';
  end if;

  insert into public.waitlist_entries (client_id, payload_hash, name, ig, phone, wanted_date)
  values (v_client, v_hash, v_name, v_ig, v_phone, v_date)
  returning id into v_id;
  return query select v_id, false;
end;
$$;
revoke execute on function public.join_waitlist(jsonb) from public, anon, authenticated;
grant execute on function public.join_waitlist(jsonb) to anon, authenticated;

-- ------------------------------------------------------------------ policies, helper calls wrapped

alter policy "audit owner read" on public.audit_log using ((select public.is_owner()));
alter policy "batches staff all" on public.bake_batches using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "drops owner write" on public.drops using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "drops public read" on public.drops using ((select public.is_owner()));
alter policy "erasure requests owner only" on public.erasure_requests using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "sale items staff insert" on public.event_sale_items with check ((select public.is_owner()));
alter policy "sale items staff read" on public.event_sale_items using ((select public.is_owner()));
alter policy "sales staff insert" on public.event_sales with check ((select public.is_owner()));
alter policy "sales staff read" on public.event_sales using ((select public.is_owner()));
alter policy "events owner write" on public.events using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "events staff read" on public.events using ((select public.is_owner()));
alter policy "stock owner insert" on public.inventory_items with check ((select public.is_owner()));
alter policy "stock staff read" on public.inventory_items using ((select public.is_owner()));
alter policy "stock staff write" on public.inventory_items using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "ledger owner insert" on public.ledger_entries with check ((select public.is_owner()));
alter policy "ledger owner read" on public.ledger_entries using ((select public.is_owner()));
alter policy "order items staff read" on public.order_items using ((select public.is_owner()));
alter policy "order items staff write" on public.order_items using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "orders staff read" on public.orders using ((select public.is_owner()));
alter policy "orders staff write" on public.orders using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "catalogue owner write" on public.products using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "catalogue public read" on public.products using ((select public.is_owner()));
alter policy "own profile" on public.profiles using (id = (select auth.uid()));
alter policy "owner reads staff" on public.profiles using ((select public.is_owner()));
alter policy "owner writes staff" on public.profiles using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "recipe items owner write" on public.recipe_ingredients using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "recipe items staff read" on public.recipe_ingredients using ((select public.is_owner()));
alter policy "recipes owner write" on public.recipes using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "recipes staff read" on public.recipes using ((select public.is_owner()));
alter policy "settings owner write" on public.settings using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "supplier prices owner write" on public.supplier_prices using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "supplier prices staff read" on public.supplier_prices using ((select public.is_owner()));
alter policy "suppliers owner write" on public.suppliers using ((select public.is_owner())) with check ((select public.is_owner()));
alter policy "suppliers staff read" on public.suppliers using ((select public.is_owner()));

-- storage.objects: the four shop-media policies, as 20260101003400 wrote them
alter policy "shop media owner select" on storage.objects using (bucket_id = 'shop-media' and (select public.is_owner()));
alter policy "shop media owner insert" on storage.objects with check (bucket_id = 'shop-media' and (select public.is_owner()) and name ~ '^(qr|flavours)/[A-Za-z0-9_-]{1,64}\.(png|jpg|jpeg|webp)$');
alter policy "shop media owner update" on storage.objects using (bucket_id = 'shop-media' and (select public.is_owner())) with check (bucket_id = 'shop-media' and (select public.is_owner()) and name ~ '^(qr|flavours)/[A-Za-z0-9_-]{1,64}\.(png|jpg|jpeg|webp)$');
alter policy "shop media owner delete" on storage.objects using (bucket_id = 'shop-media' and (select public.is_owner()));
