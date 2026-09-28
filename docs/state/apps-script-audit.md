# Apps Script audit: what Cine's sheet automation does, and where the app takes it over (2026-09-28)

Ethan sent Cine's Apps Script on 2026-09-28 as six files: `Code.gs`, `Formscheduler.gs`, `Enter.gs`, `Edit.gs`,
`Search.gs` and `Format.gs`. They are in `Appscript/` (untracked). This is an analysis and plan. It changes no code
and no protected file.

## Sources and limits

- **Read in full:** all six files.
- **Checked against:** the header rows and formulas (row 1–2 only; no customer or sale rows) of the local workbook
  copy `The Happy Cookie 2026 masterfile.xlsx`, and the protected engine (`dropCycle`, `DEFAULT_CFG`, `confirmDough`,
  `confirmReceive`, the settings schedule rows).
- **Not seen:** the live Google Sheet and the live form. The workbook is a copy, so a tab renamed since then would
  not show here.
- **Kept out of the repo on purpose:** the raw files hold the live form's ID and the business Gmail address. This
  document names neither.

## What the scripts do

| Group        | Files                                           | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Used by the business?                                                                                                                                              |
| ------------ | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inventory    | `Code.gs`                                       | A "🍪 Happy Cookie" menu with two sidebars and a dashboard sync. **Log Production:** pick a flavour, a batch count (0.5 steps) and a date. It copies that flavour's recipe lines × batches into `Inventory-Out`. **Log Restock:** ingredient, supplier, quantity, free-text unit, total cost and date go into `Inventory-In`, and unit cost = total ÷ quantity. **Sync:** runs on every open and adds any ingredient named in `Inventory-In` or `Ingredient Master` to the `Inventory System` dashboard, with formulas for bought, used, left, cost per unit, value, reorder level and status. | Yes. Every tab and column it uses exists in the workbook                                                                                                           |
| Order window | `Formscheduler.gs`                              | Time triggers (Asia/Manila) open the Google Form **Monday about 9:00** and close it **Sunday about 9:15**. The close trigger uses `nearMinute(15)`, and Apps Script fires within a window, so the times are approximate. Each run emails the business address.                                                                                                                                                                                                                                                                                                                                 | Yes: this is the weekly pre-order cycle                                                                                                                            |
| Recipe box   | `Enter.gs`, `Edit.gs`, `Search.gs`, `Format.gs` | A generic cookbook template: a `RecipeBox` tab with cookbook, page number, meal type, tags, ingredients, notes and a 1–5 rating.                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **No sign of use.** The workbook has no `RecipeBox` tab, and the files call three helpers they do not define (`onlyUnique`, `notIn`, `Compare`). Template leftover |

**There is no order handling in any file:** no `onFormSubmit` and no response parsing. Form responses reach the
sheet through Google's native link (the `Sales (GForm)` and `Waitlist Form Responses` tabs). So there is no bridge
logic to preserve, which settles the open part of D3 (below).

## Checked against the workbook

- **Recipe columns match.** `Recipes` is Flavor | Ingredient Name | Qty per Batch | Unit | …, which is exactly
  what `COST_COL_*` reads (columns 1–4). The script's header comment describes an older costing layout (bulk price
  in column 3) and is stale, not a bug.
- **Stock-in and stock-out columns match** `IN_COL_*` and `OUT_COL_*`.
- **Bug: new dashboard rows ignore the reset date.** The existing `Inventory System` rows filter by `$L$2`, where
  K2 says "Reset Date" and L2 holds the date. The sync writes new rows' formulas against `$L$1`, which is empty
  (and its comments say K1). So an ingredient added by the sync counts every purchase and every use ever logged,
  while the rows above it count only since the reset. The two do not add up the same way.
- **Risk: units are free text and never checked.** The dashboard sums quantities by ingredient name only. The copy
  mixes spellings (`Recipes` and `Ingredient Master` say "grams", while the restock sidebar defaults to "g"). One
  restock typed in kg would silently wrong the stock left. The app keeps one unit per stock item.
- **Tab name case differs.** The script asks for `inventory-in`, and the workbook tab is `Inventory-In`. It
  evidently works on the live sheet, but confirm the live tab name before relying on it.
- **Two sources for unit cost.** The dashboard takes cost from `Ingredient Master` (bulk price ÷ bulk quantity).
  Each restock row computes its own unit cost, which the dashboard never reads. That matches decision DP-04 only
  loosely (cost counted when used, at what price?). MP-15/MP-16 must pick one rule.
- Low: the sidebars put flavour and ingredient names into their HTML unescaped. Only the sheet's own editors can
  set those names, so this is not a customer-facing risk.

## What the app already has, and where the rest lands

