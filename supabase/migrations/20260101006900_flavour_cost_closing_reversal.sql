-- U6 (Bazaar v2, docs/state/bazaar-v2.md, 15 October 2026): migration 70. Costs, closing rules and the reversal of a test event.
--
--   A1  finalise_bazaar takes a final split (p_final, default null) for the cookies the latest started day set aside to carry over that no
--       later day took (the event ended early): per flavour exactly { to_shop, written_off }, together the stranded quantity, for exactly the
--       stranded flavours. They move on that day's line from carry_next_qty to to_shop_qty and written_off_qty, so every figure that reads the
--       line (the count, the cost, the shop batch) follows without a second copy of the rule. bazaar_summary lists them in the new top-level key
--       `stranded` ([{product_id, name, day_id, qty}], empty when none): the summary hash changes, and no key of a day does, so a closed day's
--       stored review is not read as changed. The split is stored (scheduled_events.final_split) and a repeat of the finalise with another
--       split is refused (23505). The 4-argument finalise_bazaar is dropped (PostgREST cannot choose between overloads): a build older than
--       this migration cannot finalise against it, and this migration and its build ship together, as 69 did.
--   A4  the drawer difference is no longer a sale: a short drawer stays a cost and an over drawer is an adjustment of the same category,
--       'Cash variance'. get_books reads an adjustment as a negative expense, so an over no longer counts as revenue. close_event (the legacy
--       single-day close) still books an over as a sale in 'Bazaar'; that is a decision for the day it is retired, not changed here.
--   A7  finalise_bazaar writes the bazaar-sale packaging record only when a 'bazaar_sale' packaging rule exists; with none it writes nothing
--       and no longer lists "no packaging rule" as a shortfall. Recipes already carry the pouch and sticker per cookie.
--   A6  reverse_bazaar_test(p_booking, p_confirm_name): owner only. For a finalised booking it appends, never deletes: one reversing ledger line
--       per line the booking wrote (its sales and voids, its rent, fees and till expenses, its drawer lines), the same kind and category, the
--       negated amount and the ORIGINAL date (so a period ends the same whichever day it is read), id md5('reverse:' || original id), which is
--       the link to the original and the guard against a second reversal; and one positive 'adjust' stock movement per 'use' movement the
--       finalise wrote, for the part that was taken (the shortfall never left stock). It marks the booking reversed_at / reversed_by. The
--       sales, the events and the stored summary are left as they were: the summary is the record of what was tested.
--       It refuses, writing nothing: a name other than the booking's (22023), a booking not finalised (55000), a booking that sent cookies
--       to the shop (their batch took baked stock into the shop; 55000), any cost cutover on record (the stock was counted without those
--       cookies; 55000), a count or opening of an item used since the use (55000), and ledger lines that do not add up to the stored summary
--       to the centavo: its revenue, its fees, and exactly one drawer line for each day with an over or short (22023). That last check is the
--       "real-looking mismatch": a booking whose books were touched by hand is not reversed by this call. A repeat is answered.
--   C   flavour_costs: her typed cost per cookie for a flavour, in centavos (four decimals), set in the recipe book. save_flavour_cost (owner
--       only) and get_flavour_costs. The order bazaar_summary costs a cookie by: the booking's typed cost, then the flavour's typed cost, then
--       the complete recipe's cost read at the flavour's first day (source 'typed', 'flavour', 'recipe'). A flavour cost is read live until the
--       booking is finalised, and is then in final_summary.
--
-- Redefined whole, each exactly as last defined (20260101006800), with the changes above only: bazaar_summary, get_bazaar, finalise_bazaar.
-- bazaar_line_facts, close_bazaar_day and record_event_sale are not touched. Each new refusal is one `if ... then -- rule:name` line so the
-- SQL role suite can neutralise it. No name or figure of a real event is written in this file.

alter table public.scheduled_events
  add column final_split jsonb,
  add column reversed_at timestamptz,
  add column reversed_by uuid references public.profiles (id) on delete set null,
  add column reversal jsonb;
-- A booking finalised before this migration had no split: it was finalised with none.
update public.scheduled_events set final_split = '{}'::jsonb where finalised_at is not null;

-- ------------------------------------------------------------------ the cost of a flavour

create table public.flavour_costs (
  product_id text primary key references public.products (id),
  cost_cents numeric(14, 4) not null check (cost_cents >= 0),
  typed_by uuid references public.profiles (id) on delete set null,
  typed_at timestamptz not null default now()
);
alter table public.flavour_costs enable row level security;
revoke all on table public.flavour_costs from public, anon, authenticated;

/**
 * Her typed cost per cookie for one flavour (centavos, at most four decimals), or null to take it away. The same value again is answered and
 * writes no second audit row. Returns the flavour and the cost it now has (null when none).
 */
