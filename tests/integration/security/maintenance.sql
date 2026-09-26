-- Real SQL-role invocations on synthetic data; all mutations are rolled back.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

insert into public.orders (id, customer_name, phone, total_cents, placed_at)
values ('mp06-old', 'Synthetic old', '09000000001', 100, now()-interval '800 days'),
       ('mp06-recent', 'Synthetic recent', '09000000002', 100, now());
insert into public.rate_limits (key, window_start, count)
values ('mp06-stale', now()-interval '3 hours', 1);

-- A SECURITY INVOKER test helper catches only the expected insufficient-privilege
-- SQLSTATE. Any other error or successful forbidden invocation fails the suite.
create function pg_temp.assert_maintenance_denied(actor text) returns void
language plpgsql security invoker as $$
declare statement text; operation text;
begin
  foreach operation in array array['consume_rate_limit','prune_rate_limits','prune_personal_data'] loop
    statement := case operation
      when 'consume_rate_limit' then 'select public.consume_rate_limit(''mp06-denied'',1,60)'
      when 'prune_rate_limits' then 'select public.prune_rate_limits()'
      else 'select public.prune_personal_data(0)' end;
    begin
      execute statement;
      raise exception 'forbidden maintenance invocation succeeded: % / %', actor, operation;
    exception when insufficient_privilege then
      insert into pg_temp.authority_results values (operation, actor, 'denied_42501');
    end;
  end loop;
end;
$$;
grant execute on function pg_temp.assert_maintenance_denied(text) to anon, authenticated;

set local role anon;
select pg_temp.assert_maintenance_denied('anon');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","app_role":"owner"}',true);
select pg_temp.assert_maintenance_denied('authenticated_owner_claim');
select set_config('request.jwt.claims','{"role":"authenticated","app_role":"helper"}',true);
select pg_temp.assert_maintenance_denied('authenticated_helper_claim');
select set_config('request.jwt.claims','{"role":"authenticated","app_role":"support"}',true);
select pg_temp.assert_maintenance_denied('authenticated_support_claim');
select set_config('request.jwt.claims','{"role":"service_role","app_role":"owner"}',true);
select pg_temp.assert_maintenance_denied('authenticated_forged_service_claim');
reset role;

do $$ begin
  if (select count(*) from public.orders where phone <> '') <> 2
     or (select count(*) from public.rate_limits) <> 1 then
    raise exception 'denied calls changed test fixtures';
  end if;
end $$;

set local role service_role;
do $$ declare result record; count_changed integer;
begin
  select * into result from public.consume_rate_limit('mp06-service',1,60);
  if result.allowed is distinct from true or result.remaining <> 0 or result.reset_at <= now() then
    raise exception 'service rate-limit first result differs';
  end if;
  select * into result from public.consume_rate_limit('mp06-service',1,60);
  if result.allowed is distinct from false or result.remaining <> 0 then
    raise exception 'service exhausted rate-limit result differs';
  end if;
  insert into pg_temp.authority_results values ('consume_rate_limit','service_role','allowed_then_exhausted');
  select public.prune_rate_limits() into count_changed;
  if count_changed <> 1 then raise exception 'service stale counter prune differs'; end if;
  insert into pg_temp.authority_results values ('prune_rate_limits','service_role','one_stale_counter');
  select public.prune_personal_data(730) into count_changed;
  if count_changed <> 1 then raise exception 'service retention prune differs'; end if;
  insert into pg_temp.authority_results values ('prune_personal_data','service_role','one_old_order');
end $$;
reset role;

do $$ declare signature text; actor text;
begin
  if (select phone from public.orders where id='mp06-old') <> ''
     or (select phone from public.orders where id='mp06-recent') <> '09000000002'
     or (select count(*) from public.rate_limits where key='mp06-service') <> 1
     or (select count(*) from pg_temp.authority_results) <> 18 then
    raise exception 'maintenance effects/result count differ';
  end if;
  foreach signature in array array['public.consume_rate_limit(text,integer,integer)',
      'public.prune_rate_limits()','public.prune_personal_data(integer)'] loop
    foreach actor in array array['anon','authenticated'] loop
      if has_function_privilege(actor,signature,'EXECUTE') then
        raise exception 'effective maintenance execute still granted';
      end if;
    end loop;
    if not has_function_privilege('service_role',signature,'EXECUTE') then
      raise exception 'service execute missing';
    end if;
  end loop;
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation,actor;
rollback;
