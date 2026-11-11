> **Codex's audit, moved here from a private folder on 5 November so every agent can read it.** It describes the code at the commit named
> below; check the current code before acting. Its screenshots stayed private. Since then: F01 and F02 are fixed (7b8e819, 9db3e62), and the
> stock half of F04 is fixed (5231c6a). The rest is in the plan in [the client review](client-meeting-2026-11-04.md).

# Happy Cookie: usability and completeness audit

5 November 2026 · audited source `b7361081d34c6843a91e2000f01585ec7cada029`, branch `codex/refined-workflows`.

## Assessment

The owner application has advanced substantially. Six clear primary destinations, neutral surfaces, real product imagery, contextual settings, product/recipe pages, simultaneous production entry, stock workflows, charts, customer pages and retained Add event entry now exist in actual source. Another broad visual redesign is not the next priority. Finish cross-page continuity, truthful status, transaction confirmation and the outstanding acceptance work.

I would not sign off the whole system as production-ready from this audit. A false event-save confirmation is reproduced below. There are also important usability gaps on the mobile till and recipe-to-production handoff. CI success alone will not close these.

The reference register currently contains **58 Done rows, 4 Partial rows and 1 Not-a-feature row**. These are grouped checklist rows, not 85 individually accepted workflows or a percentage of product readiness. The register itself limits Done to synthetic-preview evidence. Some Done rows contain accepted adaptations or incomplete behavior; they need stronger acceptance criteria.

## Evidence and boundaries

- Read-only review of current source, latest commits, the reference coverage/control maps, capability ledger and owner requirements. No application source, production records, migrations, CI settings or releases were changed.
- 22 fresh actual-component screenshots: Home, Events, Sell, Products, Inventory, Money, Shop and Shopping at390/1440; recipe-to-production at390/1440; active till at320/390/768/1440. Images and JSON are beside this report. These use synthetic RPC fixtures, not hosted customer data.
- The eight parent destinations had no detected horizontal document overflow or browser page exceptions at390/1440. The active till returned to Events at all four tested widths with no page exceptions or horizontal overflow. This does not prove every child state, accessible interaction or physical-device behavior.
- Events parent captures include its loading state; the initial parent crawl intentionally did not wait for every asynchronous business read. Do not use that screenshot as loaded-directory acceptance.
- Recipe-to-production lost context was reproduced through the actual rendered controls. The event acknowledgement probe used deliberately refused synthetic RPCs and a failed refresh, with all external network requests blocked.
- Did not rerun the repository-wide suite/build while Claude is doing CI/release. No fresh hosted screen/session, SQL-concurrency, Safari/iPhone, full accessibility or owner-week acceptance is claimed.
- The first cold synthetic development-preview navigation exceeded30seconds; the warm retry opened. This is development-tool evidence, not a production latency measurement. New signed-in production timings remain necessary.

## Prioritized findings

### F01 · High · A refused event save can be reported as confirmed

**Observed:** `BazaarDays.sendEventEntry` accepts any cached booking with the same ID after an unconfirmed RPC. It ignores whether refreshing bookings succeeded and whether the stored name, place, dates, rent and active flag match the frozen request. It then sets newly-created hub facts, toasts success and returns true. The controller clears the retained request on that true result.

**Proof:** `event-ack-probe.json` records `serverRefused:true`, `refreshFailed:true`, `sameIdDifferentBody:true`, `reportedConfirmed:true`. This was reproduced against the real class in the synthetic browser. A same-ID row can legitimately differ after another session changes an event following a lost reply; this does not require a random UUID collision.

**Source:** [bazaar-days.ts:534](../../src/store/bazaar-days.ts:534), [event-entry.ts:249](../../src/store/event-entry.ts:249).

**Required outcome:** accept the exact server acknowledgement, or a successful fresh read matching every field of the normalized retained request. Cached presence or a different body must keep the entry unresolved, explain the conflict and preserve recovery. Fence all hub/toast/list effects to the relevant identity too. Test refused+stale cache, mismatched fields, failed refresh, exact matching readback and owner changes. Independent review before acceptance. **Recommended release blocker.**

