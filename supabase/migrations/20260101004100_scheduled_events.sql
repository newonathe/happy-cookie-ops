-- D4 (docs/state/finish-plan.md slice D4): the owner's list of upcoming bazaars.
--
-- Until now the Bazaar screen offered two hard-coded prototype events and the owner had no way to add one.
-- `scheduled_events` holds Cine's real bookings (name, dates, place, rent). Nothing is seeded: she enters them.
--
--   get_scheduled_events()   the owner's list, soonest first
--   save_scheduled_event()   create or change one booking (owner only, exact keys, stale stamp P0002; a create
--                            that is repeated with the same body after a lost reply is answered, not refused)
--   link_scheduled_event()   the app calls it after `start_event` succeeded for a booking: it records which
--                            event the booking became and tells the caller whether this was the FIRST link, so
--                            the stall rent is booked as an event expense exactly once (a retry gets false)
--
-- A booking is deactivated, never deleted. The table has no API grant and no policy.
-- Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it (as in B1).

create table public.scheduled_events (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  place text not null default '' check (length(place) <= 80),
  rent_cents bigint not null default 0 check (rent_cents between 0 and 100000000),
  active boolean not null default true,
  event_id uuid references public.events (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint scheduled_events_dates check (ends_on >= starts_on and ends_on - starts_on <= 14)
);
create index scheduled_events_starts_idx on public.scheduled_events (starts_on);
alter table public.scheduled_events enable row level security;
revoke all on table public.scheduled_events from public, anon, authenticated;
create trigger scheduled_events_touch before update on public.scheduled_events
for each row execute function public.touch_updated_at();

create or replace function public.get_scheduled_events()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read the scheduled events' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'starts_on', s.starts_on, 'ends_on', s.ends_on, 'place', s.place,
           'rent_cents', s.rent_cents, 'active', s.active, 'started', s.event_id is not null,
           'updated_at', s.updated_at) order by s.starts_on, s.name, s.id), '[]'::jsonb)
    into v_out
    from public.scheduled_events s;
  return v_out;
end;
$$;
revoke execute on function public.get_scheduled_events() from public, anon, authenticated;
grant execute on function public.get_scheduled_events() to authenticated;

/**
 * Creates (the id is minted by the browser, with no stamp) or changes (with the stamp the read returned) one
 * booking. The body is exactly these keys and nothing else: id, name, starts_on, ends_on, place, rent_cents, active.
 */
