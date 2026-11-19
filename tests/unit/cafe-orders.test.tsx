import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CafeOrderSettings } from '@/components/live/cafe-order-settings';
import { CafeOrderSection } from '@/components/live/sell/cafe-order-form';
import { CafePricesUnavailable } from '@/lib/data/cafe-prices';
import {
  CafeOrderRefused,
  cafeOrderBody,
  checkCafeForm,
  createCafeOrder,
  fetchCafeOrderSettings,
  parseCafePrice,
  parseCafeQty,
  saveCafeOrderSettings,
  type CafeOrdersClient
} from '@/lib/data/cafe-orders';

afterEach(cleanup);

type Rpc = (
  name: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;
const clientOf = (rpc: Rpc) =>
  ({ rpc: vi.fn(rpc) }) as unknown as CafeOrdersClient & { rpc: ReturnType<typeof vi.fn> };

const price = (
  id: string,
  name: string,
  retail: number,
  effective: number,
  own: number | null
) => ({
  product_id: id,
  name,
  price_cents: String(retail),
  default_cents: Math.floor((retail * 7) / 10 / 500) * 500,
  cafe_price_cents: own,
  effective_cents: effective,
  updated_at: null
});
const PRICES = [
  price('choc', 'Chocolate', 13000, 9000, null),
  price('butter', 'Butter', 12000, 7500, 7500)
];
const saved = (extra: Record<string, unknown> = {}) => ({
  order_no: 'HC-2001',
  total_cents: '90000',
  pickup_date: '2026-12-01',
  replayed: false,
  takes_slots: true,
  ...extra
});

describe('café order data layer', () => {
  it('sends exactly the order body: no total, no role, no state', () => {
    const body = cafeOrderBody({
      clientId: 'c',
      name: '  Bean Cafe ',
      pickupDate: '2026-12-01',
      notes: ' hi ',
      lines: [{ productId: 'choc', qty: 10, unitCents: 9000 }]
    });
    expect(Object.keys(body).sort()).toEqual(['clientId', 'lines', 'name', 'notes', 'pickupDate']);
    expect(body.name).toBe('Bean Cafe');
    expect(body.notes).toBe('hi');
    expect(Object.keys(body.lines[0]!).sort()).toEqual(['productId', 'qty', 'unitCents']);
  });

  it('reads the saved order, and says where it counts', async () => {
    const client = clientOf(async () => ({ data: [saved()], error: null }));
    const result = await createCafeOrder(client, {
      clientId: 'c',
      name: 'Bean',
      pickupDate: '2026-12-01',
      notes: '',
      lines: [{ productId: 'choc', qty: 10, unitCents: 9000 }]
    });
    expect(result).toEqual({
      orderNo: 'HC-2001',
      totalCents: 90000,
      pickupDate: '2026-12-01',
      replayed: false,
      takesSlots: true
    });
    expect(client.rpc).toHaveBeenCalledWith('create_cafe_order', expect.any(Object));
  });

  it('turns each refusal into words, and the missing migration into the unavailable note', async () => {
    const input = {
      clientId: 'c',
      name: 'Bean',
      pickupDate: '2026-12-01',
      notes: '',
      lines: [{ productId: 'choc', qty: 1, unitCents: 9000 }]
    };
    const refuse = (error: unknown) =>
      createCafeOrder(
        clientOf(async () => ({ data: null, error })),
        input
      );
    await expect(refuse({ code: 'ZC002', message: 'x', details: '12' })).rejects.toThrow(
      /12 cookie slots are left/
    );
    await expect(refuse({ code: 'ZC002', message: 'x' })).rejects.toThrow(/not enough room/);
    await expect(refuse({ code: '22023', message: 'x' })).rejects.toThrow(/not accepted/);
    await expect(refuse({ code: '23505', message: 'x' })).rejects.toThrow(/already used/);
    await expect(refuse({ code: '42501', message: 'x' })).rejects.toThrow(/Only the owner/);
    await expect(
      refuse({ code: 'PGRST202', message: 'Could not find the function' })
    ).rejects.toBeInstanceOf(CafePricesUnavailable);
    const timeout = await refuse({ code: '57014', message: 'timeout' }).catch((e: unknown) => e);
    expect(timeout).toBeInstanceOf(CafeOrderRefused);
    expect((timeout as CafeOrderRefused).retryable).toBe(true);
    const unreadable = await createCafeOrder(
      clientOf(async () => ({ data: [{ order_no: 5 }], error: null })),
      input
    ).catch((e: unknown) => e);
    expect((unreadable as CafeOrderRefused).retryable).toBe(true);
    expect(JSON.stringify(unreadable)).not.toContain('HC-');
  });

  it('reads and saves the setting', async () => {
    const client = clientOf(async (name, args) => ({
      data: [
        {
          count_toward_limit:
            name === 'save_cafe_order_settings' ? args?.p_count_toward_limit : true,
          updated_at: 'x'
        }
      ],
      error: null
    }));
    expect(await fetchCafeOrderSettings(client)).toEqual({ countTowardLimit: true });
    expect(await saveCafeOrderSettings(client, false)).toEqual({ countTowardLimit: false });
    expect(client.rpc).toHaveBeenLastCalledWith('save_cafe_order_settings', {
      p_count_toward_limit: false
    });
    await expect(
      fetchCafeOrderSettings(
        clientOf(async () => ({ data: null, error: { code: '42883', message: 'x' } }))
      )
    ).rejects.toBeInstanceOf(CafePricesUnavailable);
  });

  it('checks quantities, prices and the form as typed', () => {
    expect(parseCafeQty('12')).toEqual({ qty: 12 });
    for (const bad of ['', '0', '501', '1.5', '-1', 'x'])
      expect(parseCafeQty(bad)).toHaveProperty('error');
    expect(parseCafePrice('85')).toEqual({ cents: 8500 });
    expect(parseCafePrice('₱1,090.50')).toEqual({ cents: 109050 });
    for (const bad of ['', '0', '-5', '90.555', '1000000.01', 'abc'])
      expect(parseCafePrice(bad)).toHaveProperty('error');
    const lines = [
      { productId: 'choc', name: 'Chocolate', qty: '10', price: '90' },
      { productId: 'butter', name: 'Butter', qty: '', price: '75' }
    ];
    const ok = checkCafeForm({ name: 'Bean', pickupDate: '2026-12-01', lines }, '2026-11-20');
    expect(ok.ok).toBe(true);
    expect(ok.send).toEqual([{ productId: 'choc', qty: 10, unitCents: 9000 }]);
    expect(ok.totalCents).toBe(90000);
    expect(checkCafeForm({ name: ' ', pickupDate: '', lines }, '2026-11-20')).toMatchObject({
      ok: false,
      name: expect.any(String),
      date: expect.any(String)
    });
    expect(
      checkCafeForm({ name: 'B', pickupDate: '2026-11-19', lines }, '2026-11-20').date
    ).toMatch(/before today/);
    expect(
      checkCafeForm(
        { name: 'B', pickupDate: '2026-12-01', lines: lines.map((l) => ({ ...l, qty: '' })) },
        '2026-11-20'
      ).lines
    ).toMatch(/at least one/);
    const bad = checkCafeForm(
      { name: 'B', pickupDate: '2026-12-01', lines: [{ ...lines[0]!, price: '0' }] },
      '2026-11-20'
    );
    expect(bad.ok).toBe(false);
    expect(bad.lineErrors.choc?.price).toBe('The price must be more than ₱0.');
  });
});

describe('the New café order form', () => {
  const open = async (client: CafeOrdersClient, onSaved = vi.fn()) => {
    render(
      <CafeOrderSection getClient={() => client} onSaved={onSaved} today={() => '2026-11-20'} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'New café order' }));
    await screen.findByRole('textbox', { name: /Café or customer name/ });
    return onSaved;
  };
  const fill = () => {
    fireEvent.change(screen.getByRole('textbox', { name: /Café or customer name/ }), {
      target: { value: 'Bean Cafe' }
    });
    fireEvent.change(screen.getByLabelText('Pickup date'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Quantity of Chocolate' }), {
      target: { value: '10' }
    });
  };

  const ok = (extra?: Partial<Record<string, unknown>>) =>
    clientOf(async (name) => {
      if (name === 'get_cafe_prices') return { data: PRICES, error: null };
      if (name === 'get_cafe_order_settings')
        return { data: [{ count_toward_limit: true, updated_at: 'x' }], error: null };
      return { data: [saved(extra)], error: null };
    });

  it('starts each line at its café price, lets her change one, and sends only the lines with a quantity', async () => {
    const client = ok();
    const onSaved = await open(client);
    expect(
      (screen.getByRole('textbox', { name: 'Price of Chocolate' }) as HTMLInputElement).value
    ).toBe('90');
    expect(
      (screen.getByRole('textbox', { name: 'Price of Butter' }) as HTMLInputElement).value
    ).toBe('75');
    expect(screen.getByText(/Order form ₱130\.00 · café ₱90\.00/)).toBeTruthy();
    expect(screen.getByText(/counts toward the weekly limit/)).toBeTruthy();
    fill();
    fireEvent.change(screen.getByRole('textbox', { name: 'Price of Chocolate' }), {
      target: { value: '85' }
    });
    expect(screen.getByText('Total ₱850.00')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save café order' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, args] = client.rpc.mock.calls.find((c) => c[0] === 'create_cafe_order')!;
    expect(args.p_order).toMatchObject({
      name: 'Bean Cafe',
      pickupDate: '2026-12-01',
      notes: '',
      lines: [{ productId: 'choc', qty: 10, unitCents: 8500 }]
    });
    expect(JSON.stringify(args)).not.toMatch(/total|role|state|paid/i);
    expect(
      await screen.findByText(/Café order HC-2001 saved: ₱900\.00, not paid yet\./)
    ).toBeTruthy();
    expect(screen.getByText(/mark it paid when the café pays/)).toBeTruthy();
  });

  it('says what is missing before it asks the database anything', async () => {
    const client = ok();
    await open(client);
    fireEvent.click(screen.getByRole('button', { name: 'Save café order' }));
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent).join(' ')).toMatch(
      /café’s name.*pickup date.*at least one flavour/
    );
    expect(client.rpc.mock.calls.some((c) => c[0] === 'create_cafe_order')).toBe(false);
  });

  it('keeps the form and says why when the week is full; a retry of the same order keeps its id, an edit gets a new one', async () => {
    let calls = 0;
    const client = clientOf(async (name) => {
      if (name === 'get_cafe_prices') return { data: PRICES, error: null };
      if (name === 'get_cafe_order_settings')
        return { data: [{ count_toward_limit: true, updated_at: 'x' }], error: null };
      calls += 1;
      return {
        data: null,
        error: { code: calls < 3 ? 'ZC002' : '57014', message: 'x', details: '4' }
      };
    });
    await open(client);
    fill();
    const send = () => fireEvent.click(screen.getByRole('button', { name: 'Save café order' }));
    send();
    await screen.findByText(/4 cookie slots are left/);
    send();
    await waitFor(() => expect(calls).toBe(2));
    fireEvent.change(screen.getByRole('textbox', { name: 'Quantity of Chocolate' }), {
      target: { value: '11' }
    });
    send();
    await waitFor(() => expect(calls).toBe(3));
    const ids = client.rpc.mock.calls
      .filter((c) => c[0] === 'create_cafe_order')
      .map((c) => c[1].p_order.clientId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect(
      (screen.getByRole('textbox', { name: /Café or customer name/ }) as HTMLInputElement).value
    ).toBe('Bean Cafe');
  });

  it('says the setting is off in the form, and shows a note instead of a form without the migration', async () => {
    const off = clientOf(async (name) =>
      name === 'get_cafe_prices'
        ? { data: PRICES, error: null }
        : { data: [{ count_toward_limit: false, updated_at: 'x' }], error: null }
    );
    await open(off);
    expect(screen.getByText(/does not count toward the weekly limit/)).toBeTruthy();
    cleanup();
    const missing = clientOf(async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' }
    }));
    render(
      <CafeOrderSection getClient={() => missing} onSaved={vi.fn()} today={() => '2026-11-20'} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'New café order' }));
    expect((await screen.findByRole('note')).textContent).toContain(
      'need the next database update'
    );
    expect(screen.queryByRole('textbox', { name: /Café or customer name/ })).toBeNull();
  });
});

describe('the café order setting', () => {
  it('shows the saved choice, saves a change on its own, and goes back when a save fails', async () => {
    let fail = false;
    const client = clientOf(async (name, args) => {
      if (name === 'get_cafe_order_settings')
        return { data: [{ count_toward_limit: true, updated_at: 'x' }], error: null };
      return fail
        ? { data: null, error: { code: '57014', message: 'x' } }
        : {
            data: [{ count_toward_limit: args?.p_count_toward_limit, updated_at: 'y' }],
            error: null
          };
    });
    render(<CafeOrderSettings getClient={() => client} />);
    const toggle = (await screen.findByRole('switch', {
      name: 'Café orders count toward the weekly limit'
    })) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    await screen.findByText(/New café orders do not count toward the weekly limit/);
    expect(toggle.checked).toBe(false);
    fail = true;
    fireEvent.click(toggle);
    await screen.findByText('That was not saved. Try again.');
    expect(toggle.checked).toBe(false);
  });

  it('says plainly when the database has no café orders yet', async () => {
    const client = clientOf(async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' }
    }));
    render(<CafeOrderSettings getClient={() => client} />);
    expect((await screen.findByRole('note')).textContent).toContain(
      'need the next database update'
    );
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
