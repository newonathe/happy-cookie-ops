-- D2: bazaar close-out (docs/state/finish-plan.md, slice D2).
--
-- On top of D1's events: stock loaded onto the table, event expenses, the cash count and event
-- profit. Like D1's commands these are safe to repeat: the phone queues each one under a
-- client-generated key and re-sends it until the server names that key.
--   load_event_stock   sets what was put on the table and the drawer float, once. Only
--                      flavours in the event's price snapshot may be loaded, so a flavour that
--                      was off the menu at the start can never be offered at the table.
--   add_event_expense  one expense (rent, transport, ...), keyed on its client id and a hash of
--                      its body. It is posted to the ledger as a cost.
--   close_event        sets closed_at (D1 already refuses later sales), stores the cash count
--                      and the unsold stock, books a short drawer as a cost and an over drawer
--                      as takings, and returns the event summary. A repeat of the same close
--                      returns the same summary; a different close of the same event is
--                      refused (23505).
--   event_summary      the numbers for one event, computed from the rows every time: voided
--                      sales never count. Profit here is takings minus expenses plus the
--                      drawer variance; it leaves out ingredient cost, which needs the recipe
--                      costs (slice C2).
--
-- The close carries the phone's own figures (the drawer float and the cash it took). The server
-- closes only when its rows agree, and otherwise refuses with 40001 (serialization failure: the
-- phone treats it as "try again later"), so a close that overtakes a sale, a void or the stock load
-- on the way here is retried instead of booking the difference as a drawer variance.
--
-- Owner only, as for D1 (DP-18 still open for a helper at the table). Expense categories are
-- free text here (1-40 characters); the owner's own list is applied by the screen.

alter table public.events
  add column opened_at timestamptz,
  add column drawer_float_cents bigint check (drawer_float_cents is null or drawer_float_cents between 0 and 100000000),
  add column loaded jsonb not null default '{}'::jsonb check (jsonb_typeof(loaded) = 'object'),
  add column returned jsonb not null default '{}'::jsonb check (jsonb_typeof(returned) = 'object'),
  add column counted_cents bigint check (counted_cents is null or counted_cents >= 0),
  add column variance_cents bigint,
  add column closed_hash text check (closed_hash is null or closed_hash ~ '^[0-9a-f]{64}$');

create table public.event_expenses (
  client_id text primary key check (length(client_id) between 1 and 160),
  event_id uuid not null references public.events on delete cascade,
  label text not null check (btrim(label) <> '' and length(label) <= 80),
  category text not null check (btrim(category) <> '' and length(category) <= 40),
  amount_cents bigint not null check (amount_cents > 0),
  spent_at timestamptz not null,
  ledger_id uuid references public.ledger_entries on delete set null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null default now()
);
alter table public.event_expenses enable row level security;
revoke all on table public.event_expenses from public, anon, authenticated;

-- ------------------------------------------------------------------ event_summary

create or replace function public.event_summary(p_event uuid)
returns table (
  event_id uuid, name text, closed boolean,
  sales_count integer, voided_count integer, freebie_count integer, cookies_sold integer,
  revenue_cents bigint, expenses_cents bigint, variance_cents bigint, profit_cents bigint,
  float_cents bigint, cash_expected_cents bigint, counted_cents bigint,
  loaded jsonb, returned jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ev public.events%rowtype;
  v_revenue bigint;
  v_cash bigint;
  v_sales integer;
  v_voided integer;
  v_freebies integer;
  v_cookies integer;
  v_expenses bigint;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read an event summary' using errcode = '42501';
  end if;
  if p_event is null then
    raise exception 'event is required' using errcode = '22023';
  end if;
  select * into v_ev from public.events e where e.id = p_event;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(s.total_cents) filter (where s.voided_at is null), 0)::bigint,
         coalesce(sum(s.total_cents) filter (where s.voided_at is null and s.pay_method = 'Cash'), 0)::bigint,
         (count(*) filter (where s.voided_at is null))::integer,
         (count(*) filter (where s.voided_at is not null))::integer,
         (count(*) filter (where s.voided_at is null and s.total_cents = 0))::integer
    into v_revenue, v_cash, v_sales, v_voided, v_freebies
    from public.event_sales s where s.event_id = p_event;
  select coalesce(sum(i.qty), 0)::integer into v_cookies
    from public.event_sale_items i join public.event_sales s on s.id = i.sale_id
   where s.event_id = p_event and s.voided_at is null;
  select coalesce(sum(x.amount_cents), 0)::bigint into v_expenses
    from public.event_expenses x where x.event_id = p_event;

  return query select v_ev.id, v_ev.name, v_ev.closed_at is not null,
    v_sales, v_voided, v_freebies, v_cookies,
    v_revenue, v_expenses, coalesce(v_ev.variance_cents, 0),
    v_revenue - v_expenses + coalesce(v_ev.variance_cents, 0),
    coalesce(v_ev.drawer_float_cents, 0), coalesce(v_ev.drawer_float_cents, 0) + v_cash, v_ev.counted_cents,
    v_ev.loaded, v_ev.returned;
