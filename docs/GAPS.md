# Gaps

> MP-06.b.1 authority update: `settings_effective()` now permits only service_role among API-facing roles. Its previous general-staff grant is revoked; the settings descriptions below preserve historical behavior, not authorization to restore that grant. Use the [current RPC plan](state/MP-06b-authority-plan.md) and owner/public projection boundaries. Direct table-policy hardening remains pending.

> **Superseded audit baseline:** Use [MASTER-PLAN.md](../MASTER-PLAN.md) and [the new audit](master-plan/00-audit-evidence.md). The list below is historical and contains readiness assumptions corrected by the source/browser/build evidence.

What this system lacks, beyond design. Written as an honest inventory, not a wishlist:
each item says what is missing, what it costs to leave it, and whether it is actually
worth building for a one-person bakery. A gap register that treats every absence as a
defect is useless — half the value here is the list of things you should *not* build.

Read alongside `docs/TECH-DEBT.md`, which covers compromises made deliberately during the
port. This file covers what was never there at all.

**Status key.** `○` open · `◐` scaffolded — the code is written and needs wiring to a
route or a service · `●` resolved.

A resolution pass closed everything that could be closed without executing code or
spending the owner's money. What remains open is open for a stated reason: it needs a
build (§1.1), a running toolchain, or her decision.

---

## 1. Blocking — the product is incomplete without these

### 1.1 The books are not in Postgres

Orders, ledger, stock, drops and the bake plan live in one `localStorage` object. Postgres
holds auth, the catalogue and synced bazaar sales.

**Cost.** One device, no backup, no history, no second phone. A cleared cache loses a year
of bookkeeping. Every other item in this file is downstream of this one — you cannot
report, audit, or recover data you do not store.

**Status.** Sequenced as T-10 → T-14. This is the remaining build.

### 1.2 No authorisation on the write paths that exist

RLS is in place and default-deny. But the app's role still comes from engine state, so
"helper cannot see money" is currently a *rendering* decision. A helper who opens dev
tools and flips a role sees the P&L.

**Cost.** Not catastrophic today — the books are on her own device, and a helper holding
her phone can already read them. It becomes real the moment 1.1 lands and a helper signs
in on their own device.

**Status.** T-04. Must land before T-12.

### 1.3 ◐ Idempotency on the order path

A customer double-tapping "place order" on a slow connection would get two boxes.

**Resolved as far as it can be.** `src/lib/idempotency.ts` now derives an order key from
the basket rather than randomly, so the same intent produces the same key across a reload
— a customer who loses signal, refreshes and resubmits is making one order, not two. It
shares `normalisePhone()` with the SQL lookup function, tested in
`tests/unit/idempotency.test.ts`.

**What is left.** `/api/orders` does not exist yet, so nothing calls it. T-11 wires it,
and `tests/load/drop-open.js` already performs the double-tap and asserts one order.

---

### 1.4 ○ `taxRate` exists and nothing consumes it

`DEFAULT_CFG.taxRate` is 3 and no order, sale or ledger row carries a tax amount. The P&L
is therefore pre-tax and does not say so.

**Cost.** Her reported profit is wrong by roughly 3% of gross, in the optimistic
direction. That is the kind of error that is invisible until a tax return.

**Why it is still open.** Not a coding question. Whether that 3% applies to gross or to
margin, and whether it is percentage tax or something else, is a question for her
bookkeeper. Guessing it and shipping a number she will file against is worse than leaving
the field absent. `docs/DATA.md` flags it at the schema.

### 1.5 ● Settings had nowhere to persist

**Resolved.** `DEFAULT_CFG` holds 21 owner-editable values — capacity, her prices, the
order window, discount tiers, the grocery budget — and the Settings screen edits all of
them. There was no table.

Harmless while the books live in `localStorage`, and a real loss the moment T-14 removes
it: every setting she had ever changed would revert to a default on a new device,
silently, including her capacity and her packaging fee.

`20260101000700_settings.sql` stores only what she has changed, and
`settings_effective()` fills the rest from the engine's defaults. Storing the defaults
instead would look simpler and lose information: you could no longer distinguish a
deliberate 200 from a default 200, which matters the day a default changes.
`scripts/check-engine-contract.mjs` fails if a new `DEFAULT_CFG` key has no home.

## 2. Real gaps, worth building after phase 04

### 2.1 No email or SMS. Nothing leaves the system.

There is no transactional messaging of any kind: no order confirmation, no "your box is
ready", no payment reminder, no receipt. The prototype confirmed on screen and left
messaging to the owner's own Messenger.

