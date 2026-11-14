-- Her own product types (migration 20260101008400): real SQL roles; all data rolls back.
begin;
insert into auth.users(id) values
 ('b0840000-0000-4000-8000-000000000001'),('b0840000-0000-4000-8000-000000000002'),('b0840000-0000-4000-8000-000000000003');
insert into public.profiles(id,role,display_name,active) values
 ('b0840000-0000-4000-8000-000000000001','owner','Types owner',true),
 ('b0840000-0000-4000-8000-000000000002','helper','Types helper',true),
 ('b0840000-0000-4000-8000-000000000003','owner','Inactive types owner',false);

create function pg_temp.act(p uuid) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$f$;
create function pg_temp.expect(label text, q text, wanted text) returns void language plpgsql as $f$
declare got text;
begin
  begin execute q; got := null; exception when others then got := sqlstate; end;
  if got is distinct from wanted then
    raise exception 'TYPES_EXPECTED % : wanted %, got %', label, coalesce(wanted, 'success'), coalesce(got, 'success');
  end if;
end;
$f$;
create function pg_temp.body(p_item text, p_type text default null) returns jsonb language sql as $f$
  select jsonb_build_object('active', true, 'allergens', 'Contains milk', 'capacity_weight', 1, 'description', '',
    'image_path', '', 'item_type', p_item, 'kind', 'Permanent', 'name', 'Types product', 'price_cents', 5000,
    'short_name', 'Types', 'sort_order', 900, 'tag', '')
    || case when p_type is null then '{}'::jsonb else jsonb_build_object('type_id', p_type) end
$f$;
create function pg_temp.ptype(p_id text, p_label text, p_beh text, p_active boolean default true) returns jsonb language sql as $f$
  select jsonb_build_object('id', p_id, 'label', p_label, 'behaves_as', p_beh, 'sort_order', 5, 'active', p_active)
$f$;

do $$
declare
  owner uuid := 'b0840000-0000-4000-8000-000000000001';
  at1 timestamptz; at2 timestamptz; v jsonb; who uuid;
