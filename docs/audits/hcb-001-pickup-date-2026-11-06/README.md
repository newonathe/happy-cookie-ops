# HCB-001 evidence and backlog reproductions (6 November 2026)

**Evidence branch only. Do not merge.** Screenshots and facts that support:

- the HCB-001 pickup-date fix on `fix/hcb-001-pickup-date-review-20261106`;
- the "live at HEAD" reproductions cited in the remediation backlog (`docs/audits/remediation-backlog-2026-11-06.md` on `docs/hcb-remediation-backlog-20261106`).

Everything is the actual application tree on fictional data with a simulated Supabase client. No hosted system was read or written. RLS and SQL rules are not exercised.

## Environment

| Item              | Value                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Before            | `c84d23d` (`codex/cloud-full-goal-20261106`)                                                              |
| After             | `26ac1e4` (`fix/hcb-001-pickup-date-review-20261106`, the fix cherry-picked from `1ab9bc8`)               |
| Host              | `harness/serve.cjs`: the repository's `tools/owner-preview` Vite host, with the checkout passed as `REPO` |
| Fixture           | `harness/entry.tsx`: a copy of `tools/owner-preview/entry.tsx` with three changes (below)                 |
| Browser           | Playwright 1.63.0 Chromium, headless, scale factor 1, every request outside 127.0.0.1 blocked             |
| Clock             | Tuesday 10 November 2026, 10:00 Asia/Manila (`page.clock.install`)                                        |
| Client time zones | `Asia/Manila` and `America/Los_Angeles` (`timezoneId`)                                                    |
| Widths            | 320, 390, 768, 1440 CSS px (Los Angeles: 390)                                                             |
| Images            | WebP, quality 82, converted from the PNG captures                                                         |

Changes in `harness/entry.tsx` against `tools/owner-preview/entry.tsx`:

1. The staff orders get fixed pickups:
   - HC-1101: 2026-11-11 at 10:00
   - HC-1102: 2026-11-14 at 14:30
   - HC-1103: no date and no time
   - HC-1104: 2026-02-30 at 25:99 (invalid)
   - HC-1105: 2026-11-11, campus

   The default drop schedule for this clock is Monday 16 November, so it matches none of them.

2. Failure switches `qaOrdersFail`, `qaFlavoursFail` and `qaFlavoursMalformed`, used only by `repro-head.cjs`.
3. Fixture flavour prices are ₱5 below the engine's built-in prices, so a built-in price on screen is recognisable (HCB-003).

## HCB-001: before and after

`hcb-001/<before|after>-<zone>/`:

| File                         | What it shows                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `orders-<width>.webp`        | Owner Orders list                                                                                 |
| `order-HC-1101-<width>.webp` | Order detail for the audit's evidence case                                                        |
| `order-HC-110[2-5]-390.webp` | After only: the other saved, missing, invalid and campus cases                                    |
| `facts.json`                 | List and detail pickup text for every order, first load and reload, overflow, writes, page errors |

Result: before, every order reads "Mon 16" / "Monday 16 Nov · 9 AM – 5 PM" in both zones. After:

| Order            | Saved pickup      | Shown                                                                                                                      |
| ---------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| HC-1101          | 11 Nov, 10:00     | Wed, Nov 11 · 10:00 AM                                                                                                     |
| HC-1102          | 14 Nov, 14:30     | Sat, Nov 14 · 2:30 PM                                                                                                      |
| HC-1105          | 11 Nov, campus    | Wed, Nov 11 · Campus pickup                                                                                                |
| HC-1103, HC-1104 | missing / invalid | Pickup date not saved (list); the order page adds "Ask the customer which day they will collect before you plan the bake." |

The after results are identical in both zones and after reload. No run had overflow, writes or page errors.

## Backlog reproductions at `c84d23d`

`backlog-reproductions/head-c84d23d*/` (`repro-head.cjs`, 390 and 1440 px):

| Scenario            | Backlog ID | Result at `c84d23d`                                  |
| ------------------- | ---------- | ---------------------------------------------------- |
| `pickup`            | HCB-001    | every order shows Monday 16 Nov                      |
| `ordersFail`        | HCB-002    | "No orders match this filter" with no failure notice |
| `flavoursFail`      | HCB-003    | built-in ₱130 prices, plus Edit and Hide             |
| `flavoursMalformed` | HCB-004    | start-up stops after `get_flavours`                  |
| `helperHome`        | HCB-010    | Home blank                                           |
| `rejectFirstPress`  | HCB-007    | reject sent with no confirmation                     |

## Reproduce

Commands, from a checkout of the branch under test, with dependencies installed:

```bash
REPO=$(pwd) PREVIEW_PORT=4190 node <this folder>/harness/serve.cjs
```

```bash
REPO=$(pwd) PREVIEW_PORT=4190 node <this folder>/harness/capture.cjs <out> Asia/Manila
```

The harness files must sit beside each other in one folder, outside the repository. `entry.tsx.txt` and `demo-records.ts.txt` are stored with a `.txt` suffix so the repository's typecheck ignores them. Copy them out and drop the suffix before running.
