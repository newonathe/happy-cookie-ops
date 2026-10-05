# Source-of-truth consolidation — audit and plan (5 October 2026, second pass)

Status: **audit done line by line; nothing built or imported. Ethan approved the decisions
on 5 October ("yes to all, do what u recommend"); the build waits for the final plan he
asked for next.** On 5 October Ethan supplied Cine's updated workbook, her recipe document and
her flavour photos, named them the main source of truth, and said to consolidate everything
and finish it **before** the trial starts. A second message the same day added: audit every
line; migrate everything applicable and interconnect it; make bazaar bookings easy to add
and configure from the Bazaar screen; add a small customer database connected to orders and
accepted by the order form; make the customer pages adapt to the screen; and make
everything in All tools reachable from the main tabs.

This page is the one plan. It holds counts and decisions only. Recipe quantities, customer
rows and contact details stay outside Git, in the private `claude-20261005/sot-audit/`
folder (`sot-audit.json`, `sot-deep-audit.json`).

## 1. What was supplied

| Source                      | What it is                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| Workbook                    | 17 sheets, SHA-256 `4d231891…ddc8ea`. A newer copy of the one imported on 4 October (`c32c12fd…`). |
| Recipe document             | 13 flavours with prices: 7 as text, 6 as ingredient tables. No Apps Script code, despite the name. |
| Photo folder                | 28 files, 561 MB: 15 finished PNGs, 9 layered Photoshop files, 1 zip of 5 raw photos.              |
| Two sign-in emails for Cine | Recorded privately. Neither is on the trial's allow-list today.                                    |

The three sources were moved out of the repository on 5 October (S14, approved) to the
private `claude-20261005/sot-sources/` folder; all 30 files were hash-checked before and
after the move.

## 2. Line-by-line findings

Every data row of every sheet was read and checked against the sheets it should connect
to. "Master" is the Ingredient Master.

| Sheet (rows)                  | Findings                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingredient Master (73)        | No duplicates. 71 rows name no supplier. Units are spelled two ways ("grams" 38, "g" 13). One item has no unit, pack or price. 10 are packaging. Since 4 October: one price changed.                                                                                                      |
| Suppliers (25)                | 14 suppliers, 14 links, no contact numbers. 12 rows do not match a master item by name (5 spelled differently, 2 just say "Packaging", 5 blank). 7 costs differ from the master. Only 10 of 73 master items have a supplier quote.                                                        |
| Recipes (321, 23 flavours)    | Every line has a quantity. 3 ingredients are not in the master (oats, sea salt, a sauce tub). 14 unit mismatches, all packaging. All 23 recipes contain packaging lines (44 in total). 9 master items are used by no recipe.                                                              |
| Costing Dashboard (27)        | Batch cost and cost per cookie agree with the Recipes lines for all 23 flavours. 4 rows have no recipe: one removed flavour (so it shows a 100% margin), the sticker and two sampler boxes.                                                                                               |
| Inventory System (81)         | 8 items are not in the master. "Qty Left" is bought minus used: no item is positive, 4 are negative, 49 blank. It cannot be used as stock on hand. No reorder levels.                                                                                                                     |
| Inventory Manual Check (64)   | 45 items counted, 19 blank, no date anywhere, one expiry date.                                                                                                                                                                                                                            |
| Inventory-In (90)             | 2 rows undated, 1 without quantity, 6 without cost, 46 without supplier. 9 rows use 6 item names not in the master. 6 supplier names are not in the Suppliers sheet. Total cost ₱29,627. Ends 5 July.                                                                                     |
| Inventory-Out (507)           | 39 bake dates, 8 March to 22 July. 7 rows undated, 6 without batch count, 4 without quantity, 9 without unit, 12 unit mismatches. 63 rows use 10 ingredient names not in the master. 3 product names do not match Recipes.                                                                |
| Sales (781)                   | 5 March to 4 October, ₱151,681. 533 rows carry no date (they inherit the one above), 375 no customer name, 38 no payment method, 16 no amount. 29 product names, 5 not in the costing sheet (three "Blind" items, a sampler box, a sauce). 240 distinct customer names, first names only. |
| Sales (GForm) (60)            | 43 distinct phone numbers, 10 of them ordered more than once. Name, Instagram and phone on every row; email on 12. Sampler boxes of 7 (₱899) and 10 (₱1,440) are offered here; the costing sheet prices a box of 6.                                                                       |
| Waitlist (26)                 | Instagram on all, phone on 14.                                                                                                                                                                                                                                                            |
| P&L Dashboard, Data           | 9 broken formula cells. Expense categories are named (8) but no expense is entered.                                                                                                                                                                                                       |
| Box costing (83)              | Box of 6 ₱25, paper bag ₱9, box sticker ₱4.82, care card ₱5; price formula "food cost x 4 + 34.82". 6 flavours costed.                                                                                                                                                                    |
| Bazaars (9)                   | 4 with dates, 2 accepted. Tracks organiser, date, event, place, replied, email, notes.                                                                                                                                                                                                    |
| Cafe Partner, Loyal Customers | 2 named cafes; 6 names.                                                                                                                                                                                                                                                                   |

