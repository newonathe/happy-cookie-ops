-- B3b packaging records with real SQL roles; all data rolls back.
--
-- What a pack or a bazaar sale takes off stock is data now (packaging_rules, the owner's), and a flavour can carry packaging lines of
-- its own (recipe_ingredients.kind = packaging, a quantity PER COOKIE). get_packaging_rules / save_packaging_rules /
-- save_recipe_packaging: the active owner only (a helper, support, an inactive owner and anon are all refused; anon does not even hold
-- EXECUTE); the two rule tables have no API grant. Packing takes its boxes from the order's own boxes (order_boxes), capped at the
-- cookies in the order, the rest are loose; every movement is worked by hand in the comment above its case. A bake never takes a
-- packaging line. get_recipe_costs adds the packaging per cookie. The harness neutralises each `-- rule:` line of
-- save_packaging_rules and save_recipe_packaging and the text rules named in scripts/test-db-security.py (PACKAGING_MUTATIONS) in turn
-- and requires the named case here to fail. Outcome messages carry no quote character: the harness redacts quoted literals.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('b3b00000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 4) i;
insert into public.profiles(id, role, display_name, active) values
  ('b3b00000-0000-4000-8000-000000000001', 'owner', 'Packaging owner', true),
  ('b3b00000-0000-4000-8000-000000000002', 'helper', 'Packaging helper', true),
  ('b3b00000-0000-4000-8000-000000000003', 'support', 'Packaging support', true),
  ('b3b00000-0000-4000-8000-000000000004', 'owner', 'Packaging inactive owner', false);

-- Made-up stock: the packaging pieces (pcs, and wrap in g), flour and an item nobody has priced, and 81 spare items for the size limit.
insert into public.inventory_items(id, name, unit, category, active, on_hand) values
  ('pk-boxa', 'PK Box A', 'pcs', 'Packaging', true, 50),
  ('pk-boxb', 'PK Box B', 'pcs', 'Packaging', true, 50),
  ('pk-pouch', 'PK Pouch', 'pcs', 'Packaging', true, 50),
  ('pk-sticker', 'PK Sticker', 'pcs', 'Packaging', true, 10),
  ('pk-card', 'PK Card', 'pcs', 'Packaging', true, 50),
  ('pk-bag', 'PK Bag', 'pcs', 'Packaging', true, 50),
  ('pk-ribbon', 'PK Ribbon', 'pcs', 'Packaging', true, 200),
  ('pk-label', 'PK Label', 'pcs', 'Packaging', true, 50),
  ('pk-wrap', 'PK Wrap', 'g', 'Packaging', true, 100),
  ('pk-flour', 'PK Flour', 'g', 'Ingredients', true, 1000),
  ('pk-nocost', 'PK Nocost', 'g', 'Ingredients', true, 100);
insert into public.inventory_items(id, name, unit, category, active, on_hand)
select 'pk-many-' || n, 'PK Many ' || n, 'pcs', 'Packaging', true, 0 from generate_series(1, 81) n;
insert into public.products(id, name, short_name, price_cents, kind)
select 'pkp' || n, 'PK cookie ' || n, 'PK-' || n, 10000, 'cookie' from generate_series(1, 6) n;
-- pkp6 has no recipe at all.
insert into public.recipes(product_id, yield_count) values ('pkp1', 10), ('pkp2', 6), ('pkp3', 4), ('pkp4', 5), ('pkp5', 5);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position) values
  ('pkp1', 'PK Flour', 100, 'g', 0), ('pkp2', 'PK Flour', 60, 'g', 0), ('pkp3', 'PK Nocost', 40, 'g', 0),
  ('pkp4', 'PK Nocost', 50, 'g', 0), ('pkp5', 'PK Flour', 50, 'g', 0);
-- The recipes were written directly, so they get their item links and version rows the way the operator gives them.
select public.apply_identity_links(public.preview_identity_links() -> 'counts');
insert into public.orders(id, customer_name, phone) values
  ('PK-ORD-0', 'No rule yet', '09180000000'), ('PK-ORD-A', 'Two sizes', '09180000001'), ('PK-ORD-B', 'Boxes and loose', '09180000002'),
  ('PK-ORD-C', 'A size with no rule', '09180000003'), ('PK-ORD-D', 'All loose', '09180000004');
insert into public.order_items(order_id, product_id, qty, unit_price_cents) values
  ('PK-ORD-0', 'pkp1', 3, 10000),
  ('PK-ORD-A', 'pkp1', 14, 10000), ('PK-ORD-A', 'pkp2', 9, 10000),
  ('PK-ORD-B', 'pkp2', 11, 10000),
  ('PK-ORD-C', 'pkp2', 8, 10000),
  ('PK-ORD-D', 'pkp2', 3, 10000);
insert into public.order_boxes(order_id, size, qty, charge_cents) values
  ('PK-ORD-A', 6, 2, 0), ('PK-ORD-A', 12, 1, 0), ('PK-ORD-B', 6, 1, 0), ('PK-ORD-C', 8, 1, 0);
insert into public.events(id, name, starts_at, selling_device, price_snapshot)
values ('b3b0c105-0000-4000-8000-000000000001', 'PK stall', now() - interval '1 hour', 'devK',
        '{"pkp1": 10000, "pkp2": 10000, "pkp6": 10000}');

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'b3b00000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;

create function pg_temp.expect(actor text, operation text, statement text, wanted text) returns void
language plpgsql security invoker as $$
declare state text := '00000';
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics state = returned_sqlstate;
  end;
  if state <> wanted then
    raise exception 'packaging outcome differs: % / % / % (wanted %)', actor, operation, state, wanted;
  end if;
  insert into pg_temp.authority_results values (operation, actor, 'sqlstate_' || state);
end $$;
create function pg_temp.assert_ok(actor text, what text, ok boolean) returns void
language plpgsql security invoker as $$
begin
  if ok is not true then
    raise exception 'packaging check differs: % / %', actor, what;
  end if;
  insert into pg_temp.authority_results values (what, actor, 'ok');
end $$;

-- ---- readers (as the fixture owner: an API role cannot read these tables)
create function pg_temp.on_hand(item text) returns numeric language sql stable security definer as $$
  select on_hand from public.inventory_items where id = item $$;
create function pg_temp.rules_n() returns bigint language plpgsql stable security definer as $$
begin return (select count(*) from public.packaging_rules); end $$;
create function pg_temp.rules_stamp() returns timestamptz language plpgsql stable security definer as $$
begin return (select updated_at from public.packaging_rules_state); end $$;
create function pg_temp.audit_n(act text) returns bigint language sql stable security definer as $$
  select count(*) from public.audit_log a where a.action = act $$;
create function pg_temp.cur_version(pid text) returns integer language sql stable security definer as $$
  select version from public.recipes where product_id = pid $$;
create function pg_temp.snap(pid text, v integer) returns jsonb language sql stable security definer as $$
  select lines from public.recipe_versions where product_id = pid and version = v $$;
create function pg_temp.n_lines(pid text, k text) returns bigint language plpgsql stable security definer as $$
begin return (select count(*) from public.recipe_ingredients where product_id = pid and kind = k); end $$;
create function pg_temp.n_versions(pid text) returns bigint language sql stable security definer as $$
  select count(*) from public.recipe_versions where product_id = pid $$;
create function pg_temp.records(k text) returns bigint language sql stable security definer as $$
  select count(*) from public.production_records where kind = k $$;
create function pg_temp.moves_of(prod uuid) returns bigint language sql stable security definer as $$
  select count(*) from public.stock_movements where production_id = prod $$;
-- The movements of one record (a pack, a sale or a batch) as {seq, item, delta}: the seq is recovered from the movement id, which must be
-- md5(record id : seq : item id).
create function pg_temp.moves(prod uuid) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('seq', x.n, 'item', x.item_id, 'delta', x.qty_delta, 'reason', x.reason) order by x.n), '[]'::jsonb)
    from (select m.item_id, m.qty_delta, m.reason,
                 (select s from generate_series(1, 40) s where md5(m.production_id::text || ':' || s || ':' || m.item_id)::uuid = m.id) as n
            from public.stock_movements m where m.production_id = prod) x $$;
