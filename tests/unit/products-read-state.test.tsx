import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as axe from 'axe-core';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import { useOpsVals } from '@/store/use-ops';
import { registerLiveRecipeScreens } from '@/components/live/recipes/register';
import { ALLERGENS, PRODUCTS, replaceFlavours } from '@/store/engine/ops-engine';
import type { FlavourRow, FlavoursClient } from '@/lib/data/flavours';
import { flavoursRead } from '@/lib/data/flavours-read-state';
import type { LiveFlavourFormFields } from '@/view-models/vals';

/**
 * HCB-003: the owner's Products page after the catalogue read fails. The built-in list (the
 * engine's six ported flavours, ₱130 for the Double Chocolate Fudge) must never be shown as her
 * real, current prices. Every test drives the real page through the runtime and reads what she
 * sees: text, roles and buttons.
 */
const PORTED = { list: PRODUCTS.map((p) => ({ ...p })), allergens: { ...ALLERGENS } };

const row = (id: string, name: string, cents: number, sort: number): FlavourRow => ({
  id,
  name,
  short_name: name,
  price_cents: cents,
  kind: 'Regular',
  item_type: 'cookie',
  capacity_weight: 1,
  tag: '',
  description: 'A test cookie.',
  image_path: '/assets/qa.png',
  allergens: 'milk',
  active: true,
  published: false,
  sort_order: sort,
  updated_at: '2026-11-01T01:00:00.000Z'
});
const GOOD = [row('qa-one', 'QA Alpha', 17500, 1), row('qa-two', 'QA Beta', 21000, 2)];

type Answer = { data: unknown; error: unknown };
const ok = (rows: FlavourRow[]): Answer => ({ data: rows, error: null });
const down: Answer = { data: null, error: { code: '', message: 'network' } };

/** A client whose catalogue read waits for the test; every other call is `other`. */
function controlled(other: (name: string) => Answer = () => ({ data: null, error: down.error })) {
  const waiting: Array<(a: Answer) => void> = [];
  const rpc = vi.fn((name: string) =>
    name === 'get_flavours'
      ? new Promise<Answer>((resolve) => void waiting.push(resolve))
      : Promise.resolve(other(name))
  );
  return {
    client: { rpc } as unknown as FlavoursClient,
    rpc,
    answer: (a: Answer) => {
      const next = waiting.shift();
      if (!next) throw Error('no catalogue read is waiting');
      next(a);
    },
    pending: () => waiting.length
  };
}

function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
let undo: (() => void) | undefined;
async function openProducts() {
  undo = registerLiveRecipeScreens();
  const ref: { current: OpsRuntime | null } = { current: null };
  const view = render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  await act(async () => {
    runtime.setRole('owner');
    runtime.go('products');
  });
  return { runtime, view };
}
const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const start = (runtime: OpsRuntime, client: FlavoursClient) => {
  let read!: Promise<boolean>;
  act(() => void (read = runtime.loadFlavours(client)));
  return read;
};
const pesos = () => screen.queryAllByText(/₱\s?\d/);
const tryAgain = () => screen.queryByRole('button', { name: /try again/i });

beforeEach(() => {
  live = true;
  flavoursRead.reset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-11T07:42:00Z')); // 3:42 PM in Manila
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  undo?.();
  undo = undefined;
  flavoursRead.reset();
  replaceFlavours(
    PORTED.list.map((p) => ({ ...p })),
    PORTED.allergens
  );
  localStorage.clear();
});

