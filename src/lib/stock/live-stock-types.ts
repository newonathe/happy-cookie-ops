/**
 * What the live owner's New Stock screens (B5) draw. The runtime builds this from the stock catalogue, the database's cost reads
 * and the item movements read; the screens in src/components/live/stock/ only draw it and call its actions. Every text is already
 * words for the screen: an unknown cost is "Cost pending", never 0 or a ₱0.00; a status is always a word as well as a colour.
 *
 * This file is the contract between the data side (src/store/ops-runtime.tsx, src/lib/stock/stock-status.ts) and the screens.
 * Add to it only together with both sides.
 */

/** Out at 0, Low below the item's level, Good otherwise (Ethan, 13 October). An item with no level is Good unless it is at 0. */
export type StockStatus = 'Out' | 'Low' | 'Good';

/** `use` is what a batch, a mix or a pack took off: the database writes it, and the item page must show it. */
export type StockMovementKind = 'opening' | 'receipt' | 'count' | 'waste' | 'adjust' | 'use';

/** One line of an item's history, newest first. Never carries who wrote it. */
export interface StockMovementView {
  id: string;
  kind: StockMovementKind;
  /** "+500 g", "−120 g": the change in on-hand, signed, with the unit. */
  changeText: string;
  /** What it cost when a cost was stamped ("₱42.50"), "Cost pending" when it should have one and has none, null when it carries none. */
  costText: string | null;
  supplier: string;
  reason: string;
  /** Epoch milliseconds. */
  at: number;
}

export interface StockItemView {
  id: string;
  name: string;
  category: string;
  unit: string;
  active: boolean;
  /** The quantity with its unit, e.g. "1,250 g". */
  qtyText: string;
  /** Saved pack label and base-unit quantity; never a new user question. */
  packText: string;
  status: StockStatus;
  /** "Low below 500 g", or "No level set". */
  levelText: string;
  /** "Counted 3 Oct", or "Opening count pending" when it was never counted. */
  lastCountedText: string;
  /** Cost per unit with where it came from ("₱0.09 per g · average"), or "Cost pending". */
  costText: string;
  supplier: string;
  /** "Last paid ₱88.25 · 3 Oct", or null when nothing was paid. */
  lastPaidText: string | null;
  open: () => void;
  /** The existing sheets, opened by the existing actions. */
  receive: () => void;
  count: () => void;
  waste: () => void;
  adjust: () => void;
  edit: () => void;
}

export interface StockItemPage {
  item: StockItemView;
  /** `loading` while the read is in flight; `unavailable` when the database has no such function yet (the trial at migration 55) or it failed. */
  movementsState: 'loading' | 'ready' | 'unavailable';
  movements: StockMovementView[];
  close: () => void;
}

export interface GroceryRowView {
  itemId: string;
  name: string;
  status: Exclude<StockStatus, 'Good'>;
  haveText: string;
  neededText: string;
  /** "2 × 1 kg (2 kg)", or "Nothing to buy". */
  toBuyText: string;
  /** The pack, e.g. "1 kg bag". */
  packText: string;
  /** "₱0.09 per g", or "Cost pending". */
  bestPriceText: string;
  supplier: string;
  /** "₱176.50", or "Cost pending". */
  lineCostText: string;
  /** "I bought these": opens the existing receive flow for this item. */
  bought: () => void;
}

export interface GroceryView {
  rows: GroceryRowView[];
  /** The running total of the list: always shown. "₱1,234.50", or "Cost pending" for the part that has no price. */
  totalText: string;
  /** Null until she has set a budget: then neither a bar nor "left" or "over" is drawn (Ethan, 13 October). */
  budgetText: string | null;
  /** "₱765.50 left" or "₱120 over"; null when there is no budget. */
  budgetNoteText: string | null;
  overBudget: boolean;
}

export interface LiveStockVals {
  addItem?: () => void;
  /** Starts the selected ingredient/packaging category or resumes the existing count safely. */
  startCount?: (category: string) => void;
  manageItems?: () => void;
  online: boolean;
  items: StockItemView[];
  counts: { total: number; out: number; low: number };
  /** The open item page, or null for the list. */
  page: StockItemPage | null;
  /** The count flow's line about the books, or null before a cutover: a count that finds less is an expense (migration 65). */
  countNote: string | null;
  grocery: GroceryView;
  count?: {
    paused: boolean;
    saving: boolean;
    pending: boolean;
    storageError: string | null;
    total?: number;
    unavailable?: boolean;
    skipUnavailable?: () => void;
    rows: Array<{ name: string; amountText: string; error: string | null }>;
    back: () => void;
    resume: () => void;
    discard: () => void;
    save: () => Promise<string | null>;
    recover: () => Promise<string | null>;
  } | null;
}