create function pg_temp.pack_id(ord text) returns uuid language sql immutable as $$ select md5('pack:' || ord)::uuid $$;
create function pg_temp.sale_id(client text) returns uuid language sql stable security definer as $$
  select id from public.event_sales where client_id = client $$;
create function pg_temp.sale_short(client text) returns jsonb language sql stable security definer as $$
  select r.short from public.production_records r where r.id = pg_temp.sale_id(client) and r.kind = 'sale' $$;
create function pg_temp.sale_qty(client text) returns integer language sql stable security definer as $$
  select r.qty from public.production_records r where r.id = pg_temp.sale_id(client) and r.kind = 'sale' $$;
create function pg_temp.rstamp(pid text) returns timestamptz language sql stable as $$
  select (x ->> 'updated_at')::timestamptz from jsonb_array_elements(public.get_recipes()) x where x ->> 'product_id' = pid $$;
create function pg_temp.recipe(pid text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(public.get_recipes()) x where x ->> 'product_id' = pid $$;
create function pg_temp.rc(pid text) returns jsonb language sql stable as $$
  select x from jsonb_array_elements(public.get_recipe_costs()) x where x ->> 'product_id' = pid $$;
create function pg_temp.rules_proj() returns jsonb language plpgsql stable as $$
begin
  return (select coalesce(jsonb_agg(jsonb_build_array(x.value ->> 'container', x.value -> 'box_size', x.value ->> 'item_id', x.value -> 'qty',
                                                      x.value ->> 'per', x.value -> 'position') order by x.ord), '[]'::jsonb)
            from jsonb_array_elements(public.get_packaging_rules() -> 'rules') with ordinality x(value, ord));
end $$;
create function pg_temp.rec_qty(id uuid) returns integer language sql stable security definer as $$
  select qty from public.production_records where production_records.id = rec_qty.id $$;
create function pg_temp.basis_default() returns text language sql stable security definer as $$
  select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.books_settings'::regclass and a.attname = 'cost_basis' $$;
create function pg_temp.today_txt(plus integer) returns text language sql stable security definer as $$
  select (c.today + plus)::text from public.business_clock() c $$;

-- ---- writers
create function pg_temp.rule(container text, size integer, item text, qty numeric, per text) returns jsonb
language sql immutable as $$
  select jsonb_build_object('box_size', size, 'container', container, 'item_id', item, 'per', per, 'qty', qty) $$;
create function pg_temp.sp(actor text, op text, rules jsonb, expected timestamptz, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.save_packaging_rules(%L::jsonb, %L::timestamptz)', rules::text, expected), wanted);
end $$;
create function pg_temp.line(item text, qty numeric) returns jsonb language sql immutable as $$
  select jsonb_build_object('item_id', item, 'qty', qty) $$;
create function pg_temp.pbody(pid text, lines jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('product_id', pid, 'lines', lines) $$;
create function pg_temp.sr(actor text, op text, body jsonb, expected timestamptz, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.save_recipe_packaging(%L::jsonb, %L::timestamptz)', body::text, expected), wanted);
end $$;
create function pg_temp.price(actor text, op text, n integer, item text, cents numeric, pack numeric) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.save_item_price(%L::jsonb)', jsonb_build_object(
    'id', 'b3b10000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'item_id', item, 'price_cents', cents, 'pack_size', pack,
    'as_of', pg_temp.today_txt(-1))::text), '00000');
end $$;
create function pg_temp.sale(client text, items jsonb) returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('clientId', client, 'deviceId', 'devK', 'eventId', 'b3b0c105-0000-4000-8000-000000000001',
    'items', items, 'discountCents', 0, 'totalCents', (select sum(v::int) from jsonb_each_text(items) e(k, v)) * 10000, 'pay', 'Cash',
    'ref', '', 'clerk', 'Owner', 'at', (extract(epoch from now()) * 1000)::bigint,
    'tenderedCents', (select sum(v::int) from jsonb_each_text(items) e(k, v)) * 10000, 'changeCents', 0)
$$;
create function pg_temp.sell(actor text, op text, client text, items jsonb) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.record_event_sale(%L::jsonb)', pg_temp.sale(client, items)::text), '00000');
end $$;
-- A valid batch record of production: number n gives its id.
create function pg_temp.bake(n integer, product text, qty numeric, version integer, over jsonb default '{}'::jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', 'b3b20000-0000-4000-8000-' || lpad(n::text, 12, '0'), 'kind', 'batch', 'product_id', product, 'qty', qty,
    'target', qty, 'rejects', 0, 'adj', '{}'::jsonb, 'recipe_version', version, 'drop_no', 5,
    'at', (extract(epoch from now()) * 1000)::bigint) || over $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['get_packaging_rules()', 'save_packaging_rules(jsonb,timestamptz)', 'save_recipe_packaging(jsonb,timestamptz)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden packaging call succeeded: anon / %', f;
    end if;
  end loop;
  if has_function_privilege('anon', 'public.record_sale_packaging(uuid,integer,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.record_sale_packaging(uuid,integer,timestamptz)', 'EXECUTE') then
    raise exception 'forbidden packaging call succeeded: an API role / record_sale_packaging(uuid,integer,timestamptz)';
  end if;
  foreach f in array array['use_stock_item(uuid,integer,text,numeric,text,timestamptz,boolean)', 'lock_stock_item_ids(text[])'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') or has_function_privilege('authenticated', 'public.' || f, 'EXECUTE')
       or has_function_privilege('service_role', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden packaging call succeeded: an API role / %', f;
    end if;
  end loop;
  insert into pg_temp.authority_results values ('pk_acl', 'anon', 'packaging_rpcs_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'rules_select', 'select * from public.packaging_rules', '42501');
  perform pg_temp.expect(actor, 'rules_insert',
    'insert into public.packaging_rules(container, box_size, item_id, qty, per, position) values (''loose'', null, ''pk-pouch'', 1, ''cookie'', 0)', '42501');
  perform pg_temp.expect(actor, 'rules_update', 'update public.packaging_rules set qty = 1', '42501');
  perform pg_temp.expect(actor, 'rules_delete', 'delete from public.packaging_rules', '42501');
  perform pg_temp.expect(actor, 'rules_state_select', 'select * from public.packaging_rules_state', '42501');
  perform pg_temp.expect(actor, 'rules_state_insert', 'insert into public.packaging_rules_state(id, updated_at) values (true, now())', '42501');
  perform pg_temp.expect(actor, 'rules_state_update', 'update public.packaging_rules_state set updated_at = now()', '42501');
  perform pg_temp.expect(actor, 'rules_state_delete', 'delete from public.packaging_rules_state', '42501');
  perform pg_temp.expect(actor, 'recipe_kind_update', 'update public.recipe_ingredients set kind = ''packaging''', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'get_packaging_rules', 'select public.get_packaging_rules()', '42501');
  perform pg_temp.expect(actor, 'save_packaging_rules', 'select * from public.save_packaging_rules(''[]''::jsonb, null)', '42501');
  perform pg_temp.expect(actor, 'save_recipe_packaging', 'select * from public.save_recipe_packaging(''{}''::jsonb, null)', '42501');
end $$;

-- ================================================================ before any rule exists
-- Nothing is entered yet: a pack and a bazaar sale take nothing and say so (a missing rule is a shortfall, never a silent zero).
create function pg_temp.phase_pre(a text) returns void language plpgsql security invoker as $$
declare r record;
begin
  perform pg_temp.assert_ok(a, 'pk_basis_defaults_to_used', public.get_books(now() - interval '1 day', now()) ->> 'basis' = 'used');
  perform pg_temp.assert_ok(a, 'pk_basis_column_default_is_used', pg_temp.basis_default() like '%used%');
  select * into r from public.record_pack('PK-ORD-0', 5);
  perform pg_temp.assert_ok(a, 'pk_pack_without_rules_says_so',
    not r.duplicate and r.shortfall = '[{"name": "packaging rule", "by": 3, "unit": "pcs", "why": "no packaging rule"}]'::jsonb
    and pg_temp.moves_of(pg_temp.pack_id('PK-ORD-0')) = 0 and pg_temp.records('pack') = 1);
  perform pg_temp.sell(a, 'pk_sale_without_rules', 'devK:S0:1', '{"pkp1": 3}');
  perform pg_temp.assert_ok(a, 'pk_sale_without_rules_says_so',
    pg_temp.sale_short('devK:S0:1') = '[{"name": "packaging rule", "by": 3, "unit": "pcs", "why": "no packaging rule"}]'::jsonb
    and pg_temp.moves_of(pg_temp.sale_id('devK:S0:1')) = 0 and pg_temp.sale_qty('devK:S0:1') = 3);
  select * into r from public.record_pack('PK-ORD-0', 5);
  perform pg_temp.assert_ok(a, 'pk_pack_replay_answers_the_first',
    r.duplicate and r.shortfall = '[{"name": "packaging rule", "by": 3, "unit": "pcs", "why": "no packaging rule"}]'::jsonb and pg_temp.records('pack') = 1);
end $$;

-- ================================================================ the rules
create function pg_temp.phase_rules(a text) returns void language plpgsql security invoker as $$
declare r record; s1 timestamptz; s2 timestamptz; eighty jsonb; over80 jsonb; one jsonb; full_set jsonb;
begin
  eighty := (select jsonb_agg(pg_temp.rule('loose', null, 'pk-many-' || n, 1, 'cookie') order by n) from generate_series(1, 80) n);
  over80 := (select jsonb_agg(pg_temp.rule('loose', null, 'pk-many-' || n, 1, 'cookie') order by n) from generate_series(1, 81) n);
  one := jsonb_build_array(pg_temp.rule('box', 6, 'pk-boxa', 1, 'container'));
  perform pg_temp.assert_ok(a, 'pk_rules_start_empty',
    public.get_packaging_rules() -> 'updated_at' = 'null'::jsonb and public.get_packaging_rules() -> 'rules' = '[]'::jsonb);

  -- every refusal changes nothing, and each is the only thing wrong with its body
  perform pg_temp.sp(a, 'pk_rules_not_array', '{}'::jsonb, null, '22023');
  perform pg_temp.sp(a, 'pk_rules_null', null, null, '22023');
  perform pg_temp.sp(a, 'pk_rules_size_81', over80, null, '22023');
  perform pg_temp.sp(a, 'pk_rule_keys_extra', jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 1, 'cookie') || '{"note": "x"}'), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_keys_missing', jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 1, 'cookie') - 'per'), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_not_object', '[5]'::jsonb, null, '22023');
  perform pg_temp.sp(a, 'pk_rule_type_qty_string', jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 1, 'cookie') || '{"qty": "1"}'), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_type_box_size_string', jsonb_build_array(pg_temp.rule('box', 6, 'pk-boxa', 1, 'container') || '{"box_size": "6"}'), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_type_item_number', jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 1, 'cookie') || '{"item_id": 5}'), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_container_unknown', jsonb_build_array(pg_temp.rule('shelf', null, 'pk-pouch', 1, 'cookie')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_box_size_missing', jsonb_build_array(pg_temp.rule('box', null, 'pk-boxa', 1, 'container')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_box_size_one', jsonb_build_array(pg_temp.rule('box', 1, 'pk-boxa', 1, 'container')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_box_size_49', jsonb_build_array(pg_temp.rule('box', 49, 'pk-boxa', 1, 'container')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_box_size_fraction', jsonb_build_array(pg_temp.rule('box', 6, 'pk-boxa', 1, 'container') || '{"box_size": 6.5}'), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_box_size_on_loose', jsonb_build_array(pg_temp.rule('loose', 6, 'pk-pouch', 1, 'cookie')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_box_size_on_order', jsonb_build_array(pg_temp.rule('order', 6, 'pk-card', 1, 'container')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_qty_zero', jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 0, 'cookie')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_qty_negative', jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', -1, 'cookie')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_qty_four_decimals', jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 1.0005, 'cookie')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_qty_over_limit', jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 1000000, 'cookie')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_per_unknown', jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 1, 'batch')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_item_missing', jsonb_build_array(pg_temp.rule('loose', null, 'pk-nothing', 1, 'cookie')), null, 'P0002');
  perform pg_temp.sp(a, 'pk_rule_duplicate',
    jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 1, 'cookie'), pg_temp.rule('loose', null, 'pk-pouch', 2, 'container')), null, '22023');
  perform pg_temp.sp(a, 'pk_rule_duplicate_same_box_size',
    jsonb_build_array(pg_temp.rule('box', 6, 'pk-boxa', 1, 'container'), pg_temp.rule('box', 6, 'pk-boxa', 1, 'cookie')), null, '22023');
  perform pg_temp.sp(a, 'pk_rules_stale_without_state', one, now(), 'P0002');
  perform pg_temp.assert_ok(a, 'pk_rules_refusals_changed_nothing',
    pg_temp.rules_n() = 0 and pg_temp.rules_stamp() is null and pg_temp.audit_n('packaging.rules') = 0);

  -- the first save expects no stamp; 80 rules is the limit and is accepted
  select * into r from public.save_packaging_rules(eighty, null);
  s1 := r.updated_at;
  perform pg_temp.assert_ok(a, 'pk_rules_eighty_saved',
    s1 is not null and pg_temp.rules_n() = 80 and s1 = pg_temp.rules_stamp() and pg_temp.audit_n('packaging.rules') = 1);
  -- a lost reply's retry: the same set is answered with the stamp it made, and changes nothing
  perform pg_temp.sp(a, 'pk_rules_retry_answered', eighty, null, '00000');
  perform pg_temp.assert_ok(a, 'pk_rules_retry_changes_nothing',
    pg_temp.rules_n() = 80 and pg_temp.rules_stamp() = s1 and pg_temp.audit_n('packaging.rules') = 1);
  -- a different set must carry the stamp that was read
  perform pg_temp.sp(a, 'pk_rules_stale_without_stamp', one, null, 'P0002');
  perform pg_temp.sp(a, 'pk_rules_stale_old_stamp', one, s1 - interval '1 day', 'P0002');
  perform pg_temp.assert_ok(a, 'pk_rules_stale_changed_nothing', pg_temp.rules_n() = 80 and pg_temp.rules_stamp() = s1);

  -- the whole set is replaced, and the stamp moves on
  select * into r from public.save_packaging_rules(one, s1);
  s2 := r.updated_at;
  perform pg_temp.assert_ok(a, 'pk_rules_replace_whole_set',
    pg_temp.rules_n() = 1 and s2 > s1 and s2 = pg_temp.rules_stamp() and pg_temp.audit_n('packaging.rules') = 2);
  perform pg_temp.sp(a, 'pk_rules_stale_after_save', '[]'::jsonb, s1, 'P0002');
  perform pg_temp.sp(a, 'pk_rules_retry_after_replace', one, s1, '00000');
  perform pg_temp.assert_ok(a, 'pk_rules_retry_after_replace_changes_nothing', pg_temp.rules_stamp() = s2 and pg_temp.rules_n() = 1);

  -- the real set: positions follow the array order inside each container (and box size)
  full_set := jsonb_build_array(
    pg_temp.rule('box', 6, 'pk-boxa', 1, 'container'), pg_temp.rule('box', 12, 'pk-boxb', 1, 'container'),
    pg_temp.rule('loose', null, 'pk-pouch', 1, 'cookie'), pg_temp.rule('order', null, 'pk-card', 1, 'container'),
    pg_temp.rule('bazaar_sale', null, 'pk-pouch', 1, 'cookie'), pg_temp.rule('box', 6, 'pk-sticker', 1, 'container'),
    pg_temp.rule('box', 12, 'pk-sticker', 2, 'container'), pg_temp.rule('loose', null, 'pk-sticker', 1, 'container'),
    pg_temp.rule('order', null, 'pk-wrap', 0.25, 'cookie'), pg_temp.rule('bazaar_sale', null, 'pk-bag', 1, 'container'),
    pg_temp.rule('box', 12, 'pk-wrap', 0.5, 'cookie'));
  select * into r from public.save_packaging_rules(full_set, s2);
  perform pg_temp.assert_ok(a, 'pk_rules_full_set_saved', r.updated_at > s2 and r.updated_at = pg_temp.rules_stamp() and pg_temp.rules_n() = 11);
  perform pg_temp.assert_ok(a, 'pk_rules_read_back_in_order', pg_temp.rules_proj() = '[
    ["bazaar_sale", null, "pk-pouch", 1, "cookie", 0], ["bazaar_sale", null, "pk-bag", 1, "container", 1],
    ["box", 6, "pk-boxa", 1, "container", 0], ["box", 6, "pk-sticker", 1, "container", 1],
    ["box", 12, "pk-boxb", 1, "container", 0], ["box", 12, "pk-sticker", 2, "container", 1], ["box", 12, "pk-wrap", 0.5, "cookie", 2],
    ["loose", null, "pk-pouch", 1, "cookie", 0], ["loose", null, "pk-sticker", 1, "container", 1],
    ["order", null, "pk-card", 1, "container", 0], ["order", null, "pk-wrap", 0.25, "cookie", 1]]'::jsonb);
  perform pg_temp.assert_ok(a, 'pk_rules_read_carries_the_item',
    public.get_packaging_rules() -> 'rules' -> 6 ->> 'item_name' = 'PK Wrap' and public.get_packaging_rules() -> 'rules' -> 6 ->> 'unit' = 'g'
    and public.get_packaging_rules() -> 'rules' -> 6 ? 'id' and public.get_packaging_rules() -> 'rules' -> 0 ->> 'unit' = 'pcs');
  perform pg_temp.assert_ok(a, 'pk_rules_audit_rows', pg_temp.audit_n('packaging.rules') = 3);
