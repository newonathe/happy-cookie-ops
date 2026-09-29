-- D1: bazaar events and idempotent offline sales (docs/state/finish-plan.md, slice D1).
--
-- Replaces the archived /api/sync intake. The stall phone queues each sale under a
-- client-generated id and retries until the server acknowledges that id, so every command
-- here is safe to repeat, in any order:
--   start_event        the owner opens an event ONLINE; the menu prices are copied onto it
--                      then (DP-20: a later online price change never reaches a running
--                      event) and one selling device is designated (decision 5). The phone
--                      may send its own event id, so a retry after a lost reply returns the
--                      same event instead of opening a second one.
--   set_event_device   the owner moves selling to another phone; the old phone stays
--                      accepted, so sales it still holds are not lost.
--   record_event_sale  one sale, keyed on its client id and a hash of its body (MASTER-PLAN:
--                      idempotency key plus payload hash). Prices come from the event
--                      snapshot, never from the client or the live menu. The same id with a
--                      different body is refused (23505), never acknowledged, so the phone
--                      keeps the sale it still holds.
--   void_event_sale    a void is a marker on the same client id that never clears, so a
--                      void that arrives before its sale, twice, or after a stale retry of
--                      the sale all end in the same voided sale.
--
-- Callers are the active owner only, as for every private table since MP-06j; the assigned
-- helper needs a later scoped command (DP-18). The device id lives in the phone's
-- localStorage, so the designated-device rule is an operational guard against a second
-- phone selling by mistake, not a security boundary: RLS and the owner check are.
--
-- A sale whose figures disagree with the snapshot is REFUSED (22023), not repaired: the
-- cash was already taken at the client's figures, so silently re-pricing would misstate
-- the till. The phone keeps that sale queued as failed and visible.

alter table public.events
  add column selling_device text
    check (selling_device is null or selling_device ~ '^[A-Za-z0-9_-]{1,64}$'),
  add column former_devices text[] not null default '{}',
  add column price_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(price_snapshot) = 'object');

alter table public.event_sales
  add column voided_at timestamptz,
  add column payload_hash text check (payload_hash is null or payload_hash ~ '^[0-9a-f]{64}$');

create table public.event_sale_voids (
  client_id text primary key check (length(client_id) between 1 and 160),
  device_id text not null check (device_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  voided_at timestamptz not null,
  received_at timestamptz not null default now()
);
alter table public.event_sale_voids enable row level security;
revoke all on table public.event_sale_voids from public, anon, authenticated;

-- ------------------------------------------------------------------ start_event

create or replace function public.start_event(p_name text, p_device text, p_float_cents bigint default 0, p_event_id uuid default null)
returns table (event_id uuid, starts_at timestamptz, selling_device text, prices jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id uuid := coalesce(p_event_id, gen_random_uuid());
  v_prices jsonb;
  v_start timestamptz := now();
  v_ev public.events%rowtype;
begin
  if not public.is_owner() then
    raise exception 'only the owner may start an event' using errcode = '42501';
  end if;
  if p_name is null or btrim(p_name) = '' or length(p_name) > 80 then
    raise exception 'event name must be 1-80 characters' using errcode = '22023';
  end if;
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'selling device id is malformed' using errcode = '22023';
  end if;
  if p_float_cents is null or p_float_cents < 0 or p_float_cents > 100000000 then
    raise exception 'float must be between 0 and 1,000,000 pesos' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event:' || v_id::text, 0));
  select * into v_ev from public.events e where e.id = v_id;
  if found then
    if v_ev.name <> btrim(p_name) or v_ev.float_cents <> p_float_cents then
      raise exception 'event id was already used for a different event' using errcode = '23505';
    end if;
    return query select v_ev.id, v_ev.starts_at, v_ev.selling_device, v_ev.price_snapshot;
    return;
  end if;

  select coalesce(jsonb_object_agg(p.id, p.price_cents), '{}'::jsonb) into v_prices
    from public.products p where p.active;
  if v_prices = '{}'::jsonb then
    raise exception 'no active flavours to sell' using errcode = '22023';
  end if;

  insert into public.events (id, name, starts_at, float_cents, selling_device, price_snapshot)
  values (v_id, btrim(p_name), v_start, p_float_cents, p_device, v_prices);

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'event.started', 'events', v_id::text,
    jsonb_build_object('device', p_device, 'float_cents', p_float_cents));

  return query select v_id, v_start, p_device, v_prices;
end;
$$;

-- ------------------------------------------------------------------ set_event_device

create or replace function public.set_event_device(p_event uuid, p_device text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev public.events%rowtype;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the selling device' using errcode = '42501';
  end if;
  if p_event is null or p_device is null or p_device !~ '^[A-Za-z0-9_-]{1,64}$' then
    raise exception 'event and device are required' using errcode = '22023';
  end if;
  select * into v_ev from public.events e where e.id = p_event for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if v_ev.closed_at is not null then
    raise exception 'event is closed' using errcode = '55000';
  end if;
  if v_ev.selling_device is distinct from p_device then
    update public.events e
       set selling_device = p_device,
           former_devices = array_remove(
             case when v_ev.selling_device is null then e.former_devices
                  else array_append(array_remove(e.former_devices, v_ev.selling_device), v_ev.selling_device) end,
             p_device)
     where e.id = p_event;
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'event.device_changed', 'events', p_event::text,
      jsonb_build_object('from', v_ev.selling_device, 'to', p_device));
  end if;
  return p_device;
end;
$$;

-- ------------------------------------------------------------------ record_event_sale

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
  select v_sale, i.key, (i.value #>> '{}')::int, (v_ev.price_snapshot ->> i.key)::bigint
    from jsonb_each(v_items) i;
  if v_total > 0 and v_voided is null then
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, sale_id, created_by)
    values ('sale', 'Bazaar', 'Stall sale ' || v_client, v_total, v_at, v_sale, auth.uid())
    returning id into v_ledger;
    update public.event_sales s set ledger_id = v_ledger where s.id = v_sale;
  end if;

  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'event_sale.recorded', 'event_sales', v_sale::text,
    jsonb_build_object('client_id', v_client, 'event_id', v_event, 'total_cents', v_total,
      'voided_on_arrival', v_voided is not null));

  return query select v_client, v_sale, false, v_voided is not null;
