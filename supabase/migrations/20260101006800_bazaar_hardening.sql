-- S3.1 bazaar hardening (docs/state/next-goal.md, 14 October 2026): six findings of the audit of migration 68 and the bazaar client.
--
--   M1  close_bazaar_day takes the selling phone's sale count and cash (sales_count, cash_cents; both null when another phone closes the
--       day, rule 1 of the run sheet) and refuses with 40001 until the server holds the same. finalise_bazaar gains p_till: null, or the
--       count and cash of a closed day the finalising phone still holds, checked the same way. The 3-argument finalise_bazaar is dropped
--       (PostgREST cannot choose between overloads), so a build older than this migration cannot finalise against it, and the close it
--       sends lacks the two keys: this migration and its build ship together.
--   M3  bazaar_fees and bazaar_losses gain voided_at and voided_by. void_bazaar_fee and void_bazaar_loss write that tombstone (never a
--       delete) until the booking is finalised; a loss only while its day is open (her count of a closed day already used it). Every
--       reader leaves a voided row out: bazaar_line_facts (losses), bazaar_summary (the day's fees and the fee list), get_bazaar (the
--       losses list) and finalise_bazaar (fee posting). save_bazaar_loss reads bazaar_line_facts, so its below-zero check follows.
--   L1  refuse_finalised_bazaar_sale, a BEFORE INSERT OR UPDATE OF voided_at trigger on event_sales: no sale or void lands on a day of a
--       finalised booking (55000). It takes the booking's lock first, so a sale racing the finalise waits and is then refused. record_event_sale and void_event_sale are NOT redefined (record_event_sale keeps md5 8cf2bd63); a
--       replay of a sale already held is answered before any insert, so it still leaves the queue. The trigger function is SECURITY
--       DEFINER with an empty search_path and no API grant, but has no is_owner() check: it runs inside the owner's RPCs, and the role
--       suite's postgres fixtures write sales directly.
--   L5  load_event_stock refuses a bazaar day's event (55000) after acknowledging an identical repeat.
--
-- Redefined whole, each exactly as last defined (20260101006700, load_event_stock 20260101003300), with the changes above only:
-- bazaar_line_facts, bazaar_summary, get_bazaar, close_bazaar_day, finalise_bazaar (two changes: M1 and M3), load_event_stock.
-- Each new refusal is one `if ... then -- rule:name` line so the SQL role suite can neutralise it.

alter table public.bazaar_fees
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null;
alter table public.bazaar_losses
  add column voided_at timestamptz,
  add column voided_by uuid references public.profiles (id) on delete set null;

-- ------------------------------------------------------------------ readers that leave a voided fee or loss out

create or replace function public.bazaar_line_facts(p_booking uuid)
returns table (day_id uuid, day date, event_id uuid, closed boolean, product_id text, name text, made integer, carried integer,
               price_cents bigint, sold integer, given integer, lost integer, left_qty integer, carry_next integer, to_shop integer,
               written_off integer)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.day, d.event_id, coalesce(e.closed_at is not null, false), l.product_id, p.name, l.made_qty, l.carried_qty, l.price_cents,
         coalesce(q.sold, 0)::integer, coalesce(q.given, 0)::integer, coalesce(x.lost, 0)::integer,
         l.left_qty, l.carry_next_qty, l.to_shop_qty, l.written_off_qty
    from public.bazaar_days d
    join public.bazaar_day_lines l on l.day_id = d.id
    join public.products p on p.id = l.product_id
    left join public.events e on e.id = d.event_id
    left join lateral (select sum(i.qty) filter (where s.total_cents > 0) as sold, sum(i.qty) filter (where s.total_cents = 0) as given
                         from public.event_sales s join public.event_sale_items i on i.sale_id = s.id
                        where s.event_id = d.event_id and s.voided_at is null and i.product_id = l.product_id) q on true
    left join lateral (select sum(o.qty) as lost from public.bazaar_losses o where o.day_id = d.id and o.product_id = l.product_id
                                              and o.voided_at is null) x on true
   where d.scheduled_id = p_booking;
