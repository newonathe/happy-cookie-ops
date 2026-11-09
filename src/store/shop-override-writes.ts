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

/** Acknowledgements may finish in any order; only the originating action may run. */
export class ShopOverrideWrites {
  private sequence = 0;
  constructor(
    private readonly deps: {
      retireReads: () => void;
      refresh: (client: ShopStatusClient) => void;
    }
  ) {}
  async save(
    client: ShopStatusClient,
    mode: ShopOverride | null,
    scope: { owner: () => boolean; action: () => boolean },
    apply: () => void
  ): Promise<OverrideOutcome | 'retired'> {
    const sequence = ++this.sequence;
    const outcome = await saveShopOverride(client, mode);
    if (!scope.owner()) return 'retired';
    if (outcome !== 'saved') return scope.action() ? outcome : 'retired';
    if (sequence !== this.sequence || !scope.action()) {
      this.deps.refresh(client);
      return 'retired';
    }
    this.deps.retireReads();
    apply();
    return 'saved';
  }
}
