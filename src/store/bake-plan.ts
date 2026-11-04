import { batchStock, scaleQty, type BatchLine, type BatchStockState } from '@/lib/recipes/batch';

export interface BakePlanProduct {
  id: string;
  name: string;
}

export interface BakePlanRecipe {
  savedYield: number;
  lines: readonly BatchLine[];
}

export interface BakePlanItem {
  name: string;
  unit: string;
  onHand: number;
  counted: boolean;
  /** The base-unit quantity of one pack, or null when none is saved. */
  packSize: number | null;
  packLabel: string;
  supplier: string;
  /** What one pack costs at the preferred supplier, in pesos, or null when no price matches this pack. */
  packPesos: number | null;
  compare?: () => void;
  count?: () => void;
}

export interface BakePlanNeed {
  name: string;
  unit: string;
  needed: number;
  have: number | null;
  state: BatchStockState;
  short: number;
  /** Whole packs to cover what is short, or null with no pack size saved. */
  packs: number | null;
  packLabel: string;
  supplier: string;
  /** Packs × the pack price, or null when either is unknown: unknown is not zero. */
  costPesos: number | null;
  compare?: () => void;
  count?: () => void;
}

export interface BakePlanRow {
  key: number;
  productId: string;
  cookies: string;
}

export interface LiveBakePlan {
  open: boolean;
  /** The saved plan's total; 0 when nothing is planned. */
  cookies: number;
  /** Planned products with no saved recipe: nothing can be worked out for them. */
  noRecipe: string[];
  /** One line per item the plan uses. */
  needs: BakePlanNeed[];
  /** Known cost of what is short, and whether some of it has no price. */
  knownPesos: number;
  somePending: boolean;
  products: BakePlanProduct[];
  rows: BakePlanRow[];
  error: string | null;
  edit: () => void;
  addRow: () => void;
  removeRow: (key: number) => void;
  setProduct: (key: number, productId: string) => void;
  setCookies: (key: number, cookies: string) => void;
  use: () => void;
  close: () => void;
}

export interface BakePlanDeps {
  products: () => BakePlanProduct[];
  recipe: (productId: string) => BakePlanRecipe | null;
  items: () => BakePlanItem[];
  storage?: () => Pick<Storage, 'getItem' | 'setItem'> | null;
  rerender: () => void;
}

const KEY = 'hc-planned-bake-v1';

/** Whole cookies only, from 1 to 100,000. Null otherwise. */
const wholeCookies = (text: string): number | null => {
  const value = Number(text);
  return /^\d+$/.test(text.trim()) && value >= 1 && value <= 100_000 ? value : null;
};

/**
 * Planned bake: how many cookies you mean to make, and what that needs against recorded stock. It
 * only reads and works things out. Nothing here records production, moves stock or books a cost;
 * the plan stays on this device, as a note to yourself.
 */
export class BakePlan {
  private saved: Array<{ productId: string; cookies: number }> | null = null;
  private open = false;
  private rows: BakePlanRow[] = [];
  private nextKey = 1;
  private error: string | null = null;

  constructor(private readonly deps: BakePlanDeps) {}

  private store(): Pick<Storage, 'getItem' | 'setItem'> | null {
    try {
      return this.deps.storage ? this.deps.storage() : localStorage;
    } catch {
      return null;
    }
  }

  /** Read on first use, never in the constructor: it runs before hydration. */
  private plan(): Array<{ productId: string; cookies: number }> {
    if (this.saved) return this.saved;
    let read: Array<{ productId: string; cookies: number }> = [];
    try {
      const value: unknown = JSON.parse(this.store()?.getItem(KEY) ?? '[]');
      if (Array.isArray(value))
        read = value.filter(
          (row): row is { productId: string; cookies: number } =>
            !!row &&
            typeof row.productId === 'string' &&
            Number.isInteger(row.cookies) &&
            row.cookies > 0
        );
    } catch {
      // A note that cannot be read is an empty plan.
    }
    this.saved = read;
    return read;
  }

  private row(productId = '', cookies = ''): BakePlanRow {
    return { key: this.nextKey++, productId, cookies };
  }

