-- Private-token payment facts; existing owner operations only. Synthetic fixture rolls back.
begin;
insert into auth.users(id) values ('08200000-0000-4000-8000-000000000001');
insert into public.profiles(id,role,display_name,active)
values ('08200000-0000-4000-8000-000000000001','owner','Payment read fixture',true);
insert into public.products(id,name,short_name,price_cents,kind,published,active,sort_order,capacity_weight) values
 ('p082-a','Payment fixture A','A',10000,'Permanent',true,true,1,1),
 ('p082-b','Payment fixture B','B',15000,'Permanent',true,true,2,1);
insert into public.orders(id,customer_name,phone,ig,notes,pay_ref,state,pay_state,pay_method,total_cents,paid_cents,status_token)
values ('HC-820001','Private synthetic name','09170000000','@private.fixture','Private note','Private reference',
 'Payment review','unpaid','Synthetic payment method',10000,null,repeat('a',64));
insert into public.order_items(id,order_id,product_id,qty,unit_price_cents)
values ('08200000-0000-4000-8000-000000000002','HC-820001','p082-a',1,10000);
create function pg_temp.payment_stamp() returns timestamptz language sql security definer set search_path='' as $$
 select updated_at from public.orders where id='HC-820001'
$$;
revoke execute on function pg_temp.payment_stamp() from public;
grant execute on function pg_temp.payment_stamp() to authenticated;
create function pg_temp.assert_payment(expected_paid jsonb, expected_total bigint, expected_state text) returns void
language plpgsql security invoker as $$
declare s jsonb; again jsonb;
begin
 s:=public.order_status(repeat('a',64));
 if s->'paid_cents' is distinct from expected_paid or (s->>'total_cents')::bigint is distinct from expected_total
    or s->>'pay_state' is distinct from expected_state or s->>'order_no' is distinct from 'HC-820001' then
   raise exception 'private payment facts differ';
 end if;
 if s ?| array['customer_name','name','phone','mobile','ig','notes','pay_ref','status_token','refund_ref'] then
   raise exception 'private status leaked contact or payment reference';
 end if;
 again:=public.order_status(repeat('a',64));
 if s is distinct from again then raise exception 'duplicate status read changed facts'; end if;
 if public.order_status(null) is not null or public.order_status('bad') is not null
    or public.order_status(repeat('b',64)) is not null then raise exception 'private token boundary differs'; end if;
end $$;
grant execute on function pg_temp.assert_payment(jsonb,bigint,text) to anon,authenticated;
set local role anon;
select pg_temp.assert_payment('null'::jsonb,10000,'unpaid');
do $$ begin
 begin
   if exists(select 1 from public.orders where id='HC-820001') then
     raise exception 'anonymous raw order read succeeded';
   end if;
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','08200000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"08200000-0000-4000-8000-000000000001","app_role":"owner"}',true);
set local role authenticated;
select * from public.staff_confirm_payment('HC-820001',pg_temp.payment_stamp(),false);
select pg_temp.assert_payment('10000',10000,'confirmed');
select * from public.staff_swap_item('HC-820001','p082-a','p082-b','08200000-0000-4000-8000-000000000003',pg_temp.payment_stamp());
select pg_temp.assert_payment('10000',15000,'confirmed');
select * from public.staff_settle_balance('HC-820001',pg_temp.payment_stamp());
select pg_temp.assert_payment('15000',15000,'confirmed');
select * from public.staff_swap_item('HC-820001','p082-b','p082-a','08200000-0000-4000-8000-000000000004',pg_temp.payment_stamp());
select pg_temp.assert_payment('15000',10000,'confirmed');
select * from public.staff_refund('HC-820001','Synthetic refund reference',pg_temp.payment_stamp());
select pg_temp.assert_payment('15000',10000,'refunded');
reset role;
set local role anon;
select pg_temp.assert_payment('15000',10000,'refunded');
reset role;
do $$ begin
 if not exists(select 1 from public.orders where id='HC-820001' and state='Cancelled' and pay_state='refunded'
   and total_cents=10000 and paid_cents=15000 and customer_name='Private synthetic name'
   and phone='09170000000' and pay_ref='Private reference') then
   raise exception 'private reads changed the owner record';
 end if;
end $$;
select 'CUSTOMER_PAYMENT_READ|passed';
rollback;
