import { batchStock, scaleQty, type BatchLine, type BatchStockState } from '@/lib/recipes/batch';
import { stockConfidence } from '@/lib/stock/stock-status';
import { parseProductionScope, type ProductionRecoveryScope } from '@/lib/production/recovery';
import {
  readBakePlan,
  writeBakePlan,
  bakePlanKey,
  BAKE_PLAN_RETENTION,
  type BakePlanRetention
} from '@/lib/production/bake-plan-storage';

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
  startProduction?: () => void;
  retention?: { status: BakePlanRetention; message: string; retry: () => void };
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
  /** Capture an action for this displayed plan; capture itself performs no writes. */
  production?: (rows: Array<{ productId: string; cookies: number }>) => (() => void) | null;
  scope?: () => ProductionRecoveryScope | null;
  products: () => BakePlanProduct[];
  /** False while the products on offer are not hers: a plan cannot be opened then. Absent means ready. */
  ready?: () => boolean;
  recipe: (productId: string) => BakePlanRecipe | null;
  items: () => BakePlanItem[] | null;
  storage?: () => Pick<Storage, 'getItem' | 'setItem'> | null;
  rerender: () => void;
}

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
  private scopeKey: string | null | undefined;
  private scope: ProductionRecoveryScope | null = null;
  private generation = 0;
  private retention: BakePlanRetention = 'unverified';

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
    this.syncScope();
    if (this.saved) return this.saved;
    const read = readBakePlan(this.scope, this.store());
    this.retention = read.status;
    this.saved = read.value ?? [];
    return this.saved;
  }

  private syncScope(): void {
    const scope = parseProductionScope(this.deps.scope?.() ?? null);
    const key = scope ? bakePlanKey(scope) : null;
    if (key === this.scopeKey) return;
    this.scopeKey = key;
    this.scope = scope;
    this.generation += 1;
    this.saved = null;
    this.rows = [];
    this.open = false;
    this.error = null;
  }

  private row(productId = '', cookies = ''): BakePlanRow {
    return { key: this.nextKey++, productId, cookies };
  }

  private edit(): void {
    if (this.deps.ready && !this.deps.ready()) return;
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
    if ([...merged.values()].some((cookies) => cookies > 100000)) {
      this.error = 'Plan at most 100,000 cookies for each product, including repeated rows.';
      return this.deps.rerender();
    }
    this.saved = [...merged.entries()].map(([productId, cookies]) => ({ productId, cookies }));
    this.retention = writeBakePlan(this.scope, this.saved, this.store()) ? 'stored' : 'visit';
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
        noRecipe.push(products.find((p) => p.id === row.productId)?.name ?? 'Unavailable product');
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
      const item = items?.find((other) => other.name === row.name);
      const packs =
        row.state === 'short' && item?.packSize ? Math.ceil(row.short / item.packSize) : null;
      return {
        name: row.name,
        unit: row.unit,
        needed: row.needed,
        have:
          item && ['counted', 'recorded'].includes(stockConfidence(item.onHand, item.counted))
            ? item.onHand
            : null,
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
    const displayedPlan = structuredClone(this.plan());
    const signature = JSON.stringify(displayedPlan);
    const production =
      !this.open && displayedPlan.length && !noRecipe.length
        ? this.deps.production?.(displayedPlan)
        : null;
    const generation = this.generation;
    const guard =
      <T extends unknown[]>(action: (...args: T) => void) =>
      (...args: T): void => {
        this.syncScope();
        if (generation === this.generation) action(...args);
      };
    const short = needs.filter((need) => need.state === 'short');
    return {
      open: this.open,
      cookies: this.plan().reduce((sum, row) => sum + row.cookies, 0),
      noRecipe,
      needs,
      knownPesos: short.reduce((sum, need) => sum + (need.costPesos ?? 0), 0),
      somePending: short.some((need) => need.costPesos === null),
      products: this.deps.products(),
      startProduction: production
        ? guard(() => {
            if (!this.open && JSON.stringify(this.plan()) === signature) production();
          })
        : undefined,
      rows: this.rows,
      error: this.error,
      retention: {
        status: this.retention,
        message: BAKE_PLAN_RETENTION[this.retention],
        retry: guard(() => {
          if (this.retention === 'visit')
            this.retention = writeBakePlan(this.scope, this.plan(), this.store())
              ? 'stored'
              : 'visit';
          else {
            this.saved = null;
            this.plan();
          }
          this.deps.rerender();
        })
      },
      edit: guard(() => this.edit()),
      addRow: guard(() => {
        this.rows = [...this.rows, this.row(this.deps.products()[0]?.id ?? '')];
        this.deps.rerender();
      }),
      removeRow: guard((key: number) => {
        this.rows = this.rows.filter((row) => row.key !== key);
        this.deps.rerender();
      }),
      setProduct: guard((key: number, productId: string) => {
        this.rows = this.rows.map((row) => (row.key === key ? { ...row, productId } : row));
        this.deps.rerender();
      }),
      setCookies: guard((key: number, cookies: string) => {
        this.rows = this.rows.map((row) => (row.key === key ? { ...row, cookies } : row));
        this.error = null;
        this.deps.rerender();
      }),
      use: guard(() => this.use()),
      close: guard(() => {
        this.open = false;
        this.deps.rerender();
      })
    };
  }
}
