# Domain, data and API contracts

This is the target implementation contract. Existing protected components remain the rendering specification; existing engine defects are not business authority. Anything marked DP refers to an owner decision in [10](10-decisions-and-sources.md). Pending decisions block the affected behavior's release, not unrelated coding. Domain commands, not generic row patches, own invariants.

## Common types and transaction protocol

Use UUID primary keys for durable identities; human order/invoice/display numbers are separate server-issued identifiers and not access secrets. Device commands use a cryptographically random UUID generated **once before the local transaction**. JSON money is integer centavos within the safe-integer range; database money is `bigint`. The legacy engine receives pesos only through one tested conversion adapter. This intentionally supersedes the old wire contract using floating pesos. Do not permit an unversioned mixed contract.

Quantities: integer pieces for cookies/packaging; fixed-precision `numeric(18,6)` base quantities for weight/volume; explicit unit dimension and conversion numerator/denominator. Reject NaN, infinity, excess precision, negative quantities where not an adjustment and mixed dimensions. Cost estimates may carry extra decimal precision internally; posted money rounds half-up at the documented line/aggregate boundary. Record rounding residual explicitly where allocation would otherwise lose a cent. Never use binary floating arithmetic as the final posting authority.

Time: persist UTC instants plus immutable business date computed in `Asia/Manila`; schedules include named timezone and effective version. Server time controls online closure, lease issuance and posting. Device `occurredAt` is evidence, not authority to bypass an expired event or closed period; retain server `receivedAt`. Clock anomalies go to reconciliation. No hard-coded March/August fixture date in live projections.

Command envelope:

```json
{
  "contractVersion": 1,
  "commandId": "UUID",
  "kind": "order.confirmPayment",
  "aggregateId": "UUID",
  "expectedVersion": 3,
  "payload": {},
  "deviceContext": null
}
```

Each command validates schema, actor/capability, business rules and referenced records. Begin a database transaction; lock aggregate rows in deterministic order; find the unique command key; compare normalized payload hash; return the prior acknowledgment for an identical retry; reject reuse with different content. Check expected version (integer monotonically incremented), apply all related changes, append server-generated audit and command result, commit, then reply. Validation/conflict cannot leave partial stock or ledger effects. Serialization/deadlock retries are bounded and use the same command identity; never automatically retry a user decision against a changed aggregate version.

Results contain `commandId`, `aggregateId`, `version`, `committedAt` and safe projection. Errors contain stable `code`, safe existing/approved message, `retryable`, and correlation ID. Statuses: 400 malformed, 401 missing/expired auth, 403 denied, 404 not visible/not found, 409 version/idempotency/capacity conflict, 413 too large, 422 business rule, 429 throttled with Retry-After, 503 dependency unavailable. Do not expose SQL text, raw error messages, tokens or PII. A sync batch can legitimately return a 200 envelope with explicit per-row outcomes; it must not be misinterpreted as all rows accepted.

## Entity map and ownership

All staff/business tables use explicit grants and RLS or live in a private schema reached only by narrow commands. Public catalog uses a curated projection that excludes costs, supplier details and settings not needed to order. Foreign keys retain history; referenced masters are deactivated/versioned rather than deleted.

