import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import type { Role } from '@/store/engine/ops-engine';
import type { ShopStatusClient } from '@/lib/data/shop-status';
import type { LiveOrderExtrasFields } from '@/view-models/vals';

/**
 * B4a: the owner's boxes and add-ons form, through the runtime: the entry is the owner's alone, it
 * opens on what the database returned (money in pesos), and a save sends centavos against the stamp it
 * read. Each `Mutation:` line names a change one of these tests must catch.
 */
const STAMP = '2026-09-29T02:00:00.123456+00:00';

const status = {
  open_dow: 5,
  open_h: 9,
  open_m: 0,
  close_dow: 0,
  close_h: 9,
  close_m: 15,
  extend_h: 0,
  override: null
};
const extrasRow = (over: Record<string, unknown> = {}) => ({
  same_day_enabled: true,
  same_day_percent: 40,
  same_day_on_extras: false,
  sampler_product_id: null,
  sampler_max_qty: 3,
  box_sizes: [{ size: 6, charge_cents: 250, active: true }],
  add_ons: [
    {
      id: 'sticker',
      name: 'Sticker',
      price_cents: 1550,
      active: true,
      variants: ['1', '2'],
      text_label: null,
      text_max: 150,
      max_qty: 10
    }
  ],
  updated_at: STAMP,
  ...over
});

function fake(over: { get?: unknown; save?: unknown } = {}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'get_shop_status') return { data: status, error: null };
    if (name === 'get_order_extras') return over.get ?? { data: extrasRow(), error: null };
    if (name === 'save_order_extras')
      return over.save ?? { data: [{ updated_at: STAMP }], error: null };
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } as unknown as ShopStatusClient };
}
const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
const called = (rpc: ReturnType<typeof fake>['rpc'], name: string) =>
  rpc.mock.calls.filter((c) => c[0] === name) as unknown as Array<
    [string, Record<string, unknown>]
  >;
const toasts = (r: OpsRuntime) => JSON.stringify(r.state.toasts ?? r.state.toast ?? '');

async function mounted(role: Role, f: ReturnType<typeof fake>) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  await act(async () => {
    await runtime.loadShopStatus(f.client);
  });
  (runtime as unknown as { flavourSync: unknown }).flavourSync = {
    current: () => [
      { id: 'c1', name: 'Cookie', item_type: 'cookie' },
      { id: 's1', name: 'Sampler box', item_type: 'set' }
    ],
    dispose: () => undefined
  };
  f.rpc.mockClear();
  return runtime;
}
const entry = (r: OpsRuntime) =>
  r
    .renderVals()
    .toolGroups.flatMap((g) => g.items)
    .find((i) => i.label === 'Boxes & add-ons');
const open = async (r: OpsRuntime) => {
  await act(async () => entry(r)!.go());
  await settle();
  return r.renderVals().liveOrderExtras!;
};

