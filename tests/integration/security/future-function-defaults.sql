-- MP-06: prove the 28th migration's function default-privilege hardening
-- holds for any brand-new function, not just the reviewed manifest.
-- Rollback-only; run against a fresh 28-migration reset.
begin;

create temporary table mp06n_functions_before(identity text primary key, acl text);
insert into mp06n_functions_before
select p.oid::regprocedure::text, coalesce(p.proacl::text, 'NULL')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_(toast|temp)'
  and p.prokind = 'f';

do $$
begin
  if to_regnamespace('mp06n_scratch') is not null
     or to_regprocedure('public.mp06n_public()') is not null then
    raise exception 'MP-06 future-function probe names already exist';
  end if;
end $$;

create schema mp06n_scratch;
grant usage on schema mp06n_scratch to anon, authenticated, service_role, pg_monitor;

create function public.mp06n_public() returns integer language sql immutable as $$ select 1 $$;
create function mp06n_scratch.mp06n_scratch_fn() returns integer language sql immutable as $$ select 1 $$;

create temporary table mp06n_results(result text);

do $$
declare
  actor text;
  functions_before text[];
  functions_after text[];
begin
  -- The hardening migration's two revoke entries must be present.
  if not exists (
    select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0
      and d.defaclobjtype = 'f' and d.defaclacl::text = '{postgres=X/postgres}'
  ) then raise exception 'postgres global function default revoke entry missing'; end if;
  if exists (
    select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'f'
      and (d.defaclacl::text like '%anon=%' or d.defaclacl::text like '%authenticated=%')
  ) then raise exception 'public schema function default still names anon or authenticated'; end if;
  if not exists (
    select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'f'
      and d.defaclacl::text like '%service_role=%'
  ) then raise exception 'public schema function default lost the reviewed service_role grant'; end if;

  select array_agg(concat(identity, '|', acl) order by identity) into functions_before from mp06n_functions_before;
  select array_agg(concat(p.oid::regprocedure::text, '|', coalesce(p.proacl::text, 'NULL')) order by p.oid::regprocedure::text)
    into functions_after from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_(toast|temp)'
      and p.prokind = 'f' and p.proname not like 'mp06n_%';
  if functions_before is distinct from functions_after then
    raise exception 'an existing public or managed function ACL changed';
  end if;

  foreach actor in array array['anon', 'authenticated'] loop
    if has_function_privilege(actor, 'public.mp06n_public()', 'EXECUTE') then
      raise exception 'new public function is executable by %', actor;
    end if;
    if has_function_privilege(actor, 'mp06n_scratch.mp06n_scratch_fn()', 'EXECUTE') then
      raise exception 'new non-public function is executable by %', actor;
    end if;
  end loop;
  if has_function_privilege('pg_monitor', 'public.mp06n_public()', 'EXECUTE') then
    raise exception 'PUBLIC still receives EXECUTE on a new public function';
  end if;
  if has_function_privilege('pg_monitor', 'mp06n_scratch.mp06n_scratch_fn()', 'EXECUTE') then
    raise exception 'PUBLIC still receives EXECUTE on a new non-public function';
  end if;
  if not has_function_privilege('service_role', 'public.mp06n_public()', 'EXECUTE') then
    raise exception 'service_role lost EXECUTE on a new public function';
  end if;
  if has_function_privilege('service_role', 'mp06n_scratch.mp06n_scratch_fn()', 'EXECUTE') then
    raise exception 'service_role unexpectedly executes a new non-public function with no explicit grant';
  end if;

  insert into mp06n_results values
    ('SEC_RESULT|mp06n|global_and_public_defaults|both_revokes_present'),
    ('SEC_RESULT|mp06n|new_public_function|anon_authenticated_public_denied'),
    ('SEC_RESULT|mp06n|new_public_function|service_role_retained'),
    ('SEC_RESULT|mp06n|new_scratch_function|all_application_roles_denied'),
    ('SEC_RESULT|mp06n|managed_and_existing_acls|unchanged');
end $$;
select result from mp06n_results order by result;
rollback;
