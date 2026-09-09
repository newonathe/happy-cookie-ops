-- Optimistic concurrency on the tables two people can edit at once.
--
-- Two users is not a distributed system, and it does not need versioning, vector clocks
-- or a merge policy. It needs one thing: a write must fail rather than silently overwrite
-- an edit made since it was read. Last-write-wins is fine for a note; it is not fine when
-- the owner marks an order paid and a helper's stale form marks it unpaid a second later.
--
-- The rule: every update sends the updated_at it read. If the row has moved on, the
-- update affects zero rows and the caller gets a 409 telling it to re-read.

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['orders', 'order_items', 'inventory_items', 'bake_batches', 'drops']
  loop
    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists %I_touch on %I', t, t);
    execute format(
      'create trigger %I_touch before update on %I for each row execute function touch_updated_at()',
      t, t
    );
  end loop;
end;
$$;

/**
 * Guarded update of an order's state.
 *
 * p_seen_at is the updated_at the caller read. If the row has changed since, this returns
 * no row and the handler answers 409 — which is the honest answer, because the caller's
 * decision was made against data that no longer holds.
 *
 * Returning the current row on conflict would be friendlier and wrong: it invites the
 * caller to retry blindly with the same stale decision.
 */
create or replace function update_order_state(
  p_order_id  text,
  p_seen_at   timestamptz,
  p_state     text default null,
  p_pay_state text default null,
  p_pay_ref   text default null
)
returns table (id text, state text, pay_state text, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_staff() then
    raise exception 'only staff may change an order';
  end if;

  return query
    update orders o
       set state     = coalesce(p_state, o.state),
           pay_state = coalesce(p_pay_state, o.pay_state),
           pay_ref   = coalesce(p_pay_ref, o.pay_ref)
     where o.id = p_order_id
       -- The guard. Millisecond equality is exact here: updated_at is set by the trigger,
       -- never by a client, so the value the caller read is the value in the row.
       and o.updated_at = p_seen_at
    returning o.id, o.state, o.pay_state, o.updated_at;
end;
$$;

comment on function update_order_state(text, timestamptz, text, text, text) is
  'Optimistic concurrency: returns no row if the order changed since p_seen_at. The handler must answer 409, not retry.';

grant execute on function update_order_state(text, timestamptz, text, text, text) to authenticated;
