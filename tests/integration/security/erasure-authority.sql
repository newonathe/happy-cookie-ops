-- Synthetic erasure authority and effects; the transaction always rolls back.
begin;
create temporary table authority_results (operation text, actor text, outcome text);
grant insert on authority_results to anon, authenticated;

insert into auth.users(id)
select ('a6c26000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid
from generate_series(1,5) i;
insert into public.profiles(id,role,display_name,active) values
  ('a6c26000-0000-4000-8000-000000000001','owner','Erasure owner',true),
  ('a6c26000-0000-4000-8000-000000000002','helper','Erasure helper',true),
  ('a6c26000-0000-4000-8000-000000000003','support','Erasure support',true),
  ('a6c26000-0000-4000-8000-000000000004','owner','Erasure inactive owner',false);
insert into public.products(id,name,short_name,price_cents,kind)
values ('mp06l-product','Synthetic product','MP06L',100,'cookie');
insert into public.orders(id,customer_name,phone,state,pay_state,total_cents,packaging_cents,pay_method,pay_ref,notes) values
  ('MP06L-PENDING','Pending customer','0917 000 0123','Payment review','unpaid',100,0,null,null,'Pending note'),
  ('MP06L-PAID','Paid customer','09170000123','Confirmed','confirmed',2300,100,'gcash','synthetic-ref','Paid note'),
  ('MP06L-OTHER','Other customer','09170000999','Confirmed','confirmed',500,0,'cash','other-ref','Other note');
insert into public.order_items(order_id,product_id,qty,unit_price_cents) values
  ('MP06L-PENDING','mp06l-product',1,100),
  ('MP06L-PAID','mp06l-product',2,1100);
create temporary table original_fixture as
select (select jsonb_agg(to_jsonb(o) order by o.id) from public.orders o) as orders,
       (select jsonb_agg(to_jsonb(i) order by i.order_id) from public.order_items i) as items,
       (select jsonb_agg(to_jsonb(r) order by r.id) from public.erasure_requests r) as requests;

create function pg_temp.set_subject(n integer, claim_role text) returns void
language plpgsql security invoker as $$
declare subject text := 'a6c26000-0000-4000-8000-' || lpad(n::text,12,'0');
begin
  perform set_config('request.jwt.claim.sub',subject,true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',subject,'role',claim_role,'app_role','owner')::text,true);
end $$;
create function pg_temp.assert_erasure_denied(actor text, expected_state text) returns void
language plpgsql security invoker as $$
declare actual_state text; actual_message text;
begin
  begin
    perform public.anonymise_customer('+63 917-000-0123','denied');
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate,
      actual_message = message_text;
    if actual_state <> expected_state then
      raise exception 'erasure ACL boundary missing: % / expected % / got %',
        actor,expected_state,actual_state;
    end if;
    if expected_state = 'P0001' and
       actual_message is distinct from 'only the owner may action an erasure request' then
      raise exception 'erasure owner check differs: % / %',actor,actual_message;
    end if;
    insert into pg_temp.authority_results values('denied',actor,actual_state);
    return;
  end;
  raise exception 'erasure ACL boundary missing: % / call succeeded',actor;
end $$;
grant execute on function pg_temp.set_subject(integer,text),
  pg_temp.assert_erasure_denied(text,text) to anon, authenticated;

set local role anon;
select pg_temp.set_subject(1,'authenticated');
select pg_temp.assert_erasure_denied('anon_forged_owner','42501');
reset role;
set local role authenticated;
select pg_temp.set_subject(2,'service_role');
select pg_temp.assert_erasure_denied('active_helper_forged_service','P0001');
select pg_temp.set_subject(3,'service_role');
select pg_temp.assert_erasure_denied('active_support_forged_service','P0001');
select pg_temp.set_subject(4,'service_role');
select pg_temp.assert_erasure_denied('inactive_owner_forged_service','P0001');
select pg_temp.set_subject(5,'service_role');
select pg_temp.assert_erasure_denied('missing_profile_forged_service','P0001');
reset role;

do $$ begin
  if (select orders from pg_temp.original_fixture) is distinct from
       (select jsonb_agg(to_jsonb(o) order by o.id) from public.orders o)
    or (select items from pg_temp.original_fixture) is distinct from
       (select jsonb_agg(to_jsonb(i) order by i.order_id) from public.order_items i)
    or (select requests from pg_temp.original_fixture) is distinct from
       (select jsonb_agg(to_jsonb(r) order by r.id) from public.erasure_requests r) then
    raise exception 'denied erasure changed synthetic rows or log';
  end if;
  insert into pg_temp.authority_results values('denied_effects','all','unchanged');
end $$;

set local role authenticated;
select pg_temp.set_subject(1,'authenticated');
do $$ declare affected integer; begin
  affected := public.anonymise_customer('+63 917-000-0123','synthetic request');
  if affected is distinct from 2 then raise exception 'erasure count differs: %',affected; end if;
  insert into pg_temp.authority_results values('owner_count','active_owner','2');
end $$;
reset role;

do $$ declare f pg_proc%rowtype; begin
  if exists(select 1 from public.orders where id='MP06L-PENDING')
     or exists(select 1 from public.order_items where order_id='MP06L-PENDING') then
    raise exception 'unpaid pending order or item survived erasure';
  end if;
  insert into pg_temp.authority_results values('pending','active_owner','deleted_with_item');
  if not exists(select 1 from public.orders where id='MP06L-PAID'
      and state='Confirmed' and pay_state='confirmed' and total_cents=2300
      and packaging_cents=100 and pay_method='gcash' and pay_ref='synthetic-ref'
      and customer_name='Removed on request' and phone='' and notes='')
     or (select count(*) from public.order_items where order_id='MP06L-PAID'
         and qty=2 and unit_price_cents=1100) <> 1 then
    raise exception 'confirmed financial record was not preserved and anonymised';
  end if;
  insert into pg_temp.authority_results values('confirmed','active_owner','money_and_item_preserved');
  if not exists(select 1 from public.orders where id='MP06L-OTHER'
      and customer_name='Other customer' and phone='09170000999'
      and total_cents=500 and notes='Other note') then
    raise exception 'unrelated customer changed';
  end if;
  insert into pg_temp.authority_results values('unrelated','active_owner','untouched');
  if (select count(*) from public.erasure_requests where
      phone_hash='7268d73217140d47edbb2f7abda12a5e75d7e05c94593d5ad7d28e14a88b2c4b'
      and action='anonymised' and note='synthetic request' and orders_affected=2
      and actioned_at is not null) <> 1
     or (select count(*) from public.erasure_requests) <> 1 then
    raise exception 'erasure log digest, action or count differs';
  end if;
  insert into pg_temp.authority_results values('log','active_owner','sha256_and_count');
  select * into strict f from pg_proc where oid='public.anonymise_customer(text,text)'::regprocedure;
  if pg_get_userbyid(f.proowner) <> 'postgres' or not f.prosecdef
     or f.prorettype <> 'integer'::regtype or f.provolatile <> 'v'
     or f.proconfig <> array['search_path=pg_catalog, public, pg_temp']
     or f.pronargdefaults <> 1
     or position('extensions.digest' in pg_get_functiondef(f.oid)) = 0
     or exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
         where a.grantee=0 and a.privilege_type='EXECUTE')
     or has_function_privilege('anon',f.oid,'EXECUTE')
     or not has_function_privilege('authenticated',f.oid,'EXECUTE')
     or not has_function_privilege('service_role',f.oid,'EXECUTE') then
    raise exception 'erasure function metadata or effective grants differ';
  end if;
  insert into pg_temp.authority_results values('metadata','function','trusted_path_and_acl');
  if (select count(*) from pg_temp.authority_results) <> 12 then
    raise exception 'erasure result count differs';
  end if;
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome
from pg_temp.authority_results order by operation,actor,outcome;
rollback;
