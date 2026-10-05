# Build log

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../MASTER-PLAN.md), [docs/state/current.md](../docs/state/current.md) or the [decision register](../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

What was decided during the port, what it cost, and what turned out to be wrong. Written
so the next person does not have to rediscover it.

## The brief

Turn a 6,929-line interactive prototype — one file, no build step, all 25 screens, all
business rules, reviewed and signed off — into a production frontend, without rebuilding
any of it. Stack chosen with the owner: Next.js App Router, TypeScript strict, Tailwind v4,
Supabase, real offline mode, full tooling.

## What the prototype actually was

| Part           | Size                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| Template       | 2,827 lines — 1,443 elements, 310 conditionals, 95 loops                     |
| Logic class    | 4,100 lines — ~90 methods, 84 keys of state                                  |
| `<helmet>` CSS | 60 lines: resets, six keyframes, one font                                    |
| Screens        | 24 rendered branches (25 screen keys — `stocktake` renders inside inventory) |
| Sheets         | 29 bottom sheets                                                             |

The critical property: the template read values from one `renderVals()` object and never
computed anything itself. That is what made a mechanical port possible at all.

## Decisions

**The engine was copied, not rewritten.** Four edits, each marked in the file: asset
resolution, an SSR guard, moving the state restore to `componentDidMount`, and the base
class. Everything else is byte-identical to the prototype. A rewrite would have put every
business rule at risk simultaneously, with a prototype as the only oracle.

**The markup was translated mechanically, once.** The template was parsed as XML and
walked with a fixed rule per construct (the table in `docs/PORTING.md`). No judgement
calls per element means no drift. Two exceptions, both structural rather than visual:
each screen and each sheet became its own file, and values are passed as one `v` object.

**Inline styles stayed inline.** The tempting move — convert ~1,400 elements to Tailwind
classes — would have meant a judgement call per declaration on a design already approved.
Instead the _system_ was lifted into `@theme` (palette, radii, shadows, two eases) so new
UI has a source, and the ported literals were left alone. This is the decision most
likely to be questioned, and it is the reason the port can be trusted.

**Hover, press and focus became a component.** The prototype expressed them as
`style-hover` / `style-active` / `style-focus` attributes. `<Pressable>` keeps them as
style objects rather than translating each into a class, so the pressed scale and the
focus ring are still the approved values.

**Routes exist, state does not live in them.** One client tree per route, URL synced with
`history.replaceState`. A router navigation per screen would remount the tree and close
whatever sheet was open mid-task.

**Simulated sync was replaced, its sentences kept.** The prototype faked a partial sync
with a `setTimeout`, deliberately, so the owner could see the failure case. `OpsRuntime`
subclasses the engine and swaps in the real IndexedDB queue while firing the same copy on
the same outcomes.

## Things found the hard way

**`localStorage` in a field initialiser breaks hydration.** `state = loadState()` runs on
the server, where there is no `localStorage`, and React 19 will not reconcile a client
tree that disagrees with the server's. Restoring in `componentDidMount` costs one extra
commit and is the only correct place for it. This is now edit 3 in `docs/PORTING.md` and a
warning in `CLAUDE.md`.

**Sale ids are per device, so they are not idempotency keys.** The prototype numbers sales
`S1`, `S2`, `S3` — restart the app and it starts at `S1` again, and two phones at one stall
both produce an `S1`. Using them as the server key would have merged two different sales.
The key is `deviceId + saleId + timestamp`.

**"Sync succeeded" is not the same as "the server has it".** The first version of the
flush cleared the queue on a 200. The endpoint now replies with the list of accepted
`clientId`s and the device clears only those, because a 200 with a partial insert is a
real outcome and a lost sale is unrecoverable.

**Capacity has to be enforced in the database.** The prototype refused an over-capacity
order in the UI. Two customers checking out in the same second would both have passed
that check, so `drop_remaining()` is a server-side function.

**An order number cannot be a credential.** The customer-facing lookup screen takes an
order id. Left as a plain `select` policy, that lets anyone walk `HC-1041`, `HC-1042`…
`lookup_order(id, phone)` requires both, and normalises phone formats so
`0917 123 4567` matches `+639171234567`.

**A helper must be able to record a sale and never edit one.** Expressed as the absence of
an `update` policy on `event_sales` rather than as a UI restriction.

**Floats do not belong in a ledger.** The prototype's peso values are two-decimal and fine
in a display layer. Postgres stores centavos as `bigint`; conversion happens once, at the
boundary, with a test.

**`useSearchParams()` fails the build without a Suspense boundary.** The sign-in form
reads `?next=`, which suspends during prerender. It is wrapped in `<Suspense>` with a
fallback the same size as the form, so there is no layout jump.

**Switching off the review harness meant starving it, not deleting it.** The device and
role pickers are inside ported frame markup, which the rules forbid editing.
`OpsRuntime.renderVals()` returns empty lists when `NEXT_PUBLIC_HARNESS=0`, and the
ported `.map()` renders nothing. The constraint produced a cleaner answer than an edit
would have.

## Build-readiness pass

Eight real defects found by static audit after the repository was written, before anything
had been executed. Recorded because most of them are the kind that look like your bug when
they surface.

**`next lint` was removed in Next 16.** `pnpm lint` was `next lint`, so the lint gate —
inside `pnpm verify`, pre-commit and CI — would have failed on the first run with an error
about the command, not about the code. Now `eslint . --max-warnings 0`, with the flat
config carrying its own ignores (build output, the service worker, docs, scripts) because
`eslint .` walks everything rather than the two directories `next lint` was pointed at.

**A test that asserted something false about the drop cycle.** It claimed
`Object.values(dropCycle(…))` is chronological. The engine returns
`{open, close, nextOpen, mon, sat, sun}`, and `sat` precedes `mon` — so the test would have
failed on a correct engine. Replaced with the five invariants that are actually true:
open before close, pickup after close, pickup on a Monday, the next window exactly a week
out, and the weekend windows on Saturday and the Sunday after.

**A test that could never fail.** `expect(amt(1.5, 'kg')).toBe(amt(1.5, 'kg'))`. Replaced
with the real behaviour, read out of the engine: `amt(1346, 'g')` is `'1.346 kg'`,
`amt(999, 'g')` is `'999 g'`.

**`dropCycle`'s declared return type was wrong** — a `pickup` key the engine never returns.
Any code trusting the `.d.ts` would have failed at runtime with the compiler's blessing,
which is worse than no types.

**`useCallback` keyed on a fresh object.** `Pressable` memoised its handler factory on
`[rest]`, which is a new object every render, so it rebuilt six handlers per render anyway
while adding a dependency-array bug surface. Removed, with a comment saying why, so nobody
adds it back.

**No `.prettierignore`.** `prettier --check .` would have walked the 540 KB prototype, the
generated database types and every build artefact, and failed on all of them. The
prototype in particular must never be reformatted — it is the answer key.

**`import.meta.url.pathname` in the port guard.** It keeps percent-encoding and prefixes a
slash onto a Windows drive letter, so the check that enforces the whole 1:1 rule would
silently fail to find its own baseline on Windows, or in any repo path containing a space.
Now `fileURLToPath`.

**Twenty-five files quoted against their own formatter.** Route metadata titles used double
quotes under a `singleQuote` prettier config — every one a `format:check` failure.

Separately, the standalone export of the prototype was throwing
`ReferenceError: DCLogic is not defined`: it had been bundled without the thumbnail
template the bundler needs, so the unpacker never evaluated the runtime before the logic
class ran. A `<template id="__bundler_thumbnail">` — which renders nothing — was added to
the prototype and it was re-bundled.

## The seed was fabricated

Worth its own section, because it is the most dangerous kind of error in this repository
and it survived the first audit.

`supabase/seed.sql` claimed to hold "the real catalogue and prices... the same numbers the
design shows". It did not. It had been written from the data-model note rather than from
the engine, and every value in it was invented: prices of ₱150–170 against the real
₱130/140/145/80/150/200, `classic`/`special` instead of `Permanent`/`Rotating`, product
names and descriptions that do not exist, nine stock items in kilos instead of thirty in
grams, and three made-up suppliers in place of the ten real ones — S&R Membership,
Landers, Puregold, Wet market, Chocolate Lover, Japanese grocery, Healthy Options, Baking
supply, Divisoria Packaging, Sticker Shop PH.

Reading the engine also exposed three things the schema was missing outright:
`inventory_items.category` (Ingredients or Packaging, which the inventory and grocery
screens group by), `suppliers.place`, and the entire **supplier price book** — the engine
carries, per supplier per item, the pack it comes in, the current price, the previous
prices paid and whether it is preferred. The "best buy" comparison on the suppliers
screen is built from that, and there was no table for it. Added in migration
`20260101000200_catalogue_fidelity.sql`.

The fix is not a corrected seed; it is `scripts/gen-seed.mjs`, which generates the SQL
from the engine's own constants. A hand-written seed drifts from the design silently. A
generated one cannot: if the engine changes and nobody regenerates, that is a diff, not a
demo full of prices the owner has never charged.

## The order-state enum was fabricated too

The seed was not the only place data was written from a summary instead of from the
engine. The resolution pass found the same class again, one layer down.

`order_state` in the init migration was `('new', 'confirmed', 'baking', 'ready',
'collected', 'cancelled')`. The engine's actual statuses are **'Payment review',
'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled', 'No-show'**. Not a naming
difference: two states were missing entirely.

`'Payment review'` is where every order starts — placed, awaiting proof of payment. The
schema had no state for it, so the default was `'new'`, which corresponds to nothing.

`'No-show'` is worse. It carries a rule with money on both sides: _"Nobody came. They stay
paid and the cookies go back into stock."_ It appears in the engine's `RECOGNISED` list, so
a no-show is **recognised revenue**. A schema that cannot represent it cannot hold the
books, and the P&L would have been wrong by the value of every uncollected box.

The invented values had propagated into three more places written against them:
`drop_remaining()` filtered on lowercase `'cancelled'`, which after the correction is not a
valid enum value at all — meaning **the init migration would have failed to apply**. The
capacity and retention migrations filtered on `'no_show'` and `'placed'`, neither of which
ever existed.

Fixed at source rather than with a follow-up migration, because no migration in this
repository has ever been applied: an applied migration is immutable, a never-applied one
that is wrong is just wrong.

The enum now holds the engine's exact strings, spaces and capitals included. That looks
unusual and it is deliberate — the alternative is snake_case values plus a mapping layer,
and a mapping layer between the engine's status and the database's state is precisely the
two-places-for-one-truth bug that `src/lib/rules/capacity.ts` exists to prevent. This is a
1:1 port; the engine's vocabulary is the vocabulary.

Two rules came out of the engine with it, as functions so nothing can disagree with them:
`state_is_recognised()` from `RECOGNISED`, and `state_reserves_capacity()` from
`RESERVING`. `drop_remaining()` now calls the second one instead of hardcoding a list.

**The lesson, twice learned.** Both times, the error was writing data or a schema from a
design note rather than from the engine, and both times it read as plausible. The
generated seed closed it for constants. For enums the equivalent discipline is the one
applied here: derive the values from the engine, express the rules as functions, and never
restate a list that already exists in code.

## Third fabrication: invented copy wearing a signed-off label

A fourth audit pass, run because the previous three had each found this same class one
layer deeper, found the worst instance.

`capacityRefusal()` in `src/lib/rules/capacity.ts` returned _"This drop is full. Join the
next one — it opens Monday."_ and _"Only N boxes left in this drop. Adjust your order to
continue."_ Above them, a comment: **"Quoted from the prototype, which is the signed-off
wording — do not paraphrase it."**

Neither string exists anywhere in the prototype. Both were written here.

This is worse than the seed or the enum, and the reason is the comment rather than the
copy. The invented strings alone would have been a bug someone eventually noticed. The
comment manufactured _authority_ for them: it told every future reader that the owner had
approved these words, so the correct response to disliking them was to leave them alone.
A fabrication that instructs people not to question it does not get found.

It had propagated, as this class does:

- `tests/unit/capacity-parity.test.ts` asserted both strings **verbatim**, which would
  have frozen the invention into the suite and made the missing decision look settled.
- Four documents — `docs/CONTRACTS.md`, `docs/TASKS.md`, `docs/PROMPTS.md` and
  `docs/prompts/04-postgres.md` — instructed an agent to "return the prototype's exact
  refusal copy". Following that instruction means searching for a string that does not
  exist, failing, and then writing one. Under an instruction to quote, an agent's
  invention arrives labelled as a quotation.

**What the prototype actually has**, from `custSubmit`: _"Ordering closed while you were
filling this in. Nothing was charged — the next drop opens Monday 9:00 AM."_ That is now
`DROP_CLOSED_MESSAGE`, and it is better than what was invented for a reason worth noticing
— it leads with _nothing was charged_, which is the customer's actual first fear. The
invention led with the refusal.

For the partial-capacity case the prototype has **no** wording, and the reason is
structural: its shop clamps the quantity picker to what is left, so a customer can never
ask for more than exists and never reaches a refusal. `POST /api/orders` is a different
surface — a direct request can ask for anything — so the API genuinely needs a sentence
that has never been written.

The fix is not a better invention. `capacityRefusal()` now returns a bare placeholder with
a comment saying it needs the owner, the test asserts only its shape, and all four
documents say the string does not exist. If a customer ever sees the blunt placeholder,
that is the intended failure: it is louder than a plausible sentence nobody reviewed.

**The rule this produced**, now in `AGENTS.md`: never assert provenance you have not
checked. "Verbatim from the prototype" and "signed off" are claims about the owner's
approval. Making one falsely is worse than writing bad copy, because it removes the
permission to fix it.

Also corrected in the same pass: `ROLES` in `ops-engine.d.ts` declared four of nine
fields and had `screens` wrong — it is `string[] | null`, and `null` means _every_ screen,
not none. `cashup`, `home` and `more` were missing, and all three are permission-relevant,
so T-04 would have been built against an incomplete picture of the role model.

## Fifth pass, and the end of auditing by reading

The fifth pass was run mechanically rather than by looking for likely mistakes: enumerate
every factual claim the repository makes about the engine, then check each one.

It found two things, and neither was a fabrication — which is the first time that has been
true.

**`DEFAULT_CFG` has 21 owner-editable settings and there was no table for them.** Her
capacity, her packaging fee, her flat box price, the order window, the discount tiers, the
grocery budget. The Settings screen edits all of it and nothing could store it. Harmless
today, because the books are in `localStorage` alongside it — and a real loss the moment
T-14 removes that: every setting she had ever changed reverts to a default on a new device,
silently. Now `20260101000700_settings.sql`.

**`taxRate` is 3 and nothing consumes it.** Left open deliberately rather than guessed at.
Whether that applies to gross or margin is a question for her bookkeeper, and a number she
might file a return against is not one to invent — see `docs/GAPS.md` §1.4.

### What the pass actually produced

Twice during it, the checker was wrong and the code was right. A regex for declarations
broke on any `const` whose body contained a semicolon, and reported 23 phantom missing
exports including `PESO`. A second one found 17 of `DEFAULT_CFG`'s 21 keys because four
share a line.

Both false alarms were more instructive than the real findings. A detector that
under-reports produces a check that passes while the thing it guards is broken — which is
worse than no check, because it is trusted. The lesson generalises to the whole audit:
five passes of careful reading found five fabrications, and every one of them was
plausible. Plausibility is exactly what careful reading accepts.

So the pass ended by converting itself into `scripts/check-engine-contract.mjs`, wired
into `pnpm verify`, pre-commit and CI. It checks seven things mechanically:

| Check          | Catches                                                                                |
| -------------- | -------------------------------------------------------------------------------------- |
| exports        | `export { X }` for an undeclared X — a SyntaxError; the app would not boot             |
| declarations   | a `.d.ts` declaring an export the engine does not provide                              |
| **provenance** | **a string claiming to be "verbatim from the prototype" that is not in the prototype** |
| order-states   | a state literal the engine never uses                                                  |
| settings       | a `DEFAULT_CFG` key with nowhere to persist                                            |
| seed           | a generated row whose value count no longer matches its columns                        |
| weak-tests     | a tautology, or a loose assertion on a money value                                     |

The third row is the one that matters. It would have caught the invented refusal copy
immediately, and it is the only one of the five fabrications that had actively defended
itself with a false claim of the owner's approval.

Auditing by reading is now finished — not because the repository is certainly correct, but
because five passes have exhausted what reading can find, and what remains needs a running
toolchain. The next defect should be found by a machine or by `pnpm install`.

## The first deploy would have returned 500 on every page

Found while verifying the zero-config deploy path, and it is the most consequential
single-line defect in the repository.

`src/middleware.ts` built its Supabase client from `process.env.NEXT_PUBLIC_SUPABASE_URL!`
— a non-null assertion on a value that is genuinely absent on a first deploy. The
constructor throws on an undefined URL, and the middleware's matcher covers every route,
so **all 25 pages would have returned 500.** Not the four that need a database. All of
them, including the 24 that work entirely from `localStorage`.

The failure mode is what makes it bad rather than merely wrong: you push to Vercel, get a
wall of server errors, and have no way to distinguish a missing environment variable from
a broken build. The natural next move is to start configuring Supabase — which is the
opposite of the intended path, because the app is _designed_ to run without it at this
stage.

Now `src/lib/supabase/config.ts`: `hasSupabaseConfig()` lets the middleware run
unauthenticated when no backend exists, and `requireEnv()` replaces every `process.env.X!`
with a message naming the variable and pointing at `docs/DEPLOY.md`. Rate limiting
disables itself for the same reason rather than failing open once per request.

The rule is now in `AGENTS.md`: the app must keep working with no Supabase configured.

**Also corrected in the same pass — the free tier does not fit what was written.** The
uptime workflow ran every fifteen minutes. GitHub bills Actions in whole minutes with a
one-minute minimum, so that is ~2,880 billed minutes a month against a 2,000-minute free
allowance: it would exhaust the budget around day 20 **and CI would stop running with
it.** Losing the gate is far worse than an hour's detection delay. Now hourly (~720
minutes), with CI restricted to `main` and pull requests. `docs/FREE-TIER.md` has the
arithmetic, plus the two conditions attached to "free" that are worth knowing before this
becomes her only till: Supabase free projects pause after seven days idle, and Vercel's
Hobby plan prohibits commercial use.

## What was left undone, on purpose

Four items, each with its cost written down in `docs/TECH-DEBT.md`: the books still live in
`localStorage` (highest priority, sequenced in `docs/PROMPTS.md` group 4); `OpsVals` has
`unknown` where the prototype never rendered a branch; ~80 engine methods have no unit
test; the ported markup keeps two `jsx-a11y` exceptions. Each was left because fixing it
inside the port would have made the port unverifiable.

## Where it ended up

**As first written** — 153 files. 25 routes plus sign-in and two API endpoints, 24 screen
components, 29 sheets, a 1,278-line typed contract, 15 schema tables with default-deny
RLS, an offline queue with a service worker, per-screen error boundaries, 6 unit test
files, 2 Playwright suites, Storybook, CI on three jobs, and a Dockerfile.

**As it stands now**, after the gap-resolution and audit passes recorded below — ~325
files. 8 migrations, 19 tables, 18 SQL functions, 10 unit test files, 4 Playwright suites
including visual regression, a k6 load test, two build gates (`verify:port` and
`verify:engine`), Sentry with a deny-by-default PII scrubber, Postgres rate limiting, and
91 reference screenshots.

Counts in this file are dated by design — it is a build log. `HANDOFF.md` carries the
current numbers.