| Aggregate | Required data / constraints | Owner and persistence rule |
|---|---|---|
| `profiles`, `device_registrations` | Auth user, role/capabilities, active flag, enrollment/revocation times; unique device UUID | Owner manages staff; identity never comes from engine role selector |
| `products`, `product_versions`, `price_versions` | Stable SKU; menu name/image/allergens; active/rotating/soldout; effective price rule | Owner publishes; historic order/event references immutable version |
| `recipes`, `recipe_versions`, `recipe_lines` | Product, yield, ingredient ID, fixed-precision quantity/unit, version, author/effective time | Draft edits separate from published version; old batch never reads latest recipe |
| `suppliers`, `supplier_offers` | Stable identity, comparable pack quantity/unit, price/date/source/availability | Owner; latest actual receipt distinct from supplier list/offer |
| `inventory_items`, `inventory_lots`, `inventory_movements` | Item/base unit, supplier lot, expiry, quality status, location, signed quantity, source command/line, cost snapshot | Every change a movement; no arbitrary stock overwrite; unique source posting key |
| `stock_counts`, `stock_count_lines` | Scope, snapshot/version, counted quantity, variance, reason, draft/final actor/time | Only final command posts variance; intervening movements reconciled |
| `purchase_receipts`, `purchase_lines` | Supplier, amount, quantity/units, tax treatment, proof object, lot/cost data | One receipt command posts stock and expense once; partial receipt has separate receipt ID |
| `drops` | Schedule version, open/close/pickup, capacity cookies, manual override/effective range, version | Stable explicit drop ID; derived schedule determines transitions, no stale “current” pointer |
| `orders`, `order_items`, `order_contacts` | Drop, display number, state/payment state, line quantities and full commercial snapshots, contact purpose/retention | Creation atomic; contact separate from retained financial data |
| `payment_claims`, `payment_events`, `refunds` | Claimed versus verified amount, method/ref, proof, verified actor/time, balance, original source | Proof never automatically sets paid; partial payment/refund retained |
| `order_status_capabilities` | Random token hash, order scope, expiry/revocation, minimal access log | No direct lookup by mobile/email/IG; capability must not be order number |
| `production_batches`, `batch_inputs`, `batch_outputs` | Recipe version, planned/actual/reject quantities, input lot references, dough/rest/output times and costs | One command consumes inputs/produces outputs with conservation and genealogy |
| `events`, `event_allocations`, `event_price_snapshots` | Event UUID, device/actor, allocation epoch, quantities, prices/discount policy, preparation/expiry, close state | Only one active offline writer; server reserve before offline operation |
| `event_sales`, `event_sale_items`, `event_adjustments` | Stable command/client UUID, device sequence, event epoch, source hash, server actor, immutable lines/tenders | Sale/reversal/payment facts retained, not overwritten or deleted |
| `ledger_entries`, `ledger_source_links`, `report_periods` | Source document, kind, signed cents, business date, category ID/version, correction link, posting version | Append-only operational ledger; close period records totals/hash; reversals instead of delete |
| `form_queue` | Staff-entered or verified import item, external source ID, raw input quarantine, normalized proposal, acceptance/rejection | No unsupported automatic form connector; acceptance invokes normal order command once |
| `settings`, `settings_versions` | Typed key/value, effective version, source default/override, actor; known-key constraint | Atomic settings group update; no mutable setting changes historic transactions |
| `notification_events`, `notification_preferences` | Stable condition/source/version ID, role scope, dismissed/resolved; channel preference | Dismissal never resolves an underlying condition; no label-only identity |
| `attachments`, `backup_runs`, `erasure_requests`, `audit_log`, `command_results` | Object metadata, purpose/owner/hash/size; job evidence; request verification/decision; minimal audit metadata | Owner/private operations; support receives redacted status only |

Do not claim the current 19-table documentation already supplies this schema. MP-05 establishes a schema map from each existing table/column to keep/alter/new, identifies duplicate concepts, and generates types from the actual applied result. Reuse current tables where semantics match; names above specify responsibilities rather than a demand to create duplicates.

## Authorization matrix

| Operation/data | Public customer | Helper | Support | Owner |
|---|---|---|---|---|
| Published catalog/shop status | Read safe fields | Read | Read | Read/publish |
| Submit order/proof claim | Scoped own submission | No special privilege | No | Yes via staff command |
| Order status | Valid capability only | No customer-wide access | No | Full operational access |
| Confirm payment/refund/change price/capacity | Deny | Deny | Deny | Allow with reason/version |
| Kitchen/receiving/count/recipe | Deny | Deny unless later explicit capability | Deny | Allow |
| Bazaar sale | Deny | Own assigned event/device | Deny | Assigned event/device |
| Event close/count cash | Deny | Assigned event, per approved policy | Deny | Allow/review |
| Costs/margins/P&L/global money export | Deny | Deny | Deny | Allow |
| Health/notifications | Minimal public availability only | Own sync/operating alerts | Redacted diagnostic status | Full operational status |
| Staff, retention, backup/restore | Deny | Deny | Deny by default | Controlled command; restore requires release procedure |

