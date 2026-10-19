-- B4b: three READ-ONLY queries for Ethan's database connector on the trial. Run them one at a time. None changes anything, and none
-- returns a memo, a customer, a phone number or an amount per row.

-- 1. The active stock items: names and units. Save the result as the --catalogue file for scripts/import-her-data.py
--    (lower-cased name -> [[name, unit]]).
select name, unit
from public.inventory_items
where active
order by name;

-- 2. The flavours (products): ids and names. Save the result as the --flavours list for scripts/prepare-flavour-photos.py
--    ([{"id": ..., "name": ...}]).
select id, name
from public.products
where item_type = 'cookie'
order by name;

-- 3. The ledger. rows, the sum of amount_cents by kind, the latest occurred_at, the latest historical sale day on the Manila clock
--    (the value for --after in scripts/prepare-newer-sales.py), and ledger_hash: the EXACT value the append guard in
--    scripts/prepare-historical-ledger.mjs compares (the sha256 of every ledger row as jsonb, ordered by id). Pass ledger_hash as --ledger-hash
--    to scripts/prepare-newer-sales.mjs. If any ledger row changes between this read and the append, the guard refuses.
select
  (select count(*) from public.ledger_entries) as ledger_rows,
  (select coalesce(jsonb_object_agg(k.kind, k.cents), '{}'::jsonb)
     from (select kind::text as kind, sum(amount_cents) as cents from public.ledger_entries group by kind) k) as cents_by_kind,
  (select max(occurred_at) from public.ledger_entries) as latest_occurred_at,
  (select max((occurred_at at time zone 'Asia/Manila')::date) from public.ledger_entries
     where kind = 'sale' and category = 'Historical sales') as latest_historical_sale_day_manila,
  (select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(l) order by l.id),'[]'::jsonb)::text,'sha256'),'hex') from public.ledger_entries l) as ledger_hash;
