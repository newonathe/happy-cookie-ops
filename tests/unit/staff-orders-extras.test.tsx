import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { OrderDetailScreen } from '@/components/screens/order-detail';
import { OrdersScreen } from '@/components/screens/orders';
import { OrderMessages } from '@/components/live/order-messages';
import {
  EXTRAS_KEY,
  extrasCents,
  parseStaffOrders,
  toEngineOrder,
  type StaffOrderClient
} from '@/lib/data/staff-orders';
import { extraDetails, extraRows } from '@/lib/orders/extras-view';
import { messagesFor } from '@/lib/orders/messages';
import type { Role } from '@/store/engine/ops-engine';

/**
 * B4b, the owner's side: what an order carries beyond flavours reaches the ported screens as rows and as
 * part of the total, and the messages sheet, without editing any protected markup. Each `Mutation:` line
 * names a change one of these tests must catch (each was applied and seen to fail).
 */
const TOKEN = 'd'.repeat(64);
const STAMP = '2026-09-29T02:00:00.123456+00:00';

type Row = Record<string, unknown>;
// Two cookies at 100 pesos, two stickers (design 2) at 15, a note card at 10, a box of 6 at 25, and a
// same-day extra of 48: 200 + 30 + 10 + 25 + 48 = 313 pesos.
const raw = (over: Row = {}): Row => ({
  id: 'HC-1001',
  name: 'Ana Cruz',
  phone: '09171234567',
  ig: '@ana',
  state: 'Payment review',
  pay_state: 'unpaid',
  pay_method: 'GCash',
  pay_ref: null,
  total_cents: 31300,
  paid_cents: null,
  refund_ref: null,
  pickup_date: '2026-10-05',
  pickup_window: '10:00',
  placed_at: '2026-09-29T01:00:00.000Z',
  updated_at: STAMP,
  status_token: TOKEN,
  holds: true,
  items: [{ product_id: 'wcb', qty: 2, unit_price_cents: 10000, unavailable: false }],
  swaps: [],
  surcharge_cents: 4800,
  same_day: true,
  add_ons: [
    { name: 'Sticker', qty: 2, unit_price_cents: 1500, variant: '2', note: null },
    {
      name: 'Note card',
      qty: 1,
      unit_price_cents: 1000,
      variant: null,
      note: 'Happy birthday Mika'
    }
  ],
  boxes: [{ size: 6, qty: 1, charge_cents: 2500 }],
  ...over
});

describe('parsing the extras of an order', () => {
  it('reads add-ons, boxes and the same-day extra', () => {
    const [o] = parseStaffOrders([raw()]);
    expect(o).toMatchObject({ surchargeCents: 4800, sameDay: true, totalCents: 31300 });
    expect(o!.addOns).toEqual([
      { name: 'Sticker', qty: 2, unitCents: 1500, variant: '2', note: '' },
      { name: 'Note card', qty: 1, unitCents: 1000, variant: '', note: 'Happy birthday Mika' }
    ]);
    expect(o!.boxes).toEqual([{ size: 6, qty: 1, chargeCents: 2500 }]);
  });

  it('an order from before B4 has no extras, and a malformed line is left out without hiding the order', () => {
    const [old] = parseStaffOrders([
      raw({
        surcharge_cents: undefined,
        same_day: undefined,
        add_ons: undefined,
        boxes: undefined,
        total_cents: 20000
      })
    ]);
    expect(old).toMatchObject({ surchargeCents: 0, sameDay: false, addOns: [], boxes: [] });
    const [odd] = parseStaffOrders([
      raw({
        add_ons: [
          { name: 'x', qty: 0, unit_price_cents: 1 },
          'no',
          { name: 'Ribbon', qty: 1, unit_price_cents: 1000 }
        ],
        boxes: [
          { size: 'six', qty: 1, charge_cents: 0 },
          { size: 6, qty: 1, charge_cents: -1 }
        ],
        surcharge_cents: -5
      })
    ]);
    expect(odd!.addOns.map((a) => a.name)).toEqual(['Ribbon']);
    expect(odd!.boxes).toEqual([]);
    expect(odd!.surchargeCents).toBe(0);
    // Mutation: dropping the whole order for one odd extras line hides a paid order from the owner.
  });
});

