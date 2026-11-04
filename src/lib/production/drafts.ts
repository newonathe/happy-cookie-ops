import { ProductionWorkspace, type NewProductionWork, type ProductionWork } from './workspace';

export interface BatchProjection {
  pid: string;
  target: number;
  actual: number;
  rejects?: number;
  adj?: Record<string, number>;
  note?: string;
  step?: number;
  showUsed?: boolean;
  liveActualText?: string;
  liveRejectsText?: string;
  liveWorkId?: string;
}
export interface DoughProjection {
  pid: string;
  balls: number;
  liveWorkId?: string;
  step?: number;
  note?: string;
}
export interface ProductionProjection {
  batch: BatchProjection | null;
  doughPrep: DoughProjection | null;
  dropNo: number;
  recipeVer: Record<string, number>;
  recipes: Record<string, { yield: number; ing: Array<[string, unknown, string]> }>;
  screen: string;
  sheet: { kind?: string } | null;
}
type Key = 'batch' | 'doughPrep';
interface Sources {
  identify: (projection: BatchProjection | DoughProjection) => string;
  metadata: (
    pid: string,
    id: string,
    state: ProductionProjection
  ) => Omit<NewProductionWork, 'draft'>;
  locked: (id: string) => boolean;
  completed: (id: string) => boolean;
}

/** The engine slots are projections. Their replacement/clearing never discards another work item. */
export class ProductionDrafts {
  readonly pool: ProductionWorkspace;

  constructor(
    private readonly sources: Sources,
    mintId: () => string
  ) {
    this.pool = new ProductionWorkspace(mintId);
  }

  private capture(key: Key, state: ProductionProjection): { id: string | null; changed: boolean } {
    const value = state[key];
    if (!value) return { id: null, changed: false };
    const id = value.liveWorkId ?? this.sources.identify(value);
    const old = this.pool.get(id);
    if (this.sources.completed(id)) {
      if (old) this.pool.discard(id, old.revision);
      return { id: null, changed: !!old };
    }
    if (!old && this.pool.knows(id)) return { id: null, changed: false };
    const batch = state.batch;
    const draft: NewProductionWork['draft'] =
      key === 'batch' && batch
        ? {
            kind: 'batch',
            target: batch.target,
            actual: batch.liveActualText ?? String(batch.actual),
            rejects: batch.liveRejectsText ?? String(batch.rejects ?? 0),
            adj: { ...batch.adj },
            note: batch.note ?? '',
            step: batch.step ?? 1,
            ...(batch.showUsed === undefined ? {} : { showUsed: batch.showUsed })
          }
        : {
            kind: 'dough',
            balls: String(state.doughPrep?.balls ?? ''),
            note: state.doughPrep?.note ?? '',
            step: state.doughPrep?.step ?? 1
          };
    if (!old) {
      this.pool.add({ ...this.sources.metadata(value.pid, id, state), draft }, id);
      return { id, changed: true };
    }
    if (!this.sources.locked(id) && JSON.stringify(old.draft) !== JSON.stringify(draft)) {
      this.pool.update(id, old.revision, draft);
      return { id, changed: true };
    }
    return { id, changed: false };
  }

  sync(
    previous: ProductionProjection | null,
    current: ProductionProjection
  ): {
    patch: Partial<ProductionProjection>;
    changed: boolean;
  } {
    let changed = false;
    for (const key of ['batch', 'doughPrep'] as const) {
      if (previous?.[key] && previous[key] !== current[key])
        changed = this.capture(key, previous).changed || changed;
    }
    const patch: Partial<ProductionProjection> = {};
    let focused: string | null = null;
    for (const key of ['batch', 'doughPrep'] as const) {
      const captured = this.capture(key, current),
        value = current[key];
      changed = captured.changed || changed;
      if (captured.id && value) {
        if (!value.liveWorkId)
          Object.assign(patch, { [key]: { ...value, liveWorkId: captured.id } });
        if (
          (key === 'batch' && current.screen === 'batch') ||
          (key === 'doughPrep' && current.sheet?.kind === 'mixDough')
        )
          focused = captured.id;
      }
    }
    if (focused && focused !== this.pool.selectedId) {
      this.pool.select(focused);
      changed = true;
    }
    return { patch, changed };
  }

  open(id: string, revision: number): Partial<ProductionProjection> | null {
    const work = this.pool.get(id);
    if (!work || work.revision !== revision || this.sources.completed(id)) return null;
    this.pool.select(id);
    const n = (text: string): number => (/^\d+$/.test(text) ? Number(text) : 0);
    return work.draft.kind === 'batch'
      ? {
          batch: {
            pid: work.product.id,
            target: work.draft.target,
            actual: n(work.draft.actual),
            rejects: n(work.draft.rejects),
            liveActualText: work.draft.actual,
            liveRejectsText: work.draft.rejects,
            adj: { ...work.draft.adj },
            note: work.draft.note,
            step: work.draft.step,
            showUsed: work.draft.showUsed,
            liveWorkId: id
          },
          doughPrep: null,
          screen: 'batch',
          sheet: null
        }
      : {
          batch: null,
          doughPrep: {
            pid: work.product.id,
            balls: n(work.draft.balls),
            liveWorkId: id,
            step: work.draft.step,
            note: work.draft.note
          },
          screen: 'bake',
          sheet: { kind: 'mixDough' }
        };
  }

  retire(id: string): void {
    const work = this.pool.get(id);
    if (work) this.pool.discard(id, work.revision);
  }

  list(): ProductionWork[] {
    return this.pool.list();
  }
}
