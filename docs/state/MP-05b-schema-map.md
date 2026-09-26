# MP-05.b schema map and consumer reconciliation

Authority: actual catalog from the disposable PostgreSQL 15 fixture, eight checked-in migrations, and generated `src/lib/types/database.ts`. [Machine inventory](evidence/MP-05b-schema-inventory.json) contains all 143 columns with type/nullability/default, all 54 constraints, 28 indexes, 38 policies, 518 table-grant rows, 17 function identities/ACLs and six default-privilege entries. Four enums have 17 labels. These are local fixture observations; hosted environments must be checked independently. No production readiness or authorization acceptance follows from successful generation.

## Existing schema: retain, evolve, reuse

Every existing column remains unchanged in MP-05.b. The complete current column definitions are in the inventory's `columns` array; the table below assigns each of those columns to a future owner and identifies changes that must be designed there. KEEP means retain the existing identity/concept unless its owner's later evidence proves a change is necessary. ALTER/EXTEND means a tracked future contract gap, not an approved DDL change. NEW concepts below must first be reconciled with existing tables to avoid duplicates.

| Current table / all existing columns owned by | KEEP / ALTER / EXTEND decision |
|---|---|
| `profiles` — MP-08/06 | KEEP `id`, `role`, `display_name`, `created_at`; EXTEND active/revocation/capabilities. Preserve auth-user identity; no engine-selected role authority. |
| `products` — MP-09 | KEEP SKU `id`, display/reference fields and `active`; EXTEND immutable product/price versions and publication projection. `price_cents` is a current value, not a sufficient historic pricing record. |
| `recipes` — MP-17 | KEEP product/yield concept; EXTEND recipe identity/version/effective publication. Current `product_id` primary key permits only one current recipe per product. |
| `recipe_ingredients` — MP-17 | ALTER `item_name`, free-text `unit` and unconstrained quantity semantics toward item identity, fixed unit conversion and immutable versioned lines; retain existing rows/reference provenance. |
| `suppliers` — MP-16/09 | KEEP identity and contact/reference columns; EXTEND deactivation and controlled disclosure. |
| `supplier_prices` — MP-16 | REUSE for the supplier-offer concept; ALTER free-text `item_name`, `pack_label`, `last_bought` and `previous_cents` array toward structured item/unit/date/price history. Do not create duplicate offers merely to match a planned name. |
| `inventory_items` — MP-16 | KEEP item identity/reference fields; ALTER `on_hand`, `last_counted`, `unit`, `pack_size` semantics to authoritative movements/count finalization and dimension-checked units. Add lots/locations/expiry/quality provenance rather than overwriting balances. |
| `drops` — MP-10 | KEEP identity, timing and capacity columns; EXTEND schedule/version/manual override and expected-version concurrency. Existing `updated_at` is not a monotonic version. |
| `orders` — MP-10/12/13/14/22 | KEEP order/drop identity and lifecycle concepts; ALTER embedded `customer_name`, `phone`, payment-reference and notes retention toward separated contacts and safe capabilities; EXTEND immutable commercial snapshots, verified payment events and command/version identity. Nullable `drop_id` needs explicit business handling. |
| `order_items` — MP-10 | KEEP order/product/quantity/unit-price snapshot concept; EXTEND product/version/commercial snapshots and authoritative pricing. Direct public inserts are an MP-06 boundary defect. |
| `bake_batches` — MP-17 | REUSE as the production-batch concept where possible; EXTEND recipe versions, input lots, dough/rest/conservation and output genealogy. `baker` text is not authenticated actor identity; `planned_qty`/`baked_qty` alone do not prove conservation. |
| `events` — MP-18/20 | KEEP event identity/timing/float/close concepts; EXTEND enrolled device, allocation epoch/preparation/expiry and closeout/reconciliation state. |
| `event_sales` — MP-19/20 | KEEP stable sale/client identities and commercial timestamps/amounts; EXTEND payload hash, device sequence/epoch, immutable tender/adjustment facts and server actor. `clerk` text is untrusted attribution; nullable `event_id` requires contract enforcement. |
| `event_sale_items` — MP-19 | KEEP sale/product/quantity/unit-price snapshot concept; EXTEND allocation/version/source identity and packaging/inventory conservation. |
| `ledger_entries` — MP-15/12/19 | KEEP signed centavos/source-linked ledger concept; ALTER free-text `category`/memo-only explanations into versioned categories and explicit source/correction links; EXTEND immutable posting identity, business date and period close. Existing mutable access is not append-only enforcement. |
| `settings` — MP-09 | KEEP typed override/default distinction and key identity; EXTEND known-key validation, atomic settings groups and immutable effective versions. `updated_at`/`updated_by` do not preserve historic settings. |
| `rate_limits` — MP-06/24 | KEEP fixed-window counter fields; ALTER authority so clients cannot choose arbitrary SQL bucket limits/windows or create unlimited caller-controlled keys. Preserve current application behavior in this type-only slice. |
| `erasure_requests` — MP-22/06 | KEEP request/decision/count evidence; EXTEND verification, actor, scoped purpose and safe retention policy. Destructive functions require separate authority proof. |
| `audit_log` — MP-06 and command-owning packages | KEEP identity/actor/action/entity/time concepts; ALTER free-form `detail` and write grants into server-controlled, allowlisted, minimal audit events; EXTEND command/version references. |

## Missing contract responsibilities and owners

These responsibilities are absent from the current 19-table inventory. Names express responsibilities, not an instruction to duplicate current concepts.

