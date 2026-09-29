import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { CheckoutScreen } from '@/components/screens/checkout';
import { OrderStatusScreen } from '@/components/screens/order-status';
import { LiveFormHost } from '@/components/live/live-form-host';
import { LiveShopFooter } from '@/components/live/live-shop-footer';
import { PAY_ACCOUNTS, replacePayAccounts } from '@/store/engine/ops-engine';
import type { OrderClient } from '@/lib/data/orders';
import type { PaymentClient, UploadClient } from '@/lib/data/payments';
import { DROP_CLOSED_MESSAGE } from '@/lib/rules/capacity';
import type { ScreenKey } from '@/lib/screens';

/**
 * B2: the live checkout, "Find my order", the waiting list and the status page. Every branch of
 * the new runtime code has a test; a mutation comment says what breaking it does.
 */
const PORTED = PAY_ACCOUNTS.map((m) => ({ ...m }));
const TOKEN = 'b'.repeat(64);
const RULES = {
  pickup_days: [1, 4],
  lead_min_days: 1,
  lead_max_days: 14,
  pickup_from_hour: 9,
  pickup_cutoff_hour: 17,
  campus_from: '14:00',
  campus_to: '15:30',
  unpaid_hold_hours: 24
};
const PLACED = {
  order_no: 'HC-1001',
  status_token: TOKEN,
  total_cents: 45000,
  pickup_date: '2026-10-08',
  pickup_window: '10:30',
  replayed: false
};
const STATUS = {
  order_no: 'HC-1001',
  state: 'Payment review',
  pay_state: 'unpaid',
  pay_method: 'GCash',
  total_cents: 45000,
  pickup_date: '2026-10-08',
  pickup_window: '10:30',
  placed_at: '2026-10-05T01:00:00Z',
  hold_expires_at: '2026-10-06T01:00:00Z',
  items: [
    { product_id: 'dcf', name: 'Dark Choc Chip', qty: 2, unit_price_cents: 22500 },
    { product_id: 'gone', name: 'Retired flavour', qty: 1, unit_price_cents: 20000 }
  ]
};

type Reply = { data: unknown; error: unknown } | Error;
type Handlers = Partial<Record<string, (args: Record<string, unknown>) => Reply | Promise<Reply>>>;

function fakeClient(handlers: Handlers = {}) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
    calls.push({ name, args });
    const fallback: Handlers = {
      get_shop_order_rules: () => ({ data: RULES, error: null }),
      get_shop_payment_info: () => ({
        data: {
          methods: [{ id: 'gcash', label: 'GCash', number: '0999', name: 'Owner', qr: '' }],
          texts: {
            registration_badge: '',
            tin_line: '',
            invoice_note: '',
            allergen_note: 'Contains milk.',
            updated_at: null
          }
        },
        error: null
      }),
      place_order: () => ({ data: [PLACED], error: null }),
      order_status: () => ({ data: STATUS, error: null }),
      find_order: () => ({ data: TOKEN, error: null }),
      join_waitlist: () => ({ data: [{ waitlist_id: 'w', replayed: false }], error: null })
    };
    const handler = handlers[name] ?? fallback[name];
    const reply = handler ? await handler(args) : { data: null, error: null };
    if (reply instanceof Error) throw reply;
    return reply;
  });
  const client = { rpc, storage: { from: () => ({ upload: vi.fn() }) } } as unknown as OrderClient &
    PaymentClient &
    UploadClient;
  return { client, rpc, calls };
}

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

async function mounted(handlers: Handlers = {}, screen: ScreenKey = 'checkout') {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  const fake = fakeClient(handlers);
  await act(async () => {
    await runtime.loadShopPayment(fake.client);
    await runtime.loadShopOrders(fake.client);
  });
  act(() =>
    runtime.setState({ screen, cust: { ...(runtime.state.cust as object), box: { dcf: 2 } } })
  );
  return { runtime, ...fake };
}

const custSet = (runtime: OpsRuntime, key: string, value: string) =>
  act(() =>
    (runtime as unknown as { custSet: (k: string, v: string) => void }).custSet(key, value)
  );

