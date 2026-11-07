import type { BazaarClient } from '@/lib/data/bazaar-days';
import type { EventEntryScope } from './event-entry-recovery';
import {
  holdKitchenTransferRecoveryLock,
  readKitchenTransferRecovery,
  writeKitchenTransferRecovery,
  type KitchenTransferRecovery,
  type KitchenTransferWork
} from './kitchen-transfer-recovery';
import {
  kitchenTransferRequestSchema,
  type KitchenTransferOutcome,
  type KitchenTransferRequest
} from './kitchen-transfer';

interface Ports {
  scope: EventEntryScope;
  client: BazaarClient;
  /** Captured verified actor/client epoch; a role name alone is never enough. */
  current: () => boolean;
  online: () => boolean;
  changed: () => void;
  now: () => number;
  newId: () => string;
  /** Refresh must also fence its asynchronous readback against this captured authority. */
  refresh: (request: KitchenTransferRequest) => Promise<boolean>;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  lock?: () => Promise<(() => void) | null>;
}
type Phase = 'closed' | 'loading' | 'ready' | 'locked' | 'invalid' | 'unavailable';
export type TransferSessionResult =
  | (KitchenTransferOutcome & { refreshed?: boolean })
  | {
      outcome: 'blocked';
      reason: 'inactive' | 'offline' | 'busy' | 'storage' | 'not-ready' | 'missing';
    };
const target = kitchenTransferRequestSchema.omit({ id: true, qty: true, at: true });

/** One panel lifetime, one verified scope/client, one Web Lock. Opening never submits. */
export class KitchenTransferSession {
  phase: Phase = 'closed';
  private record: KitchenTransferRecovery;
  private release: (() => void) | null = null;
  private disposed = false;
  private loaded = false;
  private busy = new Set<string>();
  private resolved = new Set<string>();
  constructor(private readonly ports: Readonly<Ports>) {
    this.ports = Object.freeze({ ...ports, scope: Object.freeze({ ...ports.scope }) });
    this.record = { version: 1, scope: { ...ports.scope }, works: [] };
  }
  private active(): boolean {
    return !this.disposed && this.ports.current();
  }
  private changed(): void {
    if (this.active()) this.ports.changed();
  }
  snapshot(): readonly Readonly<KitchenTransferWork>[] {
    return this.active() ? this.record.works.map((work) => Object.freeze({ ...work })) : [];
  }
  isBusy(id: string): boolean {
    return this.busy.has(id);
  }

  async open(): Promise<void> {
    if (!this.active() || this.phase === 'loading') return;
    if (this.loaded && this.release) {
      this.persist();
      this.changed();
      return;
    }
    this.phase = 'loading';
    this.changed();
    const release =
      this.release ??
      (await (this.ports.lock?.() ?? holdKitchenTransferRecoveryLock(this.record.scope)));
    if (!this.active()) {
      release?.();
      return;
    }
    this.release = release;
    if (!release) {
      this.phase = 'locked';
      this.changed();
      return;
    }
    const read = readKitchenTransferRecovery(this.record.scope, this.ports.storage);
    if (read.status === 'invalid' || read.status === 'unavailable') {
      this.phase = read.status;
      this.changed();
      return;
    }
    this.record = read.value ?? { version: 1, scope: { ...this.record.scope }, works: [] };
    this.loaded = true;
    this.phase = 'ready';
    this.changed();
  }
  private persist(): boolean {
    if (!this.active() || !this.loaded || !this.release) return false;
    const saved = writeKitchenTransferRecovery(
      this.record.scope,
      this.record,
      [...this.resolved],
      this.ports.storage
    );
    this.phase = saved ? 'ready' : 'unavailable';
    if (saved) this.resolved.clear();
    return saved;
  }
  add(input: { day_id: string; product_id: string; source_drop: number }): string | null {
    if (!this.active() || this.phase !== 'ready' || !this.release) return null;
    const checked = target.safeParse(input);
    if (!checked.success) return null;
    const work_id = this.ports.newId();
    this.record.works.push({ ...checked.data, work_id, qty_text: '', submitted: null });
    this.persist();
    this.changed();
    return work_id;
  }
  edit(id: string, qty_text: string): boolean {
    if (!this.active() || !this.loaded || !this.release) return false;
    const work = this.record.works.find((item) => item.work_id === id);
    if (!work || work.submitted || this.busy.has(id)) return false;
    work.qty_text = qty_text;
    this.persist();
    this.changed();
    return true;
  }
  discard(id: string): boolean {
    if (!this.active() || !this.loaded || !this.release || this.busy.has(id)) return false;
    const work = this.record.works.find((item) => item.work_id === id);
    if (!work || (work.submitted && !work.receipt)) return false;
    if (work.submitted) this.resolved.add(work.submitted.id);
    this.record.works = this.record.works.filter((item) => item.work_id !== id);
    this.persist();
    this.changed();
    return true;
  }
  close(): void {
    if (this.disposed) return;
    this.persist();
    this.disposed = true;
    this.release?.();
    this.release = null;
  }
}