describe('the total the ported screens show is the server total', () => {
  it('extrasCents is what the flavours do not explain, never negative', () => {
    const [o] = parseStaffOrders([raw()]);
    expect(extrasCents(o!)).toBe(11300);
    const [plain] = parseStaffOrders([
      raw({ total_cents: 20000, add_ons: [], boxes: [], surcharge_cents: 0, same_day: false })
    ]);
    expect(extrasCents(plain!)).toBe(0);
    const [short] = parseStaffOrders([raw({ total_cents: 15000 })]);
    expect(extrasCents(short!)).toBe(0); // a swap that made the items dearer than a stale total cannot go below zero
  });

  it('puts the extras in the reserved key of priced, in pesos, only when there are some', () => {
    const [o] = parseStaffOrders([raw()]);
    const e = toEngineOrder(o!, [1, 4]);
    expect(e.priced[EXTRAS_KEY]).toBe(113);
    expect(e.priced.wcb).toBe(100);
    expect(Object.keys(e.items)).toEqual(['wcb']); // never a flavour, so no screen tries to draw it
    const [plain] = parseStaffOrders([
      raw({ total_cents: 20000, add_ons: [], boxes: [], surcharge_cents: 0 })
    ]);
    expect(EXTRAS_KEY in toEngineOrder(plain!, [1, 4]).priced).toBe(false);
    // Mutation: taking the extras from the lines instead of the total lets a hidden charge disagree with what the customer owes.
  });
});

describe('rows and lines for the owner', () => {
  it('one row per add-on, per box size and the same-day extra, adding up to the extras', () => {
    const [o] = parseStaffOrders([raw()]);
    const rows = extraRows(o!);
    expect(rows).toEqual([
      { name: 'Sticker 2', qty: 2, linePesos: 30 },
      { name: 'Note card', qty: 1, linePesos: 10 },
      { name: 'Box of 6', qty: 1, linePesos: 25 },
      { name: 'Same-day pickup extra', qty: 1, linePesos: 48 }
    ]);
    expect(rows.reduce((n, r) => n + r.linePesos, 0)).toBe(113);
  });

  it('a charge no line explains still shows, so the rows never disagree with the total', () => {
    const [o] = parseStaffOrders([
      raw({ surcharge_cents: 0, same_day: false, total_cents: 31300 })
    ]);
    const rows = extraRows(o!);
    expect(rows.at(-1)).toEqual({ name: 'Other charges', qty: 1, linePesos: 48 });
    // Mutation: dropping the remainder row shows 265 lines against a 313 total.
  });

  it('a charge no line explains still shows on a same-day order too, so the rows always add up', () => {
    // total 313 = items 200 + sticker 30 + note 10 + box 25 + same-day 48, but one add-on line was malformed and dropped
    const [o] = parseStaffOrders([
      raw({
        add_ons: [
          { name: 'Sticker', qty: 2, unit_price_cents: 1500, variant: '2', note: null },
          'broken'
        ]
      })
    ]);
    const rows = extraRows(o!);
    expect(rows.map((r) => r.name)).toEqual([
      'Sticker 2',
      'Box of 6',
      'Same-day pickup extra',
      'Other charges'
    ]);
    expect(rows.reduce((n, r) => n + r.linePesos, 0)).toBe(113);
    // Mutation: skipping the remainder when same-day is set leaves the rows 10 pesos short of the total.
  });

  it('the pack lines carry the note text, and say nothing for a plain order', () => {
    const [o] = parseStaffOrders([raw()]);
    expect(extraDetails(o!, true)).toEqual([
      'Sticker 2 × 2',
      'Note card × 1: "Happy birthday Mika"',
      'Box of 6 × 1',
      'Same-day pickup'
    ]);
    const [plain] = parseStaffOrders([
      raw({ total_cents: 20000, add_ons: [], boxes: [], surcharge_cents: 0, same_day: false })
    ]);
    expect(extraRows(plain!)).toEqual([]);
    expect(extraDetails(plain!)).toEqual([]);
  });

  it('the payment and paid texts list what the total includes; a plain order says nothing extra', () => {
    const [o] = parseStaffOrders([raw()]);
    const [unpaid] = messagesFor(o!, 'https://x.test', () => 'Flavour');
    // The customer text is forwarded (a gift, a receipt), so the card message stays out of it; the owner's pack line has it.
    expect(unpaid!.text).toContain(
      'Includes: Sticker 2 × 2; Note card × 1; Box of 6 × 1; Same-day pickup.'
    );
    expect(unpaid!.text).not.toContain('Mika');
    expect(extraDetails(o!)).toEqual([
      'Sticker 2 × 2',
      'Note card × 1',
      'Box of 6 × 1',
      'Same-day pickup'
    ]);
    // Mutation: passing withNotes to the customer text hands the card message to whoever the text is forwarded to.
    expect(unpaid!.text).toContain('The total is ₱313.'); // what the customer pays: flavours, extras and all
    const [cents] = parseStaffOrders([raw({ total_cents: 123450 })]);
    expect(messagesFor(cents!, 'https://x.test', () => 'F')[0]!.text).toContain(
      'The total is ₱1,234.50.'
    );
    // Mutation: leaving the total out sends the customer a payment request with no amount.
    const [paid] = messagesFor(
      { ...o!, state: 'Confirmed', payState: 'confirmed' },
      'https://x.test',
      () => 'Flavour'
    );
    expect(paid!.text).toContain('Includes:');
    const [plain] = parseStaffOrders([
      raw({ total_cents: 20000, add_ons: [], boxes: [], surcharge_cents: 0, same_day: false })
    ]);
    expect(messagesFor(plain!, 'https://x.test', () => 'Flavour')[0]!.text).not.toContain(
      'Includes'
    );
  });
});

