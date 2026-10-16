import type { BazaarClient, FlavourCost } from '@/lib/data/bazaar-days';
import { fetchFlavourCosts, saveFlavourCost } from '@/lib/data/bazaar-days';
import type { RecipeCost } from '@/lib/data/costs';
import { peso, pesoUnit } from '@/lib/money/format';
import { formatManila } from '@/lib/time/business-clock';
import {
  bookRows,
  costSourceText,
  parseCostField,
  receiptOf,
  startingCostText,
  marginText,
  type BookFlavour
} from '@/lib/recipes/book';
import type { LiveRecipesVals, RecipeBookItem } from '@/lib/recipes/live-recipes-types';

/** The words of the recipe book that are not figures. */
export const BOOK_COPY = {
  offline: 'Saving a cost needs signal. Try again when you are back online.',
  busy: 'Another change is still being saved. Wait a moment, then try again.',
  refused: 'That could not be saved. Check the cost, then try again.',
  saved: 'Cost saved.',
  readFailed:
    'Your typed costs could not be read, so a cost here may differ from the one an event uses. Check the signal and try again.',
  recipeCostsFailed:
    'The recipe costs could not be read, so costs show as pending. Check the signal and try again.',
  missing: 'This database cannot keep a typed cost yet.',
  unread: 'Your typed costs are not read yet, so none can be changed.',
  comparison: "For comparison: the recipe's cost today."
} as const;

export interface RecipeBookDeps {
  client: () => BazaarClient | null;
  online: () => boolean;
  /** The flavours in menu order, with their menu price in centavos. */
  flavours: () => ReadonlyArray<{
    id: string;
    name: string;
    priceCents: number;
    photo: string;
    onMenu: boolean;
  }>;
  /** The database's cost of a flavour's saved recipe, or null. */
  recipeCost: (productId: string) => RecipeCost | null;
  /** How the recipe costs were read: only `ok` can be shown as a cost. */
  recipeCostsState: () => 'unread' | 'ok' | 'missing' | 'failed';
  /** Cookies one batch of the saved recipe makes; null when the recipes were not read or the flavour has none. */
  batchYield: (productId: string) => number | null;
  /** Reads the database's recipe costs again (the runtime's `loadCosts`). */
  reloadCosts: () => void;
  /** Opens the older Recipes screen on a flavour. */
  openRecipe: (productId: string) => void;
  toast: (text: string, kind?: 'ok' | 'warn') => void;
  rerender: () => void;
}

const MISSING = /PGRST202|42883|404/;

/** "15 Oct", as the spec writes it (en-PH would write "Oct 15"). */
const stamp = (at: number): string =>
  `${formatManila(at, { day: 'numeric' }, 'en-PH')} ${formatManila(at, { month: 'short' }, 'en-PH')}`;

/**
 * The owner's recipe book (U7): each flavour with its price, its cost per cookie (hers if she typed one for the flavour,
 * else the complete recipe's), the margin against the floor, and the cost receipt. It reads her typed costs
 * (`get_flavour_costs`) and saves one (`save_flavour_cost`); the recipe's costs come from the runtime. The rules are in
 * `lib/recipes/book`.
 */
export class RecipeBook {
  private costs: ReadonlyMap<string, FlavourCost> | null = null;
  private reading: 'unread' | 'loading' | 'read' | 'failed' | 'missing' = 'unread';
  private seq = 0;
  private busy = false;

  constructor(private readonly deps: RecipeBookDeps) {}

  /** Back to nothing read: signing out must leave nothing of hers behind. */
  reset(): void {
    this.costs = null;
    this.reading = 'unread';
    this.seq += 1;
    this.busy = false;
  }

  /**
   * `read` as a value that stays the same between renders: the book reads when it opens, and an effect that depends on a
   * new function every render would read again after every read.
   */
  private readonly refresh = (): void => {
    void this.read();
    this.deps.reloadCosts();
  };

