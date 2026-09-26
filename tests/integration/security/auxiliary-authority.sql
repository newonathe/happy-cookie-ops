-- Sequence state is restored by the owning Python fixture even after a red failure.
begin;
create schema mp06f_probe;
grant usage,create on schema mp06f_probe to anon,authenticated,service_role;
create temporary table authority_results(operation text,actor text,outcome text);
grant insert on authority_results to anon,authenticated,service_role;
create function pg_temp.assert_auxiliary_denied(actor text) returns void language plpgsql security invoker as $$
declare t text; k text; typ text; op text;
begin
 foreach t in array array['audit_log','bake_batches','drops','erasure_requests','event_sale_items','event_sales','events','inventory_items','ledger_entries','order_items','orders','products','profiles','rate_limits','recipe_ingredients','recipes','settings','supplier_prices','suppliers'] loop
  select string_agg(format('%I',a.attname),',' order by a.attnum),
   string_agg(format('%I %s',a.attname,format_type(a.atttypid,a.atttypmod)),',' order by a.attnum) into k,typ
   from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
   where i.indrelid=format('public.%I',t)::regclass and i.indisprimary;
  if k is null then raise exception 'missing primary key fixture: %',t; end if;
  execute format('create table mp06f_probe.mp06f_fk(%s)',typ);
  begin
   execute format('alter table mp06f_probe.mp06f_fk add foreign key(%s) references public.%I(%s)',k,t,k);
   raise exception 'references boundary missing: % / %',actor,t;
  exception when insufficient_privilege then
   insert into authority_results values('references_'||t,actor,'denied');
  end;
  drop table mp06f_probe.mp06f_fk;
 end loop;
 -- UPDATE also permits nextval: setval runs first to identify its red oracle.
 foreach op in array array['read','setval','nextval'] loop
  begin
   case op
    when 'read' then perform last_value from public.audit_log_id_seq;
    when 'setval' then perform setval('public.audit_log_id_seq',7,false);
    when 'nextval' then perform nextval('public.audit_log_id_seq');
   end case;
   raise exception 'sequence boundary missing: % / %',actor,op;
  exception when insufficient_privilege then
   insert into authority_results values('sequence_'||op,actor,'denied');
  end;
 end loop;
end $$;
set local role anon;
select pg_temp.assert_auxiliary_denied('anon');
reset role;
set local role authenticated;
select pg_temp.assert_auxiliary_denied('authenticated');
reset role;
set local role service_role;
create table mp06f_probe.mp06f_service(v text references public.orders(id));
insert into authority_results values('references_orders','service_role','passed');
insert into public.audit_log(action,entity) values('mp06f','synthetic');
do $$ begin
 if (select count(*) from public.audit_log where action='mp06f' and id>0)<>1 then raise exception 'trusted audit default sequence failed'; end if;
end $$;
insert into authority_results values('audit_sequence_insert','service_role','passed');
reset role;
select 'SEC_RESULT|auxiliary|'||operation||'|'||actor||'|'||outcome from authority_results order by operation,actor;
rollback;
