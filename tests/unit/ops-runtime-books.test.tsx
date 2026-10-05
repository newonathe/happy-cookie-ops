import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

type Row = Record<string, unknown> & { clientId: string };
const store = new Map<string, Row>();
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    put: async (v: Row) => void store.set(v.clientId, JSON.parse(JSON.stringify(v)) as Row),
    all: async () => [...store.values()],
    get: async (k: string) => store.get(k),
    delete: async (k: string) => void store.delete(k),
    supported: () => true
  }
}));
vi.mock('@/lib/device', () => ({ deviceId: () => 'dev1' }));
const flush = vi.hoisted(() => ({ result: { sent: [] as string[], failed: [], skipped: false } }));
vi.mock('@/lib/offline/sync', async (orig) => ({
  ...(await orig<typeof import('@/lib/offline/sync')>()),
  flushQueue: vi.fn(async () => flush.result)
}));

import { OpsRuntime } from '@/store/ops-runtime';
import { PRODUCTS, type Role } from '@/store/engine/ops-engine';
import type { StaffOrderClient } from '@/lib/data/staff-orders';
import { BOOKS_COPY, STAFF_COPY } from '@/lib/orders/staff-copy';
import { ProfitAndLossScreen } from '@/components/screens/profit-and-loss';

/**
 * E1: in live mode the P&L, Home profit and the expense list read the database's books; plain expenses, draws, cost corrections and
 * the cost basis are recorded there first; the export writes the same numbers. Each `Mutation:` line names a change one of these
 * tests must catch.
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
const MID = 'c3b00000-0000-4000-8000-0000000000b1';
const PID = PRODUCTS[0]!.id;
type Wire = Record<string, unknown>;

const line = (over: Wire = {}): Wire => ({
  id: 'o:HC-1',
  kind: 'revenue',
  cat: 'Orders',
  label: 'Order HC-1',
  amount_cents: 20000,
  at: Date.now() - 1000,
  ...over
});
const wireBooks = (over: Wire = {}): Wire => ({
  basis: 'bought',
  lines: [
    line(),
    line({ id: 'l:1', cat: 'Bazaar', label: 'Stall sale', amount_cents: 30000 }),
    line({ id: 'r:HC-2', kind: 'refund', cat: 'Refunds', label: 'Refund', amount_cents: 5000 }),
    line({ id: 'l:2', kind: 'expense', cat: 'Ingredients', label: 'Flour', amount_cents: 12500 }),
    line({ id: 'l:3', kind: 'draw', cat: 'Owner draw', label: 'Rent share', amount_cents: 10000 })
  ],
  receipts: [
    {
      movement_id: MID,
      item: 'Flour',
      qty: 1000,
      cost_cents: 10000,
      supplier: 'Landers',
      at: Date.now() - 5000
    }
  ],
  ...over
});
const stockItem = (over: Wire = {}): Wire => ({
  id: 'flour',
  name: 'Bread flour',
  category: 'Ingredients',
  unit: 'g',
  on_hand: 4000,
  par_level: 3000,
  pack_size: 1000,
  pack_label: '1 kg',
  supplier_id: null,
  use_by_days: null,
  last_counted: null,
  active: true,
  updated_at: STAMP,
  ...over
});
const order = (): Wire => ({
  id: 'HC-1001',
  name: 'Ana Cruz',
  phone: '09171234567',
  ig: '@ana',
  state: 'Confirmed',
  pay_state: 'confirmed',
  pay_method: 'GCash',
  pay_ref: null,
  total_cents: 20000,
  paid_cents: 20000,
  refund_ref: null,
  pickup_date: '2026-10-05',
  pickup_window: '10:00',
  placed_at: '2026-09-29T01:00:00.000Z',
  updated_at: STAMP,
  status_token: 'b'.repeat(64),
  holds: true,
  items: [{ product_id: PID, qty: 2, unit_price_cents: 10000, unavailable: false }],
  swaps: []
});

const unpaidRaw = (over: Wire = {}): Wire => ({
  ...order(),
  id: 'HC-1002',
  name: 'Ben Diaz',
  state: 'Payment review',
  pay_state: 'unpaid',
  paid_cents: null,
  total_cents: 15000,
  placed_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  ...over
});

interface Fake {
  orders?: Wire[];
  books: Wire;
  /** Answers to a write in order, then the default (saved). */
  answers: Record<string, Array<{ data: unknown; error: unknown }>>;
}
const fresh = (over: Partial<Fake> = {}): Fake => ({ books: wireBooks(), answers: {}, ...over });
const ok = (name: string) =>
  name === 'set_cost_basis'
    ? { data: 'used', error: null }
    : name === 'record_stock_movement'
      ? { data: [{ item_id: 'flour', on_hand: 5000, duplicate: false }], error: null }
      : { data: [{ client_id: 'x', correction_id: 'x', duplicate: false }], error: null };