**Recipe document against the workbook, flavour by flavour:** all 13 exist in both, and in
all 13 the ingredient lists differ by one to four items in each direction. The document
measures 2 to 13 lines per flavour in spoons, pinches or pieces; the workbook measures
everything in grams, mL or pieces. They are two versions of each recipe, not one.

## 3. Flavours: document, workbook, photos and the trial

The trial holds 26 flavours, 7 on the October menu. Only the six prototype flavours have a
picture, and those are the prototype's pictures.

| Flavour in the document | Price   | Workbook row and yield            | Finished photo          | In the trial                                    |
| ----------------------- | ------- | --------------------------------- | ----------------------- | ----------------------------------------------- |
| Double Chocolate Fudge  | 130     | Dark chocolate, 12 (was 15)       | Yes                     | On menu                                         |
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

Also photographed, with no flavour in the document: Banoffee Pie, Dubai Chocolate, Matcha,
Strawberry Biscoff Cheesecake (all four are workbook rows and trial flavours, off menu) and
Cinnamon Sugar (no flavour anywhere). The finished PNGs are 1 to 17 MB; the app's upload
limit is 2 MB, so each must be resized.

## 4. How the data connects today, and where it does not

| Link                                                  | Today                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Flavour → recipe → stock items                        | Built. Only Apple Pie has a measured recipe entered.                                       |
| Stock item → supplier price → grocery list            | Built. 8 usable quotes; most items have none.                                              |
| Order → bake plan → production → ingredients deducted | Built.                                                                                     |
| Purchase → stock received and its cost in the books   | Built. Historical purchases are in the books only, not as stock.                           |
| Order and bazaar sale → books → P&L                   | Built.                                                                                     |
| Baked stock → bazaar event stock                      | **Missing.** Event stock is typed in.                                                      |
| Customer → their orders, products, dates              | **Missing.** Orders carry a name, phone and Instagram handle; there is no customer record. |
| Packaging cost → order cost (box, bag, sticker, card) | Partial. One box rule; the workbook's four costs are not all connected.                    |

## 5. What Ethan asked for, against the live build

Checked in the build at `3bc91dd`, signed in, and in the code.

| #   | Feature                                  | Today                                                                                                                         | Gap                                                                                                                      | Size          |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------- |
| 1   | Main dashboard                           | Home.                                                                                                                         | None found.                                                                                                              | None          |
| 2   | Sales dashboard and logs, filterable     | Sales log is a plain read-only list. No filter, no search, no customer or order number.                                       | A sales view over every sale with filters by payment, date, name, order number and product.                              | Large         |
| 3   | Order trackers, filterable               | Tabs for All, To review, Paid, Ready, Closed, and a search by name, number or reference.                                      | Filters by payment method, date and product. "Returned" maps to Replaced, Cancelled and No-show.                         | Medium        |
| 4   | Inventory, editable                      | Yes: items, units, levels, suppliers, receive, count, waste.                                                                  | Data: counts and reorder levels.                                                                                         | Small         |
| 5   | Grocery tracker by stock status          | Lists only what to buy, with an estimate and a budget.                                                                        | Every item by status (out, low, good), filters by status, product and price; projected spend.                            | Medium        |
| 6   | Recipe workbook                          | Four places: Menu & flavours (name, description, allergens, price, picture by file picker), Products, Recipes, Recipe drafts. | One workbook: thumbnails; tap one for its ingredients with stock status; edit everything there; drag and drop a picture. | Large         |
| 7   | P&L dashboard                            | Yes, with drill-down and CSV.                                                                                                 | Data: newer sales, real expenses.                                                                                        | Small         |
| 8   | Bazaar Mode as a point of sale           | Stock and prices per flavour, offline selling, expenses, close-out, event profit.                                             | Days inside one event, each with its own stock; stock taken from baked stock.                                            | Large         |
| 9   | Add and configure a bazaar from Bazaar   | Bookings (name, dates, place, rent) are edited under All tools, not on the Bazaar screen.                                     | "Add a bazaar" on the Bazaar screen; the sheet's other fields (organiser, contact, status, notes).                       | Small         |
| 10  | Customer database                        | None. Orders hold the customer's details, and a routine clears them after one year.                                           | Section 6.                                                                                                               | Medium        |
| 11  | Customer pages adapt to the screen       | Shop, checkout, status and lookup never overflow at 360, 768, 1,024 or 1,440 wide.                                            | On tablet and desktop they stay a 640-pixel phone column with empty sides, and the background stops at the content.      | Medium        |
| 12  | Everything in All tools on the main tabs | All tools holds 33 entries; 9 destinations are in the sidebar and 5 on the phone dock.                                        | Section 7.                                                                                                               | Large         |
| 13  | Any number of flavours on the order page | The editor adds, edits and publishes flavours; 26 are in the library.                                                         | Never tested with 13 or more published.                                                                                  | Small to test |

