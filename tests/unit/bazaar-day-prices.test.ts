import { describe, expect, it, vi } from 'vitest';
import {
  fetchEventPrices,
  parseDayPrices,
  priceChangeError,
  setBazaarDayPrice,
  type BazaarClient,
  type PriceChange
} from '@/lib/data/bazaar-days';
import { priceCentsOf } from '@/lib/bazaar/plan';
import { buildTillLedger } from '@/lib/bazaar/till-ledger';
import type { EventSale } from '@/store/engine/ops-engine';

const EVENT = 'b0852000-0000-4000-8000-000000000001';
const CHANGE: PriceChange = {
  requestId: 'b0853000-0000-4000-8000-000000000001',
  eventId: EVENT,
  productId: 'dp-a',
  priceCents: 13000
};

function client(answer: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { rpc, client: { rpc } as unknown as BazaarClient };
}

describe('setBazaarDayPrice (D3: change a price on a started day)', () => {
  it('sends exactly the four keys and reads the day prices back', async () => {
    const { rpc, client: c } = client({
      data: { version: 1, latest: 1, prices: { 'dp-a': 13000, 'dp-b': 10000 }, duplicate: false }
    });
    expect(await setBazaarDayPrice(c, CHANGE)).toEqual({
      result: 'saved',
      duplicate: false,
      prices: { version: 1, prices: { 'dp-a': 13000, 'dp-b': 10000 } }
    });
    expect(rpc).toHaveBeenCalledWith('set_bazaar_day_price', {
      p_change: {
        requestId: CHANGE.requestId,
        eventId: EVENT,
        productId: 'dp-a',
        priceCents: 13000
      }
    });
  });

  it('takes the latest version from a repeat, so a later change is never undone by an old answer', async () => {
    const { client: c } = client({
      data: { version: 1, latest: 3, prices: { 'dp-a': 15000 }, duplicate: true }
    });
    expect(await setBazaarDayPrice(c, CHANGE)).toEqual({
      result: 'saved',
      duplicate: true,
      prices: { version: 3, prices: { 'dp-a': 15000 } }
    });
  });

  it('keeps the change when the answer cannot be read: it may have landed', async () => {
    for (const data of [
      null,
      { version: 1, prices: { 'dp-a': 1 } },
      { latest: 1, prices: [], duplicate: false }
    ])
      expect(await setBazaarDayPrice(client({ data }).client, CHANGE)).toEqual({
        result: 'offline'
      });
    const thrown = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await setBazaarDayPrice({ rpc: thrown } as unknown as BazaarClient, CHANGE)).toEqual({
      result: 'offline'
    });
  });

  it('refuses a malformed change without calling the server', async () => {
    const { rpc, client: c } = client({ data: null });
    for (const bad of [
      { ...CHANGE, requestId: 'r1' },
      { ...CHANGE, eventId: 'nope' },
      { ...CHANGE, productId: 'Not A Flavour' },
      { ...CHANGE, priceCents: 0 },
      { ...CHANGE, priceCents: 100_000_001 },
      { ...CHANGE, priceCents: 130.5 }
    ]) {
      expect(priceChangeError(bad)).not.toBeNull();
      expect(await setBazaarDayPrice(c, bad)).toEqual({ result: 'refused' });
    }
    expect(rpc).not.toHaveBeenCalled();
    expect(priceChangeError(CHANGE)).toBeNull();
  });

  it.each([
    [{ code: '22023', message: 'that is already the price' }, 'same'],
    [{ code: '55000', message: 'that day is closed: its prices cannot change' }, 'closed'],
    [{ code: '55000', message: "only a bazaar day's prices can be changed here" }, 'refused'],
    [
      { code: '23505', message: 'request id was already used for a different price change' },
      'conflict'
    ],
    [{ code: '22023', message: "flavour dp-z is not on this day's price list" }, 'refused'],
    [{ code: '42501', message: 'only the owner may change a price' }, 'refused'],
    [{ code: 'P0002', message: 'event not found' }, 'refused'],
    [{ code: '54000', message: 'a day can change its prices at most 100 times' }, 'refused'],
    [{ code: '08006', message: 'connection failure' }, 'offline'],
    [{ code: 'PGRST301', message: 'JWT expired' }, 'offline']
  ])('classifies %o as %s', async (error, want) => {
    expect(await setBazaarDayPrice(client({ error }).client, CHANGE)).toEqual({ result: want });
  });
});

describe('fetchEventPrices and parseDayPrices', () => {
  it('reads the version and the prices, and nothing malformed', async () => {
    const { rpc, client: c } = client({ data: { version: 2, prices: { 'dp-a': 13000 } } });
    expect(await fetchEventPrices(c, EVENT)).toEqual({ version: 2, prices: { 'dp-a': 13000 } });
    expect(rpc).toHaveBeenCalledWith('get_event_prices', { p_event: EVENT });
    expect(await fetchEventPrices(c, 'nope')).toBeNull();
    expect(await fetchEventPrices(client({ error: { code: '42501' } }).client, EVENT)).toBeNull();
    expect(parseDayPrices({ version: -1, prices: {} })).toBeNull();
    expect(parseDayPrices({ version: 1, prices: { 'dp-a': 1.5 } })).toBeNull();
    expect(parseDayPrices({ version: 1, prices: { BAD: 100 } })).toBeNull();
    expect(parseDayPrices({ version: 0, prices: {} })).toEqual({ version: 0, prices: {} });
  });
});

describe('priceCentsOf', () => {
  it('takes pesos with up to two decimals and gives whole centavos', () => {
    expect(priceCentsOf('130')).toBe(13000);
    expect(priceCentsOf(' 125.50 ')).toBe(12550);
    expect(priceCentsOf('0')).toMatch(/more than ₱0/);
    expect(priceCentsOf('12.345')).toMatch(/like 125/);
    expect(priceCentsOf('abc')).toMatch(/like 125/);
    expect(priceCentsOf('2000000')).toMatch(/too high/);
  });
});

describe('the till ledger after a price change', () => {
  const sale = (id: number, items: Record<string, number>, gross: number): EventSale =>
    ({
      id,
      at: 1_794_640_000_000 + id,
      items,
      gross,
      discount: 0,
      total: gross,
      pay: 'GCash'
    }) as unknown as EventSale;

  it('shows each sale at the list it was rung at, and new sales at the new price', () => {
    const ledger = buildTillLedger({
      sales: [sale(2, { a: 2 }, 260), sale(1, { a: 2 }, 240)],
      floatPesos: null,
      loaded: { a: 10 },
      left: { a: 6 },
      prices: { a: 130 },
      earlierPrices: [{ a: 120 }],
      names: { a: 'Banana oat' },
      seesTotals: true
    });
    expect(ledger.rows.map((r) => r.lines[0]?.unitText)).toEqual(['₱130.00', '₱120.00']);
    expect(ledger.rows.map((r) => r.lines[0]?.lineText)).toEqual(['₱260.00', '₱240.00']);
    expect(ledger.totals?.totalText).toBe('₱500.00');
  });

  it('with no earlier list, prices every sale as before', () => {
    const ledger = buildTillLedger({
      sales: [sale(1, { a: 1 }, 120)],
      floatPesos: null,
      loaded: { a: 10 },
      left: { a: 9 },
      prices: { a: 120 },
      names: { a: 'A' },
      seesTotals: true
    });
    expect(ledger.rows[0]?.lines[0]?.unitText).toBe('₱120.00');
  });
});