### F02 · High usability · Phone/tablet till hides the itemized current sale

**Observed:** Current sale, item names and quantity steppers are `hidden` below the desktop breakpoint. At390px the owner sees cookie rows, Sales today, and an aggregate count/total with Freebie and Charge. There is no current-sale list to inspect/edit before opening payment. The same breakpoint affects a768px tablet.

**Evidence:** phone till, desktop till; [till.tsx:261](../../src/components/live/bazaar/till.tsx:261), [mobile footer:340](../../src/components/live/bazaar/till.tsx:340).

**Required outcome:** preserve an explicit, easily reached itemized sale at smaller sizes. A compact expandable sale summary can open the same product/quantity/price/total controls while keeping Charge within reach. State the amount on Charge. Test multiple flavours, repeated taps, decrement to zero, sold-out after selection, long names, payment Back and navigation without losing the cart. Keep the clear Events return, which passed this audit.

The compact two-column cookie rows also differ materially from the supplied three-column photo-card reference. Confirm whether that later adaptation has client approval rather than marking it exact visual parity. Do not undo a separately approved newer direction blindly.

### F03 · High usability · Recipe quantity/product is discarded at Start production

**Reproduction:** Products → Double Chocolate Fudge recipe → Cookies to make48 → Start production. The new page says Review0products; neither48 nor the selected recipe is carried forward. Reproduced at390/1440. The user must enter the same information again.

**Source:** [recipe-reader.tsx:150](../../src/components/live/recipes/recipe-reader.tsx:150), [ops-runtime.tsx:8391](../../src/store/ops-runtime.tsx:8391), [recipe callback:8463](../../src/store/ops-runtime.tsx:8463). Evidence: `recipe-to-production-390.png` and `screens.json`.

**Required outcome:** pass product ID, valid scaled quantity and relevant recipe version into the existing multi-product planner. Keep Add another product available. If work already exists, explicitly offer to continue/add rather than replacing drafts or a pending request. Planned amounts must never become actual baked stock automatically.

### F04 · High clarity · Home and Inventory disagree about uncounted stock

**Observed:** Home labels Brown sugar and Brand sticker Out and includes them in its out-of-stock bar. They have never been counted. Inventory instead says Not counted, while still showing0 as the large balance. The owner cannot tell whether the cupboard is empty or merely unverified.

**Evidence:** [Home](home-1440.png), Inventory; [home-desk.ts:43](../../src/store/home-desk.ts:43), [inventory row](../../src/components/live/stock/inventory-live.tsx:55).

**Required outcome:** make count confidence explicit and consistent across Home, Inventory, Shopping and recipe stock checks. Distinguish unverified recorded balances from confirmed zero; use Count stock for unknown items and replenish actions for confirmed shortages. Do not erase recorded stock movements merely because an item lacks a physical-count date. Test new never-counted items and items with subsequent recorded receipts separately.

### F05 · Medium · Customer history/export implies more coverage than the data source provides

The customer directory is built from the staff order list. The applied SQL returns open orders plus recent60-day history, capped at500rows. Customer detail says Order history and Export customer record without explaining that boundary; an empty result says Nobody has ordered yet. Older customers can disappear and the displayed order count is not a lifetime count.

**Source:** [SQL40:854](../../supabase/migrations/20260101004000_order_extras.sql:854), [runtime customer source:971](../../src/store/ops-runtime.tsx:971), [customer detail:186](../../src/components/live/sell/customers-live.tsx:186), [empty wording:258](../../src/components/live/sell/customers-live.tsx:258).

**Required outcome:** accurately label recent/loaded order history and export scope now. If complete customer history is a required capability, add an authorized paged read with appropriate permissions rather than pretending the operational order feed is a customer archive. Validate customer removal against its real normalization/retention rules; a limited readback cannot prove that all historical contact data vanished. No hosted removal was exercised here.

