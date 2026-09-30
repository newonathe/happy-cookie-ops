-- C2 follow-up (docs/state/current.md, "Open, and it silently under-deducts stock"): binned dough and binned baked cookies.
--
-- Until now dough or cookies thrown away on the spoilage sheet were recorded only on the screen, so the database still counted them: mix 6,
-- bin 2, bake 6 took all 6 from the dough and NO ingredients for the other 2. Now:
--
--   record_discard()     owner only. Dough balls or baked cookies thrown away, with a reason; never more than is there. Idempotent on a client id.
--   record_production()  redefined: the dough balance also subtracts what was binned
--   get_production()     redefined: the chilled dough and the baked count subtract what was binned (the baked count per drop, as before)
--
-- Nothing is deleted or edited: a wrong discard is answered by nothing (no undo); the ledger has no cost entry (the ingredients were already
-- costed when the dough was mixed or the batch baked). Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it.

alter table public.production_records drop constraint production_records_kind_check;
alter table public.production_records
  add constraint production_records_kind_check check (kind in ('dough', 'batch', 'pack', 'sale', 'discard_dough', 'discard_baked'));

/**
 * Records dough or baked cookies thrown away. The body is exactly: id (a uuid the browser mints), kind (dough or baked), product_id, qty
 * (a whole number, at most what is there), reason (1 to 80 characters), drop_no, at (epoch milliseconds). Returns the record's id and
 * whether this id was already recorded (an identical retry is answered; a different body under the same id is refused, 23505).
 */
create or replace function public.record_discard(p_rec jsonb)
returns table (record_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys   text[];
  v_id     uuid;
  v_kind   text;
  v_pid    text;
  v_qty    numeric;
  v_reason text;
  v_drop   numeric;
  v_at     timestamptz;
  v_hash   text;
  v_seen   public.production_records%rowtype;
  v_have   numeric;
  v_bad    boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record waste' using errcode = '42501';
  end if;
  if p_rec is null or jsonb_typeof(p_rec) <> 'object' then
    raise exception 'a discard must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rec) k;
  if v_keys is distinct from array['at', 'drop_no', 'id', 'kind', 'product_id', 'qty', 'reason'] then -- rule:disc-keys
    raise exception 'a discard carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rec -> 'id') <> 'string' or jsonb_typeof(p_rec -> 'kind') <> 'string' or jsonb_typeof(p_rec -> 'product_id') <> 'string'
     or jsonb_typeof(p_rec -> 'qty') <> 'number' or jsonb_typeof(p_rec -> 'reason') <> 'string'
     or jsonb_typeof(p_rec -> 'drop_no') <> 'number' or jsonb_typeof(p_rec -> 'at') <> 'number' then
    raise exception 'a discard field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_rec ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:disc-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_rec ->> 'id')::uuid;
  v_kind := p_rec ->> 'kind';
  if v_kind not in ('dough', 'baked') then -- rule:disc-kind
    raise exception 'the kind is dough or baked' using errcode = '22023';
  end if;
  v_pid := p_rec ->> 'product_id';
  v_qty := (p_rec ->> 'qty')::numeric;
  v_bad := v_qty <> trunc(v_qty) or v_qty not between 1 and 10000;
  if v_bad then -- rule:disc-qty
    raise exception 'a quantity is a whole number from 1 to 10000' using errcode = '22023';
  end if;
  v_reason := btrim(p_rec ->> 'reason');
  v_bad := length(v_reason) not between 1 and 80 or v_reason ~ '[[:cntrl:]]';
  if v_bad then -- rule:disc-reason
    raise exception 'a reason is 1 to 80 characters' using errcode = '22023';
  end if;
  v_drop := (p_rec ->> 'drop_no')::numeric;
  if v_drop <> trunc(v_drop) or v_drop not between 0 and 100000 then
    raise exception 'the drop is a whole number' using errcode = '22023';
  end if;
  if (p_rec ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_rec ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:disc-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production_record:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_rec::text, 'UTF8')), 'hex');
  select * into v_seen from public.production_records r where r.id = v_id;
  if found then
    if v_seen.payload_hash <> v_hash then -- rule:disc-replay-conflict
      raise exception 'that id was already used for a different record' using errcode = '23505';
    end if;
    return query select v_id, true;
    return;
  end if;
  -- The same lock record_production takes for this flavour, so the balance cannot move between the check and the insert.
  perform pg_advisory_xact_lock(hashtextextended('production:' || v_pid, 0));
  if not exists (select 1 from public.products p where p.id = v_pid) then -- (also caught by the balance check below: an unknown flavour has nothing to throw away)
    raise exception 'no such flavour' using errcode = '22023';
  end if;
  if v_kind = 'dough' then
    select coalesce(sum(case r.kind when 'dough' then r.qty when 'discard_dough' then -r.qty else -r.dough_used end), 0) into v_have
      from public.production_records r where r.product_id = v_pid and r.kind in ('dough', 'batch', 'discard_dough');
  else
    select coalesce(sum(x.qty), 0) into v_have
      from (select r.qty from public.production_records r where r.kind = 'batch' and r.product_id = v_pid and r.drop_no = v_drop::integer
            union all
            select -oi.qty from public.production_records r join public.order_items oi on oi.order_id = r.ref
             where r.kind = 'pack' and r.drop_no = v_drop::integer and oi.product_id = v_pid
            union all
            select -r.qty from public.production_records r
             where r.kind = 'discard_baked' and r.product_id = v_pid and r.drop_no = v_drop::integer) x;
  end if;
  if v_qty > greatest(v_have, 0) then -- rule:disc-more-than-there
    raise exception 'there is not that much to throw away' using errcode = '22023';
  end if;
  insert into public.production_records (id, kind, product_id, ref, qty, drop_no, at, payload_hash, created_by)
  values (v_id, 'discard_' || v_kind, v_pid, v_reason, v_qty::integer, v_drop::integer, v_at, v_hash, auth.uid());
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'production.discard', 'production_records', v_id::text,
    jsonb_build_object('product_id', v_pid, 'kind', v_kind, 'qty', v_qty, 'reason', v_reason));
  return query select v_id, false;