end $$;

-- ================================================================ a flavour's own packaging lines
create function pg_temp.phase_recipes_a(a text) returns void language plpgsql security invoker as $$
declare r record; st timestamptz; over80 jsonb; j jsonb;
begin
  over80 := (select jsonb_agg(pg_temp.line('pk-many-' || n, 1) order by n) from generate_series(1, 81) n);
  st := pg_temp.rstamp('pkp1');
  perform pg_temp.assert_ok(a, 'pk_recipe_starts_without_packaging',
    pg_temp.recipe('pkp1') -> 'packaging' = '[]'::jsonb and (pg_temp.recipe('pkp1') ->> 'version')::int = 1);
  perform pg_temp.sr(a, 'pk_pkg_not_object', '[]'::jsonb, st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_keys_extra', pg_temp.pbody('pkp1', '[]') || '{"yield": 10}', st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_keys_missing', '{"product_id": "pkp1"}'::jsonb, st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_type_product', '{"product_id": 5, "lines": []}'::jsonb, st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_type_lines', '{"product_id": "pkp1", "lines": "none"}'::jsonb, st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_size_81', pg_temp.pbody('pkp1', over80), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_line_not_object', pg_temp.pbody('pkp1', '[5]'), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_line_keys_extra', pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1) || '{"unit": "pcs"}')), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_line_keys_missing', pg_temp.pbody('pkp1', '[{"qty": 1}]'), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_line_type_qty', pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1) || '{"qty": "1"}')), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_line_type_item', pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1) || '{"item_id": 5}')), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_qty_zero', pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 0))), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_qty_four_decimals', pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1.0005))), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_qty_over_limit', pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1000000))), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_duplicate',
    pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1), pg_temp.line('pk-ribbon', 2))), st, '22023');
  perform pg_temp.sr(a, 'pk_pkg_item_missing', pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-nothing', 1))), st, 'P0002');
  perform pg_temp.sr(a, 'pk_pkg_recipe_missing', pg_temp.pbody('pkp6', jsonb_build_array(pg_temp.line('pk-ribbon', 1))), null, 'P0002');
  perform pg_temp.sr(a, 'pk_pkg_stale_old_stamp', pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1))), st - interval '1 day', 'P0002');
  perform pg_temp.sr(a, 'pk_pkg_stale_without_stamp', pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1))), null, 'P0002');
  perform pg_temp.assert_ok(a, 'pk_pkg_refusals_changed_nothing',
    pg_temp.n_lines('pkp1', 'packaging') = 0 and pg_temp.cur_version('pkp1') = 1 and pg_temp.rstamp('pkp1') = st and pg_temp.n_versions('pkp1') = 1);

  -- pkp1: a ribbon and a quarter label per cookie. Version 2; the ingredient lines the editor shows do not change.
  select * into r from public.save_recipe_packaging(pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1), pg_temp.line('pk-label', 0.25))), st);
  perform pg_temp.assert_ok(a, 'pk_pkg_saved_a_new_version', r.product_id = 'pkp1' and r.version = 2 and r.updated_at = pg_temp.rstamp('pkp1')
    and pg_temp.cur_version('pkp1') = 2 and pg_temp.n_lines('pkp1', 'packaging') = 2 and pg_temp.n_lines('pkp1', 'ingredient') = 1);
  j := pg_temp.recipe('pkp1');
  perform pg_temp.assert_ok(a, 'pk_get_recipes_separates_the_kinds',
    j -> 'lines' = '[{"name": "PK Flour", "qty": 100, "unit": "g", "item_id": "pk-flour"}]'::jsonb
    and j -> 'packaging' = '[{"name": "PK Ribbon", "item_id": "pk-ribbon", "qty": 1, "unit": "pcs"}, {"name": "PK Label", "item_id": "pk-label", "qty": 0.25, "unit": "pcs"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'pk_snapshot_has_ingredients_then_packaging',
    pg_temp.snap('pkp1', 2) = '[{"name": "PK Flour", "qty": 100, "unit": "g"}, {"kind": "packaging", "name": "PK Ribbon", "qty": 1, "unit": "pcs"},
      {"kind": "packaging", "name": "PK Label", "qty": 0.25, "unit": "pcs"}]'::jsonb
    and pg_temp.snap('pkp1', 1) = '[{"name": "PK Flour", "qty": 100, "unit": "g"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'pk_history_never_shows_packaging_as_an_ingredient',
    j -> 'history' = '[{"version": 1, "yield": 10, "lines": [{"name": "PK Flour", "qty": 100, "unit": "g"}]}]'::jsonb);
  perform pg_temp.assert_ok(a, 'pk_pkg_audit_row', pg_temp.audit_n('recipes.packaging') = 1);
  -- nothing new (a retry, or a save with no change): answered, and no version is made
  select * into r from public.save_recipe_packaging(pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1), pg_temp.line('pk-label', 0.25))), pg_temp.rstamp('pkp1'));
  perform pg_temp.assert_ok(a, 'pk_pkg_noop_makes_no_version', r.version = 2 and pg_temp.cur_version('pkp1') = 2 and pg_temp.n_versions('pkp1') = 2
    and r.updated_at = pg_temp.rstamp('pkp1') and pg_temp.audit_n('recipes.packaging') = 1);
  -- a retry with the stamp from before the save is answered too
  select * into r from public.save_recipe_packaging(pg_temp.pbody('pkp1', jsonb_build_array(pg_temp.line('pk-ribbon', 1), pg_temp.line('pk-label', 0.25))), st);
  perform pg_temp.assert_ok(a, 'pk_pkg_retry_with_old_stamp_answered', r.version = 2 and pg_temp.n_versions('pkp1') = 2);

  -- the other flavours
  perform pg_temp.sr(a, 'pk_pkg_pkp2', pg_temp.pbody('pkp2', jsonb_build_array(pg_temp.line('pk-ribbon', 2))), pg_temp.rstamp('pkp2'), '00000');
  perform pg_temp.sr(a, 'pk_pkg_pkp3', pg_temp.pbody('pkp3', jsonb_build_array(pg_temp.line('pk-wrap', 1))), pg_temp.rstamp('pkp3'), '00000');
  perform pg_temp.sr(a, 'pk_pkg_pkp4', pg_temp.pbody('pkp4', jsonb_build_array(pg_temp.line('pk-ribbon', 1))), pg_temp.rstamp('pkp4'), '00000');
  perform pg_temp.sr(a, 'pk_pkg_pkp5', pg_temp.pbody('pkp5', jsonb_build_array(pg_temp.line('pk-wrap', 1))), pg_temp.rstamp('pkp5'), '00000');
  -- replacing the lines replaces only the packaging; an empty list takes them all away (version 3, then back to version 4)
  perform pg_temp.sr(a, 'pk_pkg_replace_lines', pg_temp.pbody('pkp5', jsonb_build_array(pg_temp.line('pk-wrap', 2))), pg_temp.rstamp('pkp5'), '00000');
  perform pg_temp.assert_ok(a, 'pk_pkg_replaced_lines', pg_temp.cur_version('pkp5') = 3 and pg_temp.n_lines('pkp5', 'packaging') = 1
    and pg_temp.n_lines('pkp5', 'ingredient') = 1 and pg_temp.recipe('pkp5') -> 'packaging' -> 0 -> 'qty' = '2'::jsonb);
  perform pg_temp.sr(a, 'pk_pkg_replace_to_none', pg_temp.pbody('pkp5', '[]'), pg_temp.rstamp('pkp5'), '00000');
  perform pg_temp.assert_ok(a, 'pk_pkg_emptied', pg_temp.cur_version('pkp5') = 4 and pg_temp.n_lines('pkp5', 'packaging') = 0
    and pg_temp.recipe('pkp5') -> 'packaging' = '[]'::jsonb and pg_temp.n_lines('pkp5', 'ingredient') = 1);
  perform pg_temp.sr(a, 'pk_pkg_pkp5_again', pg_temp.pbody('pkp5', jsonb_build_array(pg_temp.line('pk-wrap', 1))), pg_temp.rstamp('pkp5'), '00000');
