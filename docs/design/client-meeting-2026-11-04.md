# Client review, 4 November 2026: every finding, and the plan

The owner walked the mockup and then the real portal on a recorded 40-minute call. This file is the working list for any
agent. Read it with [the review standard](ui-review-standard.md). The recording and transcript stay private, outside Git.

**How this was analysed.** 805 frames (one every 3 seconds) were checked against the transcript, using the call's speaker
tile to see who was talking at each moment: the owner, Ethan, or his partner. Limits: the audio itself was not listened to,
so tone is inferred from the words, and the transcript mis-hears some words ("cell tab" is Sell, "though" is dough, "Vake" is
Bake). The call ran on the 4 November build; each row below was rechecked against the code on 5 November.

Status: **To do**, **Done** (with commit), **Decide** (needs the owner or Ethan).

## 1. What the owner actually does

This is the most important part of the call. The app was built before anyone asked her.

1. She **measures each flavour's ingredients** for a batch. Every flavour has its own recipe; there is **no base dough**
   (17:57 to 18:18).
2. She rolls the dough into **80 g balls**. The count varies by about one either way for no reason, even when weighed
   (8:24 to 9:22, 12:48). How many a batch gives also depends on the flavour (18:35).
3. The balls go in the **fridge**, where dough lasts for months (16:38).
4. **Customers order first** (13:24). She bakes only what was ordered, on baking days before her pickup days (13:10).
5. A batch makes more than is ordered, so **the rest stays in the fridge as dough** (15:25 to 15:35). She needs to see how
   much dough is left and how many baked cookies went unsold (15:57 to 16:09).
6. Rejects only happen **after baking**. Dough is never rejected (10:43 to 11:06).
7. **Customers pick up from her house.** She does not deliver (1:27).
8. For a bazaar she prepares hundreds of cookies **in advance** over several days (13:43).
9. Ethan's aim, which she agreed with: finishing dough deducts its ingredients automatically (7:55, 19:13).

So: online orders are made to order from dough kept in stock, and bazaars are made ahead. Dough is the real buffer. Any screen
that treats a planned cookie count as the unit of work has the wrong model.

## 2. What she asked for

| ID  | Time                  | Who            | Screen           | What she said or meant                                                                                                   | Fix                                                                                       | Status                     |
| --- | --------------------- | -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------- |
| O1  | 0:23 to 0:54          | Owner          | Orders           | Tapping the order should open it, like a Bazaar cookie. "Too much buttons." Remove Open order                            | Whole row opens the order                                                                 | Done                       |
| O2  | 1:27 to 3:39          | Owner, Ethan   | Order            | "Hand over to the customer" sounds like delivery. Say ready for customer pickup, mark picked up, then completed          | Packed, Ready for customer pickup, Picked up, Completed. Same stored states, wording only | Done                       |
| M1  | 5:42                  | Owner          | Recipe           | "What's the point of stock for this batch?"                                                                              | Answer the question it is really asking: is there enough?                                 | Done                       |
| M2  | 6:45 to 6:52          | Owner          | Start production | Prepare dough should come first                                                                                          | Prepare dough is first and the default when no dough is in the fridge                     | Done                       |
| M3  | 8:03 to 8:24          | Partner, Owner | Start production | Partner suggested capping the count by stock. She rejected it: the count is never exact                                  | Do not block on a predicted count. Ask what she got                                       | Done                       |
| M4  | 11:17 to 11:45        | Owner          | Bake result      | "What do you mean, 11 good cookies will enter stock?" Vague                                                              | Say what it means for her: ready for orders                                               | Done                       |
| M5  | 15:57 to 16:13        | Owner          | Stock            | Needs the number of dough in the fridge and unsold cookies                                                               | Clear names, plain figures                                                                | Done                       |
| M6  | 16:20                 | Ethan, Owner   | Production       | Record the date each batch was baked                                                                                     | Shown on the batch and history                                                            | To do                      |
| S1  | 20:49 to 21:20        | Owner          | Add stock        | "Add another item" is unnecessary                                                                                        | Gone on an item's own page                                                                | Done                       |
| S2  | 22:12 to 22:39        | Owner          | Item             | Wants to add stock from the ingredient's own page                                                                        | Add to inventory on the item page, for that item                                          | Done                       |
| S3  | 22:46 to 23:00        | Owner          | Stock            | Replace Receive delivery with Add to inventory. "Even if it's the same function, it's different wording"                 | One name everywhere                                                                       | Done                       |
| S4  | 23:27 to 23:53        | Owner          | Stock            | "Three buttons all with different names for the same function." Add to inventory only, on the item page and the overview | Same                                                                                      | Done                       |
| S5  | 25:12 to 25:35        | Owner          | Packaging item   | The form should be only for that item, because you are already on its page                                               | Item fixed, no item picker                                                                | Done                       |
| S6  | 26:33, 27:52 to 28:22 | Owner          | Edit item        | After Save she landed on a list called Stock items: "What is that page?"                                                 | Save returns to the item                                                                  | Done                       |
| S7  | 28:50                 | Owner, Ethan   | Shopping         | Wanted Compare prices                                                                                                    | It now opens the item, not a comparison                                                   | To do                      |
| S8  | 29:42 to 29:52        | Owner          | Shopping         | I bought these and Receive delivery are the same again                                                                   | One name, item fixed when one is chosen                                                   | Done                       |
| S9  | 31:15 to 32:06        | Owner          | Suppliers        | Must update old suppliers and add new ones. Liked the add form                                                           | Works. Keep                                                                               | Done                       |
| C1  | 37:56                 | Owner          | Checkout         | Stickers 1 to 4 must be pictures                                                                                         | Pictures on the add-on choices                                                            | Decide: needs the pictures |
| C2  | 38:10                 | Owner          | Checkout         | They submit the order before they pay                                                                                    | Remove the reference field before payment                                                 | To do                      |