Items 2, 3, 5, 6, 8, 11 and 12 add or move controls on ported screens. That is new
interface, which needs Ethan's approval under the project's rules. Each would be built as
the two exceptions of 5 October were: live mode only, guarded, recorded, reversed in the
validator, independently audited, demo and visual baselines unchanged.

## 6. Customer database: research and a small design

What small-business tools do, kept to what a one-person bakery needs:

- Square's Customer Directory keeps a profile per customer with contact details, groups,
  timestamped notes, and purchase history that grows when a customer is attached to a sale.
- The usual way to rank customers is by recency, frequency and money spent, which needs no
  specialist software.
- Philippine law (the Data Privacy Act, RA 10173) applies to a business of any size that
  decides how customer data is used: tell customers what is kept and why, keep it only as
  long as needed, and honour requests to correct or delete. Whether Cine must register with
  the privacy commission was not verified here.

Proposed, deliberately small:

- **One record per customer, keyed by mobile number**, the key the checkout already
  normalises and limits by. Fields: name, Instagram handle, email, notes, tags, first and
  last order dates.
- **Linked, not copied:** each order points to its customer. A profile shows the orders,
  the flavours bought, dates, payment methods and total spent, all read from the orders.
- **Labels computed, not stored:** New, Returning, Regular, Not seen for 60 days.
- **Order form:** no new field. Placing an order finds or creates the customer by mobile
  number. Nothing about an existing customer is shown back to the person ordering.
- **Screens:** a Customers list (search; filter by label, last order, flavour bought) and
  a profile, under Orders. An order opens its customer; a customer opens their orders.
- **Bazaar sales** stay anonymous unless Cine attaches a customer.
- **Privacy:** the shop's notice and the one-year clearing routine must change with this,
  since a customer record outlives one order. Proposed rule: keep a customer while they
  keep ordering, clear the record after 24 months without an order, and on request.
- **Seeding:** the 43 customers in the order-form responses have a phone number and can be
  created as records. The 240 first names in the Sales sheet cannot be keyed to a person
  and stay as text on those sales.

## 7. All tools into the main tabs

Proposed sections, each with sub-tabs, so nothing lives only in All tools:

| Main tab | Sub-tabs                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Home     | Dashboard, Notifications                                                                                                                 |
| Orders   | Orders, Customers, Waitlist, Messages, Payments; set-up: order rules, boxes & add-ons, payment methods, shop status, shop texts, preview |
| Sales    | Sales log with filters, P&L, Books & costs                                                                                               |
| Kitchen  | Bake plan, Recipe workbook (flavours, recipes, drafts)                                                                                   |
| Stock    | Inventory, Weekly count, Grocery, Suppliers & prices, Stock items                                                                        |
| Bazaar   | Bookings, Sell, Close-out                                                                                                                |
| Settings | Settings, System health, Backups & export                                                                                                |

One guarded sub-tab strip in the shell would serve every section, so it is one protected
change, not one per screen. On a phone the dock would hold Home, Orders, Kitchen, Stock and
one more; that fifth slot and the look of the strip need a before and after for Ethan
first. All tools can stay as an index. The Form queue entry is for the Google Form bridge,
which was dropped, and can be hidden.

## 8. Decisions for Ethan

Each has one recommendation. "Yes" approves it. **S1, S2 and S12 are replaced by R1 to R8
in [product-research.md](product-research.md) section 11**, written after Ethan asked the
same day for the whole interface to be reworked; sections 7 and 9 here are superseded by
its sections 8 to 10. The data decisions (S3 to S11, S13, S14) stand.

