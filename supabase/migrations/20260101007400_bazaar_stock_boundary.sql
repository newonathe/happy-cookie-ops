-- Private stock boundary for additive kitchen-to-Bazaar transfers.
-- Phase 1 preserves every legacy stock/cost effect, lock and replay identity.
-- The parent still owns role checks, booking serialization, summary/till/hash
-- validation and financial posting. This helper is not an authenticated RPC.
create function public.finalise_bazaar_stock(
  p_booking uuid, p_drop integer, p_summary jsonb, p_name text, p_at timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum jsonb := p_summary;
  v_at timestamptz := p_at;
  v_s record;
  v_p record;
  v_k record;
  v_x jsonb;
  v_plan jsonb;
  v_id uuid;
  v_n integer;
  v_left numeric;
  v_short jsonb;
  v_reason text;
  v_sales integer;
  v_cookies integer;
begin
  if not public.is_owner() then
    raise exception 'only the owner may finalise bazaar stock' using errcode = '42501';
  end if;
  select p_name as name into v_s;
  -- Stock. The catalogue's lock first, as every production takes it, so the recipes and rules read here hold for the whole take.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  -- Cookies sent to the shop are an ordinary batch of the drop given: baked stock reads it as it reads any batch, and the batch takes
  -- its own ingredients once (the loop after this one takes ingredients only for the cookies that were not sent to the shop).
  for v_p in select l ->> 'product_id' as pid, l ->> 'name' as name, (l ->> 'to_shop')::integer as qty
               from jsonb_array_elements(v_sum -> 'cookie_cost' -> 'lines') l where (l ->> 'to_shop')::integer > 0 order by l ->> 'product_id' loop
    v_id := md5('bazaar:' || p_booking::text || ':shop:' || v_p.pid)::uuid;
    v_n := 0;
    v_short := '[]'::jsonb;
    v_reason := 'Baked: ' || v_p.name || ', for the shop from ' || left(v_s.name, 40);
    insert into public.production_records (id, kind, product_id, ref, qty, target, rejects, dough_used, recipe_version, drop_no, at,
                                           payload_hash, created_by)
    select v_id, 'batch', v_p.pid, 'bazaar:' || p_booking::text, v_p.qty, v_p.qty, 0, 0, r.version, p_drop, v_at,
           encode(sha256(convert_to('bazaar:' || p_booking::text || ':shop:' || v_p.pid || ':' || p_drop::text, 'UTF8')), 'hex'), auth.uid()
      from public.recipes r where r.product_id = v_p.pid;
    if not found then -- rule:fin-shop-no-recipe
      raise exception 'a flavour sent to the shop has no recipe: a batch cannot be written for it' using errcode = '55000';
    end if;
    select public.recipe_stock_plan(v_p.pid, v_p.qty, 'batch', '{}'::jsonb) into v_plan;
    for v_x in select x from jsonb_array_elements(coalesce(v_plan, '[]'::jsonb)) x loop
      v_n := v_n + 1;
      if v_x ->> 'item_id' is not null then
        v_left := public.use_stock_item(v_id, v_n, v_x ->> 'item_id', (v_x ->> 'amount')::numeric, v_reason, v_at, true);
      else
        v_left := (v_x ->> 'amount')::numeric;
      end if;
      if v_left > 0 then
        v_short := v_short || (jsonb_build_object('name', v_x ->> 'name', 'by', round(v_left, 1), 'unit', v_x ->> 'unit')
                               || case when v_x ->> 'why' is not null then jsonb_build_object('why', v_x ->> 'why') else '{}'::jsonb end);
      end if;
    end loop;
    update public.production_records as r set short = v_short where r.id = v_id;
  end loop;
  for v_p in select l ->> 'product_id' as pid, l ->> 'name' as name, (l ->> 'made')::integer - (l ->> 'to_shop')::integer as qty
               from jsonb_array_elements(v_sum -> 'cookie_cost' -> 'lines') l order by l ->> 'product_id' loop
    if v_p.qty > 0 then
      v_id := md5('bazaar:' || p_booking::text || ':flavour:' || v_p.pid)::uuid;
      v_n := 0;
      v_short := '[]'::jsonb;
      v_reason := 'Bazaar: ' || v_s.name || ', ' || v_p.name;
      insert into public.production_records (id, kind, product_id, ref, qty, at, payload_hash, created_by)
      values (v_id, 'sale', v_p.pid, 'bazaar:' || p_booking::text, v_p.qty, v_at,
              encode(sha256(convert_to('bazaar:' || p_booking::text || ':flavour:' || v_p.pid, 'UTF8')), 'hex'), auth.uid());
      select public.recipe_stock_plan(v_p.pid, v_p.qty, 'batch', '{}'::jsonb) into v_plan;
      if v_plan is null then -- rule:fin-no-recipe
        v_short := v_short || jsonb_build_object('name', v_p.name, 'by', v_p.qty, 'unit', 'cookie', 'why', 'no recipe');
      end if;
      for v_x in select x from jsonb_array_elements(coalesce(v_plan, '[]'::jsonb)) x loop
        v_n := v_n + 1;
        if v_x ->> 'item_id' is not null then
          v_left := public.use_stock_item(v_id, v_n, v_x ->> 'item_id', (v_x ->> 'amount')::numeric, v_reason, v_at, true);
        else
          v_left := (v_x ->> 'amount')::numeric;
        end if;
        if v_left > 0 then
          v_short := v_short || (jsonb_build_object('name', v_x ->> 'name', 'by', round(v_left, 1), 'unit', v_x ->> 'unit')
                                 || case when v_x ->> 'why' is not null then jsonb_build_object('why', v_x ->> 'why') else '{}'::jsonb end);
        end if;
      end loop;
      for v_k in select l.item_id, l.item_name as name, l.unit, l.qty * v_p.qty as amount, it.id is not null and it.unit = l.unit as ok,
                        case when it.id is null then 'not a stock item' else 'unit differs' end as why
                   from public.recipe_ingredients l left join public.inventory_items it on it.id = l.item_id
                  where l.product_id = v_p.pid and l.kind = 'packaging' order by l.position, l.id loop
        v_n := v_n + 1;
        if v_k.ok then
          v_left := public.use_stock_item(v_id, v_n, v_k.item_id, v_k.amount, v_reason, v_at, false);
          if v_left > 0 then
            v_short := v_short || jsonb_build_object('name', v_k.name, 'by', round(v_left, 1), 'unit', v_k.unit);
          end if;
        else
          v_short := v_short || jsonb_build_object('name', v_k.name, 'by', round(v_k.amount, 1), 'unit', v_k.unit, 'why', v_k.why);
        end if;
      end loop;
      update public.production_records as r set short = v_short where r.id = v_id;
    end if;
  end loop;
  -- The bazaar-sale container rule, once per sale that is not voided (a line per cookie: once per cookie in those sales). With no rule, nothing
  -- is written (U6, A7): recipes carry the pouch and the sticker per cookie.
  select count(*)::integer, coalesce(sum(q.cookies), 0)::integer into v_sales, v_cookies
    from (select (select sum(i.qty) from public.event_sale_items i where i.sale_id = s.id) as cookies
            from public.event_sales s
           where s.voided_at is null
             and s.event_id in (select d.event_id from public.bazaar_days d where d.scheduled_id = p_booking and d.event_id is not null)) q;
  if v_sales > 0 and exists (select 1 from public.packaging_rules r where r.container = 'bazaar_sale') then
    v_id := md5('bazaar:' || p_booking::text || ':sales')::uuid;
    v_n := 0;
    v_short := '[]'::jsonb;
    insert into public.production_records (id, kind, ref, qty, at, payload_hash, created_by)
    values (v_id, 'sale', 'bazaar:' || p_booking::text, v_cookies, v_at,
            encode(sha256(convert_to('bazaar:' || p_booking::text || ':sales', 'UTF8')), 'hex'), auth.uid());
    for v_k in select r.item_id, it.name, it.unit, r.qty * case r.per when 'cookie' then v_cookies else v_sales end as amount
                 from public.packaging_rules r join public.inventory_items it on it.id = r.item_id
                where r.container = 'bazaar_sale' order by r.position loop
      v_n := v_n + 1;
      v_left := public.use_stock_item(v_id, v_n, v_k.item_id, v_k.amount, 'Bazaar sales: ' || v_s.name, v_at, false);
      if v_left > 0 then
        v_short := v_short || jsonb_build_object('name', v_k.name, 'by', round(v_left, 1), 'unit', v_k.unit);
      end if;
    end loop;
    update public.production_records as r set short = v_short where r.id = v_id;
  end if;

end;
$$;
revoke all on function public.finalise_bazaar_stock(uuid,integer,jsonb,text,timestamptz)
  from public, anon, authenticated, service_role;

create or replace function public.finalise_bazaar(p_booking uuid, p_expected text, p_drop integer, p_till jsonb, p_final jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s       public.scheduled_events%rowtype;
  v_sum     jsonb;
  v_first   uuid;
  v_at      timestamptz := now();
  v_when    timestamptz;
  v_ledger  uuid;
  v_f       record;
  v_d       record;
  v_p       record;
  v_k       record;
  v_x       jsonb;
  v_plan    jsonb;
  v_id      uuid;
  v_n       integer;
  v_left    numeric;
  v_short   jsonb;
  v_reason  text;
  v_sales   integer;
  v_cookies integer;
  v_bad     boolean;
  v_tday    jsonb;
  v_final   jsonb := coalesce(p_final, '{}'::jsonb);
  v_str     jsonb;
  v_sx      jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may finalise a bazaar' using errcode = '42501';
  end if;
  if p_booking is null or p_expected is null or p_expected !~ '^[0-9a-f]{64}$' then -- rule:fin-shape
    raise exception 'a booking and the hash of the summary shown are required' using errcode = '22023';
  end if;
  if p_drop is null or p_drop not between 0 and 100000 then -- rule:fin-drop
    raise exception 'the drop the cookies sent to the shop belong to is required' using errcode = '22023';
  end if;
  v_bad := p_till is not null
           and (jsonb_typeof(p_till) <> 'object'
                or (select array_agg(k order by k) from jsonb_object_keys(p_till) k) is distinct from array['cash_cents', 'day_id', 'sales_count']
                or jsonb_typeof(p_till -> 'day_id') <> 'string'
                or (p_till ->> 'day_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                or jsonb_typeof(p_till -> 'sales_count') <> 'number' or (p_till ->> 'sales_count') !~ '^[0-9]{1,6}$'
                or jsonb_typeof(p_till -> 'cash_cents') <> 'number' or (p_till ->> 'cash_cents') !~ '^[0-9]{1,12}$');
  if v_bad then -- rule:fin-till-shape
    raise exception 'the till figures are null, or exactly day_id, sales_count and cash_cents' using errcode = '22023';
  end if;
  v_bad := jsonb_typeof(v_final) <> 'object'
           or exists (select 1 from jsonb_each(v_final) i
                       where case when jsonb_typeof(i.value) <> 'object' then true
                                  else (select array_agg(k order by k) from jsonb_object_keys(i.value) k) is distinct from array['to_shop', 'written_off']
                                       or exists (select 1 from jsonb_each(i.value) q
                                                   where jsonb_typeof(q.value) <> 'number' or (q.value #>> '{}') !~ '^[0-9]{1,5}$') end);
  if v_bad then -- rule:fin-final-shape
    raise exception 'the final split is null, or per flavour exactly to_shop and written_off, whole and 0 or more' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || p_booking::text, 0));
  select * into v_s from public.scheduled_events s where s.id = p_booking for update;
  if not found then -- rule:fin-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  if v_s.finalised_at is not null then
    if v_s.final_hash is distinct from p_expected then -- rule:fin-replay-conflict
      raise exception 'that bazaar was already finalised on another summary' using errcode = '23505';
    end if;
    if v_s.final_split is distinct from v_final then -- rule:fin-replay-split
      raise exception 'that bazaar was already finalised with another final split' using errcode = '23505';
    end if;
    return v_s.final_summary;
  end if;
  select d.event_id into v_first from public.bazaar_days d
   where d.scheduled_id = p_booking and d.event_id is not null order by d.day limit 1;
  if v_first is null then -- rule:fin-no-day
    raise exception 'no day of this bazaar was started' using errcode = '55000';
  end if;
  v_bad := exists (select 1 from public.bazaar_days d join public.events e on e.id = d.event_id
                    where d.scheduled_id = p_booking and e.closed_at is null);
  if v_bad then -- rule:fin-open-day
    raise exception 'a day of this bazaar is still open: close it first' using errcode = '55000';
  end if;
  select public.bazaar_summary(p_booking) into v_sum;
  if (v_sum ->> 'hash') is distinct from p_expected then -- rule:fin-stale
    raise exception 'the bazaar changed since it was shown: read it again' using errcode = '40001';
  end if;
  -- S3.1 (M1): a phone that still holds a closed day of this bazaar (it has sales of it not yet sent) gives that day's sale count
  -- and cash; until the server holds the same, it is refused. Not compared with the figures stored at the close, so a late sale
  -- that did arrive ("changed after it was closed") is read as it is.
  if p_till is not null then
    select x into v_tday from jsonb_array_elements(v_sum -> 'days') x where x ->> 'id' = p_till ->> 'day_id';
    if v_tday is null then -- rule:fin-till-day
      raise exception 'the till figures name a day of another bazaar' using errcode = '22023';
    end if;
    v_bad := (p_till ->> 'sales_count')::integer <> (v_tday ->> 'sales')::integer
             or (p_till ->> 'cash_cents')::bigint <> (v_tday ->> 'cash_sales_cents')::bigint;
    if v_bad then -- rule:fin-till
      raise exception 'the server does not hold all of this phone''s sales yet: sync, then read the event again' using errcode = '40001';
    end if;
  end if;
  -- A1: the cookies the latest started day set aside to carry over that no later day took must be given a destination, exactly: the
  -- flavours of the split are the stranded flavours, and each one's two parts are its stranded quantity.
  v_str := coalesce(v_sum -> 'stranded', '[]'::jsonb);
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(v_final) k)
           is distinct from (select array_agg(x ->> 'product_id' order by x ->> 'product_id') from jsonb_array_elements(v_str) x);
  if v_bad then -- rule:fin-final-flavours
    raise exception 'the cookies set aside to carry over need a final split: to the shop or written off, for exactly those flavours' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_str) x
                    where coalesce((v_final -> (x ->> 'product_id') ->> 'to_shop')::integer + (v_final -> (x ->> 'product_id') ->> 'written_off')::integer, -1)
                          <> (x ->> 'qty')::integer);
  if v_bad then -- rule:fin-final-sum
    raise exception 'a flavour''s final split is what it set aside to carry over, together' using errcode = '22023';
  end if;
  if jsonb_array_length(v_str) > 0 then
    for v_sx in select x from jsonb_array_elements(v_str) x loop
      update public.bazaar_day_lines as l
         set carry_next_qty = l.carry_next_qty - (v_sx ->> 'qty')::integer,
             to_shop_qty = l.to_shop_qty + (v_final -> (v_sx ->> 'product_id') ->> 'to_shop')::integer,
             written_off_qty = l.written_off_qty + (v_final -> (v_sx ->> 'product_id') ->> 'written_off')::integer
       where l.day_id = (v_sx ->> 'day_id')::uuid and l.product_id = v_sx ->> 'product_id';
    end loop;
    -- Every figure below, the shop batch included, is read from the lines as they are now.
    select public.bazaar_summary(p_booking) into v_sum;
  end if;

  -- The rent, once, under the key the old link used. A cost is dated noon UTC of the day it was paid: that instant is the same
  -- calendar day in the shop's zone (which only business_clock names), so the line falls on the day she paid.
  v_when := (v_s.starts_on + time '12:00') at time zone 'UTC';
  if v_s.rent_cents > 0 and not exists (select 1 from public.event_expenses x where x.client_id = 'rent:' || p_booking::text) then -- rule:fin-rent
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
    values ('cost', 'Bazaar rent', v_s.name || ' — Stall rent', -v_s.rent_cents, v_when, auth.uid())
    returning id into v_ledger;
    insert into public.event_expenses (client_id, event_id, label, category, amount_cents, spent_at, ledger_id, payload_hash)
    values ('rent:' || p_booking::text, v_first, 'Stall rent', 'Bazaar rent', v_s.rent_cents, v_when, v_ledger,
            encode(sha256(convert_to('rent:' || p_booking::text || ':' || v_s.rent_cents::text, 'UTF8')), 'hex'));
  end if;
  for v_f in select f.client_id, f.label, f.category, f.amount_cents, f.paid_on, f.payload_hash, coalesce(d.event_id, v_first) as ev
               from public.bazaar_fees f left join public.bazaar_days d on d.id = f.day_id
              where f.scheduled_id = p_booking and f.ledger_id is null and f.voided_at is null order by f.paid_on, f.client_id loop
    v_when := (v_f.paid_on + time '12:00') at time zone 'UTC';
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
    values ('cost', v_f.category, v_s.name || ' — ' || v_f.label, -v_f.amount_cents, v_when, auth.uid())
    returning id into v_ledger;
    insert into public.event_expenses (client_id, event_id, label, category, amount_cents, spent_at, ledger_id, payload_hash)
    values ('fee:' || v_f.client_id, v_f.ev, v_f.label, v_f.category, v_f.amount_cents, v_when, v_ledger, v_f.payload_hash);
    update public.bazaar_fees as f set ledger_id = v_ledger where f.client_id = v_f.client_id;
  end loop;
  -- Each day's cash variance: a short drawer is a cost, an over drawer an adjustment of the same category (U6, A4: not a sale).
  for v_d in select e.name, e.closed_at, (x ->> 'over_cents')::bigint as over, (x ->> 'short_cents')::bigint as short
               from jsonb_array_elements(v_sum -> 'days') x join public.events e on e.id = (x ->> 'event_id')::uuid
              order by x ->> 'day' loop
    if v_d.over > 0 or v_d.short > 0 then
      insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
      values (case when v_d.short > 0 then 'cost'::public.ledger_kind else 'adjustment'::public.ledger_kind end,
        'Cash variance',
        v_d.name || ' — drawer ' || case when v_d.short > 0 then 'short' else 'over' end,
        v_d.over - v_d.short, v_d.closed_at, auth.uid());
    end if;
  end loop;

  perform public.finalise_bazaar_stock(p_booking, p_drop, v_sum, v_s.name, v_at);

  update public.scheduled_events as s set finalised_at = v_at, final_summary = v_sum, final_hash = p_expected, final_split = v_final where s.id = p_booking;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.finalised', 'scheduled_events', p_booking::text,
    jsonb_build_object('hash', p_expected, 'till', p_till, 'split', v_final, 'stranded', v_str, 'revenue_cents', v_sum -> 'revenue' -> 'revenue_cents',
      'fees_cents', v_sum -> 'fees' -> 'total_cents', 'profit_cents', v_sum -> 'profit' -> 'cents'));
  return v_sum;
end;
$$;
