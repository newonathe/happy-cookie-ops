import { describe, expect, it, vi } from 'vitest';
import {
  attemptFor,
  buildOrderBody,
  buildWaitlistBody,
  fetchOrderStatus,
  findOrder,
  isDefiniteCode,
  joinWaitlist,
  orderFieldErrors,
  parseOrderStatus,
  placeOrder,
  refusalMessage,
  settleAttempt,
  slotsLeft,
  tokenFromHash,
  waitlistFieldErrors,
  type OrderClient,
  type OrderFields,
  type PlaceOutcome
} from '@/lib/data/orders';
import { statusCust } from '@/lib/orders/status-view';
import { DROP_CLOSED_MESSAGE } from '@/lib/rules/capacity';

const TOKEN = 'a'.repeat(64);
const ID = '11111111-1111-4111-8111-111111111111';
const FIELDS: OrderFields = {
  name: '  Ana  ',
  ig: ' @ana.bakes ',
  mobile: ' 0917 123 4567 ',
  method: 'GCash',
  pickupDate: '2026-10-08',
  pickupWindow: '10:30',
  ref: '  ',
  items: { hc: 2, dcf: 1, pbm: 0 }
};

const placedRow = {
  order_no: 'HC-1001',
  status_token: TOKEN,
  total_cents: 90000,
  pickup_date: '2026-10-08',
  pickup_window: '10:30',
  replayed: false
};

function client(result: unknown): { c: OrderClient; rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { c: { rpc } as unknown as OrderClient, rpc };
}

describe('the order body', () => {
  it('carries exactly the keys place_order accepts and nothing the server decides', () => {
    const body = buildOrderBody(ID, { ...FIELDS, ref: 'ref 123' });
    expect(Object.keys(body).sort()).toEqual(
      [
        'client_id',
        'ig',
        'items',
        'mobile',
        'name',
        'pay_method',
        'pay_ref',
        'pickup_date',
        'pickup_window'
      ].sort()
    );
    for (const forbidden of [
      'total',
      'total_cents',
      'price',
      'state',
      'role',
      'status',
      'amount',
      'email'
    ])
      expect(body).not.toHaveProperty(forbidden);
    expect(JSON.stringify(body)).not.toMatch(/price|total/);
  });

  it('trims values, sorts items, drops zero quantities and omits an empty reference', () => {
    const body = buildOrderBody(ID, FIELDS);
    expect(body.name).toBe('Ana');
    expect(body.ig).toBe('@ana.bakes');
    expect(body.mobile).toBe('0917 123 4567');
    expect(body.items).toEqual([
      { product_id: 'dcf', qty: 1 },
      { product_id: 'hc', qty: 2 }
    ]);
    expect(body).not.toHaveProperty('pay_ref');
    expect(buildOrderBody(ID, { ...FIELDS, ref: ' abc ' }).pay_ref).toBe('abc');
  });
});

describe('field checks before anything is sent', () => {
  it('accepts a complete order', () => {
    expect(orderFieldErrors(FIELDS)).toEqual({});
  });

  it('names each missing or malformed field', () => {
    const e = orderFieldErrors({
      name: ' ',
      ig: '',
      mobile: '123',
      method: '',
      pickupDate: '',
      pickupWindow: '',
      ref: '',
      items: {}
    });
    expect(Object.keys(e).sort()).toEqual(['date', 'ig', 'items', 'mobile', 'name', 'pay', 'time']);
  });

  it('takes the phone forms the database takes', () => {
    for (const mobile of ['09171234567', '+63 917 123 4567', '639171234567', '9171234567'])
      expect(orderFieldErrors({ ...FIELDS, mobile }).mobile).toBeUndefined();
    expect(orderFieldErrors({ ...FIELDS, mobile: '0817 123 4567' }).mobile).toBeDefined();
  });

  it('accepts the campus slot and refuses a malformed handle', () => {
    expect(orderFieldErrors({ ...FIELDS, pickupWindow: 'campus' }).time).toBeUndefined();
    expect(orderFieldErrors({ ...FIELDS, ig: '@bad handle!' }).ig).toBeDefined();
  });
});

