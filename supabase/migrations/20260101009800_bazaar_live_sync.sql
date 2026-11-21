-- S4 (20 November 2026): every phone and laptop on the open bazaar day sees new sales, voids, stock adds and losses within seconds.
--
-- Supabase Realtime (postgres_changes) sends a row change to a subscriber only if the subscriber's own role could SELECT that row, so
-- the work here is the read rule, not the wiring:
--
--   publication supabase_realtime   gains event_sales (a sale and a void: a void sets voided_at on the sale), bazaar_losses (a loss and
--                                   its void) and bazaar_stock_adds. Nothing else: no money, order, stock-book or people table. A void
--                                   that arrives before its sale is a marker row (event_sale_voids) that names no event and is not
--                                   published; the sale shows, already voided, when it lands.
--   SELECT policies                 event_sales, bazaar_losses and bazaar_stock_adds are readable by the owner, and by an active helper
--                                   for the day that is open now, through two thin wrappers over the S2/S3 rules (bazaar_day_access /
--                                   is_active_helper + bazaar_event_open). Anyone else - anon, a helper whose access has expired or
--                                   been removed, a helper for a closed day, support - gets no row, so no change event either.
--   table grants                    bazaar_losses and bazaar_stock_adds had no API grant at all (their rows were read by security
--                                   definer functions). Realtime evaluates the policy as the subscriber, which needs SELECT, so
--                                   `authenticated` gets SELECT on those two; anon and service_role are untouched. event_sales
--                                   already had it. Writes stay with the commands: no insert/update/delete grant, no write policy.
--
-- What a helper can read through these policies is what get_bazaar_day already returns them for the open day (every sale, void, the
-- stock moves behind the table stock). No column or table beyond that day is reachable: the policies are day-scoped.
--
-- The two wrappers are the only new functions. They are granted to `authenticated` (a policy runs its functions with the caller's own
-- rights, so a function with no grant makes every read of the table fail); they take a uuid and return a boolean, change nothing, and
-- reveal only whether the caller may read that day.

-- ------------------------------------------------------------------ the read rules (used by the policies)

create or replace function public.bazaar_day_readable(p_day uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_day is not null and public.bazaar_day_access(p_day);
$$;
revoke execute on function public.bazaar_day_readable(uuid) from public, anon, authenticated, service_role;
grant execute on function public.bazaar_day_readable(uuid) to authenticated;

create or replace function public.bazaar_event_readable(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_owner() or (p_event is not null and public.is_active_helper() and public.bazaar_event_open(p_event));
$$;
revoke execute on function public.bazaar_event_readable(uuid) from public, anon, authenticated, service_role;
grant execute on function public.bazaar_event_readable(uuid) to authenticated;

-- ------------------------------------------------------------------ table read access

-- event_sales: the owner's read, widened to an active helper for the open day's sales (rule:sales-read). Signed-in callers only: for anon the
-- policy no longer applies at all, so an anonymous read is an empty result and never a permission error from the function below.
alter policy "sales staff read" on public.event_sales to authenticated using ((select public.bazaar_event_readable(event_id))); -- rule:sales-read

grant select on table public.bazaar_losses, public.bazaar_stock_adds to authenticated;

create policy "bazaar losses read" on public.bazaar_losses for select to authenticated
  using ((select public.bazaar_day_readable(day_id))); -- rule:losses-read
create policy "bazaar stock adds read" on public.bazaar_stock_adds for select to authenticated
  using ((select public.bazaar_day_readable(day_id))); -- rule:stock-adds-read

-- ------------------------------------------------------------------ the publication

-- A plain Postgres (the test harness) has no supabase_realtime; Supabase creates it empty. Create it only when it is missing, never
-- change a FOR ALL TABLES publication (it would already carry these tables, and every other one), and add each table once.
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['event_sales', 'bazaar_losses', 'bazaar_stock_adds'] loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
