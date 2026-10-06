# Decision register — amendments to DP-00…DP-10, and new DP-11…DP-20

Created 2026-09-24 by Claude (Opus 5.5) from owner-authored sources. This file **amends** the historical register in `docs/master-plan/10-decisions-and-sources.md` (hash-protected; not edited). Each open decision uses the fields of [the decision template](../master-plan/templates/decision.md). The questions Ethan takes to the owner are in the [owner decision packet](owner-decision-packet.md); materials she offered are tracked in [owner inputs](owner-inputs.md).

**Rule:** a decision below counts only when its source is the owner (or Ethan for technical/process choices). A prototype screen, spec line or vendor document is evidence, not a decision.

## Citation key

Owner sources live outside the repo in `C:\Users\ethan\dev\Happy Cookie Ops - Business Files` and are never copied into Git.

- **guide L#** — `05 Design Prototype (project setup)/requirements.txt`: the text of the owner-filled KETH AI client guide, issued 4 Aug 2026 (PDF created 12 Aug).
- **wt id#** — owner margin comment in `03 Walkthroughs & Spreadsheets/[THC COPY] The-Happy-Cookie-Ops-Walkthrough-and-Audit.docx` (`word/comments.xml`, 22–25 Jul 2026). Ids are zero-based; always check the anchored text before citing.
- **tx hh:mm:ss** — `02 Meeting 1 - 2026-07-20/raw analysis files/transcript/transcript.txt`.
- **E** — Ethan, in the Claude session of 2026-09-24.

## Decided

| Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Source                                  | Effect                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| No customer account; one private link per order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | guide L1472–1475 (Q3)                   | Confirms DP-01 capability-link direction                                                                         |
| Capacity is 200 **cookies** per weekly drop                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | guide L1543–1545 (Q10)                  | Engine unit is correct; `capacity.ts` "boxes" wording is wrong                                                   |
| Orders open Mon 9:00 AM, close Thu 9:00 PM                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | guide L909–915, L1536–1538 (Q9); wt id5 | Matches `DEFAULT_CFG`                                                                                            |
| Start clean — no import of spreadsheet history                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | wt id106 ("Let's start clean", 25 Jul)  | Confirms MP-27 clean bootstrap with opening counts                                                               |
| Business is registered, but not with BIR                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | wt id113                                | Input to DP-06; no BIR/CAS claims in the app                                                                     |
| No customer feedback feature yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | guide L1845                             | Feedback stays out of first release                                                                              |
| Customer personal information kept one year                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | guide L1751–1755 (Q30), guide item 31   | Matches engine default `retention '1 year'`; SQL `prune_personal_data` default (730 days) must not be used as-is |
| Recipe version history wanted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | wt id84                                 | Confirms MP-17 versioning                                                                                        |
| Margin floor: don't sell a cookie below 65% margin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | wt id83                                 | Needs a warning rule in pricing/recipe screens (DP-04)                                                           |
| Deposits only for bulk event orders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | wt id61                                 | No part-payment path for normal drops unless DP-02 says otherwise                                                |
| Customers book their own courier (Grab/Lalamove); bazaar pickup only in Bazaar Mode                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | guide L1571–1576 (Q13); wt id24         | No delivery integration                                                                                          |
| Helpers: Kristian, Ethan, Cervo, Misty. Cervo and Misty are removed after MoreSem. Helpers see sales, inventory and customer orders, **no financial data**                                                                                                                                                                                                                                                                                                                                                                                                | guide L1308–1317 (item 28)              | DP-05 (temporary access with expiry)                                                                             |
| Kristian gets two accounts (helper + support)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | E                                       | DP-05                                                                                                            |
| The owner reviewed the 7 Sep prototype                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | E                                       | UI lock stands; business rules inside it still follow this register                                              |
| Hosting is decided only after hosted spikes on both Pages and Workers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | E                                       | DP-14                                                                                                            |
| Claude may do governance, safe config fixes and GitHub housekeeping; no commit/push without approval                                                                                                                                                                                                                                                                                                                                                                                                                                                      | E                                       | [agent-orchestration.md](agent-orchestration.md)                                                                 |
| While Codex is unavailable, Claude does all of the work (2026-09-26); no commit/push/deploy without approval                                                                                                                                                                                                                                                                                                                                                                                                                                              | E                                       | [agent-orchestration.md](agent-orchestration.md)                                                                 |
| **Architecture A (2026-09-26):** static export plus direct `supabase-js` to Supabase, with RLS and `SECURITY DEFINER` RPCs as the security boundary. The Pages BFF (`spikes/pages`, `src/lib/auth/session-*`, `persistent-session-authority`, `session-crypto`, `supabase-auth-transport`, `spikes/cleanup-worker`) is **archived, not deleted**. Its migrations 23–26 stay (protected, service_role-only).                                                                                                                                               | E                                       | [lean plan](lean-plan.md)                                                                                        |
| Standing approval: agents commit each accepted slice and push the working branch to the private repo, after a secret scan. Never merge to `main` or deploy without asking.                                                                                                                                                                                                                                                                                                                                                                                | E                                       | [lean plan](lean-plan.md)                                                                                        |
| Codex global default effort is `high` (`xhigh` only through the project `plan` profile). Unused Codex plugins are disabled. codebase-memory-mcp is the shared code index for both agents.                                                                                                                                                                                                                                                                                                                                                                 | E                                       | [lean plan](lean-plan.md)                                                                                        |
| **Amends master-plan MP-08 acceptance:** "no refresh token/service key in browser storage" becomes "**no service key** in browser code or storage". The `supabase-js` session is stored in the browser under architecture A. XSS risk is limited by the hash-only script CSP and by having no third-party scripts.                                                                                                                                                                                                                                        | E (architecture A)                      | [lean plan](lean-plan.md)                                                                                        |
| **Open under architecture A (G2 prerequisite):** an anonymous checkout RPC has no proven trustworthy caller key for `consume_rate_limit` under direct PostgREST. The BFF used `CF-Connecting-IP`. Under direct PostgREST, the request headers visible to SQL (`request.headers`) have not been verified: which forwarded-IP header Supabase's gateway sets, and whether a client can spoof it, is unknown. Before G2 relies on per-caller limits, prove it on the hosted project, or use per-capability, per-phone or global limits plus capacity checks. | Claude, 2026-09-26                      | G2 checkout                                                                                                      |
| **Amends master-plan MP-04 acceptance:** "Cookies, CSRF … API p99 CPU ≤8 ms" no longer applies, because there is no server API. MP-04 now requires a hosted static preview on Cloudflare Workers static assets. That preview must pass the MP-04d route/CSP/cache oracle with `connect-src` limited to `'self'` plus the configured Supabase origin, and the free-plan spend controls must be checked.                                                                                                                                                    | E (architecture A)                      | [lean plan](lean-plan.md)                                                                                        |

