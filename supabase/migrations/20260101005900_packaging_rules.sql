-- B3b-1 (final-plan.md version 2, slice B3b), database half: packaging as records.
--
-- What goes into a box, a loose cookie, an order or a bazaar sale used to be written inside record_pack and record_sale_packaging,
-- and what a flavour's packaging costs was worked out on the screens from three named items. Now it is data the owner changes:
--
--   recipe_ingredients.kind   'ingredient' (the quantity is per batch) or 'packaging' (the quantity is per COOKIE). A bake and a
--                             dough mix take only ingredients. Packaging lines are taken when the cookie is packed or sold.
--   packaging_rules           one row per line of a container's rule. A container is a box of one size (2 to 48, as order_boxes), a
--                             loose cookie, an order, or a bazaar sale. A line is a stock item, a quantity above 0, and `per`: once
--                             per container, or once per cookie in it. Lines are kept in position order. A loose cookie is one
--                             cookie, so its two `per` values mean the same and both count as per cookie for the guard below.
--
--   save_packaging_rule(rule)   owner only. Replaces ONE container's lines whole (an empty list clears it), exact keys, audited.
--   get_packaging_rules()       owner only. The rules by container.
--   apply_packaging_rule(rule)  internal, for the operator (no API role can execute it, service_role included; it is run as postgres
--                               through the connector, like apply_identity_links). Items are named as DATA in the call, each name
--                               resolved to exactly one stock item (none or several: refused, and the names listed), then written
--                               through the same validation. No item name appears in any migration or function. scripts/
--                               packaging-rule-today.sql is the one call that enters today's rule; it is run in the same sitting as
--                               this migration. Until a rule is entered, a pack or a bazaar sale takes no container packaging and
--                               keeps a flagged shortfall (why: no packaging rule): never a silent zero.
--   write_packaging_rule(rule)  internal: the one place a rule is validated and written (save and apply both end here).
--
-- Redefined whole (each change marked B3b): record_pack, record_sale_packaging, record_production, save_recipe, get_recipes and
-- get_recipe_costs. record_event_sale is NOT redefined: it calls record_sale_packaging by name and keeps its pinned body.
--   record_pack            packs by the order's boxes: each box size takes its own rule, cookies not in a box are loose, the order
--                          rule once, and each flavour's packaging lines times the cookies of it. A box size with no rule takes
--                          nothing and is flagged. One movement per item, locks by item id. A card now goes in once per order
--                          (where it went once per box): the one deliberate change from before.
--   record_sale_packaging  the bazaar-sale rule in position order (so the movement ids are the ones the bazaar has always written),
--                          then each flavour's packaging lines for the cookies in that sale.
--   record_production      skips packaging lines.
--   save_recipe            a line may carry kind (keys are name, qty, unit OR kind, name, qty, unit, so no payload needs the new
--                          key). New refusals: recipe-kind, and recipe-pack-double. A version snapshot keeps `kind` on a packaging
--                          line only, so the history of an ingredient-only recipe is byte for byte what it was (exactly name,
--                          qty and unit per line); a line with no kind in a snapshot is an ingredient.
--   get_recipes            each line carries its kind.
--   get_recipe_costs       adds ingredient_cents_per_cookie and packaging_cents_per_cookie; per_cookie_cents is the ingredients over
--                          the yield plus the packaging; a packaging line with no cost makes the recipe incomplete. Keys are only
--                          added. batch_cents is the ingredients only.
-- The double-take guard: an item that is a recipe's packaging line (per cookie) may not also be taken per cookie by a container
-- (a loose cookie counts as per cookie), or a cookie would take it twice; likewise the order rule and a box or the loose rule may not both take
-- an item per cookie. The save actions refuse it, whichever is saved second.
-- Each refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it (as in A3, A4, B2 and B3a).

alter table public.recipe_ingredients
  add column kind text not null default 'ingredient' check (kind in ('ingredient', 'packaging'));

create table public.packaging_rules (
  id uuid primary key default gen_random_uuid(),
  container text not null check (container in ('box', 'loose', 'order', 'bazaar_sale')),
  box_size integer check (box_size between 2 and 48),
  item_id text not null references public.inventory_items (id),
  qty numeric(12, 3) not null check (qty > 0 and qty <= 9999),
  per text not null check (per in ('container', 'cookie')),
  position integer not null check (position between 1 and 20),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((container = 'box') = (box_size is not null))
);
create unique index packaging_rules_position_idx on public.packaging_rules (container, coalesce(box_size, 0), position);
create unique index packaging_rules_item_idx on public.packaging_rules (container, coalesce(box_size, 0), item_id);
create index packaging_rules_item_id_idx on public.packaging_rules (item_id);
alter table public.packaging_rules enable row level security;
revoke all on table public.packaging_rules from public, anon, authenticated;

/**
 * The one place a packaging rule is validated and written. The body is exactly: container (box, loose, order or bazaar_sale),
 * box_size (a whole number from 2 to 48 for a box, null for the others) and lines (at most 20, each exactly item_id, qty, per). It
 * replaces that container's lines whole, in the order given. Internal: save_packaging_rule and apply_packaging_rule call it.
 */
