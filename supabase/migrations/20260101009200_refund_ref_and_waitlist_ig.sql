-- S1 (19 November 2026, Ethan): two small rules the owner decided.
--   * A refund needs its reference ("refunds do need reference"): staff_refund refuses a null or blank p_ref (22023).
--     Replay of an already-refunded order, the stale check and the 60-character limit are unchanged.
--   * The waiting list needs an Instagram handle ("Instagram is always required"): join_waitlist refuses a blank
--     handle (22023). The format check is unchanged.
-- Both bodies are copied from their latest definitions (20260101003700 and 20260101005700); only the marked lines are new.

create or replace function public.staff_refund(p_order_id text, p_ref text, p_expected_updated_at timestamptz)
returns table (order_id text, state public.order_state, pay_state public.pay_state,
               total_cents bigint, paid_cents bigint, updated_at timestamptz, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_o public.orders;
begin
  if not public.is_owner() then
    raise exception 'only the owner may record a refund' using errcode = '42501';
  end if;
  if p_ref is not null and length(p_ref) > 60 then
    raise exception 'the refund reference is at most 60 characters' using errcode = '22023';
  end if;
  if p_ref is null or btrim(p_ref) = '' then -- rule:refund-ref
    raise exception 'the refund reference is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('order:staff:' || coalesce(p_order_id, ''), 0));
  select * into v_o from public.orders o where o.id = p_order_id for update;
  if not found then
    raise exception 'no such order' using errcode = '02000';
  end if;
  if v_o.pay_state = 'refunded' then -- rule:refund-replay
    return query select v_o.id, v_o.state, v_o.pay_state, v_o.total_cents, v_o.paid_cents, v_o.updated_at, true;
    return;
  end if;
  if p_expected_updated_at is null or date_trunc('milliseconds', v_o.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then -- rule:stale
    raise exception 'the order changed; reload it' using errcode = 'P0002';
  end if;
  if v_o.pay_state <> 'confirmed' then -- rule:refund-paid
    raise exception 'only a paid order can be refunded' using errcode = '55000';
  end if;
  update public.orders o
     set state = 'Cancelled', pay_state = 'refunded', cancelled_at = now(),
         refund_ref = nullif(btrim(p_ref), '')
   where o.id = v_o.id;
  return query select o.id, o.state, o.pay_state, o.total_cents, o.paid_cents, o.updated_at, false
                 from public.orders o where o.id = v_o.id;
end;
$$;
revoke execute on function public.staff_refund(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.staff_refund(text, text, timestamptz) to authenticated;

create or replace function public.join_waitlist(p_entry jsonb)
returns table (waitlist_id uuid, replayed boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_keys   text[];
  v_client uuid;
  v_name   text;
  v_ig     text;
  v_phone  text;
  v_date   date;
  v_hash   text;
  v_today  date := (select c.today from public.business_clock() c);
  v_existing public.waitlist_entries%rowtype;
  v_open   integer;
  v_id     uuid;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    raise exception 'waitlist entry must be an object' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_entry) k;
  if v_keys is distinct from array['client_id', 'ig', 'mobile', 'name', 'wanted_date'] then
    raise exception 'waitlist entry must carry exactly its own fields' using errcode = '22023';
  end if;
  if jsonb_typeof(p_entry -> 'client_id') <> 'string' or jsonb_typeof(p_entry -> 'name') <> 'string'
     or jsonb_typeof(p_entry -> 'ig') <> 'string' or jsonb_typeof(p_entry -> 'mobile') <> 'string'
     or jsonb_typeof(p_entry -> 'wanted_date') <> 'string' then
    raise exception 'waitlist field has the wrong type' using errcode = '22023';
  end if;
  if (p_entry ->> 'client_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'client id must be a lowercase uuid' using errcode = '22023';
  end if;
  v_client := (p_entry ->> 'client_id')::uuid;
  v_name := btrim(p_entry ->> 'name');
  v_ig := btrim(p_entry ->> 'ig');
  if length(v_name) not between 1 and 80 or length(v_ig) > 31 or (v_name || v_ig) ~ '[[:cntrl:]]' then
    raise exception 'waitlist text out of bounds' using errcode = '22023';
  end if;
  if v_ig = '' then -- rule:waitlist-ig
    raise exception 'instagram handle is required' using errcode = '22023';
  end if;
  if v_ig <> '' then
    v_ig := ltrim(v_ig, '@');
    if v_ig !~ '^[A-Za-z0-9._]{1,30}$' then
      raise exception 'instagram handle is not valid' using errcode = '22023';
    end if;
    v_ig := '@' || v_ig;
  end if;
  v_phone := regexp_replace(p_entry ->> 'mobile', '\D', '', 'g');
  if left(v_phone, 2) = '63' then v_phone := '0' || substr(v_phone, 3); end if;
  if v_phone ~ '^9[0-9]{9}$' then v_phone := '0' || v_phone; end if;
  if v_phone !~ '^09[0-9]{9}$' then
    raise exception 'mobile number is not a Philippine mobile number' using errcode = '22023';
  end if;
  if (p_entry ->> 'wanted_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'wanted date must be YYYY-MM-DD' using errcode = '22023';
  end if;
  begin
    v_date := (p_entry ->> 'wanted_date')::date;
  exception when others then
    raise exception 'wanted date is not a real date' using errcode = '22023';
  end;
  if v_date < v_today or v_date > v_today + 90 then -- rule:waitlist-date
    raise exception 'wanted date must be within the next 90 days' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(p_entry::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('waitlist:client:' || v_client::text, 0));
  select * into v_existing from public.waitlist_entries w where w.client_id = v_client;
  if found then -- rule:waitlist-replay
    if v_existing.payload_hash is distinct from v_hash then -- rule:waitlist-client-id-reuse
      raise exception 'waitlist id was already used for a different entry' using errcode = '23505';
    end if;
    return query select v_existing.id, true;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('waitlist:phone:' || v_phone, 0));
  -- The same number asking for the same date again is the same request: answer with the first.
  select * into v_existing from public.waitlist_entries w where w.phone = v_phone and w.wanted_date = v_date;
  if found then -- rule:waitlist-dedupe
    return query select v_existing.id, true;
    return;
  end if;
  select count(*) into v_open from public.waitlist_entries w where w.phone = v_phone and w.wanted_date >= v_today;
  if v_open >= 5 then -- rule:waitlist-limit
    raise exception 'too many waitlist entries on this number' using errcode = 'ZC006';
  end if;

  insert into public.waitlist_entries (client_id, payload_hash, name, ig, phone, wanted_date)
  values (v_client, v_hash, v_name, v_ig, v_phone, v_date)
  returning id into v_id;
  return query select v_id, false;
end;
$$;
revoke execute on function public.join_waitlist(jsonb) from public, anon, authenticated;
grant execute on function public.join_waitlist(jsonb) to anon, authenticated;