describe('SQLSTATE to message', () => {
  it('words every refusal, with the signed-off sentence for a closed drop', () => {
    expect(refusalMessage('ZC001')).toBe(DROP_CLOSED_MESSAGE);
    expect(refusalMessage('ZC002', '3')).toMatch(/3 slots/);
    expect(refusalMessage('ZC002', '1')).toMatch(/1 slot /);
    expect(refusalMessage('ZC002', '0')).toMatch(/no room/);
    expect(refusalMessage('ZC002', 'not a number')).toMatch(/no room/);
    expect(refusalMessage('ZC003')).toMatch(/unpaid/);
    expect(refusalMessage('ZC004')).toMatch(/pickup/);
    expect(refusalMessage('ZC005')).toMatch(/payment method/);
    expect(refusalMessage('ZC006')).toMatch(/waiting list/);
    expect(refusalMessage('22023')).toMatch(/not accepted/);
    expect(refusalMessage('23505')).toMatch(/Find my order/);
    expect(refusalMessage('42501')).toMatch(/not available/);
  });

  it('never calls a slot count boxes', () => {
    expect(refusalMessage('ZC002', '5')).not.toMatch(/box/i);
  });

  it('reads the slots left only from a plain count', () => {
    expect(slotsLeft('12')).toBe(12);
    expect(slotsLeft(' 7 ')).toBe(7);
    expect(slotsLeft('-1')).toBeNull();
    expect(slotsLeft('seven')).toBeNull();
    expect(slotsLeft(null)).toBeNull();
  });
});

describe('placing an order', () => {
  it('a success returns the order', async () => {
    const { c, rpc } = client({ data: [placedRow], error: null });
    const out = await placeOrder(c, buildOrderBody(ID, FIELDS));
    expect(out).toEqual({
      kind: 'placed',
      order: {
        orderNo: 'HC-1001',
        token: TOKEN,
        totalCents: 90000,
        pickupDate: '2026-10-08',
        pickupWindow: '10:30',
        replayed: false
      }
    });
    expect(rpc).toHaveBeenCalledWith('place_order', {
      p_order: expect.objectContaining({ client_id: ID })
    });
  });

  it('a replay is a success', async () => {
    const { c } = client({ data: [{ ...placedRow, replayed: true }], error: null });
    const out = await placeOrder(c, buildOrderBody(ID, FIELDS));
    expect(out.kind === 'placed' && out.order.replayed).toBe(true);
  });

  it('a definite refusal is worded and carries the slots left', async () => {
    const { c } = client({ data: null, error: { code: 'ZC002', message: 'x', details: '4' } });
    expect(await placeOrder(c, buildOrderBody(ID, FIELDS))).toMatchObject({
      kind: 'refused',
      code: 'ZC002',
      slotsLeft: 4,
      message: expect.stringMatching(/4 slots/)
    });
  });

  it.each(['ZC001', 'ZC003', 'ZC004', 'ZC005', 'ZC006', '22023', '23505', '42501', '55000'])(
    '%s is definite',
    async (code) => {
      expect(isDefiniteCode(code)).toBe(true);
      const { c } = client({ data: null, error: { code, message: 'x', details: null } });
      expect((await placeOrder(c, buildOrderBody(ID, FIELDS))).kind).toBe('refused');
    }
  );

  it('anything else is unknown: a timeout, a gateway error, a thrown fetch, a malformed success', async () => {
    for (const result of [
      { data: null, error: { code: '57014', message: 'timeout', details: null } },
      { data: null, error: { code: 'PGRST301', message: 'x', details: null } },
      { data: null, error: { code: '', message: 'Failed to fetch', details: null } },
      new TypeError('Failed to fetch'),
      { data: [{ ...placedRow, status_token: 'nope' }], error: null },
      { data: [{ ...placedRow, replayed: undefined }], error: null },
      { data: [], error: null }
    ]) {
      const { c } = client(result);
      expect(await placeOrder(c, buildOrderBody(ID, FIELDS))).toEqual({ kind: 'unknown' });
    }
    expect(isDefiniteCode('57014')).toBe(false);
    expect(isDefiniteCode(undefined)).toBe(false);
  });
});