async function fillForm(runtime: OpsRuntime, over: Record<string, string> = {}) {
  const dates = runtime.renderVals().liveCheckout!.dates;
  const values: Record<string, string> = {
    name: 'Ana',
    ig: '@ana.bakes',
    mobile: '0917 123 4567',
    pickupDate: dates[0]!.value,
    pickupTime: '10:30',
    pay: 'GCash',
    ...over
  };
  for (const [k, v] of Object.entries(values)) custSet(runtime, k, v);
}

const submit = async (runtime: OpsRuntime) => {
  await act(async () => {
    runtime.renderVals().cust.submit();
  });
  await flush();
};
const placeCalls = (calls: Array<{ name: string; args: Record<string, unknown> }>) =>
  calls
    .filter((c) => c.name === 'place_order')
    .map((c) => c.args.p_order as Record<string, unknown>);

describe('B2: the live checkout', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => {
    cleanup();
    replacePayAccounts(PORTED.map((m) => ({ ...m })));
    window.history.replaceState(null, '', '/');
  });

  it('renders the live slot: her fields, no email, no amount, no screenshot', async () => {
    const { runtime } = await mounted();
    const text = render(<CheckoutScreen v={runtime.renderVals()} />).container.textContent ?? '';
    for (const wanted of [
      'Your order',
      'Name',
      'Instagram handle',
      'Contact number',
      'Pickup',
      'Payment',
      'Place order'
    ])
      expect(text).toContain(wanted);
    for (const gone of [
      'Email',
      'Amount you sent',
      'Payment screenshot',
      'Attach your screenshot',
      'Submit order',
      'Cine verifies'
    ])
      expect(text).not.toContain(gone);
    // Mutation: dropping the guarded branch from checkout.tsx brings the ported email and screenshot back.
  });

  it('demo mode keeps the ported checkout and the engine’s own submit', () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const v = ref.current!.renderVals();
    expect(v.liveCheckout).toBeUndefined();
    const text = render(<CheckoutScreen v={v} />).container.textContent ?? '';
    expect(text).toContain('Payment screenshot');
    expect(text).toContain('Submit order');
    expect(text).toContain('Your slot is held once Cine verifies the payment.');
    // Mutation: an unguarded bareFrame or a live-only override that runs in demo mode changes this text.
  });

  it('demo mode still runs the engine’s own submit, which validates and never calls the database', async () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const fake = fakeClient();
    await act(async () => {
      await ref.current!.loadShopOrders(fake.client);
    });
    act(() => ref.current!.renderVals().cust.submit());
    expect(String((ref.current!.state.toast as { msg?: string } | null)?.msg ?? JSON.stringify(ref.current!.state.toast))).toMatch(/still need filling in/);
    expect(fake.rpc).not.toHaveBeenCalled();
    // Mutation: applying the live overrides outside the live-mode branch of the constructor breaks this.
  });

  it('offers only the owner’s pickup dates and times from the database', async () => {
    const { runtime } = await mounted({
      get_shop_order_rules: () => ({ data: { ...RULES, pickup_days: [3] }, error: null })
    });
    const live = runtime.renderVals().liveCheckout!;
    expect(live.rulesState).toBe('ready');
    expect(live.dates.length).toBeGreaterThan(0);
    expect(live.dates.every((d) => new Date(d.value + 'T00:00:00Z').getUTCDay() === 3)).toBe(true);
    expect(live.times.at(-1)?.value).toBe('campus');
  });

  it('offers no dates when the rules cannot be read, and says so', async () => {
    const { runtime } = await mounted({
      get_shop_order_rules: () => ({ data: null, error: { code: '57014', message: 'x' } })
    });
    const live = runtime.renderVals().liveCheckout!;
    expect(live.rulesState).toBe('failed');
    expect(live.dates).toEqual([]);
    expect(render(<CheckoutScreen v={runtime.renderVals()} />).container.textContent).toContain(
      'pickup days could not be loaded'
    );
  });

  it('checks the fields first: nothing is sent while a field is missing', async () => {
    const { runtime, calls } = await mounted();
    await submit(runtime);
    expect(placeCalls(calls)).toHaveLength(0);
    const errors = runtime.renderVals().liveCheckout!.errors;
    expect(Object.keys(errors).sort()).toEqual(['date', 'ig', 'mobile', 'name', 'pay', 'time']);
    await custSet(runtime, 'name', 'Ana');
    expect(runtime.renderVals().liveCheckout!.errors.name).toBeUndefined();
    expect(runtime.renderVals().liveCheckout!.errors.mobile).toBeDefined();
    // Mutation: sending without the field check reaches place_order with an empty body.
  });

  it('places the order once, with exactly the customer’s own fields, and shows the number and link', async () => {
    const { runtime, calls } = await mounted();
    await fillForm(runtime);
    await submit(runtime);
    const bodies = placeCalls(calls);
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    expect(Object.keys(body).sort()).toEqual([
      'client_id',
      'ig',
      'items',
      'mobile',
      'name',
      'pay_method',
      'pickup_date',
      'pickup_window'
    ]);
    expect(body).toMatchObject({
      name: 'Ana',
      ig: '@ana.bakes',
      pay_method: 'GCash',
      pickup_window: '10:30',
      items: [{ product_id: 'dcf', qty: 2 }]
    });
    expect(String(body.client_id)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    const placed = runtime.renderVals().liveCheckout!.placed!;
    expect(placed.orderNo).toBe('HC-1001');
    expect(placed.statusUrl).toBe(window.location.origin + '/status#t=' + TOKEN);
    expect(placed.statusUrl).not.toContain('?');
    const text = render(<CheckoutScreen v={runtime.renderVals()} />).container.textContent ?? '';
    expect(text).toContain('Order no. HC-1001');
    expect(text).toContain('#t=' + TOKEN);
    expect(text).not.toContain('Place order');
  });

  it('a double tap while the order is in flight sends one order', async () => {
    let release: (r: Reply) => void = () => undefined;
    const { runtime, calls } = await mounted({
      place_order: () => new Promise<Reply>((resolve) => (release = resolve))
    });
    await fillForm(runtime);
    await act(async () => {
      runtime.renderVals().cust.submit();
      runtime.renderVals().cust.submit();
    });
    expect(runtime.renderVals().liveCheckout!.sending).toBe(true);
    expect(placeCalls(calls)).toHaveLength(1);
    await act(async () => release({ data: [PLACED], error: null }));
    await flush();
    expect(runtime.renderVals().liveCheckout!.placed?.orderNo).toBe('HC-1001');
    // Mutation: dropping the in-flight guard in OrderFlow.submit sends two orders.
  });

  it('after a lost reply the fields freeze and "Try again" resends the same id and the identical body', async () => {
    let n = 0;
    const { runtime, calls } = await mounted({
      place_order: () =>
        ++n === 1
          ? new TypeError('Failed to fetch')
          : { data: [{ ...PLACED, replayed: true }], error: null }
    });
    await fillForm(runtime);
    await submit(runtime);
    let v = runtime.renderVals().liveCheckout!;
    expect(v.readOnly).toBe(true);
    expect(v.banner?.tone).toBe('notice');
    expect(v.placed).toBeNull();
    // Edited after the loss: the frozen body still goes, so a changed order can never ride the old id.
    await custSet(runtime, 'name', 'Someone Else');
    await submit(runtime);
    const [first, second] = placeCalls(calls);
    expect(second).toEqual(first);
    expect(second!.name).toBe('Ana');
    expect(runtime.renderVals().liveCheckout!.placed?.orderNo).toBe('HC-1001');
    v = runtime.renderVals().liveCheckout!;
    expect(v.readOnly).toBe(false);
    // Mutation: minting a new id on every submit sends a different client_id the second time.
  });

  it('"Change the order" drops the frozen attempt and warns to check Find my order', async () => {
    const { runtime, calls } = await mounted({ place_order: () => new TypeError('offline') });
    await fillForm(runtime);
    await submit(runtime);
    act(() => runtime.renderVals().liveCheckout!.changeOrder());
    const v = runtime.renderVals().liveCheckout!;
    expect(v.readOnly).toBe(false);
    expect(v.banner?.text).toContain('Find my order');
    await submit(runtime);
    const [first, second] = placeCalls(calls);
    expect(second!.client_id).not.toBe(first!.client_id);
  });

  it('a definite refusal is worded, ends the attempt, and the next try has a new id', async () => {
    let n = 0;
    const { runtime, calls } = await mounted({
      place_order: () =>
        ++n === 1
          ? { data: null, error: { code: 'ZC001', message: 'closed', details: null } }
          : { data: [PLACED], error: null }
    });
    await fillForm(runtime);
    await submit(runtime);
    const v = runtime.renderVals().liveCheckout!;
    expect(v.banner).toEqual({ tone: 'error', text: DROP_CLOSED_MESSAGE, canWaitlist: true });
    expect(v.readOnly).toBe(false);
    await submit(runtime);
    const [first, second] = placeCalls(calls);
    expect(second!.client_id).not.toBe(first!.client_id);
  });

  it('a pickup or payment refusal lands on its own field', async () => {
    const { runtime } = await mounted({
      place_order: () => ({ data: null, error: { code: 'ZC004', message: 'x', details: null } })
    });
    await fillForm(runtime);
    await submit(runtime);
    expect(runtime.renderVals().liveCheckout!.errors.date).toMatch(/pickup/);
    const paid = await mounted({
      place_order: () => ({ data: null, error: { code: 'ZC005', message: 'x', details: null } })
    });
    await fillForm(paid.runtime);
    await submit(paid.runtime);
    expect(paid.runtime.renderVals().liveCheckout!.errors.pay).toMatch(/payment method/);
  });

  it('with no Supabase there is nothing to order through: no dates, and a submit says so', async () => {
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    await act(async () => {
      await ref.current!.loadShopOrders(null);
    });
    act(() => ref.current!.setState({ screen: 'checkout' }));
    const v = ref.current!.renderVals().liveCheckout!;
    expect(v.rulesState).toBe('failed');
    expect(v.dates).toEqual([]);
    await act(async () => {
      ref.current!.renderVals().cust.submit();
    });
    expect(ref.current!.state.toast).toBeTruthy();
  });

  it('"See my order" clears the form and opens the status page for the placed order', async () => {
    const { runtime, calls } = await mounted();
    await fillForm(runtime);
    await submit(runtime);
    await act(async () => runtime.renderVals().liveCheckout!.placed!.seeOrder());
    await flush();
    expect(runtime.state.screen).toBe('status');
    expect((runtime.state.cust as { name: string; box: object }).name).toBe('');
    expect(calls.some((c) => c.name === 'order_status' && c.args.p_token === TOKEN)).toBe(true);
    expect(runtime.renderVals().liveCheckout).toBeNull();
  });
});

