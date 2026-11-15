# Happy Cookie Ops: actual-app visual capture, November 2026

**Everything in this folder is the ACTUAL application, on fictional data, against a simulated server.** There are no reference mockups or proposed designs here. Reference view names appear only as a mapping in `manifest.json`.

This folder exists so a reader such as ChatGPT can inspect the app as built and write screen-by-screen remediation. It does not change the app, and it does not state what the app should become.

## Where to start

| You want                           | Open                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| Browse screens on GitHub           | [gallery/README.md](gallery/README.md), then a section, then a view                |
| Follow a whole journey             | [flows](gallery/README.md#journeys), one page per journey                          |
| What looked wrong                  | [findings.md](findings.md), observations only                                      |
| Every view, control and state      | [manifest.json](manifest.json)                                                     |
| What was captured, failed or not   | [coverage.csv](coverage.csv)                                                       |
| Exact sizes, styles and contrast   | `measurements/<section>/<view>/<state>/<viewport>.json`                            |
| What each control did when pressed | [measurements/control-outcomes-1440.json](measurements/control-outcomes-1440.json) |
| Browse offline with lazy loading   | Clone the branch and open `gallery/index.html`                                     |

GitHub shows `.html` files as source code, so use the Markdown gallery on GitHub. Images are WebP at scale factor 1, quality 82. A raw image address is:

`https://raw.githubusercontent.com/newonathe/happy-cookie-ops/audit/actual-app-visual-capture-2026-11/docs/audits/visual-capture-2026-11/<path in the manifest>`

## Source

| Item                                    | Value                                                                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Captured commit**                     | `b54239c1258f580e5d14ee0cd383e82bff753450` on `codex/refined-workflows`                                                                                           |
| Development branch when published       | `93135433fd88def7cbc5a05c0d22de3b17cfe764`. Between the two, the only change under `src` is the generated types file, so no screen, store or browser rule changed |
| Deployed trial branch, **not captured** | `agent/codex/MP-04-g1-feasibility` at `ed64a51570b6b4f918eb575e399ee22164d683ae`                                                                                  |
| Difference to the deployed trial        | Under `src`, 13 files (410 insertions, 67 deletions), mainly dough preparation and recovery. The trial does not yet have those screens                            |
| Not included                            | Uncommitted work in the shared checkout, and the dough-only baking SQL rule (the server here is simulated)                                                        |

## Environment

- **App:** a Vite production build of the real application tree (`OpsApp`, `LiveGate`, `RouteSync`, `OfflineBridge`, every live screen and the engine) with `NEXT_PUBLIC_APP_MODE=live`. The tree mounts the way `src/app/*/page.tsx` mounts it. Next.js itself is not the host.
- **Server:** [harness/fake-supabase.js](harness/fake-supabase.js) replaces only the Supabase browser client. It keeps records in memory and answers in the shapes the app's parsers require, and it can answer with failures on request. **RLS and SQL rules are not exercised.**
- **Data:** [harness/fixtures.js](harness/fixtures.js). All people, phones, references, suppliers, events, prices and costs are invented. Product names and cookie photos are the ones already public in this repository. QR images are a generated "SAMPLE QR".
- **Browser:** Playwright 1.63.0 Chromium headless, plus one Home and one till state in Playwright WebKit on Windows. **Neither is Safari or an iPhone.**
- **Determinism:** clock fixed at Tuesday 10 November 2026, 10:00 Manila, time zone Asia/Manila, scale factor 1, fonts and images awaited, and each action waits until server calls and page text stop changing. Service workers are blocked. Every request outside 127.0.0.1 is blocked.
- **How states were reached:** real clicks wherever possible. `stateSource` in the manifest says which: `ui-driven`, `rpc-fixture`, or `setState-injection` (used twice: a sold-out tile and an unknown order id).

## Totals

| Measure                                     | Count                                                                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Views (real screens, child views, overlays) | 96                                                                                                                                                                           |
| Reference views mapped                      | 85 of 85: 79 with captures, 4 with no page in the app, 1 not reached, 1 not applicable (a mockup tool). Captured means screens exist; it does not mean they match the mockup |
| State scenarios                             | 453 (interaction 187, failure 108, data 69, business 66, role 12, accessibility 7, responsive 4)                                                                             |
| Viewport captures of states                 | 1107: 1006 distinct, 97 pixel-identical to another state (stored once and declared in the manifest, including redirects to another view), 4 unverified                       |
| Journeys                                    | 15, each at 390 and 1440 px, with 276 saved steps                                                                                                                            |
| Images in this folder                       | 2,020                                                                                                                                                                        |
| Controls pressed by the explorer at 1440 px | 5,443 across 286 finished views, with fields empty and filled                                                                                                                |

A count of states is not a claim that every state was tested. See "What this does not prove".

## Viewports

Primary screens: 320×700, 390×844, 768×1024, 1024×768, 1440×900 and 1920×1080. Subordinate views: 390, 768 and 1440, or 390 and 1440 for states. Height-constrained: 844×390 and 1280×600 for Home and the till. A full-page image exists where content runs below the fold (`.full.webp`).

In a full-page image, sticky bars are drawn once at their position for the scroll offset, so they can appear mid-page. Use the viewport image to judge what a person sees.

## Folder layout

```text
README.md            this page
manifest.json        views, states, flows, reference map, limits
coverage.csv         one row per state and viewport, journey, reference view and limit
findings.md          observed issues and measured layout results
gallery/             Markdown and HTML galleries, contact sheets
screenshots/         <section>/<view>/<state>/<viewport>.webp and .full.webp
flows/               <journey>/README.md and numbered steps
measurements/        bounding boxes, computed styles, audits, control outcomes
harness/             everything needed to reproduce this capture
```

## Reproduce

```bash
node docs/audits/visual-capture-2026-11/harness/serve.cjs
```

```bash
node docs/audits/visual-capture-2026-11/harness/capture.mjs --workers=5
```

```bash
node docs/audits/visual-capture-2026-11/harness/build-report.mjs
```

Use Node 24.20.0 and pnpm 9.12.3 from `docs/state/toolchain.md`. `capture.mjs` skips finished shots, so a rerun resumes. `harness/verify-publish.mjs` checks paths, images, links, the source pin and scans for real data. `harness/crawl.mjs` is the explorer that produced the control outcomes.

## Safety

No hosted read or write, no migration, no hosted demo records, no deployment and no merge. `localhost:3000` and the trial site were not opened. Authorization, validation, RLS and business rules were not weakened: application source is unchanged, and the harness lives only in this folder. The protected prototype, the design system and the visual baselines are untouched.

## What this does not prove

- **Not device testing.** No physical iPhone, Safari, real touch, on-screen keyboard or safe-area inset.
- **Not server testing.** The simulated server decides what is refused. An entry about a server answer shows how the app responds to that answer, not that the real server sends it. This capture does not explain why real bazaar sales stay stuck.
- **Not hosted data, and not the deployed trial build.**
- **The explorer stopped at its limit of 300 views,** with 286 finished. Views in the same structural family were capped at two, so not every row of every list was opened. The explorer ran on a build whose fixtures differ slightly from the final capture build; control names are the same.
- **Roles:** the real gate decides from a simulated profile row. Helper and support views are captured from direct addresses, and were not explored control by control.
- **Not reached:** the rows marked `limit` in `coverage.csv`, including offline reload through the service worker, idle sign-out after hours (the fixed clock does not advance timers), two live tabs or devices, downloaded file contents and photo upload.
- **Mid-session expiry** did not visibly end the session in this harness. See finding 13.
- **Owner acceptance** is a separate step that this capture cannot stand in for.