  /** Reads her typed costs. Never throws. A newer read replaces an older one still out. */
  async read(): Promise<void> {
    const client = this.deps.client();
    if (!client) {
      // No signed-in client: nothing can be read, and the book says so instead of waiting for ever.
      if (this.costs === null) this.reading = 'failed';
      this.deps.rerender();
      return;
    }
    const mine = (this.seq += 1);
    this.reading = 'loading';
    this.deps.rerender();
    try {
      const rows = await fetchFlavourCosts(client);
      if (mine !== this.seq) return;
      if (rows === null) {
        this.reading = 'failed';
      } else {
        this.costs = new Map(rows.map((r) => [r.productId, r]));
        this.reading = 'read';
      }
    } catch (e) {
      if (mine !== this.seq) return;
      this.reading = MISSING.test(e instanceof Error ? e.message : '') ? 'missing' : 'failed';
    }
    this.deps.rerender();
  }

  /** The cost field's save: blank takes her cost away (back to the recipe's), else it is the flavour's cost. */
  async save(productId: string, pesos: string): Promise<string | null> {
    if (this.busy) return BOOK_COPY.busy;
    const client = this.deps.client();
    if (!client || !this.deps.online()) return BOOK_COPY.offline;
    const parsed = parseCostField(pesos);
    if (parsed.error) return parsed.error;
    this.busy = true;
    try {
      const outcome = await saveFlavourCost(client, productId, parsed.cents);
      if (outcome === 'offline') return BOOK_COPY.offline;
      if (outcome !== 'saved') return BOOK_COPY.refused;
      // What was just saved is shown at once: a read that fails after it must not leave the old figure on the page.
      if (this.costs !== null) {
        const next = new Map(this.costs);
        if (parsed.cents === null) next.delete(productId);
        else next.set(productId, { productId, costCents: parsed.cents, typedAt: Date.now() });
        this.costs = next;
      }
      await this.read();
      this.deps.toast(BOOK_COPY.saved);
      return null;
    } finally {
      this.busy = false;
    }
  }

  private blockedReason(): string | null {
    if (this.reading === 'missing') return BOOK_COPY.missing;
    if (this.reading === 'unread' || this.reading === 'loading') {
      return this.costs === null ? BOOK_COPY.unread : null;
    }
    if (this.reading === 'failed' && this.costs === null) return BOOK_COPY.unread;
    return null;
  }

  vals(): LiveRecipesVals {
    const recipeState = this.deps.recipeCostsState();
    const flavours: BookFlavour[] = this.deps.flavours().map((f) => {
      const typed = this.costs?.get(f.id) ?? null;
      return {
        id: f.id,
        name: f.name,
        photo: f.photo,
        onMenu: f.onMenu,
        priceCents: f.priceCents,
        recipe: recipeState === 'ok' ? this.deps.recipeCost(f.id) : null,
        batchYield: this.deps.batchYield(f.id),
        typedCents: typed?.costCents ?? null,
        typedAt: typed?.typedAt ?? null
      };
    });
    const rows = bookRows(flavours);
    const blocked = this.blockedReason();
    const items: RecipeBookItem[] = flavours.map((f, i) => {
      const row = rows[i];
      if (!row) throw new Error('recipe book: a row is missing');
      const receipt = receiptOf(f.recipe, f.batchYield);
      return {
        id: f.id,
        name: f.name,
        photo: f.photo,
        onMenu: f.onMenu,
        priceText: peso(f.priceCents),
        costText: row.costCents === null ? 'Cost pending' : pesoUnit(row.costCents),
        costSource: row.costSource,
        sourceText: costSourceText(row.costSource, f.typedAt === null ? null : stamp(f.typedAt)),
        marginText: marginText(row.margin),
        keptText: row.margin === null ? null : pesoUnit(row.margin.cents),
        tone: row.tone,
        receipt,
        receiptNote: receipt && row.costSource === 'typed' ? BOOK_COPY.comparison : null,
        startingCost: startingCostText(f),
        typed: f.typedCents !== null,
        save: (pesos) => this.save(f.id, pesos),
        saveBlocked: blocked ?? (this.deps.online() ? null : BOOK_COPY.offline),
        editRecipe: () => this.deps.openRecipe(f.id)
      };
    });
    const note =
      this.reading === 'failed'
        ? BOOK_COPY.readFailed
        : recipeState === 'failed' || recipeState === 'missing'
          ? BOOK_COPY.recipeCostsFailed
          : null;
    return {
      online: this.deps.online(),
      state:
        this.reading === 'failed'
          ? 'failed'
          : this.reading === 'unread' || (this.reading === 'loading' && this.costs === null)
            ? 'loading'
            : 'read',
      note,
      items,
      refresh: this.refresh
    };
  }
}
