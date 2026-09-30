# Finish plan — from here to Cine running her business in the app (2026-09-28)

Status: **APPROVED** by Ethan on 2026-09-28. He took every default: F1–F10 as listed in section 11. Cine's C1–C12
runs on its defaults until she answers; her answer replaces the default when it arrives. Drafted by Claude (Opus 5.5).

This is the **single forward plan**. It replaces:
- the forward-looking order in [G2-plan.md](G2-plan.md);
- the slice list in [order-form-audit.md](order-form-audit.md);
- "Path to fully functional" in [lean-plan.md](lean-plan.md).

`MASTER-PLAN.md`, `docs/master-plan/tasks.json` and the MP-\*/G1 plan files are history. [next-goal.md](next-goal.md)
stays the only thing an agent executes.

## 0. How to read this file

- **Every session:** `AGENTS.md` (loaded automatically), [current.md](current.md) (short status),
  [next-goal.md](next-goal.md), then **only the section of this file the goal names**. Not the whole file.
- **Privacy:** the sections below cite Cine's materials by count and category only. Recipe quantities, costs,
  account numbers, QR codes and any customer or staff names stay outside the repo; they reach the database through
  her own edit screens or the one-time import (section 9).

## 1. What "done" means (functional and complete, nothing extra)

Launch means Cine runs a real week entirely in the app while the sheet is only an archive. Each item below is
from her own answers:
- the 4 Aug client guide's first-release list;
- her 115 walkthrough comments (22–25 Jul);
- her 28 Sep answers.

| # | Capability at launch | Her words / source |
| --- | --- | --- |
| 1 | Menu: flavours, prices, photos, allergens, badges, on/off, publish | Guide §1 "must"; 28 Sep: allergens per flavour |
| 2 | Customer order page replacing the Google Form: name, IG, mobile (email optional); flavours per piece; boxes of 6/8/12, fewer than 6 in bags; add-ons (note card with message, ribbon, stickers 1–4, sticker pack); sampler box; pickup date on her pickup days (Mon/Thu) and time; courier booked by the customer or campus pickup; same-day +40%; flavour suggestions; payment method (GCash, Maya, GoTyme, cash for campus pickup only) with pay now or pay later | Sept form (14 questions); 28 Sep: "every form feature… configurable" and her Q6 answer |
| 3 | Capacity: 200 cookies per week, unpaid orders hold slots, 24-hour unpaid release, per-phone limit | Guide Q10; comment 60 "pay within 24 hrs"; D1 |
| 4 | Orders: one list with Awaiting payment → Paid (a tick she sets after checking her wallet) → Ready → Collected, plus Replaced (swap), Cancelled and No-show; the private status link; copy-paste messages | 28 Sep Q1 "check box… paid"; guide Q8; DP-12 |
| 5 | Waitlist when closed or sold out ("notify me") | Guide Q2; comments 18, 28 |
| 6 | Recipes with versions (her R&D), yields, half/double batches | Comments 66, 68, 84 |
| 7 | Bake planner and dough balls: bake only what was ordered; leftover balls stay in the fridge; deduct ingredients when she confirms production, with a quick ± correction | Guide Q14–Q17; comments 72, 107 |
| 8 | Inventory for **all** ingredients and packaging: receive purchases with cost, weekly count, waste, low stock; grocery list with pack sizes and the lowest recent price | Guide Q18–Q21; comments 71, 76 |
| 9 | Suppliers with prices and links | Comment 75 |
| 10 | Bazaar Mode: event stock, fast offline selling on one phone, freebie button, expenses, close-out, event profit | Guide "must"; comments 77–80 |
| 11 | P&L: revenue, cost counted when used, her expense categories (including helper wages), profit, the records behind each number, CSV download | Guide Q23; comment 86; DP-04, DP-10 |
| 12 | Helper login (shared) that never shows cost or profit; sale totals behind her switch | Guide item 28; 28 Sep Q4 (done) |
| 13 | In-app alerts: new order, low stock, grocery shortage, pickup reminder, backup failure, system error | Guide Q29; DP-12 in-app only |
| 14 | Weekly backup and restore drill, 1-year retention, privacy notice on the shop | Guide Q30; DP-10; lean plan |

**Not at launch** (each is a decision in F2, with her words):
- customer feedback: "no need for customer feedback feature yet";
- loyalty and promotions: "very near future";
- wholesale, consignment and collabs: "will come in the near future";
- the monthly target view, her most-wanted screen, which is not in the prototype;
- in-app payment-proof upload;
- email alerts: "copy-paste messages are enough for now";
- the Google Form bridge;
- owner-entered orders;
- labour-cost and cash-position views;
- the automatic runner (AR-00–06).

## 2. What Cine uses today (2026-09-28 audit)

