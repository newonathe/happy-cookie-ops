# UX review — 5 October 2026

Status: **findings, proposals and decisions; nothing here is implemented yet.** Ethan asked for this
review because the app feels "all over the place". Each proposal below needs his yes
before any work, and the ones marked _protected_ also need the exception process in
[AGENTS.md](../../AGENTS.md), because they change ported screens, the shell or the engine.

## How it was done

The live-mode build was run locally against the local database, signed in as a throwaway
owner, and all 25 routes were captured at phone (390×844) and desktop (1440×900) widths
with headless Chromium. The committed prototype screenshots in
`tests/e2e/visual.spec.ts-snapshots/` were the reference. Local test data only; nothing was
changed on the trial site.

## Glass and transitions: not removed

Measured in the live build: the blur is active on the top bar (20px), the phone dock
(22px) and the Quick add sheet (28px), with the prototype's values, and the screen-change
and sheet animations run on every navigation.

Why it can look removed:

- At desktop width the app uses the sidebar layout. There is no floating dock, and the
  blurred top bar sits on a plain white page, so nothing shows through it.
- A device with "reduce motion" switched on gets no transitions, by design.

## What makes it feel messy

The live app matches the prototype, so most of this comes from the design, plus features
added to **All tools** one at a time since.

| #   | Finding                                                                                                                                                                                                                            | Where                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | The phone dock has nine small icons with no labels. Sales log and P&L use the same peso icon.                                                                                                                                      | every phone screen                 |
| 2   | Flavours, prices and recipes are spread over four entries: Products, Menu & flavours, Recipes, Recipe drafts. It is not obvious which one to open.                                                                                 | All tools                          |
| 3   | Home repeats the whole menu as a "Your business" grid under the dashboard. On a phone the page is 2.5 screens long.                                                                                                                | Home                               |
| 4   | Notifications and Home show four red system alerts (database backup, restore drill, data retention, keep-alive: "not yet recorded, activation pending"). They are set-up tasks for Ethan, not things Cine can act on while baking. | Home, Notifications, System health |
| 5   | The round Quick add button floats over content and covers buttons in lists, for example "Mark sold out" on Drops and the price on Products.                                                                                        | phone lists                        |
| 6   | Opening `/order` or `/batch` directly shows a title and an empty page.                                                                                                                                                             | Order, Production                  |
| 7   | The weekly count opens as a panel above the full inventory list, so two screens are stacked on one page.                                                                                                                           | Stocktake                          |
| 8   | P&L says "Profit, last four months" above a chart with one bar.                                                                                                                                                                    | P&L                                |
| 9   | The customer order-status page, opened without an order, shows empty controls under "We could not find that order".                                                                                                                | Status                             |
| 10  | Performance on a mid-range phone is slow: largest paint 5.8 to 9.4 s on GitHub's runner; the shop page is 1.63 MB.                                                                                                                 | all pages                          |

## Proposed first batch

Small changes that remove the most confusion without redesigning screens. Recommended
order:

1. **Group the four flavour and recipe entries** into one "Menu and recipes" block in All
   tools, with one-line descriptions that say what each is for. Live layer only; no
   protected file.
2. **Move the four system set-up alerts out of Cine's way** until backups are switched on:
   one "Backups are not set up yet" line addressed to Ethan in System health, and no red
   badges on Home or Notifications for them. Live layer only. This changes an F1 safety
   message, so it needs Ethan's explicit yes.
3. **Phone dock: five labelled destinations** (Home, Orders, Bake, Inventory, All tools),
   everything else through All tools, and a distinct icon for Sales log. _Protected_ (shell
   markup for labels; the item list can be set in the live layer).
4. **Empty Order and Production pages:** send a direct visit to the list it belongs to.
   Unprotected routing code.
5. **Glass on desktop,** only if wanted: let page content scroll under the top bar so its
   blur shows. _Protected_ (shell layout).

Not proposed now: redesigning Home, the Quick add button position, or the stocktake
layout. They are larger design changes and are better decided with Cine after her week.

## Decisions

Ethan, 5 October 2026, after reading the summary of this review: "do what u recommend for
the rest", adding that the UI and UX feel all over the place.

| Proposal | Decision                                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **Go.** Recommended, unprotected.                                                                                                                                           |
| 2        | **Go.** Ethan gave his explicit yes on 5 October ("yes to both"). Keep the facts visible to him in System health; remove the red alerts from Cine's Home and Notifications. |
| 3        | **Go in principle.** Recommended. The shell change is protected: show Ethan the exact before and after, then follow the exception process, before it reaches the trial.     |
| 4        | **Go.** Recommended, unprotected.                                                                                                                                           |
| 5        | **Not now.** Not recommended: a protected layout change for a subtle effect. Revisit with the larger design questions after Cine's week.                                    |

Timing, also decided on 5 October: **land these before Cine starts her week.** Her start
waits for them.

Nothing is implemented yet. The work is the first item of [next-goal.md](next-goal.md), in
a fresh session, with Docker visual evidence for every changed screen. Every green push
redeploys the trial.