| Required responsibility | Next owner |
|---|---|
| Device registrations/active offline writer | MP-08 identity; MP-18 enrollment/epoch |
| Product/price/settings versions | MP-09; MP-10/19 consume snapshots |
| Recipe versions/lines, batch inputs/outputs | MP-17; reuse recipes/recipe_ingredients/bake_batches |
| Supplier offers, structured purchase receipts/lines | MP-16; reuse supplier_prices |
| Inventory lots/movements, stock counts/count lines | MP-16 |
| Separate order contacts and retained commercial snapshots | MP-10/22 |
| Payment claims/events/refunds | MP-12 |
| Order status capability hashes/expiry/revocation | MP-14 |
| Event allocations/price snapshots | MP-18 |
| Event reversals/adjustments and closeout | MP-19/20 |
| Ledger source links/report periods | MP-15 |
| Form intake quarantine/acceptance queue | MP-10 order command; MP-24 integrations; shared design boundary must be made explicit before implementation |
| Notification events/preferences | MP-13/14/24 according to in-app condition versus customer communication; exact shared schema owner remains a future slice decision |
| Attachments/object metadata | MP-11 |
| Backup runs/recovery evidence | MP-23 |
| Command result/idempotency ledger | MP-10/12/15/16/17/19 shared command contract; first implementation must establish reusable ownership, not duplicate per route |

MP-05 is schema discovery/bootstrap/type generation. It does not require implementing all later domain tables. The machine inventory is also the complete constraints map: 19 primary keys, 18 foreign keys, 15 CHECK constraints and two UNIQUE constraints. Their exact expressions and columns are retained; future package owners must compare their needed invariants against them rather than treating their presence as full domain coverage.

## Consumers and concrete integration

| Consumer | Actual generated contract | MP-05.b action / remaining gap |
|---|---|---|
| `src/lib/supabase/client.ts` | Browser Supabase client over `Database` | Add type-only generic; no runtime configuration/role change. |
| `src/lib/supabase/server.ts` | Cookie-backed Supabase client over `Database` | Add type-only generic; cookie/error behavior unchanged. |
| `src/lib/supabase/service.ts` | Already generic over `Database` | Replace underlying placeholder by generated artifact; server-only guard unchanged. |
| `src/app/api/health/route.ts` | `products.id` is text | Compiles without route changes; no proof of hosted connectivity. |
| `src/lib/rate-limit.ts` | `consume_rate_limit` args are key/limit/window; result rows have boolean allowed, numeric remaining and string reset_at | Remove obsolete cast/comment; keep runtime shape/error guard and existing fail-open behavior. Security redesign belongs to MP-06/24. |
| `src/app/api/sync/route.ts` | `sync_event_sale(p_sale: Json)` returns client/sale/duplicate rows | Existing Zod object compiles without casts or payload changes. Route still does not prove exact returned acknowledgment identity; MP-19/20 own replay/queue correctness. |

Compile-time negative contracts reject invented tables/RPCs/columns/args, wrong parameter types, enum values and wildcard table/function indexes. Supabase SELECT strings can infer an error-shaped result without rejecting the call itself; tests deliberately use table/RPC/insert and indexed-column errors instead. `Json` accepts structurally incomplete sale objects, so TypeScript does not validate the SQL's internal JSON keys, trusted totals or actor attribution. PostgreSQL `bigint` and numeric columns generate as JavaScript `number`; this does not prove centavo precision, bounds, rounding or transport safety. Implement exact money conversions/bounds in the domain command packages; do not hand-edit generated types to hide that boundary. Trigger/internal helper signatures being present is not approval to expose or invoke them as product RPCs.

## Grants/RLS findings for MP-06

All 19 tables have RLS enabled in the fixture, but that is not least-privilege acceptance. The actual inventory reports anon/authenticated/service-role EXECUTE on all 17 public functions, including `prune_personal_data`, `anonymise_customer`, `settings_effective` and trigger/helper functions. Default privileges and PUBLIC/explicit grants explain why adding an authenticated/service-role grant alone does not remove other roles. Some function bodies perform their own checks; EXECUTE availability alone does not prove that every body operation succeeds. MP-06 must verify both privilege reachability and role-specific behavior with real negative tests.

Table grant inventory has 126 anon and 126 authenticated grant rows. `orders` and `order_items` have permissive public insert policies, so typed clients do not create a security boundary. `rate_limits` has RLS enabled and no policy; its definer function remains broadly executable with caller-chosen parameters. Direct table writes, definer ownership/search_path, service-role bypass, audit authority, money/state role separation and default privilege repair require MP-06. No exploit/mutation tests were run by this introspection slice and no grants/policies were changed.

Claude's source report was useful but corrected: its claim that settings_effective excludes anon is contradicted by actual effective EXECUTE checks. Its unresolved order/checkout package number is MP-10 (MP-11 is attachments). Its recommendation to type-negative-test SELECT text at the call site was replaced by meaningful compile-time tests. Suggestions for live sale/idempotency behavior are deferred to MP-19, not counted as passed here.

## Reproduction and provenance

From the authoritative Windows workspace, with Docker ready and the pinned images cached: `pnpm db:types` regenerates atomically from the disposable fixture; `pnpm db:types:check` independently generates twice and fails on drift without writing the artifact. Python is required by the local fixture; this is not a new production runtime dependency. The application remains targeted at web/PWA on Mac/iOS; physical Apple testing is a later acceptance gate. Never use the earlier managed-local redirect command to overwrite this artifact on failure.

Evidence: [write result](evidence/MP-05b-types-write.json), [fixture](evidence/MP-05b-bootstrap.json), [inventory](evidence/MP-05b-schema-inventory.json), [Claude report](evidence/MP-05b-claude-result.json), and [plan](MP-05b-plan.md). Generation uses the official pinned [postgres-meta invocation contract](https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/internal/gen/types/types.go) with isolated container networking. Image/content hashes identify the generated artifact and fixture; a passing compiler is additional integration evidence, not the source of schema truth.