How each source was read (so nothing is claimed that was not done):
- **Read in full:**
  - the September form, page by page as images;
  - the workbook's configuration tabs, cell by cell with formulas (Ingredient Master, Recipes, Costing Dashboard,
    Box costing, Suppliers, Inventory System, Inventory Manual Check, Data, P&L Dashboard);
  - all six Apps Script files;
  - the 4 Aug client guide (44 pages);
  - all 115 walkthrough comments with the text each is anchored to;
  - 16 of the operating manual's 17 pages, as contact sheets;
  - the first mock-demo sheet.
- **Aggregated by script, deliberately, so no personal data was read:** Sales, Inventory-In/-Out, Sales (GForm),
  Waitlist, Bazaars, Cafe Partner, Loyal Customers. Only counts, distributions and non-personal columns.
- **Not re-read this session** (relied on dated memory notes from 2026-09-24):
  - the Meeting 1 analysis and transcript;
  - the walkthrough's body text;
  - the dummy workbook;
  - the rest of the mock demo;
  - brand files;
  - the stale 2026-09-08 code snapshot.
  They predate the 4 Aug guide and the 28 Sep answers, which supersede them.
- Walkthrough comment numbers are the zero-based ids in the `.docx`; Word shows each one higher.


| Part | What it actually does | Where it goes |
| --- | --- | --- |
| September Google Form (8-page PDF, 7 with content) | 14 questions: name, IG, contact number; free-text order box; a Sept menu image with 6 flavours; sampler box (qty 1–3); add-ons; sticker number; note-card message; pickup date (Mon/Thu, 5 pm cut-off); free-text pickup time (campus 2–3:30 pm Mon/Thu); same-day yes/no (+40%); flavour suggestions; transport (Lalamove, Grab, campus pickup); payment (GCash, Maya, GoTyme). No email, no address, no proof upload: payment channels go out by IG DM | Items 2, 4, 5 (slices B1–B4) |
| `Formscheduler.gs` | Opens that form Monday ~9:00 and closes it Sunday ~9:15 (Asia/Manila), emailing the business address | Order-window settings (already on the database); retire at launch |
| `Code.gs` inventory sidebars | Log production (flavour × batches in 0.5 steps → `Inventory-Out`); log restock (`Inventory-In`); dashboard sync on open | Slices C1–C2; see [apps-script-audit.md](apps-script-audit.md) |
| Recipe-box scripts (4 files) | Generic cookbook template: no `RecipeBox` tab, missing helpers | Nothing (unused) |
| Masterfile, 17 tabs | See next table | — |
| Payment image | QR codes for GCash/Maya/GoTyme under her account name, plus "also accepting: bank transfer, cash" | Slice A2 (payment methods, owner-uploaded QR) |
| IG DMs | Order confirmation, payment requests, proof screenshots, pickup address sent to the customer's courier | Status link and copy-paste messages (B3); proof stays in DMs (F5) |

| Masterfile tab | Content (counts only) | State | Where it goes |
| --- | --- | --- | --- |
| Ingredient Master | 73 items (72 priced; 11 packaging); unit spelled 5 ways | In use | One-time import (A3) |
| Recipes | 337 lines, 24 flavours, per batch, packaging included per cookie; eggs only in 1 flavour (her chickens, deliberate) | In use, one of 3 versions | Import for current menu, confirmed by Cine (A4) |
| Costing Dashboard | Yield per batch, price, cost, margin, calories for 27 products | In use | Yields to recipes (A4); cost/margin screens exist |
| Box costing (Sept) | Sampler box cost build-up; a different recipe version; box/sticker/card costs that differ from other sources | Reference | Box and packaging settings (B4), owner-entered |
| Suppliers | 20 supplier-product rows, 12 suppliers, prices differing from Ingredient Master | Partly | Import (A3); lowest-recent-price rule |
| Inventory-In / -Out | Restock and production logs | Logging, but dashboard broken | Stock movements (C1–C2); history not imported ("Let's start clean") |
| Inventory System | Dashboard: bought − used since a reset date | **Broken**: 22 rows read an empty cell, rows without left/value formulas, duplicate spellings, negative stock | Replaced by stock ledger + counts |
| Inventory Manual Check | Her physical count: 64 items, 45 counted; her notes on perishables and too many SKUs | Real but stale | Opening count at cutover (C1, F3) |
| Sales | ~750 lines (~460 orders, Mar–Sep), one line per customer × flavour; amount looked up from the **current** price, so history drifts; total profit cell is `#VALUE!` | In use | Orders + bazaar sales + P&L; not imported |
| Sales (GForm) | 56 form responses (May–Sep) | Archive | Not imported |
| Waitlist Form Responses | 26 responses (Jul–Sep): name, IG, wanted drop date, phone | In use | App waitlist (B2); form retired |
| Data + P&L Dashboard | Hand-typed monthly totals; third-party template whose year totals and month picker are broken | In use, unreliable | P&L on the ledger (E1) |
| Bazaars | Event bookings: 4 listed, **2 accepted (24–25 Oct, 12–13 Dec)** with rent | Planning | Bazaar events (D1–D2); rent → event expense |
| Cafe Partner / Loyal Customers | Outreach list; a tiny list | Not operational | Not needed at launch |

