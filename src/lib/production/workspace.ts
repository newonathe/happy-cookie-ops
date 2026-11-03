/** Unconfirmed working state only. This module never posts production or changes stock. */
export interface ProductionRecipeSnapshot {
  version: number;
  yield: number;
  lines: Array<{
    name: string;
    qty: number;
    unit: string;
    /** null means the source did not supply a kind; never infer it from the unit/name. */
    kind: 'ingredient' | 'packaging' | null;
  }>;
}

export type ProductionDraft =
  | {
      kind: 'batch';
      target: number;
      actual: string;
      rejects: string;
      adj: Record<string, number>;
      note: string;
      step: number;
    }
  | { kind: 'dough'; balls: string; note: string };

export interface NewProductionWork {
  product: { id: string; name: string; photo: string };
  /** Unavailable legacy source remains unknown, rather than silently using today's recipe. */
  recipe: ProductionRecipeSnapshot | null;
  dropNo: number;
  draft: ProductionDraft;
}

export interface ProductionWork extends NewProductionWork {
  id: string;
  revision: number;
}

/**
 * Each item owns its inputs and source snapshot. Selection is only focus, never the whole pool.
 * Raw count text is retained here; the existing confirmation boundary validates actual production.
 * No storage/reload or unanswered-save recovery is claimed by this in-memory draft pool.
 */
export class ProductionWorkspace {
  private items = new Map<string, ProductionWork>();
  private usedIds = new Set<string>();
  private legacy = new WeakMap<object, string>();
  private selected: string | null = null;

  constructor(private readonly mintId: () => string) {}

  get selectedId(): string | null {
    return this.selected;
  }

  list(): ProductionWork[] {
    return structuredClone([...this.items.values()]);
  }

  get(id: string): ProductionWork | null {
    const item = this.items.get(id);
    return item ? structuredClone(item) : null;
  }

  add(input: NewProductionWork): string {
    const id = this.mintId();
    if (!id || this.usedIds.has(id)) throw new Error('Production work identity is not unique.');
    this.items.set(id, { ...structuredClone(input), id, revision: 0 });
    this.usedIds.add(id);
    this.selected = id;
    return id;
  }

  /** Repeated projection of the same legacy instance cannot duplicate or resurrect that work. */
  adoptLegacy(instance: object, input: NewProductionWork): string | null {
    const known = this.legacy.get(instance);
    if (known !== undefined) return this.items.has(known) ? known : null;
    const id = this.add(input);
    this.legacy.set(instance, id);
    return id;
  }

  select(id: string): boolean {
    if (!this.items.has(id)) return false;
    this.selected = id;
    return true;
  }

  leave(): void {
    this.selected = null;
  }

  /** A stale UI callback cannot edit a newer revision, another work kind, or a discarded item. */
  update(id: string, revision: number, draft: ProductionDraft): boolean {
    const item = this.items.get(id);
    if (!item || item.revision !== revision || item.draft.kind !== draft.kind) return false;
    this.items.set(id, { ...item, draft: structuredClone(draft), revision: revision + 1 });
    return true;
  }

  /** Only unsubmitted drafts belong to this pool; submitted/uncertain work needs a separate guard. */
  discard(id: string, revision: number): boolean {
    const item = this.items.get(id);
    if (!item || item.revision !== revision) return false;
    this.items.delete(id);
    if (this.selected === id) this.selected = null;
    return true;
  }
}
