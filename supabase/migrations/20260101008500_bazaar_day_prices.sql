-- Change a price on a started bazaar day (Ethan's decision D3, 14 November 2026: the owner can raise or lower a flavour's price for
-- the rest of an open selling day). On 14 November she charged more than the day said and had to note it on paper, because the
-- server refuses any sale whose total does not match the prices the day started with.
--
-- event_price_versions keeps every price list a selling day (an `events` row) has had. The first change stores version 0, the
-- list the day started with, and then the new list; `events.price_snapshot` is always the latest list, so everything that reads it
-- (the start replay, the stock and close checks, which only ask whether a flavour is on the menu) sees today's prices. A change
-- sets one flavour already on the day's list, so the list's flavours never change. The day's plan line takes the new price too,
-- so the event page and the day's review show what the stall charges now.
--
-- record_event_sale is redefined whole from 20260101004700 with one change, the price check: a sale sends quantities and totals,
-- never prices, so the server tries the list in effect at the sale's time first, then every other list of that day (newest first),
-- and keeps the first whose gross less the discount is the sent total. The sale's items are stored at that list's prices. A sale rung
-- before a change and sent after it (offline) is therefore accepted at the price it was rung at, and queued sale bodies do not
-- change. A day with no change behaves exactly as before.
--
-- Locks. The sale path takes only its per-sale lock and reads the event unlocked; it is not changed. A change takes the booking's
-- lock, the day row, the `event:` lock and the event row, in the order close_bazaar_day and close_event take them, so it cannot run
-- beside the day's close. A sale that reads the event before a change commits and its lists after sees both the old and the new
-- list; one that reads both before sees the old list only; a phone holds the new price only once the change has committed.

create table public.event_price_versions (
  event_id uuid not null references public.events (id) on delete cascade,
  version integer not null check (version between 0 and 100),
  prices jsonb not null check (jsonb_typeof(prices) = 'object'),
  effective_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null,
  request_id uuid unique,
  payload_hash text check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (event_id, version),
  -- Version 0 is the list the day started with: no request made it. Every later version is one request.
  constraint event_price_versions_request check ((version = 0) = (request_id is null) and (request_id is null) = (payload_hash is null))
);
alter table public.event_price_versions enable row level security;
revoke all on table public.event_price_versions from public, anon, authenticated;

/**
 * Sets one flavour's price for the rest of an open bazaar day. p_change is exactly { requestId, eventId, productId, priceCents }:
 * requestId is minted by the phone, so a retry after a lost answer is the same change. Refuses, writing nothing: 42501 not the
 * owner; 22023 a malformed body, a flavour not on the day's list, a price outside 1 to 100000000 centavos or the price it already
 * has; P0002 no such event; 55000 the event is not a bazaar day, or the day is closed; 23505 the request id was used for a
 * different change; 54000 more than 100 changes on one day. A repeat of the same change is answered, even after the day closed.
 * Returns { version, latest, prices, duplicate }: the change's version, the day's latest version and its prices now (centavos).
 */
