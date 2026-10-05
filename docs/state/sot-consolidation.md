# Source-of-truth consolidation — audit and plan (5 October 2026)

Status: **audit done, nothing built or imported. Waiting for Ethan's yes on the decisions
in section 6.** On 5 October Ethan supplied Cine's updated workbook, her recipe document
and her flavour photos, named them the main source of truth, listed the features that must
be easy to reach, and said: consolidate everything and finish it **before** the trial
starts. This page is the one plan for that. It holds counts and decisions only; recipe
quantities, customer rows and contact details stay outside Git.

## 1. What was supplied

| Source                    | What it is                                                                                                                              | Kept                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Workbook                  | 17 sheets. SHA-256 `4d231891…ddc8ea`. A newer copy of the one imported on 4 October (`c32c12fd…`).                                      | In `docs/`, excluded from Git locally. Should move to the private folder. |
| Recipe document           | 13 flavours with prices: 7 as text (the October seven) and 6 as ingredient tables. No Apps Script code is in it, despite the file name. | Same.                                                                     |
| Photo folder              | 28 files, 561 MB: 15 finished PNGs, 9 layered Photoshop files, 1 zip of 5 raw photos.                                                   | Same.                                                                     |
| Cine's two sign-in emails | Recorded privately.                                                                                                                     | Not in Git.                                                               |

Private detail: `claude-20261005/sot-audit/sot-audit.json`.

## 2. What changed in the workbook since the 4 October import

| Sheet                                                                                                                | Change                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Ingredient Master (73 items)                                                                                         | One item's pack or price changed. No item added or removed.                                                                 |
| Recipes (23 flavours, 321 lines)                                                                                     | 17 lines new or changed, 33 gone. One flavour removed (Banana Bread CCC). Every line has a quantity in grams, mL or pieces. |
| Costing Dashboard (27 rows)                                                                                          | 5 rows changed. Double Chocolate Fudge yield is now 12, was 15.                                                             |
| Sales (781 rows)                                                                                                     | 31 more rows; last date 4 October, was 23 September. Earlier rows also recalculated. 16 rows have no amount.                |
| Sales (GForm) 60 rows, Loyal Customers 6                                                                             | 4 and 3 more rows.                                                                                                          |
| Inventory System, Inventory-In, Inventory-Out, Manual Check, Suppliers, Box costing, Bazaars, Waitlist, Cafe Partner | Unchanged.                                                                                                                  |

Still true: the manual count has no date, no item has a reorder level, the stock sheets end
in July, and the P&L sheets contain 9 broken formula cells and no expense entries.

## 3. Flavours: document, workbook, photos and the trial

The trial holds 26 flavours, 7 on the October menu. Only the six prototype flavours have a
picture, and those are the prototype's pictures.

| Flavour in the document | Price   | Workbook row and yield            | Finished photo          | In the trial                                    |
| ----------------------- | ------- | --------------------------------- | ----------------------- | ----------------------------------------------- |
| Double Chocolate Fudge  | 130     | Dark chocolate, 12                | Yes                     | On menu                                         |
| Happy Camper            | 140     | Smores, 13                        | Yes                     | On menu                                         |
| White Chocolate Biscoff | 145     | Biscoff, 19                       | Yes                     | On menu                                         |
| PB Miso                 | 80      | PB Miso, 11                       | Yes                     | On menu                                         |
| Ube Coconut Crinkle     | 110     | Same name, 9                      | Yes                     | On menu, no picture                             |
| Espresso Brownie        | 110     | Same name, 11                     | Yes                     | On menu, no picture                             |
| Apple Pie               | 155     | Same name, 14                     | Yes                     | On menu, no picture                             |
| Banana Oatmeal          | 120     | Banana oat, 14                    | Yes                     | Off menu, no picture                            |
| Gooey Nutella           | 125     | Nutella, 13                       | **None**                | Off menu, no picture                            |
| Cereal Milk             | 140     | Probably "Cornflake", 12: confirm | Yes                     | Off menu as "cornflake", no picture             |
| Snickerdoodle           | 100     | Same name, 12                     | Yes                     | Off menu, no picture                            |
| Nutella Churro          | **210** | Churro, 13, priced **200**        | Yes                     | Twice: "nutella churro" and "churro", both 200  |
| Red Velvet Cheesecake   | 150     | Red velvet, 9                     | **Photoshop file only** | Twice: "red velvet cheesecake" and "red velvet" |