describe('B2: the status page', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => {
    cleanup();
    replacePayAccounts(PORTED.map((m) => ({ ...m })));
    window.history.replaceState(null, '', '/');
  });

  it('shows the database order with no invoice, no proof claim and no pickup code', async () => {
    const { runtime } = await mounted({}, 'status');
    await act(async () => {
      await (
        runtime as unknown as { orderFlow: { loadStatus: (t: string) => Promise<void> } }
      ).orderFlow.loadStatus(TOKEN);
    });
    const cust = runtime.renderVals().cust;
    expect(cust.heroTitle).toBe('Order received');
    expect(cust.invoiceLine).toBe('');
    expect(cust.showCode).toBe(false);
    const text = render(<OrderStatusScreen v={runtime.renderVals()} />).container.textContent ?? '';
    expect(text).toContain('HC-1001');
    expect(text).toContain('Contains milk.');
    expect(text).not.toMatch(/Invoice|payment proof|Pickup code/);
    // Mutation: taking the values from the engine's local orders shows "Order received / HC-1042" or an invoice.
  });

  it('says so, without a stack of ported text, when the order cannot be found or loaded', async () => {
    const missing = await mounted({ order_status: () => ({ data: null, error: null }) }, 'status');
    await act(async () => {
      await (
        missing.runtime as unknown as { orderFlow: { loadStatus: (t: string) => Promise<void> } }
      ).orderFlow.loadStatus(TOKEN);
    });
    expect(missing.runtime.renderVals().cust.heroTitle).toBe('We could not find that order');
    cleanup();
    const broken = await mounted(
      { order_status: () => ({ data: null, error: { code: '57014', message: 'x' } }) },
      'status'
    );
    await act(async () => {
      await (
        broken.runtime as unknown as { orderFlow: { loadStatus: (t: string) => Promise<void> } }
      ).orderFlow.loadStatus(TOKEN);
    });
    expect(broken.runtime.renderVals().cust.heroTitle).toBe('We could not load your order');
  });

  it('adopts the status link from the URL fragment on a direct load, and validates it', async () => {
    window.history.replaceState(null, '', '/status#t=' + TOKEN);
    const { runtime, calls } = await mounted({}, 'status');
    await act(async () => runtime.syncStatusRoute());
    await flush();
    expect(calls.filter((c) => c.name === 'order_status').map((c) => c.args.p_token)).toEqual([
      TOKEN
    ]);
    expect(runtime.renderVals().cust.heroTitle).toBe('Order received');
    cleanup();
    window.history.replaceState(null, '', '/status#t=' + 'z'.repeat(64));
    const bad = await mounted({}, 'status');
    await act(async () => bad.runtime.syncStatusRoute());
    expect(bad.calls.some((c) => c.name === 'order_status')).toBe(false);
    // Mutation: reading the token from the query string, or skipping the 64-hex check, changes these.
  });

  it('keeps the token in the fragment, never the query string', async () => {
    window.history.replaceState(null, '', '/status');
    const { runtime } = await mounted({}, 'status');
    await act(async () => {
      await (
        runtime as unknown as { orderFlow: { loadStatus: (t: string) => Promise<void> } }
      ).orderFlow.loadStatus(TOKEN);
    });
    act(() => runtime.syncStatusRoute());
    expect(window.location.hash).toBe('#t=' + TOKEN);
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/status');
  });

  it('does nothing to the address bar off the status screen', async () => {
    window.history.replaceState(null, '', '/shop');
    const { runtime } = await mounted({}, 'shop');
    act(() => runtime.syncStatusRoute());
    expect(window.location.hash).toBe('');
  });

  it('"Order this cookie again" loads only the flavours still on the menu', async () => {
    const { runtime } = await mounted({}, 'status');
    await act(async () => {
      await (
        runtime as unknown as { orderFlow: { loadStatus: (t: string) => Promise<void> } }
      ).orderFlow.loadStatus(TOKEN);
    });
    act(() => runtime.renderVals().cust.reorder());
    expect(runtime.state.screen).toBe('shop');
    expect((runtime.state.cust as { box: Record<string, number> }).box).toEqual({ dcf: 2 });
  });
});