## Ethan's answers and the configurability principle (2026-09-27)

Ethan answered the owner packet on 2026-09-27 and set a principle: business values Cine sets are editable in the app, not fixed in code. Follow-up the same day: ingredient cost counts **when used** (DP-04), **one** selling phone at the bazaar (DP-18), the locked-UI exception for the new edit forms is approved, and the Google Form should feed the app (DP-11). The full mapping and what stays fixed are in [configurability-audit.md](configurability-audit.md). Ethan then told the build to assume "yes" to the whole owner confirmation message until Cine says otherwise; the provisional choices are in section E of that file.

## Cine's answers to the confirmation message (2026-09-28, relayed by Ethan)

These replace the provisional answers in [configurability-audit.md](configurability-audit.md) section E.
Source material she sent at the same time is listed after the table. Payment numbers, recipes, costs and all
names stay out of the repo: they go into the database through the owner's own edit screens (MP-09 c/d).

| #   | Question                       | Cine's answer                                                                                                               | Effect / still open                                                                                                                                                                                                  |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Pay first (DP-02)              | **Changed.** Unpaid orders still show on her bake list; she follows up in DMs herself and wants a checkbox to mark one paid | Reverses pay-first for MP-10, MP-12, MP-13 and MP-17. The checkbox is new UI (locked-UI exception needed). **Open:** does an unpaid order hold a slot in the weekly cap (`capacity.ts`)? Asked, not decided          |
| 2   | Cost counted when used (DP-04) | Confirmed. There is no bookkeeper                                                                                           | No change. Drop the "tell your bookkeeper" note                                                                                                                                                                      |
| 3   | Pricing                        | Sum of each cookie's own price. Fewer than 6 allowed, not boxed. Only 6, 8 and 12 are boxed; 8 and 12 box prices to follow  | The price mode is already the engine default. **New:** box sizes 8 and 12 (the engine only knows a box of 6: `PACK_SIZE`, `packCostPerCookie`); prices pending from Cine                                             |
| 4   | Helpers                        | Confirmed: shared helper login, Cervo and Misty removed. Helpers **may** see sale totals, behind an on/off switch           | Cervo/Misty are only in the `users` view-model list: filter them in `OpsRuntime`, no protected edit. The switch is a new setting (MP-09 b3); the engine's `showEventMoney` is a view-model flag the subclass can set |
| 5   | One selling phone              | She asked whether other devices, like a laptop, can be used                                                                 | Answer (MASTER-PLAN launch rule): yes, any phone, tablet or laptop browser for everything online; offline bazaar selling runs on **one** chosen device at a time                                                     |
| 6   | Google Form                    | "yes"                                                                                                                       | **Unresolved:** the question offered "connect a redone form" or "close it". Asked again                                                                                                                              |
| 7   | Backups (DP-10)                | Asked for a reminder of what the nightly Google Sheets copy was                                                             | It was KETH AI's 2 Aug promise of an automatic nightly export of her data into a Google Sheet. The free setup cannot run it; the download button plus a weekly backup stands unless she objects                      |
| 8   | Customer alerts (DP-12)        | In-app alerts and copy-paste messages                                                                                       | No email domain for now (MP-14). Resend stays possible later                                                                                                                                                         |

**Second round (2026-09-28, relayed by Ethan):** laptops and the backup plan confirmed ("sure"); the
Google Form(s) are **redone and connected** (Q6 resolved; the waitlist form counts too); **unpaid orders count
toward the weekly cap**; 8- and 12-box prices, allergens per flavour and the opening stock count are all
owner-configurable; **every form feature is needed at launch, with applicable fields configurable**. The
element-by-element analysis, configuration model, decisions D1–D11 (D1: unpaid orders can now fill a week, a
recommended expiry plus per-phone limit) and the proposed slice split are in
[order-form-audit.md](order-form-audit.md).

**Ethan's decisions on the order-form audit (2026-09-28):**