create or replace function public.write_packaging_rule(p_rule jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_container text;
  v_size      integer;
  v_lines     jsonb;
  v_bad       boolean;
  v_at        timestamptz := now();
begin
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    raise exception 'a packaging rule must be an object' using errcode = '22023';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(p_rule) k) is distinct from array['box_size', 'container', 'lines']
           or jsonb_typeof(p_rule -> 'container') is distinct from 'string'
           or jsonb_typeof(p_rule -> 'box_size') not in ('number', 'null')
           or jsonb_typeof(p_rule -> 'lines') is distinct from 'array'
           or exists (select 1 from jsonb_array_elements(p_rule -> 'lines') l
                       where case when jsonb_typeof(l) <> 'object' then true
                                  else (select array_agg(k order by k) from jsonb_object_keys(l) k) is distinct from array['item_id', 'per', 'qty']
                                       or jsonb_typeof(l -> 'item_id') is distinct from 'string'
                                       or jsonb_typeof(l -> 'qty') is distinct from 'number'
                                       or jsonb_typeof(l -> 'per') is distinct from 'string' end);
  if v_bad then -- rule:packrule-keys
    raise exception 'a packaging rule carries exactly container, box_size and lines of item_id, qty and per' using errcode = '22023';
  end if;
  v_container := p_rule ->> 'container';
  if v_container not in ('box', 'loose', 'order', 'bazaar_sale') then -- rule:packrule-container
    raise exception 'the container is box, loose, order or bazaar_sale' using errcode = '22023';
  end if;
  v_bad := case when v_container = 'box'
                then jsonb_typeof(p_rule -> 'box_size') <> 'number'
                     or (p_rule ->> 'box_size')::numeric <> trunc((p_rule ->> 'box_size')::numeric)
                     or (p_rule ->> 'box_size')::numeric not between 2 and 48
                else jsonb_typeof(p_rule -> 'box_size') <> 'null' end;
  if v_bad then -- rule:packrule-box-size
    raise exception 'a box has a whole size from 2 to 48 and nothing else has one' using errcode = '22023';
  end if;
  v_size := (p_rule ->> 'box_size')::numeric::integer;
  v_lines := p_rule -> 'lines';
  if jsonb_array_length(v_lines) > 20 then -- rule:packrule-lines-max
    raise exception 'a container has at most 20 packaging lines' using errcode = '22023';
  end if;
  -- The catalogue's lock (save_recipe and the stock saves take it first), so a recipe cannot become a packaging line between the
  -- double-take check and the write, and a pack never reads a rule that is half replaced.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where not exists (select 1 from public.inventory_items i where i.id = l ->> 'item_id'));
  if v_bad then -- rule:packrule-item-missing
    raise exception 'a packaging line must name a stock item' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where (l ->> 'qty')::numeric <> round((l ->> 'qty')::numeric, 3)
                       or (l ->> 'qty')::numeric not between 0.001 and 9999);
  if v_bad then -- rule:packrule-qty
    raise exception 'a quantity is above 0 and at most 9,999 with at most 3 decimals' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l where l ->> 'per' not in ('container', 'cookie'));
  if v_bad then -- rule:packrule-per
    raise exception 'a line is taken per container or per cookie' using errcode = '22023';
  end if;
  v_bad := (select count(*) <> count(distinct l ->> 'item_id') from jsonb_array_elements(v_lines) l);
  if v_bad then -- rule:packrule-dup
    raise exception 'an item is listed twice in one container' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where (v_container = 'loose' or l ->> 'per' = 'cookie')
                      and exists (select 1 from public.recipe_ingredients r where r.kind = 'packaging' and r.item_id = l ->> 'item_id'));
  if v_bad then -- rule:packrule-double
    raise exception 'that item is already a packaging line of a recipe: a cookie would take it twice' using errcode = '22023';
  end if;
  -- The same guard between containers: a cookie in a box or loose is also a cookie of its order, so an item taken per cookie by the order
  -- rule cannot also be taken per cookie by a box or the loose rule (and the other way round). A box and loose never share a cookie.
  v_bad := exists (select 1 from jsonb_array_elements(v_lines) l
                    where (v_container = 'loose' or l ->> 'per' = 'cookie')
                      and exists (select 1 from public.packaging_rules r
                                   where r.item_id = l ->> 'item_id' and (r.per = 'cookie' or r.container = 'loose')
                                     and ((v_container = 'order' and r.container in ('box', 'loose'))
                                          or (v_container in ('box', 'loose') and r.container = 'order'))));
  if v_bad then -- rule:packrule-double-order
    raise exception 'that item is already taken per cookie by the order rule or by a box or loose rule' using errcode = '22023';
  end if;

  delete from public.packaging_rules r where r.container = v_container and r.box_size is not distinct from v_size;
  insert into public.packaging_rules (container, box_size, item_id, qty, per, position, updated_by, updated_at)
  select v_container, v_size, l.value ->> 'item_id', (l.value ->> 'qty')::numeric, l.value ->> 'per', l.ord::integer, auth.uid(), v_at
    from jsonb_array_elements(v_lines) with ordinality l(value, ord);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'packaging.rule_saved', 'packaging_rules', v_container || coalesce(':' || v_size::text, ''),
    jsonb_build_object('container', v_container, 'box_size', v_size, 'lines', v_lines));
  return jsonb_build_object('container', v_container, 'box_size', v_size, 'lines', jsonb_array_length(v_lines));
end;
$$;
revoke execute on function public.write_packaging_rule(jsonb) from public, anon, authenticated, service_role;