describe('one client id per attempt', () => {
  const placed: PlaceOutcome = {
    kind: 'placed',
    order: {
      orderNo: 'HC-1001',
      token: TOKEN,
      totalCents: 1,
      pickupDate: '',
      pickupWindow: '',
      replayed: false
    }
  };
  const refused: PlaceOutcome = { kind: 'refused', code: 'ZC004', message: 'm', slotsLeft: null };

  it('mints an id and freezes the body with it', () => {
    const mint = vi.fn(() => ID);
    const attempt = attemptFor(null, FIELDS, mint);
    expect(attempt.id).toBe(ID);
    expect(attempt.body.client_id).toBe(ID);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('after an unknown outcome the same id and the identical frozen body are resent, even if the form changed', () => {
    const first = attemptFor(null, FIELDS, () => ID);
    const kept = settleAttempt(first, { kind: 'unknown' });
    expect(kept).toBe(first);
    const mint = vi.fn(() => 'other');
    const again = attemptFor(kept, { ...FIELDS, name: 'Someone else' }, mint);
    expect(again).toBe(first);
    expect(again.body.name).toBe('Ana');
    expect(mint).not.toHaveBeenCalled();
  });

  it('after a success or a definite refusal the next attempt has a new id', () => {
    const first = attemptFor(null, FIELDS, () => ID);
    expect(settleAttempt(first, placed)).toBeNull();
    expect(settleAttempt(first, refused)).toBeNull();
    const second = attemptFor(null, FIELDS, () => '22222222-2222-4222-8222-222222222222');
    expect(second.id).not.toBe(first.id);
  });
});

describe('the status page', () => {
  const base = {
    order_no: 'HC-1001',
    state: 'Payment review',
    pay_state: 'unpaid',
    pay_method: 'GCash',
    total_cents: 90000,
    pickup_date: '2026-10-08',
    pickup_window: '10:30',
    placed_at: '2026-10-05T01:00:00Z',
    hold_expires_at: '2026-10-06T01:00:00Z',
    items: [{ product_id: 'hc', name: 'Hazelnut Crunch', qty: 2, unit_price_cents: 45000 }]
  };

  it('parses an order strictly', () => {
    expect(parseOrderStatus(base)).toMatchObject({
      orderNo: 'HC-1001',
      state: 'Payment review',
      items: [{ productId: 'hc', qty: 2 }]
    });
    expect(parseOrderStatus(null)).toBeNull();
    expect(parseOrderStatus({ ...base, order_no: 'X-1' })).toBeNull();
    expect(parseOrderStatus({ ...base, state: 'Bogus' })).toBeNull();
    expect(parseOrderStatus({ ...base, items: [{ product_id: 'hc' }] })).toBeNull();
    expect(parseOrderStatus({ ...base, total_cents: 1.5 })).toBeNull();
  });

  it('validates the token before calling the database', async () => {
    const { c, rpc } = client({ data: base, error: null });
    expect(await fetchOrderStatus(c, 'not-a-token')).toBeNull();
    expect(await fetchOrderStatus(c, TOKEN.toUpperCase())).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    expect((await fetchOrderStatus(c, TOKEN))?.orderNo).toBe('HC-1001');
    expect(rpc).toHaveBeenCalledWith('order_status', { p_token: TOKEN });
  });

  it('an unknown token is no order; a failed read throws', async () => {
    expect(await fetchOrderStatus(client({ data: null, error: null }).c, TOKEN)).toBeNull();
    await expect(
      fetchOrderStatus(client({ data: null, error: { code: '57014', message: 'x' } }).c, TOKEN)
    ).rejects.toThrow();
  });

  it('reads the token from the URL fragment only when it is exactly 64 lowercase hex', () => {
    expect(tokenFromHash('#t=' + TOKEN)).toBe(TOKEN);
    expect(tokenFromHash('#t=' + TOKEN + 'a')).toBeNull();
    expect(tokenFromHash('#t=' + 'A'.repeat(64))).toBeNull();
    expect(tokenFromHash('?t=' + TOKEN)).toBeNull();
    expect(tokenFromHash('')).toBeNull();
  });

  it('says received while unpaid, without the ported claim of payment proof, and never an invoice', () => {
    const view = statusCust(parseOrderStatus(base)!, { allergenNote: 'Contains milk.' });
    expect(view.heroTitle).toBe('Order received');
    expect(view.heroBody).not.toMatch(/proof/i);
    expect(view.heroBody).toMatch(/GCash/);
    expect(view.invoiceLine).toBe('');
    expect(view.showCode).toBe(false);
    expect(view.showRetry).toBe(false);
    expect(view.orderNo).toBe('HC-1001');
    expect(view.windowText).toBe('Thu, Oct 8 · 10:30 AM');
    expect(view.allergenNote).toBe('Contains milk.');
    expect(view.timeline.filter((t) => t.now)).toHaveLength(1);
    expect(view.timeline[1]).toMatchObject({ sub: 'Waiting for your payment', now: true });
  });

  it('moves through the states with the ported sentences where they are still true', () => {
    const of = (state: string) =>
      statusCust(parseOrderStatus({ ...base, state })!, { allergenNote: '' });
    expect(of('Confirmed').heroTitle).toBe('Payment confirmed');
    expect(of('Ready').heroTitle).toBe('Your box is ready');
    expect(of('Completed').heroTitle).toBe('Collected — thank you');
    expect(of('No-show').heroTitle).toBe('You missed your slot');
    expect(of('Cancelled').heroTitle).toBe('Order cancelled');
    expect(of('Cancelled').timeline).toHaveLength(2);
    expect(of('Completed').timeline.every((t) => t.done)).toBe(true);
  });

  it('words the campus slot', () => {
    const view = statusCust(parseOrderStatus({ ...base, pickup_window: 'campus' })!, {
      allergenNote: ''
    });
    expect(view.windowText).toBe('Thu, Oct 8 · Campus pickup');
  });
});

describe('find my order', () => {
  it('sends the order number upper-cased with the phone as typed, and returns the token', async () => {
    const { c, rpc } = client({ data: TOKEN, error: null });
    expect(await findOrder(c, ' hc-1001 ', '0917 123 4567')).toEqual({
      kind: 'found',
      token: TOKEN
    });
    expect(rpc).toHaveBeenCalledWith('find_order', {
      p_order_no: 'HC-1001',
      p_phone: '0917 123 4567'
    });
  });

  it('a null answer is a miss; a malformed answer is a miss; a failed call is an error', async () => {
    expect(
      await findOrder(client({ data: null, error: null }).c, 'HC-1001', '09171234567')
    ).toEqual({ kind: 'missed' });
    expect(
      await findOrder(client({ data: 'nope', error: null }).c, 'HC-1001', '09171234567')
    ).toEqual({ kind: 'missed' });
    expect(
      await findOrder(
        client({ data: null, error: { code: '57014', message: 'x' } }).c,
        'HC-1001',
        '09171234567'
      )
    ).toEqual({ kind: 'error' });
    expect(await findOrder(client(new TypeError('offline')).c, 'HC-1001', '09171234567')).toEqual({
      kind: 'error'
    });
  });

  it('does not spend a try on input that cannot match', async () => {
    const { c, rpc } = client({ data: TOKEN, error: null });
    expect(await findOrder(c, 'HC-1', '09171234567')).toEqual({ kind: 'missed' });
    expect(await findOrder(c, 'HC-1001', '123')).toEqual({ kind: 'missed' });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('the waitlist', () => {
  const fields = { name: ' Ana ', ig: '', mobile: '09171234567', wantedDate: '2026-10-12' };

  it('builds exactly the keys join_waitlist accepts', () => {
    const body = buildWaitlistBody(ID, fields);
    expect(Object.keys(body).sort()).toEqual(['client_id', 'ig', 'mobile', 'name', 'wanted_date']);
    expect(body.name).toBe('Ana');
  });

  it('checks the fields; Instagram is optional here', () => {
    expect(waitlistFieldErrors(fields)).toEqual({});
    expect(
      Object.keys(
        waitlistFieldErrors({ name: '', ig: 'bad handle', mobile: '1', wantedDate: '' })
      ).sort()
    ).toEqual(['date', 'ig', 'mobile', 'name']);
  });

  it('joined, replayed, refused and unknown', async () => {
    const body = buildWaitlistBody(ID, fields);
    expect(
      await joinWaitlist(
        client({ data: [{ waitlist_id: ID, replayed: false }], error: null }).c,
        body
      )
    ).toEqual({ kind: 'joined', replayed: false });
    expect(
      await joinWaitlist(
        client({ data: [{ waitlist_id: ID, replayed: true }], error: null }).c,
        body
      )
    ).toEqual({ kind: 'joined', replayed: true });
    expect(
      await joinWaitlist(
        client({ data: null, error: { code: 'ZC006', message: 'x', details: null } }).c,
        body
      )
    ).toMatchObject({ kind: 'refused', code: 'ZC006' });
    expect(
      await joinWaitlist(client({ data: null, error: { code: '57014', message: 'x' } }).c, body)
    ).toEqual({ kind: 'unknown' });
    expect(await joinWaitlist(client(new TypeError('offline')).c, body)).toEqual({
      kind: 'unknown'
    });
    expect(await joinWaitlist(client({ data: [], error: null }).c, body)).toEqual({
      kind: 'unknown'
    });
  });
});
