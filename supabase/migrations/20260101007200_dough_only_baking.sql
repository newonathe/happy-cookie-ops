-- Baking recorded dough changes dough and good-cookie balances, never ingredient stock again.
-- Legacy record_production is kept for exact replay by older unanswered requests.
alter table public.production_records add column dough_only boolean not null default false
  check (not dough_only or (kind = 'batch' and dough_used = qty + rejects and short = '[]'::jsonb));

create or replace function public.record_bake(p_rec jsonb)
returns table (record_id uuid, duplicate boolean, used_dough integer, shortfall jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys text[];
  v_id uuid;
  v_pid text;
  v_qty numeric;
  v_target numeric;
  v_rej numeric;
  v_ver numeric;
  v_drop numeric;
  v_at timestamptz;
  v_hash text;
  v_seen public.production_records%rowtype;
  v_recipe public.recipes%rowtype;
  v_bal numeric;
  v_at_balance numeric;
  v_future_min numeric;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record baking' using errcode = '42501';
  end if;
  if p_rec is null or jsonb_typeof(p_rec) <> 'object' then
    raise exception 'a bake must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rec) k;
  if v_keys is distinct from array['at', 'drop_no', 'id', 'product_id', 'qty', 'recipe_version', 'rejects', 'target'] then
    raise exception 'a bake carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rec -> 'id') is distinct from 'string'
     or jsonb_typeof(p_rec -> 'product_id') is distinct from 'string'
     or jsonb_typeof(p_rec -> 'qty') is distinct from 'number'
     or jsonb_typeof(p_rec -> 'target') is distinct from 'number'
     or jsonb_typeof(p_rec -> 'rejects') is distinct from 'number'
     or jsonb_typeof(p_rec -> 'recipe_version') is distinct from 'number'
     or jsonb_typeof(p_rec -> 'drop_no') is distinct from 'number'
     or jsonb_typeof(p_rec -> 'at') is distinct from 'number' then
    raise exception 'a bake field has the wrong type' using errcode = '22023';
  end if;
  if (p_rec ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_rec ->> 'id')::uuid;
  v_pid := p_rec ->> 'product_id';
  v_qty := (p_rec ->> 'qty')::numeric;
  v_target := (p_rec ->> 'target')::numeric;
  v_rej := (p_rec ->> 'rejects')::numeric;
  v_ver := (p_rec ->> 'recipe_version')::numeric;
  v_drop := (p_rec ->> 'drop_no')::numeric;
  if v_qty <> trunc(v_qty) or v_qty not between 1 and 10000
     or v_target <> trunc(v_target) or v_target not between 0 and 10000
     or v_rej <> trunc(v_rej) or v_rej not between 0 and v_qty
     or v_ver <> trunc(v_ver) or v_ver not between 1 and 2147483647
     or v_drop <> trunc(v_drop) or v_drop not between 0 and 100000
     or (p_rec ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'check the oven count, plan, rejects, recipe, period and time' using errcode = '22023';
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
    return query select v_id, true, v_seen.dough_used, v_seen.short;
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || v_pid, 0));
  perform pg_advisory_xact_lock(hashtextextended('production:' || v_pid, 0));
  select r.* into v_recipe from public.recipes r
    join public.products p on p.id = r.product_id and p.active where r.product_id = v_pid;
  if not found or v_recipe.version <> v_ver::integer
     or not exists (select 1 from public.recipe_ingredients i where i.product_id = v_pid and i.kind = 'ingredient') then
    raise exception 'the saved recipe is unavailable or changed' using errcode = 'P0002';
  end if;
  select coalesce(sum(case r.kind when 'dough' then r.qty when 'discard_dough' then -r.qty else -r.dough_used end), 0)
    into v_bal from public.production_records r
    where r.product_id = v_pid and r.kind in ('dough', 'batch', 'discard_dough');
  if v_bal < v_qty then
    raise exception 'not enough recorded dough' using errcode = 'ZD001',
      detail = jsonb_build_object('available', greatest(v_bal, 0), 'needed', v_qty)::text;
  end if;
  -- A late record must be supported at its own time and leave every later balance nonnegative.
  -- Aggregate equal timestamps first, so consistent out-of-order concurrent saves remain valid.
  with deltas as (
    select r.at, sum(case r.kind when 'dough' then r.qty when 'discard_dough' then -r.qty else -r.dough_used end) as change
      from public.production_records r where r.product_id = v_pid and r.kind in ('dough', 'batch', 'discard_dough') group by r.at
  ), timeline as (select at, sum(change) over (order by at rows unbounded preceding) as balance from deltas)
  select coalesce((select t.balance from timeline t where t.at <= v_at order by t.at desc limit 1), 0),
         (select min(t.balance) from timeline t where t.at > v_at)
    into v_at_balance, v_future_min;
  if least(v_at_balance, coalesce(v_future_min, v_at_balance)) < v_qty then
    raise exception 'recorded dough cannot support this bake date' using errcode = 'ZD002';
  end if;
  insert into public.production_records(id, kind, product_id, qty, target, rejects, dough_used,
    recipe_version, drop_no, at, payload_hash, created_by, dough_only)
  values(v_id, 'batch', v_pid, (v_qty-v_rej)::integer, v_target::integer, v_rej::integer, v_qty::integer,
    v_ver::integer, v_drop::integer, v_at, v_hash, auth.uid(), true);
  insert into public.audit_log(actor, action, entity, entity_id, detail)
  values(auth.uid(), 'production.batch', 'production_records', v_id::text,
    jsonb_build_object('product_id', v_pid, 'qty', v_qty, 'rejects', v_rej, 'dough_used', v_qty, 'source', 'recorded dough'));
  return query select v_id, false, v_qty::integer, '[]'::jsonb;
end;
$$;
revoke execute on function public.record_bake(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_bake(jsonb) to authenticated;
