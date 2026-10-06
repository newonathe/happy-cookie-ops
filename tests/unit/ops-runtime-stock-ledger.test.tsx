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

import { OpsRuntime } from '@/store/ops-runtime';
import type { Role } from '@/store/engine/ops-engine';

/**
 * C1: the quantity of a stock item is a ledger. In live mode the ported receive, count, adjust and waste actions record a
 * movement on the database and the screen then shows what the database holds; the engine's own Undo (which would change only
 * this screen) is not offered. Each `Mutation:` line names a change one of these tests must catch.
 */
const STAMP = '2026-09-30T02:00:00.123456+00:00';
type Wire = Record<string, unknown>;

const item = (over: Wire = {}): Wire => ({
  id: 'butter',
  name: 'Unsalted butter',
  category: 'Ingredients',
  unit: 'g',
  on_hand: 900,
  par_level: 2000,
  pack_size: 1000,
  pack_label: '1 kg block',
  supplier_id: 'sr',
  use_by_days: null,
  last_counted: null,
  active: true,
  updated_at: STAMP,
  ...over
});
const catalogue = (): Wire => ({
  suppliers: [
    {
      id: 'sr',
      name: 'S&R Membership',
      phone: '',
      notes: '',
      place: '',
      active: true,
      updated_at: STAMP
    }
  ],
  items: [
    item(),
    item({
      id: 'flour',
      name: 'Bread flour',
      on_hand: 4000,
      par_level: 3000,
      pack_size: 1000,
      pack_label: '1 kg'
    }),
    item({
      id: 'box',
      name: 'Box of 6',
      category: 'Packaging',
      unit: 'pcs',
      on_hand: 9,
      par_level: 20,
      pack_size: 25,
      supplier_id: null
    })
  ],
  prices: []
});

interface Fake {
  data: Wire;
  movement: { data: unknown; error: unknown };
  /** Answers to record_stock_movement in order, then `movement` for the rest. */
  movements?: Array<{ data: unknown; error: unknown }>;
  lastPaid: unknown[];
}
function fakeClient(state: Fake) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'get_stock_catalogue') return { data: state.data, error: null };
    if (name === 'get_last_paid') return { data: state.lastPaid, error: null };
    if (name === 'record_stock_movement') {
      const r = state.movements?.shift() ?? state.movement;
      if (!(r as { error: unknown }).error) {
        // The database applies it: the fake keeps the same arithmetic so the screen reads a real answer back.
        const m = args!.p_movement as { item_id: string; kind: string; qty: number };
        const items = state.data.items as Wire[];
        const it = items.find((x) => x.id === m.item_id);
        if (it) {
          const on = it.on_hand as number;
          it.on_hand =
            m.kind === 'count'
              ? m.qty
              : m.kind === 'waste'
                ? Math.max(0, on - m.qty)
                : m.kind === 'adjust'
                  ? Math.max(0, on + m.qty)
                  : on + m.qty;
        }
      }
      return r;
    }
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } };
}
const called = (rpc: ReturnType<typeof fakeClient>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;
const fresh = (over: Partial<Fake> = {}): Fake => ({
  data: catalogue(),
  movement: { data: [{ item_id: 'x', on_hand: 0, duplicate: false }], error: null },
  lastPaid: [],
  ...over
});

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))));
const toast = (r: OpsRuntime) => r.state.toast as { msg?: string; undo?: unknown } | null;
const msg = (r: OpsRuntime) => toast(r)?.msg ?? '';
const qty = (r: OpsRuntime, name: string) =>
  (r.state.inv as Array<{ name: string; qty: number }>).find((i) => i.name === name)?.qty;

interface Acts {
  saveInv: (name: string, qty: unknown) => void;
  adjustInv: (name: string, qty: unknown, dir: number) => void;
  logSpoilage: (name: string, qty: unknown, why: string, pid?: string, kind?: string) => void;
  reconcile: () => void;
  confirmReceive: (e: unknown, item: unknown) => void;
  addExpense: (
    cat: string,
    label: string,
    amount: unknown,
    itemName?: string,
    itemQty?: unknown
  ) => void;
  countInput: (name: string, v: string) => void;
  startStocktake: () => void;
  costPerUnit: (name: string) => number;
}
const acts = (r: OpsRuntime) => r as unknown as Acts;

async function mounted(role: Role, state: Fake) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const f = fakeClient(state);
  await act(async () => {
    await runtime.loadStockCatalogue(f.client as never);
  });
  f.rpc.mockClear();
  return { runtime, ...f };
}
const movement = (rpc: ReturnType<typeof fakeClient>['rpc'], i = 0) =>
  called(rpc, 'record_stock_movement')[i]![1].p_movement as Record<string, unknown>;

