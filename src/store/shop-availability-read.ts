import { fetchShopStatus, type ShopStatus, type ShopStatusClient } from '@/lib/data/shop-status';

export type ShopAvailabilityView = {
  state: 'loading' | 'ready' | 'failed';
  stale: boolean;
  online: boolean;
  retry?: () => void;
};

/** Opening metadata is public; late reads and retired recovery callbacks cannot replace it. */
export class ShopAvailabilityRead {
  private client: ShopStatusClient | null = null;
  private sequence = 0;
  private read = false;
  private state: ShopAvailabilityView['state'] = 'loading';
  constructor(
    private readonly deps: {
      active: () => boolean;
      canRetry: () => boolean;
      online: () => boolean;
      apply: (status: ShopStatus, current: () => boolean) => void;
      changed: () => void;
    }
  ) {}
  async load(client: ShopStatusClient | null): Promise<boolean> {
    if (!this.deps.active()) return false;
    const sequence = ++this.sequence;
    if (client !== this.client) this.read = false;
    this.client = client;
    const current = () =>
      this.deps.active() && sequence === this.sequence && client === this.client;
    this.state = client ? 'loading' : 'failed';
    this.deps.changed();
    if (!client) return false;
    let status = null;
    try {
      status = await fetchShopStatus(client);
    } catch {
      /* Retain last-good metadata. */
    }
    if (!current()) return false;
    if (!status) {
      this.state = 'failed';
      this.deps.changed();
      return false;
    }
    this.read = true;
    this.state = 'ready';
    this.deps.apply(status, current);
    this.deps.changed();
    return true;
  }
  view(): ShopAvailabilityView {
    const sequence = this.sequence,
      client = this.client;
    return {
      state: this.state,
      stale: this.read && this.state !== 'ready',
      online: this.deps.online(),
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
