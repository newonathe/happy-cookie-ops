import { describe, expect, it, vi } from 'vitest';
import {
  CustomerDesk,
  normaliseMobile,
  type CustomerDeskDeps,
  type CustomerOrder
} from '@/store/customer-desk';

const order = (over: Partial<CustomerOrder> = {}): CustomerOrder => ({
  id: 'HC-1',
  name: 'Customer A',
  mobile: '09170000000',
  ig: '',
  email: '',
  status: 'Paid',
  items: { a: 2, b: 4 },
  placedAt: 100,
  ...over
});

function desk(orders: readonly CustomerOrder[] | null, over: Partial<CustomerDeskDeps> = {}) {
  const deps = {
    orders: () => orders,
    openOrder: vi.fn(),
    dateText: (at: number) => `day ${at}`,
    online: () => true,
    anonymise: vi.fn(async () => 1),
    refresh: vi.fn(async () => true),
    ...over
  };
  return { deps, desk: new CustomerDesk(deps) };
}

describe('customers from their orders', () => {
  it('does not say there are no customers before the orders are read', () => {
    expect(desk(null).desk.vals()).toMatchObject({ loaded: false, rows: [] });
    expect(desk([]).desk.vals()).toMatchObject({ loaded: true, rows: [] });
  });

  it.each([
    ['0917 000 0000', '09170000000'],
    ['+63 917 000 0000', '09170000000'],
    ['9170000000', '09170000000']
  ])('normalises %s the way the server does', (typed, plain) => {
    expect(normaliseMobile(typed)).toBe(plain);
  });

  it('groups one person across number spellings, newest order first', () => {
    const { desk: d, deps } = desk([
      order({ id: 'HC-1', placedAt: 100 }),
      order({ id: 'HC-2', placedAt: 200, mobile: '+63 917 000 0000', name: 'Customer A2' }),
      order({ id: 'HC-3', mobile: '09180000000', name: 'Customer B' })
    ]);
    const rows = d.vals().rows;
    expect(rows).toHaveLength(2);
    const first = rows.find((row) => row.key === '09170000000')!;
    expect(first.name).toBe('Customer A2');
    expect(first.orderCountText).toBe('2 orders');
    expect(first.lastOrderText).toBe('Last order day 200');
    expect(first.orders.map((row) => row.id)).toEqual(['HC-2', 'HC-1']);
    expect(first.orders[0]?.cookiesText).toBe('6 cookies');
    first.orders[0]?.open();
    expect(deps.openOrder).toHaveBeenCalledWith('HC-2');
  });

  it('keeps a customer with no number, by name, and offers nothing to erase', async () => {
    const { desk: d, deps } = desk([order({ mobile: '', name: 'Walk In' })]);
    const row = d.vals().rows[0]!;
    expect(row.key).toBe('name:walk in');
    expect(await d.vals().removeContact(row)).toBe('failed');
    expect(deps.anonymise).not.toHaveBeenCalled();
  });

  it('a customer record cannot run as a formula, and quotes its text', () => {
    const row = desk([order({ name: '=HYPERLINK("x")', ig: '@me', email: 'a,b' })]).desk.vals()
      .rows[0]!;
    expect(row.recordCsv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row.recordCsv).toContain(`"'@me"`);
    expect(row.recordCsv).toContain(`"a,b"`);
  });
});

describe('removing contact details', () => {
  /** Orders the server changes: `left` is what the read back finds. */
  const removal = (left: CustomerOrder[], over: Partial<CustomerDeskDeps> = {}) => {
    let orders: CustomerOrder[] = [order()];
    const refresh = vi.fn(async () => {
      orders = left;
      return true;
    });
    const { desk: d, deps } = desk(null, { orders: () => orders, refresh, ...over });
    return { d, deps, row: d.vals().rows[0]! };
  };

  it('asks the server with the number, reads back, and says removed only then', async () => {
    const { d, deps, row } = removal([order({ mobile: '', name: 'Removed' })]);
    expect(await d.vals().removeContact(row)).toBe('removed');
    expect(deps.anonymise).toHaveBeenCalledWith('09170000000');
    expect(deps.refresh).toHaveBeenCalledOnce();
  });

  it('says so when the number is still there after reading back', async () => {
    const { d, row } = removal([order({ mobile: '+63 917 000 0000' })]);
    expect(await d.vals().removeContact(row)).toBe('partial');
  });

  it('does not call it removed when the server matched nothing', async () => {
    const { d, deps, row } = removal([], { anonymise: vi.fn(async () => 0) });
    expect(await d.vals().removeContact(row)).toBe('nothing');
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it('says so when the server refuses, and reads nothing as done', async () => {
    const { d, deps, row } = removal([], {
      anonymise: vi.fn(() => Promise.reject(new Error('no')))
    });
    expect(await d.vals().removeContact(row)).toBe('failed');
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it('sends nothing offline', async () => {
    const { d, deps, row } = removal([], { online: () => false });
    expect(await d.vals().removeContact(row)).toBe('failed');
    expect(deps.anonymise).not.toHaveBeenCalled();
  });

  it.each([
    ['fails', vi.fn(() => Promise.reject(new Error('no')))],
    ['answers no', vi.fn(async () => false)]
  ])('does not claim success when the read back %s', async (_name, refresh) => {
    const { d, row } = removal([], { refresh: refresh as CustomerDeskDeps['refresh'] });
    expect(await d.vals().removeContact(row)).toBe('unconfirmed');
  });
});
