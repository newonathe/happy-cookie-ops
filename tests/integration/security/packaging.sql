-- B3b-1 packaging as records, with real SQL roles; all data rolls back.
--
-- save_packaging_rule / get_packaging_rules: the active owner only (a helper, support, an inactive owner and anon are all refused;
-- anon does not hold EXECUTE). write_packaging_rule and apply_packaging_rule have no API grant at all: the operator runs apply as
-- postgres, with item NAMES as data in the call. The rules table has no API grant. A rule is replaced whole, one container (a box
-- size, loose cookies, an order, a bazaar sale) at a time. Packing an order and a bazaar sale read the rules and each flavour's
-- recipe packaging lines; a container with no rule takes nothing and is a flagged shortfall (why: no packaging rule), never a silent
-- zero. A bake skips packaging lines. get_recipe_costs adds packaging per cookie. The harness neutralises each `-- rule:` line of
-- supabase/migrations/20260101005900_packaging_rules.sql in turn (scripts/test-db-security.py, PACKAGING_MUTATIONS) and requires the
-- named case here to fail. Outcome messages carry no quote character: the harness redacts quoted literals.
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
insert into public.products(id, name, short_name, price_cents, kind) values
  ('pkp1', 'PK cookie one', 'PK-1', 10000, 'cookie'),
  ('pkp2', 'PK cookie two', 'PK-2', 10000, 'cookie'),
  ('pkp3', 'PK cookie three', 'PK-3', 10000, 'cookie'),
  ('pkp4', 'PK cookie four', 'PK-4', 10000, 'cookie'),
  ('pkp5', 'PK cookie five', 'PK-5', 10000, 'cookie'),
  ('pkp6', 'PK cookie six', 'PK-6', 10000, 'cookie'),
  ('pkp7', 'PK cookie seven', 'PK-7', 10000, 'cookie');
-- Made-up names on purpose: the rules are data, so nothing here depends on what her packaging is called.
insert into public.inventory_items(id, name, unit, category, active, on_hand) values
  ('pki-flour', 'PK Flour', 'g', 'Ingredients', true, 5000),
  ('pki-sugar', 'PK Sugar', 'g', 'Ingredients', true, 5000),
  ('pki-box', 'PK Box six', 'pcs', 'Packaging', true, 10),
  ('pki-pouch', 'PK Pouch', 'pcs', 'Packaging', true, 10),
  ('pki-sticker', 'PK Sticker', 'pcs', 'Packaging', true, 2),
  ('pki-card', 'PK Card', 'pcs', 'Packaging', true, 10),
  ('pki-bag', 'PK Bag', 'pcs', 'Packaging', true, 10),
  ('pki-wrap', 'PK Wrap', 'pcs', 'Packaging', true, 20),
  ('pki-label', 'PK Label', 'pcs', 'Packaging', true, 100),
  ('pki-tag', 'PK Tag', 'pcs', 'Packaging', true, 100),
  ('pki-twin1', 'PK Twin', 'pcs', 'Packaging', true, 1),
  ('pki-twin2', 'pk twin', 'pcs', 'Packaging', true, 1),
  ('pki-off', 'PK Off', 'pcs', 'Packaging', false, 50);
-- Eleven more so there are 21 distinct, real items that no recipe takes as an ingredient, for the line-count case (a duplicate, a missing
-- item or an ingredient would be refused for that reason and mask it).
insert into public.inventory_items(id, name, unit, category, active, on_hand)
select 'pki-fill' || i, 'PK Fill ' || i, 'pcs', 'Packaging', true, 30 from generate_series(1, 11) i;
-- What things cost, so the worked recipes below have a known answer: flour 1 c/g, sugar 0.5 c/g, wrap 2.5 c, label 1.2 c. The tag has
-- no price at all.
insert into public.item_prices(id, item_id, price_cents, pack_size, as_of, payload_hash) values
  (gen_random_uuid(), 'pki-flour', 1000, 1000, current_date, repeat('a', 64)),
  (gen_random_uuid(), 'pki-sugar', 500, 1000, current_date, repeat('a', 64)),
  (gen_random_uuid(), 'pki-wrap', 250, 100, current_date, repeat('a', 64)),
  (gen_random_uuid(), 'pki-label', 120, 100, current_date, repeat('a', 64));
insert into public.recipes(product_id, yield_count) values ('pkp1', 12), ('pkp2', 4), ('pkp3', 6), ('pkp5', 2), ('pkp6', 3);
insert into public.recipe_ingredients(product_id, item_name, qty, unit, position, kind) values
  ('pkp1', 'PK Flour', 300, 'g', 0, 'ingredient'), ('pkp1', 'PK Sugar', 120, 'g', 1, 'ingredient'),
  ('pkp1', 'PK Wrap', 1, 'pcs', 2, 'packaging'), ('pkp1', 'PK Label', 1, 'pcs', 3, 'packaging'),
  ('pkp2', 'PK Flour', 100, 'g', 0, 'ingredient'), ('pkp2', 'PK Tag', 1, 'pcs', 1, 'packaging'),
  ('pkp3', 'PK Flour', 60, 'g', 0, 'ingredient'),
  ('pkp5', 'PK Flour', 10, 'g', 0, 'ingredient'), ('pkp5', 'PK Ghost', 1, 'pcs', 1, 'packaging'),
  ('pkp6', 'PK Tag', 5, 'pcs', 0, 'ingredient'), ('pkp6', 'PK Wrap', 1, 'pcs', 1, 'packaging');
select public.apply_identity_links(public.preview_identity_links() -> 'counts');
-- 20 cookies: a box of 6, a box of 12 (no rule is entered for it) and 2 loose ones. Twelve are flavour one (it has a packaging line).
insert into public.orders(id, customer_name, phone) values
  ('PK-ORD-1', 'Pack Me', '09170000011'), ('PK-ORD-2', 'All Loose', '09170000012');
insert into public.order_items(order_id, product_id, qty, unit_price_cents) values
  ('PK-ORD-1', 'pkp1', 12, 10000), ('PK-ORD-1', 'pkp3', 8, 10000), ('PK-ORD-2', 'pkp3', 3, 10000);