Also in the photo folder with no flavour in the document: Banoffee Pie, Dubai Chocolate,
Matcha, Strawberry Biscoff Cheesecake (all four are workbook rows and trial flavours,
off menu) and Cinnamon Sugar (no flavour anywhere). The finished PNGs are 1 to 17 MB and
up to 4,284 by 5,712 pixels; the app's upload limit is 2 MB, so each must be resized.

## 4. Sheet by sheet: where it lives in the app

| Sheet                           | In the app                                   | State                                                                                              |
| ------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Ingredient Master               | Stock items                                  | 72 items imported 4 October. One price to update.                                                  |
| Suppliers                       | Suppliers & prices                           | 13 suppliers, 8 usable quotes imported. The rest held: packs or units do not match.                |
| Recipes                         | Recipes (versions, yields) and Recipe drafts | Only Apple Pie is entered as a measured recipe. 22 workbook recipes are not in the app.            |
| Costing Dashboard               | Products and recipe cost                     | Prices in. Cost shows "Cost pending" until a recipe and its prices are complete.                   |
| Box costing (September)         | Boxes & add-ons, packaging stock             | Box of 6 exists. Paper bag, sticker and care-card costs and the pricing formula are not connected. |
| Inventory System / Manual Check | Inventory, Weekly count                      | No opening count: the sheet's count is undated. No reorder levels exist to import.                 |
| Inventory-In                    | Stock receipts and their cost in the books   | 82 dated purchases imported as costs; 8 incomplete held. Not as stock movements.                   |
| Inventory-Out                   | Production                                   | Not imported: no opening balance to deduct from, 9 rows without a unit.                            |
| Sales                           | Books, P&L, CSV                              | 722 imported, 28 held. 31 newer rows not yet imported.                                             |
| Sales (GForm)                   | Orders                                       | Not imported, to avoid counting sales twice. Contains customer contact details.                    |
| Waitlist Form Responses         | Customers & waitlist                         | Not imported. Customer contact details.                                                            |
| P&L Dashboard, Data             | Profit & loss, expense categories            | The app computes its own. No expense entries exist in the workbook to import.                      |
| Bazaars                         | Bazaar events                                | 4 dated events, 2 accepted. Not entered in the app.                                                |
| Cafe Partner, Loyal Customers   | Nothing                                      | Wholesale and loyalty were deferred to after launch.                                               |

## 5. The features Ethan listed, against the live build

Checked in the build at `3bc91dd`, signed in, and in the code.

| #   | Feature                                  | Today                                                                                                                                             | Gap                                                                                                                                                 | Size          |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | Main dashboard                           | Home.                                                                                                                                             | None found.                                                                                                                                         | None          |
| 2   | Sales dashboard and logs, filterable     | Sales log is a plain read-only list: the current event's sales, then the books' revenue lines. No filter, no search, no customer or order number. | A sales view over every sale with filters by payment, date, name, order number and product.                                                         | Large         |
| 3   | Order trackers, filterable               | Tabs for All, To review, Paid, Ready, Closed, and a search by name, number or reference.                                                          | Filters by payment method, date and product. "Returned" maps to Replaced, Cancelled and No-show.                                                    | Medium        |
| 4   | Inventory, editable                      | Yes: items, units, levels, suppliers, receive, count, waste.                                                                                      | Data, not features: counts and reorder levels.                                                                                                      | Small         |
| 5   | Grocery tracker by stock status          | Lists only what to buy, with an estimate and a budget.                                                                                            | Every item by status (out, low, good), filters by status, product and price; projected spend.                                                       | Medium        |
| 6   | Recipe workbook                          | Four separate places: Menu & flavours (name, description, allergens, price, picture by file picker), Products, Recipes, Recipe drafts.            | One workbook: flavour thumbnails; tap one to see its ingredients with stock status; edit everything there; drag and drop a picture.                 | Large         |
| 7   | P&L dashboard                            | Yes, with drill-down and CSV.                                                                                                                     | Data: newer sales, real expenses.                                                                                                                   | Small         |
| 8   | Bazaar Mode as a point of sale           | Stock and prices per flavour, offline selling, expenses, close-out, event profit. Bookings have a start and end date.                             | Days inside one event, each with its own stock set after the day before; event stock is typed in: the two bazaar migrations never read baked stock. | Large         |
| 9   | Any number of flavours on the order page | The editor adds, edits and publishes flavours; 26 are in the library.                                                                             | Never tested with 13 or more published. The engine names three prototype flavours in places.                                                        | Small to test |

