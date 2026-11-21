-- S4 live sync (migration 20260101009800): who may read the rows the open day's changes are made of. Supabase Realtime sends a change to a
-- subscriber only if their own role could select the row, so these reads ARE the delivery rule. Real reads as each role; rolls back.
begin;
insert into auth.users(id, email) values
 ('b0980000-0000-4000-8000-000000000001', 'owner@example.test'),
 ('b0980000-0000-4000-8000-000000000002', 'helper.a@example.test'),
 ('b0980000-0000-4000-8000-000000000003', 'helper.b@example.test'),
 ('b0980000-0000-4000-8000-000000000004', 'helper.expired@example.test'),
 ('b0980000-0000-4000-8000-000000000005', 'helper.removed@example.test'),
 ('b0980000-0000-4000-8000-000000000006', 'support@example.test'),
 ('b0980000-0000-4000-8000-000000000007', 'nobody@example.test');
insert into public.profiles(id, role, display_name, active, access_expires_at) values
 ('b0980000-0000-4000-8000-000000000001', 'owner', 'Owner', true, null),
 ('b0980000-0000-4000-8000-000000000002', 'helper', 'Helper A', true, null),
 ('b0980000-0000-4000-8000-000000000003', 'helper', 'Helper B', true, now() + interval '1 hour'),
 ('b0980000-0000-4000-8000-000000000004', 'helper', 'Helper expired', true, now() - interval '1 minute'),
 ('b0980000-0000-4000-8000-000000000005', 'helper', 'Helper removed', false, null),
 ('b0980000-0000-4000-8000-000000000006', 'support', 'Support', true, null);
insert into public.products(id, name, short_name, price_cents, kind) values ('ls-a', 'Live flavour A', 'A', 10000, 'Permanent');

-- A booking with one day. state: 'open' | 'closed'. The day has `n` sales, 2 stock adds and 1 loss, all inserted as the database owner.
create function pg_temp.day(p uuid, p_name text, state text, n integer) returns uuid language plpgsql as $f$
declare d uuid := md5(p::text || ':d')::uuid; e uuid := md5(p::text || ':e')::uuid; i integer;
begin
  insert into public.scheduled_events(id, name, starts_on, ends_on, rent_cents) values (p, p_name, current_date, current_date, 0);
  insert into public.events(id, name, starts_at, selling_device, price_snapshot, opened_at, loaded, closed_at)
    values (e, p_name, now() - interval '1 hour', 'devP', '{"ls-a": 10000}', now() - interval '1 hour', '{"ls-a": 40}',
            case when state = 'closed' then now() - interval '10 minutes' end);
  insert into public.bazaar_days(id, scheduled_id, day, float_cents, event_id, plan_hash)
    values (d, p, current_date, 25000, e, repeat('a', 64));
  insert into public.bazaar_day_lines(day_id, product_id, made_qty, carried_qty, price_cents) values (d, 'ls-a', 40, 0, 10000);
  for i in 1..n loop
    insert into public.event_sales(client_id, event_id, gross_cents, total_cents, pay_method, sold_at)
      values (p_name || ':S' || i, e, 10000, 10000, 'Cash', now() - interval '30 minutes');
  end loop;
  insert into public.bazaar_stock_adds(client_id, day_id, product_id, qty, kind) values (gen_random_uuid(), d, 'ls-a', 3, 'made'), (gen_random_uuid(), d, 'ls-a', 2, 'carried');
  insert into public.bazaar_losses(client_id, day_id, product_id, qty, reason, at, payload_hash)
    values (p_name || ':L1', d, 'ls-a', 1, 'dropped', now() - interval '20 minutes', repeat('b', 64));
  return d;
end;
$f$;

-- What `who` can read of a table, counted, as that role: owner/helper/etc. are authenticated with the account's claims; null is anon.
-- Returns the count, or -1 for any error (permission denied counts as an error, which no case here allows).
create function pg_temp.seen(who uuid, tbl text, col text, key uuid) returns integer language plpgsql as $f$
declare n integer;
begin
  perform set_config('request.jwt.claim.sub', coalesce(who::text, ''), true);
  perform set_config('request.jwt.claims', case when who is null then json_build_object('role', 'anon')::text
                                                else json_build_object('sub', who, 'role', 'authenticated')::text end, true);
  execute case when who is null then 'set local role anon' else 'set local role authenticated' end;
  begin
    execute format('select count(*) from public.%I where %I = $1', tbl, col) into n using key;
  exception when others then
    n := -1;
  end;
  reset role;
  return n;