**Cost.** Every notification is manual. For 40 orders a week that is real labour, and
"ready for pickup" is exactly the message that reduces no-shows.

**◐ Scaffolded.** `src/lib/messaging/` has the `MessageProvider` interface, a Semaphore
implementation, the one template, and a stub that is **honest about being a stub** — it
logs at warn level with the recipient redacted and reports `sent: false`, so nobody
mistakes a full log for a working integration. Every code path around messaging can now be
built and tested before a single text is paid for.

**What is left, and it is not code.** Her agreement to a recurring per-message bill.
`docs/MESSAGING.md` §"What she has to agree to first". Do not switch this on without
asking her.

### 2.2 No payment verification

Payment state is what the owner types after eyeballing a GCash screenshot. There is no
webhook, no reference matching, no reconciliation against the bank.

**Cost.** Manual reconciliation, and it is the slowest part of her week. The
`/reconcile` screen exists to make it bearable, not to automate it.

**Worth it?** Only partly. GCash's business API needs a registered merchant account and
approval that a home baker may not clear. What *is* worth building: matching a pasted
reference number against expected amounts, which turns reading into confirming. Full
webhook integration is a later-stage decision, not a gap in this build.

### 2.3 ● Observability

**Resolved.** Sentry across all three runtimes (`instrumentation-client.ts`,
`sentry.server.config.ts`, `sentry.edge.config.ts`, plus `onRequestError` for server
components, which never reach a React boundary). Uptime cron every fifteen minutes against
`/api/health`, opening and closing one GitHub issue per outage.

The substance is the scrubber — `src/lib/observability/scrub.ts`, deny-by-default, with
tests proving a fixture customer's name, email and mobile number survive nowhere in a
payload. Three of Sentry's own recommended defaults are inverted on purpose:
`sendDefaultPii` false, session replay off at any rate, and reports tunnelled through the
app's origin. `docs/OBSERVABILITY.md` explains each.

**What is left.** Set `NEXT_PUBLIC_SENTRY_DSN` and the `PRODUCTION_URL` repository
variable. It is off until you do, which is correct for local development.

### 2.4 No backup or restore procedure

Supabase's automated backups are not enabled, and no restore has ever been tested. The
Settings export is the only backup, and it is manual.

**Cost.** An untested backup is a belief. T-19 exists to fix that and it is an hour.

**Worth it?** Yes. Before T-14, not after — the migration is when data is most at risk.

### 2.5 No audit trail on reads

`audit_log` records writes. Nothing records reads. If a helper's account is compromised
there is no way to know what was looked at.

**Cost.** Low today. It matters for a business with employees and a duty to customers,
which this may become.

**Worth it?** Not yet. Note it and move on.

### 2.6 ◐ Rate limiting

**Resolved.** `src/lib/rate-limit.ts` with a Postgres store
(`20260101000300_rate_limits.sql`), and per-route limits in one table so they can be
argued about. The tightest is `orders:lookup` at 8/minute, because that is the
enumeration surface.

Postgres rather than Upstash, deliberately: the usual argument for Redis is that a
rate-limit check consumes the connection you are protecting, which is real at scale and
weak here — one baker, a single indexed upsert. The alternative was a second paid service
for a home business to configure. The store is swappable if traffic ever justifies it.

It **fails open**, loudly. A limiter that rejects real customers because its counter table
is unreachable has done more damage than the abuse it was guarding against.

**What is left.** `/api/orders` and `/api/orders/lookup` do not exist yet. Apply it in
T-11, and to `/api/sync` in T-05.

### 2.7 ◐ Data retention and erasure

**Resolved in the schema.** `20260101000500_retention.sql` adds `anonymise_customer()`,
`prune_personal_data()` and an `erasure_requests` log.

The design point is that erasure here is **blocking, not deletion**. RA 10173 gives a
customer the right to erasure or blocking; BIR record-keeping means a paid order cannot
simply be deleted, because the financial record must survive an audit. So the correct
response to an erasure request on a paid order is to strip the name, phone and notes and
keep the money. Live unpaid orders *are* deleted — there is no tax record to preserve for
a box nobody bought, and an anonymous pending order is just a box nobody can collect.

`prune_personal_data()` finally enforces the engine's `RETENTION_DAYS`, which existed and
did nothing.

**What is left.** A route handler and a Settings control, and a monthly cron for the
pruner. The rule is written; the door is not.

---

## 3. Missing engineering practice

### 3.1 ◐ Staging environment

