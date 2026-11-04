# UI review standard

Every agent follows this before calling any visible change done. It exists because of the
[4 November client review](client-meeting-2026-11-04.md), where a page that passed every check still confused the owner.

## Before designing

1. **Know how she really does it.** Write the real-world steps first. If nobody has asked her, ask before building. A task
   analysis comes before the screen, not after it.
2. **Name the question.** What is she trying to find out or get done here? If the page cannot answer in one sentence, split it.
3. **Check for an existing door.** Search the [word list](#word-list) and the app for the same action before adding one.

## Rules every screen must meet

**Language**

- Her words, never ours. No engine or accounting words on screen.
- One name for one action, everywhere. The same function with different wording reads as a different function.
- Say what happens in her terms ("ready for orders"), not in the system's ("will enter stock").

**Actions**

- One primary action per screen.
- If a row or card has one obvious destination, the whole row opens it. No lone Open button.
- A page reached for one item already knows that item. No picker, no "add another".
- After saving, return her to where she was.
- One way back per page.
- Never show a button that does nothing, or a feature that is not there yet.

**Truth**

- Unknown is not zero. Never counted is not Out.
- Never show raw ids, keys or technical names.
- No placeholder text that a customer can see.
- A number must answer her question: the menu count for the menu, not every product ever made.

**Look**

- One panel, one list row, one form width: `HeadedPanel`, `ListRow`, `PanelLink` in `src/components/ui`.
- Something that is always there must stay quiet. Reserve loud colour for what needs her now.
- No blur or glass that shows moving content behind text.
- No comma-joined lists of things. Use lines or tags.
- Touch targets stay at least 44 px on the owner's phones. WCAG 2.2 AA requires 24 px as the minimum.

## Before calling it done

1. **Real-looking data.** Check full, empty, loading, failed and offline states. Empty pages hide problems.
2. **Look across the app**, not at the page alone. Screenshot the same pattern on every page side by side and remove the
   differences (an interface inventory).
3. **Walk it as her.** At each step: would she know what to do here? Would she see the control? Would she connect it to what she
   wants? After pressing it, would she know it worked? (a cognitive walkthrough)
4. **Check phone and wide desktop**, and read every word aloud.
5. **`pnpm verify`.** It enforces the word list (`tests/unit/ui-language.test.ts`).
6. **Watch her use it.** Nothing replaces this. Passing every check above is not acceptance.

## Word list

| Say                        | Do not say                                                   | Meaning                                           |
| -------------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| Add to inventory           | Receive, Receive delivery, I bought these, Record a purchase | Add quantity of something she already stocks      |
| New item                   | Add to inventory, Add an item                                | Create something she has never stocked            |
| Count                      | Stocktake                                                    | Enter what is physically there                    |
| Dough in the fridge        | Chilled, chilled dough, dough stock                          | Rolled balls waiting to be baked                  |
| Baked cookies              | Baked stock, finished goods                                  | Baked and not yet given to a customer             |
| Ready for orders           | Will enter stock                                             | The good cookies from a bake                      |
| Prepare dough              | Mix, mixed fresh                                             | Measure ingredients and roll the balls            |
| Packed                     | Prepared                                                     | The order is boxed                                |
| Ready for customer pickup  | Hand over, Ready for pickup (as an action)                   | The customer can come                             |
| Picked up                  | Collected, Mark collected                                    | The customer took it. The order is then completed |
| Unknown count, Not counted | Out, for something never counted                             | No one has counted it yet                         |

Keep this list current. A new word goes here in the same change.

## Sources

- [10 usability heuristics, Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/): match the real world,
  consistency, recognition over recall, minimalist design.
- [Interface inventory, Brad Frost](https://bradfrost.com/blog/post/interface-inventory/): catalogue the parts side by side to expose
  accidental variety.
- [The cognitive walkthrough, Wharton and others](https://course.khoury.northeastern.edu/is4300sp13/ssl/articles/p381-wharton.pdf) and
  [overview, Usability Body of Knowledge](https://usabilitybok.org/cognitive-walkthrough): a cheap step-by-step check from the user's
  side. It does not replace testing with real users.
- [Target size, WCAG 2.2](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): 24 px minimum at level AA.
- [Ubiquitous language, DevIQ](https://www.deviq.com/domain-driven-design/ubiquitous-language/): one shared vocabulary across people,
  code and screens.
- [CTA inventory, Object-Oriented UX, A List Apart](https://alistapart.com/article/ooux-a-foundation-for-interaction-design/): list actions
  against their objects, which exposes duplicate doors.
- [Status and alerts, City of Calgary design system](https://summit.calgary.ca/components/status-and-alerts-overview.html): people respond
  less to alerts they see constantly.
- [Clickable cards, Inclusive Components](https://inclusive-components.design/cards/): make the whole card work without flattening what a
  screen reader can reach.
- Bakery software vendors describe tracking dough as work in progress and recording actual yield against the recipe's plan, for example
  [SG Systems](https://sgsystemsglobal.com/?p=128588) and [BatchMaster](https://www.batchmaster.co.in/?p=11682). This is vendor material,
  not independent research, so treat it as a pattern, not proof.

Research gap: searches found no independent study of seeded data against empty states in reviews, so rule 1 under "Before calling it
done" rests on this project's own experience.
