-- MP-06m: measure postgres function defaults in a rollback-only transaction.
begin;

create temporary table mp06m_expected(defaults text primary key);
insert into mp06m_expected
select concat(d.defaclrole::regrole, '|', coalesce(d.defaclnamespace::regnamespace::text, ''), '|', d.defaclobjtype, '|', coalesce(d.defaclacl::text, 'NULL'))
from pg_default_acl d where d.defaclobjtype = 'f';

create temporary table mp06m_functions(identity text primary key, acl text);
create temporary table mp06m_results(result text);
insert into mp06m_functions
select p.oid::regprocedure::text, coalesce(p.proacl::text, 'NULL')
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_(toast|temp)'
  and p.prokind = 'f';

do $$
begin
  if to_regnamespace('mp06m_scratch') is not null
     or to_regprocedure('public.mp06m_pre_public()') is not null
     or to_regprocedure('public.mp06m_post_public()') is not null then
    raise exception 'MP-06m probe names already exist';
  end if;
end $$;

create schema mp06m_scratch;
grant usage on schema mp06m_scratch to anon, authenticated, service_role, pg_monitor;

create function public.mp06m_pre_public() returns integer language sql immutable as $$ select 1 $$;
create function mp06m_scratch.mp06m_pre_scratch() returns integer language sql immutable as $$ select 1 $$;

alter default privileges for role postgres revoke execute on functions from public;

create function public.mp06m_post_public() returns integer language sql immutable as $$ select 2 $$;
create function mp06m_scratch.mp06m_post_scratch() returns integer language sql immutable as $$ select 2 $$;

do $$
declare
  actor text;
  privilege boolean;
  defaults_before text[];
  defaults_after text[];
  functions_before text[];
  functions_after text[];
begin
  select array_agg(defaults order by defaults) into defaults_before from mp06m_expected;
  select array_agg(concat(d.defaclrole::regrole, '|', coalesce(d.defaclnamespace::regnamespace::text, ''), '|', d.defaclobjtype, '|', coalesce(d.defaclacl::text, 'NULL')) order by 1)
    into defaults_after from pg_default_acl d where d.defaclobjtype = 'f';
  if coalesce(cardinality(defaults_after), 0) <> coalesce(cardinality(defaults_before), 0) + 1
     or exists (select 1 from unnest(coalesce(defaults_before, array[]::text[])) as prior(value) where not (value = any(coalesce(defaults_after, array[]::text[])))) then
    raise exception 'function default ACL delta is not exactly one added entry';
  end if;
  if not exists (
    select 1 from pg_default_acl d where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 0 and d.defaclobjtype = 'f'
      and d.defaclacl::text = '{postgres=X/postgres}'
  ) then raise exception 'postgres global function default revoke entry missing'; end if;

  select array_agg(concat(identity, '|', acl) order by identity) into functions_before from mp06m_functions;
  select array_agg(concat(p.oid::regprocedure::text, '|', coalesce(p.proacl::text, 'NULL')) order by p.oid::regprocedure::text)
    into functions_after from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema') and n.nspname !~ '^pg_(toast|temp)'
      and p.prokind = 'f' and p.proname not like 'mp06m_%';
  if functions_before is distinct from functions_after then raise exception 'an existing public or managed function ACL changed'; end if;
  if not exists (
    select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'mp06m_post_public'
      and (select array_agg(a.grantee order by a.grantee) from aclexplode(p.proacl) a where a.privilege_type = 'EXECUTE' and not a.is_grantable)
        = (select array_agg(grantee_oid order by grantee_oid) from unnest(array['postgres'::regrole::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid, 'service_role'::regrole::oid]) as roles(grantee_oid))
      and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 or a.privilege_type <> 'EXECUTE' or a.is_grantable)
  ) then raise exception 'public schema function defaults differ from the expected explicit EXECUTE grants'; end if;

  foreach actor in array array['anon','authenticated','service_role','pg_monitor'] loop
    privilege := has_function_privilege(actor, 'public.mp06m_pre_public()', 'EXECUTE');
    if actor in ('anon','authenticated','service_role') and not privilege then raise exception 'pre-change public grant missing for %', actor; end if;
    if actor = 'pg_monitor' and not privilege then raise exception 'pre-change global PUBLIC EXECUTE default missing'; end if;
    privilege := has_function_privilege(actor, 'public.mp06m_post_public()', 'EXECUTE');
    if actor in ('anon','authenticated','service_role') and not privilege then raise exception 'global-only candidate unexpectedly removed public schema grant for %', actor; end if;
    if actor = 'pg_monitor' and privilege then raise exception 'unrelated role unexpectedly executes public post-change function'; end if;
    privilege := has_function_privilege(actor, 'mp06m_scratch.mp06m_pre_scratch()', 'EXECUTE');
    if actor in ('anon','authenticated','service_role','pg_monitor') and not privilege then raise exception 'pre-change implicit PUBLIC execute missing for %', actor; end if;
    privilege := has_function_privilege(actor, 'mp06m_scratch.mp06m_post_scratch()', 'EXECUTE');
    if privilege then raise exception 'post-change scratch function remains executable by %', actor; end if;
  end loop;

  insert into mp06m_results values
    ('SEC_RESULT|mp06m|global_default_delta|one_postgres_function_entry'),
    ('SEC_RESULT|mp06m|public_global_only|insufficient_explicit_public_defaults_persist'),
    ('SEC_RESULT|mp06m|scratch_global_revoke|implicit_execute_removed'),
    ('SEC_RESULT|mp06m|managed_and_existing_acls|unchanged');
end $$;
select result from mp06m_results order by result;
rollback;