Helpers necessarily see sale/tender/change amounts to operate a stall. “No money” means no costs, margins, general ledger or other events' financial information; clarify misleading old prose through DP-05. A diagnostic support account is not an owner impersonation account. Test both API responses and direct database calls; hiding fields in React is insufficient.

## Order and payment rules

Public order submission is online-only. Keep the cart/form draft on failure; never queue an unconfirmed online checkout and show success. Server validates drop openness, active products, positive quantities and per-order maximum. Capacity is measured in **cookies**, not boxes. Pending payment review does not reserve capacity, matching the prototype. Consequently pending claims can exceed remaining capacity; the owner resolves capacity at payment confirmation. Customer communications must accurately express this reservation policy (DP-02).

Recognized capacity statuses must match the engine's declared `RECOGNISED` membership, including fulfilled/no-show history as appropriate to the same drop. Historical fulfillment consumes that drop's production capacity even after pickup. Cancellation/refund releases only the reservation quantity defined by the approved transition. Test actual status transitions, not merely arithmetic helpers. A normal confirmation cannot exceed capacity. The existing overage sheet permits an **explicit owner override**, which requires fresh remaining count, reason, exact overage and audit. Tests asserting no oversell exclude this deliberate recorded exception.

| Command | Preconditions | Atomic consequences |
|---|---|---|
| Create order | Open drop, valid positive cart, current allowed catalog, bounded contact/proof claim | Payment-review order, snapshots, contact, status capability, audit; no verified payment or capacity booking |
| Submit/retry proof | Own capability or owner; valid staged object/ref; eligible state | New claim/proof version; prior rejection retained; no paid flag |
| Confirm payment | Owner verified wallet/bank evidence, legal state, expected version; capacity or explicit override | Payment event, balance, recognized state/reservation, operational invoice/reference number if allowed; audit |
| Settle balance | Owner; positive receipt <= outstanding unless explicit overpayment policy | Additional payment event and reduced balance; no duplicate revenue |
| Reject claim / reopen | Owner, eligible review/rejected state | Rejection reason retained; cancel/reopen according to existing flow; no invented refund of unverified money |
| Start preparation | Confirmed order / linked production demand | Preparing state and work linkage; no duplicate stock consumption |
| Pack | Eligible preparation, baked and packaging availability or approved shortfall handling | Reserve/consume exact baked units and packaging movements once; Ready state |
| Collect | Ready, outstanding balance handled by approved rule | Completed, collected time/actor, no second stock deduction |
| No-show | Ready, pickup elapsed or owner-reason override | No-show evidence; preserve payment/capacity history; disposition handled explicitly |
| Refund/cancel | Owner, actual original payment and remaining refundable amount, reason | Refund event; reverse correct recognition source exactly once; stock only returned to allowed quality/location status |

Current packaging mapping must be preserved and verified: boxes for full sixes, pouches for remainder, sticker per cookie and at least one thank-you card per order. If the approved UI permits a stock shortfall, do not silently clamp inventory to zero: record a deficit/exception with owner confirmation and reconcile it. Whether to block packing until corrected is DP-03; neither behavior can be invented by the agent.

Public capability: generate at least 128 bits of cryptographic entropy (prefer 256), store only a keyed/cryptographic hash server-side, scope to one order, expire/revoke under retention policy. Use URL fragment exchange to a short-lived restricted cookie where possible so the secret is not in referrer/server access logs. Apply `Referrer-Policy: no-referrer`; do not include tokens in analytics. The status payload contains only the customer's necessary status, order summary, amount and pickup details, never all orders. Unknown/expired/revoked responses are indistinguishable. Recovery through the current single-field lookup is DP-01: no low-entropy search can be exposed publicly just to preserve placeholder copy.