insert into public.order_boxes(order_id, size, qty, charge_cents) values ('PK-ORD-1', 6, 1, 0), ('PK-ORD-1', 12, 1, 0);
-- A box of 12 on its own, packed after its rule is entered; and an order of 3 loose cookies, packed with no loose or order rule.
insert into public.orders(id, customer_name, phone) values ('PK-ORD-3', 'Twelve', '09170000013');
insert into public.order_items(order_id, product_id, qty, unit_price_cents) values ('PK-ORD-3', 'pkp3', 12, 10000);
insert into public.order_boxes(order_id, size, qty, charge_cents) values ('PK-ORD-3', 12, 1, 0);
insert into public.orders(id, customer_name, phone) values ('PK-ORD-4', 'No Rules', '09170000014');
insert into public.order_items(order_id, product_id, qty, unit_price_cents) values ('PK-ORD-4', 'pkp3', 2, 10000), ('PK-ORD-4', 'pkp5', 1, 10000);
insert into public.events(id, name, starts_at, selling_device, price_snapshot)
values ('b3be0000-0000-4000-8000-000000000001', 'PK stall', now() - interval '1 hour', 'devK', '{"pkp1": 10000}');

-- B4a: these cases read the books on the used basis, which a fresh database no longer starts on: it needs the cost cutover (cutover.sql's).
-- The cutover here is long before any row, set as postgres, so every row below is on the used rules.
update public.books_settings set used_from = timestamptz '2020-01-01 00:00+00', cost_basis = 'used' where id;

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

create function pg_temp.on_hand(item text) returns numeric language sql stable security definer as $$
  select on_hand from public.inventory_items where id = item $$;
create function pg_temp.records(k text) returns bigint language sql stable security definer as $$
  select count(*) from public.production_records where kind = k $$;
create function pg_temp.pack_moves(ord text) returns bigint language sql stable security definer as $$
  select count(*) from public.stock_movements where production_id = md5('pack:' || ord)::uuid $$;
create function pg_temp.sale_id(client text) returns uuid language sql stable security definer as $$
  select id from public.event_sales where client_id = client $$;
create function pg_temp.sale_moves(client text) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('item', m.item_id, 'delta', m.qty_delta::text) order by m.item_id), '[]'::jsonb)
    from public.stock_movements m where m.production_id = pg_temp.sale_id(client) $$;
-- The row id of a use is md5(sale id || ':' || seq || ':' || item): seq 1 is the first line of the rule, so the ids are the ones the
-- bazaar has always written.
create function pg_temp.seq_ok(p_client text, p_item text, p_seq integer) returns boolean language sql stable security definer as $$
  select exists (select 1 from public.stock_movements m
                  where m.production_id = pg_temp.sale_id(p_client) and m.item_id = p_item
                    and m.id = md5(m.production_id::text || ':' || p_seq::text || ':' || p_item)::uuid) $$;
create function pg_temp.sale_short(client text) returns jsonb language sql stable security definer as $$
  select r.short from public.production_records r where r.id = pg_temp.sale_id(client) and r.kind = 'sale' $$;
create function pg_temp.rule_lines(c text, s integer) returns jsonb language sql stable security definer as $$
  select coalesce(jsonb_agg(jsonb_build_object('item', r.item_id, 'qty', r.qty::text, 'per', r.per, 'pos', r.position) order by r.position), '[]'::jsonb)
    from public.packaging_rules r where r.container = c and r.box_size is not distinct from s $$;
create function pg_temp.rule_count() returns bigint language sql stable security definer as $$
  select count(*) from public.packaging_rules $$;
create function pg_temp.audit_rows() returns bigint language sql stable security definer as $$
  select count(*) from public.audit_log where action = 'packaging.rule_saved' $$;
create function pg_temp.recipe_line_kinds(pid text) returns text language sql stable security definer as $$
  select string_agg(i.item_name || ':' || i.kind, ',' order by i.position) from public.recipe_ingredients i where i.product_id = pid $$;
create function pg_temp.cost(pid text) returns jsonb language sql stable security definer as $$
  select x from jsonb_array_elements(public.get_recipe_costs()) x where x ->> 'product_id' = pid $$;
