-- Café sale log, part 2 (owner only): additional expenses on a café sale (delivery, extra packaging).
--
-- * `record_cafe_sale` (migration 96) takes an optional `expenses` array, 0 to 10 of exactly { category, amountCents, note }. Each is
--   written in the same transaction as the sale as an ordinary cost line of the books, the kind `record_expense` writes (kind 'cost',
--   category, memo "Café <name> · <note or category>", negative centavos), dated the sale date and tied to the sale through
--   `ledger_entries.order_id`. So the books show it as an expense on that day, and a retry of the sale (same clientId, same body) writes
--   nothing twice. The body without `expenses` is still accepted, so the app of migration 96 keeps working. Nothing else changed in
--   the function (the whole function is restated; the diff against migration 96 is the keys check, the expenses block, the ledger
--   insert and one audit field).
-- * `add_cafe_expense(jsonb)` adds an expense to a café sale that is already logged: exactly { clientId, orderNo, category, amountCents,
--   note }. Idempotent on clientId (the ledger line's client_id), dated the sale's own date, at most 10 expenses on a sale in all.
-- * `get_cafe_sales()` also returns each sale's expenses and their total.
-- A sale's expenses are not part of its total or of the weekly limit; the sale's net is its total less its expenses.

create or replace function public.record_cafe_sale(p_sale jsonb)
returns table (order_no text, total_cents bigint, sale_date date, replayed boolean, takes_slots boolean, short jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client   uuid;
  v_name     text;
  v_notes    text;
  v_method   text;
  v_take     boolean;
  v_date     date;
  v_today    date := (select c.today from public.business_clock() c);
  v_now      timestamptz := now();
  v_stamp    timestamptz;
  v_hash     text;
  v_existing public.orders;
  v_lines    jsonb;
  v_line     jsonb;
  v_n        numeric;
  v_pids     text[] := '{}';
  v_qtys     integer[] := '{}';
  v_prices   bigint[] := '{}';
  v_total    numeric := 0;
  v_count    boolean;
  v_rules    public.order_rules;
  v_capacity integer;
  v_week     date;
  v_committed numeric;
  v_units    numeric;
  v_id       text;
  v_short    jsonb := '[]'::jsonb;
  v_exp_cats  text[] := '{}';
  v_exp_notes text[] := '{}';
  v_exp_amts  bigint[] := '{}';
  v_keys     text[];
  v_i        integer;
begin
  if not public.is_owner() then -- rule:cafe-sale-owner
    raise exception 'only the owner may log a café sale' using errcode = '42501';
  end if;
  if p_sale is null or jsonb_typeof(p_sale) <> 'object' then -- rule:cafe-sale-keys
    raise exception 'a café sale is an object' using errcode = '22023';
  end if;
  select coalesce(array_agg(k), '{}') into v_keys from jsonb_object_keys(p_sale) k;
  if not (v_keys @> array['clientId', 'lines', 'name', 'notes', 'payMethod', 'saleDate', 'takeStock']
          and v_keys <@ array['clientId', 'expenses', 'lines', 'name', 'notes', 'payMethod', 'saleDate', 'takeStock']) then -- rule:cafe-sale-keys-set
    raise exception 'a café sale has exactly clientId, name, saleDate, payMethod, notes, takeStock and lines, and may have expenses'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_sale -> 'clientId') <> 'string' or (p_sale ->> 'clientId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_sale -> 'name') <> 'string' or jsonb_typeof(p_sale -> 'notes') <> 'string'
     or jsonb_typeof(p_sale -> 'payMethod') <> 'string' or jsonb_typeof(p_sale -> 'takeStock') <> 'boolean'
     or jsonb_typeof(p_sale -> 'saleDate') <> 'string' or (p_sale ->> 'saleDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or jsonb_typeof(p_sale -> 'lines') <> 'array' then
    raise exception 'a café sale field has the wrong type' using errcode = '22023';
  end if;
  v_client := (p_sale ->> 'clientId')::uuid;
  v_name := btrim(p_sale ->> 'name');
  v_notes := btrim(p_sale ->> 'notes');
  v_method := btrim(p_sale ->> 'payMethod');
  v_take := (p_sale ->> 'takeStock')::boolean;
  if length(v_name) not between 1 and 80 or length(v_notes) > 300 or length(v_method) not between 1 and 30
     or v_name ~ '[[:cntrl:]]' or v_notes ~ '[[:cntrl:]]' or v_method ~ '[[:cntrl:]]' then -- rule:cafe-sale-text
    raise exception 'a café name is 1 to 80 characters and notes at most 300, with no control characters' using errcode = '22023';
  end if;
  begin
    v_date := (p_sale ->> 'saleDate')::date;
  exception when others then
    raise exception 'the sale date is not a date' using errcode = '22023';
  end;

  v_lines := p_sale -> 'lines';
  if jsonb_array_length(v_lines) not between 1 and 40 then -- rule:cafe-sale-lines
    raise exception 'a café sale has 1 to 40 lines' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(v_lines) loop
    if jsonb_typeof(v_line) <> 'object'
       or (select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['productId', 'qty', 'unitCents']
       or jsonb_typeof(v_line -> 'productId') <> 'string' or jsonb_typeof(v_line -> 'qty') <> 'number'
       or jsonb_typeof(v_line -> 'unitCents') <> 'number'
       or (v_line ->> 'productId') !~ '^[a-z0-9][a-z0-9-]{0,31}$' then
      raise exception 'a café sale line is exactly productId, qty and unitCents' using errcode = '22023';
    end if;
    v_n := (v_line ->> 'qty')::numeric;
    if v_n <> trunc(v_n) or v_n < 1 or v_n > 500 then -- rule:cafe-sale-qty
      raise exception 'a quantity is a whole number from 1 to 500' using errcode = '22023';
    end if;
    v_qtys := array_append(v_qtys, v_n::integer);
    v_pids := array_append(v_pids, v_line ->> 'productId');
    v_n := (v_line ->> 'unitCents')::numeric;
    if v_n <> trunc(v_n) or v_n < 1 or v_n > 100000000 then -- rule:cafe-sale-price
      raise exception 'a price is whole centavos from 1 to 100000000' using errcode = '22023';
    end if;
    v_prices := array_append(v_prices, v_n::bigint);
    v_total := v_total + v_qtys[cardinality(v_qtys)] * v_n;
  end loop;
  if cardinality(v_pids) <> (select count(distinct x) from unnest(v_pids) x) then -- rule:cafe-sale-duplicate
    raise exception 'a product is on two lines' using errcode = '22023';
  end if;
  if v_total > 100000000 then -- rule:cafe-sale-total
    raise exception 'a sale total is at most 100000000 centavos' using errcode = '22023';
  end if;

  -- Additional expenses of the sale (delivery, extra packaging): 0 to 10 of exactly { category, amountCents, note }.
  if p_sale ? 'expenses' then -- rule:cafe-sale-expenses
    if jsonb_typeof(p_sale -> 'expenses') <> 'array' or jsonb_array_length(p_sale -> 'expenses') > 10 then
      raise exception 'a café sale has at most 10 expenses' using errcode = '22023';
    end if;
    for v_line in select * from jsonb_array_elements(p_sale -> 'expenses') loop
      if jsonb_typeof(v_line) <> 'object'
         or (select array_agg(k order by k) from jsonb_object_keys(v_line) k) is distinct from array['amountCents', 'category', 'note']
         or jsonb_typeof(v_line -> 'category') <> 'string' or jsonb_typeof(v_line -> 'note') <> 'string'
         or jsonb_typeof(v_line -> 'amountCents') <> 'number' then
        raise exception 'a café sale expense is exactly category, amountCents and note' using errcode = '22023';
      end if;
      v_exp_cats := array_append(v_exp_cats, btrim(v_line ->> 'category'));
      v_exp_notes := array_append(v_exp_notes, btrim(v_line ->> 'note'));
      if length(v_exp_cats[cardinality(v_exp_cats)]) not between 1 and 60 or length(v_exp_notes[cardinality(v_exp_notes)]) > 120
         or (v_exp_cats[cardinality(v_exp_cats)] || v_exp_notes[cardinality(v_exp_notes)]) ~ '[[:cntrl:]]'
         or lower(v_exp_cats[cardinality(v_exp_cats)]) = 'owner draw' then -- rule:cafe-sale-expense-text
        raise exception 'an expense category is 1 to 60 characters and a note at most 120, and is never an owner draw' using errcode = '22023';
      end if;
      v_n := (v_line ->> 'amountCents')::numeric;
      if v_n <> trunc(v_n) or v_n < 1 or v_n > 100000000 then -- rule:cafe-sale-expense-amount
        raise exception 'an expense is whole centavos from 1 to 100000000' using errcode = '22023';
      end if;
      v_exp_amts := array_append(v_exp_amts, v_n::bigint);
    end loop;
  end if;

  v_hash := encode(extensions.digest(p_sale::text, 'sha256'), 'hex');
  -- Idempotency comes before the limits: a retry of a sale that already counts is answered with that sale.
  perform pg_advisory_xact_lock(hashtextextended('order:client:' || v_client::text, 0));
  select * into v_existing from public.orders o where o.client_id = v_client;
  if found then -- rule:cafe-sale-replay
    if v_existing.payload_hash is distinct from v_hash or v_existing.channel <> 'cafe' then -- rule:cafe-sale-client-id-reuse
      raise exception 'sale id was already used for a different sale' using errcode = '23505';
    end if;
    return query select v_existing.id, v_existing.total_cents, v_existing.pickup_date, true,
                        exists (select 1 from public.order_items oi where oi.order_id = v_existing.id and oi.capacity_weight > 0),
                        coalesce((select r.short from public.production_records r where r.id = md5('pack:' || v_existing.id)::uuid and r.kind = 'pack'),
                                 '[]'::jsonb);
    return;
  end if;

  if v_date > v_today or v_date < v_today - 90 then -- rule:cafe-sale-date
    raise exception 'the sale date is today or up to 90 days back' using errcode = '22023';
  end if;
  -- (after the replay lookup: a retry of a sale that exists is answered even if its date has fallen out of the window since)
  if v_method <> 'Cash' and not exists (select 1 from public.payment_methods m where m.active and m.label = v_method) then -- rule:cafe-sale-method
    raise exception 'that payment method is not offered' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_pids) x where not exists (
               select 1 from public.products p where p.id = x and p.archived_at is null)) then -- rule:cafe-sale-product
    raise exception 'a product on the sale does not exist or was removed' using errcode = '22023';
  end if;

  select s.count_toward_limit into v_count from public.cafe_order_settings s where s.id;
  v_count := coalesce(v_count, true);

  if v_count then
    select * into v_rules from public.order_rules r where r.id;
    if not found then
      raise exception 'order rules are missing' using errcode = '55000';
    end if;
    select max(se.int_value) filter (where se.key = 'capacity') into v_capacity from public.settings_effective() se;
    v_week := date_trunc('week', v_date::timestamp)::date;
    perform pg_advisory_xact_lock(hashtextextended('order:week:' || v_week::text, 0));
    select coalesce(sum(oi.qty * oi.capacity_weight), 0) into v_committed
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
     where o.pickup_date >= v_week and o.pickup_date < v_week + 7
       and public.order_holds_capacity(o.state, o.pay_state, o.placed_at, v_now, v_rules.unpaid_hold_hours);
    select coalesce(sum(t.qty * p.capacity_weight), 0) into v_units
      from unnest(v_pids, v_qtys) as t(pid, qty)
      join public.products p on p.id = t.pid;
    if not public.capacity_allows(v_capacity, v_committed::integer, v_units::integer) then -- rule:cafe-sale-capacity
      raise exception 'not enough room left in that week' using errcode = 'ZC002',
        detail = greatest(0, v_capacity - v_committed)::text;
    end if;
  end if;

  -- The money is dated on the sale date: today it is now, an earlier day is noon of that day on the shop's clock. The zone is named
  -- only in business_clock(), so noon is found from the shop's offset from UTC at this moment (the shop has no summer time).
  v_stamp := case when v_date = v_today then v_now
                  else ((v_date::timestamp + interval '12 hours')
                        - ((select c.local_time from public.business_clock(v_now) c) - (v_now at time zone 'UTC'))) at time zone 'UTC' end;
  v_id := 'HC-' || nextval('public.order_number_seq');
  insert into public.orders (id, customer_name, phone, ig, channel, state, pay_state, pay_method, total_cents, paid_cents, paid_at,
                             collected_at, notes, pickup_date, client_id, payload_hash, status_token, placed_at)
  values (v_id, v_name, '', '', 'cafe', 'Completed', 'confirmed', v_method, v_total::bigint, v_total::bigint, v_stamp,
          v_stamp, v_notes, v_date, v_client, v_hash, null, v_stamp); -- rule:cafe-sale-paid
  insert into public.order_items (order_id, product_id, qty, unit_price_cents, capacity_weight)
  select v_id, t.pid, t.qty, t.price, case when v_count then p.capacity_weight else 0 end -- rule:cafe-sale-weight
    from unnest(v_pids, v_qtys, v_prices) as t(pid, qty, price)
    join public.products p on p.id = t.pid;

  -- Each expense is an ordinary cost line of the books (what record_expense writes), dated the sale date and tied to the sale.
  for v_i in 1 .. cardinality(v_exp_cats) loop
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, order_id, created_by, client_id, payload_hash)
    values ('cost', v_exp_cats[v_i], 'Café ' || v_name || ' · ' || coalesce(nullif(v_exp_notes[v_i], ''), v_exp_cats[v_i]),
            -v_exp_amts[v_i], v_stamp, v_id, auth.uid(), md5('cafe-expense:' || v_client::text || ':' || v_i::text)::uuid, v_hash); -- rule:cafe-sale-expense-ledger
  end loop;

  if v_take then -- rule:cafe-sale-stock
    -- The packing step of an order, once: the cookies come off the latest drop's baked stock, the packaging off the shelf.
    select r.shortfall into v_short
      from public.record_pack(v_id, coalesce((select max(pr.drop_no) from public.production_records pr), 0)) r;
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'cafe.sale', 'orders', v_id,
    jsonb_build_object('name', v_name, 'date', v_date, 'total_cents', v_total::bigint, 'method', v_method, 'stock', v_take,
      'expense_cents', coalesce((select sum(x) from unnest(v_exp_amts) x), 0)));

  return query select v_id, v_total::bigint, v_date, false, v_count and exists (
    select 1 from public.order_items oi where oi.order_id = v_id and oi.capacity_weight > 0), coalesce(v_short, '[]'::jsonb);