| Script behaviour                                                     | In the app now                                                                                                                                                         | Gap / where it lands                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Log production: recipe × batches out of stock                        | `confirmDough` takes each recipe line out of stock by dough ball (`mixRows`) and logs shortfalls. Local state only                                                     | Record on the database in **MP-17** (production). The sheet counts batches in 0.5 steps; the app counts dough balls (recipe yield per batch). Keep one of them as the unit Cine types                                                                                                                                                            |
| Log restock with supplier and cost                                   | `confirmReceive` records the quantity received, amount paid and a substitute supplier against a grocery-list line, and writes an Ingredients expense. Local state only | **MP-16** (stock movements and receipts). Check there that a purchase not on the grocery list has its own path                                                                                                                                                                                                                                   |
| Dashboard: bought − used since the reset date, reorder level, status | Stock on hand, reorder level (`level`), grocery list from shortfalls, stock take                                                                                       | **MP-16**: a movement ledger plus counts replaces "since the reset date". Cine types the opening count (her 2026-09-28 answer)                                                                                                                                                                                                                   |
| `Ingredient Master` unit costs and suppliers                         | Engine constants `INVENTORY` and `SUPPLIERS`                                                                                                                           | **MP-09 d** (recipes and suppliers, with versions)                                                                                                                                                                                                                                                                                               |
| `Recipes` (per-batch quantities by flavour name)                     | Engine `RECIPES` by flavour id, with `yield`                                                                                                                           | **MP-09 d**. The import maps flavour names to ids and ingredient names to stock items; unmatched names go to a review list, not a guess                                                                                                                                                                                                          |
| Weekly form open and close                                           | Order window settings (`openDow`/`openH`, `closeDow`/`closeH`, `extendH`), on the database since MP-09 b; the shop opens and closes by the clock, with no trigger      | **Covered; only the default differs.** Cine's form closes Sunday about 9:00; `DEFAULT_CFG` closes Thursday 21:00. Settings already has day rows ("Ordering opens/closes") and hour rows ("Opening/Closing hour"), all saved through `save_setting`, so she can set Monday 9:00 to Sunday 9:00 herself. Minutes are fixed at :00, which is enough |
| Open and close emails                                                | None                                                                                                                                                                   | DP-12 (2026-09-28): in-app alerts, no email for now. Retire with the form                                                                                                                                                                                                                                                                        |
| Recipe box                                                           | None                                                                                                                                                                   | Not needed                                                                                                                                                                                                                                                                                                                                       |

## Effect on the plan

- **D3 (order-form-audit.md): no longer blocked by the script.** Nothing in the script handles orders, so there is
  nothing to integrate or keep compatible with. The recommendation stands, designed from scratch: the app is the
  only source of the menu and options; if a Google Form stays at all, a new small script rebuilds its choices from
  the public menu and posts each response to one ingest RPC. It is still blocked on the live form's own field list
  (an export of the October form), and on whether Cine keeps a form at all now that the app replaces it at launch.
- **Retirement order:**
  - `Formscheduler.gs` goes when the app takes orders (MP-10). Until then it keeps working unchanged.
  - The production and restock sidebars go when MP-16 and MP-17 are live.
  - The sheet stays the record until each part goes live. No two-way sync: two writers for one stock number is the
    capacity-rule bug again.
- **One-time import** (MP-09 d, MP-16): from the workbook, not from the scripts. Ingredient Master (unit, bulk
  price, supplier), Recipes, and Suppliers. The logs are history, not opening stock, because Cine is recounting.

## Decisions (status 2026-09-28)

- **E1 · The raw script files: DONE (Ethan, 2026-09-28).** `Appscript/` is in `.gitignore`. This audit is the
  committed record.
- **E2 · Import route: re-checked against the workbook, the October chat list and the 115 walkthrough comments.**
  The recommendation stands, with these changes:
  - **Recipes need her confirmation per flavour.** Three versions exist (Recipes tab, Box costing tab, the October
    list). The newest is in cups, teaspoons and pieces. Menu names differ from sheet names.
  - **Eggs and oats are left out of stock.** They are free (comment 39).
  - **Units and duplicate names need normalizing.**
  - **Yields come from Costing Dashboard.**
  - **Nothing historical is imported** ("Let's start clean").
  - **The import runs once, at cutover.** A local script reads the workbook from outside the repo and shows a
    preview Cine confirms. Plan: [finish-plan.md](finish-plan.md) section 9, slices A3–A4.
- **E3 · Order window: re-checked.** Her real week is the form open Monday about 9:00 to Sunday about 9:15, with
  pickups Monday and Thursday before 5 pm and a campus slot 2:00–3:30 pm. Two problems:
  - **The August answer ("Mon 9 AM – Thu 9 PM") is out of date.**
  - **The engine's pickup rule doesn't fit.** It only knows "first Monday after close", which cannot express Thursday
    pickups. D2's pickup-date choice replaces it in B1–B2.
  - **Open:** which week a Thursday pickup counts toward for the 200 cap. Asked as C1, with default "per pickup week".
- **E4 · Recipe box scripts.** Ignore them: there is no `RecipeBox` tab in the workbook.