describe('C1: the ported stock actions record movements (live mode)', () => {
  beforeEach(() => {
    live = true;
    store.clear();
    localStorage.clear();
  });
  afterEach(() => cleanup());

  it('a delivery is a receipt with the cost paid and the supplier; the screen shows the database’s quantity; no Undo is offered', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    const target = { rqty: { value: '1000' }, rpaid: { value: '420' }, rsub: { value: '' } };
    act(() =>
      acts(runtime).confirmReceive(
        { preventDefault: vi.fn(), target },
        {
          key: 'Unsalted butter',
          name: 'Unsalted butter',
          unit: 'g',
          add: 1000,
          supplier: 'S&R Membership',
          isPack: false
        }
      )
    );
    await settle();
    expect(movement(rpc)).toMatchObject({
      item_id: 'butter',
      kind: 'receipt',
      qty: 1000,
      cost_cents: 42000,
      supplier: 'S&R Membership'
    });
    expect(qty(runtime, 'Unsalted butter')).toBe(1900);
    expect(toast(runtime)?.undo ?? null).toBeNull();
    // Mutation: leaving the Undo lets her take the delivery back on the screen while the database keeps it.
  });

  it('a part delivery is recorded for what came, and nothing is recorded when nothing came', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    const e = (got: string, paid: string) => ({
      preventDefault: vi.fn(),
      target: { rqty: { value: got }, rpaid: { value: paid }, rsub: { value: '' } }
    });
    const it_ = {
      key: 'Unsalted butter',
      name: 'Unsalted butter',
      unit: 'g',
      add: 1000,
      supplier: 'S&R Membership',
      isPack: false
    };
    act(() => acts(runtime).confirmReceive(e('0', '0'), it_));
    await settle();
    expect(called(rpc, 'record_stock_movement')).toEqual([]);
    act(() => acts(runtime).confirmReceive(e('400', '0'), it_));
    await settle();
    expect(movement(rpc)).toMatchObject({ kind: 'receipt', qty: 400, cost_cents: null });
    expect(qty(runtime, 'Unsalted butter')).toBe(1300);
  });

  it('buying a stock item as an expense is the same receipt; a plain expense records no movement', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).addExpense('Ingredients', 'Butter run', 460, 'Unsalted butter', 1000));
    await settle();
    expect(movement(rpc)).toMatchObject({
      item_id: 'butter',
      kind: 'receipt',
      qty: 1000,
      cost_cents: 46000,
      supplier: 'S&R Membership'
    });
    rpc.mockClear();
    act(() => acts(runtime).addExpense('Packaging', 'Delivery fee', 50));
    await settle();
    expect(called(rpc, 'record_stock_movement')).toEqual([]);
    // Mutation: recording a plain expense as stock would put a quantity on an item that was never bought.
  });

  it('a count of one item is the total counted; add and subtract are adjustments with a reason', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).saveInv('Unsalted butter', 750));
    await settle();
    expect(movement(rpc)).toMatchObject({
      item_id: 'butter',
      kind: 'count',
      qty: 750,
      cost_cents: null
    });
    expect(qty(runtime, 'Unsalted butter')).toBe(750);
    act(() => acts(runtime).adjustInv('Unsalted butter', 50, 1));
    await settle();
    expect(movement(rpc, 1)).toMatchObject({
      kind: 'adjust',
      qty: 50,
      reason: 'Adjusted on the Inventory screen'
    });
    act(() => acts(runtime).adjustInv('Unsalted butter', 20, -1));
    await settle();
    expect(movement(rpc, 2)).toMatchObject({ kind: 'adjust', qty: -20 });
    expect(qty(runtime, 'Unsalted butter')).toBe(780);
    expect(msg(runtime)).toContain('800 g → 780 g');
    // Mutation: sending the difference as a count records the wrong total.
  });

  it('refuses without sending a blank or negative count, or an adjustment of nothing', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    for (const bad of ['', -1, 'x']) {
      act(() => acts(runtime).saveInv('Unsalted butter', bad));
      await settle();
    }
    act(() => acts(runtime).adjustInv('Unsalted butter', 0, 1));
    await settle();
    expect(called(rpc, 'record_stock_movement')).toEqual([]);
  });

  it('raw waste is a waste movement with its reason; cookies and dough waste stay the engine’s own and move no stock', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).logSpoilage('Unsalted butter', 100, 'Went off'));
    await settle();
    expect(movement(rpc)).toMatchObject({
      item_id: 'butter',
      kind: 'waste',
      qty: 100,
      reason: 'Went off'
    });
    expect(qty(runtime, 'Unsalted butter')).toBe(800);
    rpc.mockClear();
    act(() => acts(runtime).logSpoilage('Unsalted butter', 1, 'Dropped', 'dcf', 'baked'));
    await settle();
    expect(called(rpc, 'record_stock_movement')).toEqual([]);
    // Mutation: sending baked-cookie waste as stock waste takes butter off the shelf for a cookie.
  });

  it('a stocktake counts each item entered: a count movement each, and the summary uses what the database held', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).startStocktake());
    act(() => acts(runtime).countInput('Unsalted butter', '850'));
    act(() => acts(runtime).countInput('Bread flour', '4000'));
    act(() => acts(runtime).countInput('Box of 6', ''));
    act(() => acts(runtime).reconcile());
    await settle();
    const moves = called(rpc, 'record_stock_movement').map(
      (c) => c[1].p_movement as Record<string, unknown>
    );
    expect(moves.map((m) => [m.item_id, m.kind, m.qty])).toEqual([
      ['butter', 'count', 850],
      ['flour', 'count', 4000]
    ]);
    expect(runtime.state.stocktake).toBeNull();
    expect(msg(runtime)).toContain('1 item corrected');
    expect(qty(runtime, 'Unsalted butter')).toBe(850);
    // Mutation: skipping the unchanged count leaves "last counted" old on an item that was checked.
  });

  it('when a change is refused or not sent, nothing changes on screen and she is told', async () => {
    for (const [movementResult, words] of [
      [{ data: null, error: { code: '22023' } }, 'was refused'],
      [{ data: null, error: { code: '' } }, 'Not confirmed']
    ] as const) {
      const { runtime } = await mounted('owner', fresh({ movement: movementResult }));
      act(() => acts(runtime).adjustInv('Unsalted butter', 50, 1));
      await settle();
      expect(msg(runtime)).toContain(words);
      expect(qty(runtime, 'Unsalted butter')).toBe(900);
      cleanup();
    }
    // Mutation: keeping the local change after a failed save shows stock the database does not hold.
  });

  it('a stocktake stops at the first item that cannot be saved: the rest are not sent', async () => {
    const { runtime, rpc } = await mounted(
      'owner',
      fresh({ movement: { data: null, error: { code: '22023' } } })
    );
    act(() => acts(runtime).startStocktake());
    act(() => acts(runtime).countInput('Unsalted butter', '850'));
    act(() => acts(runtime).countInput('Bread flour', '3900'));
    act(() => acts(runtime).reconcile());
    await settle();
    expect(called(rpc, 'record_stock_movement')).toHaveLength(1);
    // Mutation: carrying on after a failure sends counts against a screen that no longer matches.
  });

  it('an expense form refused by the engine (no amount) records no delivery', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    act(() => acts(runtime).addExpense('Ingredients', 'Butter run', '', 'Unsalted butter', 1000));
    await settle();
    expect(called(rpc, 'record_stock_movement')).toEqual([]);
    expect(qty(runtime, 'Unsalted butter')).toBe(900);
    // Mutation: recording before the engine's own check counts a delivery twice when the form is sent again with the amount.
  });

  it('a delivery is recorded before the engine’s bookkeeping: a refused one leaves nothing half done', async () => {
    const { runtime, rpc } = await mounted(
      'owner',
      fresh({ movement: { data: null, error: { code: '22023' } } })
    );
    const target = { rqty: { value: '1000' }, rpaid: { value: '420' }, rsub: { value: '' } };
    act(() =>
      acts(runtime).confirmReceive(
        { preventDefault: vi.fn(), target },
        {
          key: 'Unsalted butter',
          name: 'Unsalted butter',
          unit: 'g',
          add: 1000,
          supplier: 'S&R Membership',
          isPack: false
        }
      )
    );
    await settle();
    expect(called(rpc, 'record_stock_movement')).toHaveLength(1);
    expect(runtime.state.received).toEqual({});
    expect(runtime.state.ledger).toEqual([]);
    expect(qty(runtime, 'Unsalted butter')).toBe(900);
    // Mutation: running the engine first leaves the delivery ticked off the grocery list although the database refused it.
  });

  it('an unconfirmed answer keeps the entry: repeating it exactly sends the same id and time, so it can never count twice', async () => {
    const { runtime, rpc } = await mounted(
      'owner',
      fresh({ movements: [{ data: null, error: { code: '' } }] })
    );
    act(() => acts(runtime).adjustInv('Unsalted butter', 50, 1));
    await settle();
    expect(msg(runtime)).toContain('Not confirmed');
    act(() => acts(runtime).adjustInv('Unsalted butter', 50, 1));
    await settle();
    const [first, second] = [movement(rpc, 0), movement(rpc, 1)];
    expect(second.id).toBe(first.id);
    expect(second.at).toBe(first.at);
    act(() => acts(runtime).adjustInv('Unsalted butter', 50, 1));
    await settle();
    expect(movement(rpc, 2).id).not.toBe(first.id);
    // Mutation: a new id per attempt turns a lost reply into a second delivery and a second cost.
  });

  it('a stocktake that fails partway keeps the counts not yet saved on the sheet and says how many went in', async () => {
    const ok = { data: [{ item_id: 'x', on_hand: 0, duplicate: false }], error: null };
    const { runtime, rpc } = await mounted(
      'owner',
      fresh({ movements: [ok, { data: null, error: { code: '' } }] })
    );
    act(() => acts(runtime).startStocktake());
    act(() => acts(runtime).countInput('Unsalted butter', '850'));
    act(() => acts(runtime).countInput('Bread flour', '3900'));
    act(() => acts(runtime).countInput('Box of 6', '8'));
    act(() => acts(runtime).reconcile());
    await settle();
    expect(called(rpc, 'record_stock_movement')).toHaveLength(2);
    const left = (runtime.state.stocktake as { counts: Record<string, string> } | null)?.counts;
    expect(Object.keys(left ?? {}).sort()).toEqual(['Box of 6', 'Bread flour']);
    expect(msg(runtime)).toContain('1 of 3 counts saved');
    // Mutation: clearing the sheet loses the counts still to save and hides that the stocktake did not finish.
  });

  it('each count is taken at the moment it was entered, so a delivery received after it is not wiped out', async () => {
    const { runtime, rpc } = await mounted('owner', fresh());
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-05T03:00:00Z'));
      act(() => acts(runtime).startStocktake());
      act(() => acts(runtime).countInput('Unsalted butter', '850'));
      vi.setSystemTime(new Date('2026-10-07T03:00:00Z'));
      act(() => acts(runtime).reconcile());
      await settle();
    } finally {
      vi.useRealTimers();
    }
    expect(movement(rpc).at).toBe(Date.parse('2026-10-05T03:00:00Z'));
    // Mutation: stamping the count when it is saved measures it against a later quantity.
  });

  it('a helper is told only the owner changes stock', async () => {
    const h = await mounted('helper', fresh());
    act(() => acts(h.runtime).adjustInv('Unsalted butter', 5, 1));
    await settle();
    // No name is set in this shop, so the sentence names nobody (audit H14).
    expect(msg(h.runtime)).toBe('Only the owner can change stock.');
    cleanup();
  });

  it('a receipt or count made by a helper, or with no connection, sends nothing', async () => {
    const helper = await mounted('helper', fresh());
    act(() => acts(helper.runtime).saveInv('Unsalted butter', 5));
    await settle();
    expect(called(helper.rpc, 'record_stock_movement')).toEqual([]);
    cleanup();
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => ref.current!.setRole('owner'));
    act(() => acts(ref.current!).saveInv('Unsalted butter', 5));
    await settle();
    expect(msg(ref.current!)).toContain('Enter a quantity');
  });

  it('what was last paid feeds the cost per unit: the engine divides what was spent by the quantity it bought', async () => {
    const { runtime } = await mounted(
      'owner',
      fresh({
        lastPaid: [
          {
            item_name: 'Unsalted butter',
            cost_cents: 50000,
            qty: 1000,
            supplier: 'S&R Membership',
            at: 1_790_000_000_000
          }
        ]
      })
    );
    expect(acts(runtime).costPerUnit('Unsalted butter')).toBeCloseTo(0.5, 5);
    expect(Object.keys(runtime.state.paid as object)).toEqual(['Unsalted butter']);
    // Mutation: taking the price in centavos makes the cost per unit 100 times too big.
  });

  it('demo mode keeps the engine’s own actions: no movement is recorded', async () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    act(() => acts(ref.current!).adjustInv('Unsalted butter', 5, 1));
    expect(
      (ref.current!.state.inv as Array<{ name: string; qty: number }>).find(
        (i) => i.name === 'Unsalted butter'
      )!.qty
    ).toBe(905);
  });
});