## Pricing, costs and reporting

Persist the selected pricing rule, price version, each line unit price, packaging count/fee, discount, cost basis and rounding with the order/event. Default live rule is sum of menu prices. The other three existing pricing modes remain inactive until owner confirms them and fixtures prove each; no agent removes controls or silently chooses a new policy. Recipe cost multiplier uses a frozen cost basis, not whatever the latest receipt costs at report time.

Preserve the prototype's **latest actual paid unit cost** for management estimates, with supplier quote fallback. Do not substitute weighted-average inventory accounting because an ERP manual mentions it. Financial inventory valuation, if needed for statutory accounts, is a separately approved report. Packaging profitability must use actual packed quantities for a fulfilled order; the old six-cookie approximation remains an estimate only.

The default operational report model preserves the existing drop-close recognition behavior: verified receipts are payment facts; drop revenue posts once at close from eligible orders; event sales post once per accepted sale; a refund before drop close reduces the close source, while after close it creates a source-linked reversal. A reconciliation view bridges cash received, unclosed-drop receipts and recognized revenue so cash and P&L are not conflated. Do not add per-order revenue on top of the drop-close entry.

Expense/purchase posts one paid expense. Production consumption moves stock/cost but does not create a second expense in this operational P&L. Owner draws affect cash, not expense/profit. Drawer variance is separate from genuine sales. Category ID is stable; rename can display the current label while audit preserves old label/version. The 6.2-second Undo affordance posts a compensating command if the original has already committed; it never erases posted history. Closed reporting periods use corrections in a later open period or a recorded owner reopen, not silent historical rewriting.

Period labels must come from the chosen Manila period, with identical date boundaries across totals/trend/export; DP-04 resolves the current fixed-August/rolling-window inconsistency. Tax values are configurable management assumptions until the owner's actual tax regime is verified. Do not label a percentage estimate as a filed liability or infer tax registration from `taxRate=3` fixture data.

## Production and inventory

Receiving creates an immutable receipt, quantity/cost movement and optional expense in one transaction. Partial receipts use distinct source lines; retry does not double receive. Supplier quotes, last actual purchase and chosen grocery offer are separate values with dates. Compare offers only after unit normalization; stale/unknown offer data must not masquerade as the cheapest current price.

Dough lots preserve each mixing time; adding a new batch cannot reset the age of old dough. Rest and aging checks apply per lot. Mixing consumes actual measured ingredient quantities against the saved recipe version and creates dough yield. Baking consumes rested eligible dough, produces accepted baked units and records rejects/waste; batch variance never creates units without a source. Need-to-bake subtracts only allocatable baked stock; stock at an offline event, held/quarantined or already packed is unavailable to other orders.

Stocktake stores count scope and snapshot; unentered is different from zero. Freeze the scoped location or track intervening movements and require review before posting variance. Editing item names/units must not detach historical movements or recipes. Do not automatically reset expiry for all old stock on receipt; create a new lot. Refund/return of food does not automatically make it sellable; disposition follows DP-07 and the owner's safety SOP.

## Offline event protocol

