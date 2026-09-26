# Known compromises

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../MASTER-PLAN.md), [docs/state/current.md](../docs/state/current.md) or the [decision register](../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

Each item says what it is, why it was left, and what it costs.

## 1. The books still live in `localStorage`

**What.** Orders, the ledger, stock, drops and settings are all in one `localStorage`
object, as in the prototype. Postgres currently holds only auth, the catalogue and
synced bazaar sales.

**Why.** Migrating 84 keys of state to server reads in the same pass as the port would
have meant changing behaviour and structure at once, with no way to tell which change
broke what. The port is verifiable against the prototype precisely because it did not.

**Cost.** One device. Clearing site data loses the year's books. Two people cannot use
the app at once. **This is the highest-priority item** — `docs/PROMPTS.md` group 4
sequences it table by table, keeping the engine's shape and swapping its persistence.

## 2. `OpsVals` is wide and partly `unknown`

**What.** `src/view-models/vals.ts` types every field the template reads, but branches the
prototype never rendered with data resolve to `unknown`.

**Why.** The types were derived from actual reads. Guessing the rest would have produced
types that lie.

**Cost.** A handful of casts in future code. Narrow a field when you touch the engine
code that produces it.

## 3. The engine is not unit-tested method by method

**What.** Tests cover money formatting, screen keys, order maths, the drop cycle and the
offline queue. The other ~80 methods are covered only by the 25-route render test.

**Why.** Time, and the prototype was the acceptance test.

**Cost.** A regression in, say, spoilage or the stock-count reconciliation would not be
caught by CI. Add tests as you touch each rule; `docs/reference/spec/03-business-rules.md`
lists the expected behaviour for all of them.

## 4. No server rendering of screen content

**What.** Every route ships the same client tree; the HTML is a shell.

**Why.** The content is the owner's private books, and one tree is what keeps mid-task
state alive across the dock (`docs/ARCHITECTURE.md`).

**Cost.** A first-paint delay of one bundle on a cold cache. Acceptable for an installed
app used dozens of times a day; revisit only if the customer-facing `/shop` needs SEO.

## 5. Accessibility is at the prototype's level

**What.** `jsx-a11y` runs, but two rules are relaxed for the ported markup: the prototype
used `<div onClick>` in a few places and its own `<img>` tags.

**Why.** Fixing them means changing ported markup, which needed a separate, reviewable
pass rather than being smuggled into the port.

**Cost.** Some controls are not keyboard-reachable. The app is used by touch, so this is
low-severity but not zero. `docs/PROMPTS.md` group 7 is the audit.

## 6. The device harness ships to production

**What.** `app-frame.tsx` still contains the phone/tablet frame, role switcher and width
slider from the prototype.

**Why.** The owner uses it to check the customer screens, and removing it meant editing
ported markup.

**Cost.** Dead weight in the bundle. `NEXT_PUBLIC_HARNESS=0` starves it — `OpsRuntime`
stops producing `devices`, `roles` and `showPhoneWidths`, so the ported branches render
nothing without the markup being edited. The elements are still in the bundle, and the
real gate is RLS, not the switcher.
