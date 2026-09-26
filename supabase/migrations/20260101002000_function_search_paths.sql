-- Pin trusted resolution without changing function bodies, identities or grants.
alter function public.anonymise_customer(text, text) set search_path = pg_catalog, public, pg_temp;
alter function public.capacity_allows(integer, integer, integer) set search_path = pg_catalog, public, pg_temp;
alter function public.consume_rate_limit(text, integer, integer) set search_path = pg_catalog, public, pg_temp;
alter function public.drop_remaining(uuid) set search_path = pg_catalog, public, pg_temp;
alter function public.is_owner() set search_path = pg_catalog, public, pg_temp;
alter function public.is_staff() set search_path = pg_catalog, public, pg_temp;
alter function public.lookup_order(text, text) set search_path = pg_catalog, public, pg_temp;
alter function public.prune_personal_data(integer) set search_path = pg_catalog, public, pg_temp;
alter function public.prune_rate_limits() set search_path = pg_catalog, public, pg_temp;
alter function public.settings_effective() set search_path = pg_catalog, public, pg_temp;
alter function public.settings_touch() set search_path = pg_catalog, public, pg_temp;
alter function public.state_is_recognised(public.order_state) set search_path = pg_catalog, public, pg_temp;
alter function public.state_reserves_capacity(public.order_state) set search_path = pg_catalog, public, pg_temp;
alter function public.sync_event_sale(jsonb) set search_path = pg_catalog, public, pg_temp;
alter function public.touch_updated_at() set search_path = pg_catalog, public, pg_temp;
alter function public.update_order_state(text, timestamp with time zone, text, text, text) set search_path = pg_catalog, public, pg_temp;