/** Owner only. Replaces one container's packaging lines whole; the body is write_packaging_rule's. */
create or replace function public.save_packaging_rule(p_rule jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the packaging rules' using errcode = '42501';
  end if;
  return public.write_packaging_rule(p_rule);
end;
$$;
revoke execute on function public.save_packaging_rule(jsonb) from public, anon, authenticated;
grant execute on function public.save_packaging_rule(jsonb) to authenticated;

/** Owner only. The rules by container (boxes by size, then loose, order, bazaar sale), each with its lines in position order. */
create or replace function public.get_packaging_rules()
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
    raise exception 'only the owner may read the packaging rules' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('container', g.container, 'box_size', g.box_size, 'lines', g.lines)
                            order by g.ord, g.box_size nulls first), '[]'::jsonb)
    into v_out
    from (select r.container, r.box_size,
                 case r.container when 'box' then 1 when 'loose' then 2 when 'order' then 3 else 4 end as ord,
                 jsonb_agg(jsonb_build_object('item_id', r.item_id, 'name', i.name, 'unit', i.unit, 'qty', r.qty, 'per', r.per,
                                              'position', r.position) order by r.position) as lines
            from public.packaging_rules r join public.inventory_items i on i.id = r.item_id
           group by r.container, r.box_size) g;
  return v_out;
end;
$$;
revoke execute on function public.get_packaging_rules() from public, anon, authenticated;
grant execute on function public.get_packaging_rules() to authenticated;

/**
 * For the operator: the same rule as save_packaging_rule, with each item named instead of numbered. The body is one rule, or a list of
 * them (the upgrade step enters every container in one call, all or nothing), each exactly container, box_size and lines of name, qty
 * and per. A name matches an item ignoring case and surrounding spaces and must match exactly one (active or not, as the identity links
 * do); every name that matches none or several is refused and listed together, and nothing is written. A list names each container
 * once. No API role holds EXECUTE, service_role included: the operator runs it as postgres.
 */