create or replace function public.save_flavour_cost(p_product text, p_cents numeric)
returns table (product_id text, cost_cents numeric)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_old numeric;
  v_bad boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may type a flavour cost' using errcode = '42501';
  end if;
  v_bad := p_product is null or (p_cents is not null and (p_cents < 0 or p_cents > 100000000 or p_cents <> round(p_cents, 4)));
  if v_bad then -- rule:fcost-value
    raise exception 'a cost per cookie is 0 or more, in centavos with at most four decimals' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('flavour_cost:' || p_product, 0));
  if not exists (select 1 from public.products p where p.id = p_product) then -- rule:fcost-flavour
    raise exception 'no such flavour' using errcode = '22023';
  end if;
  select c.cost_cents into v_old from public.flavour_costs c where c.product_id = p_product;
  if v_old is not distinct from p_cents then -- rule:fcost-replay
    return query select p_product, v_old;
    return;
  end if;
  if p_cents is null then
    delete from public.flavour_costs c where c.product_id = p_product;
  else
    insert into public.flavour_costs as c (product_id, cost_cents, typed_by, typed_at)
    values (p_product, p_cents, auth.uid(), now())
    on conflict (product_id) do update set cost_cents = excluded.cost_cents, typed_by = excluded.typed_by, typed_at = excluded.typed_at;
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'flavour.cost_typed', 'flavour_costs', p_product, jsonb_build_object('from_cents', v_old, 'to_cents', p_cents));
  return query select p_product, p_cents;
end;
$$;

/** Every flavour that has a typed cost: [{product_id, cost_cents, typed_at}], by flavour. Owner only. */
create or replace function public.get_flavour_costs()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may read flavour costs' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('product_id', c.product_id, 'cost_cents', c.cost_cents,
                                                       'typed_at', (extract(epoch from c.typed_at) * 1000)::bigint) order by c.product_id), '[]'::jsonb)
            from public.flavour_costs c);
end;
$$;

-- ------------------------------------------------------------------ the summary: the cost order, and the cookies no day took

