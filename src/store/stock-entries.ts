/** One item as the delivery and waste pages need it. Unknown stock is null, never 0. */
export interface StockEntryItem {
  name: string;
  unit: string;
  /** The saved base-unit quantity of one pack, or null when none is saved. */
  packSize: number | null;
  supplier: string | null;
  onHand: number | null;
}

export interface StockEntryDeps {
  items: () => StockEntryItem[];
  suppliers: () => string[];
  online: () => boolean;
  toast: (text: string, kind?: 'ok' | 'warn') => void;
  rerender: () => void;
}

const positive = (text: string): number | null => {
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value > 0 ? value : null;
};

const OFFLINE =
  'Saving this needs signal. Your entries are kept, so try again when you are online.';

export interface ReceiveLineView {
  key: number;
  itemName: string;
  unit: string;
  packs: string;
  perPack: string;
  paid: string;
  setItem: (name: string) => void;
  setPacks: (value: string) => void;
  setPerPack: (value: string) => void;
  setPaid: (value: string) => void;
  remove?: () => void;
  /** "1,000 g received", worked out from packs × per pack, for the Review page. */
  receivedText: string;
  /** "After receipt: 1,800 g", or null when the stock before it is unknown. */
  afterText: string | null;
  /** The peso amount entered, or null when it is left for later. */
  paidPesos: number | null;
}

export interface ReceiveDeliveryView {
  step: 'entry' | 'review';
  items: string[];
  suppliers: string[];
  supplier: string;
  setSupplier: (name: string) => void;
  lines: ReceiveLineView[];
  addLine: () => void;
  error: string | null;
  saving: boolean;
  /** The sum of what was entered, or null when no line has an amount. */
  totalPaid: number | null;
  /** Some lines have no amount: the delivery still records, and their cost stays pending. */
  someUnpriced: boolean;
  review: () => void;
  change: () => void;
  save: () => Promise<void>;
  close: () => void;
}

interface ReceiveLine {
  key: number;
  itemName: string;
  packs: string;
  perPack: string;
  paid: string;
}

export interface ReceiveDeliveryDeps extends StockEntryDeps {
  /** Records one line and runs the shop's own bookkeeping for it. False means it was not saved and has already said why. */
  receiveLine: (name: string, qty: number, paidPesos: number, supplier: string) => Promise<boolean>;
  /** Reads stock and the books back, once the delivery is finished. */
  refresh: () => Promise<void>;
}

/**
 * Receive delivery: several items from one supplier, reviewed before anything is saved. Lines save
 * one at a time; a saved line leaves the list, and a line that could not be saved stays as typed.
 * Sending it again is the same movement: the runtime matches a repeated entry to its first attempt.
 */
export class ReceiveDelivery {
  private open_ = false;
  private step: 'entry' | 'review' = 'entry';
  private supplier = '';
  private lines: ReceiveLine[] = [];
  private nextKey = 1;
  private error: string | null = null;
  private saving = false;

  constructor(private readonly deps: ReceiveDeliveryDeps) {}

  private item(name: string): StockEntryItem | undefined {
    return this.deps.items().find((row) => row.name === name);
  }

  private blankLine(itemName: string): ReceiveLine {
    const size = this.item(itemName)?.packSize;
    return {
      key: this.nextKey++,
      itemName,
      packs: '',
      perPack: size ? String(size) : '',
      paid: ''
    };
  }

  /** Opens the page, on a named item when one was chosen. A delivery already typed is kept. */
  open(itemName?: string): void {
    if (!this.open_ || !this.lines.length) {
      const first = itemName ?? this.deps.items()[0]?.name ?? '';
      this.lines = [this.blankLine(first)];
      this.supplier = this.item(first)?.supplier ?? this.deps.suppliers()[0] ?? '';
      this.step = 'entry';
      this.error = null;
    }
    this.open_ = true;
    this.deps.rerender();
  }

  private patch(key: number, change: Partial<ReceiveLine>): void {
    this.lines = this.lines.map((line) => (line.key === key ? { ...line, ...change } : line));
    this.error = null;
    this.deps.rerender();
  }

  private problem(): string | null {
    if (!this.lines.length) return 'Add an item first.';
    for (const line of this.lines) {
      if (!this.item(line.itemName)) return 'Choose an item for each line.';
      if (positive(line.packs) === null || positive(line.perPack) === null)
        return 'Enter the packs and the quantity per pack that actually arrived.';
      if (line.paid.trim() !== '' && positive(line.paid) === null)
        return 'Enter what you paid as an amount above zero, or leave it empty.';
    }
    return null;
  }