end;
$$;
revoke execute on function public.record_cafe_sale(jsonb) from public, anon, authenticated;
grant execute on function public.record_cafe_sale(jsonb) to authenticated;

/**
 * Adds an expense to a café sale already logged. p_expense is exactly { clientId, orderNo, category, amountCents, note }. Refuses,
 * writing nothing: 42501 not the owner; 22023 a malformed body, a category over 60 characters, an owner draw, a note over 120,
 * control characters, an amount that is not whole centavos from 1 to 100000000, an order that is not a paid café sale, or a sale that
 * already has 10 expenses; 23505 the client id was used for a different expense. Returns the sale's total expenses and whether this
 * was a replay.
 */
create function public.add_cafe_expense(p_expense jsonb)
returns table (order_no text, expense_cents bigint, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_client uuid;
  v_no     text;
  v_cat    text;
  v_note   text;
  v_amount numeric;
  v_hash   text;
  v_order  public.orders;
  v_seen   public.ledger_entries;
begin
  if not public.is_owner() then -- rule:cafe-expense-owner
    raise exception 'only the owner may add a café expense' using errcode = '42501';
  end if;
  if p_expense is null or jsonb_typeof(p_expense) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_expense) k)
        is distinct from array['amountCents', 'category', 'clientId', 'note', 'orderNo'] then -- rule:cafe-expense-keys
    raise exception 'a café expense has exactly clientId, orderNo, category, amountCents and note' using errcode = '22023';
  end if;
  if jsonb_typeof(p_expense -> 'clientId') <> 'string' or (p_expense ->> 'clientId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or jsonb_typeof(p_expense -> 'orderNo') <> 'string' or jsonb_typeof(p_expense -> 'category') <> 'string'
     or jsonb_typeof(p_expense -> 'note') <> 'string' or jsonb_typeof(p_expense -> 'amountCents') <> 'number' then
    raise exception 'a café expense field has the wrong type' using errcode = '22023';
  end if;
  v_client := (p_expense ->> 'clientId')::uuid;
  v_no := p_expense ->> 'orderNo';
  v_cat := btrim(p_expense ->> 'category');
  v_note := btrim(p_expense ->> 'note');
  if length(v_cat) not between 1 and 60 or length(v_note) > 120 or (v_cat || v_note) ~ '[[:cntrl:]]'
     or lower(v_cat) = 'owner draw' then -- rule:cafe-expense-text
    raise exception 'an expense category is 1 to 60 characters and a note at most 120, and is never an owner draw' using errcode = '22023';
  end if;
  v_amount := (p_expense ->> 'amountCents')::numeric;
  if v_amount <> trunc(v_amount) or v_amount < 1 or v_amount > 100000000 then -- rule:cafe-expense-amount
    raise exception 'an expense is whole centavos from 1 to 100000000' using errcode = '22023';
  end if;
  v_hash := encode(extensions.digest(p_expense::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('cafe-expense:' || v_client::text, 0));
  select * into v_seen from public.ledger_entries l where l.client_id = v_client;
  if found then -- rule:cafe-expense-replay
    if v_seen.payload_hash is distinct from v_hash or v_seen.order_id is distinct from v_no then -- rule:cafe-expense-client-id-reuse
      raise exception 'expense id was already used for a different expense' using errcode = '23505';
    end if;
    return query select v_no, (select coalesce(sum(-l.amount_cents), 0)::bigint from public.ledger_entries l where l.order_id = v_no and l.kind = 'cost'), true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cafe-sale:' || v_no, 0));
  select * into v_order from public.orders o where o.id = v_no and o.channel = 'cafe' and o.pay_state = 'confirmed';
  if not found then -- rule:cafe-expense-order
    raise exception 'that is not a paid café sale' using errcode = '22023';
  end if;
  if (select count(*) from public.ledger_entries l where l.order_id = v_no and l.kind = 'cost') >= 10 then -- rule:cafe-expense-limit
    raise exception 'a café sale has at most 10 expenses' using errcode = '22023';
  end if;
  insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, order_id, created_by, client_id, payload_hash)
  values ('cost', v_cat, 'Café ' || v_order.customer_name || ' · ' || coalesce(nullif(v_note, ''), v_cat), -v_amount::bigint,
          v_order.placed_at, v_no, auth.uid(), v_client, v_hash); -- rule:cafe-expense-ledger
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'cafe.expense', 'orders', v_no, jsonb_build_object('category', v_cat, 'amount_cents', v_amount::bigint));
  return query select v_no, (select coalesce(sum(-l.amount_cents), 0)::bigint from public.ledger_entries l where l.order_id = v_no and l.kind = 'cost'), false;
