-- MP-09 c1b: publishing the menu (docs/state/order-form-audit.md, slice order item 2).
--
-- The public shop reads only shop_products (published and active). `published` has been
-- false on every row since 20260101002200 ("Existing rows stay private"), so the shop has
-- shown nothing real yet. This is the owner's command that sets it.
--
-- publish_flavours(p_ids) makes exactly the listed flavours published and every other
-- flavour unpublished: the caller sends the whole published set, so the result does not
-- depend on what was published before. `active` (on the order form) stays the owner's
-- day-to-day switch: a published flavour taken off the form leaves the shop at once, and
-- put back, returns without publishing again. A new flavour stays a draft (unpublished)
-- until the next publish.
--
-- Only rows whose flag actually changes are written, because the touch trigger moves
-- updated_at and the owner's device holds each row's updated_at for save_flavour()'s
-- conflict check. Those rows come back with their new updated_at so the caller can refresh.
create or replace function public.publish_flavours(p_ids text[])
returns table (id text, published boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_owner() then
    raise exception 'only the owner may publish the menu' using errcode = '42501';
  end if;

  if p_ids is null or cardinality(p_ids) > 200 then
    raise exception 'publish takes a list of at most 200 flavour ids' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_ids) x where x is null or x !~ '^[a-z0-9][a-z0-9-]{0,31}$') then
    raise exception 'flavour id must be 1-32 lowercase letters, digits or dashes' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_ids) x where not exists (select 1 from public.products p where p.id = x)) then
    raise exception 'publish names a flavour that does not exist' using errcode = '22023';
  end if;

  return query
    update public.products as p set published = (p.id = any(p_ids))
     where p.published is distinct from (p.id = any(p_ids))
    returning p.id, p.published, p.updated_at;
end;
$$;
revoke execute on function public.publish_flavours(text[]) from public, anon, authenticated;
grant execute on function public.publish_flavours(text[]) to authenticated;
