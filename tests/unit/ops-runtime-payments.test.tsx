import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { ShopScreen } from '@/components/screens/shop';
import { CheckoutScreen } from '@/components/screens/checkout';
import { PAY_ACCOUNTS, replacePayAccounts } from '@/store/engine/ops-engine';
import type { Role } from '@/store/engine/ops-engine';
import type { PaymentClient, UploadClient, PaymentMethodRow } from '@/lib/data/payments';

/**
 * MP-09 c2 (finding 16): the live checkout shows only the payment methods the database
 * returned, the shop footer says only what the owner typed, and the owner's forms save
 * through the RPCs. Demo mode keeps the ported accounts and footer byte for byte.
 */
const PORTED = PAY_ACCOUNTS.map((m) => ({ ...m }));
const ORIGIN = 'https://abcdefghijklmnop.supabase.co';
const STAMP = '2026-09-29T01:00:00.000Z';

type Info = {
  methods: Array<{ id: string; label: string; number: string; name: string; qr: string }>;
  texts: Record<string, string | null>;
};
const info = (over: Partial<Info> = {}): Info => ({
  methods: [
    {
      id: 'gcash',
      label: 'GCash',
      number: '0999',
      name: 'Owner Name',
      qr: 'qr/' + 'a'.repeat(32) + '.png'
    },
    { id: 'cash', label: 'Cash', number: '', name: '', qr: '' }
  ],
  texts: {
    registration_badge: '',
    tin_line: '',
    invoice_note: '',
    allergen_note: '',
    updated_at: STAMP
  },
  ...over
});

function fakeClient(state: { info: Info | 'fail'; rows?: PaymentMethodRow[] }) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
    if (name === 'get_shop_payment_info')
      return state.info === 'fail'
        ? { data: null, error: { code: '57014' } }
        : { data: state.info, error: null };
    if (name === 'get_payment_methods') return { data: state.rows ?? [], error: null };
    void args;
    return { data: [{ id: 'x', updated_at: STAMP }], error: null };
  });
  const upload = vi.fn(async () => ({ error: null }));
  const client = { rpc, storage: { from: () => ({ upload }) } } as unknown as PaymentClient &
    UploadClient;
  return { client, rpc, upload };
}

async function mounted(
  role: Role,
  state: { info: Info | 'fail'; rows?: PaymentMethodRow[] },
  load = true
) {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  const fake = fakeClient(state);
  if (load)
    await act(async () => {
      await runtime.loadShopPayment(fake.client);
    });
  fake.rpc.mockClear();
  return { runtime, ...fake };
}

const custSet = (runtime: OpsRuntime, key: string, value: string) =>
  act(() =>
    (runtime as unknown as { custSet: (k: string, v: string) => void }).custSet(key, value)
  );
const labels = (runtime: OpsRuntime) =>
  (runtime.renderVals().cust.methods ?? []).map((m) => m.label);
const businessItems = (runtime: OpsRuntime) =>
  runtime.renderVals().toolGroups.flatMap((g) => g.items);

