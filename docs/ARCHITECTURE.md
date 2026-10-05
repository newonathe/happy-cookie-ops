# Architecture

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../MASTER-PLAN.md), [docs/state/current.md](../docs/state/current.md) or the [decision register](../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

## The shape, in one paragraph

One React tree, mounted by every route, holding one stateful engine. The engine owns all
domain logic and produces a plain object of render values; the UI is a pure function of
that object. Routes exist so URLs work; they do not own state. Durability is layered:
engine state persists to `localStorage` (as the prototype did), bazaar sales additionally
persist to IndexedDB and sync to Postgres, and the rest of the books will move to Postgres
next (`docs/TECH-DEBT.md`, item 1).

```
/orders (route)  ──►  OpsApp
                        ├── OpsRuntime            engine + real bazaar sync
                        │     └── renderVals() ──► OpsVals ──► AppFrame
                        │                                        ├── 24 screens
                        │                                        └── 29 sheets
                        ├── RouteSync              URL  ⇄  engine.state.screen
                        └── OfflineBridge          sales ─► IndexedDB ─► /api/sync
```

## Why one tree and not one route per screen

The screens are not pages. The dock switches between them mid-task with a sheet open and
a draft order half-typed; every one of them reads the same books. A real route transition
per screen would remount the tree and lose that state, and would have meant lifting all
84 keys of engine state into a store built for serialisation. Keeping one client tree and
syncing the URL with `history.replaceState` gives deep links, a working back button and a
bookmarkable phone, at the cost of no server rendering of screen content — which is
correct here, since the content is the owner's private books.

## Why the engine is still a class component

Because it was one, and it worked. A 4,100-line class with 90 methods and one `setState`
discipline is not improved by being sprayed across hooks; it is only made diffable
against the prototype by staying as it is. React class components are not deprecated, the
lifecycle it uses is not legacy, and `OpsRuntime` shows the extension point: subclass,
override the method, keep the copy.

## The contract

`src/view-models/vals.ts` is the whole interface between logic and UI. Every field is
something `renderVals()` returns and some screen reads. It is large on purpose: the
alternative is 53 components reaching into engine state directly, and no way to tell what
a change breaks. TypeScript strict plus this file means a removed field is a build error,
not a blank panel.

## Rendering and performance

`renderVals()` runs on every engine `setState`, and every screen re-renders. On the
target device (a mid-range Android phone) this is well under a frame: the tree is small,
the values are plain, and there is no virtual list anywhere. Memoising was measured as
unnecessary and would have added a dependency-array bug surface across 53 files. If a
future screen renders hundreds of rows, memoise that screen — not the frame.

## Security posture

- Staff screens sit behind Supabase auth, enforced in `src/middleware.ts`. The four
  customer screens (`shop`, `checkout`, `status`, `lookup`) are public by design.
- Postgres is default-deny. Roles map to the prototype's three roles: `owner` sees money,
  `helper` sees production and stock, `support` sees orders. Policies are in
  `supabase/migrations/20260101000000_init.sql` and explained in `docs/DATA.md`.
- The ledger is append-only, even for the owner. Corrections are new rows.
- A customer order can be looked up only with the order id _and_ the phone number, via a
  `security definer` function, so order numbers cannot be walked.
- The service-role key is server-only and is never referenced from a `'use client'` file.

## Progressive web app

`public/manifest.webmanifest` makes it installable; `public/sw.js` caches the shell and
the product photography, and retries queued sales through Background Sync when the tab is
closed. The service worker deliberately caches no order or ledger response — only the
queue it is trying to send.

## Failure handling

Each screen renders inside a `ScreenBoundary`, keyed on the screen. A screen that throws
is replaced in place with a recovery panel while the dock, the header and engine state
stay alive; "Try again" re-mounts that screen rather than reloading the page, so a
half-typed order survives. `src/app/error.tsx` catches the case where the tree itself
fails to mount. `GET /api/health` reports database reachability for the container health
check.

## What is not here yet

Server-side reads. Every screen still renders from engine state, and the Supabase layer
covers auth and sale intake only. `docs/PROMPTS.md` sequences the migration table by
table, so the app keeps working throughout.