end;
$$;
revoke execute on function public.record_discard(jsonb) from public, anon, authenticated;
grant execute on function public.record_discard(jsonb) to authenticated;

-- record_production, as it was (20260101004700) with the dough balance also subtracting what was binned.
create or replace function public.record_production(p_rec jsonb)
returns table (record_id uuid, duplicate boolean, used_dough integer, shortfall jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys    text[];
  v_id      uuid;
  v_kind    text;
  v_pid     text;
  v_qty     numeric;
  v_target  numeric;
  v_rej     numeric;
  v_adj     jsonb;
  v_ver     numeric;
  v_drop    numeric;
  v_at      timestamptz;
  v_hash    text;
  v_seen    public.production_records%rowtype;
  v_recipe  public.recipes%rowtype;
  v_bal     numeric;
  v_used    integer := 0;
  v_mixed   numeric;
  v_line    record;
  v_base    numeric;
  v_step    numeric;
  v_raw     numeric;
  v_amount  numeric;
  v_left    numeric;
  v_plan    jsonb := '[]'::jsonb;
  v_short   jsonb := '[]'::jsonb;
  v_names   text[];
  v_flavour text;
  v_reason  text;
  v_n       integer := 0;
  v_bad     boolean;
  v_p       jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record production' using errcode = '42501';
  end if;
  if p_rec is null or jsonb_typeof(p_rec) <> 'object' then
    raise exception 'a production record must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_rec) k;
  if v_keys is distinct from array['adj', 'at', 'drop_no', 'id', 'kind', 'product_id', 'qty', 'recipe_version', 'rejects', 'target'] then -- rule:prod-keys
    raise exception 'a production record carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rec -> 'id') <> 'string' or jsonb_typeof(p_rec -> 'kind') <> 'string'
     or jsonb_typeof(p_rec -> 'product_id') <> 'string' or jsonb_typeof(p_rec -> 'qty') <> 'number'
     or jsonb_typeof(p_rec -> 'target') not in ('number', 'null') or jsonb_typeof(p_rec -> 'rejects') <> 'number'
     or jsonb_typeof(p_rec -> 'adj') <> 'object' or jsonb_typeof(p_rec -> 'recipe_version') <> 'number'
     or jsonb_typeof(p_rec -> 'drop_no') <> 'number' or jsonb_typeof(p_rec -> 'at') <> 'number' then
    raise exception 'a production field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_rec ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:prod-id
    raise exception 'the id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_id := (p_rec ->> 'id')::uuid;
  v_kind := p_rec ->> 'kind';
  if v_kind not in ('dough', 'batch') then -- rule:prod-kind
    raise exception 'the kind is dough or batch' using errcode = '22023';
  end if;
  v_pid := p_rec ->> 'product_id';
  v_qty := (p_rec ->> 'qty')::numeric;
  v_rej := (p_rec ->> 'rejects')::numeric;
  v_target := (p_rec ->> 'target')::numeric;
  v_ver := (p_rec ->> 'recipe_version')::numeric;
  v_drop := (p_rec ->> 'drop_no')::numeric;
  v_adj := p_rec -> 'adj';
  v_bad := v_qty <> trunc(v_qty) or v_qty not between 1 and 10000;
  if v_bad then -- rule:prod-qty
    raise exception 'a quantity is a whole number from 1 to 10000' using errcode = '22023';
  end if;
  v_bad := v_rej <> trunc(v_rej) or v_rej < 0 or v_rej > v_qty or (v_kind = 'dough' and v_rej <> 0);
  if v_bad then -- rule:prod-rejects
    raise exception 'rejects are whole, not more than were baked, and only a batch has them' using errcode = '22023';
  end if;
  v_bad := (v_kind = 'dough' and v_target is not null)
           or (v_kind = 'batch' and (v_target is null or v_target <> trunc(v_target) or v_target not between 0 and 10000));
  if v_bad then -- rule:prod-target
    raise exception 'a batch has a planned whole number; dough has none' using errcode = '22023';
  end if;
  v_bad := v_ver <> trunc(v_ver) or v_ver < 1 or v_drop <> trunc(v_drop) or v_drop not between 0 and 100000;
  if v_bad then
    raise exception 'the version and the drop are whole numbers' using errcode = '22023';
  end if;
  if (p_rec ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_rec ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:prod-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;
  if v_kind = 'dough' and v_adj <> '{}'::jsonb then -- rule:prod-adj-dough
    raise exception 'dough has no adjustments' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_each(v_adj) a
                    where jsonb_typeof(a.value) <> 'number' or (a.value #>> '{}')::numeric <> trunc((a.value #>> '{}')::numeric)
                       or (a.value #>> '{}')::numeric not between -50 and 50);
  if v_bad then -- rule:prod-adj-range
    raise exception 'an adjustment is a whole number of steps from -50 to 50' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production_record:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_rec::text, 'UTF8')), 'hex');
  select * into v_seen from public.production_records r where r.id = v_id;
  if found then
    if v_seen.payload_hash <> v_hash then -- rule:prod-replay-conflict
      raise exception 'that id was already used for a different record' using errcode = '23505';
    end if;
    return query select v_id, true, v_seen.dough_used, v_seen.short;
    return;
  end if;

  -- The catalogue's lock, then the recipe's (save_recipe takes them in this order), then this flavour's production.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform pg_advisory_xact_lock(hashtextextended('recipe:' || v_pid, 0));
  perform pg_advisory_xact_lock(hashtextextended('production:' || v_pid, 0));
  select * into v_recipe from public.recipes r where r.product_id = v_pid;
  if not found then -- rule:prod-no-recipe
    raise exception 'that flavour has no recipe' using errcode = 'P0002';
  end if;
  if v_recipe.version <> v_ver::integer then -- rule:prod-stale-version
    raise exception 'the recipe changed since it was read' using errcode = 'P0002';
  end if;
  if v_kind = 'dough' and v_qty > v_recipe.yield_count then -- rule:prod-dough-size
    raise exception 'dough is mixed whole or halved: at most one recipe yield at a time' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_object_keys(v_adj) k
                    where not exists (select 1 from public.recipe_ingredients i where i.product_id = v_pid and i.item_name = k));
  if v_bad then -- rule:prod-adj-unknown
    raise exception 'an adjustment names an ingredient the recipe does not have' using errcode = '22023';
  end if;
  select p.name into v_flavour from public.products p where p.id = v_pid;

  if v_kind = 'batch' then
    select coalesce(sum(case r.kind when 'dough' then r.qty when 'discard_dough' then -r.qty else -r.dough_used end), 0) into v_bal
      from public.production_records r where r.product_id = v_pid and r.kind in ('dough', 'batch', 'discard_dough');
    v_used := least(greatest(v_bal, 0), v_qty)::integer;
    v_mixed := v_qty - v_used;
  else
    v_mixed := v_qty;
  end if;
  -- Every line is qty x mixed / yield with the multiplication first: dividing first leaves a rounded quotient (5/9 has no exact
  -- decimal), and a piece line that is exactly 5 would round up to 6.
  for v_line in select i.item_name as name, i.qty as qty, i.unit as unit from public.recipe_ingredients i
                 where i.product_id = v_pid order by i.position, i.id loop
    if v_kind = 'dough' then
      v_raw := v_line.qty * v_mixed / v_recipe.yield_count;
    else
      v_base := round(v_line.qty * v_mixed / v_recipe.yield_count, 1);
      v_step := case v_line.unit when 'pcs' then 1 when 'ml' then 5 else 10 end;
      v_raw := greatest(0, v_base + coalesce((v_adj ->> v_line.name)::numeric, 0) * v_step);
    end if;
    v_amount := case when v_line.unit = 'pcs' then ceil(v_raw) else round(v_raw, 1) end;
    if v_amount > 0 then
      v_plan := v_plan || jsonb_build_object('name', v_line.name, 'unit', v_line.unit, 'amount', v_amount);
    end if;
  end loop;
  select array_agg(lower(x ->> 'name')) into v_names from jsonb_array_elements(v_plan) x;
  perform public.lock_stock_items(coalesce(v_names, array[]::text[]));

  insert into public.production_records (id, kind, product_id, qty, target, rejects, dough_used, recipe_version, drop_no, at,
                                         payload_hash, created_by)
  values (v_id, v_kind, v_pid, case when v_kind = 'batch' then v_qty::integer - v_rej::integer else v_qty::integer end,
          v_target::integer, v_rej::integer, v_used, v_ver::integer, v_drop::integer, v_at, v_hash, auth.uid());
  v_reason := (case v_kind when 'dough' then 'Mixed dough: ' else 'Baked: ' end) || v_flavour || ', Version ' || v_ver::integer;
  for v_p in select x from jsonb_array_elements(v_plan) x loop
    v_n := v_n + 1;
    v_left := public.use_stock(v_id, v_n, v_p ->> 'name', (v_p ->> 'amount')::numeric, v_reason, v_at);
    if v_left > 0 then -- rule:prod-shortfall
      v_short := v_short || jsonb_build_object('name', v_p ->> 'name', 'by', round(v_left, 1), 'unit', v_p ->> 'unit');
    end if;
  end loop;
  update public.production_records r set short = v_short where r.id = v_id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'production.' || v_kind, 'production_records', v_id::text,
    jsonb_build_object('product_id', v_pid, 'qty', v_qty, 'dough_used', v_used, 'short', v_short));
  return query select v_id, false, v_used, v_short;
