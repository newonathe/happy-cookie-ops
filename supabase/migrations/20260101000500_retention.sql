-- Retention and erasure.
--
-- Under the Data Privacy Act of 2012 (RA 10173, Chapter IV, and IRR §34) a customer has a
-- right to erasure or blocking of their personal data, exercisable at no cost. The owner
-- is the personal information controller.
--
-- The important nuance, and the reason this is not a DELETE:
--
--   Erasure removes the data. Blocking restricts it to a purpose that another law
--   requires. BIR record-keeping means a completed sale cannot simply be deleted — the
--   financial record must survive an audit. So the correct response to an erasure request
--   on a paid order is to BLOCK: strip the personal information, keep the money.
--
-- That is what anonymise_customer() does. The order, its items and its ledger entries
-- stay intact and auditable; the name, phone and notes do not.

-- digest() for the request log. First, not last: a plpgsql body is not resolved at
-- creation time, so creating the extension afterwards happens to work and is luck.
create extension if not exists pgcrypto;

-- Who asked, when, and what was done. The NPC expects a controller to be able to show
-- this, and the owner should not have to remember.
create table if not exists erasure_requests (
  id           uuid primary key default gen_random_uuid(),
  phone_hash   text not null,               -- never the number itself
  requested_at timestamptz not null default now(),
  actioned_at  timestamptz,
  action       text check (action in ('anonymised', 'deleted', 'refused')),
  -- Why, in the owner's words. Refusals need a reason on the record.
  note         text not null default '',
  orders_affected integer not null default 0
);

alter table erasure_requests enable row level security;
create policy "erasure requests owner only" on erasure_requests
  for all using (is_owner()) with check (is_owner());

/**
 * Blocks a customer's personal data while preserving the financial record.
 *
 * Replaces the name with 'Removed on request', clears the phone and notes, and records
 * what happened. Returns the number of orders affected so the owner can confirm it
 * matched who she meant.
 *
 * Orders that are still live (not yet collected or paid) are DELETED rather than
 * anonymised — there is no tax record to preserve for a box nobody has bought, and an
 * anonymous pending order is just a box nobody can collect.
 */
create or replace function anonymise_customer(p_phone text, p_note text default '')
returns integer
language plpgsql
security definer
set search_path = public
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
           notes = ''
     where regexp_replace(phone, '\D', '', 'g') = v_norm
    returning 1
  )
  select count(*) into v_blocked from blocked;

  insert into erasure_requests (phone_hash, actioned_at, action, note, orders_affected)
  values (encode(digest(v_norm, 'sha256'), 'hex'), now(), 'anonymised', p_note, v_blocked + v_removed);

  return v_blocked + v_removed;
end;
$$;

/**
 * Deletes personal data from orders older than the retention period, keeping the money.
 *
 * The engine already carries RETENTION_DAYS and nothing enforced it. This does. Run it
 * from a monthly cron: a customer's phone number has no purpose two years after they
 * collected their cookies, and data you no longer hold cannot leak.
 */
create or replace function prune_personal_data(p_retain_days integer default 730)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with pruned as (
    update orders
       set customer_name = 'Past customer',
           phone = '',
           notes = ''
     where placed_at < now() - make_interval(days => p_retain_days)
       and phone <> ''
    returning 1
  )
  select count(*) into v_count from pruned;
  return v_count;
end;
$$;

comment on function prune_personal_data(integer) is
  'Enforces RETENTION_DAYS. Anonymises orders past the window; the financial record survives for BIR.';

grant execute on function anonymise_customer(text, text) to authenticated;
grant execute on function prune_personal_data(integer) to service_role;