Items 2, 3, 5, 6 and 8 add controls to ported screens. That is new interface, which the
project's standing rule forbids without Ethan's approval. Each would be built as today's
two exceptions were: live mode only, a guarded slot, recorded, reversed in the validator,
independently audited, demo and visual baselines unchanged.

## 6. Decisions for Ethan

Each has one recommendation. "Yes" approves it.

| #   | Decision                        | Recommendation                                                                                                                                                                                                                                                                    |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Timing                          | Cine's week waits for this work. Hold the 24 to 25 October bazaar on the **current** Bazaar Mode (stock re-entered each morning) and build days-within-an-event after it; changing the selling flow days before the 20 October rehearsal gate is the riskiest thing on this list. |
| S2  | New interface on ported screens | Approve live-only guarded slots for Sales, Orders, Grocery, Recipes and Bazaar, each shown to Ethan as a before and after before it ships.                                                                                                                                        |
| S3  | Recipes                         | Import all 23 workbook recipes as editable version 1 with the Costing Dashboard yields, marked "to confirm", and add the 6 new document recipes to Recipe drafts. Cine corrects as she bakes.                                                                                     |
| S4  | Flavour list                    | Cine confirms which of the 13 are on sale. Merge the two duplicate pairs. Nutella Churro: use 210, the document's price. Rename "cornflake" to Cereal Milk if she confirms they are the same.                                                                                     |
| S5  | Photos                          | Resize the 15 finished PNGs and attach them to their flavours in the trial's existing storage. Cine supplies Gooey Nutella and an exported Red Velvet Cheesecake.                                                                                                                 |
| S6  | Newer sales                     | Append the 31 rows since 23 September through the existing import tool. Never re-import the 804.                                                                                                                                                                                  |
| S7  | Customer lists                  | Do not import the form responses, waitlist, loyal-customer or cafe lists. They are personal data and the app starts clean for customers.                                                                                                                                          |
| S8  | Bazaar bookings                 | Enter the two accepted events in Bazaar events.                                                                                                                                                                                                                                   |
| S9  | Cine's access                   | Neither of her two emails is on the trial's allow-list today. Ethan adds both to Cloudflare Access, updates the release check that expects exactly two addresses, and invites her as owner. Agents do not create accounts.                                                        |
| S10 | Where the source files live     | Move the three sources out of the repository into the private folder.                                                                                                                                                                                                             |

## 7. Proposed order, once approved

One slice per fresh session, each verified, audited where protected, and released.

1. Data, no interface change: S3, S4, S5, S6, S8 and the one stock price. Makes the trial
   look like her business the same day.
2. Flavours at scale: test 13 or more published flavours through shop, checkout, bake,
   recipes, P&L and Bazaar; fix what breaks.
3. Recipe workbook (feature 6), with picture drag and drop and upload resizing.
4. Grocery by stock status (feature 5).
5. Order filters (feature 3).
6. Sales view with filters (feature 2).
7. Bazaar days within an event and the link to baked stock (feature 8), after the October
   bazaar unless Ethan decides otherwise in S1.

At the pace so far, one to two slices per attended day, steps 1 to 6 are about seven to
ten working days. That is past the 20 October gate, so S1 decides what the October bazaar
runs on.

## 8. What this changes in earlier plans

- [finish-plan.md](finish-plan.md) section 1 defined launch as the prototype's screens
  plus her answers. Features 2, 3, 5, 6 and 8 go beyond it.
- F2 (the owner trial) no longer starts when Cine is ready; it starts when this is done.
- "Start clean, no history" was already reversed on 5 October for sales and purchase
  costs; S6 continues that, S7 keeps it for customers.
