-- Each transfer remains capped at9999. A single reversal may return the net
-- cookies from several valid transfers; the append-only guard still limits it
-- to the booking's transferred balance under the shared product lock.
alter table public.bazaar_kitchen_moves
  drop constraint bazaar_kitchen_moves_qty_delta_check;
alter table public.bazaar_kitchen_moves
  add constraint bazaar_kitchen_moves_qty_delta_check
  check ((kind = 'transfer' and qty_delta between -9999 and -1)
      or (kind = 'return' and qty_delta > 0));