Patterns that shape the design:
- **Order size:** about 70% of orders are 1–3 cookies, with occasional 40–100-cookie orders.
- **Payment methods:** GCash is about 59% of sales lines and cash about 26%.
- **Pickup days:** mostly Monday and Thursday.
- **Couriers:** customers book their own Lalamove or Grab to her house.

## 3. What the app has today

| Area | State (2026-09-28) |
| --- | --- |
| Platform, sign-in, roles, idle sign-out, hosted preview | Done (G0/G1; see [current.md](current.md)) |
| Settings incl. order window, capacity, categories, helper switch | On the database (MP-09 b) |
| Flavours, prices, publishing, live shop reading the published menu | On the database (MP-09 c1/c1b); **no publish button yet**, so the live shop shows no flavours |
| Orders, payments, bake/dough, inventory, grocery, suppliers, recipes, bazaar, P&L, waitlist | Screens exist and work **in the browser only**; empty in live mode |
| Offline sale queue | IndexedDB queue exists; sync still posts to the archived `/api/sync`; OFFLINE-01 red ×3 |
| Checkout | The ported engine is pay-first: it requires email, a reference, the amount and a screenshot |
| Entry points for new owner tools | "All tools" is built from view-model data (`toolGroups`), so new tools need no markup edit |

## 4. Findings that change earlier plans (evidence in parentheses)

1. **No delivery-address field.** Customers book the courier to her house; she sends her address on pickup day
   (guide item 16; comment 27). This supersedes the order-form audit's address row, and D11's address part.
2. **Email is optional.** Her form never asks for it (Sept PDF). Status is shared by link and copy-paste message.
3. **Payment proof stays in DMs at launch.** The form has no upload, and she wants a "paid" tick. A signed upload
   link needs the Storage API (an INSERT policy or an Edge Function), not SQL. So MP-11 is deferred (F5).
4. **Eggs and oats cost her nothing.** Her chickens and her family supply them (comment 39). The recipes omit them on
   purpose, so they are not bought stock.
5. **Recipes exist in three versions:** the Recipes tab, Box costing, and the October list in chat. The chat list is the
   newest but uses cups, teaspoons and pieces. Names also differ between sheet and menu. The import must be confirmed
   by her; it cannot be decided by code (section 9).
6. **Units and duplicate names need one normalization pass.** Units: grams/g, piece/pieces, bags. Duplicates:
   Corn starch/Cornstarch and similar.
7. **Conflicting packaging costs for the same things.** Box of 6: two values across chat and the sheet. Stickers:
   three values, possibly different stickers. She enters the right ones in the app; nothing is hard-coded.
8. **Nutella cookie fries are a set of 4** in the costing sheet and on the form. `item_type = set` and
   `capacity_weight` already model this (D9).
9. **Cash is for campus pickup only, and campus pickup is back.** Comment 21 said "no ADMU pickups anymore" in
   July; the Sept form and her 28 Sep answer bring it back. Fulfilment methods must be owner-configurable
   (already planned).
10. **Bank transfer is on her payment image but not in her 28 Sep answer.** This is question C4.
11. **Her real schedule:** the form is open Mon ~9:00 → Sun ~9:15, with pickups Mon and Thu before 5 pm. The August
    answer "Mon 9 AM – Thu 9 PM" is out of date. It is still open which week a Thursday pickup counts toward the
    200 cap (C1): that is a `capacity_allows()` input.
12. **The engine names ported flavour ids in render paths** (`wcb`, `rvc`, `pbm`), and every screen crashes without
    them (render probe, c1b). Production must seed all six ported ids (unpublished and inactive when not on the
    menu) and never delete them.
13. **Nothing sits between the old form and the sheet.** The scripts contain no order logic, so D3 has nothing to
    stay compatible with (apps-script-audit).
14. **Offline sync targets the archived BFF route** (`src/lib/offline/sync.ts` posts to `/api/sync`). Bazaar selling
    needs a new idempotent RPC.
15. **Two bazaar dates are booked:** 24–25 Oct and 12–13 Dec. Either the app is proven for Bazaar Mode by then, or
    Cine sells the way she does now (F4).
16. **The live shop footer makes claims that are not true for her** (protected copy, `shop.tsx:160–165`, rendered in
    live mode):
    - a "REGISTERED" badge;
    - a placeholder `TIN 123-456-789-000`;
    - "An invoice is issued for every confirmed order";
    - one fixed allergen sentence.
    The order status page and order detail also label a confirmation number as an "Invoice INV-…" (engine
    `nextInvoice`). She is "registered but not with BIR" (comment 113). Before the shop opens, live mode must show
    owner-set text or nothing here, under the D4 shop-text exception (slice A2). The invoice wording is a decision
    (F10), taken with her accountant (the confirmation message already asked her to check BIR and receipts).

## 5. The integration map (Cine's system → app, one line each)