  private qty(line: ReceiveLine): number {
    return (positive(line.packs) ?? 0) * (positive(line.perPack) ?? 0);
  }

  private async saveAll(): Promise<void> {
    if (this.saving) return;
    const problem = this.problem();
    if (problem) {
      this.error = problem;
      this.step = 'entry';
      return this.deps.rerender();
    }
    if (!this.deps.online()) {
      this.error = OFFLINE;
      return this.deps.rerender();
    }
    this.saving = true;
    this.error = null;
    this.deps.rerender();
    let saved = 0;
    for (const line of [...this.lines]) {
      let ok = false;
      try {
        ok = await this.deps.receiveLine(
          line.itemName,
          this.qty(line),
          positive(line.paid) ?? 0,
          this.supplier
        );
      } catch {
        ok = false;
      }
      if (!ok) {
        this.error = `${saved ? `${saved} saved. ` : ''}${line.itemName} was not saved. It is still here, so you can try again.`;
        break;
      }
      saved += 1;
      this.lines = this.lines.filter((row) => row.key !== line.key);
    }
    // Always read back: what the database holds is what the screen shows, whatever happened above.
    try {
      await this.deps.refresh();
    } catch {
      // The next read corrects it. The lines still here show what is not saved.
    }
    this.saving = false;
    if (!this.lines.length) {
      this.open_ = false;
      this.step = 'entry';
      this.deps.toast('Delivery recorded.');
    }
    this.deps.rerender();
  }

  vals(): ReceiveDeliveryView | null {
    if (!this.open_) return null;
    const items = this.deps.items();
    const lines = this.lines.map((line): ReceiveLineView => {
      const row = this.item(line.itemName);
      const unit = row?.unit ?? '';
      const qty = this.qty(line);
      const paidPesos = positive(line.paid);
      return {
        key: line.key,
        itemName: line.itemName,
        unit,
        packs: line.packs,
        perPack: line.perPack,
        paid: line.paid,
        setItem: (name) => {
          const size = this.item(name)?.packSize;
          this.patch(line.key, { itemName: name, perPack: size ? String(size) : '' });
        },
        setPacks: (value) => this.patch(line.key, { packs: value }),
        setPerPack: (value) => this.patch(line.key, { perPack: value }),
        setPaid: (value) => this.patch(line.key, { paid: value }),
        ...(this.lines.length > 1
          ? {
              remove: () => {
                this.lines = this.lines.filter((other) => other.key !== line.key);
                this.deps.rerender();
              }
            }
          : {}),
        receivedText: `${qty.toLocaleString('en-PH')} ${unit} received`,
        afterText:
          row && row.onHand !== null
            ? `After receipt: ${(row.onHand + qty).toLocaleString('en-PH')} ${unit}`
            : null,
        paidPesos
      };
    });
    const paid = lines.map((line) => line.paidPesos).filter((value) => value !== null);
    return {
      step: this.step,
      items: items.map((row) => row.name),
      suppliers: this.deps.suppliers(),
      supplier: this.supplier,
      setSupplier: (name) => {
        this.supplier = name;
        this.deps.rerender();
      },
      lines,
      addLine: () => {
        const used = new Set(this.lines.map((line) => line.itemName));
        const next = items.find((row) => !used.has(row.name)) ?? items[0];
        this.lines = [...this.lines, this.blankLine(next?.name ?? '')];
        this.deps.rerender();
      },
      error: this.error,
      saving: this.saving,
      totalPaid: paid.length ? paid.reduce((sum, value) => sum + value, 0) : null,
      someUnpriced: paid.length < lines.length,
      review: () => {
        this.error = this.problem();
        if (!this.error) this.step = 'review';
        this.deps.rerender();
      },
      change: () => {
        if (this.saving) return;
        this.step = 'entry';
        this.deps.rerender();
      },
      save: () => this.saveAll(),
      close: () => {
        if (this.saving) return;
        this.open_ = false;
        this.lines = [];
        this.step = 'entry';
        this.error = null;
        this.deps.rerender();
      }
    };
  }
}

export type StockChangeReason = 'Waste' | 'Correction';
export type StockChangeDirection = 'remove' | 'add';