end;
$f$;
create function pg_temp.check_seen(label text, who uuid, tbl text, col text, key uuid, wanted integer) returns void language plpgsql as $f$
declare got integer := pg_temp.seen(who, tbl, col, key);
begin
  -- anon has no privilege at all on the two stock tables: a refused read is the strongest "nothing", and counts as zero.
  if who is null and tbl <> 'event_sales' and got = -1 then got := 0; end if;
  if got is distinct from wanted then raise exception 'LIVE_SYNC % : % read % rows of %, wanted %', label, coalesce(who::text, 'anon'), got, tbl, wanted; end if;
end;
$f$;

do $$
declare
  owner uuid := 'b0980000-0000-4000-8000-000000000001';
  ha uuid := 'b0980000-0000-4000-8000-000000000002';
  hb uuid := 'b0980000-0000-4000-8000-000000000003';
  hx uuid := 'b0980000-0000-4000-8000-000000000004';
  hr uuid := 'b0980000-0000-4000-8000-000000000005';
  sup uuid := 'b0980000-0000-4000-8000-000000000006';
  nobody uuid := 'b0980000-0000-4000-8000-000000000007';
  d_open uuid; d_closed uuid; e_open uuid; e_closed uuid;
  who uuid;
  names text[];
  got text;
begin
  d_open := pg_temp.day('b0981000-0000-4000-8000-000000000001', 'Open fair', 'open', 3);
  d_closed := pg_temp.day('b0981000-0000-4000-8000-000000000002', 'Closed fair', 'closed', 1);
  e_open := (select event_id from public.bazaar_days where id = d_open);
  e_closed := (select event_id from public.bazaar_days where id = d_closed);

  -- ---- the publication carries exactly the three tables and nothing else of the business
  select string_agg(tablename, ',' order by tablename) into got from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public';
  if got is distinct from 'bazaar_losses,bazaar_stock_adds,event_sales' then
    raise exception 'LIVE_SYNC_PUBLICATION the publication carries %', got;
  end if;

  -- ---- grants: the two wrappers are for signed-in callers only; the two newly readable tables are read-only
  if has_function_privilege('anon', 'public.bazaar_day_readable(uuid)', 'EXECUTE') or has_function_privilege('service_role', 'public.bazaar_day_readable(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.bazaar_day_readable(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.bazaar_event_readable(uuid)', 'EXECUTE') or has_function_privilege('service_role', 'public.bazaar_event_readable(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.bazaar_event_readable(uuid)', 'EXECUTE') then
    raise exception 'LIVE_SYNC_GRANTS the read wrappers are granted wrong';
  end if;
  foreach got in array array['bazaar_losses', 'bazaar_stock_adds'] loop
    if not has_table_privilege('authenticated', 'public.' || got, 'SELECT') or has_table_privilege('anon', 'public.' || got, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || got, 'INSERT') or has_table_privilege('authenticated', 'public.' || got, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || got, 'DELETE') or has_table_privilege('anon', 'public.' || got, 'INSERT') then
      raise exception 'LIVE_SYNC_GRANTS % is granted wrong', got;
    end if;
  end loop;
  select string_agg(tablename || '/' || cmd || '/' || roles::text, ',' order by tablename) into got from pg_policies
    where schemaname = 'public' and tablename in ('event_sales', 'bazaar_losses', 'bazaar_stock_adds') and cmd = 'SELECT';
  if got is distinct from 'bazaar_losses/SELECT/{authenticated},bazaar_stock_adds/SELECT/{authenticated},event_sales/SELECT/{authenticated}' then
    raise exception 'LIVE_SYNC_POLICIES the select policies are %', got;
  end if;

  -- ---- the owner reads everything of every day
  perform pg_temp.check_seen('owner sales open', owner, 'event_sales', 'event_id', e_open, 3);
  perform pg_temp.check_seen('owner sales closed', owner, 'event_sales', 'event_id', e_closed, 1);
  perform pg_temp.check_seen('owner adds open', owner, 'bazaar_stock_adds', 'day_id', d_open, 2);
  perform pg_temp.check_seen('owner adds closed', owner, 'bazaar_stock_adds', 'day_id', d_closed, 2);
  perform pg_temp.check_seen('owner losses open', owner, 'bazaar_losses', 'day_id', d_open, 1);
  perform pg_temp.check_seen('owner losses closed', owner, 'bazaar_losses', 'day_id', d_closed, 1);

  -- ---- an active helper (no expiry, or not yet expired) reads the day that is open now, and only that
  foreach who in array array[ha, hb] loop
    perform pg_temp.check_seen('helper sales open', who, 'event_sales', 'event_id', e_open, 3);
    perform pg_temp.check_seen('helper adds open', who, 'bazaar_stock_adds', 'day_id', d_open, 2);
    perform pg_temp.check_seen('helper losses open', who, 'bazaar_losses', 'day_id', d_open, 1);
    perform pg_temp.check_seen('helper sales closed', who, 'event_sales', 'event_id', e_closed, 0);
    perform pg_temp.check_seen('helper adds closed', who, 'bazaar_stock_adds', 'day_id', d_closed, 0);
    perform pg_temp.check_seen('helper losses closed', who, 'bazaar_losses', 'day_id', d_closed, 0);
  end loop;

  -- ---- nobody else hears anything: anon, an expired helper, a removed helper, support, a signed-in account with no profile
  foreach who in array array[null, hx, hr, sup, nobody]::uuid[] loop
    perform pg_temp.check_seen('others sales open', who, 'event_sales', 'event_id', e_open, 0);
    perform pg_temp.check_seen('others sales closed', who, 'event_sales', 'event_id', e_closed, 0);
    perform pg_temp.check_seen('others adds open', who, 'bazaar_stock_adds', 'day_id', d_open, 0);
    perform pg_temp.check_seen('others losses open', who, 'bazaar_losses', 'day_id', d_open, 0);
  end loop;

  -- ---- access that ends mid-day stops the reads at once: the expiry passes, the helper is removed, the day is closed
  update public.profiles set access_expires_at = now() - interval '1 second' where id = hb;
  perform pg_temp.check_seen('helper expired mid-day', hb, 'event_sales', 'event_id', e_open, 0);
  update public.profiles set active = false where id = ha;
  perform pg_temp.check_seen('helper removed mid-day', ha, 'bazaar_losses', 'day_id', d_open, 0);
  update public.profiles set active = true where id = ha;
  perform pg_temp.check_seen('helper back', ha, 'event_sales', 'event_id', e_open, 3);
  update public.events set closed_at = now() where id = e_open;
  perform pg_temp.check_seen('helper, day closed', ha, 'event_sales', 'event_id', e_open, 0);
  perform pg_temp.check_seen('helper, day closed adds', ha, 'bazaar_stock_adds', 'day_id', d_open, 0);
  perform pg_temp.check_seen('owner, day closed', owner, 'event_sales', 'event_id', e_open, 3);

  -- ---- these reads open no way to write: a signed-in account cannot insert, change or delete a loss, a stock add or a sale
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', owner::text, true);
  set local role authenticated;
  begin
    insert into public.bazaar_losses(client_id, day_id, product_id, qty, reason, at, payload_hash) values ('x', d_open, 'ls-a', 1, 'x', now(), repeat('c', 64));
    reset role; raise exception 'LIVE_SYNC_WRITE a loss was written through the table';
  exception when insufficient_privilege then reset role; end;
  set local role authenticated;
  begin
    update public.bazaar_stock_adds set qty = 99 where day_id = d_open;
    reset role; raise exception 'LIVE_SYNC_WRITE a stock add was changed through the table';
  exception when insufficient_privilege then reset role; end;
  set local role authenticated;
  begin
    delete from public.bazaar_losses where day_id = d_open;
    reset role; raise exception 'LIVE_SYNC_WRITE a loss was deleted through the table';
  exception when insufficient_privilege then reset role; end;
  perform set_config('request.jwt.claims', json_build_object('sub', ha, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ha::text, true);
  set local role authenticated;
  begin
    insert into public.event_sales(client_id, event_id, gross_cents, total_cents, pay_method, sold_at) values ('hx:S1', e_closed, 1, 1, 'Cash', now());
    reset role; raise exception 'LIVE_SYNC_WRITE a helper wrote a sale through the table';
  exception when insufficient_privilege then reset role; end;
  if (select count(*) from public.bazaar_losses where client_id = 'x') <> 0 or (select sum(qty) from public.bazaar_stock_adds where day_id = d_open) <> 5 then
    raise exception 'LIVE_SYNC_WRITE rows changed';
  end if;
end $$;
select 'BAZAAR_LIVE_SYNC|passed';
rollback;