create or replace function public.bazaar_summary(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s        public.scheduled_events%rowtype;
  v_d        record;
  v_t        record;
  v_r        record;
  v_c        record;
  v_days     jsonb := '[]'::jsonb;
  v_base     jsonb;
  v_lines    jsonb;
  v_count    jsonb;
  v_pay      jsonb;
  v_fee      bigint;
  v_hash     text;
  v_var      bigint;
  v_over     bigint := 0;
  v_short    bigint := 0;
  v_open     boolean := false;
  v_fees     jsonb;
  v_fee_all  bigint;
  v_fee_ev   bigint;
  v_cost     jsonb;
  v_cookie   bigint;
  v_why      text;
  v_profit   bigint;
  v_out      jsonb;
  v_strand   jsonb;
begin
  select * into v_s from public.scheduled_events s where s.id = p_booking;
  if not found then
    return null;
  end if;

  for v_d in select d.id, d.day, d.event_id, d.float_cents, d.closed_review, e.closed_at, e.counted_cents
               from public.bazaar_days d left join public.events e on e.id = d.event_id
              where d.scheduled_id = p_booking order by d.day loop
    select coalesce(jsonb_agg(jsonb_build_object('product_id', f.product_id, 'name', f.name, 'made', f.made, 'carried', f.carried,
             'price_cents', f.price_cents, 'sold', f.sold, 'given', f.given, 'lost', f.lost) order by f.product_id), '[]'::jsonb),
           coalesce(jsonb_agg(jsonb_build_object('product_id', f.product_id, 'left', f.left_qty, 'carry_next', f.carry_next,
             'to_shop', f.to_shop, 'written_off', f.written_off,
             'not_accounted', f.made + f.carried - f.sold - f.given - f.lost - f.left_qty) order by f.product_id), '[]'::jsonb)
      into v_lines, v_count
      from public.bazaar_line_facts(p_booking) f where f.day_id = v_d.id;
    select coalesce(sum(s.total_cents) filter (where s.voided_at is null), 0)::bigint as revenue,
           coalesce(sum(s.gross_cents) filter (where s.voided_at is null), 0)::bigint as gross,
           coalesce(sum(s.discount_cents) filter (where s.voided_at is null and s.total_cents > 0), 0)::bigint as discounts,
           coalesce(sum(s.gross_cents) filter (where s.voided_at is null and s.total_cents = 0), 0)::bigint as freebies,
           coalesce(sum(s.total_cents) filter (where s.voided_at is null and s.pay_method = 'Cash'), 0)::bigint as cash,
           (count(*) filter (where s.voided_at is null))::integer as n,
           (count(*) filter (where s.voided_at is not null))::integer as voided
      into v_t
      from public.event_sales s where s.event_id = v_d.event_id;
    select coalesce(jsonb_object_agg(b.pay_method, b.cents), '{}'::jsonb) into v_pay
      from (select s.pay_method, sum(s.total_cents)::bigint as cents from public.event_sales s
             where s.event_id = v_d.event_id and s.voided_at is null and s.total_cents > 0 group by s.pay_method) b;
    select coalesce(sum(f.amount_cents), 0)::bigint into v_fee from public.bazaar_fees f where f.day_id = v_d.id and f.voided_at is null;
    -- An expense added at the till (add_event_expense) on this day's event is a fee of the day too, so she never closes over a cost she
    -- has not seen. The rows finalise itself writes (the rent, each saved fee) are left out: they are counted already.
    v_fee := v_fee + coalesce((select sum(x.amount_cents) from public.event_expenses x
                                where x.event_id = v_d.event_id and x.client_id <> 'rent:' || p_booking::text
                                  and not exists (select 1 from public.bazaar_fees g
                                                   where g.scheduled_id = p_booking and g.ledger_id = x.ledger_id)), 0)::bigint;
    v_base := jsonb_build_object('id', v_d.id, 'day', v_d.day, 'event_id', v_d.event_id, 'float_cents', v_d.float_cents, 'lines', v_lines,
      'revenue_cents', v_t.revenue, 'gross_cents', v_t.gross, 'discount_cents', v_t.discounts, 'freebie_cents', v_t.freebies,
      'by_pay', v_pay, 'sales', v_t.n, 'voided', v_t.voided, 'cash_sales_cents', v_t.cash,
      'cash_expected_cents', v_d.float_cents + v_t.cash, 'fees_cents', v_fee);
    v_hash := encode(sha256(convert_to(v_base::text, 'UTF8')), 'hex');
    v_var := case when v_d.closed_at is not null and v_d.counted_cents is not null then v_d.counted_cents - (v_d.float_cents + v_t.cash) end;
    v_over := v_over + greatest(coalesce(v_var, 0), 0);
    v_short := v_short + greatest(-coalesce(v_var, 0), 0);
    v_open := v_open or (v_d.event_id is not null and v_d.closed_at is null);
    v_days := v_days || (v_base || jsonb_build_object('hash', v_hash,
      'state', case when v_d.event_id is null then 'planned' when v_d.closed_at is null then 'open' else 'closed' end,
      'count', case when v_d.closed_at is not null then v_count end,
      'closed_at', (extract(epoch from v_d.closed_at) * 1000)::bigint,
      'counted_cents', case when v_d.closed_at is not null then v_d.counted_cents end,
      'over_cents', case when v_var is not null then greatest(v_var, 0) end,
      'short_cents', case when v_var is not null then greatest(-v_var, 0) end,
      'changed_after_close', v_d.closed_at is not null and (v_d.closed_review ->> 'hash') is distinct from v_hash));
  end loop;

  select coalesce(sum(s.total_cents) filter (where s.voided_at is null), 0)::bigint as revenue,
         coalesce(sum(s.gross_cents) filter (where s.voided_at is null), 0)::bigint as gross,
         coalesce(sum(s.discount_cents) filter (where s.voided_at is null and s.total_cents > 0), 0)::bigint as discounts,
         coalesce(sum(s.gross_cents) filter (where s.voided_at is null and s.total_cents = 0), 0)::bigint as freebies,
         (count(*) filter (where s.voided_at is null))::integer as n,
         (count(*) filter (where s.voided_at is not null))::integer as voided
    into v_r
    from public.event_sales s
   where s.event_id in (select d.event_id from public.bazaar_days d where d.scheduled_id = p_booking and d.event_id is not null);
  select coalesce(jsonb_object_agg(b.pay_method, b.cents), '{}'::jsonb) into v_pay
    from (select s.pay_method, sum(s.total_cents)::bigint as cents from public.event_sales s
           where s.event_id in (select d.event_id from public.bazaar_days d where d.scheduled_id = p_booking and d.event_id is not null)
             and s.voided_at is null and s.total_cents > 0 group by s.pay_method) b;

  select coalesce(jsonb_agg(p.j order by p.ord, p.paid_on, p.cid), '[]'::jsonb), coalesce(sum(p.amount), 0)::bigint,
         coalesce(sum(p.amount) filter (where p.day_id is null), 0)::bigint
    into v_fees, v_fee_all, v_fee_ev
    from (select 0 as ord, v_s.starts_on as paid_on, 'rent:' || v_s.id::text as cid, null::uuid as day_id, v_s.rent_cents as amount,
                 jsonb_build_object('client_id', 'rent:' || v_s.id::text, 'label', 'Stall rent', 'category', 'Bazaar rent', 'day_id', null,
                                    'paid_on', v_s.starts_on, 'amount_cents', v_s.rent_cents) as j
           where v_s.rent_cents > 0
          union all
          select 1, f.paid_on, f.client_id, f.day_id, f.amount_cents,
                 jsonb_build_object('client_id', f.client_id, 'label', f.label, 'category', f.category, 'day_id', f.day_id,
                                    'paid_on', f.paid_on, 'amount_cents', f.amount_cents)
            from public.bazaar_fees f where f.scheduled_id = p_booking and f.voided_at is null
          union all
          select 2, c.today, x.client_id, d.id, x.amount_cents,
                 jsonb_build_object('client_id', x.client_id, 'label', x.label, 'category', x.category, 'day_id', d.id,
                                    'paid_on', c.today, 'amount_cents', x.amount_cents, 'at_the_till', true)
            from public.event_expenses x join public.bazaar_days d on d.event_id = x.event_id
            cross join lateral public.business_clock(x.spent_at) c
           where d.scheduled_id = p_booking and x.client_id <> 'rent:' || p_booking::text
             and not exists (select 1 from public.bazaar_fees bf where bf.scheduled_id = p_booking and bf.ledger_id = x.ledger_id)) p;

  select coalesce(jsonb_agg(to_jsonb(z) order by z.product_id), '[]'::jsonb) into v_cost
    from (select y.product_id, y.name, y.unit_cents, y.source, y.made, y.to_shop, y.sold, y.given, y.lost, y.written_off, y.not_accounted,
                 y.uncosted, y.made_cents, y.to_shop_cents, y.sold_cents, y.given_cents, y.lost_cents, y.written_off_cents,
                 y.not_accounted_cents, y.made_cents - y.to_shop_cents as cost_cents,
                 y.made_cents - y.to_shop_cents - y.sold_cents - y.given_cents - y.lost_cents - y.written_off_cents
                   - y.not_accounted_cents as rounding_cents
            from (select x.*,
                         case when x.uncosted then null else coalesce(round(x.made * x.unit_cents), 0)::bigint end as made_cents,
                         case when x.uncosted then null else coalesce(round(x.to_shop * x.unit_cents), 0)::bigint end as to_shop_cents,
                         case when x.uncosted then null else coalesce(round(x.sold * x.unit_cents), 0)::bigint end as sold_cents,
                         case when x.uncosted then null else coalesce(round(x.given * x.unit_cents), 0)::bigint end as given_cents,
                         case when x.uncosted then null else coalesce(round(x.lost * x.unit_cents), 0)::bigint end as lost_cents,
                         case when x.uncosted then null else coalesce(round(x.written_off * x.unit_cents), 0)::bigint end as written_off_cents,
                         case when x.uncosted then null else coalesce(round(x.not_accounted * x.unit_cents), 0)::bigint end as not_accounted_cents
                    from (select w.*, w.unit_cents is null and (w.made > 0 or w.sold + w.given + w.lost > 0) as uncosted
                            from (select f.product_id, f.name, c.cents as unit_cents, c.source,
                                         sum(f.made)::integer as made, sum(coalesce(f.to_shop, 0))::integer as to_shop,
                                         sum(f.sold)::integer as sold, sum(f.given)::integer as given, sum(f.lost)::integer as lost,
                                         sum(coalesce(f.written_off, 0))::integer as written_off,
                                         (sum(f.made) - sum(coalesce(f.to_shop, 0)) - sum(f.sold) - sum(f.given) - sum(f.lost)
                                           - sum(coalesce(f.written_off, 0)))::integer as not_accounted
                                    from public.bazaar_line_facts(p_booking) f
                                    left join lateral (select coalesce(k.typed_cents, fc.cost_cents, k.recipe_cents) as cents,
                                                              case when k.typed_cents is not null then 'typed'
                                                                   when fc.cost_cents is not null then 'flavour'
                                                                   when k.recipe_cents is not null then 'recipe' end as source
                                                         from (select 1) one
                                                         left join public.bazaar_costs k on k.scheduled_id = p_booking and k.product_id = f.product_id
                                                         left join public.flavour_costs fc on fc.product_id = f.product_id) c on true
                                   where f.event_id is not null
                                   group by f.product_id, f.name, c.cents, c.source) w) x) y) z;
  select a.uncosted, a.names, a.made, a.to_shop, a.sold, a.given, a.lost, a.written_off, a.not_accounted,
         case when a.uncosted then null else a.made_cents end as made_cents,
         case when a.uncosted then null else a.to_shop_cents end as to_shop_cents,
         case when a.uncosted then null else a.sold_cents end as sold_cents,
         case when a.uncosted then null else a.given_cents end as given_cents,
         case when a.uncosted then null else a.lost_cents end as lost_cents,
         case when a.uncosted then null else a.written_off_cents end as written_off_cents,
         case when a.uncosted then null else a.not_accounted_cents end as not_accounted_cents,
         case when a.uncosted then null else a.cost_cents end as cost_cents,
         case when a.uncosted then null else a.rounding_cents end as rounding_cents
    into v_c
    from (select coalesce(bool_or((l ->> 'uncosted')::boolean), false) as uncosted,
                 string_agg(l ->> 'name', ', ' order by l ->> 'product_id') filter (where (l ->> 'uncosted')::boolean) as names,
                 coalesce(sum((l ->> 'made')::integer), 0)::integer as made, coalesce(sum((l ->> 'to_shop')::integer), 0)::integer as to_shop,
                 coalesce(sum((l ->> 'sold')::integer), 0)::integer as sold, coalesce(sum((l ->> 'given')::integer), 0)::integer as given,
                 coalesce(sum((l ->> 'lost')::integer), 0)::integer as lost,
                 coalesce(sum((l ->> 'written_off')::integer), 0)::integer as written_off,
                 coalesce(sum((l ->> 'not_accounted')::integer), 0)::integer as not_accounted,
                 coalesce(sum((l ->> 'made_cents')::bigint), 0)::bigint as made_cents,
                 coalesce(sum((l ->> 'to_shop_cents')::bigint), 0)::bigint as to_shop_cents,
                 coalesce(sum((l ->> 'sold_cents')::bigint), 0)::bigint as sold_cents,
                 coalesce(sum((l ->> 'given_cents')::bigint), 0)::bigint as given_cents,
                 coalesce(sum((l ->> 'lost_cents')::bigint), 0)::bigint as lost_cents,
                 coalesce(sum((l ->> 'written_off_cents')::bigint), 0)::bigint as written_off_cents,
                 coalesce(sum((l ->> 'not_accounted_cents')::bigint), 0)::bigint as not_accounted_cents,
                 coalesce(sum((l ->> 'cost_cents')::bigint), 0)::bigint as cost_cents,
                 coalesce(sum((l ->> 'rounding_cents')::bigint), 0)::bigint as rounding_cents
            from jsonb_array_elements(v_cost) l) a;
  v_cookie := v_c.cost_cents;
  v_why := case when v_c.uncosted then 'no cost per cookie for: ' || v_c.names end;
  v_profit := v_r.revenue - v_fee_all - v_cookie + v_over - v_short;
  -- A1: what the latest started day set aside to carry over, when that day is closed and no later day took it (the event ended early).
  select coalesce(jsonb_agg(jsonb_build_object('product_id', l.product_id, 'name', p.name, 'day_id', d.id, 'qty', l.carry_next_qty)
                            order by l.product_id), '[]'::jsonb)
    into v_strand
    from public.bazaar_days d
    join public.events e on e.id = d.event_id and e.closed_at is not null
    join public.bazaar_day_lines l on l.day_id = d.id and l.carry_next_qty > 0
    join public.products p on p.id = l.product_id
   where d.scheduled_id = p_booking
     and d.day = (select max(d2.day) from public.bazaar_days d2 where d2.scheduled_id = p_booking and d2.event_id is not null);

  v_out := jsonb_build_object(
    'booking', jsonb_build_object('id', v_s.id, 'name', v_s.name, 'place', v_s.place, 'starts_on', v_s.starts_on, 'ends_on', v_s.ends_on,
                                  'rent_cents', v_s.rent_cents, 'active', v_s.active),
    'counted', not v_open,
    'days', v_days,
    'revenue', jsonb_build_object('revenue_cents', v_r.revenue, 'gross_cents', v_r.gross, 'discount_cents', v_r.discounts,
                                  'freebie_cents', v_r.freebies, 'by_pay', v_pay, 'sales', v_r.n, 'voided', v_r.voided),
    'cash', jsonb_build_object('over_cents', v_over, 'short_cents', v_short),
    'stranded', v_strand,
    'fees', jsonb_build_object('total_cents', v_fee_all, 'event_cents', v_fee_ev, 'parts', v_fees),
    'cookie_cost', jsonb_build_object('cents', v_cookie, 'why', v_why, 'made_cents', v_c.made_cents, 'to_shop_cents', v_c.to_shop_cents,
      'parts', jsonb_build_array(
        jsonb_build_object('label', 'Sold', 'quantity', v_c.sold, 'amount_cents', v_c.sold_cents),
        jsonb_build_object('label', 'Given away', 'quantity', v_c.given, 'amount_cents', v_c.given_cents),
        jsonb_build_object('label', 'Lost', 'quantity', v_c.lost, 'amount_cents', v_c.lost_cents),
        jsonb_build_object('label', 'Written off', 'quantity', v_c.written_off, 'amount_cents', v_c.written_off_cents),
        jsonb_build_object('label', 'Not accounted', 'quantity', v_c.not_accounted, 'amount_cents', v_c.not_accounted_cents),
        jsonb_build_object('label', 'Rounding', 'quantity', null, 'amount_cents', v_c.rounding_cents)),
      'made', v_c.made, 'to_shop', v_c.to_shop, 'lines', v_cost),
    'profit', jsonb_build_object('cents', v_profit, 'why', v_why, 'parts', jsonb_build_array(
        jsonb_build_object('label', 'Revenue', 'amount_cents', v_r.revenue),
        jsonb_build_object('label', 'Fees', 'amount_cents', -v_fee_all),
        jsonb_build_object('label', 'Cookie cost', 'amount_cents', -v_cookie),
        jsonb_build_object('label', 'Cash over', 'amount_cents', v_over),
        jsonb_build_object('label', 'Cash short', 'amount_cents', -v_short))),
    'target', jsonb_build_object('cents', v_s.target_profit_cents, 'against_cents', v_profit - v_s.target_profit_cents,
      'revenue_needed_cents', case when v_profit is null or v_s.target_profit_cents is null then null
                                   else greatest(v_s.target_profit_cents - v_profit, 0) end));
  return v_out || jsonb_build_object('hash', encode(sha256(convert_to(v_out::text, 'UTF8')), 'hex'));
end;
$$;

create or replace function public.get_bazaar(p_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.scheduled_events%rowtype;
begin
  if not public.is_owner() then
    raise exception 'only the owner may read a bazaar' using errcode = '42501';
  end if;
  select * into v_s from public.scheduled_events s where s.id = p_booking;
  if not found then -- rule:get-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'summary', public.bazaar_summary(p_booking),
    'target_profit_cents', v_s.target_profit_cents,
    'updated_at', v_s.updated_at,
    'finalised_at', v_s.finalised_at, 'final_hash', v_s.final_hash, 'final_summary', v_s.final_summary, 'final_split', v_s.final_split,
    'reversed_at', v_s.reversed_at, 'reversal', v_s.reversal,
    'stamps', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'day', d.day, 'updated_at', d.updated_at) order by d.day), '[]'::jsonb)
                 from public.bazaar_days d where d.scheduled_id = p_booking),
    'costs', (select coalesce(jsonb_agg(jsonb_build_object('product_id', k.product_id, 'recipe_cents', k.recipe_cents,
                       'recipe_read_at', k.recipe_read_at, 'typed_cents', k.typed_cents, 'typed_at', k.typed_at) order by k.product_id), '[]'::jsonb)
                from public.bazaar_costs k where k.scheduled_id = p_booking),
    'losses', (select coalesce(jsonb_agg(jsonb_build_object('client_id', o.client_id, 'day_id', o.day_id, 'product_id', o.product_id,
                        'qty', o.qty, 'reason', o.reason, 'at', (extract(epoch from o.at) * 1000)::bigint) order by o.at, o.client_id), '[]'::jsonb)
                 from public.bazaar_losses o join public.bazaar_days d on d.id = o.day_id
                where d.scheduled_id = p_booking and o.voided_at is null),
    'stock_adds', (select coalesce(jsonb_agg(jsonb_build_object('client_id', a.client_id, 'day_id', a.day_id, 'product_id', a.product_id,
                            'qty', a.qty, 'kind', a.kind) order by a.at, a.client_id), '[]'::jsonb)
                     from public.bazaar_stock_adds a join public.bazaar_days d on d.id = a.day_id where d.scheduled_id = p_booking));
