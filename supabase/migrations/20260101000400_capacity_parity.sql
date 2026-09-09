-- Capacity, server side.
--
-- This must agree with src/lib/rules/capacity.ts exactly, forever. The parity test in
-- tests/unit/capacity-parity.test.ts runs both over the same table of cases and fails CI
-- if they diverge. If you change one, change the other in the same commit — that is the
-- whole reason both are small enough to read.
--
-- drop_remaining() lives in the init migration, which now uses state_reserves_capacity().
-- This migration adds only the parity mirror, so there is one definition of each.


/**
 * The same decision as decideCapacity() in TypeScript. Kept as its own function so the
 * parity test has something to call, rather than asserting against an inlined expression
 * buried in the order insert.
 */
create or replace function capacity_allows(
  p_capacity  integer,
  p_committed integer,
  p_requested integer
)
returns boolean
language sql
immutable
as $$
  select p_requested > 0
     and p_requested <= greatest(0, greatest(0, floor(p_capacity)::integer)
                                    - greatest(0, floor(p_committed)::integer));
$$;

comment on function capacity_allows(integer, integer, integer) is
  'Mirror of decideCapacity() in src/lib/rules/capacity.ts. Change both together; tests/unit/capacity-parity.test.ts enforces it.';

grant execute on function drop_remaining(uuid) to anon, authenticated;
grant execute on function capacity_allows(integer, integer, integer) to anon, authenticated;