She liked these, so do not change them: the recipe's ingredient list (5:35), the dough and baked tabs (19:55), editing an item
(26:30), Shopping grouped by supplier (28:51, 29:25), the add supplier form (32:06), and the count flow (25:58).

Ethan promised these on the call: the shop link customers will use (37:47), a wider shop on computers (38:31), payment set up
on the shop (38:26), real demo data for presenting (3:57), and a demo of the changes on Thursday or Friday (19:04).

## 3. What was visibly wrong that nobody said

Found by watching her hesitate, and by reviewing the frames and the code.

| ID  | Where                | Problem                                                                                                                        | Why it matters                                                      | Fix                                                                    | Status                |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------- |
| B1  | Stock                | Add to inventory opens a form to **create a new item**, while Receive adds quantity. The name she wants is on the wrong action | The root of S3 and S4. She pressed it at 22:24 and got a blank form | Add to inventory adds quantity. New item is a separate, quieter action | Done                  |
| B2  | Every page           | A large orange "is selling" bar on every page, in every flow                                                                   | Competes with the page's own action and pushes content down         | Slim line, same way back to the till                                   | Done                  |
| B3  | Every page           | Header glass: content smears through it as a pink blur when scrolling                                                          | Looks broken in most frames of the recording                        | Solid header                                                           | Done                  |
| B4  | Money, Sales         | Raw machine names like "Stall sale" plus a long id, on the owner's screen                                                      | Looks like an error                                                 | Readable name                                                          | To do                 |
| B5  | Money, Sales         | Comma lists and `0×` cookies, same as the till                                                                                 | Already fixed on the till, not here                                 | Reuse the sale lines and tags                                          | To do                 |
| B6  | Stock                | An item never counted shows **Out**, then **Not counted** beside it                                                            | Contradiction. Unknown is not zero                                  | Never counted is not Out                                               | Done                  |
| B7  | Shopping             | "Out" beside "Need 0, have 0, nothing to buy", repeated for dozens of items                                                    | The list loses its meaning                                          | Say plainly, and show what is needed first                             | Done                  |
| B8  | Stock rows           | "1000 g · 1,000 g per pack", "1 pcs · 1 pcs per pack"                                                                          | Says the same thing twice, and bad grammar                          | Say it once                                                            | Done                  |
| B9  | Production           | "Nothing chilled for this flavour, so all 13 are mixed fresh", "no dough yet"                                                  | Engine jargon                                                       | Her words: fridge, dough                                               | Done                  |
| B10 | Count                | "₱12 of stock unaccounted for"                                                                                                 | Accounting jargon at the moment of a simple correction              | Plain result                                                           | Done                  |
| B11 | Home                 | Products tile counted every product, not the menu. Unfinished work could fill a screen                                         | The number is wrong for her question                                | Menu count, short list with See all                                    | To do                 |
| B12 | Stock                | About 12 controls before the first row                                                                                         | Too much before the content                                         | Fewer, plainer controls                                                | To do                 |
| B13 | Many                 | Back appears twice or three times on one page: header arrow, link and button                                                   | Which one do I press?                                               | One Back per page                                                      | To do                 |
| B14 | Every list           | Rows with a lone Open button, on Shop, Account and Orders                                                                      | Same complaint as O1, on every list                                 | Whole row opens, one list row everywhere                               | Done                  |
| B15 | Shop, customer       | Allergens line shows a placeholder sentence on every card, for customers                                                       | Reads as unfinished                                                 | Hide until set                                                         | To do                 |
| B16 | Shop, customer       | Privacy text names the hosting company                                                                                         | Customers do not need it                                            | Plain wording                                                          | Decide: legal wording |
| B17 | Order status preview | Preview from Shop lands on "We could not find that order" with an empty pill                                                   | A dead end                                                          | Show an example                                                        | To do                 |
| B18 | Money                | One long sentence per open event, four in a row                                                                                | Hides the figures                                                   | One summary line that opens                                            | To do                 |
| B19 | Recipe               | A Count button on every ingredient row                                                                                         | Too many buttons, and counting is not this page's job               | Row opens the item                                                     | Done                  |
| B20 | Start production     | "Cookies planned for Double Chocolate Fudge" repeated per card                                                                 | Long, and the card already names it                                 | Short labels                                                           | Done                  |
| B21 | Till, Stock          | Mixed shop styles between pages, forms at different widths                                                                     | Reads as several apps                                               | Shared panel, one form width                                           | To do                 |
| B22 | Demo                 | The real portal had no orders, so half the Sell flow could not be shown (3:52)                                                 | She reviewed a mockup for Sell and an empty page for the rest       | Demo data, Ethan's approval needed for the hosted side                 | Decide                |

