-- Appended inside the unchanged kitchen-journal fixture before its rollback.
insert into public.products(id,name,short_name,price_cents,item_type,kind,published)
 values ('p077-cookie','Synthetic alternate cookie','Alternate cookie',10000,'cookie','Permanent',true);
do $$ declare code text:='00000'; begin
 begin perform public.staff_swap_item('P077-SOURCEPACK','p077-source-cookie','p077-cookie',
  'b0771000-0000-4000-8000-000000000001',(select updated_at from public.orders where id='P077-SOURCEPACK'));
 exception when others then get stacked diagnostics code=returned_sqlstate; end;
 perform pg_temp.journal_assert(code='55000','packed stock swap returned '||code||'; kitchen='||public.kitchen_cookie_balance('p077-source-cookie',5));
end $$;
select pg_temp.journal_assert(public.kitchen_cookie_balance('p077-source-cookie',5)=0,'packed cookie identities cannot move');
insert into public.production_records(id,kind,product_id,qty,target,drop_no,at,payload_hash,created_by)
 values ('b0772000-0000-4000-8000-000000000001','batch','p077-cookie',6,6,5,now(),repeat('0',64),auth.uid());
insert into public.orders(id,customer_name,phone) values ('P077-REPLAY','Synthetic replay','09170000002');
insert into public.order_items(order_id,product_id,qty,unit_price_cents) values ('P077-REPLAY','p077-source-cookie',1,10000);
select public.staff_swap_item('P077-REPLAY','p077-source-cookie','p077-cookie',
 'b0773000-0000-4000-8000-000000000001',(select updated_at from public.orders where id='P077-REPLAY'));
select public.record_pack('P077-REPLAY',5);
select pg_temp.journal_assert((select replayed from public.staff_swap_item('P077-REPLAY','p077-source-cookie','p077-cookie',
 'b0773000-0000-4000-8000-000000000001',null)),'historical swap replay survives packing');
select pg_temp.journal_refuses($q$select public.staff_swap_item('P077-REPLAY','p077-source-cookie','p077-source-cookie',
 'b0773000-0000-4000-8000-000000000001',null)$q$,'23505');
select 'PACKED_STOCK|passed';
