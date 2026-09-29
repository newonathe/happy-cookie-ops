-- B2 (docs/state/finish-plan.md slice B2), database half: what the live checkout needs to read.
--
--   get_shop_order_rules()        the pickup rules a customer's date picker needs, and nothing else.
--                                 get_order_rules() (B1) stays owner-only: it also carries the
--                                 owner's anti-abuse numbers, which a customer has no need for.
--   find_order(order_no, phone)   "Find my order": the status token for an order number and the
--                                 phone number it was placed with, or null. The token then opens
--                                 order_status(). A miss of any kind (malformed input, unknown
--                                 number, wrong phone, erased order, too many tries) is the same
--                                 null, so the answer never says whether an order exists.
--
-- The lookup is throttled per order number, not per caller (no IP is trustworthy): ten tries per
-- fifteen minutes on an order that exists. That bounds a guess at the phone number of one order to
-- a few hundred a day, and only orders that exist create a counter row. The price is that someone
-- can use up a stranger's tries for a while; the status link itself is unaffected.
--
-- Each rule is one `if ... then -- rule:name` line, as in 20260101003500: the SQL role suite
-- (tests/integration/security/order-lookup.sql) neutralises one at a time.

create or replace function public.get_shop_order_rules()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'pickup_days', to_jsonb(r.pickup_days),
    'lead_min_days', r.lead_min_days,
    'lead_max_days', r.lead_max_days,
    'pickup_from_hour', r.pickup_from_hour,
    'pickup_cutoff_hour', r.pickup_cutoff_hour,
    'campus_from', r.campus_from,
    'campus_to', r.campus_to,
    'unpaid_hold_hours', r.unpaid_hold_hours)
  from public.order_rules r where r.id;
$$;
revoke execute on function public.get_shop_order_rules() from public, anon, authenticated;
grant execute on function public.get_shop_order_rules() to anon, authenticated;

create or replace function public.find_order(p_order_no text, p_phone text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_no      text := upper(btrim(coalesce(p_order_no, '')));
  v_phone   text;
  v_order   public.orders%rowtype;
  v_allowed boolean;
begin
  if v_no !~ '^HC-[0-9]{4,9}$' then
    return null;
  end if;
  -- Must match place_order() and anonymise_customer(): digits only, a leading 63 becomes 0, and the
  -- ten-digit form 9xxxxxxxxx gets its 0.
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if left(v_phone, 2) = '63' then v_phone := '0' || substr(v_phone, 3); end if;
  if v_phone ~ '^9[0-9]{9}$' then v_phone := '0' || v_phone; end if;
  if v_phone !~ '^09[0-9]{9}$' then
    return null;
  end if;

  select * into v_order from public.orders o where o.id = v_no and o.status_token is not null;
  if not found then
    return null;
  end if;

  select r.allowed into v_allowed from public.consume_rate_limit('find:' || v_no, 10, 900) r;
  if not v_allowed then -- rule:find-throttle
    return null;
  end if;
  if v_order.phone is distinct from v_phone then -- rule:find-phone
    return null;
  end if;
  return v_order.status_token;
end;
$$;
revoke execute on function public.find_order(text, text) from public, anon, authenticated;
grant execute on function public.find_order(text, text) to anon, authenticated;
