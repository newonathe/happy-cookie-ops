# G2 plan — orders, money and stock on the database (2026-09-27)

> **2026-09-28: forward order superseded** by [finish-plan.md](finish-plan.md) (proposed; F1). The principles below
> (database as source of truth, `OpsRuntime` wraps engine actions, live mode never starts from demo books, every RPC
> hardened and in the role suite) still apply. The order table and slice audits are history.

Approved direction (Ethan, 2026-09-27): "start connecting orders, money and stock to the database". Owner
answers were provisional "yes" ([configurability audit](configurability-audit.md) section E); **Cine answered on 2026-09-28 and changed pay-first (unpaid orders stay on the bake list)**, see the [decision register](decision-register.md). Re-audit each slice against those answers when its goal is written. Her second round makes the app replace the whole order form at launch; the proposed split of MP-09 c and MP-10 (and decisions D1, D2 and D4 that block MP-10 a) are in [order-form-audit.md](order-form-audit.md). Acceptance for every
package is taken verbatim from `docs/master-plan/tasks.json`. Work loop: one `/goal` per slice from
[next-goal.md](next-goal.md), in a fresh conversation, each slice under ~400 changed lines.

## How the app talks to the database (applies to every slice)

1. **The database is the source of truth; every write is a server command.** The engine stays the UI brain.
   `OpsRuntime` (subclass, `src/store/ops-runtime.tsx`) wraps engine actions: capture the base action, call a
   Supabase RPC, apply the server's result (or show the conflict). Never push snapshots or diffs of engine state
   to the database: that would make the browser the authority (fails MP-10's "no client price/status/role").
2. **Reads load database rows into engine state** through small adapters in `src/lib/data/`, one per domain,
   typed from `src/lib/types/database.ts`.
3. **Live mode never starts from the demo books.** `BASE_STATE` seeds fake orders, ledger, stock and batches, and
   `loadState()` restores `hc-ops-state-v1` from localStorage. In live mode private domains start empty, are not
   persisted to localStorage, and are cleared on sign-out (a shared helper login on the same device must not read
   the owner's books). The IndexedDB offline sale queue is never touched (invariant 2).
4. **Every new RPC:** a new migration, `SECURITY DEFINER`, `search_path = ''`, an active-role check inside the
   function, known-key/range validation, optimistic `updated_at` or idempotency key where the master plan asks,
   and an explicit `GRANT` (the 28th migration makes an ungranted function silently uncallable). Each gets cases
   in the SQL role suite (`scripts/test-db-security.py`).
5. **The public shop reads only `shop_products` / `shop_drops`.** Publishing is an owner command (MP-09 c).
6. **Protected-engine exception needed once:** `PRODUCTS` (flavour list: name, description, photo, allergens) and
   `PAY_ACCOUNTS` are module constants in the protected engine. Making them editable (audit B1, B2) needs the
   smallest engine edit that reads them from state, recorded like the live-frame exception. Approved by Ethan on 2026-09-27; applied in slice MP-09 c, recorded in `protected-exception.md` and `scripts/validate-g0.py` like the live-frame exception.

## Order (dependencies from tasks.json)

MP-10 depends on MP-07, which is not finished (the durable offline sale queue: the 3 known OFFLINE-01 E2E
failures). So:

| #   | Slice                                                                                                     | What Cine sees                            |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | MP-08 close: idle sign-out defaults (owner/support 60 min, helpers 240 min; DP-15 via audit B10)          | Auto-logout works                         |
| 2   | MP-09 a: live data boundary (no demo books, no private data left on the device)                           | Staff screens start empty instead of fake |
| 3   | MP-09 b: settings on the database (owner read/write RPC, safe projection of capacity and ordering window) | Settings survive reload and other devices |
| 4   | MP-09 c: catalog, prices, publishing (+ the engine exception above)                                       | Menu and prices are real and editable     |
| 5   | MP-09 d: recipes and suppliers with versions                                                              | Recipes and suppliers persist             |
| 6   | MP-16: stock movements, receipts, counts                                                                  | Stock is real                             |
| 7   | MP-07 finish: durable offline sale queue (makes OFFLINE-01 pass)                                          | Bazaar sales survive reload offline       |
| 8   | MP-10: customer checkout and capacity                                                                     | Real orders                               |
| 9   | MP-11: payment-proof uploads                                                                              | Real proof images                         |
| 10  | MP-12: payment review, balances, refunds                                                                  | Real payments                             |
| 11  | MP-17: recipe versions, dough, production                                                                 | Real baking                               |
| 12  | MP-13: packing and collection                                                                             | Real pickups                              |
| 13  | MP-14: order status links and messages                                                                    | Customer status page                      |
| 14  | MP-15: ledger and reports (cost counted when used)                                                        | Real P&L                                  |

## Slice audit — MP-09 a and b (2026-09-27, Claude, against the code)

Method: each question was answered from the code or a throwaway render probe, not from the plan text.

**MP-09 a — live data boundary**

- _Do the locked screens survive empty books, or does this need a protected edit?_ They survive. A probe rendered all 25
  screen keys on mobile and desktop from the live state with the private keys emptied: no throw, no console error, no
  NaN/undefined text, and the prototype's own empty copy ("Queue is clear", "No sales recorded yet"). No protected edit is
  needed; everything goes in `OpsRuntime` (subclass) plus one module in `src/lib/data/`.
- _Is the goal's list of ten domains complete?_ No. `BASE_STATE()` also seeds customer PII outside it (`queue`: Google
  Form orders with names and phones; `waitlist`: names), money (`eventExpenses`, `drawer`), production (`dough`,
  `baked`, `doughAt`) and purchases (`bought`, `received`). **Decision:** one exported classification of every
  non-ephemeral key, **emptied** or **kept (with the owning slice)**, plus a test that fails on an unclassified key.
  - Emptied (the probe-validated set): orders, ledger, inv, batches, sales, paid, partial, subs, matched, queue,
    queueArchive, waitlist, variances, spoilage, countLog, bought, received, plannedBuy, shortfalls, dough, baked,
    doughAt, doughPrep, moved, drawer, event, eventStock, eventLoaded, eventPrices, eventExpenses, recipeHistory,
    notifRead, stocktake, batch.
  - Kept, with owner: cfg (MP-09 b); prices, recipes, recipeBase, recipeVer, recipeDirty, soldOut, dropActive,
    shopOverride (MP-09 c/d); dropNo, orderSeq, invoiceSeq (MP-10); backup, backupAt (G4 backups, DP-10); channels,
    categories, inactiveCats (MP-09 b2); everything else is UI state.
- _Is "not written to localStorage" enough?_ No. The engine writes the same key to **sessionStorage** too, and live
  builds before this slice already wrote the demo books on every device that opened the hosted preview, `/shop` included:
  the engine mounts above the gate. **Decision:** in live mode never read or write `hc-ops-state-v1`, and remove it
  from both stores on mount and on sign-out. Limitation: devices only lose the stale copy after the next deploy.
- _What else still shows demo data in live mode?_ Two render-time constants in the protected engine:
  - `PRIOR_MONTHS` (a fake P&L trend of ₱9k/₱12k/₱13k). **Decision:** trim it in `renderVals()` and recompute the
    remaining bar.
  - The bazaar event list (Katipunan, UP Town Center). **Decision:** leave it. It is placeholder schedule, not
    books; real events belong to MP-18 (G3).
  - The Settings "reset" also rebuilds the sample books. **Decision:** in live mode it resets to the empty state.
- _What does "signing out clears private state" leave on the device?_ After this slice: nothing private except the
  IndexedDB sale queue, which is kept (invariant 2). Navigation-only SW cache (no data), the non-private `hc-device-id`,
  and the session cookies (already cleared) remain. `location.replace` drops memory.
- _Does live bazaar selling get worse?_ Yes, until MP-07 finish (slice 7). A reload keeps queued sales in IndexedDB,
  but the on-screen tally is lost. This is acceptable because live mode holds no real sales before then.
- _Full E2E?_ Dropped for this slice (lean plan rule 3: E2E when closing a gate). Demo mode is pinned by a unit test
  that it still restores and writes the key. The live build is exercised by the pages/workers spike runs.

**MP-09 b — settings on the database: split into b1 (database) and b2 (app), each under ~400 lines**

- _What exists?_ `public.settings` (typed value columns), `settings_effective()` (service_role only), owner RLS
  `FOR ALL`, and table DML granted to `anon`/`authenticated` (migration 19). `is_owner()` checks `active` through
  `current_role_name()`.
- _Gap:_ the owner can write any key or value directly through PostgREST, which skips validation. **Decision (b1):**
  writes only through an owner RPC with known-key, range and enum validation and an `expected_updated_at` conflict check.
  Revoke direct DML. Update `tests/integration/security/settings.sql` and `tests/fixtures/function-authority.json` in the
  same commit.
- _Where do the ranges come from?_ From the engine's own `bumpCfg`/`numCfg` call bounds and `DEFAULT_CFG`. They are
  recorded once in a fixture that a parity test checks against the engine. This is the same pattern as
  `capacity-cases.json`.
- _Can helpers read settings?_ Only a staff-safe projection: capacity, ordering window, `maxPerOrder` and idle
  minutes. No costs.
- _Is the owner-editable idle timeout (DP-15) allowed by the locked UI?_ Yes. Ethan approved the locked-UI exception for
  the new edit forms (decision register, 2026-09-27). The control lands in b2, recorded in `protected-exception.md`. The
  client clamps database minutes to 15–480 and falls back to `IDLE_MINUTES`.
- _MP-09's acceptance says "plus non-config preferences"._ `channels`, `categories` and `inactiveCats` are assigned to
  b2, so MP-09 cannot close without them.
- b2 (goal written when b1 lands):
  - load on verified sign-in into `cfg` through `src/lib/money.ts`;
  - save through captured base actions, debounced per key; on a conflict, reload and show a toast; offline, revert
    and show a toast;
  - idle minutes read from the projection;
  - the new Settings controls;
  - the preferences above.
- **b2 done 2026-09-28** except the preferences and the 0.5 steps, which need a migration: split out as
  b3 ([next goal](next-goal.md)). MP-09 b cannot close before b3.
- **b3 done 2026-09-28:** preferences, half steps and the stored helper switch. The switch's behaviour and
  the helper money-privacy fix are b4, the last part of MP-09 b.
- **b4 done 2026-09-28; MP-09 b closed.** Next: MP-09 c, split as in [order-form-audit.md](order-form-audit.md).
- **MP-09 c1 done 2026-09-28:** flavours on the database and the engine exception for `PRODUCTS`/`ALLERGENS`
  (recorded in [protected-exception.md](protected-exception.md)); only the on-menu switch saves. Prices, publishing
  and the flavour editor are c1b ([next goal](next-goal.md)); payment accounts (`PAY_ACCOUNTS`) are c2.
- **MP-09 c1b done 2026-09-28:** prices save, `publish_flavours`, and the live shop shows only the published
  menu. The flavour editor and its "Publish menu" button are split into **c1c** ([next goal](next-goal.md)): they
  need guarded edits to the protected shell, and until c1c nothing in the app publishes, so the live shop is empty.
- Hosted preview: not updated until Ethan runs `supabase login` (see below).

## Hosted preview during G2

Copying migrations by hand does not scale. When a slice first needs the hosted preview updated, Ethan runs
`supabase login` himself; the throwaway preview project is then recreated and filled with `supabase db push` plus
the seed (its history holds `apply_migration` versions, so a fresh project is simpler than `migration repair`).
Deploy only with `scripts/deploy-preview.mjs`.
