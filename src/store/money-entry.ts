export type MoneyEntryKind = 'expense' | 'draw';

export interface MoneyEntryView {
  kind: MoneyEntryKind;
  step: 'entry' | 'review';
  categories: string[];
  description: string;
  setDescription: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  date: string;
  /** The latest date allowed: today. */
  today: string;
  earliest: string;
  setDate: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  /** The amount as typed, once it is valid; null before that. */
  pesos: number | null;
  error: string | null;
  saving: boolean;
  review: () => void;
  change: () => void;
  save: () => Promise<void>;
  close: () => void;
}

export interface MoneyEntryDeps {
  categories: () => string[];
  /** Today in Manila, as yyyy-mm-dd. */
  today: () => string;
  /** The earliest date allowed: anything older would save and not show on the Money page. */
  earliest: () => string;
  online: () => boolean;
  /** Each returns true once the server has acknowledged it, and has already said why when it returns false. */
  recordExpense: (fields: {
    category: string;
    description: string;
    pesos: number;
    date: string;
  }) => Promise<boolean>;
  recordDraw: (fields: { note: string; pesos: number; date: string }) => Promise<boolean>;
  rerender: () => void;
}

const MAX_PESOS = 1_000_000;
const OFFLINE = 'Saving this needs signal. Your entry is kept, so try again when you are online.';

/**
 * Record expense and Take money out: an entry page, then Review, then one save. It closes only on
 * an acknowledgement; anything else keeps what was typed so it can be sent again as the same entry.
 */
export class MoneyEntry {
  private kind: MoneyEntryKind | null = null;
  private step: 'entry' | 'review' = 'entry';
  private description = '';
  private amount = '';
  private date = '';
  private category = '';
  private error: string | null = null;
  private saving = false;

  constructor(private readonly deps: MoneyEntryDeps) {}

  open(kind: MoneyEntryKind): void {
    this.kind = kind;
    this.step = 'entry';
    this.description = '';
    this.amount = '';
    this.date = this.deps.today();
    this.category = this.deps.categories()[0] ?? '';
    this.error = null;
    this.deps.rerender();
  }

  private pesos(): number | null {
    const value = Number(this.amount);
    if (this.amount.trim() === '' || !Number.isFinite(value)) return null;
    // Whole centavos only: the books hold centavos, and a third decimal would be silently rounded.
    if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) return null;
    return value > 0 && value <= MAX_PESOS ? value : null;
  }

  private problem(): string | null {
    if (this.pesos() === null) return 'Enter an amount from ₱0.01 to ₱1,000,000.';
    if (!this.date || this.date > this.deps.today()) return 'Choose today or an earlier date.';
    if (this.date < this.deps.earliest()) return 'Choose a date in the last 30 days.';
    if (this.kind === 'expense') {
      if (!this.description.trim()) return 'Say what this expense was for.';
      if (!this.category) return 'Choose a category.';
    }
    return null;
  }

  private set(change: () => void): void {
    change();
    this.error = null;
    this.deps.rerender();
  }

  private async saveEntry(): Promise<void> {
    if (this.saving || !this.kind) return;
    const problem = this.problem();
    const pesos = this.pesos();
    if (problem || pesos === null) {
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
    let ok = false;
    try {
      ok =
        this.kind === 'expense'
          ? await this.deps.recordExpense({
              category: this.category,
              description: this.description.trim(),
              pesos,
              date: this.date
            })
          : await this.deps.recordDraw({ note: this.description.trim(), pesos, date: this.date });
    } catch {
      ok = false;
    }
    this.saving = false;
    if (ok) this.kind = null;
    else this.error = 'This was not saved. It is still here, so you can try again.';
    this.deps.rerender();
  }

  vals(): MoneyEntryView | null {
    if (!this.kind) return null;
    return {
      kind: this.kind,
      step: this.step,
      categories: this.deps.categories(),
      description: this.description,
      setDescription: (value) => this.set(() => (this.description = value)),
      amount: this.amount,
      setAmount: (value) => this.set(() => (this.amount = value)),
      date: this.date,
      today: this.deps.today(),
      earliest: this.deps.earliest(),
      setDate: (value) => this.set(() => (this.date = value)),
      category: this.category,
      setCategory: (value) => this.set(() => (this.category = value)),
      pesos: this.pesos(),
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
      save: () => this.saveEntry(),
      close: () => {
        if (this.saving) return;
        this.kind = null;
        this.deps.rerender();
      }
    };
  }
}