$$;

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
                                    left join lateral (select coalesce(k.typed_cents, k.recipe_cents) as cents,
                                                              case when k.typed_cents is not null then 'typed'
                                                                   when k.recipe_cents is not null then 'recipe' end as source
                                                         from public.bazaar_costs k
                                                        where k.scheduled_id = p_booking and k.product_id = f.product_id) c on true
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

  v_out := jsonb_build_object(
    'booking', jsonb_build_object('id', v_s.id, 'name', v_s.name, 'place', v_s.place, 'starts_on', v_s.starts_on, 'ends_on', v_s.ends_on,
                                  'rent_cents', v_s.rent_cents, 'active', v_s.active),
    'counted', not v_open,
    'days', v_days,
    'revenue', jsonb_build_object('revenue_cents', v_r.revenue, 'gross_cents', v_r.gross, 'discount_cents', v_r.discounts,
                                  'freebie_cents', v_r.freebies, 'by_pay', v_pay, 'sales', v_r.n, 'voided', v_r.voided),
    'cash', jsonb_build_object('over_cents', v_over, 'short_cents', v_short),
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
    'finalised_at', v_s.finalised_at, 'final_hash', v_s.final_hash, 'final_summary', v_s.final_summary,
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

-- ------------------------------------------------------------------ M1: the close and the finalise check the till

create or replace function public.close_bazaar_day(p_close jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day     uuid;
  v_booking uuid;
  v_at      timestamptz;
  v_counted bigint;
  v_lines   jsonb;
  v_hash    text;
  v_d       public.bazaar_days%rowtype;
  v_e       public.events%rowtype;
  v_s       public.scheduled_events%rowtype;
  v_sum     jsonb;
  v_dayj    jsonb;
  v_bad     boolean;
  v_till    jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may close a bazaar day' using errcode = '42501';
  end if;
  if p_close is null or jsonb_typeof(p_close) <> 'object' then
    raise exception 'a close must be an object' using errcode = '22023';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(p_close) k) is distinct from array['at', 'cash_cents', 'counted_cents', 'day_id', 'expected', 'lines', 'sales_count']
           or jsonb_typeof(p_close -> 'day_id') <> 'string'
           or (p_close ->> 'day_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           or jsonb_typeof(p_close -> 'at') <> 'number' or (p_close ->> 'at') !~ '^[0-9]{12,14}$'
           or jsonb_typeof(p_close -> 'counted_cents') not in ('number', 'null')
           or (jsonb_typeof(p_close -> 'counted_cents') = 'number' and (p_close ->> 'counted_cents') !~ '^[0-9]{1,12}$')
           or jsonb_typeof(p_close -> 'expected') <> 'string' or (p_close ->> 'expected') !~ '^[0-9a-f]{64}$'
           or jsonb_typeof(p_close -> 'lines') <> 'object'
           or jsonb_typeof(p_close -> 'sales_count') not in ('number', 'null')
           or (jsonb_typeof(p_close -> 'sales_count') = 'number' and (p_close ->> 'sales_count') !~ '^[0-9]{1,6}$')
           or jsonb_typeof(p_close -> 'cash_cents') not in ('number', 'null')
           or (jsonb_typeof(p_close -> 'cash_cents') = 'number' and (p_close ->> 'cash_cents') !~ '^[0-9]{1,12}$')
           or jsonb_typeof(p_close -> 'sales_count') <> jsonb_typeof(p_close -> 'cash_cents');
  if v_bad then -- rule:close-shape
    raise exception 'a close carries exactly day_id, at, counted_cents (whole or null), lines, expected, and sales_count with cash_cents '
                    '(both whole, or both null when the phone closing it is not the one selling it)' using errcode = '22023';
  end if;
  v_lines := p_close -> 'lines';
  v_bad := exists (select 1 from jsonb_each(v_lines) i
                    where case when jsonb_typeof(i.value) <> 'object' then true
                               else (select array_agg(k order by k) from jsonb_object_keys(i.value) k) is distinct from array['carry_next', 'left', 'to_shop', 'written_off']
                                    or exists (select 1 from jsonb_each(i.value) q
                                                where jsonb_typeof(q.value) <> 'number' or (q.value #>> '{}') !~ '^[0-9]{1,5}$') end);
  if v_bad then -- rule:close-line-shape
    raise exception 'each flavour carries exactly left, carry_next, to_shop and written_off, whole and 0 or more' using errcode = '22023';
  end if;
  v_day := (p_close ->> 'day_id')::uuid;
  v_at := to_timestamp((p_close ->> 'at')::bigint / 1000.0);
  v_counted := (p_close ->> 'counted_cents')::bigint;
  select d.scheduled_id into v_booking from public.bazaar_days d where d.id = v_day;
  if v_booking is null then -- rule:close-day-missing
    raise exception 'that day does not exist' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  v_hash := encode(sha256(convert_to(p_close::text, 'UTF8')), 'hex');
  select * into v_d from public.bazaar_days d where d.id = v_day for update;
  if v_d.event_id is null then -- rule:close-not-started
    raise exception 'that day has not started' using errcode = '55000';
  end if;
  select * into v_e from public.events e where e.id = v_d.event_id for update;
  if v_e.closed_at is not null then
    if v_d.closed_hash is distinct from v_hash then -- rule:close-replay-conflict
      raise exception 'that day was already closed differently' using errcode = '23505';
    end if;
    return public.bazaar_summary(v_booking);
  end if;
  select * into v_s from public.scheduled_events s where s.id = v_booking;
  v_bad := v_at > now() + interval '1 day' or v_at < v_e.starts_at - interval '1 day';
  if v_bad then -- rule:close-at
    raise exception 'the close time is in the future or before the day started' using errcode = '22023';
  end if;
  select public.bazaar_summary(v_booking) into v_sum;
  select x into v_dayj from jsonb_array_elements(v_sum -> 'days') x where x ->> 'id' = v_day::text;
  if (v_dayj ->> 'hash') is distinct from (p_close ->> 'expected') then -- rule:close-stale
    raise exception 'the day changed since it was shown: read it again' using errcode = '40001';
  end if;
  -- S3.1 (M1): the selling phone says how many sales it holds for the day and their cash. The server owns the check: until it
  -- holds the same, a sale is still on the phone, and the close is refused as close_event refused it. Both null: another phone
  -- closes it without the till (rule 1 of the run sheet), and the audit row says so.
  v_till := case when jsonb_typeof(p_close -> 'sales_count') = 'number'
                 then jsonb_build_object('sales_count', (p_close ->> 'sales_count')::integer, 'cash_cents', (p_close ->> 'cash_cents')::bigint) end;
  v_bad := v_till is not null and ((v_till ->> 'sales_count')::integer <> (v_dayj ->> 'sales')::integer
                                   or (v_till ->> 'cash_cents')::bigint <> (v_dayj ->> 'cash_sales_cents')::bigint);
  if v_bad then -- rule:close-till
    raise exception 'the server does not hold all of this phone''s sales yet: sync, then read the day again' using errcode = '40001';
  end if;
  v_bad := (select array_agg(k order by k) from jsonb_object_keys(v_lines) k)
           is distinct from (select array_agg(l.product_id order by l.product_id) from public.bazaar_day_lines l where l.day_id = v_day);
  if v_bad then -- rule:close-lines
    raise exception 'the count names every flavour of the day and no other' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_each(v_lines) i
                    where (i.value ->> 'left')::integer
                          <> (i.value ->> 'carry_next')::integer + (i.value ->> 'to_shop')::integer + (i.value ->> 'written_off')::integer);
  if v_bad then -- rule:close-split
    raise exception 'what is left is what carries over, goes to the shop and is written off, together' using errcode = '22023';
  end if;
  v_bad := v_d.day = v_s.ends_on and exists (select 1 from jsonb_each(v_lines) i where (i.value ->> 'carry_next')::integer > 0);
  if v_bad then -- rule:close-carry-last-day
    raise exception 'nothing carries over from the booking''s last day' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from jsonb_array_elements(v_dayj -> 'lines') f
                    where (f ->> 'made')::integer + (f ->> 'carried')::integer - (f ->> 'sold')::integer - (f ->> 'given')::integer
                          - (f ->> 'lost')::integer - (v_lines -> (f ->> 'product_id') ->> 'left')::integer < 0);
  if v_bad then -- rule:close-negative
    raise exception 'a flavour has more left than was there: if more was made than the plan says, add that stock first' using errcode = '22023';
  end if;
  v_bad := exists (select 1 from public.event_sales s where s.event_id = v_d.event_id and s.voided_at is null and s.sold_at > v_at);
  if v_bad then -- rule:close-sale-after
    raise exception 'a sale was made after the close time' using errcode = '22023';
  end if;

  update public.bazaar_day_lines as l
     set left_qty = (i.value ->> 'left')::integer, carry_next_qty = (i.value ->> 'carry_next')::integer,
         to_shop_qty = (i.value ->> 'to_shop')::integer, written_off_qty = (i.value ->> 'written_off')::integer
    from jsonb_each(v_lines) i
   where l.day_id = v_day and l.product_id = i.key;
  update public.events as e
     set closed_at = v_at, counted_cents = v_counted,
         variance_cents = v_counted - (v_dayj ->> 'cash_expected_cents')::bigint,
         returned = (select coalesce(jsonb_object_agg(i.key, i.value -> 'left'), '{}'::jsonb) from jsonb_each(v_lines) i),
         closed_hash = v_hash
   where e.id = v_d.event_id;
  -- Her review is the day as the summary gives it now, with her count: what she was shown and what she answered.
  select public.bazaar_summary(v_booking) into v_sum;
  select x into v_dayj from jsonb_array_elements(v_sum -> 'days') x where x ->> 'id' = v_day::text;
  update public.bazaar_days as d set closed_review = v_dayj, closed_hash = v_hash where d.id = v_day;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.day_closed', 'bazaar_days', v_day::text,
    jsonb_build_object('scheduled_id', v_booking, 'event_id', v_d.event_id, 'counted_cents', v_counted,
      'expected_cents', (v_dayj ->> 'cash_expected_cents')::bigint, 'hash', v_dayj ->> 'hash', 'till', v_till));
  return public.bazaar_summary(v_booking);
end;
$$;

drop function public.finalise_bazaar(uuid, text, integer);
create or replace function public.finalise_bazaar(p_booking uuid, p_expected text, p_drop integer, p_till jsonb)
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
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || p_booking::text, 0));
  select * into v_s from public.scheduled_events s where s.id = p_booking for update;
  if not found then -- rule:fin-booking-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  if v_s.finalised_at is not null then
    if v_s.final_hash is distinct from p_expected then -- rule:fin-replay-conflict
      raise exception 'that bazaar was already finalised on another summary' using errcode = '23505';
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
  -- Each day's cash variance, as close_event books it: a short drawer is a cost, an over drawer a correction to takings.
  for v_d in select e.name, e.closed_at, (x ->> 'over_cents')::bigint as over, (x ->> 'short_cents')::bigint as short
               from jsonb_array_elements(v_sum -> 'days') x join public.events e on e.id = (x ->> 'event_id')::uuid
              order by x ->> 'day' loop
    if v_d.over > 0 or v_d.short > 0 then
      insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
      values (case when v_d.short > 0 then 'cost'::public.ledger_kind else 'sale'::public.ledger_kind end,
        case when v_d.short > 0 then 'Cash variance' else 'Bazaar' end,
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
  -- The bazaar-sale container rule, once per sale that is not voided (a line per cookie: once per cookie in those sales).
  select count(*)::integer, coalesce(sum(q.cookies), 0)::integer into v_sales, v_cookies
    from (select (select sum(i.qty) from public.event_sale_items i where i.sale_id = s.id) as cookies
            from public.event_sales s
           where s.voided_at is null
             and s.event_id in (select d.event_id from public.bazaar_days d where d.scheduled_id = p_booking and d.event_id is not null)) q;
  if v_sales > 0 then
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
    if not exists (select 1 from public.packaging_rules r where r.container = 'bazaar_sale') then
      v_short := v_short || jsonb_build_object('name', 'Bazaar sale', 'by', v_sales, 'unit', 'sale', 'why', 'no packaging rule');
    end if;
    update public.production_records as r set short = v_short where r.id = v_id;
  end if;

  update public.scheduled_events as s set finalised_at = v_at, final_summary = v_sum, final_hash = p_expected where s.id = p_booking;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.finalised', 'scheduled_events', p_booking::text,
    jsonb_build_object('hash', p_expected, 'till', p_till, 'revenue_cents', v_sum -> 'revenue' -> 'revenue_cents',
      'fees_cents', v_sum -> 'fees' -> 'total_cents', 'profit_cents', v_sum -> 'profit' -> 'cents'));
  return v_sum;
