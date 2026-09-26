-- Fail closed if pgcrypto is absent or installed outside the reviewed schema.
do $$ begin
  if not exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) or to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'pgcrypto digest(text,text) must exist in extensions';
  end if;
end $$;

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
  values (encode(extensions.digest(v_norm, 'sha256'), 'hex'), now(), 'anonymised', p_note, v_blocked + v_removed);

  return v_blocked + v_removed;
end;
$$;

revoke execute on function public.anonymise_customer(text, text) from public, anon;