end;
$$;

-- ------------------------------------------------------------------ the finalise: the final split, the drawer, the packaging

drop function public.finalise_bazaar(uuid, text, integer, jsonb);
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

  update public.scheduled_events as s set finalised_at = v_at, final_summary = v_sum, final_hash = p_expected, final_split = v_final where s.id = p_booking;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.finalised', 'scheduled_events', p_booking::text,
    jsonb_build_object('hash', p_expected, 'till', p_till, 'split', v_final, 'stranded', v_str, 'revenue_cents', v_sum -> 'revenue' -> 'revenue_cents',
      'fees_cents', v_sum -> 'fees' -> 'total_cents', 'profit_cents', v_sum -> 'profit' -> 'cents'));
  return v_sum;
end;
$$;

-- ------------------------------------------------------------------ A6: reversing a test event

/**
 * Reverses the books and the stock use of a finalised booking that was only a test (U6, A6). The second argument must be the booking's
 * name exactly. Appends reversing ledger lines (the same kind, category and date as the line they reverse, the amount negated, id
 * md5('reverse:' || the original's id)) and positive 'adjust' stock movements for the part of each 'use' that was taken; marks the booking
 * reversed. Deletes nothing. Refuses, writing nothing, when the booking's ledger lines do not add up to its stored summary. A repeat is
 * answered with what the first call did. Returns { reversed_at, ledger_lines, ledger_total_cents, stock_movements }.
 */