end $$;

-- ================================================================ what a recipe costs per cookie
-- Prices (centavos per unit): flour 5000 / 1000 g = 5, ribbon 3000 / 100 = 30, label 1000 / 100 = 10. Wrap and the nocost item have no price.
-- pkp1 (yield 10): flour 100 g = 500 a batch = 50 a cookie; a ribbon (30) and a quarter label (2.5) a cookie = 32.5; 82.5 a cookie.
-- pkp2 (yield 6): flour 60 g = 300 a batch = 50 a cookie; two ribbons = 60; 110 a cookie.
create function pg_temp.phase_costs(a text) returns void language plpgsql security invoker as $$
declare j jsonb;
begin
  perform pg_temp.price(a, 'pk_price_flour', 1, 'pk-flour', 5000, 1000);
  perform pg_temp.price(a, 'pk_price_ribbon', 2, 'pk-ribbon', 3000, 100);
  perform pg_temp.price(a, 'pk_price_label', 3, 'pk-label', 1000, 100);
  j := pg_temp.rc('pkp1');
  perform pg_temp.assert_ok(a, 'pk_costs_worked_recipe',
    (j ->> 'version')::int = 2 and (j ->> 'batch_cents')::numeric = 500 and (j ->> 'ingredient_per_cookie_cents')::numeric = 50
    and (j ->> 'packaging_per_cookie_cents')::numeric = 32.5 and (j ->> 'per_cookie_cents')::numeric = 82.5
    and (j ->> 'complete')::boolean and j -> 'missing' = '[]'::jsonb);
  perform pg_temp.assert_ok(a, 'pk_costs_lines_by_kind',
    jsonb_array_length(j -> 'lines') = 3 and j -> 'lines' -> 0 ->> 'kind' = 'ingredient' and j -> 'lines' -> 0 ->> 'name' = 'PK Flour'
    and (j -> 'lines' -> 0 ->> 'cents')::numeric = 500 and j -> 'lines' -> 1 ->> 'kind' = 'packaging' and j -> 'lines' -> 1 ->> 'name' = 'PK Ribbon'
    and j -> 'lines' -> 1 ->> 'item_id' = 'pk-ribbon' and (j -> 'lines' -> 1 ->> 'qty')::numeric = 1 and j -> 'lines' -> 1 ->> 'unit' = 'pcs'
    and (j -> 'lines' -> 1 ->> 'unit_cost')::numeric = 30 and j -> 'lines' -> 1 ->> 'source' = 'usual' and (j -> 'lines' -> 1 ->> 'cents')::numeric = 30
    and j -> 'lines' -> 2 ->> 'kind' = 'packaging' and (j -> 'lines' -> 2 ->> 'qty')::numeric = 0.25 and (j -> 'lines' -> 2 ->> 'cents')::numeric = 2.5);
  j := pg_temp.rc('pkp2');
  perform pg_temp.assert_ok(a, 'pk_costs_second_recipe',
    (j ->> 'batch_cents')::numeric = 300 and (j ->> 'ingredient_per_cookie_cents')::numeric = 50 and (j ->> 'packaging_per_cookie_cents')::numeric = 60
    and (j ->> 'per_cookie_cents')::numeric = 110 and (j ->> 'complete')::boolean);
  -- nothing at all could be costed: unknown, never 0
  j := pg_temp.rc('pkp3');
  perform pg_temp.assert_ok(a, 'pk_costs_nothing_costed_is_null',
    j -> 'batch_cents' = 'null'::jsonb and j -> 'ingredient_per_cookie_cents' = 'null'::jsonb and j -> 'packaging_per_cookie_cents' = 'null'::jsonb
    and j -> 'per_cookie_cents' = 'null'::jsonb and not (j ->> 'complete')::boolean
    and j -> 'missing' = '[{"name": "PK Nocost", "why": "no cost", "kind": "ingredient"}, {"name": "PK Wrap", "why": "no cost", "kind": "packaging"}]'::jsonb);
  -- packaging alone is costed: the per-cookie cost is what is known
  j := pg_temp.rc('pkp4');
  perform pg_temp.assert_ok(a, 'pk_costs_packaging_alone',
    j -> 'batch_cents' = 'null'::jsonb and j -> 'ingredient_per_cookie_cents' = 'null'::jsonb and (j ->> 'packaging_per_cookie_cents')::numeric = 30
    and (j ->> 'per_cookie_cents')::numeric = 30 and not (j ->> 'complete')::boolean
    and j -> 'missing' = '[{"name": "PK Nocost", "why": "no cost", "kind": "ingredient"}]'::jsonb);
  -- ingredients alone are costed, a packaging line is not: the cookie costs what is known, and the recipe is not complete
  j := pg_temp.rc('pkp5');
  perform pg_temp.assert_ok(a, 'pk_costs_ingredients_alone',
    (j ->> 'batch_cents')::numeric = 250 and (j ->> 'ingredient_per_cookie_cents')::numeric = 50 and j -> 'packaging_per_cookie_cents' = 'null'::jsonb
    and (j ->> 'per_cookie_cents')::numeric = 50 and not (j ->> 'complete')::boolean
    and j -> 'missing' = '[{"name": "PK Wrap", "why": "no cost", "kind": "packaging"}]'::jsonb);
