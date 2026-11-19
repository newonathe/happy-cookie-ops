-- Café (wholesale) prices, owner only. Cine sells in bulk to cafés and events at a lower price than the order form shows; she
-- sets that price herself, per product, and nothing here touches the retail price (`products.price_cents`), the order form
-- (`shop_products`), `place_order` or any bazaar day price list.
--
-- A product with no row in `product_cafe_prices` uses the DEFAULT café price: the retail price times 0.7, rounded DOWN to the nearest
-- ₱5 (₱130 -> ₱90). The rule lives in ONE place, `default_cafe_price_cents`, and every read returns its answer, so no client repeats
-- it. If that rounds to less than ₱5 (a retail price under about ₱7.15) the default is the retail price itself, never zero.
-- The default follows the retail price: change a retail price and every product without her own café price moves with it.
--
-- A product priced at ₱0 has no café price (nothing to take 70 % of): it is left out of the list and refused by the setter.
--
-- `product_cafe_prices` has no direct grants (RLS on, no policy); the two functions below are the only way in. Both are owner only.

create table public.product_cafe_prices (
  product_id text primary key references public.products (id) on delete cascade,
  price_cents bigint not null check (price_cents between 1 and 100000000),
  set_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.product_cafe_prices enable row level security;
revoke all on table public.product_cafe_prices from public, anon, authenticated;

/** The default café price (centavos) for a retail price (centavos): 70 %, rounded down to a multiple of ₱5, never zero. */
create function public.default_cafe_price_cents(p_retail_cents bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_retail_cents is null or p_retail_cents < 1 then null
    when (p_retail_cents * 7 / 10 / 500) * 500 >= 500 then (p_retail_cents * 7 / 10 / 500) * 500
    else p_retail_cents
  end
$$;
revoke execute on function public.default_cafe_price_cents(bigint) from public, anon, authenticated;

/**
 * Every product still on the list (not removed), in menu order: its retail price, the default café price, her own café price when
 * she set one (null otherwise) and the price in effect (hers, else the default), all centavos. Owner only (42501 otherwise).
 */
create function public.get_cafe_prices()
returns table (
  product_id text, name text, price_cents bigint, default_cents bigint,
  cafe_price_cents bigint, effective_cents bigint, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then -- rule:cafe-read-owner
    raise exception 'only the owner may read the café prices' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.price_cents, public.default_cafe_price_cents(p.price_cents),
           c.price_cents, coalesce(c.price_cents, public.default_cafe_price_cents(p.price_cents)), c.updated_at
      from public.products p
      left join public.product_cafe_prices c on c.product_id = p.id
     where p.archived_at is null and p.price_cents > 0 -- rule:cafe-priced
     order by p.sort_order, p.id;
end;
$$;
revoke execute on function public.get_cafe_prices() from public, anon, authenticated;
grant execute on function public.get_cafe_prices() to authenticated;

/**
 * Sets one product's café price (centavos, 1 to 100000000) or, with a null price, clears it so the default applies again. Setting the
 * same value twice is the same change. Refuses, writing nothing: 42501 not the owner; 22023 a malformed product id or a price outside
 * the range; P0002 no such product, it was removed, or it is priced at ₱0. Returns that product's row, as get_cafe_prices does.
 */
create function public.set_cafe_price(p_product_id text, p_price_cents bigint)
returns table (
  product_id text, name text, price_cents bigint, default_cents bigint,
  cafe_price_cents bigint, effective_cents bigint, updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then -- rule:cafe-set-owner
    raise exception 'only the owner may set a café price' using errcode = '42501';
  end if;
  if p_product_id is null or p_product_id !~ '^[a-z0-9][a-z0-9-]{0,31}$' then -- rule:cafe-id
    raise exception 'product id must be 1-32 lowercase letters, digits or dashes' using errcode = '22023';
  end if;
  if p_price_cents is not null and p_price_cents not between 1 and 100000000 then -- rule:cafe-range
    raise exception 'a café price is between 1 and 100000000 centavos' using errcode = '22023';
  end if;
  perform 1 from public.products p where p.id = p_product_id and p.archived_at is null and p.price_cents > 0 for share;
  if not found then -- rule:cafe-product
    raise exception 'no such product' using errcode = 'P0002';
  end if;
  if p_price_cents is null then -- rule:cafe-clear
    delete from public.product_cafe_prices c where c.product_id = p_product_id;
  else
    insert into public.product_cafe_prices as c (product_id, price_cents, set_by, updated_at)
      values (p_product_id, p_price_cents, auth.uid(), now())
      on conflict (product_id) do update
        set price_cents = excluded.price_cents, set_by = excluded.set_by, updated_at = now();
  end if;
  return query
    select p.id, p.name, p.price_cents, public.default_cafe_price_cents(p.price_cents),
           c.price_cents, coalesce(c.price_cents, public.default_cafe_price_cents(p.price_cents)), c.updated_at
      from public.products p
      left join public.product_cafe_prices c on c.product_id = p.id
     where p.id = p_product_id;
end;
$$;
revoke execute on function public.set_cafe_price(text, bigint) from public, anon, authenticated;
grant execute on function public.set_cafe_price(text, bigint) to authenticated;
