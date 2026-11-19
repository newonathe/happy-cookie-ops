-- S3 (20 November 2026): helper accounts that Cine manages, with an expiry, who can only sell at the open bazaar day.
--
-- Ethan and Cine, 19 November: Cine registers a helper's email in the app with an expiry (hours, days, weeks or permanent); the helper
-- signs in with email and password, lands on the bazaar day that is open now, and may sell, take back their own sales, record a stall
-- expense and close the day. Everything else stays Cine's. An expired or removed helper is refused everywhere, at once.
--
--   profiles.access_expires_at   null = permanent. current_role_name() gives an expired profile no role, so is_owner(), is_staff() and
--                                every policy and RPC that asks them refuse it with no further change. is_active_helper() is internal.
--   helper_invites               a registered email that has no account yet. The account itself is made by the Edge Function
--                                create-helper-account (service role), which reads the expiry from here, never from the caller.
--   list_people / add_helper / set_helper_expiry / revoke_helper   owner only, audited. A helper's email is read from auth.users here.
--   get_open_bazaar_day()        the one day that is open now (id, booking, name, date, event), for the owner or an active helper.
--   bazaar_event_open / bazaar_day_open   internal: ONE definition of "open" (a started day whose event is not closed); no API grant.
--   bazaar_day_access            widened as S2 promised: the owner, or an active helper on an open day. get_bazaar_day follows.
--   event_sales.recorded_by      who rang a sale up (auth.uid()), so a helper can take back only their own. Older rows are null.
--   record_event_sale, void_event_sale, add_event_expense, close_bazaar_day   each redefined whole from its latest definition
--                                (009300, 003200, 003300, 006800) with the marked S3 lines added. Each answers a repeat first and
--                                judges the open day after, so a phone that is retrying is still acknowledged after the day closed.
--
-- Not changed: every other function and table. A helper is still refused on orders, money, stock, plans, prices, costs, the review
-- and the finalise (their owner checks are untouched). The Edge Function and the app degrade cleanly on a database without this file.

alter table public.profiles add column access_expires_at timestamptz;
comment on column public.profiles.access_expires_at is
  'null = permanent. After this moment the profile has no role (current_role_name returns null); set by the owner for a helper.';

create table public.helper_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and length(email) between 3 and 254),
  access_expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.helper_invites enable row level security;
revoke all on table public.helper_invites from public, anon, authenticated;

alter table public.event_sales add column recorded_by uuid references public.profiles (id) on delete set null;

-- Redefined from 20260101001100 with the expiry; a profile past its expiry has no role.
create or replace function public.current_role_name() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles as p
  where p.id = auth.uid() and p.active is true and (p.access_expires_at is null or p.access_expires_at > now())
$$;

create or replace function public.is_active_helper()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role_name() = 'helper', false);
$$;
revoke execute on function public.is_active_helper() from public, anon, authenticated, service_role;

-- The one definition of "open": a started day whose event has not been closed.
create or replace function public.bazaar_event_open(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bazaar_days d join public.events e on e.id = d.event_id
                  where d.event_id = p_event and e.closed_at is null);
$$;
revoke execute on function public.bazaar_event_open(uuid) from public, anon, authenticated, service_role;

create or replace function public.bazaar_day_open(p_day uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bazaar_days d join public.events e on e.id = d.event_id
                  where d.id = p_day and e.closed_at is null);
$$;
revoke execute on function public.bazaar_day_open(uuid) from public, anon, authenticated, service_role;