create or replace function public.set_bazaar_day_price(p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req    uuid;
  v_event  uuid;
  v_pid    text;
  v_cents  bigint;
  v_hash   text;
  v_day    public.bazaar_days%rowtype;
  v_ev     public.events%rowtype;
  v_seen   public.event_price_versions%rowtype;
  v_latest integer;
  v_next   integer;
  v_prices jsonb;
  v_from   bigint;
  v_now    timestamptz := now();
begin
  if not public.is_owner() then -- rule:price-owner
    raise exception 'only the owner may change a price' using errcode = '42501';
  end if;
  if p_change is null or jsonb_typeof(p_change) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_change) k)
          is distinct from array['eventId', 'priceCents', 'productId', 'requestId'] then -- rule:price-keys
    raise exception 'a price change carries exactly requestId, eventId, productId and priceCents' using errcode = '22023';
  end if;
  if jsonb_typeof(p_change -> 'requestId') is distinct from 'string'
     or (p_change ->> 'requestId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_change -> 'eventId') is distinct from 'string'
     or (p_change ->> 'eventId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_change -> 'productId') is distinct from 'string'
     or (p_change ->> 'productId') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
    raise exception 'requestId and eventId must be uuids and productId a flavour id' using errcode = '22023';
  end if;
  if jsonb_typeof(p_change -> 'priceCents') is distinct from 'number' or (p_change ->> 'priceCents') !~ '^[0-9]{1,9}$'
     or (p_change ->> 'priceCents')::bigint not between 1 and 100000000 then -- rule:price-range
    raise exception 'a price is whole centavos from 1 to 100000000' using errcode = '22023';
  end if;
  v_req := (p_change ->> 'requestId')::uuid;
  v_event := (p_change ->> 'eventId')::uuid;
  v_pid := p_change ->> 'productId';
  v_cents := (p_change ->> 'priceCents')::bigint;
  v_hash := encode(sha256(convert_to(p_change::text, 'UTF8')), 'hex');

  select * into v_day from public.bazaar_days d where d.event_id = v_event;
  if not found then
    if exists (select 1 from public.events e where e.id = v_event) then -- rule:price-bazaar-day
      raise exception 'only a bazaar day''s prices can be changed here' using errcode = '55000';
    end if;
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  -- The order close_bazaar_day takes (booking, day, event), with close_event's event lock before the event row.
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_day.scheduled_id::text, 0));
  select * into v_day from public.bazaar_days d where d.id = v_day.id for update;
  perform pg_advisory_xact_lock(hashtextextended('event:' || v_event::text, 0));
  select * into v_ev from public.events e where e.id = v_event for update;

  -- A repeat is answered before the day is judged: it may have closed since the first delivery.
  select * into v_seen from public.event_price_versions pv where pv.request_id = v_req;
  if found then
    if v_seen.payload_hash is distinct from v_hash then -- rule:price-replay-conflict
      raise exception 'request id was already used for a different price change' using errcode = '23505';
    end if;
    select max(pv.version) into v_latest from public.event_price_versions pv where pv.event_id = v_event;
    return jsonb_build_object('version', v_seen.version, 'latest', v_latest, 'prices', v_ev.price_snapshot, 'duplicate', true);
  end if;

  if v_ev.closed_at is not null then -- rule:price-open
    raise exception 'that day is closed: its prices cannot change' using errcode = '55000';
  end if;
  if not (v_ev.price_snapshot ? v_pid) then -- rule:price-product
    raise exception 'flavour % is not on this day''s price list', v_pid using errcode = '22023';
  end if;
  v_from := (v_ev.price_snapshot ->> v_pid)::bigint;
  if v_from = v_cents then -- rule:price-same
    raise exception 'that is already the price' using errcode = '22023';
  end if;

  select max(pv.version) into v_latest from public.event_price_versions pv where pv.event_id = v_event;
  if v_latest is null then
    -- The first change keeps the list the day started with, so a sale rung before it is still accepted at that list.
    insert into public.event_price_versions (event_id, version, prices, effective_at)
    values (v_event, 0, v_ev.price_snapshot, v_ev.starts_at); -- rule:price-version-zero
    v_latest := 0;
  end if;
  v_next := v_latest + 1;
  if v_next > 100 then
    raise exception 'a day can change its prices at most 100 times' using errcode = '54000';
  end if;
  v_prices := jsonb_set(v_ev.price_snapshot, array[v_pid], to_jsonb(v_cents));
  insert into public.event_price_versions (event_id, version, prices, effective_at, created_by, request_id, payload_hash)
  values (v_event, v_next, v_prices, v_now, auth.uid(), v_req, v_hash);
  update public.events e set price_snapshot = v_prices where e.id = v_event; -- rule:price-snapshot
  update public.bazaar_day_lines l set price_cents = v_cents where l.day_id = v_day.id and l.product_id = v_pid; -- rule:price-line

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar_day.price_changed', 'events', v_event::text,
    jsonb_build_object('request_id', v_req, 'day_id', v_day.id, 'product_id', v_pid, 'from_cents', v_from, 'to_cents', v_cents,
      'version', v_next));

  return jsonb_build_object('version', v_next, 'latest', v_next, 'prices', v_prices, 'duplicate', false);