-- B3b-2: what the books list as uncosted for a production line that could not be taken, read as the owner (get_books is the owner's).
create function pg_temp.pack_id(ord text) returns uuid language sql immutable as $$
  select md5('pack:' || ord)::uuid $$;
create function pg_temp.rec_ms(rid uuid) returns bigint language sql stable security definer as $$
  select (extract(epoch from r.at) * 1000)::bigint from public.production_records r where r.id = rid $$;
create function pg_temp.unc_row(uid text, p_from timestamptz, p_to timestamptz) returns jsonb language sql stable as $$
  select u from jsonb_array_elements(public.get_books(p_from, p_to) -> 'uncosted') u where u ->> 'id' = uid $$;
create function pg_temp.unc_made(p_from timestamptz, p_to timestamptz) returns bigint language sql stable as $$
  select count(*) from jsonb_array_elements(public.get_books(p_from, p_to) -> 'uncosted') u where u ->> 'id' like 'p:%' $$;

-- A rule payload: the container, its box size (null unless a box) and its lines. A line is [item, qty, per].
create function pg_temp.rule(c text, s integer, variadic ls jsonb[] default '{}') returns jsonb language sql stable as $$
  select jsonb_build_object('container', c, 'box_size', s, 'lines', to_jsonb(ls)) $$;
create function pg_temp.ln(item text, qty numeric, per text) returns jsonb language sql immutable as $$
  select jsonb_build_object('item_id', item, 'qty', qty, 'per', per) $$;
create function pg_temp.byname(item text, qty numeric, per text) returns jsonb language sql immutable as $$
  select jsonb_build_object('name', item, 'qty', qty, 'per', per) $$;
create function pg_temp.sv(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.save_packaging_rule(%L::jsonb)', body::text), wanted);
end $$;
create function pg_temp.ap(actor text, op text, body jsonb, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.apply_packaging_rule(%L::jsonb)', body::text), wanted);
end $$;
create function pg_temp.rc(actor text, op text, body jsonb, stamp timestamptz, wanted text) returns void
language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, op, format('select * from public.save_recipe(%L::jsonb, %L::timestamptz)', body::text, stamp), wanted);
end $$;

create function pg_temp.sale(client text, cookies integer) returns jsonb
language sql stable security invoker as $$
  select jsonb_build_object('clientId', client, 'deviceId', 'devK', 'eventId', 'b3be0000-0000-4000-8000-000000000001',
    'items', jsonb_build_object('pkp1', cookies), 'discountCents', 0, 'totalCents', cookies * 10000, 'pay', 'Cash',
    'ref', '', 'clerk', 'Owner', 'at', (extract(epoch from now()) * 1000)::bigint, 'tenderedCents', cookies * 10000, 'changeCents', 0)
$$;
create function pg_temp.pid(n integer) returns text language sql immutable as $$
  select 'b3ba0000-0000-4000-8000-' || lpad(n::text, 12, '0') $$;
create function pg_temp.pr(n integer, kind text, product text, qty numeric, over jsonb default '{}'::jsonb) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', pg_temp.pid(n), 'kind', kind, 'product_id', product, 'qty', qty,
    'target', case when kind = 'batch' then qty else null end, 'rejects', 0, 'adj', '{}'::jsonb, 'recipe_version', 1,
    'drop_no', 5, 'at', (extract(epoch from now()) * 1000)::bigint) || over $$;

create function pg_temp.assert_acl() returns void language plpgsql security invoker as $$
declare f text;
begin
  foreach f in array array['get_packaging_rules()', 'save_packaging_rule(jsonb)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden packaging call succeeded: anon / %', split_part(f, '(', 1);
    end if;
  end loop;
  foreach f in array array['write_packaging_rule(jsonb)', 'apply_packaging_rule(jsonb)'] loop
    if has_function_privilege('anon', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden packaging call succeeded: anon / %', split_part(f, '(', 1);
    end if;
    if has_function_privilege('authenticated', 'public.' || f, 'EXECUTE') or has_function_privilege('service_role', 'public.' || f, 'EXECUTE') then
      raise exception 'forbidden packaging call succeeded: an API role / %', split_part(f, '(', 1);
    end if;
  end loop;
  insert into pg_temp.authority_results values ('acl', 'anon', 'packaging_rpcs_owner_only');
end $$;

create function pg_temp.assert_table(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'rules_select', 'select * from public.packaging_rules', '42501');
  perform pg_temp.expect(actor, 'rules_insert',
    'insert into public.packaging_rules(container, item_id, qty, per, position) values (''order'', ''pki-card'', 1, ''container'', 1)', '42501');
  perform pg_temp.expect(actor, 'rules_update', 'update public.packaging_rules set qty = 1', '42501');
  perform pg_temp.expect(actor, 'rules_delete', 'delete from public.packaging_rules', '42501');
end $$;

create function pg_temp.assert_refused(actor text) returns void language plpgsql security invoker as $$
begin
  perform pg_temp.expect(actor, 'save_packaging_rule', 'select * from public.save_packaging_rule(''{}''::jsonb)', '42501');
  perform pg_temp.expect(actor, 'get_packaging_rules', 'select public.get_packaging_rules()', '42501');
end $$;

-- The operator's step, run as postgres before any API role is set: items are named as data, never by id.
create function pg_temp.phase_operator(a text) returns void language plpgsql security invoker as $$
declare m text;
begin
  perform pg_temp.assert_ok(a, 'no_rules_to_begin_with', pg_temp.rule_count() = 0);
  perform pg_temp.ap(a, 'apply_name_none', pg_temp.rule('order', null, pg_temp.byname('PK Nothing', 1, 'container')), '22023');
  perform pg_temp.ap(a, 'apply_name_several', pg_temp.rule('order', null, pg_temp.byname('pk twin', 1, 'container')), '22023');
  begin
    perform public.apply_packaging_rule(pg_temp.rule('order', null, pg_temp.byname('PK Card', 1, 'container'), pg_temp.byname('PK Nothing', 1, 'container'),
                                                       pg_temp.byname('PK Twin', 1, 'container')));
  exception when others then
    m := sqlerrm;
  end;
  perform pg_temp.assert_ok(a, 'apply_refusal_lists_the_names', m like '%PK Nothing%' and m like '%PK Twin%' and m not like '%PK Card%');
  perform pg_temp.ap(a, 'apply_keys_extra', jsonb_build_object('container', 'order', 'box_size', null, 'lines',
    jsonb_build_array(jsonb_build_object('name', 'PK Card', 'qty', 1, 'per', 'container', 'item_id', 'pki-card'))), '22023');
  perform pg_temp.ap(a, 'apply_container_twice', jsonb_build_array(pg_temp.rule('order', null, pg_temp.byname('PK Card', 1, 'container')),
    pg_temp.rule('order', null, pg_temp.byname('PK Card', 2, 'container'))), '22023');
  perform pg_temp.ap(a, 'apply_list_is_all_or_nothing', jsonb_build_array(pg_temp.rule('box', 8, pg_temp.byname('PK Box six', 1, 'container')),
    pg_temp.rule('order', null, pg_temp.byname('PK Nothing', 1, 'container'))), '22023');
  perform pg_temp.ap(a, 'apply_empty_list', '[]'::jsonb, '22023');
  perform pg_temp.ap(a, 'apply_keys_missing', jsonb_build_object('container', 'order', 'lines', '[]'::jsonb), '22023');
  perform pg_temp.ap(a, 'apply_validates_like_save', pg_temp.rule('order', null, pg_temp.byname('PK Card', 0, 'container')), '22023');
  -- B4a: flour is an ingredient of a recipe (a bake takes it), so a rule may not take it either, by name as by id
  perform pg_temp.ap(a, 'packrule_ingredient_refused_apply', pg_temp.rule('order', null, pg_temp.byname('PK Flour', 1, 'container')), '22023');
  perform pg_temp.assert_ok(a, 'apply_refusals_changed_nothing', pg_temp.rule_count() = 0 and pg_temp.audit_rows() = 0);
  -- the names are found ignoring case and surrounding spaces; the rules are written by id, all three containers in one call
  perform pg_temp.ap(a, 'apply_three_containers_at_once', jsonb_build_array(
    pg_temp.rule('order', null, pg_temp.byname('  pk card ', 1, 'container')),
    pg_temp.rule('box', 6, pg_temp.byname('PK Box six', 1, 'container'), pg_temp.byname('PK Sticker', 1, 'container')),
    pg_temp.rule('loose', null, pg_temp.byname('PK Pouch', 1, 'cookie'), pg_temp.byname('PK Sticker', 1, 'cookie'))), '00000');
  perform pg_temp.assert_ok(a, 'apply_resolves_names_to_ids', pg_temp.rule_lines('order', null) = '[{"item": "pki-card", "qty": "1.000", "per": "container", "pos": 1}]'::jsonb
    and pg_temp.rule_lines('box', 6) = '[{"item": "pki-box", "qty": "1.000", "per": "container", "pos": 1}, {"item": "pki-sticker", "qty": "1.000", "per": "container", "pos": 2}]'::jsonb);
  perform pg_temp.assert_ok(a, 'apply_audit_rows', pg_temp.audit_rows() = 3 and pg_temp.rule_count() = 5);
  -- applying again replaces the container's lines
  perform pg_temp.ap(a, 'apply_replaces', pg_temp.rule('order', null, pg_temp.byname('PK Card', 2, 'container')), '00000');
  perform pg_temp.assert_ok(a, 'apply_replaced_the_lines', pg_temp.rule_lines('order', null) = '[{"item": "pki-card", "qty": "2.000", "per": "container", "pos": 1}]'::jsonb);
  perform pg_temp.ap(a, 'apply_back_to_one_card', pg_temp.rule('order', null, pg_temp.byname('PK Card', 1, 'container')), '00000');
end $$;

create function pg_temp.phase_owner(a text) returns void language plpgsql security invoker as $$
declare r record; j jsonb; k timestamptz;
begin
  -- ---- the owner's read
  j := public.get_packaging_rules();
  perform pg_temp.assert_ok(a, 'get_rules_by_container',
    jsonb_array_length(j) = 3 and j -> 0 ->> 'container' = 'box' and (j -> 0 ->> 'box_size')::int = 6
    and j -> 1 ->> 'container' = 'loose' and j -> 1 -> 'box_size' = 'null'::jsonb and j -> 2 ->> 'container' = 'order'
    and j -> 0 -> 'lines' -> 1 ->> 'name' = 'PK Sticker' and j -> 0 -> 'lines' -> 1 ->> 'unit' = 'pcs'
    and (j -> 1 -> 'lines' -> 0 ->> 'qty')::numeric = 1 and j -> 1 -> 'lines' -> 0 ->> 'per' = 'cookie');

  -- ---- each refusal of a rule (every one changes nothing)
  perform pg_temp.sv(a, 'rule_not_object', '[]'::jsonb, '22023');
  perform pg_temp.sv(a, 'rule_keys_missing', jsonb_build_object('container', 'order', 'box_size', null), '22023');
  perform pg_temp.sv(a, 'rule_keys_extra', pg_temp.rule('order', null) || '{"note": 1}', '22023');
  perform pg_temp.sv(a, 'rule_line_keys_extra', pg_temp.rule('order', null, pg_temp.ln('pki-card', 1, 'container') || '{"x": 1}'), '22023');
  perform pg_temp.sv(a, 'rule_line_keys_missing', pg_temp.rule('order', null, '{"item_id": "pki-card", "qty": 1}'), '22023');
  perform pg_temp.sv(a, 'rule_type_qty', pg_temp.rule('order', null, '{"item_id": "pki-card", "qty": "1", "per": "container"}'), '22023');
  perform pg_temp.sv(a, 'rule_container_bad', pg_temp.rule('pallet', null, pg_temp.ln('pki-card', 1, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_box_size_missing', pg_temp.rule('box', null, pg_temp.ln('pki-box', 1, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_box_size_small', pg_temp.rule('box', 1, pg_temp.ln('pki-box', 1, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_box_size_large', pg_temp.rule('box', 49, pg_temp.ln('pki-box', 1, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_box_size_fraction', pg_temp.rule('box', null, pg_temp.ln('pki-box', 1, 'container')) || '{"box_size": 6.5}', '22023');
  perform pg_temp.sv(a, 'rule_box_size_on_order', pg_temp.rule('order', 6, pg_temp.ln('pki-card', 1, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_lines_max',
    pg_temp.rule('order', null, variadic (select array_agg(pg_temp.ln(x.id, 1, 'container') order by x.id)
                                            from (select id from public.inventory_items
                                                   where id like 'pki-%' and id not in (select item_id from public.recipe_ingredients where kind = 'ingredient' and item_id is not null)
                                                   order by id limit 21) x)), '22023');
  perform pg_temp.sv(a, 'rule_item_missing', pg_temp.rule('order', null, pg_temp.ln('pki-ghost', 1, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_qty_zero', pg_temp.rule('order', null, pg_temp.ln('pki-card', 0, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_qty_negative', pg_temp.rule('order', null, pg_temp.ln('pki-card', -1, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_qty_decimals', pg_temp.rule('order', null, pg_temp.ln('pki-card', 0.0005, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_qty_huge', pg_temp.rule('order', null, pg_temp.ln('pki-card', 10000, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_per_bad', pg_temp.rule('order', null, pg_temp.ln('pki-card', 1, 'each')), '22023');
  perform pg_temp.sv(a, 'rule_item_twice', pg_temp.rule('order', null, pg_temp.ln('pki-card', 1, 'container'), pg_temp.ln('pki-card', 2, 'container')), '22023');
  -- the double-take guard, rule side: wrap is a recipe packaging line, so it may not also be taken per cookie by a container, and a
  -- loose cookie counts as one cookie
  perform pg_temp.sv(a, 'rule_double_take_cookie', pg_temp.rule('order', null, pg_temp.ln('pki-wrap', 1, 'cookie')), '22023');
  perform pg_temp.sv(a, 'rule_double_take_box_cookie', pg_temp.rule('box', 8, pg_temp.ln('pki-label', 1, 'cookie')), '22023');
  perform pg_temp.sv(a, 'rule_double_take_loose', pg_temp.rule('loose', null, pg_temp.ln('pki-wrap', 1, 'container')), '22023');
  -- the same guard between containers: the pouch is taken per cookie by the loose rule, so the order may not take it per cookie too
  perform pg_temp.sv(a, 'rule_double_take_order_vs_loose', pg_temp.rule('order', null, pg_temp.ln('pki-pouch', 1, 'cookie')), '22023');
  -- B4a (the B4a-1 review): the double-take guard against an INGREDIENT. A bake takes an ingredient of a recipe, so no rule may take that
  -- item too (a pack would take it again): per container or per cookie, in any container. The tag is a packaging line of one recipe
  -- and an ingredient of another: still refused. The wrap and the label, which are packaging lines only, are not ingredients.
  perform pg_temp.sv(a, 'packrule_ingredient_refused', pg_temp.rule('order', null, pg_temp.ln('pki-flour', 1, 'container')), '22023');
  perform pg_temp.sv(a, 'packrule_ingredient_refused_per_cookie', pg_temp.rule('box', 8, pg_temp.ln('pki-sugar', 1, 'cookie')), '22023');
  perform pg_temp.sv(a, 'packrule_ingredient_refused_loose', pg_temp.rule('loose', null, pg_temp.ln('pki-flour', 1, 'cookie')), '22023');
  perform pg_temp.sv(a, 'packrule_ingredient_refused_also_a_packaging_line', pg_temp.rule('order', null, pg_temp.ln('pki-card', 1, 'container'), pg_temp.ln('pki-tag', 1, 'container')), '22023');
  perform pg_temp.assert_ok(a, 'rule_refusals_changed_nothing',
    pg_temp.rule_count() = 5 and pg_temp.audit_rows() = 5 and pg_temp.on_hand('pki-card') = 10);

  -- ---- a rule per container, per container or per cookie, replaced whole, and an empty one clears it
  perform pg_temp.sv(a, 'rule_box_eight_ok', pg_temp.rule('box', 8, pg_temp.ln('pki-box', 1, 'container'), pg_temp.ln('pki-wrap', 1, 'container')) || '{"box_size": 8.0}', '00000');
  perform pg_temp.assert_ok(a, 'rule_box_eight_saved', pg_temp.rule_lines('box', 8) =
    '[{"item": "pki-box", "qty": "1.000", "per": "container", "pos": 1}, {"item": "pki-wrap", "qty": "1.000", "per": "container", "pos": 2}]'::jsonb
    and pg_temp.rule_lines('box', 6) <> '[]'::jsonb);
  perform pg_temp.sv(a, 'rule_box_eight_replaced', pg_temp.rule('box', 8, pg_temp.ln('pki-label', 0.5, 'container')), '00000');
  perform pg_temp.assert_ok(a, 'rule_box_eight_was_replaced', pg_temp.rule_lines('box', 8) = '[{"item": "pki-label", "qty": "0.500", "per": "container", "pos": 1}]'::jsonb);
  perform pg_temp.sv(a, 'rule_box_eight_cleared', pg_temp.rule('box', 8), '00000');
  perform pg_temp.assert_ok(a, 'rule_box_eight_gone', pg_temp.rule_lines('box', 8) = '[]'::jsonb and pg_temp.audit_rows() = 8);
  perform pg_temp.assert_ok(a, 'rule_saves_moved_no_stock', pg_temp.on_hand('pki-box') = 10 and pg_temp.on_hand('pki-wrap') = 20 and pg_temp.on_hand('pki-label') = 100);

  -- ---- packing an order: 6 + 12 + 2 loose = 20 cookies. The box of 6 takes a box and a sticker, the box of 12 has no rule (flagged),
  -- 2 loose take 2 pouches and 2 stickers, the order a card, and 12 cookies of flavour one take 12 wraps and 12 labels (its packaging lines).
  perform pg_temp.expect(a, 'pk_pack_order_missing', 'select * from public.record_pack(''PK-NOPE'', 5)', 'P0002');
  select * into r from public.record_pack('PK-ORD-1', 5);
  perform pg_temp.assert_ok(a, 'pack_takes_by_the_boxes',
    not r.duplicate and pg_temp.on_hand('pki-box') = 9 and pg_temp.on_hand('pki-pouch') = 8 and pg_temp.on_hand('pki-card') = 9);
  perform pg_temp.assert_ok(a, 'pack_takes_the_recipe_packaging', pg_temp.on_hand('pki-wrap') = 8 and pg_temp.on_hand('pki-label') = 88);
  -- stickers: 1 for the box + 2 loose = 3 asked, 2 on hand: all taken, 1 short. The box of 12 is flagged.
  perform pg_temp.assert_ok(a, 'pack_sticker_taken_and_short', pg_temp.on_hand('pki-sticker') = 0 and r.shortfall @> '[{"name": "PK Sticker", "by": 1, "unit": "pcs"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'pack_box_without_a_rule_is_flagged',
    r.shortfall @> '[{"name": "Box of 12", "by": 1, "unit": "box", "why": "no packaging rule"}]'::jsonb and jsonb_array_length(r.shortfall) = 2);
  perform pg_temp.assert_ok(a, 'pack_one_movement_per_item', pg_temp.pack_moves('PK-ORD-1') = 6);
  -- the books list the box that took nothing, with its why, as stock used with no cost (the fixture sets the used basis); the sticker that was only
  -- short is a movement of its own, not a second line here
  perform pg_temp.assert_ok(a, 'books_pack_no_rule_is_uncosted',
    pg_temp.unc_row('p:' || pg_temp.pack_id('PK-ORD-1')::text || ':1', now() - interval '1 day', now() + interval '1 day') =
      jsonb_build_object('id', 'p:' || pg_temp.pack_id('PK-ORD-1')::text || ':1', 'kind', 'use', 'item', 'Box of 12', 'qty', 1, 'unit', 'box',
                         'at', pg_temp.rec_ms(pg_temp.pack_id('PK-ORD-1')), 'why', 'no packaging rule'));
  perform pg_temp.assert_ok(a, 'books_pack_short_without_why_is_not_a_production_line',
    pg_temp.unc_row('p:' || pg_temp.pack_id('PK-ORD-1')::text || ':0', now() - interval '1 day', now() + interval '1 day') is null);
  select * into r from public.record_pack('PK-ORD-1', 5);
  perform pg_temp.assert_ok(a, 'pk_pack_twice_takes_nothing_more',
    r.duplicate and pg_temp.on_hand('pki-box') = 9 and pg_temp.on_hand('pki-wrap') = 8 and pg_temp.records('pack') = 1 and jsonb_array_length(r.shortfall) = 2);
  -- an order with no boxes: all loose. 3 pouches, 3 stickers (none on hand: flagged short, no movement), a card; flavour three has no packaging lines
  select * into r from public.record_pack('PK-ORD-2', 5);
  perform pg_temp.assert_ok(a, 'pack_all_loose',
    pg_temp.on_hand('pki-pouch') = 5 and pg_temp.on_hand('pki-card') = 8 and pg_temp.on_hand('pki-wrap') = 8 and pg_temp.pack_moves('PK-ORD-2') = 2
    and r.shortfall = '[{"name": "PK Sticker", "by": 3, "unit": "pcs"}]'::jsonb);

  -- ---- a bazaar sale with no bazaar-sale rule takes no container packaging and says so; the recipe packaging line still comes off
  perform pg_temp.expect(a, 'sale_without_rule', 'select * from public.record_event_sale(pg_temp.sale(''devK:S1:1'', 2))', '00000');
  perform pg_temp.assert_ok(a, 'sale_without_rule_flagged',
    pg_temp.sale_short('devK:S1:1') = '[{"name": "Bazaar sale", "by": 1, "unit": "sale", "why": "no packaging rule"}]'::jsonb
    and pg_temp.on_hand('pki-pouch') = 5 and pg_temp.on_hand('pki-bag') = 10);
  perform pg_temp.assert_ok(a, 'books_sale_no_rule_is_uncosted',
    pg_temp.unc_row('p:' || pg_temp.sale_id('devK:S1:1')::text || ':0', now() - interval '1 day', now() + interval '1 day') =
      jsonb_build_object('id', 'p:' || pg_temp.sale_id('devK:S1:1')::text || ':0', 'kind', 'use', 'item', 'Bazaar sale', 'qty', 1, 'unit', 'sale',
                         'at', pg_temp.rec_ms(pg_temp.sale_id('devK:S1:1')), 'why', 'no packaging rule'));
  -- the period applies to these lines as it does to the others: from is inclusive, to is exclusive (the pack was written at now())
  perform pg_temp.assert_ok(a, 'books_pack_and_sale_follow_the_period',
    pg_temp.unc_made(now() + interval '1 hour', now() + interval '2 hours') = 0
    and pg_temp.unc_made(now() - interval '2 days', now() - interval '1 day') = 0
    and pg_temp.unc_made(now() - interval '1 day', now() + interval '1 day') = 2
    and pg_temp.unc_row('p:' || pg_temp.pack_id('PK-ORD-1')::text || ':1', now() - interval '1 day', now()) is null
    and pg_temp.unc_row('p:' || pg_temp.pack_id('PK-ORD-1')::text || ':1', now(), now() + interval '1 day') is not null);
  perform pg_temp.assert_ok(a, 'sale_without_rule_takes_recipe_packaging',
    pg_temp.on_hand('pki-wrap') = 6 and pg_temp.on_hand('pki-label') = 86 and pg_temp.sale_moves('devK:S1:1') =
      '[{"item": "pki-label", "delta": "-2.000"}, {"item": "pki-wrap", "delta": "-2.000"}]'::jsonb);
  -- the owner enters it: a pouch per cookie first, then a bag per sale. The movement ids are the same as they were (seq 1, then 2).
  perform pg_temp.sv(a, 'rule_bazaar_sale_ok', pg_temp.rule('bazaar_sale', null, pg_temp.ln('pki-pouch', 1, 'cookie'), pg_temp.ln('pki-bag', 1, 'container')), '00000');
  perform pg_temp.expect(a, 'sale_with_rule', 'select * from public.record_event_sale(pg_temp.sale(''devK:S2:1'', 3))', '00000');
  perform pg_temp.assert_ok(a, 'sale_with_rule_takes_in_order',
    pg_temp.on_hand('pki-pouch') = 2 and pg_temp.on_hand('pki-bag') = 9 and pg_temp.sale_short('devK:S2:1') = '[]'::jsonb);
  perform pg_temp.assert_ok(a, 'sale_with_rule_movements',
    pg_temp.sale_moves('devK:S2:1') = '[{"item": "pki-bag", "delta": "-1.000"}, {"item": "pki-label", "delta": "-3.000"}, {"item": "pki-pouch", "delta": "-3.000"}, {"item": "pki-wrap", "delta": "-3.000"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'sale_with_rule_keeps_the_movement_ids',
    pg_temp.seq_ok('devK:S2:1', 'pki-pouch', 1) and pg_temp.seq_ok('devK:S2:1', 'pki-bag', 2)
    and pg_temp.seq_ok('devK:S2:1', 'pki-wrap', 3) and pg_temp.seq_ok('devK:S2:1', 'pki-label', 4));
  perform pg_temp.expect(a, 'pk_sale_replayed', 'select * from public.record_event_sale(pg_temp.sale(''devK:S2:1'', 3))', '00000');
  perform pg_temp.assert_ok(a, 'sale_replay_takes_nothing_more', pg_temp.on_hand('pki-pouch') = 2 and pg_temp.on_hand('pki-wrap') = 3 and pg_temp.records('sale') = 2);

  -- ---- a bake skips packaging lines (flavour one has wrap and label lines); an adjustment cannot name one
  perform pg_temp.expect(a, 'bake_adj_names_a_packaging_line',
    format('select * from public.record_production(%L::jsonb)', pg_temp.pr(1, 'batch', 'pkp1', 12, '{"adj": {"PK Wrap": 1}}')::text), '22023');
  select * into r from public.record_production(pg_temp.pr(2, 'batch', 'pkp1', 12));
  perform pg_temp.assert_ok(a, 'bake_takes_the_ingredients', pg_temp.on_hand('pki-flour') = 4700 and pg_temp.on_hand('pki-sugar') = 4880);
  perform pg_temp.assert_ok(a, 'bake_skips_packaging', pg_temp.on_hand('pki-wrap') = 3 and pg_temp.on_hand('pki-label') = 83 and r.shortfall = '[]'::jsonb);
  select * into r from public.record_production(pg_temp.pr(3, 'dough', 'pkp1', 6));
  perform pg_temp.assert_ok(a, 'dough_skips_packaging', pg_temp.on_hand('pki-wrap') = 3 and pg_temp.on_hand('pki-flour') = 4550);

  -- ---- recipes: a line is an ingredient or packaging; no payload needs the new key
  j := public.get_recipes();
  perform pg_temp.assert_ok(a, 'get_recipes_lines_have_a_kind',
    (select string_agg(l ->> 'name' || ':' || (l ->> 'kind'), ',' order by ord) from jsonb_array_elements(
       (select x -> 'lines' from jsonb_array_elements(j) x where x ->> 'product_id' = 'pkp1')) with ordinality t(l, ord))
    = 'PK Flour:ingredient,PK Sugar:ingredient,PK Wrap:packaging,PK Label:packaging');
  perform pg_temp.rc(a, 'recipe_kind_bad', '{"product_id": "pkp4", "yield": 4, "lines": [{"kind": "wrapper", "name": "PK Flour", "qty": 5, "unit": "g"}]}', null, '22023');
  perform pg_temp.rc(a, 'recipe_kind_not_text', '{"product_id": "pkp4", "yield": 4, "lines": [{"kind": 1, "name": "PK Flour", "qty": 5, "unit": "g"}]}', null, '22023');
  perform pg_temp.rc(a, 'recipe_line_keys_kind_only', '{"product_id": "pkp4", "yield": 4, "lines": [{"kind": "packaging", "name": "PK Card", "qty": 1}]}', null, '22023');
  -- the double-take guard, recipe side: the sticker is taken per cookie by the loose rule, so it cannot be a packaging line
  perform pg_temp.rc(a, 'recipe_pack_double', '{"product_id": "pkp4", "yield": 4, "lines": [{"kind": "packaging", "name": "PK Sticker", "qty": 1, "unit": "pcs"}]}', null, '22023');
  perform pg_temp.rc(a, 'recipe_pack_double_pouch', '{"product_id": "pkp4", "yield": 4, "lines": [{"kind": "packaging", "name": " pk pouch ", "qty": 1, "unit": "pcs"}]}', null, '22023');
  perform pg_temp.assert_ok(a, 'recipe_refusals_changed_nothing', not exists (select 1 from public.recipes where product_id = 'pkp4'));
  -- the card is taken per order, not per cookie, so it may be a packaging line; the old key set still means an ingredient
  perform pg_temp.rc(a, 'recipe_with_kinds_ok',
    '{"product_id": "pkp4", "yield": 4, "lines": [{"name": "PK Flour", "qty": 200, "unit": "g"}, {"kind": "packaging", "name": "PK Card", "qty": 1, "unit": "pcs"}, {"kind": "ingredient", "name": "PK Sugar", "qty": 40, "unit": "g"}]}',
    null, '00000');
  perform pg_temp.assert_ok(a, 'recipe_lines_keep_their_kind', pg_temp.recipe_line_kinds('pkp4') = 'PK Flour:ingredient,PK Card:packaging,PK Sugar:ingredient');
  select updated_at into k from public.recipes where product_id = 'pkp4';
  perform pg_temp.rc(a, 'recipe_same_again_is_a_noop',
    '{"product_id": "pkp4", "yield": 4, "lines": [{"name": "PK Flour", "qty": 200, "unit": "g"}, {"kind": "packaging", "name": "PK Card", "qty": 1, "unit": "pcs"}, {"kind": "ingredient", "name": "PK Sugar", "qty": 40, "unit": "g"}]}',
    k, '00000');
  perform pg_temp.assert_ok(a, 'recipe_same_again_made_no_version', (select version from public.recipes where product_id = 'pkp4') = 1);
  -- B4a: the card is on the order rule now, so it can no longer be flipped to an ingredient (recipe-ingredient-on-rule, cutover.sql); the sugar,
  -- which no rule takes, is flipped to packaging instead. A kind change is still a new version.
  perform pg_temp.rc(a, 'recipe_kind_change_is_a_new_version',
    '{"product_id": "pkp4", "yield": 4, "lines": [{"name": "PK Flour", "qty": 200, "unit": "g"}, {"kind": "packaging", "name": "PK Card", "qty": 1, "unit": "pcs"}, {"kind": "packaging", "name": "PK Sugar", "qty": 40, "unit": "g"}]}',
    k, '00000');
  perform pg_temp.assert_ok(a, 'recipe_kind_change_saved',
    (select version from public.recipes where product_id = 'pkp4') = 2 and pg_temp.recipe_line_kinds('pkp4') = 'PK Flour:ingredient,PK Card:packaging,PK Sugar:packaging');
  perform pg_temp.assert_ok(a, 'recipe_history_keeps_the_kind',
    (select h -> 'lines' -> 1 ->> 'kind' from jsonb_array_elements((select x -> 'history' from jsonb_array_elements(public.get_recipes()) x where x ->> 'product_id' = 'pkp4')) h) = 'packaging');

  -- ---- cost: the worked recipe. Flavour one, yield 12: flour 300 g x 1 c + sugar 120 g x 0.5 c = 360 c a batch = 30 c a cookie;
  -- packaging per cookie: wrap 1 x 2.5 c + label 1 x 1.2 c = 3.7 c; a cookie costs 33.7 c.
  j := pg_temp.cost('pkp1');
  perform pg_temp.assert_ok(a, 'cost_batch_is_the_ingredients_only', (j ->> 'batch_cents')::numeric = 360 and (j ->> 'yield')::int = 12);
  perform pg_temp.assert_ok(a, 'cost_ingredients_per_cookie', (j ->> 'ingredient_cents_per_cookie')::numeric = 30);
  perform pg_temp.assert_ok(a, 'cost_packaging_per_cookie', (j ->> 'packaging_cents_per_cookie')::numeric = 3.7);
  perform pg_temp.assert_ok(a, 'cost_per_cookie_adds_both', (j ->> 'per_cookie_cents')::numeric = 33.7 and (j ->> 'complete')::boolean and j -> 'missing' = '[]'::jsonb);
  perform pg_temp.assert_ok(a, 'cost_lines_carry_their_kind',
    jsonb_array_length(j -> 'lines') = 4 and j -> 'lines' -> 0 ->> 'kind' = 'ingredient' and j -> 'lines' -> 2 ->> 'kind' = 'packaging'
    and (j -> 'lines' -> 2 ->> 'cents')::numeric = 2.5 and (j -> 'lines' -> 3 ->> 'cents')::numeric = 1.2);
  -- a packaging line with no cost makes the recipe incomplete; it is not counted in the total, and the packaging figure is unknown
  j := pg_temp.cost('pkp2');
  perform pg_temp.assert_ok(a, 'cost_packaging_without_a_cost_is_incomplete',
    not (j ->> 'complete')::boolean and j -> 'missing' = '[{"name": "PK Tag", "why": "no cost"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'cost_unknown_packaging_is_null_not_zero',
    j -> 'packaging_cents_per_cookie' = 'null'::jsonb and (j ->> 'ingredient_cents_per_cookie')::numeric = 25 and (j ->> 'batch_cents')::numeric = 100
    and (j ->> 'per_cookie_cents')::numeric = 25);
  -- packaging that is costed on a recipe whose ingredients are not is not a cookie's cost: the cookie figure stays unknown
  j := pg_temp.cost('pkp6');
  perform pg_temp.assert_ok(a, 'cost_packaging_alone_is_not_a_cookie_cost',
    j -> 'per_cookie_cents' = 'null'::jsonb and j -> 'batch_cents' = 'null'::jsonb and (j ->> 'packaging_cents_per_cookie')::numeric = 2.5 and not (j ->> 'complete')::boolean);
  -- a recipe with no packaging lines has none to cost
  j := pg_temp.cost('pkp3');
  perform pg_temp.assert_ok(a, 'cost_no_packaging_lines_is_zero',
    (j ->> 'packaging_cents_per_cookie')::numeric = 0 and (j ->> 'per_cookie_cents')::numeric = 10 and (j ->> 'complete')::boolean);

  -- ---- the double-take guard keeps the two ways apart in both directions; a per-container line may share an item with a recipe line
  perform pg_temp.sv(a, 'rule_container_line_may_share_an_item', pg_temp.rule('box', 12, pg_temp.ln('pki-card', 1, 'container')), '00000');
  perform pg_temp.sv(a, 'rule_box_twelve_cleared', pg_temp.rule('box', 12), '00000');
  -- ---- and packing now: a box of 12 whose rule has a box per box and a fill per COOKIE (12 of it), and an order rule that adds a fill per
  -- cookie of the order (12): nothing is flagged
  perform pg_temp.sv(a, 'rule_box_twelve_for_packing', pg_temp.rule('box', 12, pg_temp.ln('pki-box', 1, 'container'), pg_temp.ln('pki-fill1', 1, 'cookie')), '00000');
  perform pg_temp.sv(a, 'rule_order_per_cookie', pg_temp.rule('order', null, pg_temp.ln('pki-card', 1, 'container'), pg_temp.ln('pki-fill2', 1, 'cookie')), '00000');
  -- the order rule takes fill 2 per cookie; fill 1 is a box line per cookie; neither may be taken per cookie by the other side
  perform pg_temp.sv(a, 'rule_double_take_order_vs_box', pg_temp.rule('order', null, pg_temp.ln('pki-card', 1, 'container'), pg_temp.ln('pki-fill1', 1, 'cookie')), '22023');
  perform pg_temp.sv(a, 'rule_double_take_loose_vs_order', pg_temp.rule('loose', null, pg_temp.ln('pki-fill2', 1, 'container')), '22023');
  perform pg_temp.sv(a, 'rule_double_take_box_vs_order', pg_temp.rule('box', 12, pg_temp.ln('pki-box', 1, 'container'), pg_temp.ln('pki-fill2', 1, 'cookie')), '22023');
  select * into r from public.record_pack('PK-ORD-3', 5);
  perform pg_temp.assert_ok(a, 'pack_box_of_twelve_with_a_rule', pg_temp.on_hand('pki-box') = 8 and r.shortfall = '[]'::jsonb);
  perform pg_temp.assert_ok(a, 'pack_per_cookie_lines_count_the_cookies', pg_temp.on_hand('pki-fill1') = 18 and pg_temp.on_hand('pki-fill2') = 18 and pg_temp.on_hand('pki-card') = 7);

  -- a loose line counts as per cookie even when it is written per container: it cannot be a recipe packaging line either
  perform pg_temp.sv(a, 'rule_loose_container_line_ok',
    pg_temp.rule('loose', null, pg_temp.ln('pki-pouch', 1, 'cookie'), pg_temp.ln('pki-sticker', 1, 'cookie'), pg_temp.ln('pki-fill3', 1, 'container')), '00000');
  perform pg_temp.rc(a, 'recipe_pack_double_loose_container',
    '{"product_id": "pkp7", "yield": 4, "lines": [{"kind": "packaging", "name": "PK Fill 3", "qty": 1, "unit": "pcs"}]}', null, '22023');

  -- ---- nothing is silent: with no loose rule and no order rule, 3 loose cookies take nothing and both are flagged, and a recipe
  -- packaging line that is not a stock item is flagged with its reason
  perform pg_temp.sv(a, 'rule_loose_cleared', pg_temp.rule('loose', null), '00000');
  perform pg_temp.sv(a, 'rule_order_cleared', pg_temp.rule('order', null), '00000');
  select * into r from public.record_pack('PK-ORD-4', 5);
  perform pg_temp.assert_ok(a, 'pack_flags_loose_without_a_rule',
    r.shortfall @> '[{"name": "Loose cookies", "by": 3, "unit": "cookie", "why": "no packaging rule"}]'::jsonb and pg_temp.pack_moves('PK-ORD-4') = 0);
  perform pg_temp.assert_ok(a, 'pack_flags_order_without_a_rule', r.shortfall @> '[{"name": "Order", "by": 1, "unit": "order", "why": "no packaging rule"}]'::jsonb);
  perform pg_temp.assert_ok(a, 'pack_flags_a_packaging_line_that_is_not_stock',
    r.shortfall @> '[{"name": "PK Ghost", "by": 1, "unit": "pcs", "why": "not a stock item"}]'::jsonb and jsonb_array_length(r.shortfall) = 3);

  -- ---- no function body names one of her packaging items
  perform pg_temp.assert_ok(a, 'no_function_body_names_a_packaging_item',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.prosrc ~* '(box of 6|single cookie pouch|brand sticker|thank-you card|paper bag)'));
end $$;

grant execute on function
  pg_temp.on_hand(text), pg_temp.records(text), pg_temp.pack_moves(text),
  pg_temp.sale_id(text), pg_temp.sale_moves(text), pg_temp.seq_ok(text, text, integer), pg_temp.sale_short(text), pg_temp.rule_lines(text, integer), pg_temp.rule_count(), pg_temp.audit_rows(),
  pg_temp.recipe_line_kinds(text), pg_temp.cost(text),
  pg_temp.pack_id(text), pg_temp.rec_ms(uuid), pg_temp.unc_row(text, timestamptz, timestamptz), pg_temp.unc_made(timestamptz, timestamptz),
  pg_temp.rule(text, integer, jsonb[]), pg_temp.ln(text, numeric, text), pg_temp.byname(text, numeric, text), pg_temp.sv(text, text, jsonb, text),
  pg_temp.ap(text, text, jsonb, text), pg_temp.rc(text, text, jsonb, timestamptz, text), pg_temp.sale(text, integer), pg_temp.pid(integer),
  pg_temp.pr(integer, text, text, numeric, jsonb),
  pg_temp.set_subject(integer, text), pg_temp.expect(text, text, text, text), pg_temp.assert_ok(text, text, boolean),
  pg_temp.assert_acl(), pg_temp.assert_table(text), pg_temp.assert_refused(text), pg_temp.phase_operator(text), pg_temp.phase_owner(text)
  to anon, authenticated, service_role;

-- ================================================================ the run

select pg_temp.phase_operator('operator');

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
select pg_temp.phase_owner('active_owner');
reset role;

select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor;
rollback;
