-- B1 (docs/state/finish-plan.md slice B1): the order command, database half.
--
-- The customer's browser calls three anonymous RPCs; every other write to orders stays closed
-- (no API grants on the tables, RLS on):
--   place_order(jsonb)   one order. Everything the server decides comes from the database:
--                        prices and capacity weights from `products` (published AND active),
--                        the ordering window from the owner's settings, the pickup rules and the
--                        unpaid limits from `order_rules`, the payment method from
--                        `payment_methods`. The body may carry no price, total, state or role
--                        key: an unknown key is refused. Idempotent on a client id (a retry
--                        returns the same order and the same status token; the same id with a
--                        different body is refused, 23505).
--   order_status(token)  the customer's page for one order, found only by its status token.
--   join_waitlist(jsonb) the waitlist form, idempotent on a client id.
--
-- D1 capacity rule (decision register, Ethan 2026-09-28): an order holds slots unless it is
-- cancelled, a no-show or refunded, and an UNPAID order still in review releases its slots after
-- the owner's N hours. The predicate lives in order_holds_capacity() and in `holdsCapacity()` in
-- src/lib/rules/capacity.ts; tests/fixtures/capacity-cases.json drives both. The arithmetic
-- (capacity_allows) did not change: D1 changes WHICH orders count as committed, not the sum, so
-- place_order still asks capacity_allows() and there is one arithmetic in two runtimes.
--
-- Rules with no IP in them: the forwarded-IP header is caller-controlled (finish-plan section 10),
-- so abuse is bounded by the phone number instead (open unpaid orders per phone, waitlist entries
-- per phone) plus the weekly capacity.
--
-- Refusals a customer can fix carry their own SQLSTATE so the checkout can word them (no owner
-- wording exists yet, so none is invented here):
--   ZC001 ordering closed   ZC002 not enough capacity left in the pickup week (DETAIL = remaining)
--   ZC003 too many open unpaid orders on this phone   ZC004 pickup date or time not allowed
--   ZC005 payment method not offered   ZC006 too many waitlist entries on this phone
-- 22023 is a malformed request, 23505 a client id reused for a different body.
--
-- Each customer rule is one `if ... then -- rule:name` line so the SQL role suite can neutralise
-- exactly that line (scripts/test-db-security.py, ORDER_RULES) and prove a test fails without it.
--
-- New personal data (the Instagram handle, the status token, the waitlist) is covered by
-- anonymise_customer() and prune_personal_data(), redefined at the end of this file.

-- ------------------------------------------------------------------ owner-editable rules