create or replace function public.apply_packaging_rule(p_rule jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bad      boolean;
  v_rules    jsonb;
  v_rule     jsonb;
  v_missing  text[];
  v_resolved jsonb;
  v_out      jsonb := '[]'::jsonb;
begin
  if p_rule is null or jsonb_typeof(p_rule) not in ('object', 'array') then
    raise exception 'a packaging rule must be an object, or a list of them' using errcode = '22023';
  end if;
  v_rules := case when jsonb_typeof(p_rule) = 'array' then p_rule else jsonb_build_array(p_rule) end;
  v_bad := jsonb_array_length(v_rules) not between 1 and 30
           or exists (select 1 from jsonb_array_elements(v_rules) e
                       where case when jsonb_typeof(e) <> 'object' then true
                                  else (select array_agg(k order by k) from jsonb_object_keys(e) k) is distinct from array['box_size', 'container', 'lines']
                                       or jsonb_typeof(e -> 'lines') is distinct from 'array'
                                       or exists (select 1 from jsonb_array_elements(e -> 'lines') l
                                                   where case when jsonb_typeof(l) <> 'object' then true
                                                              else (select array_agg(k order by k) from jsonb_object_keys(l) k) is distinct from array['name', 'per', 'qty']
                                                                   or jsonb_typeof(l -> 'name') is distinct from 'string' end) end);
  if v_bad then -- rule:packrule-name-keys
    raise exception 'an applied rule carries exactly container, box_size and lines of name, qty and per' using errcode = '22023';
  end if;
  v_bad := (select count(*) <> count(distinct (e ->> 'container') || ':' || coalesce(e ->> 'box_size', '')) from jsonb_array_elements(v_rules) e);
  if v_bad then -- rule:packrule-apply-dup
    raise exception 'a list of rules names each container once' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  select array_agg(distinct l ->> 'name') into v_missing
    from jsonb_array_elements(v_rules) e cross join lateral jsonb_array_elements(e -> 'lines') l
   where (select count(*) from public.inventory_items i where lower(btrim(i.name)) = lower(btrim(l ->> 'name'))) <> 1;
  if v_missing is not null then -- rule:packrule-name
    raise exception 'each name must be exactly one stock item; these are not: %', array_to_string(v_missing, ', ') using errcode = '22023';
  end if;
  for v_rule in select e from jsonb_array_elements(v_rules) e loop
    select jsonb_agg(jsonb_build_object(
             'item_id', (select min(i.id) from public.inventory_items i where lower(btrim(i.name)) = lower(btrim(l.value ->> 'name'))),
             'qty', l.value -> 'qty', 'per', l.value -> 'per') order by l.ord)
      into v_resolved
      from jsonb_array_elements(v_rule -> 'lines') with ordinality l(value, ord);
    v_out := v_out || public.write_packaging_rule(jsonb_build_object('container', v_rule -> 'container', 'box_size', v_rule -> 'box_size',
                                                                     'lines', coalesce(v_resolved, '[]'::jsonb)));
  end loop;
  return v_out;
end;
$$;
revoke execute on function public.apply_packaging_rule(jsonb) from public, anon, authenticated, service_role;

/**
 * Packing an order takes its packaging off stock, once per order: the record id is derived from the order, so packing the same
 * order again (a reopened or corrected order) answers the first record and takes nothing more. B3b: it goes by the packaging rules.
 * Each box size on the order takes its own rule (per box, or per cookie in the box); the cookies not in a box are loose and take the
 * loose rule; the order rule is taken once; and each flavour's recipe packaging lines are taken per cookie of it. The same item from
 * several of these is one movement. A container that has no rule takes nothing and is a shortfall with why "no packaging rule"
 * (the shortfall keeps {name, by, unit} and adds why for those, as record_production does). Returns the record's id, whether it was
 * already recorded and the shortfall.
 */
create or replace function public.record_pack(p_order text, p_drop integer)
returns table (record_id uuid, duplicate boolean, shortfall jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_id     uuid;
  v_count  integer;
  v_boxed  integer;
  v_loose  integer;
  v_seen   public.production_records%rowtype;
  v_at     timestamptz := now();
  v_plan   jsonb;
  v_ids    text[];
  v_p      record;
  v_n      integer := 0;
  v_left   numeric;
  v_short  jsonb := '[]'::jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record packing' using errcode = '42501';
  end if;
  if p_order is null or length(p_order) not between 1 and 64 or p_drop is null or p_drop not between 0 and 100000 then
    raise exception 'an order id and a drop are required' using errcode = '22023';
  end if;
  v_id := md5('pack:' || p_order)::uuid;
  perform pg_advisory_xact_lock(hashtextextended('production_record:' || v_id::text, 0));
  select * into v_seen from public.production_records r where r.id = v_id;
  if found then
    return query select v_id, true, v_seen.short;
    return;
  end if;
  if not exists (select 1 from public.orders o where o.id = p_order) then -- rule:pack-order-missing
    raise exception 'no such order' using errcode = 'P0002';
  end if;
  select coalesce(sum(i.qty), 0)::integer into v_count from public.order_items i where i.order_id = p_order;
  if v_count < 1 then -- rule:pack-empty
    raise exception 'that order has no cookies to pack' using errcode = '22023';
  end if;
  select coalesce(sum(b.size * b.qty), 0)::integer into v_boxed from public.order_boxes b where b.order_id = p_order;
  v_loose := greatest(v_count - v_boxed, 0);

  -- The catalogue's lock first, so the rules read here are the ones in force for the whole pack, then the items by id.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  select jsonb_agg(jsonb_build_object('item_id', a.item_id, 'amount', a.amount) order by a.first_at), array_agg(a.item_id)
    into v_plan, v_ids
    from (select n.item_id, sum(n.amount) as amount, min(n.ord) as first_at
            from (select row_number() over (order by x.src, x.grp, x.pos, x.item_id) as ord, x.item_id, x.amount
                    from (select 1 as src, bx.size as grp, r.position as pos, r.item_id,
                                 r.qty * case r.per when 'cookie' then bx.size * bx.n else bx.n end as amount
                            from (select b.size, sum(b.qty)::integer as n from public.order_boxes b where b.order_id = p_order group by b.size) bx
                            join public.packaging_rules r on r.container = 'box' and r.box_size = bx.size
                          union all
                          select 2, 0, r.position, r.item_id, r.qty * v_loose
                            from public.packaging_rules r where r.container = 'loose' and v_loose > 0
                          union all
                          select 3, 0, r.position, r.item_id, r.qty * case r.per when 'cookie' then v_count else 1 end
                            from public.packaging_rules r where r.container = 'order'
                          union all
                          select 4, 0, l.position, l.item_id, l.qty * oi.q
                            from (select i.product_id, sum(i.qty) as q from public.order_items i where i.order_id = p_order group by i.product_id) oi
                            join public.recipe_ingredients l on l.product_id = oi.product_id and l.kind = 'packaging'
                            join public.inventory_items it on it.id = l.item_id and it.unit = l.unit) x) n
           group by n.item_id) a;
  perform public.lock_stock_item_ids(coalesce(v_ids, array[]::text[]));

  insert into public.production_records (id, kind, ref, qty, drop_no, at, payload_hash, created_by)
  values (v_id, 'pack', p_order, v_count, p_drop, v_at,
          encode(sha256(convert_to('pack:' || p_order, 'UTF8')), 'hex'), auth.uid());
  for v_p in select x ->> 'item_id' as item_id, (x ->> 'amount')::numeric as amount, it.name, it.unit
               from jsonb_array_elements(coalesce(v_plan, '[]'::jsonb)) with ordinality t(x, ord)
               join public.inventory_items it on it.id = x ->> 'item_id'
              order by t.ord loop
    v_n := v_n + 1;
    if v_p.amount > 0 then
      v_left := public.use_stock_item(v_id, v_n, v_p.item_id, v_p.amount, 'Packed order ' || p_order, v_at, false);
      if v_left > 0 then -- rule:pack-shortfall
        v_short := v_short || jsonb_build_object('name', v_p.name, 'by', round(v_left, 1), 'unit', v_p.unit);
      end if;
    end if;
  end loop;

  -- What could not be packed for want of a rule, or of a stock item on a recipe's packaging line, is said, never left as a zero.
  for v_p in select bx.size, bx.n
               from (select b.size, sum(b.qty)::integer as n from public.order_boxes b where b.order_id = p_order group by b.size) bx
              where not exists (select 1 from public.packaging_rules r where r.container = 'box' and r.box_size = bx.size)
              order by bx.size loop
    v_short := v_short || jsonb_build_object('name', 'Box of ' || v_p.size, 'by', v_p.n, 'unit', 'box', 'why', 'no packaging rule');
  end loop;
  if v_loose > 0 and not exists (select 1 from public.packaging_rules r where r.container = 'loose') then -- rule:pack-no-loose-rule
    v_short := v_short || jsonb_build_object('name', 'Loose cookies', 'by', v_loose, 'unit', 'cookie', 'why', 'no packaging rule');
  end if;
  if not exists (select 1 from public.packaging_rules r where r.container = 'order') then -- rule:pack-no-order-rule
    v_short := v_short || jsonb_build_object('name', 'Order', 'by', 1, 'unit', 'order', 'why', 'no packaging rule');
  end if;
  for v_p in select l.item_name as name, l.unit, round(sum(l.qty * oi.q), 1) as amount,
                    case when l.item_id is null then 'not a stock item' else 'unit differs' end as why
               from (select i.product_id, sum(i.qty) as q from public.order_items i where i.order_id = p_order group by i.product_id) oi
               join public.recipe_ingredients l on l.product_id = oi.product_id and l.kind = 'packaging'
               left join public.inventory_items it on it.id = l.item_id
              where it.id is null or it.unit <> l.unit
              group by l.item_name, l.unit, l.item_id
              order by min(l.position), l.item_name loop
    v_short := v_short || jsonb_build_object('name', v_p.name, 'by', v_p.amount, 'unit', v_p.unit, 'why', v_p.why);
  end loop;
  update public.production_records r set short = v_short where r.id = v_id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'production.pack', 'production_records', v_id::text,
    jsonb_build_object('order_id', p_order, 'cookies', v_count, 'short', v_short));
  return query select v_id, false, v_short;
end;
$$;
revoke execute on function public.record_pack(text, integer) from public, anon, authenticated;
grant execute on function public.record_pack(text, integer) to authenticated;

/**
 * Internal: a bazaar sale's packaging, on the sale's own id: the bazaar-sale rule in position order (so the first line is movement 1,
 * the second movement 2 and so on, the ids the bazaar has always written), then each flavour's recipe packaging lines for the cookies in
 * this sale (event_sale_items, by the sale's id). With no bazaar-sale rule it takes no container packaging and keeps a shortfall with
 * why "no packaging rule". record_event_sale calls this by name and is not redefined.
 */
create or replace function public.record_sale_packaging(p_sale uuid, p_cookies integer, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_plan  jsonb;
  v_ids   text[];
  v_p     record;
  v_n     integer := 0;
  v_left  numeric;
  v_short jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  select jsonb_agg(jsonb_build_object('item_id', a.item_id, 'amount', a.amount) order by a.first_at), array_agg(a.item_id)
    into v_plan, v_ids
    from (select n.item_id, sum(n.amount) as amount, min(n.ord) as first_at
            from (select row_number() over (order by x.src, x.pos, x.item_id) as ord, x.item_id, x.amount
                    from (select 1 as src, r.position as pos, r.item_id,
                                 r.qty * case r.per when 'cookie' then p_cookies else 1 end as amount
                            from public.packaging_rules r where r.container = 'bazaar_sale'
                          union all
                          select 2, l.position, l.item_id, l.qty * si.q
                            from (select s.product_id, sum(s.qty) as q from public.event_sale_items s where s.sale_id = p_sale group by s.product_id) si
                            join public.recipe_ingredients l on l.product_id = si.product_id and l.kind = 'packaging'
                            join public.inventory_items it on it.id = l.item_id and it.unit = l.unit) x) n
           group by n.item_id) a;
  perform public.lock_stock_item_ids(coalesce(v_ids, array[]::text[]));
  insert into public.production_records (id, kind, ref, qty, at, payload_hash, created_by)
  values (p_sale, 'sale', p_sale::text, p_cookies, p_at, encode(sha256(convert_to('sale:' || p_sale::text, 'UTF8')), 'hex'), auth.uid())
  on conflict (id) do nothing;
  if not found then
    return;
  end if;
  for v_p in select x ->> 'item_id' as item_id, (x ->> 'amount')::numeric as amount, it.name, it.unit
               from jsonb_array_elements(coalesce(v_plan, '[]'::jsonb)) with ordinality t(x, ord)
               join public.inventory_items it on it.id = x ->> 'item_id'
              order by t.ord loop
    v_n := v_n + 1;
    if v_p.amount > 0 then
      v_left := public.use_stock_item(p_sale, v_n, v_p.item_id, v_p.amount, 'Bazaar sale', p_at, false);
      if v_left > 0 then
        v_short := v_short || jsonb_build_object('name', v_p.name, 'by', round(v_left, 1), 'unit', v_p.unit);
      end if;
    end if;
  end loop;
  if not exists (select 1 from public.packaging_rules r where r.container = 'bazaar_sale') then -- rule:sale-no-rule
    v_short := v_short || jsonb_build_object('name', 'Bazaar sale', 'by', 1, 'unit', 'sale', 'why', 'no packaging rule');
  end if;
  for v_p in select l.item_name as name, l.unit, round(sum(l.qty * si.q), 1) as amount,
                    case when l.item_id is null then 'not a stock item' else 'unit differs' end as why
               from (select s.product_id, sum(s.qty) as q from public.event_sale_items s where s.sale_id = p_sale group by s.product_id) si
               join public.recipe_ingredients l on l.product_id = si.product_id and l.kind = 'packaging'
               left join public.inventory_items it on it.id = l.item_id
              where it.id is null or it.unit <> l.unit
              group by l.item_name, l.unit, l.item_id
              order by min(l.position), l.item_name loop
    v_short := v_short || jsonb_build_object('name', v_p.name, 'by', v_p.amount, 'unit', v_p.unit, 'why', v_p.why);
  end loop;
  update public.production_records r set short = v_short where r.id = p_sale;
end;
$$;
revoke execute on function public.record_sale_packaging(uuid, integer, timestamptz) from public, anon, authenticated, service_role;

-- record_production, save_recipe, get_recipes and get_recipe_costs follow, each as it was with the marked B3b changes.

-- record_production, as it was (20260101005600) with a bake and a dough mix taking only the ingredient lines (B3b): a packaging line is per
-- cookie and is taken when the cookie is packed or sold. An adjustment cannot name a packaging line.
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
  v_ids     text[];
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
                    where not exists (select 1 from public.recipe_ingredients i where i.product_id = v_pid and i.kind = 'ingredient' and i.item_name = k));
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
  for v_line in select i.item_name as name, i.qty as qty, i.unit as unit, i.item_id as item_id, it.unit as item_unit
                  from public.recipe_ingredients i left join public.inventory_items it on it.id = i.item_id
                 where i.product_id = v_pid and i.kind = 'ingredient' order by i.position, i.id loop
    if v_kind = 'dough' then
      v_raw := v_line.qty * v_mixed / v_recipe.yield_count;
    else
      v_base := round(v_line.qty * v_mixed / v_recipe.yield_count, 1);
      v_step := case v_line.unit when 'pcs' then 1 when 'ml' then 5 else 10 end;
      v_raw := greatest(0, v_base + coalesce((v_adj ->> v_line.name)::numeric, 0) * v_step);
    end if;
    v_amount := case when v_line.unit = 'pcs' then ceil(v_raw) else round(v_raw, 1) end;
    if v_amount > 0 then
      v_plan := v_plan || jsonb_build_object('name', v_line.name, 'unit', v_line.unit, 'amount', v_amount,
        'item_id', case when v_line.item_unit = v_line.unit then v_line.item_id end,
        'why', case when v_line.item_id is null then 'not a stock item' when v_line.item_unit <> v_line.unit then 'unit differs' end);
    end if;
  end loop;
  select array_agg(x ->> 'item_id') into v_ids from jsonb_array_elements(v_plan) x where x ->> 'item_id' is not null;
  perform public.lock_stock_item_ids(coalesce(v_ids, array[]::text[]));

  insert into public.production_records (id, kind, product_id, qty, target, rejects, dough_used, recipe_version, drop_no, at,
                                         payload_hash, created_by)
  values (v_id, v_kind, v_pid, case when v_kind = 'batch' then v_qty::integer - v_rej::integer else v_qty::integer end,
          v_target::integer, v_rej::integer, v_used, v_ver::integer, v_drop::integer, v_at, v_hash, auth.uid());
  v_reason := (case v_kind when 'dough' then 'Mixed dough: ' else 'Baked: ' end) || v_flavour || ', Version ' || v_ver::integer;
  for v_p in select x from jsonb_array_elements(v_plan) x loop
    v_n := v_n + 1;
    if v_p ->> 'item_id' is not null then
      v_left := public.use_stock_item(v_id, v_n, v_p ->> 'item_id', (v_p ->> 'amount')::numeric, v_reason, v_at, true);
    else
      v_left := (v_p ->> 'amount')::numeric;
    end if;
    if v_left > 0 then -- rule:prod-shortfall
      v_short := v_short || (jsonb_build_object('name', v_p ->> 'name', 'by', round(v_left, 1), 'unit', v_p ->> 'unit')
                             || case when v_p ->> 'why' is not null then jsonb_build_object('why', v_p ->> 'why') else '{}'::jsonb end);
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

create or replace function public.get_recipes()
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
    raise exception 'only the owner may read the recipes' using errcode = '42501';
  end if;
  -- B3a: each current line carries its item_id (B3b: and its kind); recipe_versions now holds the current version too, so the history leaves it out.
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', r.product_id, 'yield', r.yield_count, 'version', r.version, 'updated_at', r.updated_at,
      'lines', coalesce((select jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', i.qty, 'unit', i.unit, 'item_id', i.item_id, 'kind', i.kind)
                                          order by i.position, i.id)
                           from public.recipe_ingredients i where i.product_id = r.product_id), '[]'::jsonb),
      'history', coalesce((select jsonb_agg(jsonb_build_object('version', h.version, 'yield', h.yield_count, 'lines', h.lines)
                                            order by h.version)
                             from public.recipe_versions h where h.product_id = r.product_id and h.version <> r.version), '[]'::jsonb)
    ) order by r.product_id), '[]'::jsonb)
    into v_out
    from public.recipes r;
  return v_out;