end;
$$;
revoke execute on function public.add_cafe_expense(jsonb) from public, anon, authenticated;
grant execute on function public.add_cafe_expense(jsonb) to authenticated;

/**
 * The café sale log, newest sale first (at most 500), with each sale's expenses. Owner only (42501). Includes any café row entered
 * under migration 94 that was never paid: its pay_state says so.
 */
drop function public.get_cafe_sales();
create function public.get_cafe_sales()
returns table (order_no text, name text, sale_date date, total_cents bigint, pay_method text, state text, pay_state text,
               cookies bigint, notes text, items jsonb, logged_at timestamptz, expense_cents bigint, expenses jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then -- rule:cafe-sales-read-owner
    raise exception 'only the owner may read the café sales' using errcode = '42501';
  end if;
  return query
    select o.id, o.customer_name, o.pickup_date, o.total_cents, coalesce(o.pay_method, ''), o.state::text, o.pay_state::text,
           coalesce((select sum(i.qty) from public.order_items i where i.order_id = o.id), 0)::bigint, o.notes,
           coalesce((select jsonb_agg(jsonb_build_object('product_id', i.product_id, 'name', p.name, 'qty', i.qty,
                                      'unit_price_cents', i.unit_price_cents) order by p.sort_order, p.id)
                       from public.order_items i join public.products p on p.id = i.product_id where i.order_id = o.id), '[]'::jsonb),
           o.updated_at,
           coalesce((select sum(-l.amount_cents) from public.ledger_entries l where l.order_id = o.id and l.kind = 'cost'), 0)::bigint,
           coalesce((select jsonb_agg(jsonb_build_object('category', l.category, 'label', l.memo, 'amount_cents', -l.amount_cents)
                                      order by l.created_at, l.id)
                       from public.ledger_entries l where l.order_id = o.id and l.kind = 'cost'), '[]'::jsonb)
      from public.orders o
     where o.channel = 'cafe'
     order by o.pickup_date desc nulls last, o.id desc
     limit 500;
end;
$$;
revoke execute on function public.get_cafe_sales() from public, anon, authenticated;
grant execute on function public.get_cafe_sales() to authenticated;