end;
$$;
revoke execute on function public.set_bazaar_day_price(jsonb) from public, anon, authenticated;
grant execute on function public.set_bazaar_day_price(jsonb) to authenticated;

/**
 * The prices a selling day charges now, for a till to re-read: { version, prices } (centavos by flavour). version is 0 until the
 * first change. Owner only (42501); P0002 when there is no such event.
 */
create or replace function public.get_event_prices(p_event uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_prices jsonb;
begin
  if not public.is_owner() then -- rule:prices-read-owner
    raise exception 'only the owner may read a day''s prices' using errcode = '42501';
  end if;
  select e.price_snapshot into v_prices from public.events e where e.id = p_event;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('version',
    coalesce((select max(pv.version) from public.event_price_versions pv where pv.event_id = p_event), 0), 'prices', v_prices);
end;
$$;
revoke execute on function public.get_event_prices(uuid) from public, anon, authenticated;
grant execute on function public.get_event_prices(uuid) to authenticated;

-- record_event_sale, as it was (20260101004700) with the one change marked D3 above: the price check tries each list of the day.
create or replace function public.record_event_sale(p_sale jsonb)
returns table (client_id text, sale_id uuid, duplicate boolean, voided boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client text;
  v_device text;
  v_event uuid;
  v_ev public.events%rowtype;
  v_at timestamptz;
  v_pay text;
  v_ref text;
  v_clerk text;
  v_items jsonb;
  v_item record;
  v_gross bigint := 0;
  v_discount bigint;
  v_total bigint;
  v_tendered bigint;
  v_change bigint;
  v_voided timestamptz;
  v_ledger uuid;
  v_sale uuid;
  v_hash text;
  v_seen text;
  v_prices jsonb;
  v_try record;
  v_try_gross bigint;
  v_fits boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record a bazaar sale' using errcode = '42501';
  end if;
  if p_sale is null or jsonb_typeof(p_sale) <> 'object' then
    raise exception 'sale must be an object' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_sale) k
              where k <> all (array['clientId','deviceId','eventId','items','discountCents',
                'totalCents','pay','ref','clerk','at','tenderedCents','changeCents'])) then
    raise exception 'sale has an unknown key' using errcode = '22023';
  end if;

  v_client := p_sale ->> 'clientId';
  v_device := p_sale ->> 'deviceId';
  if jsonb_typeof(p_sale -> 'clientId') is distinct from 'string' or length(v_client) not between 1 and 160
     or jsonb_typeof(p_sale -> 'deviceId') is distinct from 'string' or v_device !~ '^[A-Za-z0-9_-]{1,64}$'
     or left(v_client, length(v_device) + 1) <> v_device || ':' then
    raise exception 'clientId must start with the device id' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sale -> 'eventId') is distinct from 'string'
     or (p_sale ->> 'eventId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'eventId must be an event uuid' using errcode = '22023';
  end if;
  v_event := (p_sale ->> 'eventId')::uuid;
  if jsonb_typeof(p_sale -> 'at') is distinct from 'number' or (p_sale ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'at must be milliseconds since 1970' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_sale ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then
    raise exception 'sale time is in the future' using errcode = '22023';
  end if;
  v_pay := p_sale ->> 'pay';
  if jsonb_typeof(p_sale -> 'pay') is distinct from 'string'
     or v_pay <> all (array['Cash','GCash','Maya','GoTyme','Freebie']) then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;
  v_ref := p_sale ->> 'ref';
  v_clerk := p_sale ->> 'clerk';
  if jsonb_typeof(p_sale -> 'ref') is distinct from 'string' or length(v_ref) > 32
     or jsonb_typeof(p_sale -> 'clerk') is distinct from 'string' or length(v_clerk) > 40 then
    raise exception 'ref or clerk is malformed' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sale -> 'discountCents') is distinct from 'number' or (p_sale ->> 'discountCents') !~ '^[0-9]{1,12}$'
     or jsonb_typeof(p_sale -> 'totalCents') is distinct from 'number' or (p_sale ->> 'totalCents') !~ '^[0-9]{1,12}$'
     or jsonb_typeof(p_sale -> 'tenderedCents') is distinct from 'number' or (p_sale ->> 'tenderedCents') !~ '^[0-9]{1,12}$'
     or jsonb_typeof(p_sale -> 'changeCents') is distinct from 'number' or (p_sale ->> 'changeCents') !~ '^[0-9]{1,12}$' then
    raise exception 'money fields must be whole centavos, zero or more' using errcode = '22023';
  end if;
  v_discount := (p_sale ->> 'discountCents')::bigint;
  v_total := (p_sale ->> 'totalCents')::bigint;
  v_tendered := (p_sale ->> 'tenderedCents')::bigint;
  v_change := (p_sale ->> 'changeCents')::bigint;
  v_items := p_sale -> 'items';
  if jsonb_typeof(v_items) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_items)) not between 1 and 50 then
    raise exception 'items must list 1-50 flavours' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(v_items) i
              where i.key !~ '^[a-z0-9][a-z0-9-]{0,31}$' or jsonb_typeof(i.value) <> 'number'
                 or (i.value #>> '{}') !~ '^[0-9]{1,3}$' or (i.value #>> '{}')::int < 1) then
    raise exception 'each item needs a flavour id and a whole quantity of 1-999' using errcode = '22023';
  end if;

  -- One writer per client id at a time, for both this command and the void command, so a
  -- void can never slip between "is there a void?" and "insert the sale".
  perform pg_advisory_xact_lock(hashtextextended('event_sale:' || v_client, 0));

  -- A repeat is acknowledged before anything else is judged: the event may have closed or
  -- moved to another phone since the first delivery, and the phone must still stop retrying.
  v_hash := encode(sha256(convert_to(p_sale::text, 'UTF8')), 'hex');
  select s.id, s.voided_at, s.payload_hash into v_sale, v_voided, v_seen
    from public.event_sales s where s.client_id = v_client;
  if found then
    if v_seen is distinct from v_hash then
      raise exception 'client id was already used for a different sale' using errcode = '23505';
    end if;
    return query select v_client, v_sale, true, v_voided is not null;
    return;
  end if;

  select * into v_ev from public.events e where e.id = v_event;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if v_ev.selling_device is null or (v_device <> v_ev.selling_device and v_device <> all (v_ev.former_devices)) then
    raise exception 'this phone is not the selling device for the event' using errcode = '42501';
  end if;
  if v_ev.closed_at is not null and v_at > v_ev.closed_at then
    raise exception 'event closed before this sale' using errcode = '55000';
  end if;
  if v_at < v_ev.starts_at - interval '1 day' then
    raise exception 'sale time is before the event started' using errcode = '22023';
  end if;

  for v_item in select i.key as pid, (i.value #>> '{}')::int as qty from jsonb_each(v_items) i loop
    if not (v_ev.price_snapshot ? v_item.pid) then
      raise exception 'flavour % is not in the event price snapshot', v_item.pid using errcode = '22023';
    end if;
    v_gross := v_gross + v_item.qty * (v_ev.price_snapshot ->> v_item.pid)::bigint;
  end loop;
  -- D3 (migration 85), the one change from 20260101004700: a day whose prices changed keeps each list it has had. The list in
  -- effect at the sale's time is tried first, then the others, newest first; the first whose gross less the discount is the sent
  -- total prices the sale. With no list kept this is the start list, as before. When none fits, v_gross stays the latest list's
  -- (the snapshot is always the latest list) and the check below refuses the sale as before.
  v_prices := v_ev.price_snapshot;
  for v_try in select pv.prices from public.event_price_versions pv where pv.event_id = v_event
                order by pv.version = coalesce((select max(x.version) from public.event_price_versions x
                                                 where x.event_id = v_event and x.effective_at <= v_at), 0) desc,
                         pv.version desc loop -- rule:sale-version-order
    v_fits := true;
    v_try_gross := 0;
    for v_item in select i.key as pid, (i.value #>> '{}')::int as qty from jsonb_each(v_items) i loop
      if not (v_try.prices ? v_item.pid) then
        v_fits := false;
        exit;
      end if;
      v_try_gross := v_try_gross + v_item.qty * (v_try.prices ->> v_item.pid)::bigint;
    end loop;
    if v_fits and v_discount <= v_try_gross and v_total = v_try_gross - v_discount then -- rule:sale-version-match
      v_prices := v_try.prices;
      v_gross := v_try_gross;
      exit;
    end if;
  end loop;
  if v_discount > v_gross or v_total <> v_gross - v_discount then
    raise exception 'sale total does not match the event prices' using errcode = '22023';
  end if;
  if v_pay = 'Freebie' and v_total <> 0 then
    raise exception 'a freebie has no charge' using errcode = '22023';
  end if;

  select vd.voided_at into v_voided from public.event_sale_voids vd where vd.client_id = v_client;

  insert into public.event_sales (client_id, event_id, gross_cents, discount_cents, total_cents,
    pay_method, pay_ref, tendered_cents, change_cents, clerk, sold_at, voided_at, payload_hash)
  values (v_client, v_event, v_gross, v_discount, v_total, v_pay, v_ref, v_tendered, v_change,
    v_clerk, v_at, v_voided, v_hash)
  on conflict on constraint event_sales_client_id_key do nothing
  returning id into v_sale;
  if v_sale is null then
    select s.id, s.voided_at, s.payload_hash into v_sale, v_voided, v_seen
      from public.event_sales s where s.client_id = v_client;
    if v_seen is distinct from v_hash then
      raise exception 'client id was already used for a different sale' using errcode = '23505';
    end if;
    return query select v_client, v_sale, true, v_voided is not null;
    return;
  end if;

  insert into public.event_sale_items (sale_id, product_id, qty, unit_price_cents)
  select v_sale, i.key, (i.value #>> '{}')::int, (v_prices ->> i.key)::bigint -- rule:sale-unit-price
    from jsonb_each(v_items) i;
  if v_total > 0 and v_voided is null then
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, sale_id, created_by)
    values ('sale', 'Bazaar', 'Stall sale ' || v_client, v_total, v_at, v_sale, auth.uid())
    returning id into v_ledger;
    update public.event_sales s set ledger_id = v_ledger where s.id = v_sale;
  end if;

  -- C2: the sale's pouches and bag come off stock on this first insert only; a replay returned above, and a sale that
  -- arrives already voided uses nothing.
  if v_voided is null then -- rule:sale-packaging-live
    perform public.record_sale_packaging(v_sale, (select sum((i.value #>> '{}')::int) from jsonb_each(v_items) i)::integer, v_at);
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'event_sale.recorded', 'event_sales', v_sale::text,
    jsonb_build_object('client_id', v_client, 'event_id', v_event, 'total_cents', v_total,
      'voided_on_arrival', v_voided is not null));

  return query select v_client, v_sale, false, v_voided is not null;
end;
$$;
revoke execute on function public.record_event_sale(jsonb) from public, anon, authenticated;
grant execute on function public.record_event_sale(jsonb) to authenticated;
