-- Recipe amount used and actual balls produced are independent facts. Legacy production stays
-- unchanged for compatibility; enable the new live preparation/baking clients in later slices.
alter table public.production_records
  add column recipe_amount numeric check (recipe_amount in (0.5, 1)),
  add column preparation_recipe jsonb check (jsonb_typeof(preparation_recipe) = 'object');

create or replace function public.record_dough_preparation(p_rec jsonb)
returns table (record_id uuid, duplicate boolean, shortfall jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys text[];
  v_id uuid;
  v_pid text;
  v_amount numeric;
  v_balls numeric;
  v_ver numeric;
  v_drop numeric;
  v_at timestamptz;
  v_hash text;
  v_seen public.production_records%rowtype;
  v_recipe public.recipes%rowtype;
  v_snapshot jsonb;
  v_plan jsonb;
  v_ids text[];
  v_p jsonb;
  v_short jsonb := '[]'::jsonb;
  v_left numeric;
  v_n integer := 0;
begin
  if not public.is_owner() then
    raise exception 'only the owner may prepare dough' using errcode = '42501';
  end if;
  if p_rec is null or jsonb_typeof(p_rec) <> 'object' then
    raise exception 'a preparation must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rec) k;
  if v_keys is distinct from array['at', 'balls', 'drop_no', 'id', 'product_id', 'recipe_amount', 'recipe_version'] then
    raise exception 'a preparation carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rec -> 'id') is distinct from 'string'
     or jsonb_typeof(p_rec -> 'product_id') is distinct from 'string'
     or jsonb_typeof(p_rec -> 'recipe_amount') is distinct from 'number'
     or jsonb_typeof(p_rec -> 'balls') is distinct from 'number'
     or jsonb_typeof(p_rec -> 'recipe_version') is distinct from 'number'
     or jsonb_typeof(p_rec -> 'drop_no') is distinct from 'number'
     or jsonb_typeof(p_rec -> 'at') is distinct from 'number' then
    raise exception 'a preparation field has the wrong type' using errcode = '22023';
  end if;
  if (p_rec ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_rec ->> 'id')::uuid;
  v_pid := p_rec ->> 'product_id';
  v_amount := (p_rec ->> 'recipe_amount')::numeric;
  v_balls := (p_rec ->> 'balls')::numeric;
  v_ver := (p_rec ->> 'recipe_version')::numeric;
  v_drop := (p_rec ->> 'drop_no')::numeric;
  if v_amount not in (0.5, 1) or v_balls <> trunc(v_balls) or v_balls not between 1 and 10000
     or v_ver <> trunc(v_ver) or v_ver not between 1 and 2147483647
     or v_drop <> trunc(v_drop) or v_drop not between 0 and 100000
     or (p_rec ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'check the recipe amount, actual balls, version, period and time' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_rec ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then
    raise exception 'the time is in the future' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production_record:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_rec::text, 'UTF8')), 'hex');
  select * into v_seen from public.production_records r where r.id = v_id;
  if found then
    if v_seen.payload_hash <> v_hash then
      raise exception 'that id was already used for a different record' using errcode = '23505';
    end if;
    return query select v_id, true, v_seen.short;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || v_pid, 0));
  perform pg_advisory_xact_lock(hashtextextended('production:' || v_pid, 0));
  select r.* into v_recipe from public.recipes r
    join public.products p on p.id = r.product_id and p.active where r.product_id = v_pid;
  if not found or v_recipe.version <> v_ver::integer then
    raise exception 'the saved recipe is unavailable or changed' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.recipe_ingredients i where i.product_id = v_pid and i.kind = 'ingredient') then
    raise exception 'the saved recipe has no ingredients' using errcode = 'P0002';
  end if;
  select jsonb_build_object('version', v_recipe.version, 'yield', v_recipe.yield_count,
    'lines', jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', i.qty, 'unit', i.unit,
      'kind', i.kind, 'item_id', i.item_id) order by i.position, i.id))
    into v_snapshot from public.recipe_ingredients i where i.product_id = v_pid;
  -- Reuse the authoritative unit/rounding rule. Balls never participate in this calculation.
  v_plan := public.recipe_stock_plan(v_pid, v_recipe.yield_count * v_amount, 'dough', '{}'::jsonb);
  select array_agg(x ->> 'item_id') into v_ids from jsonb_array_elements(v_plan) x where x ->> 'item_id' is not null;
  perform public.lock_stock_item_ids(coalesce(v_ids, array[]::text[]));

  insert into public.production_records(id, kind, product_id, qty, rejects, dough_used, recipe_version,
    drop_no, at, payload_hash, created_by, recipe_amount, preparation_recipe)
  values (v_id, 'dough', v_pid, v_balls::integer, 0, 0, v_ver::integer,
    v_drop::integer, v_at, v_hash, auth.uid(), v_amount, v_snapshot);
  for v_p in select x from jsonb_array_elements(v_plan) x loop
    v_n := v_n + 1;
    if v_p ->> 'item_id' is not null then
      v_left := public.use_stock_item(v_id, v_n, v_p ->> 'item_id', (v_p ->> 'amount')::numeric,
        'Prepared dough, Version ' || v_ver::integer, v_at, true);
    else
      v_left := (v_p ->> 'amount')::numeric;
    end if;
    if v_left > 0 then
      v_short := v_short || (jsonb_build_object('name', v_p ->> 'name', 'by', round(v_left, 1), 'unit', v_p ->> 'unit')
        || case when v_p ->> 'why' is not null then jsonb_build_object('why', v_p ->> 'why') else '{}'::jsonb end);
    end if;
  end loop;
  update public.production_records r set short = v_short where r.id = v_id;
  insert into public.audit_log(actor, action, entity, entity_id, detail)
  values (auth.uid(), 'production.dough', 'production_records', v_id::text,
    jsonb_build_object('product_id', v_pid, 'qty', v_balls, 'recipe_amount', v_amount, 'short', v_short));
  return query select v_id, false, v_short;
end;
$$;
revoke execute on function public.record_dough_preparation(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_dough_preparation(jsonb) to authenticated;
