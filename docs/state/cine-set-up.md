# What Cine sets once — the list for the one-time set-up

Written 13 October 2026, after her data was loaded. Ethan's instruction that day: nothing is held back and nothing is
guessed; whatever is not certain is hers to set, once, when she first signs in. This page is the input for that set-up
screen, which is **not built yet** (the goal is at the end). Until it is, every item below is already editable in the
screen named beside it. Quantities and prices are not written here: they are in the app and in her workbook.

## 1. Stock and the books

| What                                                                                                  | Where today                 |
| ----------------------------------------------------------------------------------------------------- | --------------------------- |
| **The opening count** of every stock item. Then the cost cutover is applied once, by the operator.    | Stock, then Ethan           |
| The date her price list is current from. Loaded as 13 October 2026, the day of the import.            | Stock, an item's price      |
| Items with no price: Box of 6, Oats, Sauce Tub.                                                       | Stock                       |
| "1x1 Flavor Label Sticker" is in her price list with no unit, pack or price: not created.             | Stock, add an item          |
| Sea salt is in one recipe with no quantity and is not a stock item: not created.                      | Stock, then Recipes         |
| Eight of the older supplier prices have a pack label but no pack size, so they give no cost per unit. | Stock, suppliers and prices |

## 2. Recipe lines left out until she sets them

Each recipe is in with every line that was certain. These ten lines are not, and are left out:

| Flavour               | Item                      | Why                                                   |
| --------------------- | ------------------------- | ----------------------------------------------------- |
| Pistachio cream       | Sea salt                  | No quantity in her sheet                              |
| Dubai Chocolate       | Pink box                  | Her recipe gives grams; the item is stocked in pieces |
| Strawberry Cheesecake | Biscoff cookies           | Her recipe gives pieces; the item is stocked in grams |
| Matcha Latte          | Biscoff cookies           | Her recipe gives pieces; the item is stocked in grams |
| Scoopie CCC           | Heart-shaped box with lid | Not one per cookie in her sheet                       |
| Scoopie RV            | Heart-shaped box with lid | Not one per cookie in her sheet                       |
| Scoopie RV            | Sticker                   | Not one per cookie in her sheet                       |
| Nutella Cookie Fries  | Kraft pouch               | Not one per cookie in her sheet                       |
| Nutella Cookie Fries  | Sticker                   | Not one per cookie in her sheet                       |
| Nutella Cookie Fries  | Sauce Tub                 | Not one per cookie in her sheet                       |

Also for her to confirm, loaded as her sheet has them:

- Strawberry Cheesecake is packed in an Apple Pie Box; Churro and Matcha Latte in a Banoffee Pie Box.
- Egg is in one recipe only (Matcha Latte).
- The two Scoopie recipes take a spoon per cookie when baked: Spoon is an ingredient line, not one of the eight packaging items.
- Apple Pie: her workbook's recipe replaced the one typed into the app; the older version is kept.
- No recipe in her workbook for banana bread ccc, nutella churro and red velvet cheesecake.

**Until the new Recipes screen is built (slice B6), do not save a recipe in the Recipes screen:** it sends no line kind,
so the recipe's packaging lines would be saved as ingredients. The older version is kept, so a slip can be put back.

## 3. Packaging that is not in a recipe

No container rule is entered: what goes with a box of 6, a loose cookie, an order and a bazaar sale (a box, a card, a
bag). The names in `scripts/packaging-rule-today.sql` are the prototype's, not her stock items, so it was not run. Until
she sets it, a pack or a bazaar sale takes only the per-cookie packaging in the recipe and the rest is flagged in the books.

## 4. Flavours and photos

- 7 of 26 flavours are on the menu. An event sells the ones on the menu, at those prices, fixed when it starts.
- Nutella Cookie Fries is in the app as a set, off the menu; its recipe is in now.
- Six pictures are resized and ready (double chocolate fudge, happy camper, nutella churro, snickerdoodle, ube coconut
  crinkle, white chocolate biscoff). Nine more have a file name that is not a flavour's name (Banoffee Pie, Apple Pie,
  Strawberry Biscoff Cheesecake, Dubai Chocolate, PB & Miso, Banana Oat Chip, Cereal Milk, Espresso, Matcha): she picks
  the flavour for each. Twenty flavours have no finished picture. None is uploaded: the upload is in the flavour editor.
- Allergens for each flavour, and whether "Cornflake" is Cereal Milk, are still hers to confirm.

## 5. Bazaars and people

- Her four bookings are in. Two fall on 24 to 25 October; one is marked inactive in her sheet. One phone runs one event.
- An owner account for Cine, her display name, and the shop details (empty until set).

## The goal for the set-up screen

A live-only screen, shown once to an owner until each section is done, that lists the open items above from the
database (items with no price, never counted, recipes with a line left out, flavours with no recipe or picture, no
container rule, no cutover) and links each to the place it is fixed. It needs one new table for the lines left out, with
its own migration, role-suite cases and security review. The import of 13 October used a scratch copy of
`scripts/import-her-data.py` that leaves an unclear line out and lists it; the repository's copy still holds the whole recipe, and
changes with this slice (a script change runs CI and redeploys). Deploying it before 24 October means a new phone rehearsal.
