-- Quarantine generic client mutation RPCs until authoritative commands replace them.
-- Trusted service/database privileges and legacy bodies remain unchanged.
revoke execute on function public.sync_event_sale(jsonb) from public, anon, authenticated;
revoke execute on function public.update_order_state(text,timestamptz,text,text,text)
  from public, anon, authenticated;
