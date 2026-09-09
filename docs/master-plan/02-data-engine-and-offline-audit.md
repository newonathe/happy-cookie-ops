# Data, engine and offline audit

Evidence classification: **S** = source-confirmed; **D** = executable local diagnostic, not database integration; **U** = requires environment or business confirmation. Paths are relative to the project root. The source port remains untouched.

## Findings that block reliable records

| ID | Priority / evidence | Finding and consequence | Required closure |
|---|---|---|---|
| DATA-01 | P0 / S | `OpsRuntime` overrides sync only; orders, stock, recipe edits, ledger, drops, users, notifications and backup claims still inherit local demo behavior | Typed repositories and transactional domain commands; MP-09–MP-24 |
| DATA-02 | P0 / S | `20260101000000_init.sql` defines `drop_remaining` with `as $` and `$;`, invalid SQL dollar quoting | Establish migration history before repair; deterministic fresh bootstrap; MP-05 |
| DATA-03 | P0 / S | `database.ts` is a permissive placeholder including `Record<string, any>`, rather than generated schema types | Generate from successfully applied local schema and enforce diff gate; MP-05 |
| DATA-04 | P0 / S | `sync_event_sale` uses `jsonb_each` key/value rows as one JSONB variable, then numeric indexing; later concurrency migration must also be inspected for retained logic | Typed iteration, reject unknown products, check line count and totals transactionally; MP-19 |
| DATA-05 | P0 / S | Sync trusts client money and clerk; catalog current price is used for lines, which can disagree with event price and claimed total | Event price snapshot, authenticated actor, integer recomputation; MP-18–MP-19 |
| DATA-06 | P0 / S | `offline-bridge.tsx` mirrors sales in an effect, marks IDs mirrored before awaiting persistence, and deduplicates by reusable display sale ID | Move sale creation to durable command boundary; stable UUID identity; MP-18 |
| DATA-07 | P0 / S | `idb.ts` resolves write request success before transaction completion; no transaction abort handler, version-change closing or robust failed-open reset | Resolve only on commit; abort/quota/version tests; MP-18 |
| DATA-08 | P0 / S | `OpsRuntime.runSync` marks every sale synchronized when there are no reported failures, including skipped/empty results; derives IDs by splitting colon keys | Store full client ID on each sale and match acknowledged IDs only; MP-20 |
| DATA-09 | P1 / S | Page and service-worker sync duplicate protocol code; no single-owner flush lock, bounded retry, strict response schema or reconciliation by IDs/hash | Shared protocol fixtures, lease/CAS, timeout/backoff, pagination and status reconciliation; MP-20 |
| DATA-10 | P1 / S | Service worker caches navigations and images but not a complete versioned dependency graph; cached auth redirects may defeat offline entry; immediate activation can mix versions | Versioned asset manifest, explicit public/private cache policy and upgrade handshake; MP-21 |
| DATA-11 | P0 / S | Engine capacity status membership and SQL helper disagree; arithmetic fixtures do not test actual status population | Canonical capacity membership plus real concurrent state-transition SQL tests; MP-10 |
| DATA-12 | P0 / D | Diagnostic found historic order total changing from 168.44 to 180 when packaging changed despite price snapshot | Snapshot all commercial components at order acceptance; MP-10, MP-15 |
| DATA-13 | P0 / D | Diagnostic of event load/close/reset inflated baked stock; void then new sale reused an existing `S2` display ID | Movement ledger, immutable reversal and full closeout conservation tests; MP-17–MP-20 |
| DATA-14 | P1 / D | Add/remove product can leave zero-quantity keys in cart; sync schema requires every quantity >=1 | Canonicalize positive lines at command boundary; reject empty transaction; MP-10, MP-18 |
| DATA-15 | P1 / S | SQL retains only part of the engine's data model; form queue, detailed recipe versions, inventory movements, preferences, work drafts and snapshots are not fully connected | Entity/state mapping in 06 and complete screen closure matrix |
| DATA-16 | P1 / S | Local restore, initialScreen effects and URL projection compete; selected order/batch IDs are not stable deep-link data | Single bootstrap/navigation coordinator with selection IDs, draft survival and invalid-ID states; MP-07 |
| DATA-17 | P1 / S | P&L uses operational approximations, historical fixtures and mutable settings; no explicit closed-period/report reproducibility model | Define operational report semantics and accountant review; MP-15 |
| DATA-18 | P1 / S | Source-generated seed contains demo commercial activity and embedded assumptions | Separate demo seed from clean production config/opening records; MP-27 |