describe('HCB-003: the owner Products page and a failed catalogue read', () => {
  it('1. a failed first read lists no built-in prices and offers Try again', async () => {
    const { runtime } = await openProducts();
    const c = controlled();
    const read = start(runtime, c.client);
    await act(async () => {
      c.answer(down);
      expect(await read).toBe(false);
    });
    expect(pesos()).toEqual([]);
    expect(screen.queryByText('Double Chocolate Fudge')).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Edit product/ })).toBeNull();
    expect(screen.getByText(/could not be read/i)).toBeTruthy();
    expect(screen.queryByText('No products loaded yet.')).toBeNull();
    expect(tryAgain()).toBeTruthy();
  });

  it('1b. Start production is disabled until the catalogue has been read, as on Production', async () => {
    const { runtime } = await openProducts();
    expect(
      (screen.getByRole('button', { name: 'Start production' }) as HTMLButtonElement).disabled
    ).toBe(true);
    const c = controlled();
    const read = start(runtime, c.client);
    await act(async () => {
      c.answer(down);
      expect(await read).toBe(false);
    });
    expect(
      (screen.getByRole('button', { name: 'Start production' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(tryAgain()).toBeTruthy();
    await act(async () => {
      fireEvent.click(tryAgain()!);
      await Promise.resolve();
    });
    await act(async () => {
      c.answer(ok(GOOD));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(
      (screen.getByRole('button', { name: 'Start production' }) as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('2. a later failed refresh keeps the last good prices, labelled with when they were read', async () => {
    const { runtime } = await openProducts();
    const c = controlled((name) => ({
      data: null,
      error: name === 'save_flavour' ? { code: 'P0002', message: 'stale' } : down.error
    }));
    const read = start(runtime, c.client);
    await act(async () => {
      c.answer(ok(GOOD));
      expect(await read).toBe(true);
    });
    expect(screen.getByText('₱175')).toBeTruthy();
    expect(tryAgain()).toBeNull();
    // A change finds the flavour edited elsewhere (conflict), and reading it again fails.
    await act(async () => {
      runtime.toggleDropProduct('qa-one');
      await Promise.resolve();
    });
    await act(async () => {
      c.answer(down);
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByText('₱175')).toBeTruthy();
    expect(screen.getByText('₱210')).toBeTruthy();
    expect(screen.getByText(/as of 3:42 PM/)).toBeTruthy();
    expect(tryAgain()).toBeTruthy();
  });

  it('3. an answered read with no products is a genuine empty menu, not a failure', async () => {
    const { runtime } = await openProducts();
    const c = controlled();
    const read = start(runtime, c.client);
    await act(async () => {
      c.answer(ok([]));
      expect(await read).toBe(true);
    });
    expect(pesos()).toEqual([]);
    expect(screen.queryByText(/could not be read/i)).toBeNull();
    expect(tryAgain()).toBeNull();
    expect(screen.getByText(/no products yet/i)).toBeTruthy();
  });

  it('4. before any read has answered there is a status line and no prices', async () => {
    const { runtime } = await openProducts();
    // Never requested.
    expect(pesos()).toEqual([]);
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/not been read yet/i);
    // Requested, still out.
    const c = controlled();
    start(runtime, c.client);
    await settle();
    expect(c.pending()).toBe(1);
    expect(pesos()).toEqual([]);
    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/not been read yet/i);
    expect(screen.queryByText('No products loaded yet.')).toBeNull();
  });

  it('5. Try again after a failure shows the real prices and removes the notice', async () => {
    const { runtime } = await openProducts();
    const c = controlled();
    const read = start(runtime, c.client);
    await act(async () => {
      c.answer(down);
      await read;
    });
    expect(pesos()).toEqual([]);
    act(() => fireEvent.click(tryAgain()!));
    await settle();
    await act(async () => {
      c.answer(ok(GOOD));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.getByText('₱175')).toBeTruthy();
    expect(screen.getByText('₱210')).toBeTruthy();
    expect(screen.getByRole('article', { name: 'QA Alpha' })).toBeTruthy();
    expect(screen.queryByText(/could not be read/i)).toBeNull();
    expect(tryAgain()).toBeNull();
  });

  it('6a. a read answered after the page is gone writes nothing', async () => {
    const { runtime, view } = await openProducts();
    const c = controlled();
    const read = start(runtime, c.client);
    await settle();
    view.unmount();
    await act(async () => {
      c.answer(ok(GOOD));
      await read;
    });
    expect(PRODUCTS.map((p) => p.id)).toEqual(PORTED.list.map((p) => p.id));
    expect(flavoursRead.get().phase).toBe('idle');
  });

  it('6b. a read answered after a newer reader took over writes nothing', async () => {
    const { runtime } = await openProducts();
    const first = controlled();
    const second = controlled();
    start(runtime, first.client);
    await settle();
    const newer = start(runtime, second.client);
    await settle();
    await act(async () => {
      second.answer(ok(GOOD));
      await newer;
    });
    expect(screen.getByText('₱175')).toBeTruthy();
    await act(async () => {
      first.answer(ok([row('qa-old', 'QA Old', 9900, 1)]));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.queryByText('QA Old')).toBeNull();
    expect(screen.getByText('₱175')).toBeTruthy();
    expect(flavoursRead.get().phase).toBe('read');
  });

  it('the failed and stale notices have no axe violations and name their button', async () => {
    const { runtime, view } = await openProducts();
    const c = controlled();
    const read = start(runtime, c.client);
    await act(async () => {
      c.answer(down);
      await read;
    });
    const results = await axe.run(view.container, {
      rules: { 'color-contrast': { enabled: false } }
    });
    expect(results.violations).toEqual([]);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  // HCB-004 (defect 2): the empty page invites Add product, so the first product must really save.
  const NEW_FIELDS: LiveFlavourFormFields = {
    name: 'First Cookie',
    shortName: 'First',
    description: 'The first one.',
    imagePath: 'assets/first.png',
    allergens: 'milk, eggs, wheat',
    badge: '',
    kind: 'Permanent',
    itemType: 'cookie',
    capacityWeight: 1,
    sortOrder: 1,
    price: 150,
    active: true
  };
  const saveAnswer = (name: string): Answer =>
    name === 'save_flavour'
      ? { data: [{ id: 'first-cookie', updated_at: '2026-11-11T07:43:00.000Z' }], error: null }
      : { data: null, error: down.error };
  const openEditor = (runtime: OpsRuntime) => {
    act(() => runtime.renderVals().liveMake!.addProduct());
    return runtime.renderVals().liveForm!.editing!;
  };

  it('7. on a confirmed empty menu, Add product then a valid save creates the product', async () => {
    const { runtime } = await openProducts();
    const c = controlled(saveAnswer);
    const read = start(runtime, c.client);
    await act(async () => {
      c.answer(ok([]));
      await read;
    });
    expect(screen.getByText(/no products yet/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add product' }));
    const editing = openEditor(runtime);
    await act(async () => {
      editing.save(NEW_FIELDS);
      await settle();
    });
    expect(c.rpc.mock.calls.filter((call) => call[0] === 'save_flavour')).toHaveLength(1);
    expect(c.rpc).toHaveBeenCalledWith(
      'save_flavour',
      expect.objectContaining({ p_id: 'first-cookie', p_expected_updated_at: null })
    );
    expect(PRODUCTS.map((p) => p.id)).toEqual(['first-cookie']);
    expect(JSON.stringify(runtime.state.toast ?? null)).toContain('Flavour saved.');
  });

  it('8. after a failed or unread catalogue the write path itself still refuses a new product', async () => {
    const { runtime } = await openProducts();
    const c = controlled(saveAnswer);
    const read = start(runtime, c.client);
    await act(async () => {
      c.answer(down);
      await read;
    });
    // The page hides Add product here; the sheet is opened directly to prove the write refuses.
    expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
    const editing = openEditor(runtime);
    await act(async () => {
      editing.save(NEW_FIELDS);
      await settle();
    });
    expect(c.rpc.mock.calls.some((call) => call[0] === 'save_flavour')).toBe(false);
    expect(PRODUCTS.map((p) => p.id)).toEqual(PORTED.list.map((p) => p.id));
  });
});