function fakeClient(f: Fake) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    void args;
    if (name === 'get_books') return { data: f.books, error: null };
    if (name === 'get_stock_catalogue')
      return { data: { suppliers: [], items: [stockItem()], prices: [] }, error: null };
    if (name === 'get_last_paid') return { data: [], error: null };
    if (name === 'get_production')
      return { data: { batches: [], dough: [], baked: [], shortfalls: [] }, error: null };
    if (name === 'get_recipes') return { data: [], error: null };
    if (name === 'get_staff_orders')
      return { data: f.orders ?? [order(), unpaidRaw()], error: null };
    if (
      [
        'record_expense',
        'record_draw',
        'record_cost_correction',
        'set_cost_basis',
        'record_stock_movement'
      ].includes(name)
    )
      return f.answers[name]?.shift() ?? ok(name);
    return { data: [{ replayed: false }], error: null };
  });
  return { rpc, client: { rpc } };
}
const called = (rpc: ReturnType<typeof fakeClient>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const msg = (r: OpsRuntime) => (r.state.toast as { msg?: string } | null)?.msg ?? '';

interface Acts {
  addExpense: (
    cat: string,
    label: string,
    amount: unknown,
    itemName?: string,
    itemQty?: unknown
  ) => void;
  recordDraw: (amount: unknown, note: string) => void;
  exportBooks: () => void;
  orderRevenue: (s: unknown) => number;
  pnlTotals: (s: unknown) => {
    revenue: number;
    totalExp: number;
    profit: number;
    refunded: number;
    draw: number;
    revDrops: number;
    revBazaar: number;
    taxSetAside: number;
    cash: number;
  };
  packOrder: (id: string) => void;
  openBooks: () => Promise<void>;
}
const acts = (r: OpsRuntime) => r as unknown as Acts;

async function mounted(role: Role, f: Fake, load = true) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const c = fakeClient(f);
  await act(async () => {
    await runtime.loadStockCatalogue(c.client as never);
    await runtime.loadOrders(c.client as unknown as StaffOrderClient);
    if (load) await runtime.loadBooks(c.client as never);
  });
  c.rpc.mockClear();
  return { runtime, ...c };
}
const ledger = (r: OpsRuntime) =>
  r.state.ledger as Array<{ id: string; kind: string; cat: string; amount: number }>;