## 4. Out of scope for now: the customer list (CRM)

Not to be built yet. Ethan's partner said this is outside the agreed scope and would be priced separately. Listed so nothing is
lost.

- A directory of every customer, even those who ordered once (32:43).
- Whether a customer is a repeat customer, and how many orders they placed (32:47).
- Her own notes on each customer (35:20).
- Customer details stay after an order completes. Today they drop off when the order finishes (39:04).
- Each customer's order history, Instagram handle and contact number in one place (38:46).
- A possible connection to Meta Business Suite (35:04).
- A full sales CRM like HubSpot was mentioned only as the expensive comparison (34:52).

## 5. Why this happened

The honest causes, in order of damage:

1. **Built from a specification, never from watching her.** The app models what the prototype said, not section 1 above. Nobody
   asked how she bakes until minute 12, after the screens existed.
2. **"Done" meant the structure matched.** Coverage marked pages Done when they matched the mockup and tests passed. No check
   asked whether she could use the page without help. Every review passed and she was still lost.
3. **Code words reached the screen.** Receipt, chilled, unaccounted, enter stock: the engine's names became labels. Nobody owned
   a list of her words.
4. **Each feature added its own door.** Receive, Receive delivery, Add to inventory, I bought these and Record a purchase grew
   separately. Each was reasonable alone. Nothing checked one action against the others.
5. **Reuse was explained to her rather than hidden.** At 30:04 Ethan had to explain modular code. Reusing a page is right, but it
   must arrive already knowing what you came for.
6. **Reviewed on empty or fake data.** Sell could not be shown on the real portal, and stock was all zeros, so some problems could
   not appear and others looked worse than they are.
7. **Pages were polished one at a time.** Each looked fine alone. The header smear and the orange bar only show across the whole
   app, and nobody looked across it.

## 6. The plan

Each slice is one commit, checked at phone and wide desktop on the preview, with the full checks passing. Nothing is deployed.

1. **Foundation**: solid header, slim selling line, one list row, the word list and a test that enforces it.
2. **Orders**: rows open, pickup wording, and the order page keeps one next action.
3. **Stock**: Add to inventory everywhere, an item's own form, Save returns to the item, plain status.
4. **Make**: dough first, her words, what the result means, is there enough, batch date.
5. **Money and Home**: readable sales, the open-event summary, correct counts.
6. **Customer shop**: wider on computers, no placeholder allergens, no reference before payment, a working preview. The locked
   screens need the approved live-replacement route, so check that first.
7. **Final walk**: the whole app, flow by flow, against [the review standard](ui-review-standard.md).

Decisions still open: sticker pictures (C1), privacy wording (B16), hosted demo data (B22), and whether dough in the fridge
can be counted by hand if the number drifts.

[Codex's audit](system-audit-2026-11-05.md) of the same day adds work not raised on the call: carrying a recipe's quantity into production (F03), showing what customer history covers (F05), the shopping plan's handoff (F06), review on bazaar stock and fee changes (F07), the Money chart's scale (F08), and a retry on failed loads (F09). These join the slices above.

Sources for the method are in [the review standard](ui-review-standard.md).