function fake(list: Row[]) {
  const rpc = vi.fn(async (name: string) =>
    name === 'get_staff_orders' ? { data: list, error: null } : { data: null, error: null }
  );
  return { rpc, client: { rpc } as unknown as StaffOrderClient };
}
async function mounted(role: Role, list: Row[]) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  await act(async () => {
    await runtime.loadOrders(fake(list).client);
  });
  return runtime;
}

describe('the ported order screens (live mode)', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => cleanup());

  it('the order detail shows the flavours, then the extras, and the total is the server total', async () => {
    const runtime = await mounted('owner', [raw()]);
    act(() => runtime.setState({ screen: 'order', orderId: 'HC-1001' }));
    const v = runtime.renderVals();
    expect(v.od!.totalText).toBe('₱313');
    expect(v.od!.lines.slice(1).map((l) => l.name)).toEqual([
      'Sticker 2',
      'Note card',
      'Box of 6',
      'Same-day pickup extra'
    ]);
    expect(v.od!.lines).toHaveLength(5); // the flavour first, then the four extras
    const extra = v.od!.lines.slice(1);
    expect(extra.map((l) => l.line)).toEqual(['₱30', '₱10', '₱25', '₱48']);
    expect(extra.every((l) => l.inStock && !l.out && l.flagLabel === 'Extra')).toBe(true);
    const { container } = render(<OrderDetailScreen v={v} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Sticker 2');
    expect(text).toContain('Same-day pickup extra');
    expect(text).not.toMatch(/undefined|NaN|Infinity/);
    expect(text).not.toContain('Swap'); // an extra is never offered a swap
    // Mutation: without the boxTotal override the ported total is the flavours alone (₱200) and the rows add up to more than it.
  });

  it('the orders list shows the server total and no broken value', async () => {
    const runtime = await mounted('owner', [raw()]);
    act(() => runtime.setState({ screen: 'orders', orderId: 'HC-1001' }));
    const v = runtime.renderVals();
    const { container } = render(<OrdersScreen v={v} />);
    const text = container.textContent ?? '';
    expect(text).toContain('₱313');
    expect(text).not.toMatch(/undefined|NaN|Infinity/);
  });

  it('demo mode keeps the ported total and adds no rows', async () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const runtime = ref.current!;
    const total = (
      runtime as unknown as {
        boxTotal: (i: Record<string, number>, p?: Record<string, number>) => number;
      }
    ).boxTotal;
    expect(total({ wcb: 2 }, { wcb: 100, [EXTRAS_KEY]: 999 })).not.toBe(1199);
    expect(runtime.renderVals().od?.lines ?? []).not.toContainEqual(
      expect.objectContaining({ flagLabel: 'Extra' })
    );
  });

  it('the messages sheet shows what to pack, with the note text', async () => {
    const runtime = await mounted('owner', [raw()]);
    act(() => runtime.sheet('ordermessages', {}));
    const vals = runtime.renderVals();
    const { container } = render(<OrderMessages liveMessages={vals.liveMessages!} />);
    expect(container.textContent).toContain(
      'To pack: Sticker 2 × 2 · Note card × 1: "Happy birthday Mika" · Box of 6 × 1 · Same-day pickup'
    );
    expect(vals.liveMessages!.rows[0]!.details).toHaveLength(4);
  });
});