begin
  -- Authority.
  if has_function_privilege('anon', 'public.save_product_type(jsonb,timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_product_types()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_product_type(jsonb,timestamptz)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_product_types()', 'EXECUTE') then
    raise exception 'TYPES_GRANTS changed';
  end if;
  foreach who in array array['b0840000-0000-4000-8000-000000000002', 'b0840000-0000-4000-8000-000000000003']::uuid[] loop
    perform pg_temp.act(who);
    perform pg_temp.expect('not owner', format('select public.save_product_type(%L, null)', pg_temp.ptype('ice-cream', 'Ice cream', 'item')), '42501');
  end loop;
  perform pg_temp.act('b0840000-0000-4000-8000-000000000002');
  perform public.get_product_types(); -- active staff may read

  perform pg_temp.act(owner);
  -- Shape and values.
  perform pg_temp.expect('extra key', format('select public.save_product_type(%L, null)', pg_temp.ptype('x', 'X', 'item') || '{"z":1}'), '22023');
  perform pg_temp.expect('bad slug', format('select public.save_product_type(%L, null)', pg_temp.ptype('Ice Cream', 'Ice cream', 'item')), '22023');
  perform pg_temp.expect('bad behaviour', format('select public.save_product_type(%L, null)', pg_temp.ptype('drink', 'Drink', 'drink')), '22023');
  perform pg_temp.expect('empty name', format('select public.save_product_type(%L, null)', pg_temp.ptype('drink', '  ', 'item')), '22023');
  perform pg_temp.expect('name taken', format('select public.save_product_type(%L, null)', pg_temp.ptype('biscuit', 'cookie', 'cookie')), '22023');

  -- Create, replay, rename.
  select t.updated_at into at1 from public.save_product_type(pg_temp.ptype('ice-cream', 'Ice cream', 'item'), null) t;
  select t.updated_at into at2 from public.save_product_type(pg_temp.ptype('ice-cream', 'Ice cream', 'item'), null) t;
  if at1 is distinct from at2 then raise exception 'TYPES_REPLAY must answer the same row'; end if;
  perform pg_temp.expect('create over existing', format('select public.save_product_type(%L, null)', pg_temp.ptype('ice-cream', 'Gelato', 'item')), 'P0002');
  select t.updated_at into at2 from public.save_product_type(pg_temp.ptype('ice-cream', 'Ice cream scoop', 'item'), at1) t;
  -- One transaction keeps one clock, so a stale stamp is simulated as an earlier one.
  perform pg_temp.expect('stale', format('select public.save_product_type(%L, %L)', pg_temp.ptype('ice-cream', 'Gelato', 'item'), at2 - interval '1 second'), 'P0002');

  -- A product takes her type; item_type follows its behaviour.
  perform public.save_flavour('types-scoop', pg_temp.body('item', 'ice-cream'), null);
  if (select item_type || '/' || type_id from public.products where id = 'types-scoop') <> 'item/ice-cream' then
    raise exception 'TYPES_PRODUCT did not take the type';
  end if;
  perform pg_temp.expect('behaviour disagrees', format('select public.save_flavour(%L, %L, null)', 'types-wrong', pg_temp.body('cookie', 'ice-cream')), '22023');
  perform pg_temp.expect('unknown type', format('select public.save_flavour(%L, %L, null)', 'types-wrong', pg_temp.body('item', 'nope')), '22023');
  perform pg_temp.expect('item without a type', format('select public.save_flavour(%L, %L, null)', 'types-wrong', pg_temp.body('item')), '22023');
  -- A body without type_id keeps the built-in type its item_type names (imports and older screens).
  perform public.save_flavour('types-plain', pg_temp.body('set'), null);
  if (select item_type || '/' || type_id from public.products where id = 'types-plain') <> 'set/set' then
    raise exception 'TYPES_BUILTIN did not follow item_type';
  end if;

  -- A type in use keeps its behaviour; a built-in one stays on; a switched-off type takes no new product but keeps its own.
  select t.updated_at into at1 from public.product_types t where t.id = 'ice-cream';
  perform pg_temp.expect('behaviour locked', format('select public.save_product_type(%L, %L)', pg_temp.ptype('ice-cream', 'Ice cream scoop', 'cookie'), at1), '55000');
  perform pg_temp.expect('builtin off', format('select public.save_product_type(%L, %L)',
    jsonb_build_object('id', 'cookie', 'label', 'Cookie', 'behaves_as', 'cookie', 'sort_order', 0, 'active', false),
    (select updated_at from public.product_types where id = 'cookie')), '55000');
  select t.updated_at into at2 from public.save_product_type(pg_temp.ptype('ice-cream', 'Ice cream scoop', 'item', false), at1) t;
  perform pg_temp.expect('off for new', format('select public.save_flavour(%L, %L, null)', 'types-new', pg_temp.body('item', 'ice-cream')), '22023');
  perform public.save_flavour('types-scoop', pg_temp.body('item', 'ice-cream') || '{"price_cents": 6000}',
    (select updated_at from public.products where id = 'types-scoop'));

  -- A save that names no type (a price change from the list) keeps the product's own type.
  begin
    perform public.save_flavour('types-scoop', pg_temp.body('item') || '{"price_cents": 6500}',
      (select updated_at from public.products where id = 'types-scoop'));
  exception when others then
    raise exception 'TYPES_KEEP a save without a type was refused: %', sqlerrm;
  end;
  if (select type_id from public.products where id = 'types-scoop') <> 'ice-cream' then
    raise exception 'TYPES_KEEP a save without a type lost the product type';
  end if;

  -- A direct insert naming only the behaviour takes the built-in type; an item needs one of her types.
  insert into public.products(id, name, short_name, price_cents, kind, item_type) values ('types-direct-set', 'Direct set', 'Direct', 100, 'Permanent', 'set');
  if (select item_type || '/' || type_id from public.products where id = 'types-direct-set') <> 'set/set' then
    raise exception 'TYPES_DIRECT a set inserted directly lost its behaviour';
  end if;
  perform pg_temp.expect('direct item', $q$insert into public.products(id, name, short_name, price_cents, kind, item_type) values ('types-direct-item', 'Direct item', 'Item', 100, 'Permanent', 'item')$q$, '22023');

  -- The trigger keeps item_type tied to the type for any writer.
  update public.products set item_type = 'cookie' where id = 'types-scoop';
  if (select item_type from public.products where id = 'types-scoop') <> 'item' then
    raise exception 'TYPES_TRIGGER let item_type drift from the type';
  end if;

  -- The read.
  v := public.get_product_types();
  if v -> 'products' ->> 'types-scoop' <> 'ice-cream'
     or not exists (select 1 from jsonb_array_elements(v -> 'types') t where t ->> 'id' = 'cookie' and (t ->> 'built_in')::boolean)
     or not exists (select 1 from jsonb_array_elements(v -> 'types') t where t ->> 'id' = 'ice-cream' and t ->> 'behaves_as' = 'item'
                      and not (t ->> 'active')::boolean) then
    raise exception 'TYPES_READ wrong: %', v;
  end if;
  if not exists (select 1 from public.audit_log where action = 'product_type.saved' and entity_id = 'ice-cream') then
    raise exception 'TYPES_AUDIT missing';
  end if;
end $$;
select 'PRODUCT_TYPES|passed';
rollback;
