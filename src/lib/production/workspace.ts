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
      showUsed?: boolean;
    }
  | { kind: 'dough'; balls: string; note: string; step?: number };

export interface NewProductionWork {
  product: { id: string; name: string; photo: string };
  /** Unavailable legacy source remains unknown, rather than silently using today's recipe. */
  recipe: ProductionRecipeSnapshot | null;
  dropNo: number;
  draft: ProductionDraft;
}

export interface ProductionWork extends NewProductionWork {
  id: string;
  number: number;
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
  private sequence = 0;

  constructor(private readonly mintId: () => string) {}

  get selectedId(): string | null {
    return this.selected;
  }

  /** Only the validated, identity-scoped recovery boundary calls this after acquiring its lease. */
  restore(
    works: ProductionWork[],
    selectedId: string | null,
    sequence: number,
    closedIds: string[] = []
  ): void {
    this.items = new Map(structuredClone(works).map((work) => [work.id, work]));
    this.usedIds = new Set([...works.map((work) => work.id), ...closedIds]);
    this.legacy = new WeakMap();
    this.selected = selectedId !== null && this.items.has(selectedId) ? selectedId : null;
    this.sequence = sequence;
  }

  snapshot(): { works: ProductionWork[]; selectedId: string | null; sequence: number } {
    return { works: this.list(), selectedId: this.selected, sequence: this.sequence };
  }

  list(): ProductionWork[] {
    return structuredClone([...this.items.values()]);
  }

  get(id: string): ProductionWork | null {
    const item = this.items.get(id);
    return item ? structuredClone(item) : null;
  }

  knows(id: string): boolean {
    return this.usedIds.has(id);
  }

  add(input: NewProductionWork, id = this.mintId()): string {
    if (!id || this.usedIds.has(id)) throw new Error('Production work identity is not unique.');
    this.items.set(id, { ...structuredClone(input), id, number: ++this.sequence, revision: 0 });
    this.usedIds.add(id);
    this.selected = id;
    return id;
  }

  /** A plan enters the pool together; a failed device copy restores the entire prior pool. */
  addPlan(inputs: NewProductionWork[], keep: () => boolean): boolean {
    const before = {
      items: new Map(this.items),
      used: new Set(this.usedIds),
      selected: this.selected,
      sequence: this.sequence
    };
    const rollback = () => {
      this.items = before.items;
      this.usedIds = before.used;
      this.selected = before.selected;
      this.sequence = before.sequence;
    };
    try {
      inputs.forEach((input) => this.add(input));
      this.leave();
      if (keep()) return true;
      rollback();
      return false;
    } catch (error) {
      rollback();
      throw error;
    }
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

  /** Explicit source adoption keeps measured facts, but requires reviewing ingredient exceptions again. */
  useRecipe(id: string, revision: number, recipe: ProductionRecipeSnapshot): boolean {
    const item = this.items.get(id);
    if (!item || item.revision !== revision) return false;
    const draft: ProductionDraft =
      item.draft.kind === 'batch'
        ? { ...item.draft, adj: {}, step: 1 }
        : { ...item.draft, step: 1 };
    this.items.set(id, { ...item, recipe: structuredClone(recipe), draft, revision: revision + 1 });
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
