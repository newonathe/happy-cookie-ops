-- Staff records do not grant authority until explicitly activated by an administrator.
-- Existing role/display-name data is retained; existing profiles become inactive.
alter table public.profiles add column active boolean not null default false;

-- Preserve the existing function identity/grants and dependent policies.
create or replace function public.current_role_name() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles as p
  where p.id = auth.uid() and p.active is true
$$;
