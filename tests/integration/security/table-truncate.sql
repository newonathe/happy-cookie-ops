-- API-role TRUNCATE containment with real SQL roles; all data rolls back.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into auth.users(id)
select ('a6c40000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid
from generate_series(1, 5) i;
insert into public.profiles(id, role, display_name, active) values
  ('a6c40000-0000-4000-8000-000000000001', 'owner', 'MP06c4 owner', true),
  ('a6c40000-0000-4000-8000-000000000002', 'helper', 'MP06c4 helper', true),
  ('a6c40000-0000-4000-8000-000000000003', 'support', 'MP06c4 support', true),
  ('a6c40000-0000-4000-8000-000000000004', 'owner', 'MP06c4 inactive owner', false);
insert into public.settings(key, int_value) values ('mp06c4_private_int', 17);
insert into public.settings(key, text_value) values ('mp06c4_private_text', 'margin');
create temporary table original_settings as select jsonb_agg(s order by key) as value from public.settings s;
create temporary table original_users as select jsonb_agg(u order by id) as value from auth.users u;
create temporary table original_profiles as select jsonb_agg(p order by id) as value from public.profiles p;

create function pg_temp.set_subject(n integer, claim_role text default 'authenticated') returns void
language plpgsql security invoker as $$
declare subject text := case when n is null then '' else
  'a6c40000-0000-4000-8000-' || lpad(n::text, 12, '0') end;
begin
  perform set_config('request.jwt.claim.sub', subject, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', subject, 'role', claim_role, 'app_role', 'owner')::text, true);
end $$;
create function pg_temp.assert_settings_preserved(actor text) returns void
language plpgsql security invoker as $$
begin
  if (select jsonb_agg(s order by key) from public.settings s) is distinct from
       (select value from pg_temp.original_settings) then
    raise exception 'settings truncate preservation differs: %', actor;
  end if;
end $$;
create function pg_temp.assert_truncate_denied(actor text, only_settings boolean default false) returns void
language plpgsql security invoker as $$
declare relation_name text;
begin
  foreach relation_name in array (case when only_settings then array['settings'] else array[
    'audit_log','bake_batches','drops','erasure_requests','event_sale_items','event_sales',
    'events','inventory_items','ledger_entries','order_items','orders','products','profiles',
    'rate_limits','recipe_drafts','recipe_ingredients','recipes','settings','supplier_prices','suppliers'] end) loop
    begin
      execute format('truncate table public.%I', relation_name);
      raise exception 'forbidden truncate succeeded: % / %', actor, relation_name;
    exception when insufficient_privilege then
      insert into pg_temp.authority_results values ('table_truncate', actor,
        relation_name || '_denied_42501');
    end;
  end loop;
end $$;
grant execute on function pg_temp.set_subject(integer, text), pg_temp.assert_settings_preserved(text),
  pg_temp.assert_truncate_denied(text, boolean) to anon, authenticated, service_role;

set local role anon;
select pg_temp.set_subject(null, 'anon');
select pg_temp.assert_truncate_denied('anon');
reset role;
select pg_temp.assert_settings_preserved('anon');
set local role authenticated;
select pg_temp.set_subject(null);
select pg_temp.assert_truncate_denied('no_subject');
reset role;
select pg_temp.assert_settings_preserved('no_subject');
set local role authenticated;
select pg_temp.set_subject(1);
select pg_temp.assert_truncate_denied('active_owner', true);
reset role;
select pg_temp.assert_settings_preserved('active_owner');
set local role authenticated;
select pg_temp.set_subject(2, 'service_role');
select pg_temp.assert_truncate_denied('active_helper', true);
reset role;
select pg_temp.assert_settings_preserved('active_helper');
set local role authenticated;
select pg_temp.set_subject(3);
select pg_temp.assert_truncate_denied('active_support', true);
reset role;
select pg_temp.assert_settings_preserved('active_support');
set local role authenticated;
select pg_temp.set_subject(4, 'service_role');
select pg_temp.assert_truncate_denied('inactive_owner', true);
reset role;
select pg_temp.assert_settings_preserved('inactive_owner');
set local role authenticated;
select pg_temp.set_subject(5);
select pg_temp.assert_truncate_denied('missing_profile', true);
reset role;
select pg_temp.assert_settings_preserved('missing_profile');

do $$ declare relation_name text;
begin
  if (select jsonb_agg(p order by id) from public.profiles p) is distinct from
       (select value from pg_temp.original_profiles) then
    raise exception 'profiles changed before trusted truncate';
  end if;
  foreach relation_name in array array['audit_log','bake_batches','drops','erasure_requests',
      'event_sale_items','event_sales','events','inventory_items','ledger_entries','order_items',
      'orders','products','profiles','rate_limits','recipe_drafts','recipe_ingredients','recipes','settings',
      'supplier_prices','suppliers'] loop
    if has_table_privilege('anon', 'public.' || relation_name, 'TRUNCATE')
       or has_table_privilege('authenticated', 'public.' || relation_name, 'TRUNCATE')
       or exists (select 1 from pg_class c, aclexplode(coalesce(c.relacl,
           acldefault('r', c.relowner))) a where c.oid = ('public.' || relation_name)::regclass
           and a.grantee = 0 and a.privilege_type = 'TRUNCATE') then
      raise exception 'effective truncate privilege remains: %', relation_name;
    end if;
  end loop;
end $$;

set local role service_role;
select pg_temp.set_subject(null, 'service_role');
truncate table public.audit_log, public.bake_batches, public.drops, public.erasure_requests,
  public.event_sale_items, public.event_sales, public.events, public.inventory_items,
  public.ledger_entries, public.order_items, public.orders, public.products, public.profiles,
  public.rate_limits, public.recipe_drafts, public.recipe_ingredients, public.recipes, public.settings,
  public.supplier_prices, public.suppliers, public.event_expenses, public.order_swaps,
  public.order_extras, public.order_add_ons, public.order_boxes, public.scheduled_events, public.recipe_versions, public.stock_movements, public.production_records, public.stock_cost_corrections, public.item_prices, public.books_settings, public.packaging_rules,
  public.bazaar_days, public.bazaar_day_lines, public.bazaar_costs, public.bazaar_fees, public.bazaar_losses, public.bazaar_stock_adds, public.flavour_costs;
reset role;
do $$ declare relation_name text; populated boolean;
begin
  if exists (select 1 from public.settings) or exists (select 1 from public.profiles) then
    raise exception 'trusted truncate left settings or profiles';
  end if;
  foreach relation_name in array array['audit_log','bake_batches','drops','erasure_requests',
      'event_sale_items','event_sales','events','inventory_items','ledger_entries','order_items',
      'orders','products','profiles','rate_limits','recipe_drafts','recipe_ingredients','recipes','settings',
      'supplier_prices','suppliers'] loop
    execute format('select exists (select 1 from public.%I)', relation_name) into populated;
    if populated then raise exception 'trusted truncate left rows: %', relation_name; end if;
  end loop;
end $$;
insert into pg_temp.authority_results values ('table_truncate', 'service_role', 'all_20_tables_emptied');
do $$ begin
  if (select jsonb_agg(u order by id) from auth.users u) is distinct from
       (select value from pg_temp.original_users) then raise exception 'auth users changed'; end if;
  if (select count(*) from pg_temp.authority_results) <> 46 then
    raise exception 'truncate result count differs';
  end if;
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor, outcome;
rollback;
