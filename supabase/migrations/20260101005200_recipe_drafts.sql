-- Owner-editable source recipes retain spoon measures, components and optional amounts.
-- Drafts are never read by production, stock deduction or costing RPCs.
create table public.recipe_drafts (
  product_id text primary key references public.products(id) on delete cascade,
  yield_count integer not null check (yield_count between 1 and 10000),
  source_text text not null check (char_length(source_text) between 1 and 16000),
  updated_at timestamptz not null default now()
);
alter table public.recipe_drafts enable row level security;
revoke all on public.recipe_drafts from public, anon, authenticated;
create trigger recipe_drafts_touch before update on public.recipe_drafts
for each row execute function public.touch_updated_at();

create function public.get_recipe_drafts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_owner() then
    raise exception 'only the owner may read recipe drafts' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('product_id', product_id,
    'yield', yield_count, 'source_text', source_text, 'updated_at', updated_at)
    order by product_id), '[]'::jsonb) from public.recipe_drafts);
end;
$$;
revoke execute on function public.get_recipe_drafts() from public, anon, authenticated;
grant execute on function public.get_recipe_drafts() to authenticated;

create function public.save_recipe_draft(p_product_id text, p_yield integer,
  p_source_text text, p_expected_updated_at timestamptz)
returns table(updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_row public.recipe_drafts%rowtype; v_at timestamptz;
begin
  if not public.is_owner() then
    raise exception 'only the owner may change recipe drafts' using errcode = '42501';
  end if;
  if p_product_id is null or p_product_id !~ '^[a-z0-9][a-z0-9-]{0,39}$'
     or not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'no such flavour' using errcode = '22023';
  end if;
  if p_yield is null or p_yield not between 1 and 10000 or p_source_text is null
     or char_length(p_source_text) not between 1 and 16000
     or btrim(p_source_text, E' \t\r\n') = '' then
    raise exception 'a draft needs a batch size and recipe text' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('recipe_draft:' || p_product_id, 0));
  select * into v_row from public.recipe_drafts where product_id = p_product_id;
  if v_row.product_id is null then
    if p_expected_updated_at is not null then
      raise exception 'that draft does not exist' using errcode = 'P0002';
    end if;
    insert into public.recipe_drafts(product_id, yield_count, source_text)
    values(p_product_id, p_yield, p_source_text) returning recipe_drafts.updated_at into v_at;
  elsif v_row.yield_count = p_yield and v_row.source_text = p_source_text then
    -- An identical retry is safe even if the first reply was lost.
    v_at := v_row.updated_at;
  else
    if p_expected_updated_at is distinct from v_row.updated_at then
      raise exception 'that draft changed meanwhile' using errcode = 'P0002';
    end if;
    update public.recipe_drafts set yield_count = p_yield, source_text = p_source_text
      where product_id = p_product_id returning recipe_drafts.updated_at into v_at;
  end if;
  return query select v_at;
end;
$$;
revoke execute on function public.save_recipe_draft(text,integer,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.save_recipe_draft(text,integer,text,timestamptz) to authenticated;