describe('MP-09 c2: the live checkout and footer', () => {
  beforeEach(() => {
    live = true;
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ORIGIN);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    replacePayAccounts(PORTED.map((m) => ({ ...m })));
  });

  it('shows no method before the read, and never the ported accounts', async () => {
    const { runtime } = await mounted('owner', { info: info() }, false);
    expect(PAY_ACCOUNTS).toHaveLength(0);
    expect(labels(runtime)).toEqual([]);
    expect(runtime.renderVals().cust.qr).toBe('');
    // Mutation: dropping replacePayAccounts([]) from the live constructor leaves GCash/Maya/GoTyme showing.
  });

  it('shows no method when the read fails, or when there is no Supabase', async () => {
    const failed = await mounted('owner', { info: 'fail' });
    expect(labels(failed.runtime)).toEqual([]);
    expect(PAY_ACCOUNTS).toHaveLength(0);
    cleanup();
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    await act(async () => {
      await ref.current!.loadShopPayment(null);
    });
    expect(labels(ref.current!)).toEqual([]);
    expect(ref.current!.renderVals().shopFooter).toEqual({
      badge: '',
      tin: '',
      invoice: '',
      allergens: ''
    });
  });

  it('the live checkout never tells a customer to pay a number the owner did not enter', async () => {
    const forbidden = /0962|5341|cash on pickup|Bank transfer to/;
    const unread = await mounted('owner', { info: info() }, false);
    expect(unread.runtime.renderVals().cust.noQr).toBe(false);
    expect(
      render(<CheckoutScreen v={unread.runtime.renderVals()} />).container.textContent
    ).not.toMatch(forbidden);
    cleanup();
    const failed = await mounted('owner', { info: 'fail' });
    expect(
      render(<CheckoutScreen v={failed.runtime.renderVals()} />).container.textContent
    ).not.toMatch(forbidden);
    cleanup();
    const ok = await mounted('owner', { info: info() });
    expect(
      render(<CheckoutScreen v={ok.runtime.renderVals()} />).container.textContent
    ).not.toMatch(forbidden);
    // Mutation: leaving the engine's noQr note in place brings back the placeholder bank number and cash line.
  });

  it('demo mode keeps the ported checkout note', () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    expect(
      render(<CheckoutScreen v={ref.current!.renderVals()} />).container.textContent
    ).toContain('Bank transfer to 0962 962 5341');
  });

  it('shows the methods the database returned, in its order, as the engine’s pay accounts', async () => {
    const { runtime } = await mounted('owner', { info: info() });
    expect(labels(runtime)).toEqual(['GCash', 'Cash']);
    expect(PAY_ACCOUNTS.map((m) => m.id)).toEqual(['GCash', 'Cash']);
  });

  it('draws the QR from the bucket URL, not a relative path, and none for a method without one', async () => {
    const { runtime } = await mounted('owner', { info: info() });
    custSet(runtime, 'pay', 'GCash');
    const qr = String(runtime.renderVals().cust.qr);
    expect(qr).toContain(
      'url(' + ORIGIN + '/storage/v1/object/public/shop-media/qr/' + 'a'.repeat(32) + '.png)'
    );
    expect(qr).not.toContain('/https:');
    expect(qr).toContain('width: 190px');
    custSet(runtime, 'pay', 'Cash');
    expect(runtime.renderVals().cust.qr).toBe('');
    // Mutation: leaving the engine's own style in place gives url(/https://…) or, with no QR, url(/).
  });

  it('draws no QR when the stored path is not a safe bucket path', async () => {
    const bad = info({
      methods: [
        { id: 'gcash', label: 'GCash', number: '1', name: 'N', qr: "qr/x');background:url(y" }
      ]
    });
    const { runtime } = await mounted('owner', { info: bad });
    custSet(runtime, 'pay', 'GCash');
    expect(runtime.renderVals().cust.qr).toBe('');
  });

  it('gives the footer only the owner’s text: nothing by default, the lines when set', async () => {
    const { runtime } = await mounted('owner', { info: info() });
    expect(runtime.renderVals().shopFooter).toEqual({
      badge: '',
      tin: '',
      invoice: '',
      allergens: ''
    });
    const set = info({
      texts: {
        registration_badge: 'DTI reg.',
        tin_line: 'The Happy Cookie',
        invoice_note: 'Receipts on request.',
        allergen_note: 'Contains milk and eggs.',
        updated_at: STAMP
      }
    });
    const { runtime: next } = await mounted('owner', { info: set });
    expect(next.renderVals().shopFooter).toEqual({
      badge: 'DTI reg.',
      tin: 'The Happy Cookie',
      invoice: 'Receipts on request.',
      allergens: 'Contains milk and eggs.'
    });
  });

  it('the live shop prints no registration, TIN or invoice claim until the owner writes one', async () => {
    const { runtime } = await mounted('helper', { info: info() });
    const { container } = render(<ShopScreen v={runtime.renderVals()} />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(
      /REGISTERED|TIN 123|An invoice is issued|Contains milk, eggs, wheat and soy/
    );
    expect(text).toContain('Already ordered? Find my order');
    cleanup();
    const set = info({
      texts: {
        registration_badge: 'DTI reg.',
        tin_line: 'Owner TIN line',
        invoice_note: '',
        allergen_note: 'Made with milk.',
        updated_at: STAMP
      }
    });
    const { runtime: two } = await mounted('helper', { info: set });
    const shown = render(<ShopScreen v={two.renderVals()} />).container.textContent ?? '';
    expect(shown).toContain('DTI reg.');
    expect(shown).toContain('Owner TIN line');
    expect(shown).toContain('Made with milk.');
    expect(shown).not.toMatch(/REGISTERED|TIN 123/);
    // Mutation: rendering the ported footer in live mode brings back the placeholder TIN and REGISTERED badge.
  });

  it('demo mode keeps the ported accounts and footer exactly', () => {
    live = false;
    const ref: { current: OpsRuntime | null } = { current: null };
    render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
    const vals = ref.current!.renderVals();
    expect(PAY_ACCOUNTS.map((m) => m.id)).toEqual(['GCash', 'Maya', 'GoTyme']);
    expect(vals.shopFooter).toBeUndefined();
    expect(vals.livePay).toBeUndefined();
    const text = render(<ShopScreen v={vals} />).container.textContent ?? '';
    expect(text).toContain('REGISTERED');
    expect(text).toContain('TIN 123-456-789-000');
    expect(text).toContain('An invoice is issued for every confirmed order.');
  });
});