1. **Prepare online.** Owner assigns one device, fetches fresh profile/catalog/event prices and approved discount/freebie rules, reserves exact baked quantities and required packaging into an event location, issues an allocation epoch and bounded operating window. Snapshot the packaging rule: the current bazaar uses one pouch per cookie and one bag per customer transaction. This differs from preorder packing. Confirm source-engine mapping and DP-03 shortfall behavior in fixtures. Verify app shell cached, IDB works, battery/storage, all prior queues reconciled. Show existing event setup values through the adapter.
2. **Commit offline.** Validate positive canonical cart, baked/packaging allocation remaining and permitted tender. In one IDB transaction append sale command and lines, increment monotonic device sequence, update remaining baked/packaging allocation and cash expectation, retain event epoch/hash. Await transaction completion, then update UI/clear cart/show receipt. Use a local pending state if persistence is slow; a quota/abort failure must retain the cart and never claim recorded. A packaging deficit follows the explicitly approved DP-03 policy; it never silently creates physical stock.
3. **Replay.** Foreground reconnect, manual Sync, app resume and optional service-worker triggers call the same versioned protocol. Acquire a cross-context lease; process at most 50 commands or 128 KiB per request, whichever first. One rejected row must not block valid independent rows; reversals depend on original sale acceptance. Timeout 15s, exponential backoff with jitter 2s–5min, honor Retry-After, stop on auth/config/business conflict.
4. **Validate server-side.** Actor/device/event epoch match; event allocation exists; sequence/UUID/hash consistent; quantities and event prices valid; permitted discounts and packaging consumption recomputed from the issued snapshot; remaining allocation nonnegative except a separately authorized adjustment/deficit. One SQL transaction posts sale, lines, baked/packaging movements, ledger, audit and receipt. Reject unknown product and conflicting UUID reuse. Voids distinguish reversing a duplicate/unfulfilled sale from a fulfilled sale: physically used packaging is waste/consumption unless actually returned unused; a financial reversal alone cannot restock it.
5. **Acknowledge.** Response per command includes client ID, payload hash, server sale ID, commit time and result state. Only a matching requested ID/hash can change its local status. Unknown/duplicate/missing IDs or malformed results leave affected commands pending and create a safe protocol error. Do not infer success from HTTP 200 or `failed=[]`.
6. **Reconcile.** Query accepted IDs/hashes in bounded pages; compare quantities, tender totals, sale count and reversals. `serverHas: count` alone cannot identify a missing sale. Keep committed local records until server proof plus minimum retention/backup policy; pending records are never auto-pruned.
7. **Close.** Stop new sales on the device; settle/reconcile queue; enter physical cash and stock count; post closeout variance and return only eligible unsold units exactly once. Offline provisional close is a local command; global stock is not released until authoritative reconciliation. Reopening is a new allocation/epoch after counting, not replay of old stock.

Connectivity loss and session expiry are distinct. Prepared offline sales can continue only within the issued operating window and allocation. Device revocation cannot instantly reach an offline phone; expiry bounds exposure. On reconnection, commands from a revoked/expired context are **quarantined for owner reconciliation**, never discarded or automatically posted as authorized sales. The physical sale may have happened; audit/stock/accounting must account for it through an owner resolution command. Do not automatically reallocate the outstanding stock when a lease expires. This sacrifices immediate availability to avoid double selling.

A lost device invokes incident SOP: block future authorization, preserve its allocation as unresolved, reconstruct from paper receipts/cash/physical count, approve reconciliation before replacement allocation. No claim of remote erase while offline. Logout on an event phone must protect private display and credentials while retaining minimal unsent sale facts safely; warn through an approved state before any site-data clearing action. Encryption of local queue with a same-origin key is not protection from XSS; OS lock and data minimization remain essential.

## Endpoint catalog

All routes below are future `/api/v1` contracts. Each has a corresponding SQL command/projection and permission test. Do not implement generic arbitrary `PATCH state` endpoints.

| Endpoint family | Operations / payload essentials | Role / idempotency |
|---|---|---|
| `/session` | Login, refresh, logout, current profile/capabilities; safe return path | Staff; no credential logs; login rate limit |
| `/catalog`, `/shop` | Published menu/version, current schedule and safe availability | Public read; short cache, ETag |
| `/orders` | Create from quantities/drop/contact/claim + command UUID | Public narrow command; server pricing |
| `/orders/status`, `/orders/recovery` | Capability exchange/status; approved manual recovery path | Scope to one order; enumeration resistance |
| `/orders/:id/commands` | Confirm, reject, reopen, settle, prepare, pack, collect, no-show, refund | Owner, version+UUID |
| `/uploads/intents`, `/uploads/finalize` | Purpose, allowed size/type, staged owner, final object checksum | Scoped customer claim or owner; orphan TTL |
| `/drops`, `/catalog/commands`, `/settings/commands` | Versioned updates and rollover/publish | Owner; explicit overage audit |
| `/inventory/commands`, `/receipts`, `/counts` | Receive, adjustment, waste, count draft/final | Owner; movement/source uniqueness |
| `/production/commands` | Mix, bake, reject, resume/discard draft | Owner; versioned inputs/output transaction |
| `/events/prepare`, `/events/close`, `/events/reconcile` | Device allocation/epoch, price snapshot, physical count | Owner or assigned helper per capability |
| `/sync`, `/sync/status` | Bounded command batch; IDs/hashes and outcomes | Assigned active device; per-command authorization |
| `/reports`, `/ledger/commands` | Explicit period; expense/draw/reversal; source-linked export | Owner; bounded pagination |
| `/form-queue/commands` | Staff input/review/accept/reject + external source key | Owner; acceptance uses normal order command |
| `/notifications`, `/health` | Role-safe conditions/preferences; minimal liveness/readiness separation | Scoped; support no money/contacts |
| `/operations/*` | Staff lifecycle, backup status, export, erasure request/action | Owner; maintenance credentials isolated |

