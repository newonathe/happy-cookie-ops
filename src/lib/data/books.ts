import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { centavosToPesos } from '@/lib/money';

/**
 * The owner's books (E1; `get_books` / `record_expense` / `record_cost_correction` / `set_cost_basis`, migration 20260101004900).
 * Revenue is each order when it was first paid (less refunds) and each stall sale; costs are each delivery when it was bought or,
 * by the owner's choice, stock when it was used; plain expenses are in her categories. The database works out every line: this file
 * mirrors the bounds of what the owner enters (`expenseError`, `correctionError`), turns the lines into the engine's ledger entries
 * (`engineLedger`) and writes the CSV (`booksCsv`).
 */
export type BooksClient = Pick<SupabaseClient<Database>, 'rpc'>;

export type CostBasis = 'bought' | 'used';

export interface BookLine {
  id: string;
  kind: 'revenue' | 'refund' | 'expense' | 'draw';
  cat: string;
  label: string;
  /** Centavos: positive, except a correcting expense, which is negative when it lowers a cost. */
  amountCents: number;
  /** Epoch milliseconds. */
  at: number;
}

export interface ReceiptRow {
  movementId: string;
  item: string;
  qty: number;
  costCents: number;
  supplier: string;
  at: number;
}

export interface Books {
  basis: CostBasis;
  lines: BookLine[];
  receipts: ReceiptRow[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Strict: anything unexpected is no answer at all, so the screens never show half of the books. */
export function parseBooks(json: Json | null | undefined): Books | null {
  if (!isObj(json) || (json.basis !== 'bought' && json.basis !== 'used')) return null;
  if (!Array.isArray(json.lines) || !Array.isArray(json.receipts)) return null;
  const lines: BookLine[] = [];
  for (const l of json.lines) {
    if (
      !isObj(l) ||
      typeof l.id !== 'string' ||
      (l.kind !== 'revenue' && l.kind !== 'refund' && l.kind !== 'expense' && l.kind !== 'draw') ||
      typeof l.cat !== 'string' ||
      typeof l.label !== 'string' ||
      typeof l.amount_cents !== 'number' ||
      typeof l.at !== 'number'
    )
      return null;
    lines.push({
      id: l.id,
      kind: l.kind,
      cat: l.cat,
      label: l.label,
      amountCents: l.amount_cents,
      at: l.at
    });
  }
  const receipts: ReceiptRow[] = [];
  for (const r of json.receipts) {
    if (
      !isObj(r) ||
      typeof r.movement_id !== 'string' ||
      typeof r.item !== 'string' ||
      typeof r.qty !== 'number' ||
      typeof r.cost_cents !== 'number' ||
      typeof r.supplier !== 'string' ||
      typeof r.at !== 'number'
    )
      return null;
    receipts.push({
      movementId: r.movement_id,
      item: r.item,
      qty: r.qty,
      costCents: r.cost_cents,
      supplier: r.supplier,
      at: r.at
    });
  }
  return { basis: json.basis, lines, receipts };
}

export async function fetchBooks(
  client: BooksClient,
  fromMs: number,
  toMs: number
): Promise<Books> {
  const { data, error } = await client.rpc('get_books', {
    p_from: new Date(fromMs).toISOString(),
    p_to: new Date(toMs).toISOString()
  });
  if (error) throw new Error('books load failed: ' + (error.code || error.message));
  const books = parseBooks(data);
  if (!books) throw new Error('books answer was not understood');
  return books;
}

/**
 * The engine's ledger entries (`{ id, kind, at, cat, label, amount }`, positive pesos): a paid order is revenue under 'Drops' (which
 * the P&L reads as booked drops), a stall sale is revenue under 'Bazaar', a refund is a refund, every cost is an expense, and
 * money the owner took out is a draw (outside expenses, so profit does not move).
 */
export function engineLedger(lines: readonly BookLine[]) {
  return lines.map((l) => ({
    id: l.id,
    kind: l.kind,
    at: l.at,
    cat: l.kind === 'revenue' && l.cat === 'Orders' ? 'Drops' : l.kind === 'draw' ? 'Owner drawings' : l.cat,
    label: l.label,
    amount: centavosToPesos(l.amountCents)
  }));
}

const esc = (v: unknown): string => '"' + String(v ?? '').replace(/"/g, '""') + '"';
const isoMinute = (ms: number): string => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');

/** The books as a spreadsheet: one row per line, oldest first, amounts in pesos (a refund and an expense are costs to the business). */
export function booksCsv(books: Books): string {
  const rows = [
    ['Date', 'Type', 'Category', 'Description', 'Amount (pesos)', 'Cost basis'].join(',')
  ];
  for (const l of [...books.lines].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)))
    rows.push(
      [
        esc(isoMinute(l.at)),
        esc(l.kind),
        esc(l.cat),
        esc(l.label),
        (l.amountCents / 100).toFixed(2),
        esc(books.basis)
      ].join(',')
    );
  return rows.join('\n') + '\n';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const validAt = (at: number): boolean =>
  Number.isInteger(at) && at >= 100_000_000_000 && at <= 99_999_999_999_999;

export interface ExpenseFields {
  id: string;
  category: string;
  memo: string;
  amountCents: number;
  at: number;
}

/** The same bounds `record_expense` enforces. Null means the expense is acceptable. */
export function expenseError(f: ExpenseFields): string | null {
  if (!UUID.test(f.id)) return 'This change has no id yet. Reload and try again.';
  const category = f.category.trim();
  const memo = f.memo.trim();
  if (
    category.length < 1 ||
    category.length > 60 ||
    memo.length > 120 ||
    CONTROL.test(category + memo)
  )
    return 'A category is 1 to 60 characters and a description at most 120.';
  if (!Number.isInteger(f.amountCents) || f.amountCents < 1 || f.amountCents > 100_000_000)
    return 'An amount is from ₱0.01 to ₱1,000,000.';
  if (!validAt(f.at)) return 'The time is not valid.';
  return null;
}

export interface DrawFields {
  id: string;
  memo: string;
  amountCents: number;
  at: number;
}

/** The same bounds `record_draw` enforces. Null means the draw is acceptable. */
export function drawError(f: DrawFields): string | null {
  if (!UUID.test(f.id)) return 'This change has no id yet. Reload and try again.';
  const memo = f.memo.trim();
  if (memo.length > 120 || CONTROL.test(memo)) return 'A description is at most 120 characters.';
  if (!Number.isInteger(f.amountCents) || f.amountCents < 1 || f.amountCents > 100_000_000)
    return 'An amount is from ₱0.01 to ₱1,000,000.';
  if (!validAt(f.at)) return 'The time is not valid.';
  return null;
}

export interface CorrectionFields {
  id: string;
  movementId: string;
  costCents: number;
  at: number;
}

/** The same bounds `record_cost_correction` enforces. Null means the correction is acceptable. */
export function correctionError(f: CorrectionFields): string | null {
  if (!UUID.test(f.id) || !UUID.test(f.movementId))
    return 'This change has no id yet. Reload and try again.';
  if (!Number.isInteger(f.costCents) || f.costCents < 0 || f.costCents > 100_000_000)
    return 'A cost is from ₱0 to ₱1,000,000.';
  if (!validAt(f.at)) return 'The time is not valid.';
  return null;
}

export type BooksOutcome = 'saved' | 'refused' | 'offline';

function classify(code: string | undefined): BooksOutcome {
  return ['22023', '23505', '42501', 'P0002', '23503'].includes(code ?? '') ? 'refused' : 'offline';
}

/** Sends one expense. `saved` includes an identical retry (answered, never applied twice). */
export async function recordExpense(client: BooksClient, f: ExpenseFields): Promise<BooksOutcome> {
  try {
    const { data, error } = await client.rpc('record_expense', {
      p_expense: {
        id: f.id,
        category: f.category.trim(),
        memo: f.memo.trim(),
        amount_cents: f.amountCents,
        at: f.at
      }
    });
    if (error) return classify(error.code);
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    return row && typeof row.duplicate === 'boolean' ? 'saved' : 'offline';
  } catch {
    return 'offline';
  }
}

/** Sends one draw. `saved` includes an identical retry (answered, never applied twice). */
export async function recordDraw(client: BooksClient, f: DrawFields): Promise<BooksOutcome> {
  try {
    const { data, error } = await client.rpc('record_draw', {
      p_draw: { id: f.id, memo: f.memo.trim(), amount_cents: f.amountCents, at: f.at }
    });
    if (error) return classify(error.code);
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    return row && typeof row.duplicate === 'boolean' ? 'saved' : 'offline';
  } catch {
    return 'offline';
  }
}

/** Sends one correction of a delivery's cost. `saved` includes an identical retry. */
export async function recordCostCorrection(
  client: BooksClient,
  f: CorrectionFields
): Promise<BooksOutcome> {
  try {
    const { data, error } = await client.rpc('record_cost_correction', {
      p_corr: { id: f.id, movement_id: f.movementId, cost_cents: f.costCents, at: f.at }
    });
    if (error) return classify(error.code);
    const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
    return row && typeof row.duplicate === 'boolean' ? 'saved' : 'offline';
  } catch {
    return 'offline';
  }
}

export async function saveCostBasis(client: BooksClient, basis: CostBasis): Promise<BooksOutcome> {
  try {
    const { data, error } = await client.rpc('set_cost_basis', { p_basis: basis });
    if (error) return classify(error.code);
    return data === basis ? 'saved' : 'offline';
  } catch {
    return 'offline';
  }
}