end;
$$;
revoke execute on function public.record_production(jsonb) from public, anon, authenticated;
grant execute on function public.record_production(jsonb) to authenticated;

-- get_production, as it was (20260101004700) with the chilled dough and the baked count also subtracting what was binned.
create or replace function public.get_production(p_drop integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read production' using errcode = '42501';
  end if;
  if p_drop is null or p_drop not between 0 and 100000 then
    raise exception 'a drop is required' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'batches', coalesce((select jsonb_agg(jsonb_build_object('product_id', b.product_id, 'qty', b.qty, 'target', b.target,
        'rejects', b.rejects, 'version', b.recipe_version, 'at', (extract(epoch from b.at) * 1000)::bigint) order by b.at, b.received_at)
      from (select * from public.production_records r where r.kind = 'batch' order by r.at desc, r.received_at desc limit 2000) b), '[]'::jsonb),
    'dough', coalesce((select jsonb_agg(jsonb_build_object('product_id', d.product_id, 'balls', d.balls, 'at', d.at) order by d.product_id)
      from (select r.product_id,
                   sum(case r.kind when 'dough' then r.qty when 'discard_dough' then -r.qty else -r.dough_used end)::integer as balls,
                   (extract(epoch from max(r.at) filter (where r.kind = 'dough')) * 1000)::bigint as at
              from public.production_records r where r.kind in ('dough', 'batch', 'discard_dough') group by r.product_id
             having sum(case r.kind when 'dough' then r.qty when 'discard_dough' then -r.qty else -r.dough_used end) > 0) d), '[]'::jsonb),
    'baked', coalesce((select jsonb_agg(jsonb_build_object('product_id', k.product_id, 'qty', k.qty) order by k.product_id)
      from (select x.product_id, greatest(sum(x.qty), 0)::integer as qty
              from (select r.product_id, r.qty from public.production_records r where r.kind = 'batch' and r.drop_no = p_drop
                    union all
                    select oi.product_id, -oi.qty from public.production_records r
                      join public.order_items oi on oi.order_id = r.ref where r.kind = 'pack' and r.drop_no = p_drop
                    union all
                    select r.product_id, -r.qty from public.production_records r where r.kind = 'discard_baked' and r.drop_no = p_drop) x
             group by x.product_id having greatest(sum(x.qty), 0) > 0) k), '[]'::jsonb),
    'shortfalls', coalesce((select jsonb_agg(jsonb_build_object('kind', s.kind, 'product_id', s.product_id, 'ref', s.ref,
        'short', s.short, 'at', (extract(epoch from s.at) * 1000)::bigint) order by s.at)
      from (select * from public.production_records r where r.short <> '[]'::jsonb order by r.at desc limit 500) s), '[]'::jsonb))
    into v_out;
  return v_out;
end;
$$;
revoke execute on function public.get_production(integer) from public, anon, authenticated;
grant execute on function public.get_production(integer) to authenticated;
