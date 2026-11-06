import { describe, expect, it, vi } from 'vitest';
import { BakePlan, type BakePlanDeps, type BakePlanItem } from '@/store/bake-plan';

const items: BakePlanItem[] = [
  {
    name: 'Flour',
    unit: 'g',
    onHand: 100,
    counted: true,
    packSize: 1000,
    packLabel: '1 kg',
    supplier: 'Mill',
    packPesos: 80
  },
  {
    name: 'Sugar',
    unit: 'g',
    onHand: 5000,
    counted: true,
    packSize: 1000,
    packLabel: '1 kg',
    supplier: 'Mill',
    packPesos: null
  },
  {
    name: 'Butter',
    unit: 'g',
    onHand: 900,
    counted: false,
    packSize: 225,
    packLabel: '225 g',
    supplier: 'Dairy',
    packPesos: 100
  }
];
const recipes: Record<
  string,
  { savedYield: number; lines: Array<{ name: string; qty: number; unit: string }> }
> = {
  a: {
    savedYield: 12,
    lines: [
      { name: 'Flour', qty: 250, unit: 'g' },
      { name: 'Sugar', qty: 100, unit: 'g' },
      { name: 'Butter', qty: 100, unit: 'g' }
    ]
  },
  b: { savedYield: 6, lines: [{ name: 'Flour', qty: 100, unit: 'g' }] },
  c: { savedYield: 12, lines: [] }
};

function setup(over: Partial<BakePlanDeps> = {}) {
  const data = new Map<string, string>();
  const deps: BakePlanDeps = {
    scope: () => ({
      userId: '11111111-1111-4111-8111-111111111111',
      business: 'https://plans.supabase.co'
    }),
    products: () => [
      { id: 'a', name: 'Cookie A' },
      { id: 'b', name: 'Cookie B' },
      { id: 'c', name: 'Cookie C' }
    ],
    recipe: (id) => recipes[id] ?? null,
    items: () => items,
    storage: () => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value)
    }),
    rerender: vi.fn(),
    ...over
  };
  return { plan: new BakePlan(deps), data };
}

const choose = (plan: BakePlan, rows: Array<[string, string]>) => {
  plan.vals().edit();
  plan.vals().rows.forEach((row) => plan.vals().removeRow(row.key));
  for (const [product, cookies] of rows) {
    plan.vals().addRow();
    const key = plan.vals().rows.at(-1)!.key;
    plan.vals().setProduct(key, product);
    plan.vals().setCookies(key, cookies);
  }
  plan.vals().use();
};