create or replace function public.save_scheduled_event(
  p_event jsonb,
  p_expected_updated_at timestamptz
)
returns table (id uuid, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys   text[];
  v_id     uuid;
  v_name   text;
  v_place  text;
  v_start  date;
  v_end    date;
  v_rent   numeric;
  v_active boolean;
  v_row    public.scheduled_events%rowtype;
  v_at     timestamptz;
  v_same   boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the scheduled events' using errcode = '42501';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'a scheduled event must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_event) k;
  if v_keys is distinct from array['active', 'ends_on', 'id', 'name', 'place', 'rent_cents', 'starts_on'] then -- rule:keys
    raise exception 'a scheduled event carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_event -> 'id') <> 'string' or jsonb_typeof(p_event -> 'name') <> 'string'
     or jsonb_typeof(p_event -> 'place') <> 'string' or jsonb_typeof(p_event -> 'starts_on') <> 'string'
     or jsonb_typeof(p_event -> 'ends_on') <> 'string' or jsonb_typeof(p_event -> 'rent_cents') <> 'number'
     or jsonb_typeof(p_event -> 'active') <> 'boolean' then
    raise exception 'a scheduled event field has the wrong type' using errcode = '22023';
  end if;
  if (p_event ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_event ->> 'id')::uuid;
  v_name := btrim(p_event ->> 'name');
  v_place := btrim(p_event ->> 'place');
  if length(v_name) not between 1 and 80 or length(v_place) > 80 or (v_name || v_place) ~ '[[:cntrl:]]' then -- rule:text
    raise exception 'the name is 1 to 80 characters and the place at most 80' using errcode = '22023';
  end if;
  if (p_event ->> 'starts_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or (p_event ->> 'ends_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'dates are YYYY-MM-DD' using errcode = '22023';
  end if;
  begin
    v_start := (p_event ->> 'starts_on')::date;
    v_end := (p_event ->> 'ends_on')::date;
  exception when others then
    raise exception 'a date is not a real date' using errcode = '22023';
  end;
  if v_end < v_start or v_end - v_start > 14 then -- rule:dates
    raise exception 'a booking ends on or after it starts, and lasts at most 15 days' using errcode = '22023';
  end if;
  v_rent := (p_event ->> 'rent_cents')::numeric;
  if v_rent <> trunc(v_rent) or v_rent not between 0 and 100000000 then -- rule:rent
    raise exception 'rent is whole centavos from 0 to 1,000,000 pesos' using errcode = '22023';
  end if;
  v_active := (p_event ->> 'active')::boolean;

  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_id::text, 0));
  select * into v_row from public.scheduled_events s where s.id = v_id;
  if not found then
    if p_expected_updated_at is not null then -- rule:create-stamp
      raise exception 'that booking does not exist' using errcode = 'P0002';
    end if;
    insert into public.scheduled_events (id, name, starts_on, ends_on, place, rent_cents, active)
    values (v_id, v_name, v_start, v_end, v_place, v_rent::bigint, v_active)
    returning updated_at into v_at;
    return query select v_id, v_at;
    return;
  end if;
  -- A lost reply on a create: the same body again is answered with the row that exists.
  if p_expected_updated_at is null then
    v_same := v_row.name = v_name and v_row.starts_on = v_start and v_row.ends_on = v_end and v_row.place = v_place
              and v_row.rent_cents = v_rent::bigint and v_row.active = v_active;
    if v_same then -- rule:replay
      return query select v_row.id, v_row.updated_at;
      return;
    end if;
    raise exception 'that booking already exists with other values' using errcode = 'P0002';
  end if;
  update public.scheduled_events as s set
      name = v_name, starts_on = v_start, ends_on = v_end, place = v_place,
      rent_cents = v_rent::bigint, active = v_active
    where s.id = v_id and date_trunc('milliseconds', s.updated_at) = date_trunc('milliseconds', p_expected_updated_at)
    returning s.updated_at into v_at;
  if v_at is null then -- rule:stale
    raise exception 'the booking changed since it was read' using errcode = 'P0002';
  end if;
  return query select v_id, v_at;
end;
$$;
revoke execute on function public.save_scheduled_event(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_scheduled_event(jsonb, timestamptz) to authenticated;

/**
 * The booking became this event (the app has just started it). Returns true for the first link and false for a
 * repeat, so the rent is booked once. A booking that is not active, or already became another event, is refused.
 */
create or replace function public.link_scheduled_event(p_scheduled uuid, p_event uuid)
returns table (first_link boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.scheduled_events%rowtype;
begin
  if not public.is_owner() then
    raise exception 'only the owner may link a scheduled event' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || p_scheduled::text, 0));
  select * into v_row from public.scheduled_events s where s.id = p_scheduled;
  if not found then -- rule:link-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.events e where e.id = p_event) then -- rule:link-event
    raise exception 'that event does not exist' using errcode = 'P0002';
  end if;
  if v_row.event_id is not null then
    if v_row.event_id <> p_event then -- rule:link-conflict
      raise exception 'that booking already became another event' using errcode = '23505';
    end if;
    return query select false;
    return;
  end if;
  if not v_row.active then -- rule:link-inactive
    raise exception 'that booking is switched off' using errcode = '22023';
  end if;
  update public.scheduled_events s set event_id = p_event where s.id = p_scheduled;
  return query select true;
end;
$$;
revoke execute on function public.link_scheduled_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_scheduled_event(uuid, uuid) to authenticated;
