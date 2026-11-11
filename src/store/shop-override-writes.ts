import {
  saveShopOverride,
  type OverrideOutcome,
  type ShopOverride,
  type ShopStatusClient
} from '@/lib/data/shop-status';

const MODES: Readonly<Record<string, ShopOverride | 'auto'>> = {
  Open: 'open',
  'Closing soon': 'soon',
  Closed: 'closed',
  'Sold out': 'soldout',
  'Follow my schedule': 'auto'
};
export const shopOverrideMode = (label: unknown) => MODES[String(label)];

export type ShopOverrideView = {
  phase: 'sending' | 'saved' | 'unknown' | 'refused' | 'unsent';
  requested: string;
  read: 'idle' | 'loading' | 'ready' | 'failed';
  current: string | null;
  canCheck: boolean;
  online: boolean;
  check: () => void;
};
type Scope = { owner: () => boolean; action: () => boolean };
type Entry = {
  client?: ShopStatusClient;
  scope: Scope;
  mode: ShopOverride | null;
  phase: ShopOverrideView['phase'];
  read: ShopOverrideView['read'];
  current: string | null;
};
const label = (mode: ShopOverride | null) =>
  Object.entries(MODES).find(([, value]) => value === (mode ?? 'auto'))?.[0] ?? 'Opening status';

/** A status read never substitutes for an unreceived save acknowledgement. */
export class ShopOverrideWrites {
  private sequence = 0;
  private entry: Entry | null = null;
  constructor(
    private readonly deps: {
      retireReads: () => void;
      refresh: (client: ShopStatusClient) => void;
      online: () => boolean;
      changed: () => void;
      check: (client: ShopStatusClient) => Promise<ShopOverride | null | undefined>;
    }
  ) {}
  private current(entry: Entry): boolean {
    return this.entry === entry && entry.scope.owner() && entry.scope.action();
  }
  notSent(client: ShopStatusClient | undefined, mode: ShopOverride | null, scope: Scope): void {
    this.sequence += 1;
    this.entry = { client, mode, scope, phase: 'unsent', read: 'idle', current: null };
    this.deps.changed();
  }
  async save(
    client: ShopStatusClient,
    mode: ShopOverride | null,
    scope: Scope,
    apply: () => void
  ): Promise<OverrideOutcome | 'retired'> {
    const sequence = ++this.sequence;
    const entry: Entry = { client, mode, scope, phase: 'sending', read: 'idle', current: null };
    this.entry = entry;
    this.deps.changed();
    const outcome = await saveShopOverride(client, mode);
    if (!scope.owner()) return 'retired';
    if (outcome !== 'saved') {
      if (sequence !== this.sequence || !this.current(entry)) return 'retired';
      entry.phase = outcome === 'refused' ? 'refused' : 'unknown';
      this.deps.changed();
      return outcome;
    }
    if (sequence !== this.sequence || !scope.action()) {
      this.deps.refresh(client);
      return 'retired';
    }
    this.deps.retireReads();
    entry.phase = 'saved';
    apply();
    this.deps.changed();
    return 'saved';
  }
  private async check(entry: Entry): Promise<void> {
    if (
      !this.current(entry) ||
      !entry.client ||
      !this.deps.online() ||
      entry.phase === 'sending' ||
      entry.read === 'loading'
    )
      return;
    entry.read = 'loading';
    this.deps.changed();
    let mode: ShopOverride | null | undefined;
    try {
      mode = await this.deps.check(entry.client);
    } catch {
      mode = undefined;
    }
    if (!this.current(entry)) return;
    entry.read = mode === undefined ? 'failed' : 'ready';
    entry.current = mode === undefined ? null : label(mode);
    this.deps.changed();
  }
  view(): ShopOverrideView | null {
    const entry = this.entry;
    if (!entry || !this.current(entry)) return null;
    const online = this.deps.online();
    return {
      phase: entry.phase,
      requested: label(entry.mode),
      read: entry.read,
      current: entry.current,
      online,
      canCheck: !!entry.client && online && entry.phase !== 'sending' && entry.read !== 'loading',
      check: () => {
        void this.check(entry);
      }
    };
  }
}
