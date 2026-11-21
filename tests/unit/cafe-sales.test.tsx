import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CafeOrderSettings } from '@/components/live/cafe-order-settings';
import { CafePage } from '@/components/live/cafe/cafe-page';
import { CafePricesUnavailable } from '@/lib/data/cafe-prices';
import { fetchCafeOrderSettings, saveCafeOrderSettings } from '@/lib/data/cafe-orders';
import {
  CafeSaleRefused,
  DEFAULT_EXPENSE_CATEGORIES,
  addCafeExpense,
  cafeSaleBody,
  checkCafeExpenses,
  checkCafeForm,
  fetchCafeSales,
  fetchExpenseCategories,
  parseCafePrice,
  parseCafeQty,
  recordCafeSale,
  type CafeSalesClient
} from '@/lib/data/cafe-sales';
import { parseStaffOrders, readStaffOrders } from '@/lib/data/staff-orders';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const OWNER_SCOPE = {
  business: 'http://127.0.0.1:55421',
  userId: '56ea82ed-7a59-4870-952e-ecae57ec66da'
};

type Rpc = (
  name: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;
const clientOf = (rpc: Rpc) =>
  ({ rpc: vi.fn(rpc) }) as unknown as CafeSalesClient & { rpc: ReturnType<typeof vi.fn> };

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
const METHODS = [
  { id: 'gcash', label: 'GCash', active: true, sort_order: 1 },
  { id: 'old', label: 'Old bank', active: false, sort_order: 2 }
];
const saved = (extra: Record<string, unknown> = {}) => ({
  order_no: 'HC-2001',
  total_cents: '90000',
  sale_date: '2026-11-18',
  replayed: false,
  takes_slots: true,
  short: [],
  ...extra
});
const SALE_ROW = {
  order_no: 'HC-2001',
  name: 'Bean Cafe',
  sale_date: '2026-11-18',
  total_cents: '172000',
  pay_method: 'GCash',
  state: 'Completed',
  pay_state: 'confirmed',
  cookies: '12',
  notes: 'Rear door',
  items: [{ product_id: 'choc', name: 'Chocolate', qty: 12, unit_price_cents: 9000 }],
  logged_at: '2026-11-19T01:00:00+00:00'
};

describe('café sale data layer', () => {
  it('sends exactly the sale body: no total, no role, no state, no stamp', () => {
    const body = cafeSaleBody({
      clientId: 'c',
      name: '  Bean Cafe ',
      saleDate: '2026-11-18',
      payMethod: ' GCash ',
      notes: ' hi ',
      takeStock: true,
      lines: [{ productId: 'choc', qty: 10, unitCents: 9000 }]
    });
    expect(Object.keys(body).sort()).toEqual([
      'clientId',
      'lines',
      'name',
      'notes',
      'payMethod',
      'saleDate',
      'takeStock'
    ]);
    expect(body.name).toBe('Bean Cafe');
    expect(body.notes).toBe('hi');
    expect(body.payMethod).toBe('GCash');
    expect(body.takeStock).toBe(true);
    expect(Object.keys(body.lines[0]!).sort()).toEqual(['productId', 'qty', 'unitCents']);
  });

  it('reads the saved sale, where it counts and what stock could not cover', async () => {
    const client = clientOf(async () => ({
      data: [
        saved({
          short: [{ name: 'Loose cookies', by: 12, unit: 'cookie', why: 'no packaging rule' }]
        })
      ],
      error: null
    }));
    const result = await recordCafeSale(client, {
      clientId: 'c',
      name: 'Bean',
      saleDate: '2026-11-18',
      payMethod: 'Cash',
      notes: '',
      takeStock: true,
      lines: [{ productId: 'choc', qty: 10, unitCents: 9000 }]
    });
    expect(result).toEqual({
      orderNo: 'HC-2001',
      totalCents: 90000,
      saleDate: '2026-11-18',
      replayed: false,
      takesSlots: true,
      short: ['Loose cookies (no packaging rule)']
    });
    expect(client.rpc).toHaveBeenCalledWith('record_cafe_sale', { p_sale: expect.any(Object) });
  });

  it('turns each refusal into words, and the missing migration into the unavailable note', async () => {
    const input = {
      clientId: 'c',
      name: 'Bean',
      saleDate: '2026-11-18',
      payMethod: 'Cash',
      notes: '',
      takeStock: false,
      lines: [{ productId: 'choc', qty: 1, unitCents: 9000 }]
    };
    const refuse = (error: unknown) =>
      recordCafeSale(
        clientOf(async () => ({ data: null, error })),
        input
      );
    await expect(refuse({ code: 'ZC002', message: 'x', details: '12' })).rejects.toThrow(
      /12 cookie slots are left/
    );
    await expect(refuse({ code: 'ZC002', message: 'x' })).rejects.toThrow(/not enough room/);
    await expect(refuse({ code: 'ZB001', message: 'x' })).rejects.toThrow(/left the kitchen/);
    await expect(refuse({ code: '22023', message: 'x' })).rejects.toThrow(/not accepted/);
    await expect(refuse({ code: '23505', message: 'x' })).rejects.toThrow(/already used/);
    await expect(refuse({ code: '42501', message: 'x' })).rejects.toThrow(/Only the owner/);
    await expect(
      refuse({ code: 'PGRST202', message: 'Could not find the function' })
    ).rejects.toBeInstanceOf(CafePricesUnavailable);
    const timeout = await refuse({ code: '57014', message: 'timeout' }).catch((e: unknown) => e);
    expect(timeout).toBeInstanceOf(CafeSaleRefused);
    expect((timeout as CafeSaleRefused).retryable).toBe(true);
    const unreadable = await recordCafeSale(
      clientOf(async () => ({ data: [{ order_no: 5 }], error: null })),
      input
    ).catch((e: unknown) => e);
    expect((unreadable as CafeSaleRefused).retryable).toBe(true);
    expect(JSON.stringify(unreadable)).not.toContain('HC-');
  });

  it('reads the log, newest first as sent, and says when the migration is missing', async () => {
    const client = clientOf(async () => ({ data: [SALE_ROW], error: null }));
    expect(await fetchCafeSales(client)).toEqual([
      {
        orderNo: 'HC-2001',
        name: 'Bean Cafe',
        saleDate: '2026-11-18',
        totalCents: 172000,
        payMethod: 'GCash',
        paid: true,
        cookies: 12,
        notes: 'Rear door',
        expenseCents: 0,
        expenses: []
      }
    ]);
    expect(client.rpc).toHaveBeenCalledWith('get_cafe_sales');
    const unpaid = await fetchCafeSales(
      clientOf(async () => ({
        data: [{ ...SALE_ROW, state: 'Payment review', pay_state: 'unpaid', pay_method: '' }],
        error: null
      }))
    );
    expect(unpaid[0]).toMatchObject({ paid: false, payMethod: '' });
    await expect(
      fetchCafeSales(clientOf(async () => ({ data: null, error: { code: '42883', message: 'x' } })))
    ).rejects.toBeInstanceOf(CafePricesUnavailable);
    await expect(
      fetchCafeSales(clientOf(async () => ({ data: [{ order_no: 1 }], error: null })))
    ).rejects.toThrow(/malformed/);
  });

  it('sends the expenses only when there are some, trimmed', () => {
    const base = {
      clientId: 'c',
      name: 'Bean',
      saleDate: '2026-11-18',
      payMethod: 'Cash',
      notes: '',
      takeStock: false,
      lines: [{ productId: 'choc', qty: 1, unitCents: 9000 }]
    };
    expect(Object.keys(cafeSaleBody(base))).not.toContain('expenses');
    expect(Object.keys(cafeSaleBody({ ...base, expenses: [] }))).not.toContain('expenses');
    const body = cafeSaleBody({
      ...base,
      expenses: [{ category: ' Transport ', amountCents: 5000, note: ' Van ' }]
    });
    expect(body.expenses).toEqual([{ category: 'Transport', amountCents: 5000, note: 'Van' }]);
    expect(Object.keys(body.expenses![0]!).sort()).toEqual(['amountCents', 'category', 'note']);
  });

  it('says an expense was refused when the database names one', async () => {
    const input = {
      clientId: 'c',
      name: 'Bean',
      saleDate: '2026-11-18',
      payMethod: 'Cash',
      notes: '',
      takeStock: false,
      lines: [{ productId: 'choc', qty: 1, unitCents: 9000 }],
      expenses: [{ category: 'Transport', amountCents: 5000, note: '' }]
    };
    await expect(
      recordCafeSale(
        clientOf(async () => ({
          data: null,
          error: { code: '22023', message: 'an expense is whole centavos from 1 to 100000000' }
        })),
        input
      )
    ).rejects.toThrow(/An expense was not accepted/);
  });

  it('adds an expense to a sale already logged', async () => {
    const client = clientOf(async () => ({
      data: [{ order_no: 'HC-2001', expense_cents: '6550', replayed: false }],
      error: null
    }));
    const input = {
      clientId: 'x',
      orderNo: 'HC-2001',
      category: ' Transport ',
      amountCents: 300,
      note: ' Late '
    };
    expect(await addCafeExpense(client, input)).toEqual({
      orderNo: 'HC-2001',
      expenseCents: 6550,
      replayed: false
    });
    expect(client.rpc).toHaveBeenCalledWith('add_cafe_expense', {
      p_expense: {
        clientId: 'x',
        orderNo: 'HC-2001',
        category: 'Transport',
        amountCents: 300,
        note: 'Late'
      }
    });
    const refuse = (error: unknown) =>
      addCafeExpense(
        clientOf(async () => ({ data: null, error })),
        input
      );
    await expect(refuse({ code: '22023', message: 'x' })).rejects.toThrow(/not accepted/);
    await expect(refuse({ code: '23505', message: 'x' })).rejects.toThrow(/already used/);
    await expect(refuse({ code: '42501', message: 'x' })).rejects.toThrow(/Only the owner/);
    await expect(refuse({ code: 'PGRST202', message: 'Could not find' })).rejects.toBeInstanceOf(
      CafePricesUnavailable
    );
    const timeout = await refuse({ code: '57014', message: 'x' }).catch((e: unknown) => e);
    expect((timeout as CafeSaleRefused).retryable).toBe(true);
    const unreadable = await addCafeExpense(
      clientOf(async () => ({ data: [{ order_no: 1 }], error: null })),
      input
    ).catch((e: unknown) => e);
    expect((unreadable as CafeSaleRefused).retryable).toBe(true);
  });

  it('reads each sale with its expenses, and a database without them as none', async () => {
    const [row] = await fetchCafeSales(
      clientOf(async () => ({
        data: [
          {
            ...SALE_ROW,
            expense_cents: '6250',
            expenses: [
              { category: 'Transport', label: 'Café Bean Cafe · Van', amount_cents: 5000 },
              { category: 'Packaging', label: 'Café Bean Cafe · Packaging', amount_cents: '1250' }
            ]
          }
        ],
        error: null
      }))
    );
    expect(row).toMatchObject({ expenseCents: 6250 });
    expect(row!.expenses).toEqual([
      { category: 'Transport', label: 'Café Bean Cafe · Van', amountCents: 5000 },
      { category: 'Packaging', label: 'Café Bean Cafe · Packaging', amountCents: 1250 }
    ]);
  });

  it('offers her expense categories, without hidden ones or Owner draw, else a short default', async () => {
    const row = (key: string, json: unknown) => ({
      key,
      int_value: null,
      cents_value: null,
      text_value: null,
      json_value: json,
      updated_at: null
    });
    const list = await fetchExpenseCategories(
      clientOf(async () => ({
        data: [
          row('categories', ['Ingredients', 'Transport', 'Owner draw', 'Other']),
          row('inactiveCats', ['Ingredients'])
        ],
        error: null
      }))
    );
    expect(list).toEqual(['Transport', 'Other']);
    expect(
      await fetchExpenseCategories(clientOf(async () => ({ data: null, error: { code: 'x' } })))
    ).toEqual(DEFAULT_EXPENSE_CATEGORIES);
    expect(await fetchExpenseCategories(clientOf(async () => ({ data: [], error: null })))).toEqual(
      DEFAULT_EXPENSE_CATEGORIES
    );
  });

  it('checks expense rows as typed: blank rows are left out', () => {
    const ok = checkCafeExpenses([
      { category: 'Transport', amount: '50', note: ' Van ' },
      { category: 'Transport', amount: '', note: '' },
      { category: 'Packaging', amount: '12.50', note: '' }
    ]);
    expect(ok.send).toEqual([
      { category: 'Transport', amountCents: 5000, note: 'Van' },
      { category: 'Packaging', amountCents: 1250, note: '' }
    ]);
    expect(ok.totalCents).toBe(6250);
    expect(ok.errors).toEqual([undefined, undefined, undefined]);
    const bad = checkCafeExpenses([
      { category: 'Transport', amount: '', note: 'only a note' },
      { category: 'Transport', amount: '0', note: '' },
      { category: '', amount: '5', note: '' },
      { category: 'Transport', amount: '5', note: 'n'.repeat(121) }
    ]);
    expect(bad.send).toEqual([]);
    expect(bad.errors.every(Boolean)).toBe(true);
    expect(bad.errors[1]).toBe('The amount must be more than ₱0.');
    const form = checkCafeForm(
      {
        name: 'Bean',
        saleDate: '2026-11-18',
        payMethod: 'Cash',
        lines: [{ productId: 'choc', name: 'Chocolate', qty: '10', price: '90' }],
        expenses: [{ category: 'Transport', amount: 'abc', note: '' }]
      },
      '2026-11-20'
    );
    expect(form.ok).toBe(false);
    expect(form.expenseErrors[0]).toMatch(/amount like/);
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
    const form = (over: Record<string, unknown> = {}) => ({
      name: 'Bean',
      saleDate: '2026-11-18',
      payMethod: 'Cash',
      lines,
      ...over
    });
    const ok = checkCafeForm(form(), '2026-11-20');
    expect(ok.ok).toBe(true);
    expect(ok.send).toEqual([{ productId: 'choc', qty: 10, unitCents: 9000 }]);
    expect(ok.totalCents).toBe(90000);
    expect(checkCafeForm(form({ name: ' ', saleDate: '' }), '2026-11-20')).toMatchObject({
      ok: false,
      name: expect.any(String),
      date: expect.any(String)
    });
    // Today and the oldest allowed day (90 back) are fine; tomorrow and 91 back are not.
    expect(checkCafeForm(form({ saleDate: '2026-11-20' }), '2026-11-20').ok).toBe(true);
    expect(checkCafeForm(form({ saleDate: '2026-08-22' }), '2026-11-20').ok).toBe(true);
    expect(checkCafeForm(form({ saleDate: '2026-11-21' }), '2026-11-20').date).toMatch(
      /cannot be after today/
    );
    expect(checkCafeForm(form({ saleDate: '2026-08-21' }), '2026-11-20').date).toMatch(/90 days/);
    expect(checkCafeForm(form({ payMethod: '' }), '2026-11-20').method).toMatch(/payment/);
    expect(
      checkCafeForm(form({ lines: lines.map((l) => ({ ...l, qty: '' })) }), '2026-11-20').lines
    ).toMatch(/at least one/);
    const bad = checkCafeForm(form({ lines: [{ ...lines[0]!, price: '0' }] }), '2026-11-20');
    expect(bad.ok).toBe(false);
    expect(bad.lineErrors.choc?.price).toBe('The price must be more than ₱0.');
  });
});

describe('café sales stay off the Orders and Customers pages', () => {
  const order = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: 'Customer ' + id,
    phone: '09171234567',
    ig: '',
    state: 'Confirmed',
    pay_state: 'confirmed',
    pay_method: 'GCash',
    pay_ref: '',
    total_cents: 26000,
    paid_cents: 26000,
    refund_ref: null,
    pickup_date: '2026-11-11',
    pickup_window: '10:00',
    placed_at: '2026-11-09T01:00:00.000Z',
    updated_at: '2026-11-09T02:00:00.000000+00:00',
    status_token: null,
    holds: true,
    items: [{ product_id: 'choc', qty: 2, unit_price_cents: 13000, unavailable: false }],
    swaps: [],
    ...extra
  });

  it('drops a row the database says is a café sale, and does not call it unreadable', () => {
    const answer = [
      order('HC-1', { channel: 'shop' }),
      order('HC-2', { channel: 'cafe' }),
      order('HC-3')
    ];
    expect(parseStaffOrders(answer).map((o) => o.id)).toEqual(['HC-1', 'HC-3']);
    const read = readStaffOrders(answer);
    expect(read?.dropped).toBe(0);
    expect(readStaffOrders([order('HC-2', { channel: 'cafe' })])).toEqual({
      orders: [],
      dropped: 0
    });
    // A genuinely unreadable row is still counted.
    expect(
      readStaffOrders([order('HC-4', { items: [] }), order('HC-5', { channel: 'cafe' })])?.dropped
    ).toBe(1);
  });
});

