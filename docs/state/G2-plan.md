# G2 plan — orders, money and stock on the database (2026-09-27)

Approved direction (Ethan, 2026-09-27): "start connecting orders, money and stock to the database". Owner
answers are provisional "yes" ([configurability audit](configurability-audit.md) section E). Acceptance for every
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
   smallest engine edit that reads them from state, recorded like the live-frame exception. Needs Ethan's yes
   before slice MP-09 c.

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

## Hosted preview during G2

Copying migrations by hand does not scale. When a slice first needs the hosted preview updated, Ethan runs
`supabase login` himself; the throwaway preview project is then recreated and filled with `supabase db push` plus
the seed (its history holds `apply_migration` versions, so a fresh project is simpler than `migration repair`).
Deploy only with `scripts/deploy-preview.mjs`.