end $$;

-- ================================================================ ingredient edits keep the packaging; a bake takes none of it
create function pg_temp.phase_recipes_b(a text) returns void language plpgsql security invoker as $$
declare r record; j jsonb; v integer; ribbon numeric; lbl numeric; before_flour numeric;
begin
  -- an edit that changes nothing in the ingredients is a no-op, whatever packaging the recipe carries
  select * into r from public.save_recipe(jsonb_build_object('product_id', 'pkp1', 'yield', 10,
    'lines', jsonb_build_array(jsonb_build_object('name', 'PK Flour', 'qty', 100, 'unit', 'g'))), pg_temp.rstamp('pkp1'));
  perform pg_temp.assert_ok(a, 'pk_save_recipe_noop_ignores_packaging', r.version = 2 and pg_temp.cur_version('pkp1') = 2 and pg_temp.n_versions('pkp1') = 2);
  -- a real edit makes version 3; the packaging lines are untouched and the snapshot lists ingredients first
  select * into r from public.save_recipe(jsonb_build_object('product_id', 'pkp1', 'yield', 10,
    'lines', jsonb_build_array(jsonb_build_object('name', 'PK Flour', 'qty', 120, 'unit', 'g'))), pg_temp.rstamp('pkp1'));
  v := r.version;
  perform pg_temp.assert_ok(a, 'pk_save_recipe_keeps_packaging', v = 3 and pg_temp.n_lines('pkp1', 'packaging') = 2 and pg_temp.n_lines('pkp1', 'ingredient') = 1
    and pg_temp.recipe('pkp1') -> 'packaging' -> 1 ->> 'item_id' = 'pk-label' and pg_temp.recipe('pkp1') -> 'lines' -> 0 -> 'qty' = '120'::jsonb);
  perform pg_temp.assert_ok(a, 'pk_save_recipe_snapshot_carries_packaging',
    pg_temp.snap('pkp1', 3) = '[{"name": "PK Flour", "qty": 120, "unit": "g"}, {"kind": "packaging", "name": "PK Ribbon", "qty": 1, "unit": "pcs"},
      {"kind": "packaging", "name": "PK Label", "qty": 0.25, "unit": "pcs"}]'::jsonb
    and pg_temp.snap('pkp1', 2) = '[{"name": "PK Flour", "qty": 100, "unit": "g"}, {"kind": "packaging", "name": "PK Ribbon", "qty": 1, "unit": "pcs"},
      {"kind": "packaging", "name": "PK Label", "qty": 0.25, "unit": "pcs"}]'::jsonb);
  j := pg_temp.recipe('pkp1');
  perform pg_temp.assert_ok(a, 'pk_history_lists_ingredients_only',
    j -> 'history' = '[{"version": 1, "yield": 10, "lines": [{"name": "PK Flour", "qty": 100, "unit": "g"}]},
                       {"version": 2, "yield": 10, "lines": [{"name": "PK Flour", "qty": 100, "unit": "g"}]}]'::jsonb);

  -- a bake of 10 takes the flour (120 g) and nothing else: the ribbon and the label stay on the shelf
  ribbon := pg_temp.on_hand('pk-ribbon');
  lbl := pg_temp.on_hand('pk-label');
  before_flour := pg_temp.on_hand('pk-flour');
  perform pg_temp.expect(a, 'pk_bake_adjusts_a_packaging_line_refused',
    format('select * from public.record_production(%L::jsonb)', pg_temp.bake(1, 'pkp1', 10, v, '{"adj": {"PK Ribbon": 1}}')::text), '22023');
  select * into r from public.record_production(pg_temp.bake(2, 'pkp1', 10, v));
  perform pg_temp.assert_ok(a, 'pk_bake_takes_only_ingredients',
    not r.duplicate and r.shortfall = '[]'::jsonb and pg_temp.on_hand('pk-flour') = before_flour - 120
    and pg_temp.on_hand('pk-ribbon') = ribbon and pg_temp.on_hand('pk-label') = lbl
    and pg_temp.moves_of('b3b20000-0000-4000-8000-000000000002'::uuid) = 1
    and pg_temp.moves('b3b20000-0000-4000-8000-000000000002'::uuid) -> 0 ->> 'item' = 'pk-flour');
  select * into r from public.record_production(pg_temp.bake(3, 'pkp1', 5, v, '{"kind": "dough", "target": null}'));
  perform pg_temp.assert_ok(a, 'pk_dough_takes_only_ingredients',
    pg_temp.on_hand('pk-flour') = before_flour - 180 and pg_temp.on_hand('pk-ribbon') = ribbon and pg_temp.on_hand('pk-label') = lbl
    and pg_temp.moves_of('b3b20000-0000-4000-8000-000000000003'::uuid) = 1);
