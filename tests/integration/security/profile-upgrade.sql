-- Rehearse the new forward migration against one populated legacy profile.
-- The schema rewind and all synthetic data exist only in this rollback transaction.
begin;
create or replace function public.current_role_name() returns public.app_role
language sql stable security definer set search_path=public as $$
  select role from profiles where id=auth.uid()
$$;
alter table public.profiles drop column active;
insert into auth.users(id) values('a6c20000-0000-4000-8000-000000000099');
insert into public.profiles(id,role,display_name)
values('a6c20000-0000-4000-8000-000000000099','owner','Preserved legacy owner');
__ACTIVE_MIGRATION__
select set_config('request.jwt.claim.sub','a6c20000-0000-4000-8000-000000000099',true);
set local role authenticated;
do $$ begin
  if public.current_role_name() is not null or public.is_owner() or public.is_staff() then
    raise exception 'legacy profile retained authority without activation';
  end if;
  if not exists(select 1 from public.profiles where id=auth.uid()
      and role='owner' and display_name='Preserved legacy owner' and active=false) then
    raise exception 'legacy profile data/default was not preserved';
  end if;
end $$;
reset role;
select 'UPGRADE|passed';
rollback;
