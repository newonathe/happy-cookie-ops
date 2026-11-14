-- End event, first part (Ethan, 14 November 2026): an event that never sold anything can be deleted.
--
-- A booking with no sale (voided ones included), no expense, no drawer difference, no fee or cost in the books, no recorded kitchen
-- cookies and no finalise has put nothing into Money or Stock: its day plans, typed costs, fees, losses, added stock and the selling
-- days it opened are only plans. delete_bazaar_booking removes them and the booking, and keeps one audit row with what was removed.
-- Anything that touched Money or Stock is refused, writing nothing; the event is then ended with its records kept.

/**
 * Deletes one booking that never sold anything. The second argument must be the booking's name exactly. Refuses, writing nothing:
 * 42501 not the owner; 22023 no booking or name given, or the name differs; P0002 no such booking (unless this booking was already
 * deleted: a repeat is answered with what the first call did); 55000 the booking is finalised, is linked to an older till event, has
 * a sale (voided or not), an expense, a drawer difference, a fee already in the books, or recorded kitchen cookies; or a selling day of
 * it is still open. An open day is closed first: another phone may hold sales for it that the server has not received yet, and the
 * close is what makes the selling phone hand them over.
 * Returns { deleted_at, days, events, day_lines, costs, fees, losses, stock_adds }.
 */
create or replace function public.delete_bazaar_booking(p_booking uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s      public.scheduled_events%rowtype;
  v_now    timestamptz := now();
  v_days   uuid[];
  v_events uuid[];
  v_lines  integer;
  v_costs  integer;
  v_fees   integer;
  v_losses integer;
  v_adds   integer;
  v_n_ev   integer;
  v_out    jsonb;
begin
  if not public.is_owner() then
    raise exception 'only the owner may delete an event' using errcode = '42501';
  end if;
  if p_booking is null or p_confirm_name is null then -- rule:del-shape
    raise exception 'a booking and its exact name are required' using errcode = '22023';
  end if;
  -- The same lock as finalise and reverse: neither can run while this one does.
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || p_booking::text, 0));
  select * into v_s from public.scheduled_events s where s.id = p_booking for update;
  if not found then
    select a.detail into v_out from public.audit_log a
     where a.action = 'bazaar.deleted' and a.entity = 'scheduled_events' and a.entity_id = p_booking::text
     order by a.id desc limit 1;
    if v_out is not null and v_out ->> 'name' = p_confirm_name then -- rule:del-replay
      return v_out - 'name' - 'starts_on' - 'ends_on';
    end if;
    raise exception 'that booking does not exist' using errcode = 'P0002'; -- rule:del-missing
  end if;
  if v_s.name is distinct from p_confirm_name then -- rule:del-name
    raise exception 'the name given is not the name of that booking' using errcode = '22023';
  end if;
  if v_s.finalised_at is not null or v_s.reversed_at is not null then -- rule:del-finalised
    raise exception 'that event is finalised: it is in the books and cannot be deleted' using errcode = '55000';
  end if;
  if v_s.event_id is not null then -- rule:del-legacy-link
    raise exception 'that event is linked to an older till event and cannot be deleted' using errcode = '55000';
  end if;
  select coalesce(array_agg(d.id order by d.day), '{}'), coalesce(array_agg(d.event_id) filter (where d.event_id is not null), '{}')
    into v_days, v_events
    from public.bazaar_days d where d.scheduled_id = p_booking;
  -- Lock the selling days it opened, so a sale arriving now either lands first (and is seen below) or finds its day gone.
  perform 1 from public.events e where e.id = any (v_events) for update;
  if exists (select 1 from public.events e where e.id = any (v_events) and e.closed_at is null) then -- rule:del-open-day
    raise exception 'that event has a day still selling: close the day first' using errcode = '55000';
  end if;
  -- A sale that commits before the lock above is seen here; one that arrives after it finds its day gone (its foreign key
  -- check waits on the lock), so it is refused and stays on the phone that holds it.
  if exists (select 1 from public.event_sales x where x.event_id = any (v_events)) then -- rule:del-sales
    raise exception 'that event has sales: end it and keep or scratch them instead' using errcode = '55000';
  end if;
  if exists (select 1 from public.event_expenses x where x.event_id = any (v_events)) then -- rule:del-expenses
    raise exception 'that event has an expense in the books and cannot be deleted' using errcode = '55000';
  end if;
  if exists (select 1 from public.events e where e.id = any (v_events) and coalesce(e.variance_cents, 0) <> 0) then -- rule:del-drawer
    raise exception 'that event has a drawer difference in the books and cannot be deleted' using errcode = '55000';
  end if;
  if exists (select 1 from public.bazaar_fees f where (f.scheduled_id = p_booking or f.day_id = any (v_days))
               and f.ledger_id is not null) then -- rule:del-fee-booked
    raise exception 'that event has a fee in the books and cannot be deleted' using errcode = '55000';
  end if;
  if exists (select 1 from public.bazaar_kitchen_sources k where k.scheduled_id = p_booking)
     or exists (select 1 from public.bazaar_kitchen_moves m where m.scheduled_id = p_booking) then -- rule:del-kitchen
    raise exception 'that event uses recorded kitchen cookies and cannot be deleted' using errcode = '55000';
  end if;

  delete from public.bazaar_losses o where o.day_id = any (v_days);
  get diagnostics v_losses = row_count;
  delete from public.bazaar_stock_adds a where a.day_id = any (v_days);
  get diagnostics v_adds = row_count;
  delete from public.bazaar_fees f where f.scheduled_id = p_booking or f.day_id = any (v_days);
  get diagnostics v_fees = row_count;
  delete from public.bazaar_costs k where k.scheduled_id = p_booking;
  get diagnostics v_costs = row_count;
  select count(*)::integer into v_lines from public.bazaar_day_lines l where l.day_id = any (v_days);
  delete from public.bazaar_days d where d.scheduled_id = p_booking;
  delete from public.events e where e.id = any (v_events);
  get diagnostics v_n_ev = row_count;
  delete from public.scheduled_events s where s.id = p_booking;

  v_out := jsonb_build_object('deleted_at', (extract(epoch from v_now) * 1000)::bigint, 'days', coalesce(array_length(v_days, 1), 0),
                              'events', v_n_ev, 'day_lines', v_lines, 'costs', v_costs, 'fees', v_fees, 'losses', v_losses,
                              'stock_adds', v_adds);
  insert into public.audit_log (actor, action, entity, entity_id, detail)
  values (auth.uid(), 'bazaar.deleted', 'scheduled_events', p_booking::text,
          v_out || jsonb_build_object('name', v_s.name, 'starts_on', v_s.starts_on, 'ends_on', v_s.ends_on));
  return v_out;
end;
$$;
revoke execute on function public.delete_bazaar_booking(uuid, text) from public, anon, authenticated;
grant execute on function public.delete_bazaar_booking(uuid, text) to authenticated;