- **D1, as recommended:** an unpaid order releases its slots after N hours (owner setting, default 24)
  unless Cine marks it paid, and at most N open unpaid orders per phone number (owner setting, default 2).
  The capacity rule changes in `src/lib/rules/capacity.ts`, `capacity_allows()` and
  `tests/fixtures/capacity-cases.json` in the same commit.
- **D2, as recommended:** the weekly capacity and the drop screens stay as the owner's week view; customers
  pick any allowed pickup date inside the owner's lead time. `OpsRuntime` replaces `cycle`/`windows`
  (instance fields); the protected engine is not edited for this.
- **D4, approved:** the checkout locked-UI exception (see `protected-exception.md`).
- **Flavour editor (MP-09 c1b), confirmed by Ethan on 2026-09-28:** the owner's flavour editor (edit and
  add flavours) falls under the 2026-09-27 approval of the locked-UI exception for new edit forms. No
  separate approval is needed; the slice still records its exact UI in `protected-exception.md`.

**Facts and corrections from Cine's own materials (2026-09-28, Claude audit).** The newest dated owner statement
wins; the older one stays here as history. Sources are listed in [finish-plan.md](finish-plan.md) section 12.

- **Her Q6 answer (paraphrased; exact text in the 2026-09-28 chat record):** payment preferences are always GCash, Maya, GoTyme, or cash (campus pickup
  only), and pickup dates are every Monday and Thursday. So "redo the forms" means fixed fields with exactly these
  options. This supersedes the "yes / ambiguous" reading above.
- **Campus (ADMU) pickup is offered again**, and cash is allowed only for it. It was "not anymore" in the 22 Jul
  comments; the September form and the 28 Sep answer bring it back.
- **Bank transfer** appears on her payment image but not in her 28 Sep answer. Asked as C4.
- **Email is not collected** by her form (only 12 of 56 responses have one, from an earlier version). It stays
  optional in the app.
- **No delivery address.** Customers book Lalamove or Grab to her house, and she sends her address on pickup day
  (guide item 16). This supersedes the order-form audit's address row and the address part of D11.
- **Eggs and oats cost her nothing** (her chickens, her family: walkthrough comment 39). The recipes omit them on
  purpose; they are not bought stock (C7).
- **Recipes exist in three versions** (Recipes tab, Box costing tab, October chat list). She confirms the current one
  per flavour at import (C6).
- **Nutella cookie fries are a set of 4**, costed per piece. Modelled by `item_type = set` and `capacity_weight`.
- **Her schedule now:** the form opens Monday about 9:00 and closes Sunday about 9:15 (`Formscheduler.gs`), with
  pickups Monday and Thursday before 5 pm. This supersedes the 4 Aug "Mon 9 AM – Thu 9 PM" for planning; confirm
  as C1–C3.
- **Packaging costs conflict across sources** (box of 6: two values; stickers: three values). She enters the right
  ones in the app (C5).
- **Bookings:** two bazaars are accepted, 24–25 Oct and 12–13 Dec (her Bazaars tab). This drives F4.

Decisions from the audit ([finish-plan.md](finish-plan.md) section 11):

- **Ethan approved every default on 2026-09-28** (F1–F10):
  - the finish plan is the single forward plan;
  - the cut list;
  - one live form host in the protected shell;
  - the bazaar pilot for 24–25 Oct, gated on OFFLINE-01 and her phone by 20 Oct, with D1–D2 right after A1;
  - proof upload deferred;
  - the per-turn typecheck hook (applied);
  - no headless runs yet;
  - no owner-entered orders;
  - no Google Form bridge;
  - "Order no." instead of "Invoice" in live mode, pending her accountant.
- **Cine's C1–C12** run on their defaults until she answers. The message to her was drafted the same day.

**Order-form rules the prototype does not have** (from the September form Cine sent). Each needs a scope
decision by Ethan and, where it adds UI, a locked-UI exception. None is decided:

- pickups on Monday **and** Thursday, 5 pm cut-off (the engine's `windowsFor` returns Monday only);
- a campus pickup slot, 2–3:30 pm on those days;
- same-day pickup for 40% more;
- delivery choice: Lalamove, Grab or personal pickup;
- add-ons: note card with a message, ribbon, single stickers, sticker pack;
- a fixed-price sampler box of every flavour;
- 5 cookies or fewer packed in bags;
- payment is currently confirmed by DM after the form, not at checkout.

**Source material received (kept outside the repo):**

- The masterfile workbook (`C:\Users\ethan\dev\The Happy Cookie 2026 masterfile.xlsx`): ingredient unit
  costs (74), recipe lines (338), per-flavour costing (27 products), suppliers (26), stock in/out logs, a
  monthly P&L with its own expense categories, and September box costing. Data source for MP-09 c/d and
  MP-16. Its manual stock count is **not** the opening stock: Cine is recounting.
- The October menu (7 flavours with prices) and recipes, sent in chat; the packaging list with unit costs;
  the payment QR codes and account name (GCash, Maya, GoTyme, bank transfer, cash).
- The September order form (PDF). The live sheet and the live form are Google links Claude cannot open here
  (no browser tools; no signing in to the KETH AI account).
- The Apps Script (six files, sent by Ethan 2026-09-28, kept out of git): analysed in
  [apps-script-audit.md](apps-script-audit.md), with decisions E1–E4 for Ethan.

## Ethan's direction of 5 October 2026: source of truth and interface rework

Ethan supplied Cine's updated workbook, recipe document and flavour photos as the main
source of truth, asked for everything to be consolidated and polished before her trial,
then asked for the whole interface and experience to be reworked on the strength of
research into leading tools. Shown the plan and the sketches, he answered: **"yes to all,
do what u recommend."**

| Approved            | What it is                                                                                                                                                                                                                                                           | Where                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| R1 to R8            | A new live interface built beside the ported screens (five tabs: Home, Sell, Make, Stock, Money); keep the brand; a wording pass with Cine; her weekly target on Home; the October bazaar on today's Bazaar Mode; the trial after the rework.                        | [product-research.md](product-research.md) section 11  |
| S3 to S11, S13, S14 | Import the workbook recipes, reconcile the flavour list, attach photos, append newer sales, a small customer database with a 24-month rule, bazaar bookings, stock name mapping, packaging costs; Ethan grants Cine's access; the source files leave the repository. | [sot-consolidation.md](sot-consolidation.md) section 8 |

**R1 ends "the prototype is the specification" for the live app.** The ported screens,
sheets, shell and engine stay protected and unchanged as the demo build; the live app no
longer has to look like them. The planning-authority line of `AGENTS.md` and `CLAUDE.md` said "UI/UX remains locked";
Ethan approved its rewording the same day ("yes, approve the AGENTS.md wording change")
and both files now say so, byte for byte the same.

During the audit he added a rule: **"nothing must be hardcoded."** Every number, name and
sentence about the business comes from her data or her settings; the hard-coded values
found are listed in [system-audit.md](system-audit.md) section 2.

He also set the order of work: a whole-system audit first
([system-audit.md](system-audit.md)), then, in the next conversation, a fresh round of
research and one final plan before any building.

### The replan he approved later on 5 October

Shown the first final plan, Ethan asked for a re-audit, a debate, wider research and a
full replan, and set the bar: fast to finish; complete, functional, secure, easy to reach
and navigate, organised and targeted, efficient, precise, accurate, fast and scalable.
Asked five questions, he chose as below and then approved the plan
([final-plan.md](final-plan.md), version 2).

| #   | Question                        | His answer                                                                                                                                                                                              |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | When Cine starts                | **After everything is built.** Not on a partial app.                                                                                                                                                    |
| 2   | The bazaar's offline lock-out   | **Fix it, bounded** (slice A2, with an independent security review), and lengthen the trial's access session from 8 hours to 7 days.                                                                    |
| 3   | Pace                            | **Two tracks, and unattended runs for interface-only slices.** Database, money, sign-in and offline slices stay attended and reviewed. The automatic runner stays off. This narrows F7 of 28 September. |
| 4   | Reading the hosted trial        | **Yes, read-only**: settings, the migration list and the security advisor; no customer rows, no writes.                                                                                                 |
| 5   | How new screens enter the frame | **One guarded, live-only slot in the locked frame file**, as a protected exception ([protected-exception.md](protected-exception.md)).                                                                  |

Carried by the plan and approved with it: weighted average cost with the cost stamped on
each use; the October bazaar's sales recorded in the trial database, **replacing the
early production project of 28 September (finish-plan F4, step D3)**; one business per
database. Not changed by it: the pointer lines in `AGENTS.md` and `CLAUDE.md` still name
finish-plan.md.

**The questions for Cine, answered by Ethan the same day on her behalf.** Each is a
starting value she can change; she confirms each in a one-time set-up screen. His exact
words and the packaging costs he gave are kept privately
(`claude-20261005/owner-answers-20261005.md`), not here.

- Her Ingredient Master price list is current.
- Seven flavours are on sale at the October prices (listed in
  [final-plan.md](final-plan.md) section 12).
- Samplers: "assume all, make editable": 6, 7 and 10 load, each switchable.
- Packaging: six items with unit costs given; they replace the workbook's where they
  differ. Her recipe sheet already says which flavour uses which pouch or box, so each
  recipe keeps its packaging lines (this reverses S3's "without their packaging lines").
- The "costing container" question is dropped as not understood: a cookie's cost is its
  ingredients plus its own packaging.
- Target and margin floor: editable settings.
- **New requirement: one set-up screen after Cine first signs in, where she sets or
  confirms everything, with all supplied data already loaded.** Ethan's own test entries
  are cleared at handover.
- Reorder levels and "regular" customers: worked out by rule, from research and her own
  data ([final-plan.md](final-plan.md) section 7, decisions 8 and 9).
- **Everything that can change is hers to change**, on sale or off sale included; the
  inventory is [final-plan.md](final-plan.md) section 6.7.
- **Every feature stays, each with exactly one home, nothing offered twice**; the map of
  today's 33 entries and 25 routes onto 13 places is section 8.1. Not carried over: All
  tools itself and the Form queue entry, which has nothing behind it.
- No session with Cine on the sketches first: "just do everything fast". The wording
  pass before her week stays.

### Slice A2, 6 October 2026: labelled defaults, not decisions

Answer 2 above approved a bounded fix. Building it needed three values nobody had chosen.
Each is a starting value Ethan or Cine can change; none is her decision yet.

| Value                                     | Default                                                                                           | Why this value                                                                                                                     | Where it changes                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Hours Bazaar Mode may open with no signal | 48, from 1 to 72                                                                                  | Covers a two-day bazaar with no signal after the first morning. 72 is the longest a lost phone could keep opening that one screen. | Settings, "Bazaar Mode opens offline for" (`offlineOpenHours`)         |
| Idle time running out at a stall          | The app narrows to Bazaar Mode; the first answer from the server sends the queue, then signs out. | Idle sign-out was the only limit on a signed-in phone. Putting it off keeps her selling; cancelling it would remove the limit.     | Her idle minutes (existing setting). 480 is suggested for bazaar days. |
| Sheets open in Bazaar Mode offline        | Take payment, event expense, close-out                                                            | They are the sheets Bazaar Mode itself opens.                                                                                      | Code (`BAZAAR_SHEETS`)                                                 |

### Slice B1, 6 October 2026: the five tabs go on now, with sub-tabs

Asked what the owner's dock and sidebar should show after B1 (which registers no new screen),
Ethan chose **"Rename now, with sub-tabs"** over keeping the 5 October dock (Home, Orders,
Bake, Inventory, All tools) until the first redesigned screen. This supersedes the dock of
UX review proposal 3; its label line in the frame stays.

| Decided                                                                                                       | By                |
| ------------------------------------------------------------------------------------------------------------- | ----------------- |
| Dock and sidebar: Home, Sell, Make, Stock, Money. A sub-tab strip, drawn through the screen slot, above each. | Ethan             |
| Account sits on Home's strip until the locked top bar has a button for it (C6).                               | Claude, a default |
| Customers and Expenses, which have no screen yet, open their one sheet from the strip (C5, C2).               | Claude, a default |
| The sidebar shows the five tabs only; its locked markup cannot indent sub-tabs.                               | Claude, a default |
| The strip shows on the Bazaar screen only while no event is on the phone, so Bazaar events stays reachable.   | Claude, a default |
| The count All tools carried on the dock (backup flag, unsent sales) is on Home.                               | Claude, a default |

The approved plan said "no strip at all on Bazaar"; the fifth row narrows that, because with
no strip there Bazaar events had no way in. With an event on the phone, at any stage, Bazaar
Mode is exactly as before. One line in `liveTabs` (`src/store/ops-runtime.tsx`) reverses it.

### Slice B2, 6 October 2026: nothing fake on screen

Asked in plan mode, before any code was written:

| Decided                                                                                                                                                                          | By    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| The shop tagline gets one guarded, live-only insertion in the locked `shop.tsx`, under the D4 approval of 28 September ([protected-exception.md](protected-exception.md), last). | Ethan |
| The bazaar clerk name is fixed now, before the bazaar: each sale records the signed-in person's own name, not "Cine" or "Kristian".                                              | Ethan |
| B2 builds only the four shop details the findings need. Address, phone, email, privacy text, retention period and the time zone as a setting wait for C5 and the set-up screen.  | Ethan |

Later the same day, after an audit of three features he asked about (adding a flavour, its
recipe linked to stock, and the cookies a batch gave): **a recorded batch can be corrected**,
by an opposite entry that leaves the batch row as written. Ethan: "sure". It joins slice B3
(item 7 of its goal). The other two exist today; their weak spots (recipe lines linked by
name, an empty menu's first flavour) already had slices, B3 and B6.

**Defaults, not decisions.** Each is a starting value Cine confirms or changes in the wording
pass or the set-up screen; none is hers yet.

| Value                                               | Default                                                                                                    | Why this value                                                                                                    | Where it changes                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Shop name, owner's name, contact line, shop tagline | Empty. Sentences then name nobody ("We will confirm your payment.", "Only the owner can…"), no tagline.    | Any filled-in default would be an invention, or the prototype's value, shown as hers.                             | Sell, Shop, Shop texts, "Shop details"      |
| The person named when no name is known              | The role word: "Owner", "Helper", "Support".                                                               | A phone that has never read the profile (first offline open after the update) must still record something true.   | Her profile's display name (database)       |
| "Pickups" on Home                                   | Orders with pickup date today on the shop's clock, in Confirmed, Preparing or Ready; "—" until orders load | The same rule the pickup alert already used.                                                                      | Code (`pickupsToday`)                       |
| "Profit this month" on Home                         | The shop's calendar month to date. The P&L screen still says and shows "Last 30 days".                     | The label is locked; making the figure match it was the only fix through the view model. C3 redesigns Home.       | Code (`monthTotals`)                        |
| What "Who can see what" says each role can open     | Owner: everything. Helper: Home, the sales log and Bazaar Mode. Support: system health and notifications.  | What the live app actually lets each role open today. The prototype's text promised helpers orders and inventory. | Code (`STAFF_ACCESS`); fixed by design, 6.7 |
| "Default, not confirmed yet."                       | Shown on a rules-sheet setting until she saves it once.                                                    | Final plan 6.1 and N11: a database default must not read as her decision.                                         | Saving the setting removes it               |

### Slice B3a, 7 October 2026: the database window

Ethan approved the slice's plan on 6 October, which split B3 in two (B3a database, B3b
packaging and the screens) and said no B3 migration goes on the trial before 27 October unless
he says otherwise.

**Defaults, not decisions.** Chosen by the builder to finish the slice; each is Ethan's or
Cine's to change.

| Rule                                                      | Default                                                                                                                                             | Why                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Stock on hand with no cost when a costed delivery arrives | Valued at her usual price, else the best quote per unit, else the delivery's own price.                                                             | The average needs a value for what is already there; this is the same order the cost function uses. |
| A count or an adjustment                                  | Leaves the average alone.                                                                                                                           | Neither says what anything cost.                                                                    |
| Nothing on hand                                           | The last average stands until the next costed delivery.                                                                                             | A shortfall still needs a cost.                                                                     |
| A corrected delivery                                      | The share still on hand moves the average; the share already used is one cost line on the day of the correction. Uses already stamped never change. | A closed month must not move.                                                                       |
| A supplier price with no pack size                        | Gives no cost. A pack size is never copied from the item.                                                                                           | A copied size is a guess.                                                                           |
| A recipe line that is not exactly one stock item          | Saving is refused. A line saved before, still unlinked, takes no stock when baked and is listed.                                                    | Final plan 7.1: links are by identity, never guessed.                                               |
| Correcting a batch                                        | Moves no ingredients, no dough and no books. Refused only when it lowers the count and the baked balance would go below zero.                       | The goal's stated default; raising a count must stay possible when packing has run ahead.           |
| The cost basis                                            | Still "when bought". It moves to "when used" (DP-04) in B3b, with the screen that shows uncosted uses.                                              | Flipping it before the app can show what has no cost would overstate profit in silence.             |

**Open, Ethan's:** how a mistyped delivery quantity is undone ([system-audit.md](system-audit.md), R15).

## Amended decisions (open — block the listed work)

**DP-02 · Payment timing** — blocks MP-10, MP-12.

- Evidence: the owner ticked "Payment proof is required before submission" (guide L1494–1497) and "reserve only after payment confirmation" (L1502–1505). She also ticked the status "Awaiting payment" (L1527), and wrote that customers often order before paying ("they have to reload their gcash") and "before payment (placed an order already): i bake their orders" (guide L991–1020).
- Needed: must proof come with the order, or can an order wait unpaid, and for how long? Does an unpaid order go on the bake list?

**DP-03 · Packing rule** — blocks MP-13, MP-18.

- Evidence: some cookies "already fill up one entire box, so when somebody ordered six I have to use another box" (tx 00:25:16–00:25:47). The owner wants every packaging item tracked exactly (guide L1643–1645, Q21). Spec/engine use a fixed "full sixes in a box, rest in pouches".
- Needed: per-flavour box footprint, with an owner override when packing.

**DP-04 · Cost recognition and pricing** — blocks MP-09, MP-10, MP-15.

- Cost recognition:
  - The owner's #1 pain is that ingredients bought but not yet used are counted as cost ("950 grams just sitting there … this profit and loss sheet isn't accurate", tx 00:00:01–00:02:56).
  - The engine's headline P&L subtracts every expense line, so purchases count when bought (`src/store/engine/ops-engine.js` L3177–3194), and contract 06 keeps "purchase posts one paid expense".
  - Needed: count ingredient cost when **used** (consumption), or when **bought**? If "used", the P&L model changes and the bookkeeper should agree.
- Pricing:
  - The owner's box formula is `(All flavors COGS × 4) + 38.44`, where 38.44 = box ₱25 + sticker ₱8.44 + care card ₱5, and "Total box cost (August) = 860" (guide L764–776).
  - That formula is the engine's existing alternative rule "Cookie cost × multiplier + packaging" (`cogsMultiple` 4, `packagingFee` 38.44), **not** the engine default "Sum of menu prices".
  - Q12 has no box ticked (guide L1563–1570). Per-cookie vs box-of-six selling is "to be filled out" (E).
  - Needed: which pricing rule is live, is ₱860 the price or a worked example, and can customers buy single cookies? Also how the 65% floor is enforced.

**DP-05 · Roles** — blocks MP-08 closure, MP-18.

- Evidence: the owner's helper list includes two temporary helpers (guide L1313–1316), and helpers must not see financial data (L1317). The engine lets helpers see the Sales log (spec 01:28).
- Needed: may helpers see peso totals of sales? Is temporary access time-boxed or removed by the owner?

**DP-10 · Backups** — blocks MP-23, MP-27.

- Evidence: the owner marked backups/exports "can follow after launch" (guide L201–207). KETH AI's 2 Aug walkthrough promised her automatic nightly backups, a nightly Google Sheets export and a 30-day restore window. Supabase Free includes none of these automatically (master plan 04).
- Needed: agree a backup routine that is actually free, and correct the earlier promise, before real data is entered. The master plan keeps backups as a launch gate.

**DP-15 · Session idle timeout — decided 2026-09-27 by Ethan:** option **B** with the [configurability audit](configurability-audit.md)'s B10 defaults — owner and support are signed out after **60** idle minutes, helpers after **240** (one bazaar shift). The owner will be able to change each role's minutes within 15 min – 8 h once settings move to the database (MP-09 b). Implemented in `src/lib/auth/idle-signout.ts`. Options drafted by Claude on 2026-09-26 for Ethan. **2026-09-28 (MP-09 b2):** the owner edits the minutes on the live Settings rules sheet (15-minute steps, clamped 15–480); the idle timer reads them from the database, falling back to these defaults. The same slice made "Tax set-aside" and "Cost multiplier" step by whole numbers in live mode, because `save_setting` stores whole numbers — Claude's call, which Ethan left to Claude on 2026-09-28. The 0.5 step returns with MP-09 b3's migration.

- Rationale (ASVS 5.0 V7.1.1): owner and support see finances, so they get NIST SP 800-63B-4's AAL2 inactivity ceiling of 1 hour. Helpers see no financial data, and re-typing a password through a busy stall is a real cost. The accepted risk is that customer names and phone numbers on open orders stay visible on an unattended, signed-in helper phone for up to 4 hours. There is no absolute session lifetime under architecture A, so this idle timer is the only bound on a signed-in device.

- Evidence:
  - Every BFF session has a fixed 8 h absolute lifetime and no last-activity field.
  - Sign-in is password-only, which is AAL1 in NIST terms. NIST SP 800-63B-4 §2.1.3 says an inactivity timeout "MAY be applied but is not required at AAL1". For AAL2 (§2.2.3) it says the overall timeout "SHOULD be no more than 24 hours" and the inactivity timeout "SHOULD be no more than 1 hour".
  - ASVS 5.0 V7.3.1 (Level 2) still requires an inactivity timeout set by documented risk analysis, and V7.1.1 requires that rationale to be documented.
  - Helpers see no financial data (guide L1317), but they do see customer orders, which hold customer names and phone numbers kept for a year. An unattended, signed-in bazaar phone exposes that personal data.
  - The bazaar phone is meant to sell offline, but the durable offline sale queue does not exist yet (MP-07a E2E: 3 failures, "Sale queue absent"; G3). How an expired session interacts with queued sales is still a design goal, not a fact.
- Options (this section predates architecture A: the 8 h absolute limit it refers to was a
  property of the archived BFF, at `hco_private.bff_sessions`, and does not exist under
  architecture A — there is no absolute session lifetime under direct Supabase/RLS, Auth
  session time-boxing being Pro-only. This makes the idle timeout the _only_ bound on a
  live session, not a shorter fallback ahead of a longer one):
  - **A.** One 1-hour inactivity timeout for every role.
  - **B. Recommended.** By role:
    - owner and support: 1 hour, because they see finances;
    - helpers: a longer but finite idle timeout that Ethan sets, e.g. one bazaar shift of 2–4 h, so a busy stall doesn't keep re-typing passwords. The accepted risk is exposure of customer names and phones on an unattended phone for up to that long. Record it as the V7.1.1 rationale.
  - **C.** No idle timeout for any role. This fails V7.3.1 as written.
- Implementation under architecture A (2026-09-26): a client-side idle sign-out (`supabase.auth.signOut()` after N idle minutes per role), with the minutes in one constant. Supabase's server-side inactivity timeout is Pro-only.
  - Pre-A plan, now archived: a last-activity column in `hco_private.bff_sessions`.
- Needed (answered 2026-09-27, see the decision above): Ethan picks A, B or C and sets the minutes for each role.

**DP-14 · Hosting — resolved 2026-09-26 by architecture A:** Cloudflare **Workers static assets**, the platform Cloudflare recommends for new projects. There are no Functions, so there is nothing to compare between Pages and Workers. The one hosted preview still needs Ethan's approval. The checklist below is kept for reference; under A only items 1, 5 and 6 apply, and item 2 becomes a direct-Supabase sign-in check.

Reference checklist (pre-A): run the same checks on one Pages and one Workers deployment before choosing. Each needs Ethan's approval, because it creates hosted resources.

1. The MP-04d oracle on the hosted URL: all 26 routes, the generated CSP and cache headers, and `/shop` hydration.
2. BFF login → read → refresh → logout against a synthetic hosted Supabase project that uses `sb_publishable`/`sb_secret` keys only.
3. CPU time per request and per cleanup tick, measured against the Workers Free limit of 10 ms.
4. Cleanup schedule: a Cron trigger on Workers; Pages has none.
5. One `auth.sessions` `FOR SHARE` probe on hosted Supabase.
   - Repeat the MP-08o.2 direct-parent refresh-replay probe there too. Cleanup recovery relies on it, per the [Claude review](evidence/G1-claude-auth-sql-review.json).
   - Replay after a delay at least as long as the 30-second claim floor, and closer to real cleanup lag (minutes). The local receipt only proves 11 seconds.
6. Spend controls reviewed on the account.

## New decisions

| ID    | Decision needed                                                                                                                         | Evidence                                                                                                                                                                                         | Owner           | Blocks                          |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------- |
| DP-11 | How Google Form orders are handled during the 1–2 week handover                                                                         | guide L1761–1763 (Q31)                                                                                                                                                                           | Owner           | MP-24 form queue, launch plan   |
| DP-12 | How "new order" and "pickup reminder" alerts reach people with no paid SMS                                                              | guide L1733–1744 (Q29); no SMS in the zero-cost plan                                                                                                                                             | Owner + Ethan   | MP-24                           |
| DP-13 | Later scope: loyalty (wt id93 "Yes"), promotions "very near" (wt id100), wholesale/consignment (guide Q2) vs the crosswalk-05 exclusion | as cited                                                                                                                                                                                         | Owner           | Post-launch roadmap only        |
| DP-14 | Hosting: Cloudflare Pages vs Workers (static assets). **Resolved 2026-09-26: Workers static assets (architecture A)**                   | See "Platform facts" below                                                                                                                                                                       | Ethan           | MP-04 hosted preview (approval) |
| DP-15 | Session idle timeout (ASVS 5.0 V7.3.1 L2) and a documented rationale (V7.1.1). **Decided 2026-09-27: option B, 60/60/240 min**          | No absolute session lifetime under architecture A; the client idle timer is the only bound                                                                                                       | Ethan           | MP-08 closure                   |
| DP-16 | Bake days and pickup times                                                                                                              | Bake "every Sat and Sunday" (guide L917) vs "Friday and Saturday are my bake days" (wt id5). Pickup is "anytime before 5pm" and she wants to free up her time (wt id95). Spec: one Monday window | Owner           | MP-10, MP-17                    |
| DP-17 | Order statuses                                                                                                                          | Owner ticked Awaiting payment, Paid/confirmed, Ready, Collected + "Replaced" (guide L1524–1535). Engine has 7 states incl. Cancelled/No-show. Refund is manual (wt id35)                         | Owner           | MP-10, MP-12, MP-13             |
| DP-18 | One or two selling devices at MoreSem                                                                                                   | Kristian plans to help sell (wt id78) vs the master plan's one offline sales device                                                                                                              | Owner + Ethan   | MP-18–MP-20                     |
| DP-19 | Menu is not fixed at six flavours                                                                                                       | pop-up exclusive flavours (wt id80), MoreSem menu (guide L723) vs spec "6 rows, effectively static"                                                                                              | Owner           | MP-09 catalog                   |
| DP-20 | Bazaar prices are the same as online prices                                                                                             | "No" to "Should bazaar prices be able to differ…?" (wt id79) vs spec 02:115 / engine event prices                                                                                                | Owner (confirm) | MP-18 event price snapshot      |

## Platform facts and risks (verified 2026-09-24 against official pages)

- **Cloudflare:**
  - The Pages docs now say "Start new projects with Workers".
  - Pages Functions only have `onRequest*` handlers, so no cron.
  - Workers Free: 10 ms CPU per request, 100,000 requests/day, 5 cron triggers per account, 50 subrequests.
  - `_headers` applies to static responses only, on both platforms.
  - DP-14 is decided after one hosted spike on each, against the same MP-04 oracle.
- **Session cleanup:** the MP-08o.4 local scheduled Worker now calls `claimCleanup()` and passes disposable provider/database acceptance; no hosted caller or Cron trigger is deployed. Explicit logout cleans up immediately, but expired sessions, sessions auto-revoked in `bff_session_read`/acquire/finalize, and failed cleanups retain encrypted provider refresh tokens until an activated caller handles them. Hosted CPU, native key behavior and schedule reliability still need proof under DP-14.
- **Supabase keys:** "Supabase is deprecating the `anon` and `service_role` keys by the end of 2026."
  - The BFF already uses `sb_publishable`/`sb_secret`, with the secret sent only on `apikey`.
  - Still on legacy keys: `src/lib/supabase/{client,server,service}.ts`, `src/middleware.ts`, `.env.example`, `docs/STAGING.md`, `docs/DEPLOY.md`.
  - Must migrate before the first new hosted project.
- **`auth.sessions` locking:** `FOR SHARE` needs UPDATE privilege (PostgreSQL SELECT docs). Supabase's 21 Apr 2025 auth-schema restrictions do not list DML on that table, so this is probably fine on hosted Supabase. Add one probe query to the MP-04 hosted checklist.
- **Next.js 16:** `middleware` is deprecated in favour of `proxy`. It doesn't matter for the static export target, but it affects the Vercel demo path.
- **Static headers** (MP-04d, accepted locally 2026-09-25):
  - `spikes/pages/_headers` is now only the base template. `scripts/pages-spike-headers.mjs` generates the served `_headers` per build:
    - a CSP with per-build SHA-256 hashes for Next's inline scripts;
    - `style-src 'self' 'unsafe-inline'` for the locked inline styles;
    - `Cache-Control: public, max-age=0, must-revalidate` for HTML;
    - immutable caching only for fingerprinted `/_next/static/*`.
  - Before a hosted preview (found in Claude's 2026-09-26 review):
    - Add `form-action 'self'`. It is not covered by `default-src`.
    - `connect-src` falls back to `'self'`. The exported `/sign-in` still calls `signInWithPassword` directly against `NEXT_PUBLIC_SUPABASE_URL` (`src/app/sign-in/sign-in-form.tsx` L25), so hosted sign-in would be blocked.
      - Pre-A advice: route sign-in through the BFF instead of widening `connect-src`.
      - **Under architecture A:** the generator sets `connect-src 'self' <Supabase origin from build env>`. Add `wss://` for that origin only if Realtime is used. Nothing broader.
  - Change the generator and its oracles together, then verify with `pnpm build:pages:spike`, `pnpm test:pages:spike` and `pnpm test:workers:spike`.

Sources:

- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Pages Functions API](https://developers.cloudflare.com/pages/functions/api-reference/)
- [Workers `_headers`](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase schema restrictions](https://github.com/orgs/supabase/discussions/34270)
- [PostgreSQL SELECT](https://www.postgresql.org/docs/current/sql-select.html)
- [OWASP ASVS 5.0 V7.3](https://cornucopia.owasp.org/taxonomy/asvs-5.0/07-session-management/03-session-timeout)
- [NIST SP 800-63B-4 §2.1.3/§2.2.3 reauthentication](https://pages.nist.gov/800-63-4/sp800-63b.html) (checked 2026-09-26)
- [Next.js middleware→proxy](https://nextjs.org/docs/messages/middleware-to-proxy)