end;
$$;

-- ------------------------------------------------------------------ M3: taking back a fee or a loss

/**
 * Takes back a fee she saved (S3.1, M3): the row stays, flagged, and no figure counts it. Until the booking is finalised. The same call
 * on a fee already taken back is answered. Returns the booking's summary.
 */
create or replace function public.void_bazaar_fee(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
  v_voided  timestamptz;
  v_bad     boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may take back a bazaar fee' using errcode = '42501';
  end if;
  v_bad := p_client_id is null or length(p_client_id) not between 1 and 150;
  if v_bad then -- rule:fee-void-shape
    raise exception 'the fee''s client id is required' using errcode = '22023';
  end if;
  select f.scheduled_id into v_booking from public.bazaar_fees f where f.client_id = p_client_id;
  if v_booking is null then -- rule:fee-void-missing
    raise exception 'that fee does not exist' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  -- A repeat is answered first, even after the finalise: its first answer may have been lost.
  select f.voided_at into v_voided from public.bazaar_fees f where f.client_id = p_client_id for update;
  if v_voided is not null then
    return public.bazaar_summary(v_booking);
  end if;
  v_bad := exists (select 1 from public.scheduled_events s where s.id = v_booking and s.finalised_at is not null);
  if v_bad then -- rule:fee-void-finalised
    raise exception 'that bazaar is closed: its fees cannot change' using errcode = '55000';
  end if;
  update public.bazaar_fees as f set voided_at = now(), voided_by = auth.uid() where f.client_id = p_client_id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.fee_voided', 'bazaar_fees', p_client_id, jsonb_build_object('scheduled_id', v_booking));
  return public.bazaar_summary(v_booking);
end;
$$;

/**
 * Takes back a loss she recorded (S3.1, M3), while its day is open: the row stays, flagged, and no figure counts it. The same call on a
 * loss already taken back is answered. Returns the booking's summary.
 */
create or replace function public.void_bazaar_loss(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
  v_day     uuid;
  v_voided  timestamptz;
  v_bad     boolean;
begin
  if not public.is_owner() then
    raise exception 'only the owner may take back a bazaar loss' using errcode = '42501';
  end if;
  v_bad := p_client_id is null or length(p_client_id) not between 1 and 160;
  if v_bad then -- rule:loss-void-shape
    raise exception 'the loss''s client id is required' using errcode = '22023';
  end if;
  select d.scheduled_id, o.day_id into v_booking, v_day
    from public.bazaar_losses o join public.bazaar_days d on d.id = o.day_id where o.client_id = p_client_id;
  if v_booking is null then -- rule:loss-void-missing
    raise exception 'that loss does not exist' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  select o.voided_at into v_voided from public.bazaar_losses o where o.client_id = p_client_id for update;
  if v_voided is not null then
    return public.bazaar_summary(v_booking);
  end if;
  v_bad := exists (select 1 from public.scheduled_events s where s.id = v_booking and s.finalised_at is not null);
  if v_bad then -- rule:loss-void-finalised
    raise exception 'that bazaar is closed: its losses cannot change' using errcode = '55000';
  end if;
  v_bad := not exists (select 1 from public.bazaar_days d join public.events e on e.id = d.event_id
                        where d.id = v_day and e.closed_at is null);
  if v_bad then -- rule:loss-void-day-closed
    raise exception 'that day is closed: her count already used the loss' using errcode = '55000';
  end if;
  update public.bazaar_losses as o set voided_at = now(), voided_by = auth.uid() where o.client_id = p_client_id;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.loss_voided', 'bazaar_losses', p_client_id, jsonb_build_object('day_id', v_day));
  return public.bazaar_summary(v_booking);
end;
$$;

-- ------------------------------------------------------------------ L1 and L5

/**
 * Internal trigger (S3.1, L1): a sale or a void of a sale on a day of a finalised booking is refused. Its books are written.
 * It takes the booking's lock (the key every bazaar function takes) and reads finalised_at in a statement after it, so a sale
 * that arrives while finalise_bazaar runs waits for it and is then refused, rather than landing outside the stored summary.
 * Lock order: event_sale (the RPC) then scheduled_event (here) then the events row (the insert's foreign key), as the close
 * and the finalise take scheduled_event before the events row.
 */
create or replace function public.refuse_finalised_bazaar_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
  v_bad     boolean;
begin
  select d.scheduled_id into v_booking from public.bazaar_days d where d.event_id = new.event_id;
  if v_booking is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || v_booking::text, 0));
  v_bad := exists (select 1 from public.scheduled_events s where s.id = v_booking and s.finalised_at is not null);
  if v_bad then -- rule:sale-finalised
    raise exception 'this bazaar is closed: its sales cannot change' using errcode = '55000';
  end if;
  return new;
