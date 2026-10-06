-- B3a: correcting a recorded batch. Until now a batch's good count and rejects were set before it was recorded; afterwards cookies
-- could only be written off (a discard), and a count recorded too low could not be raised.
--
--   record_batch_correction()  owner only. What a batch's good count and rejects SHOULD be (not the change). It never edits the batch
--                              row: it writes an opposite entry (kind batch_correction, qty 0, ref = the reason, corrects = the batch,
--                              qty_delta and rejects_delta = the change from what the batch was worth until then). It moves no
--                              ingredients and no dough: no stock movement, no ledger entry, dough_used untouched, the books untouched.
--                              Idempotent on a client id.
--   record_discard()           redefined: the baked balance also adds the corrections of that drop. Nothing else changes.
--   get_production()           redefined: each batch reports its EFFECTIVE good count and rejects (the batch plus its corrections), and
--                              gains id, corrected, cost_cents, cost_complete and per_cookie_cents; the baked balance adds the
--                              corrections of the drop. Correction rows are not listed as batches. Dough and shortfalls are unchanged.
--
-- A batch's cost is what its own stock movements cost (what was taken plus what was short, times the cost stamped on each use) plus the
-- chilled dough it drew on at the flavour's cost per ball (the cost of the dough records dated at or before the batch over the balls
-- they mixed). cost_complete is false when a movement has no stamped cost, when a line of the batch or of a dough record could not be
-- costed (a short entry with no costed shortfall behind it: one that has a why, or one written before shortfalls were costed), or when dough was used and no dough record precedes the batch. cost_cents (and per_cookie_cents)
-- is null when nothing at all could be costed: an unknown cost is never reported as nothing. A correction does not change the cost of a
-- batch (no ingredient moves); it changes how many cookies share it.
--
-- Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it.

alter table public.production_records drop constraint production_records_kind_check;
alter table public.production_records
  add constraint production_records_kind_check check (kind in ('dough', 'batch', 'pack', 'sale', 'discard_dough', 'discard_baked', 'batch_correction'));
alter table public.production_records
  add column corrects uuid references public.production_records (id),
  add column qty_delta integer,
  add column rejects_delta integer;
create index production_records_corrects_idx on public.production_records (corrects);
-- get_production reads the stock movements of every batch and of its dough records by production id (up to 2000 batches a call).
create index stock_movements_production_idx on public.stock_movements (production_id) where production_id is not null;
alter table public.production_records
  add constraint production_records_correction_check check (
    (kind = 'batch_correction' and corrects is not null and qty_delta is not null and rejects_delta is not null)
    or (kind <> 'batch_correction' and corrects is null and qty_delta is null and rejects_delta is null));

/**
 * Corrects a recorded batch without editing it. The body is exactly: id (a uuid the browser mints), batch_id (the batch's id), qty (what
 * the batch's good count should be, a whole number from 0 to 10000), rejects (what its rejects should be, 0 to 10000), reason (1 to 80
 * characters), at (epoch milliseconds). The change is worked out from the batch's effective values (the batch plus its earlier
 * corrections). A correction down that would take the flavour's baked count in that batch's drop below zero (more was packed or thrown
 * away than is left) is refused; a correction up is never refused for that. Returns the record's id, whether this id was already
 * recorded (an identical retry is answered; a different body under the same id is refused, 23505) and the batch's effective good count
 * and rejects after the correction.
 */