**Documented, not provisioned.** `docs/STAGING.md` has the whole setup: a second Supabase
project, Vercel Preview-scoped variables so a preview can never reach production, the RLS
verification query to run against the remote project specifically, and the five-minute
smoke test.

It also names what staging is *not* for: it tells you a migration runs, not that her books
came across correctly — staging does not have her books. That is the T-14 dry run.

**What is left.** Creating the project. Ten minutes, and it must happen before T-14.

### 3.2 ● Load testing

**Resolved.** `tests/load/drop-open.js` (k6) models the only traffic shape that matters:
nothing, then 40 concurrent customers when the drop opens, then a tail of status checks.

Its thresholds are assertions rather than timings — `capacity_oversold: rate==0` and
`duplicate_orders: rate==0`, with the script performing the double-tap itself. 429s and
409s count as correct behaviour; 5xx does not.

**What is left.** Running it, against staging, once `/api/orders` exists. It places real
orders.

### 3.3 ◐ Performance budget

**Resolved as a mechanism.** `lighthouserc.json` plus a CI job, throttled to 1.6 Mbps and
a 4× CPU slowdown — a mid-range Android phone on Philippine mobile data, not a laptop.

Advisory (`continue-on-error`) until T-18 sets real numbers from measurement, because a
budget invented without data gets switched off the first time it is inconvenient. Two
audits are permanently off (`unused-javascript`, `legacy-javascript`): the app ships all 24
screens in one tree by design, so they would always fail, and permanent failures train
everyone to ignore the report.

**What is left.** T-18 measures, then the thresholds get real values.

### 3.4 ● Visual regression

**Resolved**, and it closed the biggest hole in the project's central guarantee.

`tests/e2e/visual.spec.ts` captures ten screens on a Pixel 7 viewport, in a CI container
so the committed baselines were rendered by the same font stack — running it on a bare
runner diffs on font hinting alone until someone switches the job off.

The clock is **frozen, not masked**: masking paints over the element, and the layout it
occupies is part of what we are checking. `updateSnapshots: 'none'` in CI, so a missing
baseline fails loudly rather than writing itself and passing.

**What is left.** Generating the baselines, in Docker, per `docs/TESTING.md`.

### 3.5 Test coverage is thin where it matters most

~80 engine methods have no unit test. T-07 and T-08 cover the rules named in the spec;
that still leaves the majority of the engine covered only by "it does not throw".

**Worth it?** T-07 and T-08 are the right scope. Chasing a coverage percentage on ported
code is not.

### 3.6 ● Dependency automation

**Resolved.** `.github/dependabot.yml`, weekly, with `next`/`react`/`tailwindcss` in
their own group — those three break in ways that are hard to attribute and must never be
batched with anything else. Capped at five open PRs: a bot that opens one a day gets
ignored, and then the one that matters gets ignored too.

---

## 4. Architecture that will need revisiting

### 4.1 The engine is one 4,099-line class

Deliberate, and correct for the port. But every business rule, all UI state and all
persistence live in one object with an 84-key state bag. Two agents cannot work on it in
parallel, and `docs/TASKS.md` marks those tasks sequential for that reason.

**When it becomes a problem.** When rules need to run server-side — capacity enforcement
already does, which is why T-11 duplicates it in `drop_remaining()`. That duplication is
the first crack.

**What not to do.** Do not refactor it into hooks. It would risk every rule at once and
end diffability against the prototype. Extract *rules* to shared modules as the server
needs them, leaving the class as the client's state machine.

### 4.2 Business rules will exist in two places

The moment capacity is enforced in Postgres and in the engine, there are two copies of one
rule. `drop_remaining()` and the engine's capacity check must agree forever, and nothing
makes them.

**Cost.** The classic distributed-monolith failure: the client says yes, the server says
no, and the customer sees an error the design never accounted for.

**● Resolved.** The arithmetic now lives once, in `src/lib/rules/capacity.ts`, with
`capacity_allows()` as its declared mirror. `tests/fixtures/capacity-cases.json` is read
by **both** `tests/unit/capacity-parity.test.ts` (TypeScript) and
`tests/e2e/capacity-parity.spec.ts` (the live database), which asserts the two agree case
for case. Change one side without the other and CI says so.

The SQL half skips without a database rather than passing — a parity test that quietly
does nothing is worse than none, because it reads as coverage.

### 4.3 The offline model does not handle two devices offline

The queue is per-device and idempotent per-device. Two phones at the same bazaar, both
offline, both selling from the same stock, cannot know about each other. Stock will be
oversold.

**Cost.** Real, if she ever brings a helper with a second phone. Currently theoretical.