describe('B4a: the boxes and add-ons form', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => cleanup());

  it('opens on what the database returned, money in pesos, with the sets to choose a sampler from', async () => {
    const f = fake();
    const runtime = await mounted('owner', f);
    const vals = await open(runtime);
    expect(runtime.renderVals().sheet).toMatchObject({ liveForm: true, title: 'Boxes & add-ons' });
    expect(vals.extras).toMatchObject({
      sameDayPercent: 40,
      samplerProductId: '',
      boxSizes: [{ size: 6, chargePesos: 2.5, active: true }],
      addOns: [{ id: 'sticker', pricePesos: 15.5, variants: ['1', '2'], textLabel: '' }]
    });
    expect(vals.sets).toEqual([{ id: 's1', name: 'Sampler box' }]);
    // Mutation: not converting centavos to pesos shows ₱1,550 for a ₱15.50 sticker.
  });

  it('a sampler that is no longer in the list is still offered, so saving does not silently drop it', async () => {
    const f = fake({ get: { data: extrasRow({ sampler_product_id: 'gone' }), error: null } });
    const runtime = await mounted('owner', f);
    const vals = await open(runtime);
    expect(vals.sets.map((s) => s.id)).toContain('gone');
    expect(vals.extras.samplerProductId).toBe('gone');
  });

  it('saves centavos against the stamp it read, and gives a new add-on an id from its name', async () => {
    const f = fake();
    const runtime = await mounted('owner', f);
    const vals = await open(runtime);
    f.rpc.mockClear();
    act(() =>
      vals.save({
        ...vals.extras,
        sameDayPercent: 25,
        samplerProductId: 's1',
        boxSizes: [{ size: 6, chargePesos: 12.5, active: true }],
        addOns: [
          ...vals.extras.addOns,
          {
            id: '',
            name: 'Cream ribbon',
            pricePesos: 10,
            active: true,
            variants: [],
            textLabel: '',
            textMax: 150,
            maxQty: 10
          },
          {
            id: '',
            name: 'Cream ribbon',
            pricePesos: 11,
            active: true,
            variants: [],
            textLabel: 'Note',
            textMax: 100,
            maxQty: 1
          }
        ]
      })
    );
    await settle();
    const [[, args]] = called(f.rpc, 'save_order_extras');
    expect(args.p_expected_updated_at).toBe(STAMP);
    const body = args.p_extras as Record<string, unknown>;
    expect(body).toMatchObject({
      same_day_percent: 25,
      sampler_product_id: 's1',
      box_sizes: [{ size: 6, charge_cents: 1250, active: true }]
    });
    const addOns = body.add_ons as Array<Record<string, unknown>>;
    expect(addOns.map((a) => a.id)).toEqual(['sticker', 'cream-ribbon', 'cream-ribbon-2']);
    expect(addOns.map((a) => a.price_cents)).toEqual([1550, 1000, 1100]);
    expect(addOns[2]).toMatchObject({ text_label: 'Note', text_max: 100 });
    expect(addOns[1]!.text_label).toBeNull();
    expect(toasts(runtime)).toContain('saved');
    expect(runtime.renderVals().liveOrderExtras ?? null).toBeNull(); // saved: the sheet closes
    // Mutation: dropping the `taken` set gives two add-ons one id, and the server refuses the whole save.
  });

  it('no sampler is sent as null, not an empty string', async () => {
    const f = fake();
    const runtime = await mounted('owner', f);
    const vals = await open(runtime);
    f.rpc.mockClear();
    act(() => vals.save({ ...vals.extras }));
    await settle();
    const [[, args]] = called(f.rpc, 'save_order_extras');
    expect((args.p_extras as Record<string, unknown>).sampler_product_id).toBeNull();
  });

  it('a value the database would refuse is not sent, and a missing number is not turned into zero', async () => {
    const f = fake();
    const runtime = await mounted('owner', f);
    const vals = await open(runtime);
    f.rpc.mockClear();
    act(() => vals.save({ ...vals.extras, sameDayPercent: 101 }));
    await settle();
    expect(called(f.rpc, 'save_order_extras')).toEqual([]);
    expect(toasts(runtime)).toContain('same-day');
    const broken: LiveOrderExtrasFields = {
      ...vals.extras,
      addOns: [{ ...vals.extras.addOns[0]!, pricePesos: Number.NaN }]
    };
    act(() => vals.save(broken));
    await settle();
    expect(called(f.rpc, 'save_order_extras')).toEqual([]);
    act(() =>
      vals.save({ ...vals.extras, boxSizes: [{ size: Number.NaN, chargePesos: 0, active: true }] })
    );
    await settle();
    expect(called(f.rpc, 'save_order_extras')).toEqual([]);
    // Mutation: skipping the finite check turns a blank price into pesosToCentavos(NaN), which throws inside the click.
  });

  it('a change made elsewhere meanwhile shows their version and keeps the sheet open on it', async () => {
    const f = fake({ save: { error: { code: 'P0002' } } });
    const runtime = await mounted('owner', f);
    const vals = await open(runtime);
    act(() => vals.save({ ...vals.extras, sameDayPercent: 10 }));
    await settle();
    expect(toasts(runtime)).toContain('Someone else');
    expect(runtime.renderVals().liveOrderExtras).not.toBeNull();
    expect(called(f.rpc, 'get_order_extras').length).toBeGreaterThanOrEqual(2);
  });

  it('a refusal and a lost connection each say so and keep the sheet', async () => {
    for (const [save, words] of [
      [{ error: { code: '22023' } }, 'could not be saved'],
      [{ error: { code: '' } }, 'Offline']
    ] as const) {
      const f = fake({ save });
      const runtime = await mounted('owner', f);
      const vals = await open(runtime);
      act(() => vals.save({ ...vals.extras }));
      await settle();
      expect(toasts(runtime)).toContain(words);
      expect(runtime.renderVals().liveOrderExtras).not.toBeNull();
      cleanup();
    }
  });

  it('a failed read does not open the sheet', async () => {
    const f = fake({ get: { data: null, error: { code: '57014' } } });
    const runtime = await mounted('owner', f);
    await act(async () => entry(runtime)!.go());
    await settle();
    expect(runtime.renderVals().liveOrderExtras ?? null).toBeNull();
    expect(toasts(runtime)).toContain('Offline');
  });

  it('is the owner’s alone, even with the configuration already read and the sheet open', async () => {
    const f = fake();
    const runtime = await mounted('helper', f);
    expect(entry(runtime)).toBeUndefined();
    act(() => runtime.setRole('owner'));
    await open(runtime);
    expect(runtime.renderVals().liveOrderExtras).not.toBeNull();
    act(() => runtime.setRole('helper'));
    act(() => runtime.sheet('orderextras', {}));
    expect(runtime.renderVals().liveOrderExtras ?? null).toBeNull();
    expect(runtime.renderVals().sheet).not.toMatchObject({ title: 'Boxes & add-ons' });
    // Mutation: dropping the role test shows the form to a helper who opens the sheet kind directly.
  });

  it('demo mode has no such entry and calls nothing', async () => {
    live = false;
    const f = fake();
    const runtime = await mounted('owner', f);
    expect(entry(runtime)).toBeUndefined();
    expect(f.rpc).not.toHaveBeenCalled();
  });
});