  private edit(): void {
    const plan = this.plan();
    const first = this.deps.products()[0]?.id ?? '';
    this.rows = plan.length
      ? plan.map((row) => this.row(row.productId, String(row.cookies)))
      : [this.row(first)];
    this.error = null;
    this.open = true;
    this.deps.rerender();
  }

  private use(): void {
    const chosen = this.rows.filter((row) => row.cookies.trim() !== '');
    const parsed = chosen.map((row) => ({
      productId: row.productId,
      cookies: wholeCookies(row.cookies)
    }));
    if (parsed.some((row) => row.cookies === null || !row.productId)) {
      this.error = 'Enter whole cookies, from 1 up, for each product you plan.';
      return this.deps.rerender();
    }
    const merged = new Map<string, number>();
    for (const row of parsed)
      merged.set(row.productId, (merged.get(row.productId) ?? 0) + (row.cookies as number));
    this.saved = [...merged.entries()].map(([productId, cookies]) => ({ productId, cookies }));
    try {
      this.store()?.setItem(KEY, JSON.stringify(this.saved));
    } catch {
      // It still applies for this visit; a lost note costs nothing.
    }
    this.open = false;
    this.error = null;
    this.deps.rerender();
  }

  private needs(): { needs: BakePlanNeed[]; noRecipe: string[] } {
    const products = this.deps.products();
    const totals = new Map<string, BatchLine>();
    const noRecipe: string[] = [];
    for (const row of this.plan()) {
      const recipe = this.deps.recipe(row.productId);
      if (!recipe?.lines.length || !(recipe.savedYield > 0)) {
        noRecipe.push(products.find((p) => p.id === row.productId)?.name ?? row.productId);
        continue;
      }
      for (const line of recipe.lines) {
        const qty = scaleQty(line.qty, recipe.savedYield, row.cookies) ?? 0;
        const key = line.name + '|' + line.unit;
        const before = totals.get(key);
        totals.set(key, { ...line, qty: (before?.qty ?? 0) + qty });
      }
    }
    const items = this.deps.items();
    const worked = batchStock([...totals.values()], items, 1, 1);
    const needs = worked.map((row): BakePlanNeed => {
      const item = items.find((other) => other.name === row.name);
      const packs =
        row.state === 'short' && item?.packSize ? Math.ceil(row.short / item.packSize) : null;
      return {
        name: row.name,
        unit: row.unit,
        needed: row.needed,
        have: item && item.counted ? item.onHand : null,
        state: row.state,
        short: row.short,
        packs,
        packLabel: item?.packLabel ?? '',
        supplier: item?.supplier ?? '',
        costPesos: packs !== null && item?.packPesos != null ? packs * item.packPesos : null,
        ...(item?.compare ? { compare: item.compare } : {}),
        ...(item?.count ? { count: item.count } : {})
      };
    });
    return { needs, noRecipe };
  }

  vals(): LiveBakePlan {
    const { needs, noRecipe } = this.needs();
    const short = needs.filter((need) => need.state === 'short');
    return {
      open: this.open,
      cookies: this.plan().reduce((sum, row) => sum + row.cookies, 0),
      noRecipe,
      needs,
      knownPesos: short.reduce((sum, need) => sum + (need.costPesos ?? 0), 0),
      somePending: short.some((need) => need.costPesos === null),
      products: this.deps.products(),
      rows: this.rows,
      error: this.error,
      edit: () => this.edit(),
      addRow: () => {
        this.rows = [...this.rows, this.row(this.deps.products()[0]?.id ?? '')];
        this.deps.rerender();
      },
      removeRow: (key) => {
        this.rows = this.rows.filter((row) => row.key !== key);
        this.deps.rerender();
      },
      setProduct: (key, productId) => {
        this.rows = this.rows.map((row) => (row.key === key ? { ...row, productId } : row));
        this.deps.rerender();
      },
      setCookies: (key, cookies) => {
        this.rows = this.rows.map((row) => (row.key === key ? { ...row, cookies } : row));
        this.error = null;
        this.deps.rerender();
      },
      use: () => this.use(),
      close: () => {
        this.open = false;
        this.deps.rerender();
      }
    };
  }
}