describe('B2: find my order and the waiting list', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => {
    cleanup();
    replacePayAccounts(PORTED.map((m) => ({ ...m })));
  });

  it('opens the lookup as a sheet on a customer page, never on a staff page, whatever the role says', async () => {
    const { runtime } = await mounted({}, 'shop');
    expect(runtime.state.role).toBe('owner'); // an anonymous visitor's engine role: the reason the gate is the screen
    act(() => runtime.renderVals().openLookup());
    let v = runtime.renderVals();
    expect(v.sheet?.liveForm).toBe(true);
    expect(v.liveLookup).not.toBeNull();
    expect(render(<LiveFormHost v={v} />).container.textContent).toContain('Order number');
    act(() => runtime.setState({ screen: 'today' }));
    v = runtime.renderVals();
    expect(v.liveLookup).toBeNull();
    expect(v.sheet?.liveForm).toBe(false);
    // Mutation: gating on the role instead of the screen opens the customer sheet on a staff page.
  });

  it('finds an order by number and phone, then shows it', async () => {
    const { runtime, calls } = await mounted({}, 'shop');
    act(() => runtime.renderVals().openLookup());
    await act(async () => runtime.renderVals().liveLookup!.run('hc-1001', '0917 123 4567'));
    await flush();
    expect(calls.find((c) => c.name === 'find_order')?.args).toEqual({
      p_order_no: 'HC-1001',
      p_phone: '0917 123 4567'
    });
    expect(runtime.state.screen).toBe('status');
    expect(runtime.state.sheet).toBeNull();
    expect(runtime.renderVals().cust.heroTitle).toBe('Order received');
  });

  it('a miss says the ported miss sentence and stays on the sheet', async () => {
    const { runtime } = await mounted({ find_order: () => ({ data: null, error: null }) }, 'shop');
    act(() => runtime.renderVals().openLookup());
    await act(async () => runtime.renderVals().liveLookup!.run('HC-1001', '0917 123 4567'));
    await flush();
    expect(runtime.state.screen).toBe('shop');
    expect(runtime.renderVals().liveLookup!.state).toBe('missed');
    expect(render(<LiveFormHost v={runtime.renderVals()} />).container.textContent).toContain(
      'Nothing matches that.'
    );
  });

  it('the shop footer offers the waiting list, and joining sends exactly its own fields', async () => {
    const { runtime, calls } = await mounted({}, 'shop');
    const footer = render(<LiveShopFooter v={runtime.renderVals()} />).container.textContent ?? '';
    expect(footer).toContain('Join the waiting list');
    act(() => runtime.renderVals().openWaitlist!());
    const form = runtime.renderVals().liveWaitlist!;
    await act(async () =>
      form.join({ name: ' Ana ', ig: '', mobile: '0917 123 4567', wantedDate: form.min })
    );
    await flush();
    const body = calls.find((c) => c.name === 'join_waitlist')!.args.p_entry as Record<
      string,
      unknown
    >;
    expect(Object.keys(body).sort()).toEqual(['client_id', 'ig', 'mobile', 'name', 'wanted_date']);
    expect(body.name).toBe('Ana');
    expect(runtime.renderVals().liveWaitlist!.state).toBe('done');
  });

  it('the waiting list checks its fields first and words a refusal', async () => {
    const { runtime, calls } = await mounted(
      {
        join_waitlist: () => ({ data: null, error: { code: 'ZC006', message: 'x', details: null } })
      },
      'shop'
    );
    act(() => runtime.renderVals().openWaitlist!());
    await act(async () =>
      runtime.renderVals().liveWaitlist!.join({ name: '', ig: '', mobile: '1', wantedDate: '' })
    );
    expect(calls.some((c) => c.name === 'join_waitlist')).toBe(false);
    expect(Object.keys(runtime.renderVals().liveWaitlist!.errors).sort()).toEqual([
      'date',
      'mobile',
      'name'
    ]);
    const form = runtime.renderVals().liveWaitlist!;
    await act(async () =>
      form.join({ name: 'Ana', ig: '', mobile: '09171234567', wantedDate: form.min })
    );
    await flush();
    expect(runtime.renderVals().liveWaitlist!.state).toBe('refused');
    expect(runtime.renderVals().liveWaitlist!.message).toMatch(/waiting list/);
  });

  it('a lost reply on the waiting list resends the same id', async () => {
    let n = 0;
    const { runtime, calls } = await mounted(
      {
        join_waitlist: () =>
          ++n === 1
            ? new TypeError('offline')
            : { data: [{ waitlist_id: 'w', replayed: true }], error: null }
      },
      'shop'
    );
    act(() => runtime.renderVals().openWaitlist!());
    const form = runtime.renderVals().liveWaitlist!;
    const fields = { name: 'Ana', ig: '', mobile: '09171234567', wantedDate: form.min };
    await act(async () => form.join(fields));
    await flush();
    expect(runtime.renderVals().liveWaitlist!.state).toBe('unknown');
    await act(async () => runtime.renderVals().liveWaitlist!.join({ ...fields, name: 'Other' }));
    await flush();
    const bodies = calls.filter((c) => c.name === 'join_waitlist').map((c) => c.args.p_entry as Record<string, unknown>);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(runtime.renderVals().liveWaitlist!.state).toBe('done');
  });

  it('demo mode has none of it', () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const v = ref.current!.renderVals();
    expect(v.liveLookup).toBeUndefined();
    expect(v.liveWaitlist).toBeUndefined();
    expect(v.openWaitlist).toBeUndefined();
  });
});