describe('the Café sales view', () => {
  const ok = (rows: unknown[] = [SALE_ROW], extra?: Partial<Record<string, unknown>>) =>
    clientOf(async (name) => {
      if (name === 'get_cafe_sales') return { data: rows, error: null };
      if (name === 'get_cafe_prices') return { data: PRICES, error: null };
      if (name === 'get_cafe_order_settings')
        return { data: [{ count_toward_limit: true, updated_at: 'x' }], error: null };
      if (name === 'get_payment_methods') return { data: METHODS, error: null };
      return { data: [saved(extra)], error: null };
    });
  const show = (client: CafeSalesClient, onBack = vi.fn()) => {
    render(
      <CafePage
        getClient={() => client}
        getWriteScope={() => OWNER_SCOPE}
        onBack={onBack}
        today={() => '2026-11-20'}
      />
    );
    return onBack;
  };
  const openForm = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'Log café sale' }));
    await screen.findByRole('textbox', { name: /Café name/ });
  };
  const fill = () => {
    fireEvent.change(screen.getByRole('textbox', { name: /Café name/ }), {
      target: { value: 'Bean Cafe' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Quantity of Chocolate' }), {
      target: { value: '10' }
    });
  };

  it('lists each logged sale: date, café, cookies, total and how it was paid', async () => {
    show(ok());
    const row = (await screen.findByText('Bean Cafe')).closest('li')!;
    expect(within(row).getByText(/18 Nov 2026/)).toBeTruthy();
    expect(within(row).getByText(/12 cookies/)).toBeTruthy();
    expect(within(row).getByText(/GCash/)).toBeTruthy();
    expect(within(row).getByText('₱1,720.00')).toBeTruthy();
    expect(screen.getByText(/1 sale · ₱1,720\.00/)).toBeTruthy();
  });

  it('marks a sale that was never paid (entered as an order before the log existed)', async () => {
    show(ok([{ ...SALE_ROW, state: 'Payment review', pay_state: 'unpaid', pay_method: '' }]));
    expect(await screen.findByText(/Not paid/)).toBeTruthy();
  });

  it('says plainly when nothing is logged, and goes back', async () => {
    const onBack = show(ok([]));
    expect(await screen.findByText(/No café sales logged yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to orders' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows a note instead of a list or form without the migration', async () => {
    show(
      clientOf(async () => ({
        data: null,
        error: { code: 'PGRST202', message: 'Could not find the function' }
      }))
    );
    expect((await screen.findByRole('note')).textContent).toContain(
      'need the next database update'
    );
    expect(screen.queryByRole('button', { name: 'Log café sale' })).toBeNull();
  });

  it('offers to read the log again when it cannot be read', async () => {
    let fail = true;
    const client = clientOf(async () =>
      fail
        ? { data: null, error: { code: '57014', message: 'timeout' } }
        : { data: [SALE_ROW], error: null }
    );
    show(client);
    await screen.findByText('The café sales could not be read.');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Bean Cafe')).toBeTruthy();
  });

  it('starts today, Cash, each line at its café price, stock on; shows the running total; sends only lines with a quantity', async () => {
    const client = ok();
    show(client);
    await openForm();
    expect((screen.getByLabelText('Sale date') as HTMLInputElement).value).toBe('2026-11-20');
    expect((screen.getByLabelText('Sale date') as HTMLInputElement).max).toBe('2026-11-20');
    expect((screen.getByLabelText('Sale date') as HTMLInputElement).min).toBe('2026-08-22');
    const method = screen.getByLabelText('Paid by') as HTMLSelectElement;
    expect(method.value).toBe('Cash');
    expect([...method.options].map((o) => o.value)).toEqual(['Cash', 'GCash']);
    expect(
      (screen.getByRole('textbox', { name: 'Price of Chocolate' }) as HTMLInputElement).value
    ).toBe('90');
    expect(
      (screen.getByRole('textbox', { name: 'Price of Butter' }) as HTMLInputElement).value
    ).toBe('75');
    expect(screen.getByText(/Order form ₱130\.00 · café ₱90\.00/)).toBeTruthy();
    expect(
      (screen.getByLabelText(/Take these cookies and the packaging off stock/) as HTMLInputElement)
        .checked
    ).toBe(true);
    expect(screen.getByText(/counts toward the weekly limit/)).toBeTruthy();
    fill();
    fireEvent.change(screen.getByRole('textbox', { name: 'Price of Chocolate' }), {
      target: { value: '85' }
    });
    fireEvent.change(screen.getByLabelText('Sale date'), { target: { value: '2026-11-18' } });
    fireEvent.change(method, { target: { value: 'GCash' } });
    expect(screen.getByText('Total ₱850.00')).toBeTruthy();
  });

  it('logs the sale, says it is paid, lists what stock could not cover, and reads the log again', async () => {
    const client = ok([SALE_ROW], {
      short: [{ name: 'Loose cookies', by: 10, unit: 'cookie', why: 'no packaging rule' }]
    });
    show(client);
    await openForm();
    fill();
    fireEvent.change(screen.getByLabelText('Paid by'), { target: { value: 'GCash' } });
    fireEvent.click(screen.getByLabelText(/Take these cookies and the packaging off stock/));
    const logs = client.rpc.mock.calls.filter((c) => c[0] === 'get_cafe_sales').length;
    fireEvent.click(screen.getByRole('button', { name: 'Save café sale' }));
    expect(
      await screen.findByText(/Café sale HC-2001 logged: ₱900\.00, paid by GCash on 18 Nov 2026\./)
    ).toBeTruthy();
    const [, args] = client.rpc.mock.calls.find((c) => c[0] === 'record_cafe_sale')!;
    expect(args.p_sale).toMatchObject({
      name: 'Bean Cafe',
      saleDate: '2026-11-20',
      payMethod: 'GCash',
      takeStock: false,
      notes: '',
      lines: [{ productId: 'choc', qty: 10, unitCents: 9000 }]
    });
    expect(JSON.stringify(args)).not.toMatch(/total|role|state|paid_/i);
    await waitFor(() =>
      expect(client.rpc.mock.calls.filter((c) => c[0] === 'get_cafe_sales').length).toBe(logs + 1)
    );
    cleanup();
    const taking = ok([SALE_ROW], {
      short: [{ name: 'Loose cookies', by: 10, unit: 'cookie', why: 'no packaging rule' }]
    });
    show(taking);
    await openForm();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save café sale' }));
    expect(
      await screen.findByText(/Stock did not cover: Loose cookies \(no packaging rule\)/)
    ).toBeTruthy();
  });

  it('says what is missing before it asks the database anything', async () => {
    const client = ok();
    show(client);
    await openForm();
    fireEvent.click(screen.getByRole('button', { name: 'Save café sale' }));
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent).join(' ')).toMatch(
      /café’s name.*at least one flavour/
    );
    expect(client.rpc.mock.calls.some((c) => c[0] === 'record_cafe_sale')).toBe(false);
  });

  it('keeps the form and says why when the week is full; a retry of the same sale keeps its id, an edit gets a new one', async () => {
    let calls = 0;
    const client = clientOf(async (name) => {
      if (name === 'get_cafe_sales') return { data: [], error: null };
      if (name === 'get_cafe_prices') return { data: PRICES, error: null };
      if (name === 'get_payment_methods') return { data: METHODS, error: null };
      if (name === 'get_cafe_order_settings')
        return { data: [{ count_toward_limit: true, updated_at: 'x' }], error: null };
      if (name !== 'record_cafe_sale')
        return { data: null, error: { code: '42883', message: 'x' } };
      calls += 1;
      return {
        data: null,
        error: { code: calls < 3 ? 'ZC002' : '57014', message: 'x', details: '4' }
      };
    });
    show(client);
    await openForm();
    fill();
    const send = () => fireEvent.click(screen.getByRole('button', { name: 'Save café sale' }));
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
      .filter((c) => c[0] === 'record_cafe_sale')
      .map((c) => c[1].p_sale.clientId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
    expect((screen.getByRole('textbox', { name: /Café name/ }) as HTMLInputElement).value).toBe(
      'Bean Cafe'
    );
  });

  const withExpenses = {
    ...SALE_ROW,
    expense_cents: '6250',
    expenses: [
      { category: 'Transport', label: 'Café Bean Cafe · Van', amount_cents: 5000 },
      { category: 'Packaging', label: 'Café Bean Cafe · Packaging', amount_cents: 1250 }
    ]
  };

  it('shows each sale with its expenses and its net, and the totals', async () => {
    show(ok([withExpenses]));
    const row = (await screen.findByText('Bean Cafe')).closest('li')!;
    expect(within(row).getByText(/Transport · Van/)).toBeTruthy();
    expect(within(row).getByText('-₱50.00')).toBeTruthy();
    // No note: the category alone, not "Packaging · Packaging".
    expect(within(row).getByText('Packaging')).toBeTruthy();
    expect(within(row).getByText('Net ₱1,657.50')).toBeTruthy();
    expect(
      screen.getByText(/1 sale · ₱1,720\.00 · expenses ₱62\.50 · net ₱1,657\.50/)
    ).toBeTruthy();
  });

  it('is a page of its own: titled Café, with the weekly-limit switch on it and nothing from Bazaar', async () => {
    const client = ok();
    render(<CafePage getClient={() => client} today={() => '2026-11-20'} />);
    expect(await screen.findByRole('heading', { name: 'Café' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to orders' })).toBeNull();
    expect(
      await screen.findByRole('switch', { name: 'Café orders count toward the weekly limit' })
    ).toBeTruthy();
    expect(JSON.stringify(client.rpc.mock.calls)).not.toMatch(/bazaar|event/i);
  });

  it('adds an expense to a sale already logged, once, and reads the log again', async () => {
    const client = clientOf(async (name) => {
      if (name === 'get_cafe_sales') return { data: [SALE_ROW], error: null };
      if (name === 'get_cafe_order_settings')
        return { data: [{ count_toward_limit: true, updated_at: 'x' }], error: null };
      if (name === 'add_cafe_expense')
        return {
          data: [{ order_no: 'HC-2001', expense_cents: '300', replayed: false }],
          error: null
        };
      return { data: null, error: { code: '42883', message: 'x' } };
    });
    show(client);
    fireEvent.click(
      await screen.findByRole('button', { name: /Add an expense to the sale for Bean Cafe/ })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Type the amount.');
    expect(client.rpc.mock.calls.some((c) => c[0] === 'add_cafe_expense')).toBe(false);
    fireEvent.change(screen.getByRole('textbox', { name: 'Expense amount (₱)' }), {
      target: { value: '3' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Expense note' }), {
      target: { value: 'Late bags' }
    });
    const reads = client.rpc.mock.calls.filter((c) => c[0] === 'get_cafe_sales').length;
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(await screen.findByText('Expense added to the sale for Bean Cafe.')).toBeTruthy();
    const [, args] = client.rpc.mock.calls.find((c) => c[0] === 'add_cafe_expense')!;
    expect(args.p_expense).toMatchObject({
      orderNo: 'HC-2001',
      category: 'Transport',
      amountCents: 300,
      note: 'Late bags'
    });
    expect(JSON.stringify(args)).not.toMatch(/total|role|state|paid_/i);
    await waitFor(() =>
      expect(client.rpc.mock.calls.filter((c) => c[0] === 'get_cafe_sales').length).toBe(reads + 1)
    );
  });

  it.each([
    ['22023', /expense was not accepted/],
    ['23505', /already used for a different one/]
  ])('keeps one expense id until the server definitively refuses it (%s)', async (code, reason) => {
    let calls = 0;
    const client = clientOf(async (name) => {
      if (name === 'get_cafe_sales') return { data: [SALE_ROW], error: null };
      if (name === 'get_cafe_order_settings')
        return { data: [{ count_toward_limit: true, updated_at: 'x' }], error: null };
      if (name === 'add_cafe_expense') {
        calls += 1;
        if (calls === 2) return { data: null, error: { code, message: 'expense refused' } };
        return { data: null, error: { code: '57014', message: 'timeout' } };
      }
      return { data: null, error: { code: '42883', message: 'x' } };
    });
    show(client);
    fireEvent.click(await screen.findByRole('button', { name: /Add an expense to the sale/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Expense amount (₱)' }), {
      target: { value: '3' }
    });
    const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    save();
    await waitFor(() => expect(calls).toBe(1));
    await screen.findByText(/may have been saved/);
    expect(screen.getByRole('textbox', { name: 'Expense amount (₱)' })).toBeDisabled();
    save();
    await waitFor(() => expect(calls).toBe(2));
    await screen.findByText(reason);
    fireEvent.change(screen.getByRole('textbox', { name: 'Expense amount (₱)' }), {
      target: { value: '4' }
    });
    save();
    await waitFor(() => expect(calls).toBe(3));
    const ids = client.rpc.mock.calls
      .filter((c) => c[0] === 'add_cafe_expense')
      .map((c) => c[1].p_expense.clientId);
    expect(ids[0]).toBe(ids[1]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it('replays a saved expense after the response is lost and the Café page is reopened', async () => {
    const posted = new Set<string>();
    const client = clientOf(async (name, args) => {
      if (name === 'get_cafe_sales') return { data: [SALE_ROW], error: null };
      if (name === 'get_cafe_order_settings')
        return { data: [{ count_toward_limit: true, updated_at: 'x' }], error: null };
      if (name === 'add_cafe_expense') {
        const input = args?.p_expense as { clientId: string };
        const replayed = posted.has(input.clientId);
        posted.add(input.clientId);
        if (client.rpc.mock.calls.filter(([rpc]) => rpc === name).length === 1)
          return { data: null, error: { code: '', message: 'Connection lost' } };
        return {
          data: [{ order_no: 'HC-2001', expense_cents: 300, replayed }],
          error: null
        };
      }
      return { data: null, error: { code: '42883', message: 'x' } };
    });

    const open = async () => {
      fireEvent.click(await screen.findByRole('button', { name: /Add an expense to the sale/ }));
    };
    const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));

    show(client);
    await open();
    fireEvent.change(screen.getByRole('textbox', { name: 'Expense amount (₱)' }), {
      target: { value: '3' }
    });
    save();
    await screen.findByText(/may have been saved/);
    cleanup();

    show(client);
    await open();
    expect(screen.getByRole('textbox', { name: 'Expense amount (₱)' })).toHaveValue('3');
    await screen.findByText(/previous save needs confirmation/);
    save();
    await screen.findByText('Expense added to the sale for Bean Cafe.');
    expect(posted.size).toBe(1);
  });

  it('logs a sale with additional expenses in the same save, and shows the net as she types', async () => {
    const client = ok([SALE_ROW]);
    show(client);
    await openForm();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add an expense' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Category of expense 1' }), {
      target: { value: 'Packaging' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount of expense 1' }), {
      target: { value: '12.50' }
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Note of expense 1' }), {
      target: { value: 'Boxes' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add an expense' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount of expense 2' }), {
      target: { value: '50' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove expense 2' }));
    expect(screen.getByText('Total ₱900.00')).toBeTruthy();
    expect(screen.getByText('Expenses ₱12.50 · Net ₱887.50')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save café sale' }));
    await screen.findByText(/Café sale HC-2001 logged/);
    const [, args] = client.rpc.mock.calls.find((c) => c[0] === 'record_cafe_sale')!;
    expect(args.p_sale.expenses).toEqual([
      { category: 'Packaging', amountCents: 1250, note: 'Boxes' }
    ]);
  });

  it('says what is wrong with an expense before it asks the database anything', async () => {
    const client = ok();
    show(client);
    await openForm();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Add an expense' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note of expense 1' }), {
      target: { value: 'Delivery' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save café sale' }));
    expect((await screen.findAllByRole('alert')).map((a) => a.textContent).join(' ')).toMatch(
      /Expense 1: Use an amount like 90 or 90\.50\./
    );
    expect(client.rpc.mock.calls.some((c) => c[0] === 'record_cafe_sale')).toBe(false);
  });

  it('sends no expenses key when she added none', async () => {
    const client = ok();
    show(client);
    await openForm();
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Save café sale' }));
    await screen.findByText(/Café sale HC-2001 logged/);
    const [, args] = client.rpc.mock.calls.find((c) => c[0] === 'record_cafe_sale')!;
    expect(Object.keys(args.p_sale)).not.toContain('expenses');
  });

  it('says the setting is off in the form', async () => {
    const off = clientOf(async (name) => {
      if (name === 'get_cafe_sales') return { data: [], error: null };
      if (name === 'get_cafe_prices') return { data: PRICES, error: null };
      if (name === 'get_payment_methods') return { data: METHODS, error: null };
      return { data: [{ count_toward_limit: false, updated_at: 'x' }], error: null };
    });
    show(off);
    await openForm();
    expect(screen.getByText(/does not count toward the weekly limit/)).toBeTruthy();
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