create or replace function public.record_batch_correction(p_corr jsonb)
returns table (record_id uuid, duplicate boolean, qty integer, rejects integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys     text[];
  v_id       uuid;
  v_batch_id uuid;
  v_qty      numeric;
  v_rej      numeric;
  v_reason   text;
  v_at       timestamptz;
  v_hash     text;
  v_seen     public.production_records%rowtype;
  v_batch    public.production_records%rowtype;
  v_eff_q    integer;
  v_eff_r    integer;
  v_have     numeric;
  v_bad      boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may correct a batch' using errcode = '42501';
  end if;
  if p_corr is null or jsonb_typeof(p_corr) <> 'object' then
    raise exception 'a correction must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_corr) k;
  if v_keys is distinct from array['at', 'batch_id', 'id', 'qty', 'reason', 'rejects'] then -- rule:corr-keys
    raise exception 'a correction carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_corr -> 'id') <> 'string' or jsonb_typeof(p_corr -> 'batch_id') <> 'string'
     or jsonb_typeof(p_corr -> 'qty') <> 'number' or jsonb_typeof(p_corr -> 'rejects') <> 'number'
     or jsonb_typeof(p_corr -> 'reason') <> 'string' or jsonb_typeof(p_corr -> 'at') <> 'number' then
    raise exception 'a correction field has the wrong type' using errcode = '22023';
  end if;
  v_bad := (p_corr ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or (p_corr ->> 'batch_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_bad then -- rule:corr-id
    raise exception 'the ids must be lowercase uuids' using errcode = '22023';
  end if;
  v_id := (p_corr ->> 'id')::uuid;
  v_batch_id := (p_corr ->> 'batch_id')::uuid;
  v_qty := (p_corr ->> 'qty')::numeric;
  v_bad := v_qty <> trunc(v_qty) or v_qty not between 0 and 10000;
  if v_bad then -- rule:corr-qty
    raise exception 'the good count is a whole number from 0 to 10000' using errcode = '22023';
  end if;
  v_rej := (p_corr ->> 'rejects')::numeric;
  v_bad := v_rej <> trunc(v_rej) or v_rej not between 0 and 10000;
  if v_bad then -- rule:corr-rejects
    raise exception 'the rejects are a whole number from 0 to 10000' using errcode = '22023';
  end if;
  v_reason := btrim(p_corr ->> 'reason');
  v_bad := length(v_reason) not between 1 and 80 or v_reason ~ '[[:cntrl:]]';
  if v_bad then -- rule:corr-reason
    raise exception 'a reason is 1 to 80 characters' using errcode = '22023';
  end if;
  if (p_corr ->> 'at') !~ '^[0-9]{12,14}$' then
    raise exception 'the time is epoch milliseconds' using errcode = '22023';
  end if;
  v_at := to_timestamp((p_corr ->> 'at')::bigint / 1000.0);
  if v_at > now() + interval '1 day' then -- rule:corr-at
    raise exception 'the time is in the future' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('production_record:' || v_id::text, 0));
  v_hash := encode(sha256(convert_to(p_corr::text, 'UTF8')), 'hex');
  select * into v_seen from public.production_records r where r.id = v_id;
  if found then
    if v_seen.payload_hash <> v_hash then -- rule:corr-replay-conflict
      raise exception 'that id was already used for a different record' using errcode = '23505';
    end if;
    select b.qty + coalesce(sum(c.qty_delta), 0)::integer, b.rejects + coalesce(sum(c.rejects_delta), 0)::integer into v_eff_q, v_eff_r
      from public.production_records b left join public.production_records c on c.corrects = b.id
     where b.id = v_seen.corrects group by b.id;
    return query select v_id, true, v_eff_q, v_eff_r;
    return;
  end if;
  select * into v_batch from public.production_records r where r.id = v_batch_id and r.kind = 'batch';
  if not found then -- rule:corr-batch-missing
    raise exception 'no such batch' using errcode = 'P0002';
  end if;
  -- The same lock record_production and record_discard take for this flavour, so the balance cannot move between the check and the insert.
  perform pg_advisory_xact_lock(hashtextextended('production:' || v_batch.product_id, 0));
  select v_batch.qty + coalesce(sum(c.qty_delta), 0), v_batch.rejects + coalesce(sum(c.rejects_delta), 0) into v_eff_q, v_eff_r
    from public.production_records c where c.corrects = v_batch.id;
  v_bad := v_qty = v_eff_q and v_rej = v_eff_r;
  if v_bad then -- rule:corr-no-change
    raise exception 'that is already what the batch says' using errcode = '22023';
  end if;
  select coalesce(sum(x.qty), 0) into v_have
    from (select r.qty from public.production_records r where r.kind = 'batch' and r.product_id = v_batch.product_id and r.drop_no = v_batch.drop_no
          union all
          select -oi.qty from public.production_records r join public.order_items oi on oi.order_id = r.ref
           where r.kind = 'pack' and r.drop_no = v_batch.drop_no and oi.product_id = v_batch.product_id
          union all
          select -r.qty from public.production_records r
           where r.kind = 'discard_baked' and r.product_id = v_batch.product_id and r.drop_no = v_batch.drop_no
          union all
          select r.qty_delta from public.production_records r
           where r.kind = 'batch_correction' and r.product_id = v_batch.product_id and r.drop_no = v_batch.drop_no) x;
  v_bad := v_qty < v_eff_q and v_have + (v_qty - v_eff_q) < 0;
  if v_bad then -- rule:corr-baked-negative
    raise exception 'more of that flavour was packed or thrown away than that count leaves' using errcode = '22023';
  end if;
  insert into public.production_records (id, kind, product_id, ref, qty, recipe_version, drop_no, at, payload_hash, created_by,
                                         corrects, qty_delta, rejects_delta)
  values (v_id, 'batch_correction', v_batch.product_id, v_reason, 0, v_batch.recipe_version, v_batch.drop_no, v_at, v_hash, auth.uid(),
          v_batch.id, v_qty::integer - v_eff_q, v_rej::integer - v_eff_r);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'production.batch_correction', 'production_records', v_id::text,
    jsonb_build_object('batch_id', v_batch.id, 'product_id', v_batch.product_id, 'qty', v_qty, 'rejects', v_rej,
                       'qty_delta', v_qty::integer - v_eff_q, 'rejects_delta', v_rej::integer - v_eff_r, 'reason', v_reason));
  return query select v_id, false, v_qty::integer, v_rej::integer;
end;
$$;
revoke execute on function public.record_batch_correction(jsonb) from public, anon, authenticated;
grant execute on function public.record_batch_correction(jsonb) to authenticated;

-- record_discard, as it was (20260101004800) with the baked balance also adding the corrections of the drop.
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
             where r.kind = 'discard_baked' and r.product_id = v_pid and r.drop_no = v_drop::integer
            union all
            select r.qty_delta from public.production_records r
             where r.kind = 'batch_correction' and r.product_id = v_pid and r.drop_no = v_drop::integer) x;
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