describe('E1: the books on screen and their writes (live mode)', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
    flush.result = { sent: [], failed: [], skipped: false };
  });
  afterEach(() => cleanup());

  it('F2: the live caption describes the rolling ledger period, including across months', async () => {
    const { runtime } = await mounted('owner', fresh());
    act(() => runtime.setState({ now: Date.parse('2026-10-03T04:00:00Z') } as never));
    const vals = runtime.renderVals();
    expect(vals.pl.periodText).toBe('Last 30 days · 3 Sep to 3 Oct');
    const view = render(<ProfitAndLossScreen v={vals} />);
    expect(view.getByText('Profit · Last 30 days · 3 Sep to 3 Oct')).toBeTruthy();
    expect(view.queryByText('Profit · August 2026')).toBeNull();
    act(() => runtime.setState({ now: Date.parse('2026-11-04T04:00:00Z') } as never));
    view.rerender(<ProfitAndLossScreen v={runtime.renderVals()} />);
    expect(view.getByText('Profit · Last 30 days · 5 Oct to 4 Nov')).toBeTruthy();
  });

  it('F2: the original demo caption is retained even when its computed period differs', async () => {
    live = false;
    const { runtime } = await mounted('owner', fresh(), false);
    const vals = runtime.renderVals();
    expect(vals.bareFrame).toBeFalsy();
    const view = render(<ProfitAndLossScreen v={vals} />);
    expect(view.getByText('Profit · August 2026')).toBeTruthy();
    expect(view.queryByText('Profit · ' + vals.pl.periodText)).toBeNull();
  });

  it('the books replace the engine’s ledger and the P&L reads them: revenue less refunds, expenses, and a draw that leaves profit alone', async () => {
    const { runtime } = await mounted('owner', fresh());
    expect(ledger(runtime).map((e) => e.id)).toEqual(['o:HC-1', 'l:1', 'r:HC-2', 'l:2', 'l:3']);
    const t = acts(runtime).pnlTotals(runtime.state);
    expect(t.revenue).toBe(200 + 300 - 50); // paid orders + stall sales - refunds
    expect(t.totalExp).toBe(125);
    expect(t.profit).toBe(450 - 125);
    expect(t.draw).toBe(100);
    // Mutation: reading paid orders under 'Orders' instead of 'Drops' leaves 200 out of revenue.
    // Mutation: counting a draw as an expense moves profit.
  });

  it('includes historical book revenue without assigning it to a sales channel', async () => {
    const base = wireBooks();
    const { runtime } = await mounted(
      'owner',
      fresh({
        books: {
          ...base,
          lines: [
            ...(base.lines as Wire[]),
            line({
              id: 'l:historical-current',
              cat: 'Historical sales',
              label: 'Imported recent sales',
              amount_cents: 60000,
              at: Date.now() - 10 * 86_400_000
            }),
            line({
              id: 'l:historical-old',
              cat: 'Historical sales',
              label: 'Imported old sales',
              amount_cents: 90000,
              at: Date.now() - 31 * 86_400_000
            }),
            line({
              id: 'l:old-expense',
              kind: 'expense',
              cat: 'Old expense',
              amount_cents: 77700,
              at: Date.now() - 31 * 86_400_000
            })
          ]
        }
      })
    );
    const totals = acts(runtime).pnlTotals(runtime.state);
    expect(totals.revDrops).toBe(150); // 200 paid orders less 50 refunded
    expect(totals.revBazaar).toBe(300);
    expect(totals.revenue).toBe(1050);
    expect(totals.totalExp).toBe(125);
    expect(totals.profit).toBe(925);
    expect(totals.draw).toBe(100);
    expect(totals.taxSetAside).toBe(32);
    expect(totals.cash).toBe(825);
  });

  it('the engine’s own count of the open drop’s orders is not added (it would count each paid order twice)', async () => {
    const { runtime } = await mounted('owner', fresh());
    expect((runtime.state as unknown as { orders: unknown[] }).orders.length).toBeGreaterThan(0);
    expect(acts(runtime).orderRevenue(runtime.state)).toBe(0);
    // Mutation: leaving the engine's orderRevenue makes revenue 200 + 20 more.
  });

  it('an older books read never replaces a newer one', async () => {
    const f = fresh();
    const { runtime, rpc } = await mounted('owner', f);
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    rpc.mockImplementationOnce(async () => {
      await slow;
      return { data: wireBooks({ lines: [] }), error: null };
    });
    const older = runtime.loadBooks(null);
    await act(async () => void (await runtime.loadBooks(null)));
    release();
    await act(async () => void (await older));
    expect(ledger(runtime)).toHaveLength(5);
    // Mutation: dropping the sequence guard lets the slow, older answer empty the ledger.
  });

  it('a failed read leaves the ledger as it was', async () => {
    const f = fresh();
    const { runtime, rpc } = await mounted('owner', f);
    rpc.mockImplementationOnce(async () => ({ data: null, error: { code: '42501' } }));
    let ok2 = true;
    await act(async () => void (ok2 = await runtime.loadBooks(null)));
    expect(ok2).toBe(false);
    expect(ledger(runtime)).toHaveLength(5);
  });

  it('a plain expense is recorded first (in her category), then the engine’s toast, then the books are read back once', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).addExpense('Helper wages', 'Week 1', 500));
    await settle();
    const sent = called(rpc, 'record_expense');
    expect(sent).toHaveLength(1);
    expect(sent[0]![1].p_expense).toMatchObject({
      category: 'Helper wages',
      memo: 'Week 1',
      amount_cents: 50000
    });
    expect(called(rpc, 'get_books').length).toBeGreaterThan(0);
    expect(ledger(runtime)).toHaveLength(5); // the engine's own local entry is replaced by the database's lines, not added
    // Mutation: the engine's local entry only would vanish on the next reload.
  });

  it('an expense the engine would refuse, and a helper, record nothing', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).addExpense('', 'x', 500)); // no category: the engine says so
    act(() => acts(runtime).addExpense('Helper wages', 'x', 0));
    await settle();
    expect(called(rpc, 'record_expense')).toHaveLength(0);
    const h = await mounted('helper', fresh());
    act(() => acts(h.runtime).addExpense('Helper wages', 'x', 500));
    await settle();
    expect(called(h.rpc, 'record_expense')).toHaveLength(0);
    expect(msg(h.runtime)).toBe(BOOKS_COPY.ownerOnly);
  });

  it('a lost reply keeps the id (repeating never records twice); a refusal says so', async () => {
    const f = fresh({
      answers: {
        record_expense: [
          { data: null, error: { code: '08006' } },
          { data: null, error: { code: '22023' } }
        ]
      }
    });
    const { runtime, rpc } = await mounted('owner', f);
    act(() => acts(runtime).addExpense('Helper wages', 'Week 1', 500));
    await settle();
    expect(msg(runtime)).toBe(BOOKS_COPY.notSaved);
    act(() => acts(runtime).addExpense('Helper wages', 'Week 1', 500));
    await settle();
    expect(msg(runtime)).toBe(BOOKS_COPY.refused);
    const [a, b] = called(rpc, 'record_expense').map(
      (c) => c[1].p_expense as Record<string, unknown>
    );
    expect(b!.id).toBe(a!.id);
    expect(b!.at).toBe(a!.at);
    // Mutation: minting a new id on every tap lets a lost reply be recorded twice.
  });

  it('a delivery form with no quantity is left to the engine to refuse: nothing is booked on the database', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).addExpense('Ingredients', 'Flour', 420, 'Bread flour', 0));
    act(() => acts(runtime).addExpense('Ingredients', 'Flour', 420, 'Bread flour'));
    // an item the catalogue does not have (switched off, or renamed) is not a plain expense either
    act(() => acts(runtime).addExpense('Ingredients', 'Flour', 420, 'Not in the catalogue', 5));
    await settle();
    expect(called(rpc, 'record_expense')).toHaveLength(0);
    expect(called(rpc, 'record_stock_movement')).toHaveLength(0);
    // Mutation: booking it as a plain expense counts the cost twice when the delivery is entered again with its quantity.
  });

  it('closing a drop no longer claims revenue was booked at that moment (it is booked as orders are paid)', async () => {
    const { runtime } = await mounted('owner', fresh());
    act(() => runtime.setState({ orders: [] } as never));
    const said: string[] = [];
    const spy = vi
      .spyOn(runtime as unknown as { toast: (m: string) => void }, 'toast')
      .mockImplementation((m) => void said.push(m));
    act(() => (runtime as unknown as { closeDrop: () => void }).closeDrop());
    await settle();
    spy.mockRestore();
    expect(
      said.some((m) =>
        /^Drop \d+ closed\. Its paid orders are already in your P&L\. Drop \d+ is open for orders\.$/.test(
          m
        )
      )
    ).toBe(true);
    expect(said.some((m) => m.includes('closed at'))).toBe(false);
    // Mutation: leaving the engine's toast says "closed at ₱0 and booked into your P&L".
  });

  it('a delivery paid for in the expense sheet reads the books back too (its cost is a book entry)', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).addExpense('Ingredients', 'Flour', 420, 'Bread flour', 1000));
    await settle();
    expect(called(rpc, 'record_stock_movement')).toHaveLength(1);
    expect(called(rpc, 'record_expense')).toHaveLength(0);
    expect(called(rpc, 'get_books').length).toBeGreaterThan(0);
  });

  it('a draw is recorded first, once; nothing entered or a helper records nothing', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).recordDraw(0, ''));
    await settle();
    expect(called(rpc, 'record_draw')).toHaveLength(0);
    act(() => acts(runtime).recordDraw(300, 'Rent share'));
    await settle();
    expect(called(rpc, 'record_draw')[0]![1].p_draw).toMatchObject({
      memo: 'Rent share',
      amount_cents: 30000
    });
    expect(called(rpc, 'get_books').length).toBeGreaterThan(0);
    const h = await mounted('helper', fresh());
    act(() => acts(h.runtime).recordDraw(300, 'x'));
    await settle();
    expect(called(h.rpc, 'record_draw')).toHaveLength(0);
  });

  it('a draw whose reply was lost keeps its id; a refusal says so', async () => {
    const f = fresh({
      answers: {
        record_draw: [
          { data: null, error: { code: '08006' } },
          { data: null, error: { code: '22023' } }
        ]
      }
    });
    const { runtime, rpc } = await mounted('owner', f);
    act(() => acts(runtime).recordDraw(300, 'Rent share'));
    await settle();
    expect(msg(runtime)).toBe(BOOKS_COPY.notSaved);
    act(() => acts(runtime).recordDraw(300, 'Rent share'));
    await settle();
    expect(msg(runtime)).toBe(BOOKS_COPY.refused);
    const [a, b] = called(rpc, 'record_draw').map((c) => c[1].p_draw as Record<string, unknown>);
    expect(b!.id).toBe(a!.id);
  });

  it('the books settings form opens on the loaded books: the basis and the deliveries that can be corrected', async () => {
    const { runtime } = await mounted('owner', fresh());
    await act(async () => void (await acts(runtime).openBooks()));
    const v = runtime.renderVals().liveBooks;
    expect(v?.basis).toBe('bought');
    expect(v?.receipts).toHaveLength(1);
    expect(v?.receipts[0]?.movementId).toBe(MID);
    expect(v?.receipts[0]?.label).toContain('Flour');
    // Not offered to a helper, nor with another sheet open.
    const h = await mounted('helper', fresh());
    await act(async () => void (await acts(h.runtime).openBooks()));
    expect(h.runtime.renderVals().liveBooks).toBeFalsy();
  });

  it('the books form tracks the orders still owed money: who, how much, how long, and the total', async () => {
    const { runtime } = await mounted('owner', fresh());
    await act(async () => void (await acts(runtime).openBooks()));
    const u = runtime.renderVals().liveBooks?.unpaid;
    expect(u?.summary).toBe(BOOKS_COPY.unpaidSummary(1, '₱150'));
    expect(u?.rows).toEqual([
      {
        id: 'HC-1002',
        title: 'HC-1002 · Ben Diaz',
        detail: BOOKS_COPY.unpaidWaiting + ' · ' + BOOKS_COPY.unpaidDays(3),
        amount: '₱150'
      }
    ]);
    // Mutation: counting the paid order too puts HC-1001 on the tracker.
  });

  it('with nobody owing anything the tracker says so', async () => {
    const { runtime } = await mounted('owner', fresh({ orders: [order()] }));
    await act(async () => void (await acts(runtime).openBooks()));
    const u = runtime.renderVals().liveBooks?.unpaid;
    expect(u?.rows).toEqual([]);
    expect(u?.summary).toBe(BOOKS_COPY.unpaidNone);
  });

  it('choosing how stock is costed saves it, reads the books again and says what changed', async () => {
    const f = fresh();
    const { runtime, rpc } = await mounted('owner', f);
    await act(async () => void (await acts(runtime).openBooks()));
    rpc.mockClear();
    f.books = wireBooks({ basis: 'used' });
    act(() => runtime.renderVals().liveBooks!.setBasis('used'));
    await settle();
    expect(called(rpc, 'set_cost_basis')[0]![1]).toEqual({ p_basis: 'used' });
    expect(msg(runtime)).toBe(BOOKS_COPY.basisSaved('used'));
    expect(runtime.renderVals().liveBooks?.basis).toBe('used');
    // Mutation: not reading the books again leaves the old basis on the form.
  });

  it('a wrong basis answer and a refusal are told, not shown as saved', async () => {
    const f = fresh({
      answers: {
        set_cost_basis: [
          { data: null, error: { code: '22023' } },
          { data: null, error: { code: '08006' } }
        ]
      }
    });
    const { runtime } = await mounted('owner', f);
    await act(async () => void (await acts(runtime).openBooks()));
    act(() => runtime.renderVals().liveBooks!.setBasis('used'));
    await settle();
    expect(msg(runtime)).toBe(BOOKS_COPY.refused);
    act(() => runtime.renderVals().liveBooks!.setBasis('used'));
    await settle();
    expect(msg(runtime)).toBe(BOOKS_COPY.notSaved);
  });

  it('correcting a delivery cost sends the new cost in centavos, once, then reads the books and the last price paid again', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    await act(async () => void (await acts(runtime).openBooks()));
    rpc.mockClear();
    act(() => runtime.renderVals().liveBooks!.correct(MID, '90'));
    await settle();
    expect(called(rpc, 'record_cost_correction')[0]![1].p_corr).toMatchObject({
      movement_id: MID,
      cost_cents: 9000
    });
    expect(called(rpc, 'get_books').length).toBeGreaterThan(0);
    expect(called(rpc, 'get_last_paid').length).toBeGreaterThan(0);
    expect(msg(runtime)).toBe(BOOKS_COPY.corrected);
    // Mutation: pesos sent as centavos corrects a ₱90 delivery to ₱0.90.
  });

  it('a correction with nothing or a negative entered, or a lost reply, records nothing new; the id is kept', async () => {
    const f = fresh({
      answers: { record_cost_correction: [{ data: null, error: { code: '08006' } }] }
    });
    const { runtime, rpc } = await mounted('owner', f);
    await act(async () => void (await acts(runtime).openBooks()));
    act(() => runtime.renderVals().liveBooks!.correct(MID, ''));
    act(() => runtime.renderVals().liveBooks!.correct(MID, '-5'));
    await settle();
    expect(called(rpc, 'record_cost_correction')).toHaveLength(0);
    act(() => runtime.renderVals().liveBooks!.correct(MID, '90'));
    await settle();
    expect(msg(runtime)).toBe(BOOKS_COPY.notSaved);
    act(() => runtime.renderVals().liveBooks!.correct(MID, '90'));
    await settle();
    const [a, b] = called(rpc, 'record_cost_correction').map(
      (c) => c[1].p_corr as Record<string, unknown>
    );
    expect(b!.id).toBe(a!.id);
  });

  it('the export writes the database’s books as a CSV, for the last 13 months', async () => {
    const created: Blob[] = [];
    // jsdom has no object URLs: the test supplies them.
    const real = { c: URL.createObjectURL, r: URL.revokeObjectURL };
    URL.createObjectURL = (b: Blob | MediaSource) => (created.push(b as Blob), 'blob:x');
    URL.revokeObjectURL = () => undefined;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).exportBooks());
    await settle();
    const period = called(rpc, 'get_books')[0]![1] as { p_from: string; p_to: string };
    const days = (Date.parse(period.p_to) - Date.parse(period.p_from)) / 86_400_000;
    expect(days).toBeGreaterThan(390);
    expect(days).toBeLessThanOrEqual(400);
    expect(click).toHaveBeenCalledTimes(1);
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(created[0]!);
    });
    expect(text.split('\n')[0]).toBe('Date,Type,Category,Description,Amount (pesos),Cost basis');
    expect(text).toContain('"draw","Owner draw","Rent share",100.00');
    expect(msg(runtime)).toBe(BOOKS_COPY.downloaded);
    URL.createObjectURL = real.c;
    URL.revokeObjectURL = real.r;
    click.mockRestore();
    // Mutation: the engine's own export would write the empty local ledger.
  });

  it('a helper gets no export, and an offline export says so', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const h = await mounted('helper', fresh());
    act(() => acts(h.runtime).exportBooks());
    await settle();
    expect(msg(h.runtime)).toBe(BOOKS_COPY.ownerOnly);
    const { runtime, rpc } = await mounted('owner', fresh());
    rpc.mockImplementation(async () => ({ data: null, error: { code: '08006' } }));
    act(() => acts(runtime).exportBooks());
    await settle();
    expect(msg(runtime)).toBe(STAFF_COPY.offline);
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });

  it('what changes the books elsewhere reads them again: an order moved on, a bazaar sale that reached the server', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).packOrder('HC-1001'));
    await settle();
    expect(called(rpc, 'get_books').length).toBeGreaterThan(0);
    rpc.mockClear();
    await act(async () => void (await runtime.flushSales()));
    await settle();
    expect(called(rpc, 'get_books')).toHaveLength(0);
    flush.result = { sent: ['dev1:S1:1'], failed: [], skipped: false };
    await act(async () => void (await runtime.flushSales()));
    await settle();
    expect(called(rpc, 'get_books').length).toBeGreaterThan(0);
    // Mutation: not reading the books after a paid tick leaves the P&L on the old revenue until a reload.
  });
});
