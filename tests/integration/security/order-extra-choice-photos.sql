-- Disposable local fixture only. Synthetic profiles and all changes roll back.
begin;
insert into auth.users(id) values
  ('90000000-0000-4000-8000-000000000001'), ('90000000-0000-4000-8000-000000000002');
insert into public.profiles(id, role, display_name, active) values
  ('90000000-0000-4000-8000-000000000001', 'owner', 'Synthetic photo owner', true),
  ('90000000-0000-4000-8000-000000000002', 'helper', 'Synthetic photo helper', true);

create function pg_temp.check_it(ok boolean) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'choice photo assertion failed'; end if; end $$;
create function pg_temp.expect_error(statement text, wanted text) returns void language plpgsql as $$
declare got text;
begin
  begin execute statement; exception when others then got := SQLSTATE; end;
  if got is distinct from wanted then raise exception 'expected % got %', wanted, coalesce(got, 'success'); end if;
end $$;
create function pg_temp.owner_extras() returns jsonb language sql as $$
  select public.get_order_extras() $$;
create function pg_temp.save_photos(images jsonb, percent integer default null) returns void
language plpgsql as $$
declare x jsonb := public.get_order_extras();
begin
  x := x - 'updated_at' - 'choice_images';
  if percent is not null then x := jsonb_set(x, '{same_day_percent}', to_jsonb(percent)); end if;
  perform public.save_order_extras_with_images(
    x, images, (public.get_order_extras() ->> 'updated_at')::timestamptz);
end $$;
create function pg_temp.legacy_change_choices() returns void language plpgsql as $$
declare x jsonb := public.get_order_extras(); v_add_ons jsonb;
begin
  select jsonb_agg(case when a ->> 'id' = 'sticker'
    then jsonb_set(a, '{variants}', '["2"]'::jsonb) else a end)
    into v_add_ons from jsonb_array_elements(x -> 'add_ons') a;
  x := jsonb_set(x - 'updated_at' - 'choice_images', '{add_ons}', v_add_ons);
  perform public.save_order_extras(x, (public.get_order_extras() ->> 'updated_at')::timestamptz);
end $$;
grant execute on function pg_temp.check_it(boolean), pg_temp.expect_error(text,text),
  pg_temp.owner_extras(), pg_temp.save_photos(jsonb,integer), pg_temp.legacy_change_choices()
  to anon, authenticated;

-- Migration 088 default and configured hours remain distinct; old app code still falls back to Campus.
select pg_temp.check_it((select campus_label = 'JSEC Ateneo' and campus_from = '14:00'
  and campus_to = '15:30' from public.order_rules where id));
select pg_temp.check_it((select column_default like '%JSEC Ateneo%'
  from information_schema.columns where table_schema='public' and table_name='order_rules'
    and column_name='campus_label'));

select pg_temp.check_it(not has_function_privilege('anon', 'public.save_order_extras_with_images(jsonb,jsonb,timestamp with time zone)', 'EXECUTE'));
select pg_temp.check_it(not has_function_privilege('anon', 'public.get_order_extras()', 'EXECUTE'));
set local role anon;
select pg_temp.check_it(jsonb_typeof(public.get_shop_extras() -> 'add_ons') = 'array');
select pg_temp.expect_error('select public.save_order_extras_with_images(''{}'', ''{}'', now())', '42501');
select pg_temp.expect_error('select public.get_order_extras()', '42501');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error('select public.get_order_extras()', '42501');
select pg_temp.expect_error('select public.save_order_extras_with_images(''{}'', ''{}'', now())', '42501');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000002"}', true);
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);
select pg_temp.expect_error('select public.get_order_extras()', '42501');
select pg_temp.expect_error('select pg_temp.save_photos(''{}'')', '42501');
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"90000000-0000-4000-8000-000000000001"}', true);
select set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);

select pg_temp.check_it((pg_temp.owner_extras() ? 'choice_images')
  and pg_temp.owner_extras() -> 'choice_images' = '{}'::jsonb);
select pg_temp.expect_error(format('select pg_temp.save_photos(%L)',
  '{"sticker":{"1":"flavours/ABCDEF.webp"}}'), '22023');
select pg_temp.expect_error(format('select pg_temp.save_photos(%L, 45)',
  '{"sticker":{"missing":"flavours/' || repeat('a',32) || '.webp"}}'), '22023');
select pg_temp.check_it((public.get_order_extras() ->> 'same_day_percent')::integer = 40);

select pg_temp.save_photos(jsonb_build_object('sticker', jsonb_build_object(
  '1', 'flavours/' || repeat('a',32) || '.webp',
  '2', 'flavours/' || repeat('b',32) || '.jpg')));
select pg_temp.check_it((public.get_order_extras() -> 'choice_images' -> 'sticker') =
  jsonb_build_object('1', 'flavours/' || repeat('a',32) || '.webp',
                     '2', 'flavours/' || repeat('b',32) || '.jpg'));

-- An old exact-key save changes choices but leaves the separate association column intact.
select pg_temp.legacy_change_choices();
select pg_temp.check_it((public.get_order_extras() -> 'choice_images' -> 'sticker') ? '1');
select pg_temp.check_it(public.get_shop_extras() -> 'add_ons' @> jsonb_build_array(jsonb_build_object(
  'id','sticker','choice_images',jsonb_build_object('2','flavours/' || repeat('b',32) || '.jpg'))));
select pg_temp.check_it(not (public.get_shop_extras() -> 'add_ons' @> jsonb_build_array(jsonb_build_object(
  'id','sticker','choice_images',jsonb_build_object('1','flavours/' || repeat('a',32) || '.webp')))));
reset role;
rollback;