-- get_production, as it was (20260101004800) with each batch reporting its effective count and its cost, and the baked count adding the corrections.
/**
 * The owner's production for a drop. batches: every batch (newest 2000, oldest first) with its id, its EFFECTIVE good count and rejects (the batch
 * plus its corrections), `corrected` (true when it has any), its cost in centavos (`cost_cents`, 4 decimals: what its own stock
 * movements cost plus the chilled dough it drew on, null when nothing could be costed), `cost_complete` (false when a part of the cost
 * is unknown) and `per_cookie_cents` (the cost over the effective good count; null when that is 0 or no cost is known); dough: the
 * chilled balls; baked: what is baked and not packed or thrown away in the drop, corrections included; shortfalls.
 */
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
    'batches', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'product_id', b.product_id, 'qty', b.qty + b.dq, 'target', b.target,
        'rejects', b.rejects + b.dr, 'version', b.recipe_version, 'at', (extract(epoch from b.at) * 1000)::bigint,
        'corrected', b.n_corr > 0, 'cost_cents', round(c.cost, 4),
        'cost_complete', not own.unpriced and not own.why
            and (b.dough_used = 0 or (dough.n > 0 and dough.balls > 0 and not dough.unpriced and not dough.why)),
        'per_cookie_cents', case when b.qty + b.dq > 0 then round(c.cost / (b.qty + b.dq), 4) end)
        order by b.at, b.received_at)
      from (select r.*, k.dq, k.dr, k.n_corr
              from public.production_records r
              cross join lateral (select coalesce(sum(x.qty_delta), 0)::integer as dq, coalesce(sum(x.rejects_delta), 0)::integer as dr, count(*) as n_corr
                                    from public.production_records x where x.corrects = r.id) k
             where r.kind = 'batch' order by r.at desc, r.received_at desc limit 2000) b
      cross join lateral (select coalesce(sum((-m.qty_delta + m.short_qty) * m.unit_cost), 0) as cents, count(m.unit_cost) as n_costed,
                                 coalesce(bool_or(m.unit_cost is null), false) as unpriced,
                                 jsonb_array_length(b.short) > count(*) filter (where m.short_qty > 0) as why
                            from public.stock_movements m where m.production_id = b.id) own
      cross join lateral (select coalesce(sum(d.qty), 0) as balls, count(*) as n, coalesce(sum(dm.cents), 0) as cents,
                                 coalesce(sum(dm.n_costed), 0) as n_costed, coalesce(bool_or(dm.unpriced), false) as unpriced,
                                 coalesce(bool_or(dm.why), false) as why
                            from public.production_records d
                            cross join lateral (select coalesce(sum((m.short_qty - m.qty_delta) * m.unit_cost), 0) as cents, count(m.unit_cost) as n_costed,
                                                       coalesce(bool_or(m.unit_cost is null), false) as unpriced,
                                                       jsonb_array_length(d.short) > count(*) filter (where m.short_qty > 0) as why
                                                  from public.stock_movements m where m.production_id = d.id) dm
                           where b.dough_used > 0 and d.kind = 'dough' and d.product_id = b.product_id and d.at <= b.at) dough
      cross join lateral (select case when own.n_costed > 0 or (b.dough_used > 0 and dough.n_costed > 0) then
                                 own.cents + b.dough_used * case when dough.balls > 0 then dough.cents / dough.balls else 0 end end as cost) c), '[]'::jsonb),
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
                    select r.product_id, -r.qty from public.production_records r where r.kind = 'discard_baked' and r.drop_no = p_drop
                    union all
                    select r.product_id, r.qty_delta from public.production_records r where r.kind = 'batch_correction' and r.drop_no = p_drop) x
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