end $$;

-- ================================================================ packing an order by its own boxes
create function pg_temp.phase_pack(a text) returns void language plpgsql security invoker as $$
declare r record;
begin
  -- ORDER A: 23 cookies (14 of pkp1, 9 of pkp2), boxes 2 x 6 and 1 x 12 = 24 cookies, capped at 23. Taken smallest size first: the two sixes
  -- hold 12, the twelve holds the other 11 (one box, not full), nothing is loose. In packing order:
  --   1 ribbon 14 (pkp1, 1 each)  2 label 3.5 (pkp1, a quarter each)  3 ribbon 18 (pkp2, 2 each)
  --   box 6:  4 box A 2 (a box each)  5 sticker 2          box 12: 6 box B 1  7 sticker 2 (2 a box)  8 wrap 5.5 (a half per cookie in the box, 11)
  --   order:  9 card 1  10 wrap 5.75 (a quarter per cookie, 23)
  select * into r from public.record_pack('PK-ORD-A', 5);
  perform pg_temp.assert_ok(a, 'pk_pack_two_sizes_capped_movements',
    not r.duplicate and r.shortfall = '[]'::jsonb and pg_temp.moves(pg_temp.pack_id('PK-ORD-A')) = '[
      {"seq": 1, "item": "pk-ribbon", "delta": -14, "reason": "Packed order PK-ORD-A"}, {"seq": 2, "item": "pk-label", "delta": -3.5, "reason": "Packed order PK-ORD-A"},
      {"seq": 3, "item": "pk-ribbon", "delta": -18, "reason": "Packed order PK-ORD-A"}, {"seq": 4, "item": "pk-boxa", "delta": -2, "reason": "Packed order PK-ORD-A"},
      {"seq": 5, "item": "pk-sticker", "delta": -2, "reason": "Packed order PK-ORD-A"}, {"seq": 6, "item": "pk-boxb", "delta": -1, "reason": "Packed order PK-ORD-A"},
      {"seq": 7, "item": "pk-sticker", "delta": -2, "reason": "Packed order PK-ORD-A"}, {"seq": 8, "item": "pk-wrap", "delta": -5.5, "reason": "Packed order PK-ORD-A"},
      {"seq": 9, "item": "pk-card", "delta": -1, "reason": "Packed order PK-ORD-A"}, {"seq": 10, "item": "pk-wrap", "delta": -5.75, "reason": "Packed order PK-ORD-A"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'pk_pack_two_sizes_stock',
    pg_temp.on_hand('pk-ribbon') = 168 and pg_temp.on_hand('pk-label') = 46.5 and pg_temp.on_hand('pk-boxa') = 48 and pg_temp.on_hand('pk-boxb') = 49
    and pg_temp.on_hand('pk-sticker') = 6 and pg_temp.on_hand('pk-wrap') = 88.75 and pg_temp.on_hand('pk-card') = 49 and pg_temp.on_hand('pk-pouch') = 50
    and pg_temp.rec_qty(pg_temp.pack_id('PK-ORD-A')) = 23);
  -- once per order: packing it again answers the first record and takes nothing more
  select * into r from public.record_pack('PK-ORD-A', 5);
  perform pg_temp.assert_ok(a, 'pk_pack_twice_takes_nothing_more',
    r.duplicate and r.shortfall = '[]'::jsonb and pg_temp.on_hand('pk-ribbon') = 168 and pg_temp.on_hand('pk-sticker') = 6 and pg_temp.records('pack') = 2);

  -- ORDER B: 11 cookies of pkp2, one box of 6: 6 in the box, 5 loose (a loose cookie is its own container).
  --   1 ribbon 22 (2 each)  box 6: 2 box A 1  3 sticker 1   loose: 4 pouch 5 (one per cookie)  5 sticker 5 (one per loose cookie)
  --   order: 6 card 1  7 wrap 2.75 (a quarter of 11)
  select * into r from public.record_pack('PK-ORD-B', 5);
  perform pg_temp.assert_ok(a, 'pk_pack_boxes_and_loose_movements',
    not r.duplicate and r.shortfall = '[]'::jsonb and pg_temp.moves(pg_temp.pack_id('PK-ORD-B')) = '[
      {"seq": 1, "item": "pk-ribbon", "delta": -22, "reason": "Packed order PK-ORD-B"}, {"seq": 2, "item": "pk-boxa", "delta": -1, "reason": "Packed order PK-ORD-B"},
      {"seq": 3, "item": "pk-sticker", "delta": -1, "reason": "Packed order PK-ORD-B"}, {"seq": 4, "item": "pk-pouch", "delta": -5, "reason": "Packed order PK-ORD-B"},
      {"seq": 5, "item": "pk-sticker", "delta": -5, "reason": "Packed order PK-ORD-B"}, {"seq": 6, "item": "pk-card", "delta": -1, "reason": "Packed order PK-ORD-B"},
      {"seq": 7, "item": "pk-wrap", "delta": -2.75, "reason": "Packed order PK-ORD-B"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'pk_pack_boxes_and_loose_stock',
    pg_temp.on_hand('pk-ribbon') = 146 and pg_temp.on_hand('pk-boxa') = 47 and pg_temp.on_hand('pk-sticker') = 0 and pg_temp.on_hand('pk-pouch') = 45
    and pg_temp.on_hand('pk-card') = 48 and pg_temp.on_hand('pk-wrap') = 86);

  -- ORDER C: 8 cookies of pkp2 in one box of 8, a size with no rule. The box is a shortfall (no rule), the rest of the order still packs.
  --   1 ribbon 16   (box 8: nothing)   2 card 1  3 wrap 2
  select * into r from public.record_pack('PK-ORD-C', 5);
  perform pg_temp.assert_ok(a, 'pk_pack_size_without_rule_is_a_shortfall',
    r.shortfall = '[{"name": "box 8", "by": 1, "unit": "pcs", "why": "no packaging rule"}]'::jsonb
    and pg_temp.moves(pg_temp.pack_id('PK-ORD-C')) = '[
      {"seq": 1, "item": "pk-ribbon", "delta": -16, "reason": "Packed order PK-ORD-C"}, {"seq": 2, "item": "pk-card", "delta": -1, "reason": "Packed order PK-ORD-C"},
      {"seq": 3, "item": "pk-wrap", "delta": -2, "reason": "Packed order PK-ORD-C"}]'::jsonb);

  -- ORDER D: 3 loose cookies of pkp2 with no sticker left: what is there is taken, the rest is the shortfall, and no empty movement is written.
  --   1 ribbon 6   loose: 2 pouch 3  3 sticker 3 (none on hand: no movement)   order: 4 card 1  5 wrap 0.75
  select * into r from public.record_pack('PK-ORD-D', 5);
  perform pg_temp.assert_ok(a, 'pk_pack_short_stock_is_a_shortfall',
    r.shortfall = '[{"name": "PK Sticker", "by": 3, "unit": "pcs"}]'::jsonb and pg_temp.moves(pg_temp.pack_id('PK-ORD-D')) = '[
      {"seq": 1, "item": "pk-ribbon", "delta": -6, "reason": "Packed order PK-ORD-D"}, {"seq": 2, "item": "pk-pouch", "delta": -3, "reason": "Packed order PK-ORD-D"},
      {"seq": 4, "item": "pk-card", "delta": -1, "reason": "Packed order PK-ORD-D"}, {"seq": 5, "item": "pk-wrap", "delta": -0.75, "reason": "Packed order PK-ORD-D"}]'::jsonb
    and pg_temp.on_hand('pk-sticker') = 0 and pg_temp.on_hand('pk-ribbon') = 124 and pg_temp.on_hand('pk-pouch') = 42 and pg_temp.on_hand('pk-card') = 46);
  perform pg_temp.assert_ok(a, 'pk_pack_records_count', pg_temp.records('pack') = 5);
  -- what the screens read: the records list carries the new entries (name, by and unit are what the app needs)
  perform pg_temp.assert_ok(a, 'pk_get_production_lists_the_shortfalls',
    (select count(*) from jsonb_array_elements(public.get_production(5) -> 'shortfalls') s, jsonb_array_elements(s -> 'short') e
      where e ->> 'why' = 'no packaging rule' and jsonb_typeof(e -> 'name') = 'string' and jsonb_typeof(e -> 'by') = 'number'
        and jsonb_typeof(e -> 'unit') = 'string') = 3);
end $$;

-- ================================================================ a bazaar sale
create function pg_temp.phase_sales(a text) returns void language plpgsql security invoker as $$
begin
  -- 3 of pkp1 and 2 of pkp2 (5 cookies): each flavour's packaging first, in flavour order, then the bazaar rules.
  --   1 ribbon 3  2 label 0.75 (pkp1)  3 ribbon 4 (pkp2)  then the bazaar rules: 4 pouch 5 (one a cookie)  5 bag 1 (one a customer)
  perform pg_temp.sell(a, 'pk_sale_with_rules', 'devK:S1:1', '{"pkp1": 3, "pkp2": 2}');
  perform pg_temp.assert_ok(a, 'pk_sale_flavour_lines_then_rules',
    pg_temp.sale_short('devK:S1:1') = '[]'::jsonb and pg_temp.moves(pg_temp.sale_id('devK:S1:1')) = '[
      {"seq": 1, "item": "pk-ribbon", "delta": -3, "reason": "Bazaar sale"}, {"seq": 2, "item": "pk-label", "delta": -0.75, "reason": "Bazaar sale"},
      {"seq": 3, "item": "pk-ribbon", "delta": -4, "reason": "Bazaar sale"}, {"seq": 4, "item": "pk-pouch", "delta": -5, "reason": "Bazaar sale"},
      {"seq": 5, "item": "pk-bag", "delta": -1, "reason": "Bazaar sale"}]'::jsonb and pg_temp.sale_qty('devK:S1:1') = 5);
  perform pg_temp.assert_ok(a, 'pk_sale_stock', pg_temp.on_hand('pk-ribbon') = 117 and pg_temp.on_hand('pk-label') = 45.75
    and pg_temp.on_hand('pk-pouch') = 37 and pg_temp.on_hand('pk-bag') = 49);
  perform pg_temp.sell(a, 'pk_sale_replayed', 'devK:S1:1', '{"pkp1": 3, "pkp2": 2}');
  perform pg_temp.assert_ok(a, 'pk_sale_replay_takes_nothing_more', pg_temp.on_hand('pk-ribbon') = 117 and pg_temp.on_hand('pk-pouch') = 37
    and pg_temp.records('sale') = 2);
end $$;

-- ================================================================ a rule set with no bazaar rule, and the books
create function pg_temp.phase_late(a text) returns void language plpgsql security invoker as $$
declare r record;
begin
  -- Only a loose rule is left: a bazaar sale has no rule of its own. A flavour that carries packaging still takes it (and that is
  -- no "no rule" shortfall); a flavour with none is the shortfall.
  select * into r from public.save_packaging_rules(jsonb_build_array(pg_temp.rule('loose', null, 'pk-pouch', 1, 'cookie')),
                                                    (select (public.get_packaging_rules() ->> 'updated_at')::timestamptz));
  perform pg_temp.assert_ok(a, 'pk_rules_replaced_again', pg_temp.rules_n() = 1 and pg_temp.audit_n('packaging.rules') = 4);
  perform pg_temp.sell(a, 'pk_sale_flavour_only', 'devK:S2:1', '{"pkp2": 1}');
  perform pg_temp.assert_ok(a, 'pk_sale_flavour_lines_without_a_bazaar_rule',
    pg_temp.sale_short('devK:S2:1') = '[]'::jsonb and pg_temp.moves(pg_temp.sale_id('devK:S2:1')) = '[
      {"seq": 1, "item": "pk-ribbon", "delta": -2, "reason": "Bazaar sale"}]'::jsonb);
  perform pg_temp.sell(a, 'pk_sale_nothing_at_all', 'devK:S3:1', '{"pkp6": 2}');
  perform pg_temp.assert_ok(a, 'pk_sale_no_rule_and_no_lines_is_a_shortfall',
    pg_temp.sale_short('devK:S3:1') = '[{"name": "packaging rule", "by": 2, "unit": "pcs", "why": "no packaging rule"}]'::jsonb
    and pg_temp.moves_of(pg_temp.sale_id('devK:S3:1')) = 0 and pg_temp.sale_qty('devK:S3:1') = 2);
end $$;

grant execute on function
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.on_hand(text), pg_temp.rules_n(), pg_temp.rules_stamp(), pg_temp.audit_n(text), pg_temp.cur_version(text), pg_temp.snap(text, integer),
  pg_temp.n_lines(text, text), pg_temp.n_versions(text), pg_temp.records(text), pg_temp.moves_of(uuid), pg_temp.moves(uuid), pg_temp.pack_id(text), pg_temp.rec_qty(uuid), pg_temp.basis_default(),
  pg_temp.sale_id(text), pg_temp.sale_short(text), pg_temp.sale_qty(text), pg_temp.rstamp(text), pg_temp.recipe(text), pg_temp.rc(text),
  pg_temp.rules_proj(), pg_temp.today_txt(integer), pg_temp.rule(text, integer, text, numeric, text),
  pg_temp.sp(text, text, jsonb, timestamptz, text), pg_temp.line(text, numeric), pg_temp.pbody(text, jsonb),
  pg_temp.sr(text, text, jsonb, timestamptz, text), pg_temp.price(text, text, integer, text, numeric, numeric),
  pg_temp.sale(text, jsonb), pg_temp.sell(text, text, text, jsonb), pg_temp.bake(integer, text, numeric, integer, jsonb),
  pg_temp.assert_acl(), pg_temp.assert_table(text), pg_temp.assert_refused(text), pg_temp.phase_pre(text), pg_temp.phase_rules(text),
  pg_temp.phase_recipes_a(text), pg_temp.phase_costs(text), pg_temp.phase_recipes_b(text), pg_temp.phase_pack(text),
  pg_temp.phase_sales(text), pg_temp.phase_late(text)
  to anon, authenticated, service_role;

-- ================================================================ the run

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_acl();
select pg_temp.assert_table('anon');
select pg_temp.assert_refused('anon');
reset role;

set local role authenticated;
select pg_temp.set_subject(2);
select pg_temp.assert_table('active_helper');
select pg_temp.assert_refused('active_helper');
select pg_temp.set_subject(3);
select pg_temp.assert_table('active_support');
select pg_temp.assert_refused('active_support');
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_refused('inactive_owner');
select pg_temp.set_subject(1);
select pg_temp.assert_table('active_owner');
select pg_temp.phase_pre('active_owner');
select pg_temp.phase_rules('active_owner');
select pg_temp.phase_recipes_a('active_owner');
select pg_temp.phase_costs('active_owner');
select pg_temp.phase_recipes_b('active_owner');
select pg_temp.phase_pack('active_owner');
select pg_temp.phase_sales('active_owner');
select pg_temp.phase_late('active_owner');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