| Her piece | App piece | Slice |
| --- | --- | --- |
| Order form + DMs | Shop, checkout, status link, waitlist, copy-paste messages | A1, A2, B1–B4 |
| Form open/close script | Order-window settings (already on the database) | — (retire at launch) |
| Sales tab + yellow highlight | Orders list with a paid tick; bazaar sales | B3, D1 |
| Recipes tab + Costing Dashboard | Recipes with versions and yields | A4 |
| Ingredient Master + Suppliers | Stock items, packaging, supplier prices | A3 |
| Log Production sidebar | Dough and bake records that deduct stock | C2 |
| Log Restock sidebar | Receive purchase (with cost) | C1 |
| Inventory System + Manual Check | Stock on hand, weekly count, low stock, grocery list | C1 |
| Bazaars tab | Events with rent, stock, sales, close-out | D1–D2 |
| Data + P&L Dashboard | P&L from the ledger, CSV download | E1 |
| Waitlist form | App waitlist | B2 |

## 6. Build order

Slices are sized to one session (at most ~400 changed lines excluding tests and docs), each run as one `/goal` in a
fresh conversation (section 8). The order follows real code dependencies, not `tasks.json`: checkout needs the menu,
settings and payment methods, not the offline queue.

| # | Slice | Cine sees | Main work | Model · effort | Checks beyond `pnpm verify` | Needs |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | Flavour editor + Publish (MP-09 c1c) | Edits and adds flavours, publishes the menu | One live form host in the protected shell (F3); editor form; `FlavourSync.publish()` button; entry via All tools and "Edit price" | Sonnet 5 · high | Port audit; different-model review | — |
| A2 | Payment methods + shop texts (MP-09 c2) | Her real accounts, QR and wording on the shop; no false registration claims | Engine `PAY_ACCOUNTS` exception (approved); `payment_methods` table + owner RPCs; public image bucket with owner-only writes (QR, new flavour photos) storing **bucket-relative paths** (`save_flavour` accepts path characters only, no `:`; widen it only in a reviewed migration); CSP `img-src` gains the Supabase origin in the same slice; shop texts in settings, including the footer's registration, TIN, invoice and allergen lines (finding 16, D4 guarded edit) | Sonnet 5 · high | SQL role suite; port audit; review | A1 |
| B1 | Order command (MP-10 a, database) | — | `place_order` (anon, server-priced, capacity D1 in `capacity.ts` + `capacity_allows()` + fixture together, pickup rules, per-phone unpaid limit, status token); `order_status(token)`; `join_waitlist`; no IP limits (spoofable) | Sonnet 5 · high | SQL role suite; capacity parity; Opus review | A1 |
| B2 | Live checkout (MP-10 a, app) | Orders like the form, pay now or later | One guarded slot in `checkout.tsx` (D4); fields per her form; `custSubmit` override → `place_order`; status page and lookup by order no. + phone; waitlist | Sonnet 5 · high | Port audit; E2E happy path; review | A2, B1 |
| B3 | Orders on the owner side (MP-12/13/14 lean) | Paid tick, statuses, swap, pack/collect, messages | Staff read/transition RPCs (idempotent, `updated_at` checks); orders and payments screens read the database; bake list counts unpaid (28 Sep) | Sonnet 5 · high | SQL role suite; Opus review | B1 |
| B4 | Boxes, add-ons, sampler, same-day (MP-10 b) | Every September form feature | Box sizes 6/8/12 + bags, add-ons with sticker numbers and note text, sampler bundle, same-day % in config and server pricing | Sonnet 5 · high | SQL role suite; review | B2 |
| A3 | Stock items + suppliers (MP-09 d1) | Her ingredients and packaging in the app | Items/suppliers on the database; check whether the grocery pack/price constants (`OPTIONS_FOR`, `BEST_BUY`) need an engine exception; one-time import script (runs at cutover, section 9). **Done locally 2026-09-30, except the import script:** the constants are refilled in place with no engine exception; the import needs her workbook's layout and belongs with the cutover | Sonnet 5 · high | SQL role suite; review | — |
| A4 | Recipes with versions (MP-09 d2) | Her recipes, versions, yields | Recipes on the database (engine state, not constants); version on save; import for current menu, confirmed by Cine. **Done locally 2026-09-30, except the import:** recipes are state-based, so no engine exception; the import needs her workbook and belongs with the cutover | Sonnet 5 · high | SQL role suite; review | A3 |
| C1 | Stock ledger (MP-16) | Receive, count, waste, low stock, grocery | Movement ledger (receipts with cost → expense, counts with variance, waste, opening count). **Done locally 2026-09-30** (a receipt books its cost once; baking and packaging use are C2) | Sonnet 5 · high | SQL role suite; Opus review | A3 |
| C2 | Production (MP-17 lean) | Mix dough, bake, pack: stock moves | Dough and bake records, deduction on confirm with ±, half/double batches, packaging used at packing. **Done locally 2026-09-30** (a double batch is two dough mixes; packaging is the ported pack rule with hard-coded names, DP-03 open; binned dough and the stall's stock load are still screen-only) | Sonnet 5 · high | SQL role suite; Opus review | A4, C1 |
| D1 | Bazaar sales (MP-07 finish + MP-18/19 lean) | Sells offline on one phone | Events on the database; designated selling device; durable queue → idempotent `record_event_sale` (replaces `/api/sync`); void; freebie | Sonnet 5 · high | OFFLINE-01 green; offline test on her phone model; Opus review | A1 |
| D2 | Bazaar close-out (MP-20 lean) | Event stock, expenses, close-out, event profit | Stock loaded/returned, expenses, cash count, event profit | Sonnet 5 · high | SQL role suite; review | D1 (C2 to load from baked stock) |
| D4 | Bazaar events list (added 2026-09-29, Ethan) | Cine adds her real bazaar bookings (name, dates, place, rent) and the Bazaar screen lists them | Today the screen's two "Start an event" rows are hard-coded prototype examples in the engine (`bazaarVals`), and there is no add-event control. Scheduled-events table + owner save RPC (settings pattern: stale stamp, exact keys, `search_path ''`, in-function role check); an "Add event" form on the live form host (All tools, no protected-markup edit); in live mode `OpsRuntime` replaces the `events` value with her rows (post-process, engine untouched); starting one passes its id to `start_event`; rent becomes an event expense when the event starts (the database books it with the first link; done locally 2026-09-30). Her bookings: 24-25 Oct and 12-13 Dec, both accepted, with rent | Sonnet 5 · high | SQL role suite; visual QA in the browser pane; review | D1, D2 |
| E1 | Ledger and P&L (MP-15) | Real P&L, CSV download | Revenue (paid orders + event sales), cost when used, expenses by her categories incl. wages, drill-down, export. **Done locally 2026-10-01** (revenue dated when paid; cost basis a setting, default when bought; draws kept apart; the drill-down and the P&L layout are the ported screens fed from the database; the CSV is the ported export) | Sonnet 5 · high | SQL role suite; Opus review | B3, C2, D1 |
| F1 | Operate (MP-22/23/24 lean) | Backups, honest health, alerts | Weekly dump + restore drill, keep-alive, retention prune, shop privacy notice, System health from real data, in-app alerts | Sonnet 5 · medium | Restore drill evidence | E1 |
| F2 | Owner trial (MP-26) | One real week, in the app | Checklist, fix list | Opus 5.5 · medium (sign-off) | Full E2E; her checklist | All |
| F3 | Cutover (MP-27) | Goes live | Production project + deploy (approval); seed incl. ported ids; accounts (owner, shared helper, support); import (section 9); opening count; publish; old form 1–2 weeks with link; scheduler off. **Recorded before opening:** legal/accounting applicability (BIR status, receipts vs the app's order numbers, the privacy notice) and a **rollback plan** (close the shop, reopen the Google Form and sheet workflow, keep the data export) | Opus 5.5 · medium + Ethan | Cutover checklist incl. rollback rehearsal | F2 |
| F4 | Hypercare (MP-28) | Fixes for 2 weeks | Small fixes | Sonnet 5 · medium | Per fix | F3 |

- **Approved order (F4, 2026-09-28):** A1 → D1 → D2 → [D3 if the pilot gate passes] → A2 → B1 → B2 → B3 → B4 → D4 → A3 →
  A4 → C1 → C2 → E1 → F1 → F2 → F3 → F4.
  - The bazaar slices come right after A1, so 24–25 Oct stays reachable.
  - Bazaar Mode does not read the payment accounts, so it does not wait for A2. For the pilot, event stock is typed
    counts until C2 links it to baked stock.
  - It is now 17 slices plus hypercare (D4, the bazaar events list, was added 2026-09-29 at Ethan's request, and runs right after B4 so it lands before the 20 Oct gate); D3 is only a setup step.
- **Pace so far:** 1–2 slices per attended day. That puts a realistic launch about 3–4 weeks after approval.
- **Bazaar date gate (F4, approved):** use the app on 24–25 Oct only if both pass by 20 Oct: OFFLINE-01, and a real
  offline test on her phone.
  - **D3, only if the gate passes:** an early production project with the shop closed, holding staff accounts,
    flavours and events only. It is a hosted resource, so Ethan confirms the moment it is created and deployed.
  - **If the gate fails:** she sells as today, and 12–13 Dec becomes the bazaar pilot.

## 7. Cut and defer list (proposed, F2)

| Item | Why it can wait | Cost if kept now |
| --- | --- | --- |
| Automatic runner AR-00–06 | Claude Code's built-in `/goal` + headless `claude -p` do the same job (section 8) | 7 packages |
| Customer feedback | "No need for customer feedback feature yet" (guide p.44) | Screens + tables + privacy |
| Loyalty, promotions, wholesale/consignment | "Near future" (comments 93, 100, 111) | New domain |
| Monthly target view | Her top wish (comments 50, 104) but not in the prototype; new UI | One slice; post-launch |
| In-app proof upload (MP-11) | Proofs arrive in DMs today; the paid tick covers it; needs Storage API work | Edge Function or anon storage policy |
| Google Form bridge (D3 / MP-10 c) | The app replaces the form; keep the old form 1–2 weeks with a link (guide Q31), Cine handles stragglers | Apps Script + ingest RPC + review queue |
| Owner-entered orders | She can order through the shop for a DM customer; she raises the limit for bulk | New form + RPC |
| Email alerts | "Copy-paste messages are enough for now" | Domain + provider |
| Labour-cost view, cash position | Asked but not first-release | P&L extensions |
| MP-24/25 full scope | Keep honest screens and basic checks; drop simulated integrations | — |

## 8. How we build: fast, cheap, and correct

### 8.1 The per-slice loop

1. **New conversation in the repo root, pick model and effort once.**
   - Model and effort changes mid-session re-read the whole history uncached; on Opus 5.5 an effort change keeps
     the cache ([prompt caching](https://code.claude.com/docs/en/prompt-caching.md)).
   - Auto mode on.
2. **Run the goal:** `/goal <block from next-goal.md>`. The block states the evidence commands and `or stop after 25
   turns`. The goal evaluator is a small model that sees only the transcript, so the evidence must be printed
   ([/goal](https://code.claude.com/docs/en/goal.md)).
3. **Read only the files the block names.** Find code with codebase-memory-mcp, or Grep plus line ranges. Never read
   the 4,000-line engine whole.
4. **Build test-first where the rule is new:** write the failing test, then make it pass, then run one mutation check
   (it proves the test catches the bug; c1b did 7).
5. **Checks:**
   - targeted `vitest` while building;
   - the SQL role suite in the background only when SQL changes;
   - the pre-commit hook runs `pnpm verify` on commit, and its summary is the evidence (don't run it twice);
   - the G0 validator once, then `git checkout -- docs/state/evidence/`.
6. **Review in the background:** a different model reviews SQL, money and offline diffs (Opus reviews Sonnet-built
   slices); the port auditor checks protected edits. Fix P0–P2; record P3.
   - The repo's `security-reviewer` and `port-auditor` agents are pinned to Sonnet. When the builder is Sonnet, pass
     `model: opus` on the invocation: the per-invocation model wins over the agent file
     ([subagents](https://code.claude.com/docs/en/sub-agents.md)).
7. **Docs, three touches only:**
   - a 5-line status in `current.md`;
   - one `task-status.json` entry;
   - swap the next-goal block, including its **Session settings** table (model, effort, plan mode, permission mode, review model, browser QA), which is refreshed for every goal (Ethan, 2026-09-29).
   Commit by explicit path, then push.

### 8.2 Models and effort (why)

| Work | Model · effort | Reason |
| --- | --- | --- |
| Build a slice | Sonnet 5 · high | Official guidance: Sonnet for implementation; high is the default for Sonnet 5 ([model config](https://code.claude.com/docs/en/model-config.md)) |
| Plan a phase, write goal blocks, sign off, cutover | Opus 5.5 · medium (high for design) | Judgment-heavy, few tokens; medium is Opus 5.5's default |
| Review SQL/money/offline | The other model from the builder | Lean plan rule 4; catches what the author's reasoning hides |
| Broad literal search | Explore (Haiku) | Skips CLAUDE.md, cheapest |
| `opusplan` | Optional | Each plan-mode toggle is a model switch and misses the cache; use it only if a slice needs a real plan phase |

### 8.3 Token and time rules

1. One slice per conversation; `/clear` between slices. Never carry context across packages.
2. [current.md](current.md) stays short: status only, history in [current-history.md](current-history.md). It is
   read every session.
3. Subagents save **context, not tokens** ([subagents](https://code.claude.com/docs/en/sub-agents.md)). Each one
   loads CLAUDE.md/AGENTS.md cold. Use them for bounded, independent work (reviews, web research), with a file list,
   the questions, and a word cap.
4. Large inputs go to scratch files and are summarized by script (as the workbook was). Raw data is never pasted into
   the conversation or the repo.
5. **F6 (approved and applied 2026-09-28):** the typecheck now runs once per turn, in the `Stop` hook.
   - Before: the `PostToolUse` hook ran a full `tsc --noEmit` after every `.ts`/`.tsx` edit (measured 7.6–8.7 s,
     plus about 3 s of prettier), and repeated mid-change errors from files not yet updated.
   - Now: `PostToolUse` only formats. `Stop` typechecks when TypeScript changed and blocks once per distinct error
     set, so a deliberate stop with a half-finished change still goes through.
6. No parallel SQL slices: every migration touches the same count fixtures and migration numbering. A docs or test
   slice may run in a git worktree alongside.
7. Stop rules: 2 failed fix attempts or 25 turns → stop and report. No guess loops.

### 8.4 Rules against hallucination

1. Every factual claim about code or data cites a file:line or a command run in this session. Otherwise it is
   marked UNVERIFIED.
2. Read the code path before changing it. For a bug fix, reproduce it first (probe or failing test).
3. Owner facts come only from dated owner sources (the decision register). The newest statement wins. Conflicts
   become questions, never silent picks.
4. No invented business numbers. Prices, costs, quantities and schedules are entered by Cine; defaults are labelled
   as defaults.
5. Research claims need an official source fetched in-session. Research-agent claims stay UNVERIFIED until checked
   (two were dropped this session).
6. A different-model review for auth, RLS, SQL, money and offline changes; a port audit for protected markup.
7. "Done" means the gate output is pasted in the transcript and the commit is pushed.
8. Ask for a second opinion (advisor or reviewer) before committing to an approach and before declaring done.
9. Memory entries carry dates and are re-checked against the code before use.
10. Privacy: nothing from section 0's list enters the repo, memory or telemetry.

### 8.5 Subagents and loops, used where they pay

- **`/goal` + auto mode** is the loop. Unattended runs (`claude -p "/goal …"`) are the built-in replacement for the
  automatic runner. They need Ethan's approval (AGENTS.md) and are proposed only after two attended slices succeed
  under this plan (F7).
- **Background reviewers** (security, port) run while the author writes docs. Research agents run only for external
  facts, with citations.
- **Not used:** agent teams: experimental, token use scales with each teammate, and worse than one session or
  subagents for sequential or same-file work ([agent teams](https://code.claude.com/docs/en/agent-teams.md)). Nor
  multi-agent workflows for a single slice.

### 8.6 Practices this follows (standard references, not re-fetched this session)

- Vertical slices and YAGNI: build only what a slice needs
  ([Fowler](https://martinfowler.com/bliki/Yagni.html)).
- Small commits on one working branch ([trunk-based development](https://trunkbaseddevelopment.com/)).
- The live-mode flag as a feature toggle ([Fowler](https://martinfowler.com/articles/feature-toggles.html)).
- Strangler fig: the sheet stays the record until each part is live, with a short parallel run at cutover
  ([Fowler](https://martinfowler.com/bliki/StranglerFigApplication.html)).
- Tests in layers: unit tests always; the SQL role suite for SQL; E2E at gates.

## 9. Data migration and cutover

- **Start clean.** Her words (comment 106). No order, sales or P&L history is imported; the workbook stays the
  archive. P&L starts at go-live.
- **One-time import at cutover.** A local script reads the workbook from outside the repo and writes nothing into
  it. It prints a preview for Cine to confirm, then writes with an owner or admin session. Nothing is committed.
  - Ingredient Master: 73 items, units normalized, packaging flagged.
  - Suppliers: 20 rows.
  - Yields: from Costing Dashboard.
  - Recipes: current menu only. The preview shows sheet grams beside her October list, so she settles the
    differences. Eggs and oats are left out of stock.
- **She enters directly:**
  - menu, prices, allergens, badges;
  - payment accounts and QR;
  - box sizes and prices;
  - add-ons, pickup days and slots;
  - the opening physical count, taken at cutover (the Manual Check tab is stale);
  - her expense categories.
- **Seed:** all six ported flavour ids present, unpublished and inactive unless on the menu (finding 12).
- **Parallel run:** the old form stays open 1–2 weeks with a note linking to the app (guide Q31); stragglers are
  handled as today. Then the scheduler is switched off.

## 10. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Protected-markup edits slow every new form | One reviewed live form host (F3); entry points through `toolGroups` |
| Ported flavour ids missing in production crash every screen | Seed rule (section 9) + unit test; `save_flavour` never deletes |
| Offline bazaar sales lost | Durable local commit before "recorded", ack by `clientId`, test on her phone, paper backup at the first event |
| Fake unpaid orders fill a week | 24 h release, per-phone limit, global cap, owner cancel; no IP-based limits (the gateway IP header is spoofable) |
| Supabase Free pauses or loses data | Daily use keeps it active; weekly dump + restore drill; keep-alive only if idle |
| Import quality (units, names, versions) | Preview + her confirmation; she corrects in the app afterwards |
| Scope creep from "near future" asks | Section 7; post-launch backlog |
| False registration or invoice claims on the live shop (finding 16) | A2 replaces the footer text in live mode; F10 settles the invoice wording before opening |
| No way back if launch week goes wrong | F3 rollback plan: close the shop, reopen the Google Form and sheet, keep the export |
| Waiting on answers | Defaults for every question (section 11); one batched message with a recap of the last conversation |
| Context loss between sessions | Short status file, dated decision register, memory index, git history |

## 11. Decisions needed

**For Ethan** (default in bold; **all approved 2026-09-28**):

| # | Decision | Default |
| --- | --- | --- |
| F1 | Adopt this file as the single forward plan | **Yes** |
| F2 | The cut/defer list in section 7 | **As listed** |
| F3 | One guarded, live-only form host in `app-frame.tsx` that later owner forms plug into (one port audit instead of one per form), plus the D4 checkout slot | **Yes** |
| F4 | Bazaar pilot on 24–25 Oct: D1–D2 right after A1, early production project with the shop closed | **Only if gates pass by 20 Oct**; else 12–13 Dec |
| F5 | Proof upload deferred; checkout asks an optional reference; Cine ticks paid | **Yes** |
| F6 | Scope the per-edit `tsc` hook | **Yes** |
| F7 | Headless `/goal` runs after two attended slices succeed | **Not yet** |
| F8 | No owner-entered orders at launch (she uses the shop) | **Yes** |
| F9 | No Google Form bridge; old form 1–2 weeks with a link | **Yes** |
| F10 | What the app calls its confirmation numbers while she is not BIR-registered ("Invoice INV-…" in protected copy) | **"Order no." in live mode** (D4-style guarded label), pending her accountant |

**For Cine**, sent through Ethan in one message that opens with a recap of the last conversation (default in bold;
the build uses each default until she answers):

| # | Question | Default |
| --- | --- | --- |
| C1 | Does the 200-cookie limit count per pickup week (the Monday and Thursday of one week together)? | **Yes, per pickup week** |
| C2 | Orders open Monday 9:00 and close Sunday 9:00 every week? | **Yes** |
| C3 | Pickup: any time before 5 pm on Mon/Thu with the customer's chosen time, plus the campus slot 2:00–3:30 pm? Or fixed slots? | **Keep as the form has it** |
| C4 | Do you still accept bank transfer (it is on your payment image)? | **Yes, can be switched off** |
| C5 | Box of 6: which packaging cost is right? Prices for 8 and 12? | **She enters them in the app** |
| C6 | Recipes: which version is current for each October flavour? Confirm grams where the list uses cups/teaspoons | **Confirm in the import preview** |
| C7 | Keep eggs and oats out of stock tracking? | **Yes** |
| C8 | Which day will you do the opening stock count? | **The day before go-live** |
| C9 | Keep the old Google Form 1–2 weeks after launch with a link to the new page? | **Yes** |
| C10 | Try Bazaar Mode on 24–25 Oct, with a paper backup? | **Only if ready by 20 Oct** |
| C11 | Customers keep sending payment screenshots by DM; the app asks for the reference number only? | **Yes** |
| C12 | The "how many cookies to reach my monthly target" screen right after launch? | **Yes, first post-launch item** |

## 12. Sources

- **Cine's materials (outside the repo, received 2026-09-28):**
  - `The Happy Cookie 2026 masterfile.xlsx`;
  - `gform.pdf`;
  - `Payment Channels.png`;
  - `Appscript/` (6 files, git-ignored);
  - her chat answers, October menu, recipes, packaging list and account names.
- **Business Files** (`C:\Users\ethan\dev\Happy Cookie Ops - Business Files`):
  - client guide, 4 Aug (priorities, Q1–Q32);
  - walkthrough draft with her 115 comments (22–25 Jul);
  - Meeting 1 analysis (20 Jul);
  - operating manual v1 and mock demo (Aug; they describe the prototype and need updating for pay-later at F2).
- **Repo:**
  - [decision-register.md](decision-register.md);
  - [order-form-audit.md](order-form-audit.md);
  - [apps-script-audit.md](apps-script-audit.md);
  - [protected-exception.md](protected-exception.md);
  - `src/store/engine/ops-engine.js` (checkout, dough, receive, `toolGroups`);
  - `src/lib/offline/sync.ts`.
- **Fetched and read by Claude this session:**
  - Claude Code docs: [/goal](https://code.claude.com/docs/en/goal.md),
    [model config](https://code.claude.com/docs/en/model-config.md),
    [prompt caching](https://code.claude.com/docs/en/prompt-caching.md),
    [subagents](https://code.claude.com/docs/en/sub-agents.md);
  - the signed upload link needing an INSERT policy (search result on Supabase docs; the reference page returned
    404).
- **Cited by a Sonnet research agent (fetched by the agent, not re-read by Claude):**
  - Supabase: [pricing](https://supabase.com/pricing) (500 MB DB, 1 GB storage, 50 MB file cap),
    [free-project pausing](https://supabase.com/docs/guides/platform/free-project-pausing),
    [backups](https://supabase.com/docs/guides/platform/backups) (none on Free),
    [securing your API](https://supabase.com/docs/guides/api/securing-your-api);
  - the spoofable gateway IP header:
    [discussion 34647](https://github.com/orgs/supabase/discussions/34647);
  - Cloudflare static-asset limits:
    [limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).
- **UNVERIFIED (not relied on):**
  - "a per-edit typecheck costs about 5k tokens";
  - the exact signed-upload link validity;
  - whether scheduled keep-alive calls are officially endorsed.