| #   | Decision                        | Recommendation                                                                                                                                                                                                                          |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Timing                          | Cine's week waits for this work. Run the 24 to 25 October bazaar on the **current** Bazaar Mode and build days-within-an-event after it; changing the selling flow just before the 20 October rehearsal gate is the riskiest item here. |
| S2  | New interface on ported screens | Approve live-only guarded changes for Sales, Orders, Grocery, Recipes, Bazaar, the customer pages and the sub-tab strip, each shown to Ethan as a before and after before it ships.                                                     |
| S3  | Recipes                         | Import all 23 workbook recipes as editable version 1 with the Costing Dashboard yields, marked "to confirm", without their packaging lines. Keep the document's text for all 13 in Recipe drafts. Cine corrects as she bakes.           |
| S4  | Flavour list                    | Cine confirms which of the 13 are on sale. Merge the two duplicate pairs. Nutella Churro: 210, the document's price. Rename "cornflake" to Cereal Milk if she confirms it.                                                              |
| S5  | Photos                          | Resize the 15 finished PNGs and attach them in the trial's storage. Cine supplies Gooey Nutella and an exported Red Velvet Cheesecake.                                                                                                  |
| S6  | Newer sales                     | Append the 31 rows since 23 September through the existing import tool. Never re-import the 804.                                                                                                                                        |
| S7  | Customers                       | Build the small customer database of section 6. Seed it with the 43 order-form customers. Do not import the waitlist, the loyal-customer names or the cafe list as records.                                                             |
| S8  | Customer privacy                | Adopt the 24-month rule in section 6 and update the shop's notice. Cine or her adviser confirms the registration question.                                                                                                              |
| S9  | Bazaar bookings                 | Enter the two accepted events. Add "Add a bazaar" to the Bazaar screen with the sheet's fields.                                                                                                                                         |
| S10 | Stock data                      | Fix the names that do not match (8 in Inventory, 10 in Inventory-Out, 6 in Inventory-In, 5 in Suppliers) by mapping them to master items, with Cine's confirmation. Do not import the undated count or the July stock sheets as stock.  |
| S11 | Packaging and samplers          | Enter the four packaging costs. Cine confirms which sampler sizes and prices are current: 6, 7 or 10.                                                                                                                                   |
| S12 | Navigation                      | Approve the sections in section 7 in principle; the exact phone dock and sub-tab look come back as a before and after.                                                                                                                  |
| S13 | Cine's access                   | Ethan adds her two emails to Cloudflare Access, updates the release check that expects exactly two addresses, and invites her as owner. Agents do not create accounts.                                                                  |
| S14 | Where the source files live     | Move the three sources out of the repository into the private folder.                                                                                                                                                                   |

## 9. Proposed order, once approved

One slice per fresh session, each verified, audited where protected, and released.

1. **Data, no interface change:** S3, S4, S5, S6, S9 (the two events), S10, S11.
2. **Flavours at scale:** 13 or more published flavours through shop, checkout, bake,
   recipes, P&L and Bazaar; fix what breaks.
3. **Customer database** (S7, S8): tables, the order link, the list and profile.
4. **Navigation and sub-tabs** (S12), with "Add a bazaar" on the Bazaar screen.
5. **Recipe workbook**, with picture drag and drop and upload resizing.
6. **Grocery by stock status.**
7. **Order filters, then the Sales view with filters.**
8. **Customer pages on tablet and desktop.**
9. **Bazaar days within an event and the link to baked stock**, after the October bazaar
   unless S1 is decided otherwise.

At one to two slices per attended day, steps 1 to 8 are about twelve to sixteen working
days. That is past the 20 October gate, so S1 decides what the October bazaar runs on.

## 10. What this changes in earlier plans

- [finish-plan.md](finish-plan.md) section 1 defined launch as the prototype's screens
  plus Cine's answers. Features 2, 3, 5, 6, 8 and 10 to 12 go beyond it; loyalty-style
  customer records were on its "not at launch" list.
- F2 (the owner trial) starts when this is done, not when Cine is ready.
- "Start clean, no history" was reversed on 5 October for sales and purchase costs. S6
  continues that; S7 now extends it to the order-form customers.

## Sources for section 6

- [Square: Customer Directory](https://squareup.com/help/us/en/article/5498-customer-directory)
- [Square Developer: Customers API](https://developer.squareup.com/docs/customers-api/what-it-does)
- [Mailchimp: RFM analysis](https://mailchimp.com/resources/rfm-analysis)
- [Pipedrive: What is RFM](https://www.pipedrive.com/en/blog/what-is-rfm)
- [National Privacy Commission: IRR of RA 10173](https://privacy.gov.ph/wp-content/uploads/2023/06/IRR_RA-10173-as-amended.pdf)
- [Clym: Republic Act No. 10173](https://www.clym.io/regulations/republic-act-no-10173-philippines)