end;
$$;
revoke execute on function public.get_recipes() from public, anon, authenticated;
grant execute on function public.get_recipes() to authenticated;

/**
 * Creates (no stamp) or changes (with the stamp the read returned) one recipe. The body is exactly: product_id, yield,
 * lines (each exactly name, qty, unit, or kind, name, qty, unit). Returns the recipe's version and stamp after the save. B3a: every
 * line names exactly one stock item, whose id is stored with it, and every version, the current one included, has its row in
 * recipe_versions. B3b: a line is an ingredient (a quantity per batch, the default) or packaging (a quantity per cookie, taken when
 * the cookie is packed or sold and never at a bake); a packaging line's item may not also be taken per cookie by a packaging rule.
 */
create or replace function public.save_recipe(
  p_recipe jsonb,
  p_expected_updated_at timestamptz
)
returns table (product_id text, version integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys    text[];
  v_product text;
  v_yield   numeric;
  v_lines   jsonb;
  v_line    jsonb;
  v_norm    jsonb;
  v_cur     jsonb;
  v_row     public.recipes%rowtype;
  v_at      timestamptz;
  v_bad     boolean;
  v_qty     numeric;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change the recipes' using errcode = '42501';
  end if;
  if p_recipe is null or jsonb_typeof(p_recipe) <> 'object' then
    raise exception 'a recipe must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_recipe) k;
  if v_keys is distinct from array['lines', 'product_id', 'yield'] then -- rule:recipe-keys
    raise exception 'a recipe carries exactly its own keys' using errcode = '22023';
  end if;
  if jsonb_typeof(p_recipe -> 'product_id') <> 'string' or jsonb_typeof(p_recipe -> 'yield') <> 'number'
     or jsonb_typeof(p_recipe -> 'lines') <> 'array' then
    raise exception 'a recipe field has the wrong type' using errcode = '22023';
  end if;
  v_product := p_recipe ->> 'product_id';
  v_yield := (p_recipe ->> 'yield')::numeric;
  v_lines := p_recipe -> 'lines';
  if v_yield <> trunc(v_yield) or v_yield not between 1 and 10000 then -- rule:recipe-yield
    raise exception 'the yield is a whole number of cookies from 1 to 10000' using errcode = '22023';
  end if;
  if jsonb_array_length(v_lines) > 80 then -- rule:recipe-size
    raise exception 'a recipe has at most 80 lines' using errcode = '22023';
  end if;
  for v_line in select l from jsonb_array_elements(v_lines) l loop
    v_bad := jsonb_typeof(v_line) <> 'object'
             or ((select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['name', 'qty', 'unit']
                 and (select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['kind', 'name', 'qty', 'unit']);
    if v_bad then -- rule:line-keys
      raise exception 'a line carries exactly name, qty and unit' using errcode = '22023';
    end if;
    -- B3b: a line is an ingredient (the default) or packaging; the old key set still means an ingredient.
    v_bad := v_line ? 'kind' and (jsonb_typeof(v_line -> 'kind') <> 'string' or (v_line ->> 'kind') not in ('ingredient', 'packaging'));
    if v_bad then -- rule:recipe-kind
      raise exception 'the kind of a line is ingredient or packaging' using errcode = '22023';
    end if;
    if jsonb_typeof(v_line -> 'name') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number'
       or jsonb_typeof(v_line -> 'unit') <> 'string' then
      raise exception 'a line field has the wrong type' using errcode = '22023';
    end if;
    v_bad := length(btrim(v_line ->> 'name')) not between 1 and 80 or (v_line ->> 'name') ~ '[[:cntrl:]]';
    if v_bad then -- rule:line-name
      raise exception 'an ingredient name is 1 to 80 characters' using errcode = '22023';
    end if;
    v_qty := (v_line ->> 'qty')::numeric;
    v_bad := v_qty <> round(v_qty, 3) or v_qty not between 0.001 and 999999;
    if v_bad then -- rule:line-qty
      raise exception 'a quantity is above 0 and at most 999,999 with at most 3 decimals' using errcode = '22023';
    end if;
    if (v_line ->> 'unit') not in ('g', 'ml', 'pcs') then -- rule:line-unit
      raise exception 'the unit is g, ml or pcs' using errcode = '22023';
    end if;
  end loop;
  -- The same ingredient twice would be costed and deducted twice; the names are compared trimmed, case ignored (B3a: the item
  -- is found that way too, so Flour and flour would be one item).
  select jsonb_agg(jsonb_build_object('name', btrim(l ->> 'name'), 'qty', round((l ->> 'qty')::numeric, 3), 'unit', l ->> 'unit')
                   || case when l ->> 'kind' = 'packaging' then jsonb_build_object('kind', 'packaging') else '{}'::jsonb end
                   order by ord)
    into v_norm from jsonb_array_elements(v_lines) with ordinality t(l, ord);
  v_norm := coalesce(v_norm, '[]'::jsonb);
  v_bad := (select count(*) <> count(distinct lower(n)) from (select x ->> 'name' as n from jsonb_array_elements(v_norm) x) q);
  if v_bad then -- rule:line-duplicate
    raise exception 'an ingredient is listed twice' using errcode = '22023';
  end if;
  -- The catalogue's lock, so an item's unit cannot change between this check and the save.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  v_bad := exists (select 1 from jsonb_array_elements(v_norm) x
                    join public.inventory_items i on lower(i.name) = lower(x ->> 'name') and i.unit <> x ->> 'unit');
  if v_bad then -- rule:line-unit-match
    raise exception 'an ingredient in stock is measured in the unit it is stocked in' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('recipe:' || v_product, 0));
  if not exists (select 1 from public.products p where p.id = v_product) then -- rule:recipe-product
    raise exception 'no such flavour' using errcode = '22023';
  end if;
  select * into v_row from public.recipes r where r.product_id = v_product;
  select coalesce(jsonb_agg(jsonb_build_object('name', i.item_name, 'qty', round(i.qty, 3), 'unit', i.unit)
                            || case when i.kind = 'packaging' then jsonb_build_object('kind', 'packaging') else '{}'::jsonb end
                            order by i.position, i.id), '[]'::jsonb)
    into v_cur from public.recipe_ingredients i where i.product_id = v_product;
  -- Nothing new (a lost reply's retry, or a save with no change): answered, and no version is made. This comes before the item
  -- rule so a retry is still answered for a recipe saved before lines had to be stock items.
  if v_row.product_id is not null and v_row.yield_count = v_yield::integer and v_cur = v_norm then -- rule:recipe-noop
    return query select v_row.product_id, v_row.version, v_row.updated_at;
    return;
  end if;
  -- B3a: every line is a stock item, found by name (surrounding spaces and case ignored, as the preview does) and kept by id.
  v_bad := exists (select 1 from jsonb_array_elements(v_norm) x
                    where (select count(*) from public.inventory_items i where lower(btrim(i.name)) = lower(x ->> 'name')) <> 1);
  if v_bad then -- rule:line-item-unknown
    raise exception 'an ingredient must be a stock item: add it to stock first' using errcode = '22023';
  end if;
  -- B3b: the double-take guard. A packaging line is taken per cookie, so its item may not also be taken per cookie by a container
  -- (a loose cookie counts as per cookie).
  v_bad := exists (select 1 from jsonb_array_elements(v_norm) x
                    join public.packaging_rules r on r.item_id = (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x ->> 'name'))
                   where x ->> 'kind' = 'packaging' and (r.per = 'cookie' or r.container = 'loose'));
  if v_bad then -- rule:recipe-pack-double
    raise exception 'that item is already taken per cookie by a packaging rule: a cookie would take it twice' using errcode = '22023';
  end if;
  if v_row.product_id is null then
    if p_expected_updated_at is not null then -- rule:recipe-create-stamp
      raise exception 'that recipe does not exist' using errcode = 'P0002';
    end if;
    insert into public.recipes (product_id, yield_count) values (v_product, v_yield::integer)
      returning public.recipes.updated_at into v_at;
    insert into public.recipe_ingredients (product_id, item_name, qty, unit, position, item_id, kind)
      select v_product, x.value ->> 'name', (x.value ->> 'qty')::numeric, x.value ->> 'unit', (x.ord - 1)::integer,
             (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x.value ->> 'name')),
             coalesce(x.value ->> 'kind', 'ingredient')
        from jsonb_array_elements(v_norm) with ordinality x(value, ord);
    insert into public.recipe_versions (product_id, version, yield_count, lines)
      values (v_product, 1, v_yield::integer, v_norm); -- the first version has its row from the start
    return query select v_product, 1, v_at;
    return;
  end if;
  if p_expected_updated_at is null then
    raise exception 'that recipe already exists with other values' using errcode = 'P0002';
  end if;
  if date_trunc('milliseconds', v_row.updated_at) is distinct from date_trunc('milliseconds', p_expected_updated_at) then -- rule:recipe-stale
    raise exception 'the recipe changed since it was read' using errcode = 'P0002';
  end if;
  insert into public.recipe_versions (product_id, version, yield_count, lines)
    values (v_product, v_row.version, v_row.yield_count, v_cur)
    on conflict (product_id, version) do nothing; -- the version being replaced is kept (it normally has its row already)
  delete from public.recipe_ingredients i where i.product_id = v_product;
  insert into public.recipe_ingredients (product_id, item_name, qty, unit, position, item_id, kind)
    select v_product, x.value ->> 'name', (x.value ->> 'qty')::numeric, x.value ->> 'unit', (x.ord - 1)::integer,
           (select i.id from public.inventory_items i where lower(btrim(i.name)) = lower(x.value ->> 'name')),
           coalesce(x.value ->> 'kind', 'ingredient')
      from jsonb_array_elements(v_norm) with ordinality x(value, ord);
  update public.recipes as r set yield_count = v_yield::integer, version = r.version + 1
    where r.product_id = v_product
    returning r.updated_at into v_at;
  insert into public.recipe_versions (product_id, version, yield_count, lines)
    values (v_product, v_row.version + 1, v_yield::integer, v_norm); -- and the new one has its row
  return query select v_product, v_row.version + 1, v_at;
end;
$$;
revoke execute on function public.save_recipe(jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.save_recipe(jsonb, timestamptz) to authenticated;

/**
 * What every recipe costs per batch and per cookie, line by line. A line is costed when it names a stock item measured in the line's
 * unit and that item has a cost; a line that is not (why: not a stock item, unit differs, no cost) is listed in `missing` and is not in
 * the totals. B3b: an ingredient line is per batch and a packaging line is per cookie. batch_cents is the costed ingredients (null when
 * none has a cost, never 0); ingredient_cents_per_cookie is that over the yield; packaging_cents_per_cookie is the costed packaging lines
 * (0 when the recipe has no packaging lines, null when it has some and none has a cost); per_cookie_cents is the ingredients over the
 * yield plus the packaging, null when no ingredient has a cost (a packaging figure alone is not a cookie's cost). `complete` is true when there is at least one ingredient line and
 * none, of either kind, is missing. Unit costs are rounded to 6 decimals, amounts to 4. Keys are only added to what B3a returned.
 */
create or replace function public.get_recipe_costs()
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
    raise exception 'only the owner may read recipe costs' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', r.product_id, 'version', r.version, 'yield', r.yield_count,
      'batch_cents', round(t.batch, 4),
      'ingredient_cents_per_cookie', round(t.batch / r.yield_count, 4),
      'packaging_cents_per_cookie', case when t.pack_n = 0 then 0 else round(t.pack, 4) end,
      'per_cookie_cents', round(t.batch / r.yield_count + coalesce(t.pack, 0), 4),
      'complete', t.ing_n > 0 and t.miss = 0, 'missing', t.missing, 'lines', t.lines) order by r.product_id), '[]'::jsonb)
    into v_out
    from public.recipes r
    cross join lateral (
      select count(*) filter (where l.kind = 'ingredient') as ing_n, count(*) filter (where l.kind = 'packaging') as pack_n,
             count(*) filter (where l.why is not null) as miss,
             sum(l.cents) filter (where l.kind = 'ingredient') as batch, sum(l.cents) filter (where l.kind = 'packaging') as pack,
             coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'why', l.why) order by l.position, l.id) filter (where l.why is not null), '[]'::jsonb) as missing,
             coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'kind', l.kind, 'item_id', l.item_id, 'qty', l.qty, 'unit', l.unit,
                                                   'unit_cost', round(l.uc, 6), 'source', l.src, 'cents', round(l.cents, 4))
                                order by l.position, l.id), '[]'::jsonb) as lines
        from (select i.id, i.position, i.kind, i.item_name as name, i.item_id, i.qty, i.unit, c.unit_cost as uc, c.source as src,
                     i.qty * c.unit_cost as cents,
                     case when i.item_id is null then 'not a stock item'
                          when it.unit <> i.unit then 'unit differs'
                          when c.unit_cost is null then 'no cost' end as why
                from public.recipe_ingredients i
                left join public.inventory_items it on it.id = i.item_id
                left join lateral public.item_unit_cost(i.item_id) c on it.id is not null and it.unit = i.unit
               where i.product_id = r.product_id) l
    ) t;
  return v_out;
end;
$$;
revoke execute on function public.get_recipe_costs() from public, anon, authenticated;
grant execute on function public.get_recipe_costs() to authenticated;
