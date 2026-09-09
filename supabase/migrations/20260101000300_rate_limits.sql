-- Rate limiting, in Postgres.
--
-- Why not Redis. The usual answer is Upstash, and the usual argument against Postgres is
-- that a rate-limit check consumes the connection you are trying to protect. That
-- argument is real at scale and weak here: this is one baker with a 200-box capacity, the
-- check is a single indexed upsert, and the alternative is a second paid service for a
-- home business to configure and keep credentials for. If traffic ever justifies Redis,
-- src/lib/rate-limit.ts is written to swap its store without callers changing.
--
-- The threat is not load. It is one bored person with a script hitting /shop or
-- /orders/lookup during a drop, and order-number enumeration on lookup.

create table if not exists rate_limits (
  -- bucket key: '<route>:<identifier>' — an IP for public routes, a user id for staff
  key         text not null,
  window_start timestamptz not null,
  count       integer not null default 0,
  primary key (key, window_start)
);

comment on table rate_limits is
  'Fixed-window counters. Rows older than the widest window are dead and pruned by prune_rate_limits().';

-- Only the window currently being written to is ever read, so the primary key is the
-- whole index story. This one is for the pruner.
create index if not exists rate_limits_window_idx on rate_limits (window_start);

/**
 * Consumes one unit from a bucket and reports whether the caller may proceed.
 *
 * A fixed window, not a sliding one: it is one statement, it needs no sorted set, and at
 * this scale the burst a fixed window permits at a boundary is not a problem worth a
 * second service. Returns the remaining allowance and when the window resets so the
 * handler can set the standard headers.
 *
 * SECURITY DEFINER because anon must be able to consume a bucket without being able to
 * read anyone else's counters.
 */
create or replace function consume_rate_limit(
  p_key      text,
  p_limit    integer,
  p_window_s integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_count integer;
begin
  if p_limit <= 0 or p_window_s <= 0 then
    raise exception 'consume_rate_limit: limit and window must be positive';
  end if;

  -- Truncate now() to the window, so every caller in the same window agrees on the key.
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);

  insert into rate_limits (key, window_start, count)
  values (p_key, v_start, 1)
  on conflict (key, window_start)
    do update set count = rate_limits.count + 1
  returning rate_limits.count into v_count;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_start + make_interval(secs => p_window_s);
end;
$$;

/** Deletes spent windows. Call from a daily cron; nothing depends on the history. */
create or replace function prune_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from rate_limits where window_start < now() - interval '2 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

alter table rate_limits enable row level security;
-- Nobody reads this table directly. The function is the only door, and it is definer.
revoke all on table rate_limits from anon, authenticated;
grant execute on function consume_rate_limit(text, integer, integer) to anon, authenticated;
grant execute on function prune_rate_limits() to service_role;