describe('MP-09 c2: the owner’s forms', () => {
  beforeEach(() => {
    live = true;
  });
  afterEach(() => {
    cleanup();
    replacePayAccounts(PORTED.map((m) => ({ ...m })));
  });

  const row = (over: Partial<PaymentMethodRow> = {}): PaymentMethodRow => ({
    id: 'gcash',
    label: 'GCash',
    account_number: '0999',
    account_name: 'Owner Name',
    qr_path: '',
    active: true,
    sort_order: 0,
    updated_at: STAMP,
    ...over
  });

  it('offers Payment methods and Shop texts to the owner only', async () => {
    const { runtime: owner } = await mounted('owner', { info: info() });
    expect(businessItems(owner).map((i) => i.label)).toEqual(
      expect.arrayContaining(['Payment methods', 'Shop texts'])
    );
    const { runtime: helper } = await mounted('helper', { info: info() });
    expect(helper.renderVals().livePay).toBeNull();
    expect(helper.renderVals().liveTexts).toBeNull();
  });

  it('lists the owner’s methods, inactive ones too, and opens an editor per row', async () => {
    const { runtime } = await mounted('owner', {
      info: info(),
      rows: [row(), row({ id: 'maya', label: 'Maya', active: false })]
    });
    await act(async () => {
      businessItems(runtime)
        .find((i) => i.label === 'Payment methods')!
        .go();
      await Promise.resolve();
    });
    const vals = runtime.renderVals();
    expect(vals.sheet?.liveForm).toBe(true);
    expect(vals.sheet?.title).toBe('Payment methods');
    expect(vals.livePay?.rows.map((r) => [r.label, r.active])).toEqual([
      ['GCash', true],
      ['Maya', false]
    ]);
    act(() => vals.livePay!.rows[1]!.edit());
    expect(runtime.renderVals().sheet?.title).toBe('Edit Maya');
    expect(runtime.renderVals().livePay?.editing?.label).toBe('Maya');
  });

  it('adds a method: slug id, trimmed fields, null stamp, then shows it on the checkout', async () => {
    const state = { info: info(), rows: [] as PaymentMethodRow[] };
    const { runtime, rpc } = await mounted('owner', state);
    await act(async () => {
      businessItems(runtime)
        .find((i) => i.label === 'Payment methods')!
        .go();
      await Promise.resolve();
    });
    act(() => runtime.renderVals().livePay!.addNew());
    state.info = info({
      methods: [{ id: 'gotyme', label: 'GoTyme', number: '5', name: 'N', qr: '' }]
    });
    await act(async () => {
      runtime.renderVals().livePay!.editing!.save({
        label: '  GoTyme ',
        accountNumber: ' 5 ',
        accountName: 'N',
        qrPath: '',
        active: true,
        sortOrder: 2
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    const save = rpc.mock.calls.find((c) => c[0] === 'save_payment_method')!;
    expect(save[1]).toEqual({
      p_id: 'gotyme',
      p_method: {
        label: 'GoTyme',
        account_number: '5',
        account_name: 'N',
        qr_path: '',
        active: true,
        sort_order: 2
      },
      p_expected_updated_at: null
    });
    expect(labels(runtime)).toEqual(['GoTyme']);
  });

  it('refuses a bad QR path without a request', async () => {
    const { runtime, rpc } = await mounted('owner', { info: info(), rows: [row()] });
    await act(async () => {
      businessItems(runtime)
        .find((i) => i.label === 'Payment methods')!
        .go();
      await Promise.resolve();
    });
    act(() => runtime.renderVals().livePay!.rows[0]!.edit());
    await act(async () => {
      runtime.renderVals().livePay!.editing!.save({
        label: 'GCash',
        accountNumber: '',
        accountName: '',
        qrPath: 'https://evil.example/x.png',
        active: true,
        sortOrder: 0
      });
      await Promise.resolve();
    });
    expect(rpc.mock.calls.find((c) => c[0] === 'save_payment_method')).toBeUndefined();
    expect(JSON.stringify(runtime.state.toast ?? null)).toContain('QR image path');
  });

  it('saves the shop texts against the stamp it read, and closes', async () => {
    const { runtime, rpc } = await mounted('owner', { info: info() });
    await act(async () => {
      businessItems(runtime)
        .find((i) => i.label === 'Shop texts')!
        .go();
      await new Promise((r) => setTimeout(r, 0));
    });
    const vals = runtime.renderVals();
    expect(vals.sheet?.title).toBe('Shop texts');
    expect(vals.liveTexts?.texts.tinLine).toBe('');
    await act(async () => {
      vals.liveTexts!.save({
        registrationBadge: ' Reg ',
        tinLine: 'Line',
        invoiceNote: '',
        allergenNote: 'Milk'
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    const save = rpc.mock.calls.find((c) => c[0] === 'save_shop_texts')!;
    expect(save[1]).toEqual({
      p_texts: {
        registration_badge: 'Reg',
        tin_line: 'Line',
        invoice_note: '',
        allergen_note: 'Milk'
      },
      p_expected_updated_at: STAMP
    });
    // Mutation: sending no stamp (null) would create-or-conflict instead of updating the row she read.
  });

  it('uploads a QR and a photo to the shop-media bucket with generated names', async () => {
    const { runtime, upload } = await mounted('owner', { info: info(), rows: [row()] });
    await act(async () => {
      businessItems(runtime)
        .find((i) => i.label === 'Payment methods')!
        .go();
      await Promise.resolve();
    });
    act(() => runtime.renderVals().livePay!.rows[0]!.edit());
    const file = new File([new Uint8Array(10)], 'my qr (1).png', { type: 'image/png' });
    let path: string | null = null;
    await act(async () => {
      path = await runtime.renderVals().livePay!.editing!.upload(file);
    });
    expect(path).toMatch(/^qr\/[a-f0-9]{32}\.png$/);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(String((upload.mock.calls[0] as unknown[])[0])).not.toContain('my qr');
  });
});