describe('planned bake', () => {
  it('is empty until something is planned', () => {
    expect(setup().plan.vals()).toMatchObject({ cookies: 0, needs: [], noRecipe: [], open: false });
  });

  it('adds what each product needs and reads it against recorded stock', () => {
    const { plan } = setup();
    choose(plan, [
      ['a', '24'],
      ['b', '12']
    ]);
    const { needs, cookies } = plan.vals();
    expect(cookies).toBe(36);
    const flour = needs.find((need) => need.name === 'Flour')!;
    expect(flour).toMatchObject({ needed: 700, have: 100, state: 'short', short: 600 });
    expect(flour).toMatchObject({ packs: 1, costPesos: 80, supplier: 'Mill' });
    expect(needs.find((need) => need.name === 'Sugar')).toMatchObject({
      state: 'enough',
      packs: null
    });
  });

  it('shows a zero without a physical count as unknown, while preserving recorded positive stock', () => {
    const { plan } = setup({
      items: () => items.map((item) => (item.name === 'Butter' ? { ...item, onHand: 0 } : item))
    });
    choose(plan, [['a', '12']]);
    expect(plan.vals().needs.find((need) => need.name === 'Butter')).toMatchObject({
      state: 'notCounted',
      have: null
    });
    const positive = setup();
    choose(positive.plan, [['a', '12']]);
    expect(positive.plan.vals().needs.find((need) => need.name === 'Butter')).toMatchObject({
      state: 'enough',
      have: 900
    });
  });

  it('keeps an unknown price out of the total, and says so', () => {
    const { plan } = setup({
      items: () => items.map((item) => ({ ...item, packPesos: null }))
    });
    choose(plan, [['a', '24']]);
    expect(plan.vals()).toMatchObject({ knownPesos: 0, somePending: true });
    expect(plan.vals().needs.find((need) => need.name === 'Flour')?.costPesos).toBeNull();
  });

  it('names a planned product with no recipe, and works out the rest', () => {
    const { plan } = setup();
    choose(plan, [
      ['a', '12'],
      ['c', '12']
    ]);
    expect(plan.vals().noRecipe).toEqual(['Cookie C']);
    expect(plan.vals().needs.length).toBe(3);
  });

  it.each(['0', '-1', '1.5', 'many', '100001'])(
    'refuses %s cookies and keeps the page open',
    (n) => {
      const { plan } = setup();
      choose(plan, [['a', n]]);
      expect(plan.vals().open).toBe(true);
      expect(plan.vals().error).toMatch(/whole cookies/);
      expect(plan.vals().cookies).toBe(0);
    }
  );

  it('merges a product chosen twice, and an empty row is no plan', () => {
    const { plan } = setup();
    choose(plan, [
      ['a', '12'],
      ['a', '12'],
      ['b', '']
    ]);
    expect(plan.vals().cookies).toBe(24);
  });

  it('keeps excessive combined product quantities in review instead of losing them on reload', () => {
    const { plan, data } = setup();
    choose(plan, [
      ['a', '60000'],
      ['a', '60000']
    ]);
    expect(plan.vals()).toMatchObject({ open: true, cookies: 0 });
    expect(plan.vals().error).toContain('including repeated rows');
    expect(data.size).toBe(0);
    expect(plan.vals().rows.map((row) => row.cookies)).toEqual(['60000', '60000']);
  });

  it('survives a scoped reload and visibly distinguishes an unreadable note', () => {
    const first = setup();
    choose(first.plan, [['a', '12']]);
    const raw = [...first.data.values()][0]!;
    const storage = (value: string) => () => ({ getItem: () => value, setItem: () => undefined });
    expect(setup({ storage: storage(raw) }).plan.vals().cookies).toBe(12);
    expect(setup({ storage: storage('{') }).plan.vals().cookies).toBe(0);
    expect(setup({ storage: storage('{') }).plan.vals().retention?.status).not.toBe('empty');
    expect(
      setup({ storage: storage('[{"productId":"a","cookies":-3}]') }).plan.vals().cookies
    ).toBe(0);
  });

  it('keeps storage failure visit-only and never writes without a verified identity', () => {
    const setItem = vi.fn(() => {
      throw Error('blocked');
    });
    const first = setup({ storage: () => ({ getItem: () => null, setItem }) });
    choose(first.plan, [['a', '12']]);
    expect(first.plan.vals()).toMatchObject({ cookies: 12, retention: { status: 'visit' } });
    const second = setup({ scope: () => null, storage: () => ({ getItem: () => null, setItem }) });
    setItem.mockClear();
    choose(second.plan, [['a', '12']]);
    expect(second.plan.vals().retention?.status).toBe('visit');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('isolates owners and backends and rejects callbacks from an earlier identity', () => {
    let scope = {
      userId: '11111111-1111-4111-8111-111111111111',
      business: 'https://first.supabase.co'
    };
    const { plan, data } = setup({ scope: () => scope });
    choose(plan, [['a', '12']]);
    plan.vals().edit();
    const old = plan.vals();
    scope = { ...scope, business: 'https://second.supabase.co' };
    old.setCookies(old.rows[0]!.key, '99');
    old.use();
    old.edit();
    expect(plan.vals()).toMatchObject({ cookies: 0, open: false });
    choose(plan, [['b', '6']]);
    scope = { ...scope, userId: '22222222-2222-4222-8222-222222222222' };
    expect(plan.vals().cookies).toBe(0);
    scope = {
      userId: '11111111-1111-4111-8111-111111111111',
      business: 'https://first.supabase.co'
    };
    expect(plan.vals().cookies).toBe(12);
    expect(data.size).toBe(2);
  });

  it('preserves an unreadable saved copy and an old unscoped note while new planning continues', () => {
    const { plan, data } = setup();
    data.set('hc-planned-bake-v1', '[{"productId":"a","cookies":12}]');
    expect(plan.vals().retention?.status).toBe('legacy');
    choose(plan, [['b', '6']]);
    expect(data.get('hc-planned-bake-v1')).toBe('[{"productId":"a","cookies":12}]');
    const key = [...data.keys()].find((key) => key.startsWith('hc-planned-bake-v2:'))!;
    data.set(key, '{');
    const store = () => ({
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      }
    });
    const resumed = setup({ storage: store }).plan;
    expect(resumed.vals().retention?.status).not.toBe('empty');
    choose(resumed, [['a', '24']]);
    expect(resumed.vals()).toMatchObject({ cookies: 24, retention: { status: 'visit' } });
    expect(data.get(key)).toBe('{');
  });

  it('leaving the page does not change the plan', () => {
    const { plan } = setup();
    choose(plan, [['a', '12']]);
    plan.vals().edit();
    plan.vals().setCookies(plan.vals().rows[0]!.key, '99');
    plan.vals().close();
    expect(plan.vals().cookies).toBe(12);
  });
});