export interface StockChangeView {
  step: 'entry' | 'review';
  itemName: string;
  unit: string;
  reason: StockChangeReason | '';
  setReason: (reason: StockChangeReason | '') => void;
  direction: StockChangeDirection;
  setDirection: (direction: StockChangeDirection) => void;
  amount: string;
  setAmount: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  /** "800 g", or null when the stock is unknown. */
  beforeText: string | null;
  afterText: string | null;
  error: string | null;
  saving: boolean;
  review: () => void;
  change: () => void;
  save: () => Promise<void>;
  close: () => void;
}

export interface StockChangeDeps extends StockEntryDeps {
  /** A waste movement. False means it was not saved and has already said why. */
  recordWaste: (name: string, qty: number, note: string) => Promise<boolean>;
  /** A signed correction. False means it was not saved and has already said why. */
  recordCorrection: (name: string, signedQty: number, note: string) => Promise<boolean>;
}

/** Waste / correction: one item, one reason, reviewed before saving. It never removes more than is there. */
export class StockChange {
  private itemName: string | null = null;
  private step: 'entry' | 'review' = 'entry';
  private reason: StockChangeReason | '' = '';
  private direction: StockChangeDirection = 'remove';
  private amount = '';
  private note = '';
  private error: string | null = null;
  private saving = false;

  constructor(private readonly deps: StockChangeDeps) {}

  open(itemName: string, reason: StockChangeReason | '' = ''): void {
    this.itemName = itemName;
    this.step = 'entry';
    this.reason = reason;
    this.direction = 'remove';
    this.amount = '';
    this.note = '';
    this.error = null;
    this.deps.rerender();
  }

  private item(): StockEntryItem | undefined {
    return this.deps.items().find((row) => row.name === this.itemName);
  }

  /** Waste always takes stock away. A correction goes either way. */
  private removing(): boolean {
    return this.reason === 'Waste' || this.direction === 'remove';
  }

  private problem(): string | null {
    const amount = positive(this.amount);
    if (!this.reason || amount === null || !this.note.trim())
      return 'Choose a reason, enter the quantity and say what happened.';
    const onHand = this.item()?.onHand;
    if (this.removing() && onHand !== null && onHand !== undefined && amount > onHand)
      return 'That is more than the recorded stock. Count the item first if the record is wrong.';
    return null;
  }

  private set(change: () => void): void {
    change();
    this.error = null;
    this.deps.rerender();
  }

  private async saveChange(): Promise<void> {
    if (this.saving || !this.itemName) return;
    const problem = this.problem();
    if (problem) {
      this.error = problem;
      this.step = 'entry';
      return this.deps.rerender();
    }
    if (!this.deps.online()) {
      this.error = OFFLINE;
      return this.deps.rerender();
    }
    this.saving = true;
    this.error = null;
    this.deps.rerender();
    const amount = positive(this.amount) ?? 0;
    let ok = false;
    try {
      ok =
        this.reason === 'Waste'
          ? await this.deps.recordWaste(this.itemName, amount, this.note.trim())
          : await this.deps.recordCorrection(
              this.itemName,
              this.removing() ? -amount : amount,
              this.note.trim()
            );
    } finally {
      this.saving = false;
    }
    if (ok) this.itemName = null;
    else this.error = 'This change was not saved. It is still here, so you can try again.';
    this.deps.rerender();
  }

  vals(): StockChangeView | null {
    const name = this.itemName;
    if (!name) return null;
    const item = this.item();
    const unit = item?.unit ?? '';
    const onHand = item?.onHand ?? null;
    const amount = positive(this.amount) ?? 0;
    const text = (value: number) => `${value.toLocaleString('en-PH')} ${unit}`;
    return {
      step: this.step,
      itemName: name,
      unit,
      reason: this.reason,
      setReason: (reason) => this.set(() => (this.reason = reason)),
      direction: this.direction,
      setDirection: (direction) => this.set(() => (this.direction = direction)),
      amount: this.amount,
      setAmount: (value) => this.set(() => (this.amount = value)),
      note: this.note,
      setNote: (value) => this.set(() => (this.note = value)),
      beforeText: onHand === null ? null : text(onHand),
      afterText: onHand === null ? null : text(onHand + (this.removing() ? -amount : amount)),
      error: this.error,
      saving: this.saving,
      review: () => {
        this.error = this.problem();
        if (!this.error) this.step = 'review';
        this.deps.rerender();
      },
      change: () => {
        if (this.saving) return;
        this.step = 'entry';
        this.deps.rerender();
      },
      save: () => this.saveChange(),
      close: () => {
        if (this.saving) return;
        this.itemName = null;
        this.deps.rerender();
      }
    };
  }
}