end;
$$;

-- ------------------------------------------------------------------ load_event_stock

create or replace function public.load_event_stock(p_event uuid, p_loaded jsonb, p_float_cents bigint)
returns table (event_id uuid, opened_at timestamptz, float_cents bigint, loaded jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ev public.events%rowtype;
begin
  if not public.is_owner() then
    raise exception 'only the owner may load event stock' using errcode = '42501';
  end if;
  if p_event is null or p_loaded is null or jsonb_typeof(p_loaded) <> 'object' then
    raise exception 'event and a stock object are required' using errcode = '22023';
  end if;
  if p_float_cents is null or p_float_cents < 0 or p_float_cents > 100000000 then
    raise exception 'float must be between 0 and 1,000,000 pesos' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event:' || p_event::text, 0));
  select * into v_ev from public.events e where e.id = p_event for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_each(p_loaded) i
              where i.key !~ '^[a-z0-9][a-z0-9-]{0,31}$' or not (v_ev.price_snapshot ? i.key)
                 or jsonb_typeof(i.value) <> 'number' or (i.value #>> '{}') !~ '^[0-9]{1,5}$') then
    raise exception 'stock must name flavours on the event menu with whole quantities' using errcode = '22023';
  end if;

  -- A repeat of the same load is acknowledged even after the event closed.
  if v_ev.opened_at is not null then
    if v_ev.loaded = p_loaded and v_ev.drawer_float_cents = p_float_cents then
      return query select v_ev.id, v_ev.opened_at, v_ev.drawer_float_cents, v_ev.loaded;
      return;
    end if;
    raise exception 'event stock was already loaded differently' using errcode = '23505';
  end if;
  if v_ev.closed_at is not null then
    raise exception 'event is closed' using errcode = '55000';
  end if;

  update public.events e
     set loaded = p_loaded, drawer_float_cents = p_float_cents, opened_at = now()
   where e.id = p_event
  returning e.opened_at into v_ev.opened_at;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'event.stock_loaded', 'events', p_event::text,
    jsonb_build_object('loaded', p_loaded, 'float_cents', p_float_cents));
  return query select p_event, v_ev.opened_at, p_float_cents, p_loaded;
end;
$$;

-- ------------------------------------------------------------------ add_event_expense

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
  if not public.is_owner() then
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

-- ------------------------------------------------------------------ close_event

create or replace function public.close_event(p_close jsonb)
returns table (
  event_id uuid, name text, closed boolean,
  sales_count integer, voided_count integer, freebie_count integer, cookies_sold integer,
  revenue_cents bigint, expenses_cents bigint, variance_cents bigint, profit_cents bigint,
  float_cents bigint, cash_expected_cents bigint, counted_cents bigint,
  loaded jsonb, returned jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_event uuid;
  v_ev public.events%rowtype;
  v_at timestamptz;
  v_counted bigint;
  v_returned jsonb;
  v_hash text;
  v_cash bigint;
  v_float bigint;
  v_expected bigint;
  v_variance bigint;
begin
  if not public.is_owner() then
    raise exception 'only the owner may close an event' using errcode = '42501';
  end if;
  if p_close is null or jsonb_typeof(p_close) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_close) k where k <> all (array['eventId','at','countedCents','returned','floatCents','cashCents'])) then
    raise exception 'close has a missing or unknown key' using errcode = '22023';
  end if;
  if jsonb_typeof(p_close -> 'eventId') is distinct from 'string'
     or (p_close ->> 'eventId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_close -> 'at') is distinct from 'number' or (p_close ->> 'at') !~ '^[0-9]{12,14}$'
     or coalesce(jsonb_typeof(p_close -> 'countedCents'), '') not in ('number', 'null')
     or (jsonb_typeof(p_close -> 'countedCents') = 'number' and (p_close ->> 'countedCents') !~ '^[0-9]{1,12}$')
     or jsonb_typeof(p_close -> 'returned') is distinct from 'object'
     or jsonb_typeof(p_close -> 'floatCents') is distinct from 'number' or (p_close ->> 'floatCents') !~ '^[0-9]{1,12}$'
     or jsonb_typeof(p_close -> 'cashCents') is distinct from 'number' or (p_close ->> 'cashCents') !~ '^[0-9]{1,12}$' then
    raise exception 'close fields are malformed' using errcode = '22023';
  end if;
  v_event := (p_close ->> 'eventId')::uuid;
  v_at := to_timestamp((p_close ->> 'at')::bigint / 1000.0);
  v_counted := case when jsonb_typeof(p_close -> 'countedCents') = 'number' then (p_close ->> 'countedCents')::bigint end;
  v_returned := p_close -> 'returned';
  if v_at > now() + interval '1 day' then
    raise exception 'close time is in the future' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(v_returned) i
              where i.key !~ '^[a-z0-9][a-z0-9-]{0,31}$' or jsonb_typeof(i.value) <> 'number'
                 or (i.value #>> '{}') !~ '^[0-9]{1,5}$') then
    raise exception 'returned stock must be whole quantities by flavour' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event:' || v_event::text, 0));
  v_hash := encode(sha256(convert_to(p_close::text, 'UTF8')), 'hex');
  select * into v_ev from public.events e where e.id = v_event for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;

  if v_ev.closed_at is not null then
    if v_ev.closed_hash is distinct from v_hash then
      raise exception 'event was already closed differently' using errcode = '23505';
    end if;
    return query select * from public.event_summary(v_event);
    return;
  end if;

  if v_at < v_ev.starts_at - interval '1 day' then
    raise exception 'close time is before the event started' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_each(v_returned) i
              where not (v_ev.price_snapshot ? i.key)
                 or (v_ev.opened_at is not null and (i.value #>> '{}')::int > coalesce((v_ev.loaded ->> i.key)::int, 0))) then
    raise exception 'returned stock names a flavour off the menu or more than was loaded' using errcode = '22023';
  end if;

  if exists (select 1 from public.event_sales s where s.event_id = v_event and s.voided_at is null and s.sold_at > v_at) then
    raise exception 'a sale was made after the close time' using errcode = '22023';
  end if;
  select coalesce(sum(s.total_cents), 0)::bigint into v_cash
    from public.event_sales s
   where s.event_id = v_event and s.voided_at is null and s.pay_method = 'Cash';
  v_float := coalesce(v_ev.drawer_float_cents, 0);
  if (p_close ->> 'floatCents')::bigint <> v_float or (p_close ->> 'cashCents')::bigint <> v_cash then
    raise exception 'the server does not hold all of this phone''s sales or its stock load yet' using errcode = '40001';
  end if;
  v_expected := v_float + v_cash;
  v_variance := case when v_counted is null then null else v_counted - v_expected end;

  -- A short drawer is a real cost; an over drawer is a correction to takings (as the prototype books it).
  if v_variance is not null and v_variance <> 0 then
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
    values (case when v_variance < 0 then 'cost'::public.ledger_kind else 'sale'::public.ledger_kind end,
      case when v_variance < 0 then 'Cash variance' else 'Bazaar' end,
      v_ev.name || ' — drawer ' || case when v_variance < 0 then 'short' else 'over' end,
      v_variance, v_at, auth.uid());
  end if;

  update public.events e
     set closed_at = v_at, counted_cents = v_counted, variance_cents = v_variance,
         returned = v_returned, closed_hash = v_hash
   where e.id = v_event;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'event.closed', 'events', v_event::text,
    jsonb_build_object('counted_cents', v_counted, 'expected_cents', v_expected, 'variance_cents', v_variance));

  return query select * from public.event_summary(v_event);
end;
$$;

-- ------------------------------------------------------------------ authority

revoke execute on function public.event_summary(uuid) from public, anon, authenticated;
grant execute on function public.event_summary(uuid) to authenticated;
revoke execute on function public.load_event_stock(uuid, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.load_event_stock(uuid, jsonb, bigint) to authenticated;
revoke execute on function public.add_event_expense(jsonb) from public, anon, authenticated;
grant execute on function public.add_event_expense(jsonb) to authenticated;
revoke execute on function public.close_event(jsonb) from public, anon, authenticated;
grant execute on function public.close_event(jsonb) to authenticated;
