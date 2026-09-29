-- D4 review fix: the stall rent is booked by the database, in the same transaction as the first link.
--
-- The phone used to book the rent after `link_scheduled_event` answered "first", with a random client id.
-- A lost reply, a failed link or a killed tab could then book it twice or never. Now the first link books
-- it, keyed on the booking ('rent:' + booking id), so a retry of the link is always harmless and the app only
-- has to retry the link. An event can also belong to one booking only.

create unique index scheduled_events_event_uq on public.scheduled_events (event_id) where event_id is not null;

/**
 * The booking became this event (the app has just started it). Returns true for the first link and false for a
 * repeat. The first link with rent above zero also writes the event's "Stall rent" expense (category
 * "Bazaar rent") and its ledger cost, exactly as add_event_expense does. A booking that is not active, or
 * already became another event, is refused; so is an event that already belongs to another booking (23505).
 */
create or replace function public.link_scheduled_event(p_scheduled uuid, p_event uuid)
returns table (first_link boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.scheduled_events%rowtype;
  v_event public.events%rowtype;
  v_client text;
  v_at timestamptz := now();
  v_ledger uuid;
begin
  if not public.is_owner() then
    raise exception 'only the owner may link a scheduled event' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('scheduled_event:' || p_scheduled::text, 0));
  select * into v_row from public.scheduled_events s where s.id = p_scheduled;
  if not found then -- rule:link-missing
    raise exception 'that booking does not exist' using errcode = 'P0002';
  end if;
  select * into v_event from public.events e where e.id = p_event;
  if not found then -- rule:link-event
    raise exception 'that event does not exist' using errcode = 'P0002';
  end if;
  if v_row.event_id is not null then
    if v_row.event_id <> p_event then -- rule:link-conflict
      raise exception 'that booking already became another event' using errcode = '23505';
    end if;
    return query select false;
    return;
  end if;
  if not v_row.active then -- rule:link-inactive
    raise exception 'that booking is switched off' using errcode = '22023';
  end if;
  update public.scheduled_events s set event_id = p_event where s.id = p_scheduled;
  if v_row.rent_cents > 0 then -- rule:link-rent
    v_client := 'rent:' || p_scheduled::text;
    insert into public.ledger_entries (kind, category, memo, amount_cents, occurred_at, created_by)
    values ('cost', 'Bazaar rent', v_event.name || ' — Stall rent', -v_row.rent_cents, v_at, auth.uid())
    returning id into v_ledger;
    insert into public.event_expenses (client_id, event_id, label, category, amount_cents, spent_at, ledger_id, payload_hash)
    values (v_client, p_event, 'Stall rent', 'Bazaar rent', v_row.rent_cents, v_at, v_ledger,
            encode(sha256(convert_to(v_client || ':' || v_row.rent_cents::text, 'UTF8')), 'hex'));
    insert into public.audit_log (actor, action, entity, entity_id, detail)
    values (auth.uid(), 'event.expense_added', 'event_expenses', v_client,
      jsonb_build_object('event_id', p_event, 'amount_cents', v_row.rent_cents, 'category', 'Bazaar rent'));
  end if;
  return query select true;
end;
$$;
revoke execute on function public.link_scheduled_event(uuid, uuid) from public, anon, authenticated;
grant execute on function public.link_scheduled_event(uuid, uuid) to authenticated;