**Fix.** Not a small one — either partitioned stock per device, or accepting overselling
and reconciling at closeout. The second is what a market stall actually does. Document the
choice rather than engineering around it.

### 4.4 ◐ Conflict resolution on concurrent edits

**Resolved.** `20260101000600_concurrency.sql` adds `updated_at` with a trigger on the
five tables two people can edit at once, and `update_order_state()` which takes the
`updated_at` the caller read and affects zero rows if the order has moved on.

Two users is not a distributed system and does not need versioning or a merge policy. It
needs one thing: a write must fail rather than silently overwrite an edit made since it
was read — the case being the owner marking an order paid and a helper's stale form marking
it unpaid a second later.

The function deliberately returns nothing on conflict rather than the current row.
Returning it would be friendlier and wrong: it invites the caller to retry the same stale
decision.

**What is left.** T-11 calls it and answers 409.

---

## 5. Features the prototype implies but does not implement

Each of these has UI in the prototype and no working path behind it. Worth knowing before
someone reports them as bugs.

| Feature | State |
| --- | --- |
| Form queue (`/formqueue`) | Screen exists; nothing submits anywhere. It was designed as an intake for orders taken by hand. |
| Notifications (`/notifications`) | In-app list only, generated locally. Nothing pushes. |
| System health (`/health`) | Reads local state. Not connected to `/api/health`. |
| Recipes (`/recipes`) | Read-only. No editing, no scaling, no versioning. |
| Suppliers (`/suppliers`) | Read-only price book. No purchase orders, no receiving. |
| Drops (`/drops`) | Configuration is read from `DEFAULT_CFG`; the editing UI does not persist. |
| Multi-user presence | No indication of who else is in the app. |
| Customer accounts | Deliberate: order lookup is by number and phone, no login. Correct decision — keep it. |

## 6. What not to build

Named explicitly, because each will look like a good idea to someone.

| Idea | Why not |
| --- | --- |
| A mobile app in React Native | The PWA installs, works offline and takes payments. A native app buys nothing here and doubles the surface. |
| A design system or component library | The components are the prototype's, signed off. `docs/TASKS.md` explains what rebuilding them destroys. |
| Microservices, a queue, a worker tier | One baker, 40 orders a week, 200-box capacity. A single Next.js app on Vercel is over-provisioned already. |
| GraphQL | Adds a schema layer between two things that already agree. |
| Redux, Zustand, a state library | The engine *is* the state management, and it is signed off. |
| An analytics dashboard | The P&L screen is the dashboard. She reads one number and decides what to bake. |
| Internationalisation | One baker, one city, English and Tagalog code-switching that a translation layer would flatten. |
| A CMS for the shop copy | Six products. She texts you. |

---

## What is left, and who has to do it

The resolution pass closed the mechanisms. What remains needs a running toolchain, an
account, or her decision — none of which can be written into a file.

**Free-tier conditions to decide on** (`docs/FREE-TIER.md`)

0. **Supabase free projects pause after 7 days idle**, and her business is weekly. The
   hourly health check keeps it warm — which is a reason not to replace that workflow with
   an external monitor. Do not rush T-14 while the app still works from `localStorage`.
0. **Vercel Hobby prohibits commercial use.** This app takes money. Deploy on Hobby now to
   watch it work; make the call before it is her only till. The `Dockerfile` is the exit.

**You, and none of it takes long**

1. **Enable Supabase backups and restore one into a scratch project** (§2.4). An untested
   backup is a belief. Before T-14, not after.
2. **Create the staging project** (§3.1). `docs/STAGING.md` is the checklist. Also before
   T-14 — that migration can destroy a year of bookkeeping and needs somewhere to fail
   safely.
3. **Set `NEXT_PUBLIC_SENTRY_DSN` and the `PRODUCTION_URL` variable** (§2.3). Reporting
   is written and switched off until you do.
4. **Generate the visual baselines in Docker** (§3.4). One command in `docs/TESTING.md`.

**Her**

5. **The messaging bill** (§2.1). A recurring cost on her card. Ask before switching it on.
6. **Everything in §5.** Which of those half-built screens she actually wants is hers to
   say, not yours to guess.

**An agent, in this order**

7. **T-01** — nothing is verified until `pnpm verify` runs.
8. **T-04, T-05** — authorisation before the books move (§1.2).
9. **T-10 → T-14** — the actual remaining build (§1.1). Everything else in this file is
   downstream of it.

The fastest way to waste this build is to guess on her behalf. She is the only reliable
source of priority.