create or replace function public.reverse_bazaar_test(p_booking uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s       public.scheduled_events%rowtype;
  v_sum     jsonb;
  v_now     timestamptz := now();
  v_bad     boolean;
  v_dd      jsonb;
  v_first   bigint;
  v_items   text[];
  v_m       record;
  v_sales   bigint;
  v_costs   bigint;
  v_dr_n    integer;
  v_dr_sum  bigint;
  v_dr_want integer;
  v_led     uuid[];
  v_n_led   integer;
  v_n_stock integer := 0;
  v_out     jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may reverse a bazaar test' using errcode = '42501';
  end if;
  v_bad := p_booking is null or p_confirm_name is null;
  if v_bad then -- rule:rev-shape
    raise exception 'a booking and its exact name are required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || p_booking::text, 0));
  select * into v_s from public.scheduled_events s where s.id = p_booking for update;
  if not found then -- rule:rev-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  if v_s.name is distinct from p_confirm_name then -- rule:rev-name
    raise exception 'the name given is not the name of that booking' using errcode = '22023';
  end if;
  if v_s.reversed_at is not null then -- rule:rev-replay
    return v_s.reversal;
  end if;
  if v_s.finalised_at is null then -- rule:rev-not-finalised
    raise exception 'that bazaar is not finalised: there is nothing in the books to reverse' using errcode = '55000';
  end if;
  v_sum := v_s.final_summary;
  if coalesce((v_sum -> 'cookie_cost' ->> 'to_shop')::integer, 0) > 0 then -- rule:rev-shop
    raise exception 'that bazaar sent cookies to the shop: their batch is in the baked stock and is not reversed here' using errcode = '55000';
  end if;

  select min(m.seq), coalesce(array_agg(distinct m.item_id), '{}'::text[]) into v_first, v_items
    from public.stock_movements m join public.production_records r on r.id = m.production_id
   where r.ref = 'bazaar:' || p_booking::text and m.kind = 'use';
  -- The catalogue's lock, then the item locks in id order, before the count check: a count committing after the check would otherwise be
  -- raised by the restored stock.
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  perform public.lock_stock_item_ids(v_items);
  -- Read under the locks: a cutover committing while this waited is seen, not missed.
  if exists (select 1 from public.cost_cutover) then -- rule:rev-cutover
    raise exception 'the cost cutover has been applied: stock is counted without these cookies' using errcode = '55000';
  end if;
  v_bad := exists (select 1 from public.stock_movements c
                    where c.kind in ('count', 'opening') and c.item_id = any (v_items) and c.seq > v_first);
  if v_bad then -- rule:rev-counted
    raise exception 'an item this bazaar used was counted since: its stock no longer follows from the use' using errcode = '55000';
  end if;

  -- The lines the booking wrote must be exactly what its summary says, to the centavo: sales and voids against the revenue, rent, fees and
  -- till expenses against the fees, and one drawer line for each day with an over or a short against the cash.
  select coalesce(sum(l.amount_cents), 0)::bigint into v_sales
    from public.ledger_entries l join public.event_sales es on es.id = l.sale_id
    join public.bazaar_days d on d.event_id = es.event_id where d.scheduled_id = p_booking;
  select coalesce(sum(-l.amount_cents), 0)::bigint into v_costs
    from public.ledger_entries l join public.event_expenses x on x.ledger_id = l.id
    join public.bazaar_days d on d.event_id = x.event_id where d.scheduled_id = p_booking;
  v_dr_want := 0;
  v_dr_n := 0;
  v_dr_sum := 0;
  v_bad := false;
  for v_dd in select x from jsonb_array_elements(v_sum -> 'days') x
               where coalesce((x ->> 'over_cents')::bigint, 0) > 0 or coalesce((x ->> 'short_cents')::bigint, 0) > 0 loop
    v_dr_want := v_dr_want + 1;
    select count(*)::integer as n, coalesce(sum(l.amount_cents), 0)::bigint as s into v_m
      from public.events e join public.ledger_entries l
        on l.occurred_at = e.closed_at
       and l.memo = e.name || ' — drawer ' || case when coalesce((v_dd ->> 'short_cents')::bigint, 0) > 0 then 'short' else 'over' end
       and l.amount_cents = coalesce((v_dd ->> 'over_cents')::bigint, 0) - coalesce((v_dd ->> 'short_cents')::bigint, 0)
     where e.id = (v_dd ->> 'event_id')::uuid;
    v_bad := v_bad or v_m.n <> 1;
    v_dr_n := v_dr_n + v_m.n;
    v_dr_sum := v_dr_sum + v_m.s;
  end loop;
  v_bad := v_bad
           or v_sales <> (v_sum -> 'revenue' ->> 'revenue_cents')::bigint
           or v_costs <> (v_sum -> 'fees' ->> 'total_cents')::bigint
           or v_dr_n <> v_dr_want
           or v_dr_sum <> (v_sum -> 'cash' ->> 'over_cents')::bigint - (v_sum -> 'cash' ->> 'short_cents')::bigint;
  if v_bad then -- rule:rev-ledger
    raise exception 'the ledger lines of that bazaar do not add up to its summary: it was changed by hand and is not reversed here' using errcode = '22023';
  end if;

  select array_agg(z.id) into v_led from (
    select l.id from public.ledger_entries l join public.event_sales es on es.id = l.sale_id
      join public.bazaar_days d on d.event_id = es.event_id where d.scheduled_id = p_booking
    union
    select l.id from public.ledger_entries l join public.event_expenses x on x.ledger_id = l.id
      join public.bazaar_days d on d.event_id = x.event_id where d.scheduled_id = p_booking
    union
    select l.id from jsonb_array_elements(v_sum -> 'days') dd
      join public.events e on e.id = (dd ->> 'event_id')::uuid
      join public.ledger_entries l on l.occurred_at = e.closed_at
       and l.memo = e.name || ' — drawer ' || case when coalesce((dd ->> 'short_cents')::bigint, 0) > 0 then 'short' else 'over' end
       and l.amount_cents = coalesce((dd ->> 'over_cents')::bigint, 0) - coalesce((dd ->> 'short_cents')::bigint, 0)
     where coalesce((dd ->> 'over_cents')::bigint, 0) > 0 or coalesce((dd ->> 'short_cents')::bigint, 0) > 0) z;
  insert into public.ledger_entries (id, kind, category, memo, amount_cents, occurred_at, created_by)
  select md5('reverse:' || l.id::text)::uuid, l.kind, l.category, 'Reversal — ' || l.memo, -l.amount_cents, l.occurred_at, auth.uid()
    from public.ledger_entries l where l.id = any (coalesce(v_led, '{}'::uuid[]));
  get diagnostics v_n_led = row_count;

  -- Stock: what each use took (not the shortfall, which never left stock) goes back. The locks are already held (above).
  for v_m in select m.id, m.item_id, -m.qty_delta as take
               from public.stock_movements m join public.production_records r on r.id = m.production_id
              where r.ref = 'bazaar:' || p_booking::text and m.kind = 'use' and m.qty_delta < 0 order by m.item_id, m.seq loop
    update public.inventory_items as i set on_hand = i.on_hand + v_m.take where i.id = v_m.item_id;
    insert into public.stock_movements (id, item_id, kind, qty_delta, reason, at, payload_hash, created_by)
    values (md5('reverse:' || v_m.id::text)::uuid, v_m.item_id, 'adjust', v_m.take, 'Reversal of a test event', v_now,
            encode(sha256(convert_to('reverse:' || v_m.id::text, 'UTF8')), 'hex'), auth.uid());
    v_n_stock := v_n_stock + 1;
  end loop;

  v_out := jsonb_build_object('reversed_at', (extract(epoch from v_now) * 1000)::bigint, 'ledger_lines', v_n_led,
                              'ledger_total_cents', v_sales - v_costs + v_dr_sum, 'stock_movements', v_n_stock);
  update public.scheduled_events as s set reversed_at = v_now, reversed_by = auth.uid(), reversal = v_out where s.id = p_booking;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.reversed', 'scheduled_events', p_booking::text, v_out);
  return v_out;
end;
$$;

-- ------------------------------------------------------------------ authority

revoke execute on function public.save_flavour_cost(text, numeric) from public, anon, authenticated;
grant execute on function public.save_flavour_cost(text, numeric) to authenticated;
revoke execute on function public.get_flavour_costs() from public, anon, authenticated;
grant execute on function public.get_flavour_costs() to authenticated;
revoke execute on function public.reverse_bazaar_test(uuid, text) from public, anon, authenticated;
grant execute on function public.reverse_bazaar_test(uuid, text) to authenticated;
revoke execute on function public.get_bazaar(uuid) from public, anon, authenticated;
grant execute on function public.get_bazaar(uuid) to authenticated;
revoke execute on function public.finalise_bazaar(uuid, text, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.finalise_bazaar(uuid, text, integer, jsonb, jsonb) to authenticated;
revoke execute on function public.bazaar_summary(uuid) from public, anon, authenticated, service_role;