Upload baseline: raster JPEG/PNG/WebP only after server magic-byte/type validation; 5 MiB raw upload maximum, target <=250 KiB normalized proof when feasible; dimensions/pixel count bounded to avoid decompression abuse. iPhone HEIC must convert safely or receive an approved actionable error—do not claim camera compatibility from a filename extension. No SVG/HTML/PDF preview in the first proof path. Use randomized private object keys, finalized metadata tied to one record, short-lived signed reads and orphan cleanup. Retrying finalization cannot duplicate attachment records. Do not trust client compression as the security boundary.

The free edge's 10 ms CPU allowance is not an image-transcoding budget. Prefer device-side conversion to an allowed raster format, then bounded server header/signature/dimension validation with decoder/parser tests and streamed size limits. MP-04/MP-11 must measure the actual validation path. If robust HEIC conversion or safe validation cannot fit the chosen free architecture, use the reviewed Files/JPEG/PNG fallback and keep unsupported input rejected; do not introduce an unpriced image service or claim an untested decoder is safe.

Public feedback/waitlist and the temporary form bridge need explicit purpose, consent where applicable, expiry and ingestion source. Until an external integration is specified and authorized, provide staff-reviewed structured input/import only. Messaging defaults to user-initiated copy/share of approved text and status link; no automatic SMS/WhatsApp/payment-provider API is included in zero-cost launch.

## Settings validation registry

The 21 keys are covered as groups; MP-09 creates a machine-readable per-key registry and round-trip tests. Defaults come from approved configuration, not hard-coded fictional seed history.

| Keys | Type/bounds and effect |
|---|---|
| `capacity`, `maxPerOrder` | Positive integer cookies; proposed upper bounds 100,000 and capacity respectively; changing capacity cannot silently invalidate existing commitments |
| `taxRate`, `discountA`, `discountB` | Explicitly tagged units (percentage vs fixed amount per existing UI); valid range, snapshot policy, owner-only; never infer from a bare number |
| `drawerFloat`, `groceryBudget`, `packagingFee`, `flatBoxPrice` | Nonnegative integer centavos on wire/DB; legacy peso conversion once |
| `restHours`, `doughWarnDays` | Nonnegative durations with owner-verified food policy; changing rule preserves already-recorded lot facts |
| `cogsMultiple`, `priceMode` | Valid supported mode and fixed-precision multiplier; full price snapshot; alternative modes require DP-04 |
| `openDow`, `openH`, `openM`, `closeDow`, `closeH`, `closeM`, `extendH` | Day 0–6, hour 0–23, minute 0–59, bounded extension; validate schedule as a group and snapshot per drop |
| `retention` | Explicit supported enum translated to a versioned policy; legal hold and unfinished work override deletion eligibility, not visibility tricks |

Notifications/users/backup toggles and other engine state outside DEFAULT_CFG also need a persist/not-persist classification. An effective-settings function must not leak private values through default PUBLIC grants. A null row cannot ambiguously mean both “explicit default” and “unset”; use a documented override flag/value schema.
