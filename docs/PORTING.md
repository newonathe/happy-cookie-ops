# How the prototype became this codebase

> **Historical context (T-task era, before the 2026-09-08 master plan):** where this page conflicts with [MASTER-PLAN.md](../MASTER-PLAN.md), [docs/state/current.md](../docs/state/current.md) or the [decision register](../docs/state/decision-register.md), those win. Its protection rules still apply unless they say otherwise.

The prototype was one 6,929-line file: a 2,827-line template, a 4,100-line logic class,
and no build step. This document records exactly how each part crossed over, so you can
tell a port artefact from a decision.

## The four layers

| Prototype                   | Here                                     | Method                                         |
| --------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Logic class (4,100 lines)   | `src/store/engine/ops-engine.js`         | Copied verbatim, four marked edits             |
| Template (2,827 lines)      | `app-frame.tsx` + 24 screens + 29 sheets | Mechanical translation, rules below            |
| `renderVals()` return shape | `src/view-models/vals.ts`                | Types derived from every read in the template  |
| `<helmet>` CSS              | `src/app/globals.css`                    | Base layer copied; tokens lifted into `@theme` |

## The four edits to the engine

Everything else in `ops-engine.js` is byte-identical to the prototype. Each edit carries
a comment in the file:

1. **`RES()`** resolved assets through the prototype runtime's resource map. It now
   resolves to `/…`, because the same files are served from `public/assets`.
2. **`STORES`** touched `window` at module scope. It returns an empty list on the server.
3. **State restore** moved from the `state =` field initialiser into `componentDidMount`.
   Reading `localStorage` during the first render makes the server and client trees
   disagree, and React 19 does not forgive that. The engine's own
   `afterRestore()` hook holds what the prototype ran on mount.
4. **Base class** `DCLogic` → `React.Component`. Same lifecycle, same `setState`.

The `renderVals()` contract is untouched, which is why the translated markup works
without adaptation.

## How the markup was translated

The template was parsed as XML and walked once. The rules were:

| Template                                       | Result                                                    |
| ---------------------------------------------- | --------------------------------------------------------- |
| `{{ a.b }}` in text                            | `{a.b}`                                                   |
| `{{ x }}` as a whole attribute                 | `{x}` — the raw value, so handlers stay functions         |
| `{{ x }}` inside a string attribute            | a template literal                                        |
| `style="…"` (static)                           | a React style object, written out property by property    |
| `style="…{{ x }}…"` (dynamic)                  | `style={s(`…`)}` — see `src/lib/css.ts`                   |
| `style-hover` / `style-active` / `style-focus` | `<Pressable hoverStyle activeStyle focusStyle>`           |
| `<sc-if value="{{ c }}">`                      | `{c ? (<>…</>) : null}`                                   |
| `<sc-for list="{{ xs }}" as="x">`              | `{(xs ?? []).map((x, $index) => …)}`                      |
| `hint-*` attributes                            | dropped — they only mattered while the prototype streamed |
| `src="assets/…"`                               | `src="/assets/…"`                                         |

Two structural decisions were taken during the walk:

- **Every `<sc-if value="{{ screens.x }}">` became its own file.** One 2,800-line
  component would be unreviewable, and each screen is independently testable this way.
  The same was done for the 29 `sheet.isX` branches.
- **The values are passed as one `v` object, not 40 props.** Each screen takes
  `{ v }: { v: OpsVals }` and destructures what it reads on the first line, so a screen's
  dependencies are visible without reading its markup. A context read per screen would
  have been prettier and would have made every screen re-render on every keystroke.

## Why the inline styles stayed

Converting ~1,400 elements' worth of style objects into utility classes would have meant
making a judgement call per declaration, on a design that was already signed off. The
tokens in `@theme` capture the _system_ — the palette, the radii, the two eases — so new
UI has somewhere to come from. The ported screens keep their literals. That trade is the
single biggest reason this port is trustworthy.

## Re-applying a prototype change

The translation was a one-off; the files here are now the source of truth. If the
prototype changes:

1. find the corresponding screen or sheet file (the name matches the screen key —
   `screens.bake` → `bake-plan.tsx`);
2. apply the same change by hand using the table above;
3. if `renderVals()` gained a field, add it to `OpsVals`;
4. run `pnpm verify && pnpm test:e2e`.

Do not regenerate the whole tree. The hand edits since the port — `Pressable`,
the split files, `RouteSync`, `OfflineBridge` — would be lost.

## What was deliberately not ported

- The prototype's **simulated sync** (a `setTimeout` that failed one sale on purpose, so
  the owner could see a partial sync). `OpsRuntime` replaces it with the real queue and
  keeps the sentences.
- The prototype's **device harness** (phone/tablet frame, role picker, width slider) is
  still in `app-frame.tsx` and still useful for review. Hide it in production with
  `NEXT_PUBLIC_HARNESS=0`.
