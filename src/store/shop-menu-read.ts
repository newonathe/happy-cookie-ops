import { fetchShopFlavours, type ShopClient, type ShopFlavourRow } from '@/lib/data/flavours';

export type ShopMenuReadView = {
  state: 'loading' | 'ready' | 'failed';
  stale: boolean;
  online: boolean;
  empty: boolean;
  retry?: () => void;
};

/** Public menu reads have one source and monotonically ordered recovery callbacks. */
export class ShopMenuRead {
  private client: ShopClient | null = null;
  private sequence = 0;
  private read = false;
  private count = 0;
  private state: ShopMenuReadView['state'] = 'loading';

  constructor(
    private readonly deps: {
      active: () => boolean;
      canRetry: () => boolean;
      online: () => boolean;
      apply: (rows: ShopFlavourRow[]) => void;
      changed: () => void;
    }
  ) {}

  get loaded(): boolean {
    return this.read;
  }

  async load(client: ShopClient | null): Promise<boolean> {
    if (!this.deps.active()) return false;
    const sequence = ++this.sequence;
    if (client !== this.client) {
      this.read = false;
      this.count = 0;
      this.deps.apply([]);
    }
    this.client = client;
    const current = () =>
      this.deps.active() && sequence === this.sequence && client === this.client;
    this.state = 'loading';
    this.deps.changed();
    try {
      if (!client) throw Error('menu source unavailable');
      const rows = await fetchShopFlavours(client);
      if (!current()) return false;
      this.deps.apply(rows);
      this.read = true;
      this.count = rows.length;
      this.state = 'ready';
      this.deps.changed();
      return rows.length > 0;
    } catch {
      if (current()) {
        this.state = 'failed';
        this.deps.changed();
      }
      return false;
    }
  }

  view(): ShopMenuReadView {
    const sequence = this.sequence,
      client = this.client;
    return {
      state: this.state,
      online: this.deps.online(),
      stale: this.read && this.state !== 'ready',
      empty: this.read && this.count === 0,
      retry:
        client && this.state !== 'loading'
          ? () => {
              if (
                this.deps.active() &&
                this.deps.canRetry() &&
                this.deps.online() &&
                sequence === this.sequence &&
                client === this.client
              )
                void this.load(client);
            }
          : undefined
    };
  }
}
