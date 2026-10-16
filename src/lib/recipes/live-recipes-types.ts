import type { CostSource, MarginTone, ReceiptView } from './book';

/**
 * What the live recipe book (U7) is given: made by `RecipeBook` in the store, drawn by `components/live/recipes`. Every
 * figure arrives written, so the screen holds no money rule.
 */
export interface RecipeBookItem {
  id: string;
  name: string;
  /** A stored image path; may be empty. */
  photo: string;
  onMenu: boolean;
  priceText: string;
  /** "₱31.25", or "Cost pending". */
  costText: string;
  costSource: CostSource;
  /** "Typed by you on 15 Oct", "From the recipe", "No cost per cookie yet". */
  sourceText: string;
  /** "75%", or "—". */
  marginText: string;
  /** What a cookie keeps at its price: "₱93.75"; null while the cost is not known. */
  keptText: string | null;
  tone: MarginTone;
  /** The recipe's own cost receipt; null when the recipe's cost was not read. */
  receipt: ReceiptView | null;
  /** Said under the receipt: why it is shown ("For comparison: the recipe's cost today."). */
  receiptNote: string | null;
  /** What the cost field starts with: her cost, else the recipe's. */
  startingCost: string;
  /** True when she typed a cost for this flavour (so "Use the recipe's cost" has something to take away). */
  typed: boolean;
  /** Saves the cost field; blank goes back to the recipe's. Resolves to words when it did not save, null when it did. */
  save: (pesos: string) => Promise<string | null>;
  /** Why the field cannot be saved now, said once under it; null when it can. */
  saveBlocked: string | null;
  /** Opens the older Recipes screen on this flavour. */
  editRecipe: () => void;
}

export interface LiveRecipesVals {
  online: boolean;
  /** How the costs were read: `read`, still `loading`, or `failed` (the figures may then differ from the events'). */
  state: 'read' | 'loading' | 'failed';
  /** Said above the book when something could not be read; null when all is well. */
  note: string | null;
  items: RecipeBookItem[];
  /** Reads her typed costs again (the book calls it when it opens, and "Try again" calls it). */
  refresh: () => void;
}
