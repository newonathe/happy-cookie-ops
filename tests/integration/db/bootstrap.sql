-- This marker is replaced by the harness from the checked-in migration filenames.
do $$
declare
  expected text[] := array[__EXPECTED_MIGRATIONS__];
  actual_count integer;
  missing text;
begin
  select count(*) into actual_count from supabase_migrations.schema_migrations
    where version = any(expected);
  if actual_count <> cardinality(expected) or (select count(*) from supabase_migrations.schema_migrations) <> cardinality(expected) then
    select string_agg(v, ', ' order by v) into missing from unnest(expected) v
      where not exists (select 1 from supabase_migrations.schema_migrations m where m.version = v);
    raise exception 'migration catalog mismatch: expected %, missing %', cardinality(expected), coalesce(missing, 'unknown');
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'drop_remaining'
      and pg_get_function_identity_arguments(p.oid) = 'p_drop_id uuid'
      and p.prorettype = 'integer'::regtype
  ) then
    raise exception 'drop_remaining(uuid) does not return integer';
  end if;
end;
$$;

create temporary table bootstrap_catalog (kind text, identity text, value text);
do $$
declare record_row record; row_count bigint;
begin
  for record_row in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    execute format('select count(*) from public.%I', record_row.tablename) into row_count;
    insert into bootstrap_catalog values ('table_rows', record_row.tablename, row_count::text);
  end loop;
end;
$$;

do $$
declare table_name text; row_count bigint;
begin
  foreach table_name in array array['orders', 'order_items', 'event_sales', 'event_sale_items', 'ledger_entries'] loop
    execute format('select count(*) from public.%I', table_name) into row_count;
    if row_count <> 0 then raise exception 'demo transaction rows remain in %: %', table_name, row_count; end if;
  end loop;
end;
$$;

insert into bootstrap_catalog
select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', pg_get_function_result(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 2;
insert into bootstrap_catalog select 'migration', version, 'applied'
from supabase_migrations.schema_migrations where version in (__EXPECTED_MIGRATIONS__) order by version;
insert into bootstrap_catalog select 'settings_overrides', 'settings', count(*)::text from settings;
insert into bootstrap_catalog select 'settings_defaults', 'settings_effective', count(*)::text from settings_effective() where is_default;
select kind, identity, value from bootstrap_catalog order by kind, identity;