### F06 · Medium · Shopping plan and production remain separate, with fragile plan retention

Planned bake is a useful shopping note, but its values are not handed to production. Its storage key is a single `hc-planned-bake-v1`, without owner/backend scope; storage failures are silently accepted and unreadable notes become empty plans. The screen does not disclose when the plan will survive only this visit.

**Source:** [bake-plan.ts:82](../../src/store/bake-plan.ts:82), [storage handling:158](../../src/store/bake-plan.ts:158), [runtime wiring:932](../../src/store/ops-runtime.tsx:932).

**Required outcome:** share a deliberate handoff to the existing multi-product planner, preserve edited production, and describe the plan's scope/lifetime. Scope saved plans to verified owner/backend; show a short honest message if saving the note fails. This plan does not post stock or money, so use proportionate recovery rather than recreating the sale queue.

### F07 · Medium · Review/confirmation behavior is inconsistent in Bazaar operations

The register correctly lists event tools/review as Partial and the event cost card lacks the cost Review available in the recipe book. Add cookies and Fees post directly from their entry forms. Being removable later is not the same as making the financial/stock effect understandable before saving.

**Source:** [StockForm](../../src/components/live/bazaar/day-review.tsx:126), [FeesSection](../../src/components/live/bazaar/event-page.tsx:183), [CostCard](../../src/components/live/bazaar/event-page.tsx:341), compared with [cost Review](../../src/components/live/recipes/flavour-page.tsx:48).

**Required outcome:** a short inline review or explicit effect summary for stock/fee/cost changes, clearly distinguishing planned cookies, transferred baked stock and actual production. Keep frequent checkout fast. Verify removal/reversal actually works before relying on it as error prevention. WCAG3.3.4 permits alternatives such as reversibility or checking/confirmation; it does not mandate a separate review page for every action. [W3C explanation](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data).

### F08 · Medium · Money visuals need clearer scales and reporting scope

The income/expense chart has a zero line and week labels but no visible peso scale or direct bar values; exact amounts are behind Show amounts. The same period-based page ends with What each flavour earns, which uses all recorded sales. Its caption discloses this, but only below the rows.

**Evidence:** Money; [chart:32](../../src/components/live/money/money-live.tsx:32), [product section:460](../../src/components/live/money/money-live.tsx:460).

**Required outcome:** add sparse readable peso labels or direct values, retain the exact accessible amount table, and visibly title the separate scope All-time flavour performance or make it follow the selected period when supported. Continue to separate owner draws, refunds, open-bazaar exclusions and uncosted-stock warnings. Additional decorative charts are unnecessary.

### F09 · Medium · Failure recovery and navigation need state-by-state acceptance

For example, Money's not-loaded panel explains the missing books but provides no local Retry action. Some destinations remain dependent on global refresh, current screen state or unmounted local controls. A readable empty/loading panel is not enough to show that the owner can recover and continue.

**Source example:** [money-live.tsx:279](../../src/components/live/money/money-live.tsx:279).

**Required outcome:** walk each main flow through loading, true empty, first-read failure, stale last-good copy, offline, validation failure, refused/conflicting save, unanswered save, confirmed save with failed refresh, navigation away, Back, reload and identity change. Every applicable state needs a useful action and preserved input. Do not claim a failure until tested; this is the missing acceptance matrix, with the books Retry gap confirmed by source.

### F10 · Completion gap · Four Partial rows do not describe all remaining acceptance work

The four rows are event tools/review, customer-facing Shop/checkout/status layout, event cost Review, and people/account provisioning. They are not equally severe: provisioning via the hosted administrator can be a deliberate operational boundary, and the classic fallback can deliberately retain protected markup. The public customer journey still needs an owner-approved live replacement if visual consistency is required; never edit the locked port to force it.

Other obligations remain outside those rows: realistic linked demo data across all sections; deployed schema/API compatibility including sampler-flavour migration71; complete customer ordering/payment/fulfilment and returns; production-to-stock/ingredient-cost reconciliation; offline sales recovery; helper/owner permissions; safe exports/backups; current signed-in performance and actual-device/owner acceptance. Saved notes are stale in several places and disagree about recipe editing, ownership, price-editor integration and demo authorization. Clean up those contradictions after Claude's current release work.

