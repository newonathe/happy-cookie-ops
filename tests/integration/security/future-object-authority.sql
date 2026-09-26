-- Future postgres/public table and sequence authority; every object rolls back.
begin;
create temporary table authority_results(operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated, service_role;

create schema mp06g_probe;
grant usage, create on schema mp06g_probe to anon, authenticated, service_role;
create sequence public.mp06g_future_id_seq;
create table public.mp06g_future (
  id bigint primary key default nextval('public.mp06g_future_id_seq'),
  note text not null default 'fixture'
);
alter sequence public.mp06g_future_id_seq owned by public.mp06g_future.id;
create function pg_temp.mp06g_harmless_trigger() returns trigger language plpgsql as $$
begin return new; end $$;
grant execute on function pg_temp.mp06g_harmless_trigger() to anon, authenticated, service_role;
__FUTURE_RED_GRANT__

create function pg_temp.assert_future_table_denied(actor text) returns void
language plpgsql security invoker as $$
declare operation text; state text;
begin
  foreach operation in array array['select','insert','update','delete','truncate','references','trigger'] loop
    begin
      case operation
        when 'select' then perform 1 from public.mp06g_future;
        when 'insert' then insert into public.mp06g_future(id, note) values (-60070001, 'denied');
        when 'update' then update public.mp06g_future set note = 'denied' where false;
        when 'delete' then delete from public.mp06g_future where false;
        when 'truncate' then truncate table public.mp06g_future;
        when 'references' then
          create table mp06g_probe.mp06g_fk (future_id bigint references public.mp06g_future(id));
        when 'trigger' then
          create trigger mp06g_denied before update on public.mp06g_future
          for each row execute function pg_temp.mp06g_harmless_trigger();
      end case;
      raise exception 'forbidden future table operation succeeded: % / %', actor, operation;
    exception when insufficient_privilege then
      get stacked diagnostics state = returned_sqlstate;
      if state <> '42501' then
        raise exception 'future table denial SQLSTATE differs: % / % / %', actor, operation, state;
      end if;
      insert into pg_temp.authority_results values ('table_' || operation, actor, 'denied_' || state);
    end;
    if operation = 'references' then drop table if exists mp06g_probe.mp06g_fk; end if;
  end loop;
end $$;

create function pg_temp.assert_future_sequence_denied(actor text) returns void
language plpgsql security invoker as $$
declare operation text; state text;
begin
  foreach operation in array array['select','nextval','setval'] loop
    begin
      case operation
        when 'select' then perform last_value from public.mp06g_future_id_seq;
        when 'nextval' then perform nextval('public.mp06g_future_id_seq');
        when 'setval' then perform setval('public.mp06g_future_id_seq', 7, false);
      end case;
      raise exception 'forbidden future sequence operation succeeded: % / %', actor, operation;
    exception when insufficient_privilege then
      get stacked diagnostics state = returned_sqlstate;
      if state <> '42501' then
        raise exception 'future sequence denial SQLSTATE differs: % / % / %', actor, operation, state;
      end if;
      insert into pg_temp.authority_results values ('sequence_' || operation, actor, 'denied_' || state);
    end;
  end loop;
end $$;
grant execute on function pg_temp.assert_future_table_denied(text),
  pg_temp.assert_future_sequence_denied(text) to anon, authenticated, service_role;

set local role anon;
select pg_temp.assert_future_table_denied('anon');
select pg_temp.assert_future_sequence_denied('anon');
reset role;
set local role authenticated;
select pg_temp.assert_future_table_denied('authenticated');
select pg_temp.assert_future_sequence_denied('authenticated');
reset role;

do $$
declare actor text; privilege text;
begin
  foreach actor in array array['anon','authenticated'] loop
    foreach privilege in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] loop
      if has_table_privilege(actor, 'public.mp06g_future', privilege) then
        raise exception 'effective future table privilege remains: % / %', actor, privilege;
      end if;
    end loop;
    foreach privilege in array array['SELECT','USAGE','UPDATE'] loop
      if has_sequence_privilege(actor, 'public.mp06g_future_id_seq', privilege) then
        raise exception 'effective future sequence privilege remains: % / %', actor, privilege;
      end if;
    end loop;
  end loop;
end $$;

set local role service_role;
insert into public.mp06g_future(note) values ('service') returning id;
update public.mp06g_future set note = 'service_updated' where note = 'service';
delete from public.mp06g_future where note = 'service_updated';
select 1 from public.mp06g_future;
reset role;
do $$
begin
  if not has_table_privilege('service_role', 'public.mp06g_future', 'SELECT,INSERT,UPDATE,DELETE')
     or not has_sequence_privilege('service_role', 'public.mp06g_future_id_seq', 'USAGE') then
    raise exception 'trusted future object authority missing';
  end if;
  if exists (select 1 from public.mp06g_future) then raise exception 'trusted future delete differs'; end if;
  insert into pg_temp.authority_results values
    ('table_select', 'service_role', 'passed'), ('table_insert_default_sequence', 'service_role', 'passed'),
    ('table_update', 'service_role', 'passed'), ('table_delete', 'service_role', 'passed');
  if (select count(*) from pg_temp.authority_results) <> 24 then
    raise exception 'future object result count differs';
  end if;
end $$;
select 'SEC_RESULT|future_object|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation, actor, outcome;
rollback;
