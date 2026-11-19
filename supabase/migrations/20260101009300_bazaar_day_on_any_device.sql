-- S2 (19 November 2026): a bazaar selling day belongs to the account, not to a device.
--
-- Ethan: "the sales are not integrated to the acct used to make those sales but in the device which I dont want. Cine should be able
-- to continue no matter what browser or device she uses as long as it's her acct."
--
--   get_bazaar_day(day)   the one read of a selling day: its event, state, prices and version, the table stock worked out here, and
--                         every sale (with its items, who rang it, its client id and whether it was voided). A till on any device
--                         rebuilds the day from this. Nothing the client shows is worked out again from sales it holds. The
--                         role check is one internal helper (bazaar_day_access), so a later step can let a helper read an open day
--                         by changing that function alone.
--   record_event_sale     redefined from 20260101008500 with exactly one change: the "not the selling device" refusal (42501) is
--                         gone, so any device of an authorised caller may sell the same day at the same time. Idempotency is
--                         unchanged: the client id still starts with the device id (two devices can never share one) and a repeat
--                         of a client id is answered, or refused (23505) when the body differs. void_event_sale never had a device
--                         rule and is not redefined. set_event_device stays, and the app no longer calls it.
--
-- Grants: get_bazaar_day is granted to authenticated only; the helper has no API grant. record_event_sale keeps its grants.

-- The one place that decides who may read a day. The owner for now.
create or replace function public.bazaar_day_access(p_day uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_owner();
$$;
revoke execute on function public.bazaar_day_access(uuid) from public, anon, authenticated, service_role;

/**
 * One selling day as it stands on the server: { day_id, booking_id, day, event_id (null while only planned), status
 * (planned | open | closed), closed_at (ms or null), float_cents, price_version, prices (centavos by flavour, the latest list),
 * loaded (by flavour: made + carried), table_stock (by flavour: loaded less the sales that are not voided less the losses that are
 * not voided; below zero only if two devices sold the last cookie at once), sales: [{ client_id, items, gross_cents, discount_cents,
 * total_cents, pay, ref, clerk, at (ms), tendered_cents, change_cents, voided, voided_at (ms or null) }] oldest first }.
 * 42501 when the caller may not read it, P0002 when there is no such day, 22023 for a missing id.
 */
create or replace function public.get_bazaar_day(p_day uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_d public.bazaar_days%rowtype;
  v_e public.events%rowtype;
  v_loaded jsonb;
  v_stock jsonb;
  v_sales jsonb;
begin
  if not public.bazaar_day_access(p_day) then -- rule:day-read-access
    raise exception 'you may not read this day' using errcode = '42501';
  end if;
  if p_day is null then
    raise exception 'a day is required' using errcode = '22023';
  end if;
  select * into v_d from public.bazaar_days d where d.id = p_day;
  if not found then
    raise exception 'that day does not exist' using errcode = 'P0002';
  end if;
  if v_d.event_id is not null then
    select * into v_e from public.events e where e.id = v_d.event_id;
  end if;

  select coalesce(jsonb_object_agg(l.product_id, l.made_qty + l.carried_qty), '{}'::jsonb)
    into v_loaded from public.bazaar_day_lines l where l.day_id = p_day;
  select coalesce(jsonb_object_agg(l.product_id,
           l.made_qty + l.carried_qty - coalesce(q.sold, 0) - coalesce(x.lost, 0)), '{}'::jsonb)
    into v_stock
    from public.bazaar_day_lines l
    left join lateral (select sum(i.qty) as sold from public.event_sales s join public.event_sale_items i on i.sale_id = s.id
                        where s.event_id = v_d.event_id and s.voided_at is null and i.product_id = l.product_id) q on true
    left join lateral (select sum(o.qty) as lost from public.bazaar_losses o
                        where o.day_id = p_day and o.product_id = l.product_id and o.voided_at is null) x on true
   where l.day_id = p_day;

  select coalesce(jsonb_agg(jsonb_build_object(
           'client_id', s.client_id,
           'items', (select coalesce(jsonb_object_agg(i.product_id, i.qty), '{}'::jsonb)
                       from public.event_sale_items i where i.sale_id = s.id),
           'gross_cents', s.gross_cents, 'discount_cents', s.discount_cents, 'total_cents', s.total_cents,
           'pay', s.pay_method, 'ref', s.pay_ref, 'clerk', s.clerk,
           'at', round(extract(epoch from s.sold_at) * 1000)::bigint,
           'tendered_cents', s.tendered_cents, 'change_cents', s.change_cents,
           'voided', s.voided_at is not null,
           'voided_at', case when s.voided_at is null then null else round(extract(epoch from s.voided_at) * 1000)::bigint end)
         order by s.sold_at, s.client_id), '[]'::jsonb)
    into v_sales
    from public.event_sales s where s.event_id = v_d.event_id;

  return jsonb_build_object(
    'day_id', v_d.id,
    'booking_id', v_d.scheduled_id,
    'day', to_char(v_d.day, 'YYYY-MM-DD'),
    'event_id', v_d.event_id,
    'status', case when v_d.event_id is null then 'planned' when v_e.closed_at is null then 'open' else 'closed' end,
    'closed_at', case when v_e.closed_at is null then null else round(extract(epoch from v_e.closed_at) * 1000)::bigint end,
    'float_cents', v_d.float_cents,
    'price_version', case when v_d.event_id is null then 0
                          else coalesce((select max(pv.version) from public.event_price_versions pv where pv.event_id = v_d.event_id), 0) end,
    'prices', case when v_d.event_id is null
                   then (select coalesce(jsonb_object_agg(l.product_id, l.price_cents), '{}'::jsonb)
                           from public.bazaar_day_lines l where l.day_id = p_day)
                   else v_e.price_snapshot end,
    'loaded', v_loaded,
    'table_stock', v_stock,
    'sales', v_sales);
end;
$$;
revoke execute on function public.get_bazaar_day(uuid) from public, anon, authenticated;
grant execute on function public.get_bazaar_day(uuid) to authenticated;

-- record_event_sale, as it was (20260101008500) with the one change marked S2 below: any device of the owner may sell the day.
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
  -- S2: no refusal of a device that is not the selling one; any device of the owner may sell (the client id still carries its device).
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