Modularity has improved through focused controllers and shared UI patterns. `ops-runtime.tsx` is still9,545lines and directly constructs many projections. This is continuing maintainability debt, not a reason for a risky rewrite during release. Put new behavior in focused controllers; extract further only with preserved contracts and tests.

## What remains, by area

- **Home:** retain its clearer work panels; fix count confidence and verify alert links, real-period money and recoverable health failures.
- **Bazaar:** fix F01 and mobile sale inspection first; reconcile compact board with approved reference; complete tool/cost effect review and till/payment/void/close/recovery tests.
- **Sell:** keep the grouped workflow; validate unpaid→paid→preparing→ready→collected and cancellation/refund/swap paths. Explain history limits and test contact handling without destructive hosted experiments.
- **Shop/customer journey:** verify scheduling, pickup, capacity, sampler selections, add-ons, payment references, order lookup/status and mobile public pages against the actual backend. Owner layout completion does not prove customer completion.
- **Make:** carry recipe/bake-plan context into group production; prove different flavours/products and dough can coexist, finish independently and update good/reject/ingredient/stock results correctly. Exercise recipe edits, version changes, drafts, reload and uncertain saves.
- **Stock:** consistent unknown/count/recorded balances; planned-bake handoff and retention; receive/count/waste/correction/supplier-price flows and their money effects; complete supported-unit and missing-price cases.
- **Money:** preserve useful signed figures/charts; improve chart scope/scale; match period totals to drill-down/export; verify purchases, stock uses, refunds, owner draws, open-event exclusion and pending costs end to end.
- **Account/system:** verify owner/helper restrictions, sign-out with unsent sales, session expiry, unavailable storage, two tabs, back/refresh and backup/export recovery. People provisioning/restore restrictions must be explained honestly rather than represented as automatic browser features.

## Recommended order after Claude's CI work

1. Freeze the exact candidate SHA; retain CI results and review receipts. Fix and independently review F01 before releasing that candidate.
2. Fix F02–F04 as small source slices with meaningful regressions and responsive checks. Keep the existing design direction.
3. Fix F05–F09 and reconcile the capability/coverage/state documents. Test real task outcomes rather than screenshot presence.
4. Run one connected scenario per business loop: order→payment→production→stock→pickup→books; planned shopping→receipt→production→cost; event→day→sale/offline→void/reconnect→close→finalize→books. Include failure/reload/permission branches. Use an approved safe test environment/data plan.
5. Verify the actual target backend/schema and fresh hosted baseline. Execute the already-authorized additive demo scope only after its review/runtime prerequisites; do not infer approval for unrelated migrations or deployment.
6. Measure the signed-in optimized app with realistic data: cold load, navigation, filters, typing, save acknowledgement and refresh separately. Do not use development compilation time or anonymous sign-in results as the product performance verdict.
7. Owner task rehearsal on the actual iPhone and desktop, then the documented operating trial. Navigation should be discoverable without a manual; ask the owner to perform tasks unaided and record where she hesitates.

## Design standard for the remaining refinements

Preserve context between steps, use the same words for the same state, show the next action where it is needed, and keep charts tied to exact figures and scope. These recommendations follow [NN/G recognition rather than recall](https://www.nngroup.com/articles/recognition-and-recall/) and [W3C error-prevention guidance](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data). This audit is not a formal WCAG conformance assessment.

## Verification receipt

Fresh local checks:16parent renders at390/1440,2recipe handoff reproductions,4till renders/Events returns,1event-ack fault probe. Browser page exceptions and horizontal overflow were absent in the tested parent/till views. F01 and F03 are deliberately failing behavioral outcomes, not passing acceptance tests. No fresh `pnpm verify` result is claimed by this read-only audit; Claude owns that gate for the current release candidate.
