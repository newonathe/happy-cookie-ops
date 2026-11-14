-- Plain items take no cookie slots (Ethan, 15 November 2026: stickers, ice cream and other items "stop using slots" on the online
-- order form).
--
-- A drop's capacity is counted in cookie slots: each order line is its quantity times its product's capacity_weight, stored on the
-- line when the order is placed (order_items.capacity_weight). A product whose type behaves as an item (migration 84) now weighs 0,
-- so its lines count for nothing in what an order requests and in what the drop has committed. Cookies and sets keep a weight of 1
-- to 48. The product-type trigger sets the weight with the behaviour on every write, so it cannot drift.
--
-- capacity_allows() and decideCapacity() (src/lib/rules/capacity.ts) change together: a request of zero slots now fits (an order of
-- only items asks for no cookies), where it used to be refused as "a zero-box request". An empty order is still impossible: an order
-- carries 1 to 50 lines of quantity 1 or more (place_order), and swaps and confirmations act on lines that exist.

alter table public.order_items drop constraint order_items_capacity_weight_check;
alter table public.order_items add constraint order_items_capacity_weight_check check (capacity_weight between 0 and 48);

alter table public.products drop constraint products_capacity_weight;
alter table public.products add constraint products_capacity_weight
  check (capacity_weight between 1 and 48 or (item_type = 'item' and capacity_weight = 0));

/**
 * A product's item_type is its type's behaviour, whoever writes the row (migration 84), and its capacity_weight follows: an item
 * weighs 0 cookie slots; a cookie or a set weighs at least 1 (a weight of 0 left over from an item becomes 1). A row inserted with
 * only an item_type (the default type) takes the built-in type of that behaviour; an 'item' needs a type of hers.
 */
create or replace function public.product_type_behaviour()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.type_id = 'cookie' and new.item_type is distinct from 'cookie' then
    if new.item_type = 'set' then
      new.type_id := 'set';
    else
      raise exception 'an item needs one of her product types' using errcode = '22023';
    end if;
  end if;
  select t.behaves_as into new.item_type from public.product_types t where t.id = new.type_id;
  if new.item_type is null then
    raise exception 'that product type does not exist' using errcode = '22023';
  end if;
  if new.item_type = 'item' then -- rule:item-weight-zero
    new.capacity_weight := 0;
  elsif new.capacity_weight < 1 then -- rule:cookie-weight-floor
    new.capacity_weight := 1;
  end if;
  return new;
end;
$$;
revoke all on function public.product_type_behaviour() from public, anon, authenticated, service_role;
drop trigger products_type_behaviour on public.products;
create trigger products_type_behaviour before insert or update of type_id, item_type, capacity_weight on public.products
for each row execute function public.product_type_behaviour();

-- Items already made weigh 0 from now; orders already placed keep the weights they were placed with.
update public.products set capacity_weight = 0 where item_type = 'item' and capacity_weight <> 0;

/**
 * The same decision as decideCapacity() in TypeScript (migration 4), now with a request of zero slots fitting: an order of only
 * items asks for no cookies. A negative request is still refused.
 */
create or replace function public.capacity_allows(
  p_capacity  integer,
  p_committed integer,
  p_requested integer
)
returns boolean
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
  select p_requested >= 0
     and p_requested <= greatest(0, greatest(0, floor(p_capacity)::integer)
                                    - greatest(0, floor(p_committed)::integer));
$$;
comment on function public.capacity_allows(integer, integer, integer) is
  'Mirror of decideCapacity() in src/lib/rules/capacity.ts. Change both together; tests/unit/capacity-parity.test.ts enforces it.';