end;
$$;

-- ------------------------------------------------------------------ void_event_sale

create or replace function public.void_event_sale(p_void jsonb)
returns table (client_id text, sale_known boolean, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client text;
  v_device text;
  v_at timestamptz;
  v_marker boolean;
  v_sale public.event_sales%rowtype;
  v_hit boolean := false;
begin
  if not public.is_owner() then
    raise exception 'only the owner may void a bazaar sale' using errcode = '42501';
  end if;
  if p_void is null or jsonb_typeof(p_void) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_void) k where k <> all (array['clientId','deviceId','at'])) then
    raise exception 'void must be an object with clientId, deviceId and at' using errcode = '22023';
  end if;
  v_client := p_void ->> 'clientId';
  v_device := p_void ->> 'deviceId';
  if jsonb_typeof(p_void -> 'clientId') is distinct from 'string' or length(v_client) not between 1 and 160
     or jsonb_typeof(p_void -> 'deviceId') is distinct from 'string' or v_device !~ '^[A-Za-z0-9_-]{1,64}$'
     or left(v_client, length(v_device) + 1) <> v_device || ':' then
    raise exception 'clientId must start with the device id' using errcode = '22023';
  end if;
  if jsonb_typeof(p_void -> 'at') is distinct from 'number' or (p_void ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'at must be milliseconds since 1970' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_void ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then
    raise exception 'void time is in the future' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event_sale:' || v_client, 0));

  select s.* into v_sale from public.event_sales s where s.client_id = v_client;
  v_hit := found;

  insert into public.event_sale_voids (client_id, device_id, voided_at)
  values (v_client, v_device, v_at)
  on conflict do nothing;
  v_marker := found;

  if v_hit and v_sale.voided_at is null then
    update public.event_sales s set voided_at = v_at where s.id = v_sale.id;
    if v_sale.total_cents > 0 then
      insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, sale_id, created_by)
      values ('sale', 'Bazaar', 'Void of stall sale ' || v_client, -v_sale.total_cents, v_at, v_sale.id, auth.uid());
    end if;
  end if;
  if v_marker then
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'event_sale.voided', case when v_hit then 'event_sales' else 'event_sale_voids' end,
      case when v_hit then v_sale.id::text else v_client end,
      jsonb_build_object('client_id', v_client, 'sale_known', v_hit, 'total_cents', v_sale.total_cents));
  end if;

  return query select v_client, v_hit, not v_marker;
end;
$$;

-- ------------------------------------------------------------------ authority

revoke execute on function public.start_event(text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.start_event(text, text, bigint, uuid) to authenticated;
revoke execute on function public.set_event_device(uuid, text) from public, anon, authenticated;
grant execute on function public.set_event_device(uuid, text) to authenticated;
revoke execute on function public.record_event_sale(jsonb) from public, anon, authenticated;
grant execute on function public.record_event_sale(jsonb) to authenticated;
revoke execute on function public.void_event_sale(jsonb) from public, anon, authenticated;
grant execute on function public.void_event_sale(jsonb) to authenticated;
