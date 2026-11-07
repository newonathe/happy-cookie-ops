-- Activate physical transfers only with matching returns, finalization and reversal.
create function public.credit_bazaar_kitchen(p_booking uuid, p_product text, p_day uuid, p_qty integer, p_at timestamptz, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_seen public.bazaar_kitchen_moves%rowtype; v_source integer; v_records jsonb; v_body jsonb;
begin
  if not public.is_owner() then raise exception 'only the owner may return kitchen cookies' using errcode = '42501'; end if;
  select source_drop into strict v_source from public.bazaar_kitchen_sources where scheduled_id=p_booking and product_id=p_product;
  perform pg_advisory_xact_lock(hashtextextended('production:' || p_product, 0));
  select * into v_seen from public.bazaar_kitchen_moves where id=p_id;
  if found then
    if v_seen.scheduled_id<>p_booking or v_seen.product_id<>p_product or v_seen.day_id<>p_day
      or v_seen.kind<>'return' or v_seen.qty_delta<>p_qty then
      raise exception 'that return identity already has another effect' using errcode = '23505';
    end if;
    return;
  end if;
  if p_at < (select max(at) from public.bazaar_kitchen_moves
    where scheduled_id=p_booking and product_id=p_product and kind='transfer') then
    raise exception 'a return cannot precede its kitchen transfer' using errcode = 'ZB003';
  end if;
  select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into v_records
    from public.bazaar_kitchen_moves m cross join lateral jsonb_array_elements(m.source_records) x
    where m.scheduled_id=p_booking and m.product_id=p_product and m.kind='transfer';
  v_body:=jsonb_build_object('id',p_id,'day_id',p_day,'product_id',p_product,'qty',p_qty,'at',p_at);
  insert into public.bazaar_kitchen_moves values (p_id,p_booking,p_product,p_day,'return',p_qty,p_at,v_body,
    v_body||jsonb_build_object('kitchen_remaining',public.kitchen_cookie_balance(p_product,v_source)+p_qty),v_records,auth.uid());
  insert into public.audit_log(actor,action,entity,entity_id,detail)
    values(auth.uid(),'bazaar.kitchen_return','bazaar_kitchen_moves',p_id::text,v_body);
end;
$$;
revoke all on function public.credit_bazaar_kitchen(uuid,text,uuid,integer,timestamptz,uuid)
  from public, anon, authenticated, service_role;
create function public.return_closed_bazaar_kitchen()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v record; v_at timestamptz;
begin
  if old.closed_review is null and new.closed_review is not null then
    select closed_at into strict v_at from public.events where id=new.event_id;
    for v in select l.product_id,l.to_shop_qty from public.bazaar_day_lines l
      join public.bazaar_kitchen_sources s on s.scheduled_id=new.scheduled_id and s.product_id=l.product_id
      where l.day_id=new.id and l.to_shop_qty>0 order by l.product_id loop
      perform public.credit_bazaar_kitchen(new.scheduled_id,v.product_id,new.id,v.to_shop_qty,v_at,
        md5('bazaar:return:'||new.id::text||':'||v.product_id)::uuid);
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.return_closed_bazaar_kitchen() from public, anon, authenticated, service_role;
create trigger return_closed_bazaar_kitchen after update of closed_review on public.bazaar_days
  for each row execute function public.return_closed_bazaar_kitchen();
alter function public.finalise_bazaar_stock(uuid,integer,jsonb,text,timestamptz) rename to finalise_bazaar_stock_before_transfers;
create function public.finalise_bazaar_stock(p_booking uuid,p_drop integer,p_summary jsonb,p_name text,p_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_legacy jsonb; v record; v_k record; v_qty integer; v_returned integer; v_day uuid;
  v_id uuid; v_n integer; v_left numeric; v_short jsonb;
begin
  if not public.is_owner() then raise exception 'only the owner may finalise bazaar stock' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('stock_catalogue:items', 0));
  select coalesce(jsonb_agg(l), '[]'::jsonb) into v_legacy from jsonb_array_elements(p_summary->'cookie_cost'->'lines') l
    where not exists (select 1 from public.bazaar_kitchen_sources s where s.scheduled_id=p_booking and s.product_id=l->>'product_id');
  -- Legacy-only flavours and the booking-wide container rule retain their original code and order.
  perform public.finalise_bazaar_stock_before_transfers(p_booking,p_drop,
    jsonb_set(p_summary,'{cookie_cost,lines}',v_legacy),p_name,p_at);
  for v in select l->>'product_id' as pid,(l->>'made')::integer as made,(l->>'to_shop')::integer as returned
    from jsonb_array_elements(p_summary->'cookie_cost'->'lines') l join public.bazaar_kitchen_sources s
      on s.scheduled_id=p_booking and s.product_id=l->>'product_id' order by s.product_id loop
    select coalesce(sum(qty_delta),0)::integer into v_returned from public.bazaar_kitchen_moves
      where scheduled_id=p_booking and product_id=v.pid and kind='return';
    select d.id into v_day from public.bazaar_days d join public.bazaar_day_lines l on l.day_id=d.id
      where d.scheduled_id=p_booking and l.product_id=v.pid order by d.day desc limit 1;
    if v.returned>v_returned then
      perform public.credit_bazaar_kitchen(p_booking,v.pid,v_day,v.returned-v_returned,p_at,
        md5('bazaar:final-return:'||p_booking::text||':'||v.pid)::uuid);
    end if;
    v_qty:=v.made-v.returned;
    if v_qty<=0 or not exists(select 1 from public.recipe_ingredients where product_id=v.pid and kind='packaging') then continue; end if;
    v_id:=md5('bazaar:'||p_booking::text||':flavour:'||v.pid)::uuid;
    insert into public.production_records(id,kind,product_id,ref,qty,at,payload_hash,created_by)
      values(v_id,'sale',v.pid,'bazaar:'||p_booking::text,v_qty,p_at,
        encode(sha256(convert_to('bazaar:'||p_booking::text||':flavour:'||v.pid,'UTF8')),'hex'),auth.uid());
    v_n:=0; v_short:='[]'::jsonb;
    for v_k in select l.item_id,l.item_name as name,l.unit,l.qty*v_qty as amount,it.id is not null and it.unit=l.unit as ok,
      case when it.id is null then 'not a stock item' else 'unit differs' end as why
      from public.recipe_ingredients l left join public.inventory_items it on it.id=l.item_id
      where l.product_id=v.pid and l.kind='packaging' order by l.position,l.id loop
      v_n:=v_n+1;
      if v_k.ok then
        v_left:=public.use_stock_item(v_id,v_n,v_k.item_id,v_k.amount,'Bazaar: '||p_name,p_at,false);
        if v_left>0 then v_short:=v_short||jsonb_build_object('name',v_k.name,'by',round(v_left,1),'unit',v_k.unit); end if;
      else
        v_short:=v_short||jsonb_build_object('name',v_k.name,'by',round(v_k.amount,1),'unit',v_k.unit,'why',v_k.why);
      end if;
    end loop;
    update public.production_records set short=v_short where id=v_id;
  end loop;
end;
$$;
revoke all on function public.finalise_bazaar_stock(uuid,integer,jsonb,text,timestamptz)
  from public, anon, authenticated, service_role;
create function public.return_reversed_bazaar_kitchen()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v record; v_day uuid;
begin
  if old.reversed_at is null and new.reversed_at is not null then
    for v in select m.product_id,-sum(m.qty_delta)::integer as qty from public.bazaar_kitchen_moves m
      where m.scheduled_id=new.id group by m.product_id having sum(m.qty_delta)<0 order by m.product_id loop
      select d.id into v_day from public.bazaar_days d join public.bazaar_day_lines l on l.day_id=d.id
        where d.scheduled_id=new.id and l.product_id=v.product_id order by d.day desc limit 1;
      perform public.credit_bazaar_kitchen(new.id,v.product_id,v_day,v.qty,new.reversed_at,
        md5('bazaar:reverse-return:'||new.id::text||':'||v.product_id)::uuid);
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.return_reversed_bazaar_kitchen() from public, anon, authenticated, service_role;
create trigger return_reversed_bazaar_kitchen after update of reversed_at on public.scheduled_events
  for each row execute function public.return_reversed_bazaar_kitchen();
grant execute on function public.transfer_bazaar_stock(jsonb) to authenticated;