-- S2's hook, widened: the owner, or an active helper on a day that is open now.
create or replace function public.bazaar_day_access(p_day uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_owner() or (public.is_active_helper() and public.bazaar_day_open(p_day));
$$;
revoke execute on function public.bazaar_day_access(uuid) from public, anon, authenticated, service_role;

/**
 * The day that is open now, for the owner or an active helper: { day_id, booking_id, name, day (YYYY-MM-DD), event_id }, or null when
 * none is open. A helper's till is built from this and get_bazaar_day. 42501 for anyone else.
 */
create or replace function public.get_open_bazaar_day()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r record;
begin
  if not (public.is_owner() or public.is_active_helper()) then -- rule:open-day-role
    raise exception 'you may not read the open day' using errcode = '42501';
  end if;
  select d.id, d.scheduled_id, s.name, d.day, d.event_id into v_r
    from public.bazaar_days d
    join public.events e on e.id = d.event_id
    join public.scheduled_events s on s.id = d.scheduled_id
   where e.closed_at is null
   order by e.starts_at desc
   limit 1;
  if not found then
    return null;
  end if;
  return jsonb_build_object('day_id', v_r.id, 'booking_id', v_r.scheduled_id, 'name', v_r.name,
                            'day', to_char(v_r.day, 'YYYY-MM-DD'), 'event_id', v_r.event_id);
end;
$$;
revoke execute on function public.get_open_bazaar_day() from public, anon, authenticated;
grant execute on function public.get_open_bazaar_day() to authenticated;

-- ------------------------------------------------------------------ the people Cine manages

/**
 * Everyone with an account, and every registered email still waiting for one. [{ id, kind ('profile' | 'invite'), email, name, role,
 * state ('active' | 'expired' | 'removed' | 'waiting'), expires_at (ms or null = permanent) }]. Owner only.
 */
create or replace function public.list_people()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then -- rule:people-owner
    raise exception 'only the owner may list the people' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x.j order by x.ord, x.nm) from (
      select jsonb_build_object('id', p.id, 'kind', 'profile', 'email', u.email, 'name', p.display_name, 'role', p.role,
               'state', case when not p.active then 'removed'
                             when p.access_expires_at is not null and p.access_expires_at <= now() then 'expired' else 'active' end,
               'expires_at', case when p.access_expires_at is null then null
                                  else round(extract(epoch from p.access_expires_at) * 1000)::bigint end) as j,
             case p.role when 'owner' then 0 else 1 end as ord, lower(p.display_name) as nm
        from public.profiles p left join auth.users u on u.id = p.id
      union all
      select jsonb_build_object('id', i.id, 'kind', 'invite', 'email', i.email, 'name', split_part(i.email, '@', 1), 'role', 'helper',
               'state', 'waiting',
               'expires_at', case when i.access_expires_at is null then null
                                  else round(extract(epoch from i.access_expires_at) * 1000)::bigint end),
             2, i.email
        from public.helper_invites i
    ) x), '[]'::jsonb);
end;
$$;
revoke execute on function public.list_people() from public, anon, authenticated;
grant execute on function public.list_people() to authenticated;

/**
 * Registers a helper by email with an expiry (null = permanent; otherwise in the future, within five years). A new email waits in
 * helper_invites for the Edge Function to make the account. An email that already belongs to a removed or expired helper is given
 * access again on the spot (same password); one that belongs to anyone else is refused. Returns { id, kind ('invite' | 'profile') }.
 */
create or replace function public.add_helper(p_email text, p_expires_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
  v_role public.app_role;
  v_id uuid;
begin
  if not public.is_owner() then -- rule:people-owner
    raise exception 'only the owner may add a helper' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(v_email) > 254 then
    raise exception 'that is not an email address' using errcode = '22023';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '5 years') then -- rule:expiry-range
    raise exception 'the expiry must be in the future, within five years, or none' using errcode = '22023';
  end if;
  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is not null then
    select p.role into v_role from public.profiles p where p.id = v_user;
    if v_role is distinct from 'helper' then -- rule:add-not-helper
      raise exception 'that email already belongs to someone who is not a helper' using errcode = '23505';
    end if;
    update public.profiles p set active = true, access_expires_at = p_expires_at where p.id = v_user;
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'helper.readded', 'profiles', v_user::text, jsonb_build_object('expires_at', p_expires_at));
    return jsonb_build_object('id', v_user, 'kind', 'profile');
  end if;
  insert into public.helper_invites (email, access_expires_at, created_by)
  values (v_email, p_expires_at, auth.uid())
  on conflict (email) do update set access_expires_at = excluded.access_expires_at
  returning id into v_id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'helper.added', 'helper_invites', v_id::text, jsonb_build_object('expires_at', p_expires_at));
  return jsonb_build_object('id', v_id, 'kind', 'invite');
end;
$$;
revoke execute on function public.add_helper(text, timestamptz) from public, anon, authenticated;
grant execute on function public.add_helper(text, timestamptz) to authenticated;

