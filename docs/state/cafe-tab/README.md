# Café tab: the held-back registration step (waits for Ethan's approval)

The Café page is built and reachable from Sell → Orders (the "Café sales" button). Giving it its own tab needs one protected edit, so it
is held here as a tested patch. **Do not apply until Ethan has approved the exception below.** When applied, delete this folder.

## What needs approval
One word in the engine's own screen list, `src/store/engine/ops-engine.js` line 171 (`const SCREENS`): `'cafe'` after `'bazaar'`.
`tests/unit/screens.test.ts` requires `src/lib/screens.ts` and the engine list to be the same, so the key cannot be added on one side.
Nothing else protected changes. `scripts/port-baseline.json` does not fingerprint the engine, so `check-port-integrity` passes without
`--update` (only `scripts/validate-g0.py` needs one reversal line, included).

## Two patches (made against the branch that adds this folder; both checked in a scratch copy)
1. `engine-screens.patch`: the one engine word, plus the `CAFE_SCREEN_REVERSALS` entry in `scripts/validate-g0.py`.
2. `register-tab.patch`: everything else (no protected path): `'cafe'` in `src/lib/screens.ts`; the tab and place in
   `src/lib/nav/function-map.ts` (after Bazaar); `src/components/live/cafe/{cafe-screen.tsx,register.ts}` and `register-all.ts`; the
   `/cafe` route (`src/app/cafe/page.tsx`); `cafe: () => null` for the demo in `owner-workspace.tsx` (no ported screen); `cafe` in
   `vals.ts`; a cup icon for the dock in `ops-runtime.tsx`; the button and swap removed from Sell → Orders; and the count tests that say
   six tabs / 25 routes (function-map, dock, owner-workspace, return-path, live-register-all, live-state).

```bash
git apply docs/state/cafe-tab/engine-screens.patch
git apply docs/state/cafe-tab/register-tab.patch
pnpm verify
```

Checked in the scratch copy: `tsc`, `tsconfig.e2e.json`, `eslint`, `verify:engine`, `verify:port`, `validate-g0.py` (1233 checks, 0
failures) and the 8 test files the change touches (168 tests). **Not checked: a browser** (seven tabs on the 390 px dock, `/cafe`
opening the page). Do that before merging.

## Paste into docs/state/protected-exception.md when approved
```
# Café screen key: engine exception — APPROVED <date>, applied <date>

Ethan (20 November 2026): the café sale log gets its own owner page, "not a bazaar mode". The page is a live-only screen with no ported
counterpart, so it needs a screen key. The one engine edit: `'cafe'` inserted after `'bazaar'` in `const SCREENS`
(src/store/engine/ops-engine.js). No behaviour changes: the engine only uses the list to know which keys exist
(`screens: SCREENS.reduce(...)`); nothing in the demo draws it. Registered as an exact reversal (`CAFE_SCREEN_REVERSALS`) in
scripts/validate-g0.py. Reversal: delete the word and the reversal. Evidence: tests/unit/screens.test.ts, `pnpm verify`.
```