create table public.order_rules (
  id boolean primary key default true check (id),
  unpaid_hold_hours integer not null default 24 check (unpaid_hold_hours between 1 and 168),
  max_unpaid_per_phone integer not null default 2 check (max_unpaid_per_phone between 1 and 20),
  -- ISO weekdays: Monday = 1 ... Sunday = 7. Cine's pickups are Monday and Thursday (C1, C3).
  pickup_days integer[] not null default '{1,4}'
    check (cardinality(pickup_days) between 1 and 7 and pickup_days <@ array[1, 2, 3, 4, 5, 6, 7]),
  -- Same-day pickup (+40%) is slice B4, so a pickup is at least one day ahead until then.
  lead_min_days integer not null default 1 check (lead_min_days between 1 and 30),
  lead_max_days integer not null default 14 check (lead_max_days between 1 and 60),
  pickup_from_hour integer not null default 9 check (pickup_from_hour between 0 and 23),
  pickup_cutoff_hour integer not null default 17 check (pickup_cutoff_hour between 1 and 24),
  campus_from text not null default '14:00' check (campus_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  campus_to text not null default '15:30' check (campus_to ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at timestamptz not null default now(),
  constraint order_rules_lead check (lead_min_days <= lead_max_days),
  constraint order_rules_hours check (pickup_from_hour < pickup_cutoff_hour),
  constraint order_rules_campus check (campus_from < campus_to)
);
alter table public.order_rules enable row level security;
revoke all on table public.order_rules from public, anon, authenticated;
create trigger order_rules_touch before update on public.order_rules
for each row execute function public.touch_updated_at();
-- One row, present from the start: the defaults above are Cine's C1-C3 answers and D1.
insert into public.order_rules (id) values (true);

-- ------------------------------------------------------------------ order columns

alter table public.orders
  add column client_id uuid unique,
  add column payload_hash text check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$'),
  add column status_token text unique check (status_token is null or status_token ~ '^[0-9a-f]{64}$'),
  add column ig text not null default '' check (length(ig) <= 31),
  add column pickup_date date,
  add column pickup_window text
    check (pickup_window is null or pickup_window = 'campus' or pickup_window ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
create index orders_pickup_date_idx on public.orders (pickup_date);

-- What one unit of an item counted for when the order was placed (D9); a later change to a
-- flavour's weight never changes an order already holding slots.
alter table public.order_items
  add column capacity_weight integer not null default 1 check (capacity_weight between 1 and 48);

-- `if not exists`: a reset drops tables but keeps a free-standing sequence, so a replay must not fail on it.
create sequence if not exists public.order_number_seq minvalue 1001 start 1001;
revoke all on sequence public.order_number_seq from public, anon, authenticated;

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  name text not null check (length(btrim(name)) between 1 and 80),
  ig text not null default '' check (length(ig) <= 31),
  phone text not null check (phone ~ '^09[0-9]{9}$'),
  wanted_date date not null,
  created_at timestamptz not null default now(),
  contacted_at timestamptz,
  constraint waitlist_entries_phone_date_key unique (phone, wanted_date)
);
alter table public.waitlist_entries enable row level security;
revoke all on table public.waitlist_entries from public, anon, authenticated;

-- ------------------------------------------------------------------ the D1 capacity predicate

/**
 * Whether an order still holds slots in its pickup week. Mirror of holdsCapacity() in
 * src/lib/rules/capacity.ts. Change both together: tests/unit/capacity-parity.test.ts and
 * tests/e2e/capacity-parity.spec.ts run the same `holds` cases from capacity-cases.json.
 */
create or replace function public.order_holds_capacity(
  p_state public.order_state,
  p_pay public.pay_state,
  p_placed_at timestamptz,
  p_now timestamptz,
  p_hold_hours integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_state in ('Cancelled', 'No-show') then false
    when p_pay = 'refunded' then false
    when p_state = 'Payment review' and p_pay = 'unpaid'
      then p_now < p_placed_at + make_interval(hours => greatest(0, p_hold_hours))
    else true
  end;
$$;
comment on function public.order_holds_capacity(public.order_state, public.pay_state, timestamptz, timestamptz, integer) is
  'Mirror of holdsCapacity() in src/lib/rules/capacity.ts (decision D1). Change both together; the parity tests enforce it.';
revoke execute on function public.order_holds_capacity(public.order_state, public.pay_state, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.order_holds_capacity(public.order_state, public.pay_state, timestamptz, timestamptz, integer)
  to public, anon, authenticated, service_role;

-- ------------------------------------------------------------------ owner: read and save the rules

create or replace function public.get_order_rules()
returns table (unpaid_hold_hours integer, max_unpaid_per_phone integer, pickup_days integer[],
               lead_min_days integer, lead_max_days integer, pickup_from_hour integer,
               pickup_cutoff_hour integer, campus_from text, campus_to text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the order rules' using errcode = '42501';
  end if;
  return query
    select r.unpaid_hold_hours, r.max_unpaid_per_phone, r.pickup_days, r.lead_min_days, r.lead_max_days,
           r.pickup_from_hour, r.pickup_cutoff_hour, r.campus_from, r.campus_to, r.updated_at
      from public.order_rules r where r.id;
end;
$$;
revoke execute on function public.get_order_rules() from public, anon, authenticated;
grant execute on function public.get_order_rules() to authenticated;

/** Replaces the order rules (the same exact-keys, optimistic rule as save_shop_texts()). */
create or replace function public.save_order_rules(
  p_rules jsonb,
  p_expected_updated_at timestamptz
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys text[];
  v_days integer[];
  v_at   timestamptz;
  v_n    text;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the order rules' using errcode = '42501';
  end if;
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then
    raise exception 'order rules must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rules) k;
  if v_keys is distinct from array['campus_from', 'campus_to', 'lead_max_days', 'lead_min_days',
      'max_unpaid_per_phone', 'pickup_cutoff_hour', 'pickup_days', 'pickup_from_hour', 'unpaid_hold_hours'] then
    raise exception 'order rules must carry exactly the editable keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rules -> 'campus_from') <> 'string' or jsonb_typeof(p_rules -> 'campus_to') <> 'string'
     or jsonb_typeof(p_rules -> 'pickup_days') <> 'array' then
    raise exception 'order rule has the wrong type' using errcode = '22023';
  end if;
  foreach v_n in array array['lead_max_days', 'lead_min_days', 'max_unpaid_per_phone', 'pickup_cutoff_hour',
                             'pickup_from_hour', 'unpaid_hold_hours'] loop
    if not coalesce(case when jsonb_typeof(p_rules -> v_n) = 'number'
                         then (p_rules ->> v_n)::numeric = trunc((p_rules ->> v_n)::numeric) end, false) then
      raise exception 'order rule must be a whole number: %', v_n using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements(p_rules -> 'pickup_days') d
              where not coalesce(case when jsonb_typeof(d) = 'number'
                                      then (d #>> '{}')::numeric between 1 and 7
                                           and (d #>> '{}')::numeric = trunc((d #>> '{}')::numeric) end, false)) then
    raise exception 'pickup days must be weekday numbers 1 (Monday) to 7 (Sunday)' using errcode = '22023';
  end if;
  select array_agg(distinct (d #>> '{}')::numeric::integer order by (d #>> '{}')::numeric::integer) into v_days
    from jsonb_array_elements(p_rules -> 'pickup_days') d;
  if v_days is null then
    raise exception 'at least one pickup day is required' using errcode = '22023';
  end if;
  if (p_rules ->> 'unpaid_hold_hours')::numeric::integer not between 1 and 168
     or (p_rules ->> 'max_unpaid_per_phone')::numeric::integer not between 1 and 20
     or (p_rules ->> 'lead_min_days')::numeric::integer not between 1 and 30
     or (p_rules ->> 'lead_max_days')::numeric::integer not between 1 and 60
     or (p_rules ->> 'lead_min_days')::numeric::integer > (p_rules ->> 'lead_max_days')::numeric::integer
     or (p_rules ->> 'pickup_from_hour')::numeric::integer not between 0 and 23
     or (p_rules ->> 'pickup_cutoff_hour')::numeric::integer not between 1 and 24
     or (p_rules ->> 'pickup_from_hour')::numeric::integer >= (p_rules ->> 'pickup_cutoff_hour')::numeric::integer
     or (p_rules ->> 'campus_from') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (p_rules ->> 'campus_to') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or (p_rules ->> 'campus_from') >= (p_rules ->> 'campus_to') then
    raise exception 'order rule out of bounds' using errcode = '22023';
  end if;

  update public.order_rules as r set
      unpaid_hold_hours = (p_rules ->> 'unpaid_hold_hours')::numeric::integer,
      max_unpaid_per_phone = (p_rules ->> 'max_unpaid_per_phone')::numeric::integer,
      pickup_days = v_days,
      lead_min_days = (p_rules ->> 'lead_min_days')::numeric::integer,
      lead_max_days = (p_rules ->> 'lead_max_days')::numeric::integer,
      pickup_from_hour = (p_rules ->> 'pickup_from_hour')::numeric::integer,
      pickup_cutoff_hour = (p_rules ->> 'pickup_cutoff_hour')::numeric::integer,
      campus_from = p_rules ->> 'campus_from',
      campus_to = p_rules ->> 'campus_to'
    where r.id and date_trunc('milliseconds', r.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning r.updated_at into v_at;
  if v_at is null then
    raise exception 'order rules changed since they were read' using errcode = 'P0002';
  end if;
  return query select v_at;
end;
$$;
revoke execute on function public.save_order_rules(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_order_rules(jsonb, timestamptz) to authenticated;

-- ------------------------------------------------------------------ place_order

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

  -- ---- the ordering window: the engine's dropCycle(), in Asia/Manila (the business clock).
  -- Open from the latest opening instant to the owner's closing time plus any extension.
  v_open := (v_local::date - ((extract(dow from v_local)::integer - v_open_dow + 7) % 7))::timestamp
            + make_interval(hours => v_open_h, mins => v_open_m);
  if v_local < v_open then v_open := v_open - interval '7 days'; end if;
  v_close := (v_open::date + ((v_close_dow - v_open_dow + 7) % 7))::timestamp
             + make_interval(hours => v_close_h, mins => v_close_m) + make_interval(hours => v_extend_h);
  if v_local < v_open or v_local >= v_close then -- rule:window
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

-- ------------------------------------------------------------------ order_status

/**
 * One order by its status token, for the customer's status page. An unknown or malformed token
 * returns null, never an error. No phone, no Instagram handle and no name is returned: the link
 * is the only credential, and a link is forwarded.
 */
create or replace function public.order_status(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select jsonb_build_object(
           'order_no', o.id, 'state', o.state, 'pay_state', o.pay_state, 'pay_method', o.pay_method,
           'total_cents', o.total_cents, 'pickup_date', o.pickup_date, 'pickup_window', o.pickup_window,
           'placed_at', o.placed_at,
           'hold_expires_at', case when o.state = 'Payment review' and o.pay_state = 'unpaid'
             then o.placed_at + make_interval(hours => (select r.unpaid_hold_hours from public.order_rules r where r.id))
             else null end,
           'items', coalesce((select jsonb_agg(jsonb_build_object('product_id', oi.product_id, 'name', p.name,
                                    'qty', oi.qty, 'unit_price_cents', oi.unit_price_cents)
                                order by p.sort_order, p.id)
                              from public.order_items oi join public.products p on p.id = oi.product_id
                             where oi.order_id = o.id), '[]'::jsonb))
    into v_result
    from public.orders o
   where o.status_token = p_token;
  return v_result;
end;
$$;
revoke execute on function public.order_status(text) from public, anon, authenticated;
grant execute on function public.order_status(text) to anon, authenticated;

-- ------------------------------------------------------------------ join_waitlist

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
  v_today  date := (now() at time zone 'Asia/Manila')::date;
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

-- ------------------------------------------------------------------ erasure and retention

-- The new personal data follows the same two functions as the old: the Instagram handle and the
-- status token and body hash are blanked with the name and phone (pay_ref stays: it is part of the
-- financial record, as erasure-authority.sql asserts), and waitlist entries (nothing to preserve
-- for tax) are deleted. Only those lines differ from the previous definitions.
create or replace function public.anonymise_customer(p_phone text, p_note text default '')
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_norm    text;
  v_blocked integer := 0;
  v_removed integer := 0;
begin
  if not is_owner() then
    raise exception 'only the owner may action an erasure request';
  end if;

  -- Must match normalisePhone() in src/lib/idempotency.ts and lookup_order().
  v_norm := regexp_replace(p_phone, '\D', '', 'g');
  if left(v_norm, 2) = '63' then v_norm := '0' || substr(v_norm, 3); end if;
  if v_norm ~ '^9[0-9]{9}$' then v_norm := '0' || v_norm; end if;

  -- Live orders: nothing to preserve, remove them.
  with removed as (
    delete from orders
    where regexp_replace(phone, '\D', '', 'g') = v_norm
      -- 'Payment review' is where an order sits before proof of payment arrives. Nothing
      -- has been paid and no tax record exists, so there is nothing to preserve.
      and state = 'Payment review'
      and pay_state = 'unpaid'
    returning 1
  )
  select count(*) into v_removed from removed;

  -- Everything else is a financial record. Block, do not erase.
  with blocked as (
    update orders
       set customer_name = 'Removed on request',
           phone = '',
           notes = '',
           ig = '',
           status_token = null,
           payload_hash = null
     where regexp_replace(phone, '\D', '', 'g') = v_norm
    returning 1
  )
  select count(*) into v_blocked from blocked;

  delete from waitlist_entries where phone = v_norm;

  insert into erasure_requests (phone_hash, actioned_at, action, note, orders_affected)
  values (encode(extensions.digest(v_norm, 'sha256'), 'hex'), now(), 'anonymised', p_note, v_blocked + v_removed);

  return v_blocked + v_removed;
end;
$$;

create or replace function public.prune_personal_data(p_retain_days integer default 730)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_count integer;
begin
  with pruned as (
    update orders
       set customer_name = 'Past customer',
           phone = '',
           notes = '',
           ig = '',
           status_token = null,
           payload_hash = null
     where placed_at < now() - make_interval(days => p_retain_days)
       and phone <> ''
    returning 1
  )
  select count(*) into v_count from pruned;
  delete from waitlist_entries where created_at < now() - make_interval(days => p_retain_days);
  return v_count;
end;
$$;