-- Changes a helper's expiry (a profile or a waiting invite). Never an owner or support profile.
create or replace function public.set_helper_expiry(p_id uuid, p_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  if not public.is_owner() then -- rule:people-owner
    raise exception 'only the owner may change a helper' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'a person is required' using errcode = '22023';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '5 years') then -- rule:expiry-range
    raise exception 'the expiry must be in the future, within five years, or none' using errcode = '22023';
  end if;
  select p.role into v_role from public.profiles p where p.id = p_id;
  if found then
    if v_role <> 'helper' then -- rule:helper-only
      raise exception 'only a helper can be changed here' using errcode = '42501';
    end if;
    update public.profiles p set access_expires_at = p_expires_at where p.id = p_id;
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'helper.expiry_set', 'profiles', p_id::text, jsonb_build_object('expires_at', p_expires_at));
    return;
  end if;
  update public.helper_invites i set access_expires_at = p_expires_at where i.id = p_id;
  if not found then
    raise exception 'no such helper' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'helper.expiry_set', 'helper_invites', p_id::text, jsonb_build_object('expires_at', p_expires_at));
end;
$$;
revoke execute on function public.set_helper_expiry(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.set_helper_expiry(uuid, timestamptz) to authenticated;

-- Ends a helper's access at once (a profile is made inactive; a waiting invite is deleted). Never an owner or support profile.
create or replace function public.revoke_helper(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  if not public.is_owner() then -- rule:people-owner
    raise exception 'only the owner may remove a helper' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'a person is required' using errcode = '22023';
  end if;
  select p.role into v_role from public.profiles p where p.id = p_id;
  if found then
    if v_role <> 'helper' then -- rule:helper-only
      raise exception 'only a helper can be removed here' using errcode = '42501';
    end if;
    update public.profiles p set active = false where p.id = p_id;
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'helper.revoked', 'profiles', p_id::text, '{}'::jsonb);
    return;
  end if;
  delete from public.helper_invites i where i.id = p_id;
  if not found then
    raise exception 'no such helper' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'helper.revoked', 'helper_invites', p_id::text, '{}'::jsonb);
end;
$$;
revoke execute on function public.revoke_helper(uuid) from public, anon, authenticated;
grant execute on function public.revoke_helper(uuid) to authenticated;

-- ------------------------------------------------------------------ the four commands a helper may use, on the open day

-- record_event_sale, as it was (20260101009300) with the S3 lines marked below: an active helper may sell the open day, and the
-- sale records who rang it up.
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
  -- S3: an active helper may sell too, on the day that is open now (judged below, after a repeat has been answered).
  if not (public.is_owner() or public.is_active_helper()) then -- rule:sale-role
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
  -- S3: a helper sells only the event of a bazaar day that is open now.
  if not public.is_owner() and not public.bazaar_event_open(v_event) then -- rule:helper-sale-open-day
    raise exception 'a helper may sell only on the day that is open now' using errcode = '42501';
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
    pay_method, pay_ref, tendered_cents, change_cents, clerk, sold_at, voided_at, payload_hash, recorded_by)
  values (v_client, v_event, v_gross, v_discount, v_total, v_pay, v_ref, v_tendered, v_change,
    v_clerk, v_at, v_voided, v_hash, auth.uid()) -- S3: who rang it up
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


-- void_event_sale, as it was (20260101003200) with the S3 lines marked below: an active helper may take back only a sale they rang up.
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
  if not (public.is_owner() or public.is_active_helper()) then -- rule:void-role
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
  -- S3: a helper takes back only a sale they rang up themselves, on the day that is open now (or one already voided, so a
  -- repeat is still answered after the day closed). A void of a sale the server does not hold is never planted for a helper:
  -- it could not tell whose sale arrives later.
  if not public.is_owner() and not (v_hit and coalesce(v_sale.recorded_by = auth.uid(), false)
                                    and (v_sale.voided_at is not null or public.bazaar_event_open(v_sale.event_id))) then -- rule:helper-void-own
    raise exception 'a helper may void only a sale they rang up on the open day' using errcode = '42501';
  end if;

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
revoke execute on function public.void_event_sale(jsonb) from public, anon, authenticated;
grant execute on function public.void_event_sale(jsonb) to authenticated;