The D findings were independently reproduced against the unchanged original engine using [engine-probes.cjs](evidence/engine-probes.cjs); exact output is in [engine-probes.json](evidence/engine-probes.json). The harness uses synchronous synthetic React/setState stubs and inert timers/toasts. It demonstrates selected method-level counterexamples, not real React lifecycle, browser or SQL correctness. Re-run with `node docs/master-plan/evidence/engine-probes.cjs` from the project root. Encode these cases in the real application/database regression suite during implementation.

## State ownership

| Data | Current authority | Required authority | Client responsibility |
|---|---|---|---|
| Identity and permissions | Sign-in exists, engine defaults to owner | Supabase verified session plus active profile/capabilities | Display allowed projection only |
| Catalog, recipe versions, settings | Engine constants and local mutations | Postgres versioned masters | Bounded cached snapshot and edit draft |
| Orders and payment review | Local orders array | Transactional server order aggregate | Cart, form draft, status capability |
| Inventory, production, waste | Local counters and arrays | Append-only movements and source documents | Task draft / progress projection |
| Reports, payments, expenses | Local journal and derived totals | Immutable source-linked operational ledger | Date/filter selection |
| Offline sales | Engine then IDB mirror | Device committed command until acknowledged; server thereafter | Durable queue, allocation counter, retries |
| Backup and health | Simulated timestamps/status | Signed/sanitized job evidence and measured checks | Read-only projection |
| Customer lookup | Full local dataset matching | Capability-scoped response | Token held only as necessary |

Persisting the entire engine snapshot to one JSON column would transfer the current consistency bugs to the server. Persist business aggregates and movements, then map safe server projections into the existing engine/view-model shape. Do not build a second UI or silently enable all engine mutations before their transactions exist.

## Required regression oracles

1. Reserve the last capacity unit with 20 simultaneous normal confirmations, with owner overage disabled: exactly one succeeds; quantities remain within capacity. Repeat with each recognized capacity status, cancellation and retry. Separately prove that the existing explicit owner overage requires the approved capability, fresh count, reason and audit; it is not an accidental race success.
2. Record a sale, terminate between IDB request success and commit: the UI must not have claimed completion. Simulated abort returns a retryable failure without stock reduction.
3. Commit a sale, lose server response, reload and resend the same key/hash: exactly one sale, lines, ledger, movements and original acknowledgment exist.
4. Same key with changed quantity/price/event: conflict, never silently accepted as the original sale.
5. Batch of three valid sales and one malformed sale: valid rows persist once, malformed row remains visible and repairable. Empty/foreign/malformed acknowledgment cannot clear any row.
6. Load 5 baked units to event from 10; sell 2; waste 1; return 2; close twice and retry: central stock 7, sold 2, waste 1, event stock zero. Reopen cannot recreate returned stock.
7. Void a committed sale: compensating movement/ledger linked to original; second void is idempotent; history remains. Offline void syncs after its source sale and cannot erase that sale.
8. Change catalog price, packaging fee, recipe cost and tax assumption after fulfillment: old order and its period report retain identical cents and quantities.
9. Count stock while another permitted movement occurs: post variance against the count's snapshot or return a conflict; never overwrite intervening stock.
10. Receive and batch with fractional units: conversion is deterministic, no grams/pieces mixing, no negative available stock, cost allocation reconciles with documented rounding.
11. Public customer bootstrap contains no staff order array, journal, supplier costs, profiles or previous browser-local books.
12. Production bootstrap creates zero demo orders, zero demo payments and zero demo stock; approved opening stock has explicit source/lot/cost evidence.

See [06](06-domain-contracts.md) for selected rules. Unknown accounting, expiry and regulatory values are owned decisions, not defaults fabricated from fixture numbers.
