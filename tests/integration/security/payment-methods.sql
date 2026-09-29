-- MP-09 c2 payment-method, shop-text and image-bucket authority with real SQL roles; all data
-- rolls back.
--
-- get_payment_methods()/save_payment_method()/save_shop_texts(): the active owner only, anon
-- must not even hold EXECUTE, every field validated, stale updated_at refused. Direct writes to
-- both tables are denied to everyone, the owner included. get_shop_payment_info() is the one
-- anonymous read: it shows active methods and the four texts, nothing else. The shop-media
-- bucket: only the active owner writes, only a generated name under qr/ or flavours/, and
-- nobody but the owner can read the object rows through the API.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('a6c92000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('a6c92000-0000-4000-8000-000000000001', 'owner', 'Payment owner', true),
  ('a6c92000-0000-4000-8000-000000000002', 'helper', 'Payment helper', true),
  ('a6c92000-0000-4000-8000-000000000003', 'support', 'Payment support', true),
  ('a6c92000-0000-4000-8000-000000000004', 'owner', 'Payment inactive owner', false);
-- The bucket row storage.objects references (a fresh reset may not have run Storage's own migrations).
insert into storage.buckets(id, name) values ('shop-media', 'shop-media') on conflict (id) do nothing;
-- Fixture rows, written as the fixture owner of the transaction (not through any API role).
insert into public.payment_methods(id, label, account_number, account_name, qr_path, active, sort_order)
values ('mp09c2-a', 'Fixture pay A', '000', 'Fixture holder', 'qr/mp09c2-a.png', true, 1),
       ('mp09c2-off', 'Fixture pay off', '111', 'Hidden holder', '', false, 2);

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'a6c92000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

create function pg_temp.valid() returns jsonb language sql immutable as $$
  select jsonb_build_object('label', 'Fixture pay A', 'account_number', '0999 000 1111',
    'account_name', 'Fixture holder', 'qr_path', 'qr/mp09c2-a.png', 'active', true, 'sort_order', 3)
$$;

create function pg_temp.texts() returns jsonb language sql immutable as $$
  select jsonb_build_object('registration_badge', 'Fixture reg', 'tin_line', 'Fixture line',
    'invoice_note', 'Fixture invoice', 'allergen_note', 'Fixture allergens')
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
    raise exception 'forbidden payment call succeeded: % / %', actor, operation;
  elsif state <> wanted then
    raise exception 'payment outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;

-- anon must not hold EXECUTE on the owner RPCs: the in-function role check alone is not enough.
-- It must hold it on the one public read, or the checkout shows no payment method at all.
create function pg_temp.assert_anon_acl() returns void language plpgsql security invoker as $$
begin
  if has_function_privilege('anon', 'public.get_payment_methods()', 'EXECUTE') then
    raise exception 'forbidden payment call succeeded: anon / get_payment_methods';
  end if;
  if has_function_privilege('anon', 'public.save_payment_method(text,jsonb,timestamptz)', 'EXECUTE') then
    raise exception 'forbidden payment call succeeded: anon / save_payment_method';
  end if;
  if has_function_privilege('anon', 'public.save_shop_texts(jsonb,timestamptz)', 'EXECUTE') then
    raise exception 'forbidden payment call succeeded: anon / save_shop_texts';
  end if;
  if not has_function_privilege('anon', 'public.get_shop_payment_info()', 'EXECUTE') then
    raise exception 'public payment read missing: anon / get_shop_payment_info';
  end if;
  insert into pg_temp.authority_results values ('acl', 'anon', 'owner_rpcs_no_execute');
end $$;

-- What the customer may read: only the active methods, only the five public keys, empty texts
-- until the owner types some, and never an inactive method's data.
create function pg_temp.assert_public_read(actor text, expect_count integer, expect_texts boolean) returns void
language plpgsql security invoker as $$
declare info jsonb := public.get_shop_payment_info();
begin
  if jsonb_array_length(info -> 'methods') <> expect_count
     or (info #>> '{methods,0,id}') is distinct from 'mp09c2-a'
     or (select array_agg(k order by k) from jsonb_object_keys(info -> 'methods' -> 0) k)
        is distinct from array['id', 'label', 'name', 'number', 'qr']
     or info::text like '%Hidden holder%' or info::text like '%mp09c2-off%' then
    raise exception 'public payment read differs: %', actor;
  end if;
  if expect_texts and (info #>> '{texts,tin_line}') is distinct from 'Fixture line' then
    raise exception 'public shop text read differs: %', actor;
  end if;
  if not expect_texts and (info #>> '{texts,tin_line}') is distinct from '' then
    raise exception 'public shop text is not empty by default: %', actor;
  end if;
  insert into pg_temp.authority_results values ('public_read', actor,
    case when expect_texts then 'active_only_with_texts' else 'active_only_empty_texts' end);
end $$;

-- The bucket cannot be listed through the API by anyone but the owner.
create function pg_temp.assert_bucket_hidden(actor text) returns void language plpgsql security invoker as $$
begin
  if (select count(*) from storage.objects where bucket_id = 'shop-media') <> 0 then
    raise exception 'forbidden payment call succeeded: % / media_list', actor;
  end if;
  insert into pg_temp.authority_results values ('media_list', actor, 'no_rows');
end $$;

create function pg_temp.assert_staff(actor text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_payment_methods', 'select * from public.get_payment_methods()', '42501');
  perform pg_temp.expect(actor, 'save_payment_method',
    'select public.save_payment_method(''mp09c2-a'', pg_temp.valid(), null)', '42501');
  perform pg_temp.expect(actor, 'save_shop_texts', 'select public.save_shop_texts(pg_temp.texts(), null)', '42501');
  perform pg_temp.expect(actor, 'methods_table_select', 'select * from public.payment_methods', '42501');
  perform pg_temp.expect(actor, 'methods_table_update', 'update public.payment_methods set label = ''x''', '42501');
  perform pg_temp.expect(actor, 'methods_table_delete', 'delete from public.payment_methods', '42501');
  perform pg_temp.expect(actor, 'texts_table_select', 'select * from public.shop_texts', '42501');
  perform pg_temp.expect(actor, 'texts_table_update', 'update public.shop_texts set tin_line = ''x''', '42501');
  perform pg_temp.expect(actor, 'media_insert',
    'insert into storage.objects(bucket_id, name) values (''shop-media'', ''qr/mp09c2-staff.png'')', '42501');
end $$;

create function pg_temp.assert_owner() returns void language plpgsql security invoker as $$
declare
  a text := 'active_owner';
  save text := 'select public.save_payment_method(%L, %s, %s)';
  stamp text := '(select updated_at from public.get_payment_methods() where id = ''mp09c2-a'')';
  texts text := 'select public.save_shop_texts(%s, %s)';
  ins text := 'insert into storage.objects(bucket_id, name) values (''shop-media'', %L)';
begin
  if (select count(*) from public.get_payment_methods() m where m.id like 'mp09c2-%') <> 2 then
    raise exception 'owner payment methods read differs';
  end if;
  perform pg_temp.expect(a, 'get_payment_methods', 'select * from public.get_payment_methods()', '00000');
  perform pg_temp.expect(a, 'methods_table_insert',
    'insert into public.payment_methods(id, label) values (''mp09c2-raw'', ''Raw'')', '42501');
  perform pg_temp.expect(a, 'methods_table_select', 'select * from public.payment_methods', '42501');
  perform pg_temp.expect(a, 'methods_table_update', 'update public.payment_methods set label = ''x''', '42501');
  perform pg_temp.expect(a, 'methods_table_delete', 'delete from public.payment_methods', '42501');
  perform pg_temp.expect(a, 'texts_table_select', 'select * from public.shop_texts', '42501');
  perform pg_temp.expect(a, 'texts_table_update', 'update public.shop_texts set tin_line = ''x''', '42501');
  perform pg_temp.expect(a, 'texts_table_insert', 'insert into public.shop_texts(id) values (true)', '42501');
  perform pg_temp.expect(a, 'pm_save_bad_id', format(save, 'Bad Id', 'pg_temp.valid()', 'null'), '22023');
  perform pg_temp.expect(a, 'pm_save_null_object', format(save, 'mp09c2-a', '''[]''::jsonb', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_unknown_key',
    format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"id": "x"}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_missing_key', format(save, 'mp09c2-a', 'pg_temp.valid() - ''qr_path''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_label_number', format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"label": 5}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_label_blank', format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"label": "  "}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_qr_traversal',
    format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"qr_path": "qr/../x.png"}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_qr_leading_slash',
    format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"qr_path": "/qr/x.png"}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_qr_scheme',
    format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"qr_path": "https://evil.example/qr/x.png"}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_qr_subfolder',
    format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"qr_path": "qr/sub/x.png"}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_qr_svg',
    format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"qr_path": "qr/x.svg"}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_sort_fraction',
    format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"sort_order": 1.5}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_sort_high',
    format(save, 'mp09c2-a', 'pg_temp.valid() || ''{"sort_order": 100}''', stamp), '22023');
  perform pg_temp.expect(a, 'pm_save_stale',
    format(save, 'mp09c2-a', 'pg_temp.valid()', '''2000-01-01 00:00+00''::timestamptz'), 'P0002');
  perform pg_temp.expect(a, 'pm_save_create_duplicate', format(save, 'mp09c2-a', 'pg_temp.valid()', 'null'), 'P0002');
  perform pg_temp.expect(a, 'pm_save_duplicate_label',
    format(save, 'mp09c2-new', 'pg_temp.valid()', 'null'), '23505');
  perform pg_temp.expect(a, 'pm_save_create',
    format(save, 'mp09c2-new', 'pg_temp.valid() || ''{"label": "Fixture pay new", "qr_path": ""}''', 'null'), '00000');
  perform pg_temp.expect(a, 'pm_save_update', format(save, 'mp09c2-a', 'pg_temp.valid()', stamp), '00000');

  perform pg_temp.expect(a, 'texts_unknown_key',
    format(texts, 'pg_temp.texts() || ''{"x": "y"}''', 'null'), '22023');
  perform pg_temp.expect(a, 'texts_missing_key', format(texts, 'pg_temp.texts() - ''tin_line''', 'null'), '22023');
  perform pg_temp.expect(a, 'texts_wrong_type', format(texts, 'pg_temp.texts() || ''{"tin_line": 5}''', 'null'), '22023');
  perform pg_temp.expect(a, 'texts_too_long',
    format(texts, 'pg_temp.texts() || jsonb_build_object(''allergen_note'', repeat(''x'', 301))', 'null'), '22023');
  perform pg_temp.expect(a, 'texts_stale_without_row',
    format(texts, 'pg_temp.texts()', '''2000-01-01 00:00+00''::timestamptz'), 'P0002');
  perform pg_temp.expect(a, 'texts_create', format(texts, 'pg_temp.texts()', 'null'), '00000');
  perform pg_temp.expect(a, 'texts_create_again', format(texts, 'pg_temp.texts()', 'null'), 'P0002');
  perform pg_temp.expect(a, 'texts_stale',
    format(texts, 'pg_temp.texts()', '''2000-01-01 00:00+00''::timestamptz'), 'P0002');
  perform pg_temp.expect(a, 'texts_update',
    format(texts, 'pg_temp.texts()', '((public.get_shop_payment_info() #>> ''{texts,updated_at}'')::timestamptz)'), '00000');

  -- The image bucket: the owner writes a generated name under qr/ or flavours/, nothing else.
  perform pg_temp.expect(a, 'media_insert_qr', format(ins, 'qr/mp09c2-ok.png'), '00000');
  perform pg_temp.expect(a, 'media_insert_flavour', format(ins, 'flavours/mp09c2-ok.webp'), '00000');
  perform pg_temp.expect(a, 'media_insert_traversal', format(ins, 'qr/../mp09c2-x.png'), '42501');
  perform pg_temp.expect(a, 'media_insert_other_folder', format(ins, 'other/mp09c2-x.png'), '42501');
  perform pg_temp.expect(a, 'media_insert_subfolder', format(ins, 'qr/sub/mp09c2-x.png'), '42501');
  perform pg_temp.expect(a, 'media_insert_svg', format(ins, 'qr/mp09c2-x.svg'), '42501');
  if (select count(*) from storage.objects where bucket_id = 'shop-media') <> 2 then
    raise exception 'owner cannot read back the bucket rows it wrote';
  end if;
  perform pg_temp.expect(a, 'media_update',
    'update storage.objects set name = ''qr/mp09c2-moved.png'' where bucket_id = ''shop-media'' and name = ''qr/mp09c2-ok.png''', '00000');
  perform pg_temp.expect(a, 'media_update_bad_name',
    'update storage.objects set name = ''qr/../mp09c2-moved.png'' where bucket_id = ''shop-media'' and name = ''qr/mp09c2-moved.png''', '42501');
  -- Direct DELETE on storage.objects is blocked by Storage's own trigger (42501 for everyone), so
  -- the delete policy can only be exercised through the Storage API, not here.
end $$;

grant execute on function pg_temp.set_subject(integer, text), pg_temp.valid(), pg_temp.texts(),
  pg_temp.expect(text, text, text, text), pg_temp.assert_anon_acl(),
  pg_temp.assert_public_read(text, integer, boolean), pg_temp.assert_bucket_hidden(text),
  pg_temp.assert_staff(text), pg_temp.assert_owner() to anon, authenticated, service_role;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_anon_acl();
select pg_temp.assert_public_read('anon_default', 1, false);
select pg_temp.assert_staff('anon');
reset role;
set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_staff('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_staff('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_staff('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_owner();
select pg_temp.set_subject(2);
select pg_temp.assert_bucket_hidden('active_helper');
reset role;
set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_public_read('anon_after_owner', 2, true);
select pg_temp.assert_bucket_hidden('anon');
reset role;
set local role service_role;
-- A subject with no profile: service_role is not staff, so the owner RPCs refuse it.
select pg_temp.set_subject(9, 'service_role');
select pg_temp.expect('service_role', 'get_payment_methods', 'select * from public.get_payment_methods()', '42501');
select pg_temp.expect('service_role', 'save_payment_method',
  'select public.save_payment_method(''mp09c2-a'', pg_temp.valid(), null)', '42501');
select pg_temp.expect('service_role', 'save_shop_texts', 'select public.save_shop_texts(pg_temp.texts(), null)', '42501');
reset role;

do $$ begin
  -- The owner's saves changed exactly what they sent, and nothing a denied caller sent landed.
  if not exists (select 1 from public.payment_methods where id = 'mp09c2-a' and account_number = '0999 000 1111'
       and sort_order = 3 and active)
     or not exists (select 1 from public.payment_methods where id = 'mp09c2-new' and label = 'Fixture pay new' and qr_path = '')
     or exists (select 1 from public.payment_methods where id in ('mp09c2-raw') or label = 'x' or label = 'Raw')
     or (select count(*) from public.shop_texts) <> 1
     or not exists (select 1 from public.shop_texts where tin_line = 'Fixture line')
     or exists (select 1 from storage.objects where bucket_id = 'shop-media' and name like '%mp09c2-x%')
     or exists (select 1 from storage.objects where name like '%mp09c2-staff%') then
    raise exception 'payment fixture or result differs';
  end if;
  insert into pg_temp.authority_results values ('payment_fixture', 'preserved', 'owner_saves_only');
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
