import type { BazaarClient, BazaarDay } from '@/lib/data/bazaar-days';
import type { EventEntryScope } from '@/lib/bazaar/event-entry-recovery';
import { readKitchenTransferTarget, type KitchenTransferTarget } from './kitchen-transfer-target';
import { KitchenTransferSession } from '@/lib/bazaar/kitchen-transfer-session';
import type { KitchenTransferRequest } from '@/lib/bazaar/kitchen-transfer';

export interface KitchenTransferView {
  name: string;
  date: string;
  loading: boolean;
  failed: boolean;
  availabilityFailed: boolean;
  phase: KitchenTransferSession['phase'];
  products: Array<{
    id: string;
    name: string;
    source: string;
    disabled: boolean;
    available: number | null;
  }>;
  rows: Array<{
    id: string;
    name: string;
    source: string;
    qty: string;
    busy: boolean;
    pending: boolean;
    confirmed: boolean;
    canSubmit: boolean;
    available: number | null;
    dayTotal: number | null;
    message: string | null;
    edit: (qty: string) => void;
    submit: () => Promise<void>;
    discard: (() => void) | null;
  }>;
  otherSaved: number;
  retry: () => void;
  retryStorage: () => void;
  add: (product: string) => string | null;
  close: () => void;
}
interface Ports {
  scope: EventEntryScope;
  client: BazaarClient;
  bookingId: string;
  dayId: string;
  defaultDrop: number;
  current: () => boolean;
  online: () => boolean;
  changed: () => void;
  close: () => void;
  now: () => number;
  newId: () => string;
  refreshProduction: (request: KitchenTransferRequest) => Promise<boolean>;
  /** Apply only to this held day, preserving locally queued sales; called after a scoped fresh read. */
  updated: (day: BazaarDay) => Promise<boolean>;
  readTarget?: () => Promise<KitchenTransferTarget>;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  lock?: () => Promise<(() => void) | null>;
}
const refused = {
  shortage: 'There are not enough recorded baked cookies. Your entries are kept.',
  source:
    'This flavour uses another stock source for this event. Check its source before trying again.',
  chronology: 'Those cookies were not available at that time. Check the bake and transfer dates.',
  conflict: 'This request needs checking. Your entries are kept.',
  closed: 'This day is closed or cannot receive cookies. Your entries are kept.',
  forbidden: 'Transfers need the full owner workspace. Your entries are kept.',
  invalid: 'Check the whole-cookie quantity and destination. Your entries are kept.',
  unavailable: 'Kitchen transfers are not available here yet. Your entries are kept.'
} as const;

