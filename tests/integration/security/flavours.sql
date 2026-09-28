-- MP-09 c1/c1b flavour authority with real SQL roles; all data rolls back.
--
-- get_flavours(): any active staff member. save_flavour(): the active owner only, every
-- field validated, stale updated_at refused. publish_flavours() (c1b): the active owner
-- only; it sets exactly the listed published set and writes only rows that change. Direct writes to `products` are denied to
-- everyone but service_role, the owner included. anon must not even hold EXECUTE.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('a6c90000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('a6c90000-0000-4000-8000-000000000001', 'owner', 'Flavour owner', true),
  ('a6c90000-0000-4000-8000-000000000002', 'helper', 'Flavour helper', true),
  ('a6c90000-0000-4000-8000-000000000003', 'support', 'Flavour support', true),
  ('a6c90000-0000-4000-8000-000000000004', 'owner', 'Flavour inactive owner', false);
insert into public.products(id, name, short_name, price_cents, kind, tag, description, image_path,
  active, published, sort_order, allergens)
values ('mp09c-a', 'Fixture A', 'A', 13000, 'Permanent', '', '', '/a.png', true, true, 1, 'milk');
-- A draft on the form with an old stamp: now() is fixed inside this transaction, so only an
-- explicit earlier updated_at shows a publish moving it.
insert into public.products(id, name, short_name, price_cents, kind, tag, description, image_path,
  active, published, sort_order, allergens, updated_at)
values ('mp09c-b', 'Fixture B', 'B', 13000, 'Rotating', '', '', '/b.png', true, false, 2, 'milk',
  '2026-01-01 00:00+00');

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'a6c90000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

create function pg_temp.valid() returns jsonb language sql immutable as $$
  select jsonb_build_object('name', 'Fixture A', 'short_name', 'A', 'price_cents', 14000,
    'kind', 'Permanent', 'item_type', 'set', 'capacity_weight', 4, 'tag', 'New',
    'description', 'Two lines', 'image_path', 'assets/a.png', 'allergens', 'milk, eggs',
    'active', false, 'sort_order', 2)
$$;

-- Runs one statement and records its SQLSTATE; anything but `wanted` fails the suite.
create function pg_temp.expect(actor text, operation text, statement text, wanted text) returns void
language plpgsql security invoker as $$
declare state text := '00000';
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
  end;
  if state = '00000' and wanted <> '00000' then
    raise exception 'forbidden flavour call succeeded: % / %', actor, operation;
  elsif state <> wanted then
    raise exception 'flavour outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

-- anon must not hold EXECUTE at all: the in-function role check alone is not enough.
create function pg_temp.assert_anon_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.get_flavours()', 'EXECUTE') then
    raise exception 'forbidden flavour call succeeded: anon / get_flavours';
  end if;
  if has_function_privilege('anon', 'public.save_flavour(text,jsonb,timestamptz)', 'EXECUTE') then
    raise exception 'forbidden flavour call succeeded: anon / save_flavour';
  end if;
  if has_function_privilege('anon', 'public.publish_flavours(text[])', 'EXECUTE') then
    raise exception 'forbidden flavour call succeeded: anon / publish_flavours';
  end if;
  insert into pg_temp.authority_results values ('acl', 'anon', 'no_execute');
end $$;

create function pg_temp.assert_staff(actor text, read_state text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_flavours', 'select * from public.get_flavours()', read_state);
  perform pg_temp.expect(actor, 'save_flavour',
    'select public.save_flavour(''mp09c-a'', pg_temp.valid(), null)', '42501');
  perform pg_temp.expect(actor, 'publish_flavours',
    'select public.publish_flavours(array[''mp09c-a''])', '42501');
  perform pg_temp.expect(actor, 'products_update',
    'update public.products set price_cents = 1 where id = ''mp09c-a''', '42501');
end $$;

create function pg_temp.assert_owner() returns void language plpgsql security invoker as $$
declare
  a text := 'active_owner';
  save text := 'select public.save_flavour(%L, %s, %s)';
  stamp text := '(select updated_at from public.products where id = ''mp09c-a'')';
  changed integer;
begin
  if (select count(*) from public.get_flavours() f where f.id like 'mp09c-%') <> 2 then
    raise exception 'owner flavour read differs';
  end if;
  perform pg_temp.expect(a, 'get_flavours', 'select * from public.get_flavours()', '00000');
  perform pg_temp.expect(a, 'products_update',
    'update public.products set price_cents = 1 where id = ''mp09c-a''', '42501');
  perform pg_temp.expect(a, 'products_insert',
    'insert into public.products(id, name, short_name, price_cents, kind) values (''mp09c-raw'', ''R'', ''R'', 1, ''Permanent'')', '42501');
  perform pg_temp.expect(a, 'products_delete', 'delete from public.products where id = ''mp09c-a''', '42501');
  perform pg_temp.expect(a, 'save_bad_id', format(save, 'Bad Id', 'pg_temp.valid()', 'null'), '22023');
  perform pg_temp.expect(a, 'save_null_object', format(save, 'mp09c-a', '''[]''::jsonb', stamp), '22023');
  perform pg_temp.expect(a, 'save_unknown_key',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"published": false}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_missing_key', format(save, 'mp09c-a', 'pg_temp.valid() - ''tag''', stamp), '22023');
  perform pg_temp.expect(a, 'save_bad_kind',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"kind": "Seasonal"}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_bad_item_type',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"item_type": "box"}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_price_negative',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"price_cents": -1}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_price_fraction',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"price_cents": 140.5}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_price_text',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"price_cents": "14000"}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_weight_zero',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"capacity_weight": 0}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_weight_high',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"capacity_weight": 49}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_style_injection',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"image_path": "a.png);background:url(x"}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_blank_allergens',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"allergens": " "}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_blank_name',
    format(save, 'mp09c-a', 'pg_temp.valid() || ''{"name": "   "}''', stamp), '22023');
  perform pg_temp.expect(a, 'save_stale',
    format(save, 'mp09c-a', 'pg_temp.valid()', '''2000-01-01 00:00+00''::timestamptz'), 'P0002');
  perform pg_temp.expect(a, 'save_create_duplicate', format(save, 'mp09c-a', 'pg_temp.valid()', 'null'), 'P0002');
  perform pg_temp.expect(a, 'save_create', format(save, 'mp09c-new', 'pg_temp.valid()', 'null'), '00000');
  perform pg_temp.expect(a, 'save_update', format(save, 'mp09c-a', 'pg_temp.valid()', stamp), '00000');

  -- Publishing (c1b). Here mp09c-a is published but off the form; mp09c-b and mp09c-new are drafts.
  perform pg_temp.expect(a, 'publish_null', 'select public.publish_flavours(null)', '22023');
  perform pg_temp.expect(a, 'publish_null_id', 'select public.publish_flavours(array[null::text])', '22023');
  perform pg_temp.expect(a, 'publish_bad_id', 'select public.publish_flavours(array[''Bad Id''])', '22023');
  perform pg_temp.expect(a, 'publish_unknown', 'select public.publish_flavours(array[''mp09c-none''])', '22023');
  perform pg_temp.expect(a, 'publish_too_many',
    'select public.publish_flavours(array_fill(''mp09c-a''::text, array[201]))', '22023');
  select count(*) into changed from public.publish_flavours(array['mp09c-b']);
  if changed <> 2 or not exists (select 1 from public.products where id = 'mp09c-b' and published)
     or exists (select 1 from public.products where id in ('mp09c-a', 'mp09c-new') and published)
     or (select updated_at from public.products where id = 'mp09c-b') = '2026-01-01 00:00+00' then
    raise exception 'flavour publish differs: % rows changed', changed;
  end if;
  insert into pg_temp.authority_results values ('publish_set', a, 'exact_set_2_changed');
  -- The same set again writes no row (RETURNING lists only rows it updated), so no
  -- updated_at the owner holds goes stale.
  select count(*) into changed from public.publish_flavours(array['mp09c-b']);
  if changed <> 0 then
    raise exception 'flavour republish differs: % rows changed', changed;
  end if;
  insert into pg_temp.authority_results values ('publish_again', a, 'nothing_changed');
  -- A publish that changed the row moved its updated_at: the pre-publish stamp is stale.
  perform pg_temp.expect(a, 'save_stale_after_publish',
    format(save, 'mp09c-b', 'pg_temp.valid() || ''{"active": true}''', '''2026-01-01 00:00+00''::timestamptz'), 'P0002');
  perform pg_temp.expect(a, 'save_after_publish',
    format(save, 'mp09c-b', 'pg_temp.valid() || ''{"active": true}''',
      '(select updated_at from public.products where id = ''mp09c-b'')'), '00000');
