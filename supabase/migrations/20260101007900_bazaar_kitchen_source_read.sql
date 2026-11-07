-- Source provenance is read separately from legacy day quantities. Absence is a
-- genuine unmarked flavour; an unread response must never imply that absence.
create function public.get_bazaar_kitchen_sources(p_booking uuid)
returns table (product_id text, source_drop integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may read kitchen transfer sources' using errcode = '42501';
  end if;
  if p_booking is null then
    raise exception 'a booking is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.scheduled_events s where s.id = p_booking) then
    raise exception 'no such booking' using errcode = 'P0002';
  end if;
  return query select s.product_id,s.source_drop from public.bazaar_kitchen_sources s
    where s.scheduled_id = p_booking order by s.product_id;
end;
$$;
revoke all on function public.get_bazaar_kitchen_sources(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_bazaar_kitchen_sources(uuid) to authenticated;
