import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import type { EventSale, OpsEngineState, Role } from '@/store/engine/ops-engine';

/**
 * MP-09 b4: in live mode a helper never sees cost, expenses or profit on any screen they
 * can reach, and sees sale totals only when the owner's helperSeesSales switch is on.
 * Before the fix, a render probe of these same states showed a helper the running
 * "1 sale · ₱260" total, the ₱1,500 event expense, past drop totals (₱5,200) in the sales
 * log, and after a close-out the revenue, cookie cost and expenses. Each expected amount
 * below is read from the owner's own render of the same state, so the test does not
 * depend on the engine's cost formulas.
 */
const NOW = Date.now();

function sale(id: string, dcf: number, total: number): EventSale {
  return {
    id,
    items: { dcf },
    gross: total,
    discount: 0,
    total,
    pay: 'Cash',
    ref: '',
    clerk: 'Helper',
    at: NOW - 60_000,
    synced: true,
    failed: false,
    tendered: total,
    change: 0,
    ledgerId: ''
  } as EventSale;
}

function seeded(role: Role, overrides: Record<string, unknown> = {}, seesTotals?: 0 | 1) {
  const runtime = new OpsRuntime({});
  // B3b-2: the owner's costs are the database's; this flavour costs ₱12.35 a cookie (the read itself is tested in ops-runtime-costs).
  Object.assign(runtime as unknown as Record<string, unknown>, {
    costReads: 'ok',
    itemCosts: { byId: new Map(), byName: new Map() },
    recipeRows: [{ productId: 'dcf', version: 3 }],
    recipeCosts: new Map([
      [
        'dcf',
        {
          version: 3,
          perCookie: 12.35,
          ingredientPerCookie: 10,
          packagingPerCookie: 2.35,
          batch: 120,
          complete: true,
          missing: []
        }
      ]
    ])
  });
  const cfg = { ...(runtime.state.cfg as Record<string, unknown>) };
  if (seesTotals !== undefined) cfg.helperSeesSales = seesTotals;
  runtime.state = {
    ...runtime.state,
    role,
    cfg,
    device: 'mobile',
    now: NOW,
    event: { name: 'Probe Bazaar', stage: 'selling' } as OpsEngineState['event'],
    eventLoaded: { dcf: 10 },
    eventStock: { dcf: 8 },
    drawer: { float: 1000, counted: '' },
    sales: [sale('S1', 2, 260)],
    ledger: [
      {
        id: 'L1',
        kind: 'revenue',
        at: NOW - 86_400_000,
        cat: 'Drops',
        label: 'Drop 12',
        amount: 5200,
        drop: 12
      },
      {
        id: 'L2',
        kind: 'expense',
        at: NOW - 30_000,
        cat: 'Bazaar rent',
        label: 'Table rent',
        amount: 1500,
        ev: true
      }
    ],
    ...overrides
  };
  return runtime;
}

const CLOSED = { name: 'Probe Bazaar', stage: 'closed', zExpected: 1260, zCounted: 1260, zDiff: 0 };

function text(runtime: OpsRuntime) {
  return render(<AppFrame v={runtime.renderVals()} />).container.textContent ?? '';
}

describe('helper money in live mode (MP-09 b4)', () => {
  afterEach(() => {
    cleanup();
    live = true;
  });

  it('the owner still sees every amount (the reference for the helper checks)', () => {
    const closed = seeded('owner', { screen: 'bazaar', event: CLOSED });
    const v = closed.renderVals().bzCloseout;
    expect([v.revenue, v.cogs, v.expenses]).toEqual([
      '₱260',
      expect.stringMatching(/^₱\d/),
      '₱1,500'
    ]);
    expect(text(closed)).toContain(String(v.cogs));
  });

  for (const seesTotals of [undefined, 0, 1] as const) {
    const label =
      seesTotals === 1 ? 'switch on' : seesTotals === 0 ? 'switch off' : 'switch never set';
    const on = seesTotals === 1;

    it(`${label}: no cost, expenses or profit after a close-out; revenue only when on`, () => {
      const cogs = String(
        seeded('owner', { screen: 'bazaar', event: CLOSED }).renderVals().bzCloseout.cogs
      );
      const shown = text(seeded('helper', { screen: 'bazaar', event: CLOSED }, seesTotals));
      expect(shown).not.toContain(cogs);
      expect(shown).not.toContain('₱1,500');
      expect(shown.includes('₱260')).toBe(on);
    });

    it(`${label}: a profitable close-out never shows the profit`, () => {
      const rich = { screen: 'bazaar', event: CLOSED, sales: [sale('S1', 2, 9000)] };
      const owner = seeded('owner', rich).renderVals().bzCloseout;
      expect(owner.profitOk).toBe(true);
      const shown = text(seeded('helper', rich, seesTotals));
      expect(shown).not.toContain(String(owner.profit));
    });

    it(`${label}: selling keeps each sale's amount, hides expenses, and the running total follows the switch`, () => {
      const shown = text(seeded('helper', { screen: 'bazaar' }, seesTotals));
      expect(shown).toMatch(/Double Chocolate FudgeCash· Helper₱260/);
      expect(shown).not.toContain('₱1,500');
      expect(shown).toContain(on ? '1 sale · ₱260' : '1 sale · —');
    });

    it(`${label}: the sales log keeps this event's sale; past drop totals only when on`, () => {
      const shown = text(seeded('helper', { screen: 'sales' }, seesTotals));
      expect(shown).toContain('₱260');
      expect(shown.includes('₱5,200')).toBe(on);
    });

    it(`${label}: the close-out sheet shows no revenue, cost or profit grid`, () => {
      const shown = text(
        seeded('helper', { screen: 'bazaar', sheet: { kind: 'closeout' } }, seesTotals)
      );
      expect(shown).not.toContain('Cookie cost');
      expect(shown).not.toContain('Profit');
    });

    it(`${label}: the close-out sheet's per-app totals, which add up to revenue with the cash, follow the switch`, () => {
      const mixed = {
        screen: 'bazaar',
        sheet: { kind: 'closeout' },
        sales: [sale('S1', 2, 260), { ...sale('S2', 3, 390), pay: 'GCash' }]
      };
      const shown = text(seeded('helper', mixed, seesTotals));
      // The cash box is still counted: float plus cash sales.
      expect(shown).toContain('cash sales ₱260');
      expect(shown.includes('GCash — check your app₱390')).toBe(on);
      if (!on) expect(shown).toContain('GCash — check your app—');
    });
  }

  it('today shows a helper no amounts', () => {
    expect(text(seeded('helper', { screen: 'today' }, 1))).not.toMatch(/₱\d/);
  });

  it('demo mode is unchanged: the review harness still shows the prototype as ported', () => {
    live = false;
    expect(text(seeded('helper', { screen: 'bazaar' }))).toContain('₱1,500');
  });
});