-- add_event_expense, as it was (20260101003300) with the S3 lines marked below: an active helper may record a stall expense on the open day.
create or replace function public.add_event_expense(p_expense jsonb)
returns table (client_id text, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client text;
  v_event uuid;
  v_label text;
  v_category text;
  v_amount bigint;
  v_at timestamptz;
  v_hash text;
  v_seen text;
  v_ev public.events%rowtype;
  v_ledger uuid;
begin
  if not (public.is_owner() or public.is_active_helper()) then -- rule:expense-role
    raise exception 'only the owner may add an event expense' using errcode = '42501';
  end if;
  if p_expense is null or jsonb_typeof(p_expense) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_expense) k
                 where k <> all (array['clientId','eventId','label','category','amountCents','at'])) then
    raise exception 'expense has a missing or unknown key' using errcode = '22023';
  end if;
  v_client := p_expense ->> 'clientId';
  v_label := btrim(p_expense ->> 'label');
  v_category := btrim(p_expense ->> 'category');
  if jsonb_typeof(p_expense -> 'clientId') is distinct from 'string' or length(v_client) not between 1 and 160
     or jsonb_typeof(p_expense -> 'eventId') is distinct from 'string'
     or (p_expense ->> 'eventId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_expense -> 'label') is distinct from 'string' or v_label = '' or length(v_label) > 80
     or jsonb_typeof(p_expense -> 'category') is distinct from 'string' or v_category = '' or length(v_category) > 40
     or jsonb_typeof(p_expense -> 'amountCents') is distinct from 'number' or (p_expense ->> 'amountCents') !~ '^[1-9][0-9]{0,9}$'
     or jsonb_typeof(p_expense -> 'at') is distinct from 'number' or (p_expense ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'expense fields are malformed' using errcode = '22023';
  end if;
  v_event := (p_expense ->> 'eventId')::uuid;
  v_amount := (p_expense ->> 'amountCents')::bigint;
  v_at := to_timestamp((p_expense ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then
    raise exception 'expense time is in the future' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event_expense:' || v_client, 0));
  v_hash := encode(sha256(convert_to(p_expense::text, 'UTF8')), 'hex');
  select x.payload_hash into v_seen from public.event_expenses x where x.client_id = v_client;
  if found then
    if v_seen <> v_hash then
      raise exception 'client id was already used for a different expense' using errcode = '23505';
    end if;
    return query select v_client, true;
    return;
  end if;

  select * into v_ev from public.events e where e.id = v_event;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  -- S3: a helper adds a stall expense only to the event of the bazaar day that is open now.
  if not public.is_owner() and not public.bazaar_event_open(v_event) then -- rule:helper-expense-open-day
    raise exception 'a helper may add an expense only on the day that is open now' using errcode = '42501';
  end if;

  insert into public.event_expenses (client_id, event_id, label, category, amount_cents, spent_at, payload_hash)
  values (v_client, v_event, v_label, v_category, v_amount, v_at, v_hash);
  insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
  values ('cost', v_category, v_ev.name || ' — ' || v_label, -v_amount, v_at, auth.uid())
  returning id into v_ledger;
  update public.event_expenses x set ledger_id = v_ledger where x.client_id = v_client;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'event.expense_added', 'event_expenses', v_client,
    jsonb_build_object('event_id', v_event, 'amount_cents', v_amount, 'category', v_category));
  return query select v_client, false;
end;
$$;
revoke execute on function public.add_event_expense(jsonb) from public, anon, authenticated;
grant execute on function public.add_event_expense(jsonb) to authenticated;

-- close_bazaar_day, as it was (20260101006800) with the S3 lines marked below: an active helper may close the day that is open now.
create or replace function public.close_bazaar_day(p_close jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day     uuid;
  v_booking uuid;
  v_at      timestamptz;
  v_counted bigint;
  v_lines   jsonb;
  v_hash    text;
  v_d       public.bazaar_days%rowtype;
  v_e       public.events%rowtype;
  v_s       public.scheduled_events%rowtype;
  v_sum     jsonb;
  v_dayj    jsonb;
  v_bad     boolean;
  v_till    jsonb;
  v_helper  boolean := not public.is_owner();
begin
  -- S3: an active helper may close the day that is open now. What they send is the same shape; the server decides the split
  -- (below), skips the owner's review hash, and answers with a bare acknowledgement, never the booking's money.
  if not (public.is_owner() or public.is_active_helper()) then -- rule:close-role
    raise exception 'only the owner may close a bazaar day' using errcode = '42501';
  end if;
  if p_close is null or jsonb_typeof(p_close) <> 'object' then
    raise exception 'a close must be an object' using errcode = '22023';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(p_close) k) is distinct from array['at', 'cash_cents', 'counted_cents', 'day_id', 'expected', 'lines', 'sales_count']
           or jsonb_typeof(p_close -> 'day_id') <> 'string'
           or (p_close ->> 'day_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(p_close -> 'at') <> 'number' or (p_close ->> 'at') !~ '^[0-9]{12,14}$'
           or jsonb_typeof(p_close -> 'counted_cents') not in ('number', 'null')
           or (jsonb_typeof(p_close -> 'counted_cents') = 'number' and (p_close ->> 'counted_cents') !~ '^[0-9]{1,12}$')
           or jsonb_typeof(p_close -> 'expected') <> 'string' or (p_close ->> 'expected') !~ '^[0-9a-f]{64}$'
           or jsonb_typeof(p_close -> 'lines') <> 'object'
           or jsonb_typeof(p_close -> 'sales_count') not in ('number', 'null')
           or (jsonb_typeof(p_close -> 'sales_count') = 'number' and (p_close ->> 'sales_count') !~ '^[0-9]{1,6}$')
           or jsonb_typeof(p_close -> 'cash_cents') not in ('number', 'null')
           or (jsonb_typeof(p_close -> 'cash_cents') = 'number' and (p_close ->> 'cash_cents') !~ '^[0-9]{1,12}$')
           or jsonb_typeof(p_close -> 'sales_count') <> jsonb_typeof(p_close -> 'cash_cents');
  if v_bad then -- rule:close-shape
    raise exception 'a close carries exactly day_id, at, counted_cents (whole or null), lines, expected, and sales_count with cash_cents '
                    '(both whole, or both null when the phone closing it is not the one selling it)' using errcode = '22023';
  end if;
  v_lines := p_close -> 'lines';
  v_bad := exists (select 1 from jsonb_each(v_lines) i
                    where case when jsonb_typeof(i.value) <> 'object' then true
                               else (select array_agg(k order by k) from jsonb_object_keys(i.value) k) is distinct from array['carry_next', 'left', 'to_shop', 'written_off']
                                    or exists (select 1 from jsonb_each(i.value) q
                                                where jsonb_typeof(q.value) <> 'number' or (q.value #>> '{}') !~ '^[0-9]{1,5}$') end);
  if v_bad then -- rule:close-line-shape
    raise exception 'each flavour carries exactly left, carry_next, to_shop and written_off, whole and 0 or more' using errcode = '22023';
  end if;
  v_day := (p_close ->> 'day_id')::uuid;
  v_at := to_timestamp((p_close ->> 'at')::bigint / 1000.0);
  v_counted := (p_close ->> 'counted_cents')::bigint;
  select d.scheduled_id into v_booking from public.bazaar_days d where d.id = v_day;
  if v_booking is null then -- rule:close-day-missing
    raise exception 'that day does not exist' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  v_hash := encode(sha256(convert_to(p_close::text, 'UTF8')), 'hex');
  select * into v_d from public.bazaar_days d where d.id = v_day for update;
  if v_d.event_id is null then -- rule:close-not-started
    raise exception 'that day has not started' using errcode = '55000';
  end if;
  select * into v_e from public.events e where e.id = v_d.event_id for update;
  if v_e.closed_at is not null then
    if v_d.closed_hash is distinct from v_hash then -- rule:close-replay-conflict
      raise exception 'that day was already closed differently' using errcode = '23505';
    end if;
    if v_helper then
      return jsonb_build_object('closed', true, 'day_id', v_day);
    end if;
    return public.bazaar_summary(v_booking);
  end if;
  select * into v_s from public.scheduled_events s where s.id = v_booking;
  -- S3: a helper does not decide where the left cookies go. They count what is on the table; what is left carries to the next
  -- day of the booking, or on its last day goes to the shop. Nothing is written off by a helper.
  if v_helper then -- rule:helper-close-split
    select coalesce(jsonb_object_agg(i.key, jsonb_build_object('left', i.value -> 'left',
             'carry_next', case when v_d.day = v_s.ends_on then 0 else (i.value ->> 'left')::integer end,
             'to_shop', case when v_d.day = v_s.ends_on then (i.value ->> 'left')::integer else 0 end,
             'written_off', 0)), '{}'::jsonb) into v_lines from jsonb_each(v_lines) i;
  end if;
  v_bad := v_at > now() + interval '1 day' or v_at < v_e.starts_at - interval '1 day';
  if v_bad then -- rule:close-at
    raise exception 'the close time is in the future or before the day started' using errcode = '22023';
  end if;
  select public.bazaar_summary(v_booking) into v_sum;
  select x into v_dayj from jsonb_array_elements(v_sum -> 'days') x where x ->> 'id' = v_day::text;
  if not v_helper and (v_dayj ->> 'hash') is distinct from (p_close ->> 'expected') then -- rule:close-stale
    raise exception 'the day changed since it was shown: read it again' using errcode = '40001';
  end if;
  -- S3.1 (M1): the selling phone says how many sales it holds for the day and their cash. The server owns the check: until it
  -- holds the same, a sale is still on the phone, and the close is refused as close_event refused it. Both null: another phone
  -- closes it without the till (rule 1 of the run sheet), and the audit row says so.
  v_till := case when jsonb_typeof(p_close -> 'sales_count') = 'number'
                 then jsonb_build_object('sales_count', (p_close ->> 'sales_count')::integer, 'cash_cents', (p_close ->> 'cash_cents')::bigint) end;
  v_bad := v_till is not null and ((v_till ->> 'sales_count')::integer <> (v_dayj ->> 'sales')::integer
                                   or (v_till ->> 'cash_cents')::bigint <> (v_dayj ->> 'cash_sales_cents')::bigint);
  if v_bad then -- rule:close-till
    raise exception 'the server does not hold all of this phone''s sales yet: sync, then read the day again' using errcode = '40001';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(v_lines) k)
           is distinct from (select array_agg(l.product_id order by l.product_id) from public.bazaar_day_lines l where l.day_id = v_day);
  if v_bad then -- rule:close-lines
    raise exception 'the count names every flavour of the day and no other' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_each(v_lines) i
                    where (i.value ->> 'left')::integer
                          <> (i.value ->> 'carry_next')::integer + (i.value ->> 'to_shop')::integer + (i.value ->> 'written_off')::integer);
  if v_bad then -- rule:close-split
    raise exception 'what is left is what carries over, goes to the shop and is written off, together' using errcode = '22023';
  end if;
  v_bad := v_d.day = v_s.ends_on and exists (select 1 from jsonb_each(v_lines) i where (i.value ->> 'carry_next')::integer > 0);
  if v_bad then -- rule:close-carry-last-day
    raise exception 'nothing carries over from the booking''s last day' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_dayj -> 'lines') f
                    where (f ->> 'made')::integer + (f ->> 'carried')::integer - (f ->> 'sold')::integer - (f ->> 'given')::integer
                          - (f ->> 'lost')::integer - (v_lines -> (f ->> 'product_id') ->> 'left')::integer < 0);
  if v_bad then -- rule:close-negative
    raise exception 'a flavour has more left than was there: if more was made than the plan says, add that stock first' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from public.event_sales s where s.event_id = v_d.event_id and s.voided_at is null and s.sold_at > v_at);
  if v_bad then -- rule:close-sale-after
    raise exception 'a sale was made after the close time' using errcode = '22023';
  end if;

  update public.bazaar_day_lines as l
     set left_qty = (i.value ->> 'left')::integer, carry_next_qty = (i.value ->> 'carry_next')::integer,
         to_shop_qty = (i.value ->> 'to_shop')::integer, written_off_qty = (i.value ->> 'written_off')::integer
    from jsonb_each(v_lines) i
   where l.day_id = v_day and l.product_id = i.key;
  update public.events as e
     set closed_at = v_at, counted_cents = v_counted,
         variance_cents = v_counted - (v_dayj ->> 'cash_expected_cents')::bigint,
         returned = (select coalesce(jsonb_object_agg(i.key, i.value -> 'left'), '{}'::jsonb) from jsonb_each(v_lines) i),
         closed_hash = v_hash
   where e.id = v_d.event_id;
  -- Her review is the day as the summary gives it now, with her count: what she was shown and what she answered.
  select public.bazaar_summary(v_booking) into v_sum;
  select x into v_dayj from jsonb_array_elements(v_sum -> 'days') x where x ->> 'id' = v_day::text;
  update public.bazaar_days as d set closed_review = v_dayj, closed_hash = v_hash where d.id = v_day;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.day_closed', 'bazaar_days', v_day::text,
    jsonb_build_object('scheduled_id', v_booking, 'event_id', v_d.event_id, 'counted_cents', v_counted,
      'expected_cents', (v_dayj ->> 'cash_expected_cents')::bigint, 'hash', v_dayj ->> 'hash', 'till', v_till,
      'by_helper', v_helper));
  if v_helper then
    return jsonb_build_object('closed', true, 'day_id', v_day);
  end if;
  return public.bazaar_summary(v_booking);
end;
$$;
revoke execute on function public.close_bazaar_day(jsonb) from public, anon, authenticated;
grant execute on function public.close_bazaar_day(jsonb) to authenticated;
