import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CafePriceField } from '@/components/live/cafe-price-field';
import {
  CafePricesUnavailable,
  cafePesosText,
  fetchCafePrices,
  parseCafePesos,
  saveCafePrice,
  type CafePricesClient
} from '@/lib/data/cafe-prices';

afterEach(cleanup);

/** What the database answers for ₱130, with the default applied (₱90) or her own price. */
const answer = (own: number | null = null, id = 'choc') => ({
  product_id: id,
  name: 'Chocolate',
  price_cents: '13000',
  default_cents: 9000,
  cafe_price_cents: own,
  effective_cents: own ?? 9000,
  updated_at: own === null ? null : '2026-11-19T10:00:00Z'
});

type Rpc = (
  name: string,
  args?: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;
const clientOf = (rpc: Rpc) =>
  ({ rpc: vi.fn(rpc) }) as unknown as CafePricesClient & {
    rpc: ReturnType<typeof vi.fn>;
  };

describe('café price reads and writes', () => {
  it('reads rows, with bigint strings, her price and the default as the database decided them', async () => {
    const client = clientOf(async () => ({
      data: [answer(), answer(8500, 'brownie')],
      error: null
    }));
    const rows = await fetchCafePrices(client);
    expect(rows[0]).toEqual({
      productId: 'choc',
      name: 'Chocolate',
      retailCents: 13000,
      defaultCents: 9000,
      ownCents: null,
      effectiveCents: 9000
    });
    expect(rows[1]).toMatchObject({ ownCents: 8500, effectiveCents: 8500, defaultCents: 9000 });
    expect(client.rpc).toHaveBeenCalledWith('get_cafe_prices');
  });

  it('says "not available" while the migration is not on the database, never throws a crash', async () => {
    for (const error of [
      { code: 'PGRST202', message: 'Could not find the function public.get_cafe_prices' },
      { code: '42883', message: 'function public.get_cafe_prices() does not exist' }
    ]) {
      const client = clientOf(async () => ({ data: null, error }));
      await expect(fetchCafePrices(client)).rejects.toBeInstanceOf(CafePricesUnavailable);
      await expect(saveCafePrice(client, 'choc', 8500)).rejects.toBeInstanceOf(
        CafePricesUnavailable
      );
    }
  });

  it('does not mistake another "does not exist" error for the missing migration', async () => {
    const client = clientOf(async () => ({
      data: null,
      error: { code: '42P01', message: 'relation "x" does not exist' }
    }));
    await expect(fetchCafePrices(client)).rejects.toThrow('café price load failed: 42P01');
  });

  it('fails a malformed or refused read without row values in the message', async () => {
    await expect(
      fetchCafePrices(
        clientOf(async () => ({ data: [{ ...answer(), default_cents: 0 }], error: null }))
      )
    ).rejects.toThrow('café price load failed: malformed answer');
    await expect(
      fetchCafePrices(
        clientOf(async () => ({ data: null, error: { code: '42501', message: 'x' } }))
      )
    ).rejects.toThrow('café price load failed: 42501');
  });

  it('saves centavos, or null to go back to the default, and refuses a bad price before asking', async () => {
    const client = clientOf(async (_name, args) => ({
      data: [answer((args?.p_price_cents as number | null) ?? null)],
      error: null
    }));
    expect((await saveCafePrice(client, 'choc', 8500)).ownCents).toBe(8500);
    expect(client.rpc).toHaveBeenLastCalledWith('set_cafe_price', {
      p_product_id: 'choc',
      p_price_cents: 8500
    });
    expect((await saveCafePrice(client, 'choc', null)).ownCents).toBeNull();
    expect(client.rpc).toHaveBeenLastCalledWith('set_cafe_price', {
      p_product_id: 'choc',
      p_price_cents: null
    });
    const calls = client.rpc.mock.calls.length;
    for (const bad of [0, -5, 90.5, Number.NaN]) {
      await expect(saveCafePrice(client, 'choc', bad)).rejects.toThrow('not a price');
    }
    expect(client.rpc.mock.calls.length).toBe(calls);
  });

  it('turns typed pesos into whole centavos and says what to fix', () => {
    expect(parseCafePesos('90')).toEqual({ cents: 9000 });
    expect(parseCafePesos(' ₱1,090.50 ')).toEqual({ cents: 109050 });
    expect(parseCafePesos('0.1')).toEqual({ cents: 10 });
    for (const bad of ['', 'abc', '-5', '90.555', '0', '1000000.01', '1e3']) {
      expect(parseCafePesos(bad)).toHaveProperty('error');
    }
    expect(cafePesosText(9000)).toBe('90');
    expect(cafePesosText(9050)).toBe('90.50');
  });
});

describe('the café price field', () => {
  it('shows the default until she edits it, saves hers on its own, and goes back with "Use default"', async () => {
    let own: number | null = null;
    const client = clientOf(async (name, args) => {
      if (name === 'set_cafe_price') own = (args?.p_price_cents as number | null) ?? null;
      return { data: [answer(own)], error: null };
    });
    // Inside the product form: the field must never submit it, and the form's own price is not read or changed.
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <input name="price" defaultValue="130" />
        <CafePriceField productId="choc" getClient={() => client} />
      </form>
    );
    const input = (await screen.findByRole('textbox', { name: /Café price/ })) as HTMLInputElement;
    expect(input.value).toBe('90');
    expect(screen.getByTestId('cafe-price-state').textContent).toContain('default');
    expect(screen.getByText(/rounded down to the nearest ₱5/)).toBeTruthy();
    expect(screen.getByText(/The order form keeps ₱130/)).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save café price' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Use default' })).toBeNull();

    fireEvent.change(input, { target: { value: '85' } });
    expect(save.disabled).toBe(false);
    fireEvent.keyDown(input, { key: 'Enter' });
    await screen.findByText(/Saved\. Café price ₱85\./);
    expect(client.rpc).toHaveBeenLastCalledWith('set_cafe_price', {
      p_product_id: 'choc',
      p_price_cents: 8500
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('cafe-price-state').textContent).toContain('yours');
    expect(screen.getByText(/The default would be ₱90/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Use default' }));
    await waitFor(() =>
      expect(screen.getByTestId('cafe-price-state').textContent).toContain('default')
    );
    expect(input.value).toBe('90');
    // Only the two café functions were ever called: nothing here can change the order form's price.
    const names = new Set(client.rpc.mock.calls.map((call) => call[0]));
    expect([...names].sort()).toEqual(['get_cafe_prices', 'set_cafe_price']);
  });

  it('shows nothing for a product the list leaves out (priced at ₱0), without hiding others', async () => {
    const client = clientOf(async () => ({ data: [answer(null, 'brownie')], error: null }));
    const { container } = render(<CafePriceField productId="free" getClient={() => client} />);
    await waitFor(() => expect(client.rpc).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(''));
  });

  it('fails the read, not the form, when no client can be made', async () => {
    render(
      <CafePriceField
        productId="choc"
        getClient={() => {
          throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
        }}
      />
    );
    expect((await screen.findByRole('alert')).textContent).toContain('could not be read');
  });

  it('refuses a bad price in words and keeps Save off', async () => {
    const client = clientOf(async () => ({ data: [answer()], error: null }));
    render(<CafePriceField productId="choc" getClient={() => client} />);
    const input = await screen.findByRole('textbox', { name: /Café price/ });
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(screen.getByRole('alert').textContent).toContain('Use a number');
    expect(
      (screen.getByRole('button', { name: 'Save café price' }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.change(input, { target: { value: '0' } });
    expect(screen.getByRole('alert').textContent).toContain('more than ₱0');
  });

  it('says plainly that café prices need the database update, and hides the field', async () => {
    const client = clientOf(async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function' }
    }));
    render(<CafePriceField productId="choc" getClient={() => client} />);
    expect((await screen.findByRole('note')).textContent).toContain(
      'need the next database update'
    );
    expect(screen.queryByRole('textbox', { name: /Café price/ })).toBeNull();
  });

  it('offers to try again after a failed read, and keeps her words when a save fails', async () => {
    let fail = true;
    const client = clientOf(async (name) => {
      if (name === 'get_cafe_prices')
        return fail
          ? { data: null, error: { code: '57014', message: 'timeout' } }
          : { data: [answer()], error: null };
      return { data: null, error: { code: '42501', message: 'no' } };
    });
    render(<CafePriceField productId="choc" getClient={() => client} />);
    await screen.findByRole('alert');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const input = (await screen.findByRole('textbox', { name: /Café price/ })) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save café price' }));
    await screen.findByText('The café price was not saved. Try again.');
    expect(input.value).toBe('80');
  });
});