end;
$$;
revoke execute on function public.refuse_finalised_bazaar_sale() from public, anon, authenticated, service_role;
create trigger event_sales_finalised_bazaar
  before insert or update of voided_at on public.event_sales
  for each row execute function public.refuse_finalised_bazaar_sale();

-- load_event_stock, as it was (20260101003300) with the refusal for a bazaar day.
create or replace function public.load_event_stock(p_event uuid, p_loaded jsonb, p_float_cents bigint)
returns table (event_id uuid, opened_at timestamptz, float_cents bigint, loaded jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ev public.events%rowtype;
begin
  if not public.is_owner() then
    raise exception 'only the owner may load event stock' using errcode = '42501';
  end if;
  if p_event is null or p_loaded is null or jsonb_typeof(p_loaded) <> 'object' then
    raise exception 'event and a stock object are required' using errcode = '22023';
  end if;
  if p_float_cents is null or p_float_cents < 0 or p_float_cents > 100000000 then
    raise exception 'float must be between 0 and 1,000,000 pesos' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('event:' || p_event::text, 0));
  select * into v_ev from public.events e where e.id = p_event for update;
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from jsonb_each(p_loaded) i
              where i.key !~ '^[a-z0-9][a-z0-9-]{0,31}$' or not (v_ev.price_snapshot ? i.key)
                 or jsonb_typeof(i.value) <> 'number' or (i.value #>> '{}') !~ '^[0-9]{1,5}$') then
    raise exception 'stock must name flavours on the event menu with whole quantities' using errcode = '22023';
  end if;

  -- A repeat of the same load is acknowledged even after the event closed.
  if v_ev.opened_at is not null and v_ev.loaded = p_loaded and v_ev.drawer_float_cents = p_float_cents then
    return query select v_ev.id, v_ev.opened_at, v_ev.drawer_float_cents, v_ev.loaded;
    return;
  end if;
  -- S3.1 (L5), the one change from 20260101003300: a bazaar day's stock is its plan and the stock added to it. An old queued
  -- open must not overwrite it. After the acknowledgement above, so a repeat of a load that did land still leaves the queue.
  if exists (select 1 from public.bazaar_days d where d.event_id = p_event) then -- rule:load-bazaar-day
    raise exception 'this event is a bazaar day: its stock is its plan' using errcode = '55000';
  end if;
  if v_ev.opened_at is not null then
    raise exception 'event stock was already loaded differently' using errcode = '23505';
  end if;
  if v_ev.closed_at is not null then
    raise exception 'event is closed' using errcode = '55000';
  end if;

  update public.events e
     set loaded = p_loaded, drawer_float_cents = p_float_cents, opened_at = now()
   where e.id = p_event
  returning e.opened_at into v_ev.opened_at;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'event.stock_loaded', 'events', p_event::text,
    jsonb_build_object('loaded', p_loaded, 'float_cents', p_float_cents));
  return query select p_event, v_ev.opened_at, p_float_cents, p_loaded;
end;
$$;

-- ------------------------------------------------------------------ authority

revoke execute on function public.get_bazaar(uuid) from public, anon, authenticated;
grant execute on function public.get_bazaar(uuid) to authenticated;
revoke execute on function public.close_bazaar_day(jsonb) from public, anon, authenticated;
grant execute on function public.close_bazaar_day(jsonb) to authenticated;
revoke execute on function public.finalise_bazaar(uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.finalise_bazaar(uuid, text, integer, jsonb) to authenticated;
revoke execute on function public.void_bazaar_fee(text) from public, anon, authenticated;
grant execute on function public.void_bazaar_fee(text) to authenticated;
revoke execute on function public.void_bazaar_loss(text) from public, anon, authenticated;
grant execute on function public.void_bazaar_loss(text) to authenticated;
revoke execute on function public.load_event_stock(uuid, jsonb, bigint) from public, anon, authenticated;
grant execute on function public.load_event_stock(uuid, jsonb, bigint) to authenticated;
revoke execute on function public.bazaar_line_facts(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.bazaar_summary(uuid) from public, anon, authenticated, service_role;