end $$;

grant execute on function pg_temp.set_subject(integer, text), pg_temp.valid(),
  pg_temp.expect(text, text, text, text), pg_temp.assert_anon_acl(),
  pg_temp.assert_staff(text, text), pg_temp.assert_owner() to anon, authenticated, service_role;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_anon_acl();
select pg_temp.assert_staff('anon', '42501');
reset role;
set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_staff('active_helper', '00000');
select pg_temp.set_subject(3);
select pg_temp.assert_staff('active_support', '00000');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_staff('inactive_owner', '42501');
select pg_temp.set_subject(1);
select pg_temp.assert_owner();
reset role;
set local role service_role;
-- A subject with no profile: service_role is not staff, so both RPCs refuse it.
select pg_temp.set_subject(9, 'service_role');
select pg_temp.expect('service_role', 'get_flavours', 'select * from public.get_flavours()', '42501');
select pg_temp.expect('service_role', 'save_flavour',
  'select public.save_flavour(''mp09c-a'', pg_temp.valid(), null)', '42501');
select pg_temp.expect('service_role', 'publish_flavours',
  'select public.publish_flavours(array[''mp09c-a''])', '42501');
reset role;

do $$ begin
  -- The owner's valid saves changed exactly what they sent (save_flavour never touches
  -- `published`), the publish set exactly the listed flavour, and nothing the denied callers
  -- sent landed. The shop shows only what is both published and on the form.
  if not exists (select 1 from public.products where id = 'mp09c-a' and price_cents = 14000
       and item_type = 'set' and capacity_weight = 4 and allergens = 'milk, eggs'
       and not active and not published)
     or not exists (select 1 from public.products where id = 'mp09c-new' and not published and price_cents = 14000)
     or not exists (select 1 from public.products where id = 'mp09c-b' and published and active and price_cents = 14000)
     or exists (select 1 from public.products where id = 'mp09c-raw' or price_cents = 1)
     or (select array_agg(id order by id) from public.shop_products where id like 'mp09c-%') is distinct from array['mp09c-b']
     or (select count(*) from pg_temp.authority_results) <> 51 then
    raise exception 'flavour fixture or result count differs';
  end if;
  insert into pg_temp.authority_results values ('flavour_fixture', 'preserved', 'owner_saves_only');
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