/** One selected day; independent work for other days stays in scoped recovery. */
export class KitchenTransferDesk {
  private readonly session: KitchenTransferSession;
  private target: KitchenTransferTarget | null = null;
  private state: 'loading' | 'read' | 'failed' = 'loading';
  private seq = 0;
  private closed = false;
  private messages = new Map<string, string>();
  constructor(private readonly ports: Readonly<Ports>) {
    this.ports = Object.freeze({
      ...ports,
      scope: Object.freeze({ ...ports.scope })
    });
    this.session = new KitchenTransferSession({
      ...this.ports,
      current: () => this.active(),
      refresh: async (request) => {
        const read = await this.load();
        if (!this.active()) return false;
        const till = read && this.target ? await this.ports.updated(this.target.day) : false;
        if (!this.active()) return false;
        const production = await this.ports.refreshProduction(request);
        return (
          this.active() &&
          read &&
          till &&
          production &&
          !!this.target?.products.every((p) => p.separate || p.available !== null)
        );
      }
    });
  }
  private active() {
    return !this.closed && this.ports.current();
  }
  private changed() {
    if (this.active()) this.ports.changed();
  }
  async open() {
    if (this.active()) await Promise.all([this.session.open(), this.load()]);
  }
  private async load(): Promise<boolean> {
    if (!this.active()) return false;
    const seq = ++this.seq;
    this.state = 'loading';
    this.changed();
    try {
      const target = await (this.ports.readTarget?.() ??
        readKitchenTransferTarget({
          ...this.ports,
          current: () => this.active()
        }));
      if (!this.active() || seq !== this.seq) return false;
      this.target = target;
      this.state = 'read';
      this.changed();
      return true;
    } catch {
      if (this.active() && seq === this.seq) {
        this.state = 'failed';
        this.changed();
      }
      return false;
    }
  }
  private add(productId: string) {
    if (!this.active() || this.state !== 'read' || !this.target || this.target.closed) return null;
    const product = this.target.products.find((item) => item.id === productId);
    if (product && !product.separate)
      return this.session.add({
        day_id: this.ports.dayId,
        product_id: productId,
        source_drop: product.sourceDrop
      });
    return null;
  }
  private canSubmit(id: string) {
    const row = this.session.snapshot().find((item) => item.work_id === id);
    return (
      !!row &&
      (!!row.submitted ||
        (this.state === 'read' &&
          !this.target?.closed &&
          !!this.target?.products.some(
            (p) =>
              p.id === row.product_id &&
              !p.separate &&
              p.sourceDrop === row.source_drop &&
              p.available !== null
          )))
    );
  }
  private async submit(id: string) {
    if (!this.active() || !this.canSubmit(id)) return;
    const result = await this.session.submit(id);
    if (!this.active()) return;
    if (result.outcome === 'refused') await this.load();
    if (!this.active()) return;
    const message =
      result.outcome === 'saved'
        ? result.refreshed
          ? 'Transfer recorded. Balances checked.'
          : 'Transfer recorded. Balances still need checking.'
        : result.outcome === 'unknown'
          ? 'The result is not confirmed. Retry this exact transfer before changing it.'
          : result.outcome === 'refused'
            ? refused[result.reason]
            : result.reason === 'offline'
              ? 'Connect before recording this transfer. Your entries are kept.'
              : result.reason === 'storage'
                ? 'Saved work could not be kept on this device. No transfer was sent.'
                : 'This workspace is not ready to send. Your entries are kept.';
    this.messages.set(id, message);
    this.changed();
  }
  vals(): KitchenTransferView | null {
    if (!this.active()) return null;
    const rows = this.session.snapshot(),
      mine = rows.filter((row) => row.day_id === this.ports.dayId);
    return {
      name: this.target?.name ?? 'Bazaar transfer',
      date: this.target?.date ?? 'Checking destination',
      loading: this.state === 'loading',
      failed: this.state === 'failed',
      availabilityFailed:
        this.state === 'read' &&
        !!this.target?.products.some((p) => !p.separate && p.available === null),
      phase: this.session.phase,
      products:
        this.state === 'read' && !this.target?.closed
          ? (this.target?.products ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              source: p.separate
                ? 'Recorded separately for this event'
                : `From Drop ${p.sourceDrop}`,
              disabled: p.separate || p.available === null,
              available: p.available
            }))
          : [],
      rows: mine.map((row) => ({
        id: row.work_id,
        name: this.target?.products.find((p) => p.id === row.product_id)?.name ?? 'Saved flavour',
        source: `Drop ${row.source_drop}`,
        qty: row.qty_text,
        busy: this.session.isBusy(row.work_id),
        pending: !!row.submitted && !row.receipt,
        confirmed: !!row.receipt,
        canSubmit: this.canSubmit(row.work_id),
        available:
          this.state === 'read'
            ? (this.target?.products.find(
                (p) => p.id === row.product_id && p.sourceDrop === row.source_drop
              )?.available ?? null)
            : null,
        dayTotal:
          this.state === 'read'
            ? (this.target?.products.find(
                (p) => p.id === row.product_id && p.sourceDrop === row.source_drop
              )?.dayTotal ?? null)
            : null,
        message: this.messages.get(row.work_id) ?? null,
        edit: (qty) => {
          if (this.session.edit(row.work_id, qty)) this.messages.delete(row.work_id);
        },
        submit: () => this.submit(row.work_id),
        discard:
          !row.submitted || row.receipt
            ? () => {
                this.session.discard(row.work_id);
              }
            : null
      })),
      otherSaved: rows.length - mine.length,
      retry: () => {
        void this.load();
      },
      retryStorage: () => {
        void this.session.open();
      },
      add: (product) => this.add(product),
      close: () => {
        if (!this.active()) return;
        this.close();
        this.ports.close();
      }
    };
  }
  close() {
    if (this.closed) return;
    this.session.close();
    this.closed = true;
    ++this.seq;
  }
}
