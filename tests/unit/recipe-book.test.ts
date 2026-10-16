import { describe, expect, it } from 'vitest';
import type { RecipeCost } from '@/lib/data/costs';
import {
  MARGIN_FLOOR_PERCENT,
  bookCounts,
  bookRows,
  costFieldChanged,
  costFieldText,
  costOf,
  costSourceText,
  filterBook,
  marginOf,
  marginText,
  marginTone,
  parseCostField,
  receiptOf,
  recipeCents,
  startingCostText,
  type BookFlavour
} from '@/lib/recipes/book';

/**
 * U7: the recipe book's rules, with numbers worked by hand (centavos unless a test says pesos). Each `Mutation:` line names
 * a change the test next to it must catch.
 */
const recipe = (over: Partial<RecipeCost> = {}): RecipeCost => ({
  version: 3,
  perCookie: 31.25,
  ingredientPerCookie: 24.5,
  packagingPerCookie: 6.75,
  batch: 588,
  complete: true,
  missing: [],
  ...over
});

const flavour = (over: Partial<BookFlavour> = {}): BookFlavour => ({
  id: 'classic',
  name: 'Classic',
  photo: 'assets/classic.jpg',
  onMenu: true,
  priceCents: 12500,
  recipe: recipe(),
  batchYield: 24,
  typedCents: null,
  typedAt: null,
  ...over
});

describe('the cost a cookie has', () => {
  it('is hers for the flavour when she typed one, whatever the recipe says', () => {
    // Mutation: letting the recipe win over a typed cost.
    expect(costOf(flavour({ typedCents: 4000 }))).toEqual({ cents: 4000, source: 'typed' });
  });

  it('is the complete recipe’s when she typed none: 31.25 pesos is 3,125 centavos', () => {
    expect(costOf(flavour())).toEqual({ cents: 3125, source: 'recipe' });
  });

  it('is not known for a recipe with a missing item, even though it has a part cost', () => {
    // Mutation: reading perCookie without checking `complete` would show a part cost as a cookie's cost.
    const partial = recipe({ complete: false, missing: [{ name: 'Flour', why: 'no cost' }] });
    expect(costOf(flavour({ recipe: partial }))).toEqual({ cents: null, source: 'pending' });
  });

  it('is not known for a recipe whose cost was not read, and a typed cost of 0 is a cost', () => {
    expect(costOf(flavour({ recipe: null }))).toEqual({ cents: null, source: 'pending' });
    // Mutation: `typedCents || recipe` would treat a typed ₱0 as "not typed".
    expect(costOf(flavour({ typedCents: 0 }))).toEqual({ cents: 0, source: 'typed' });
  });

  it('keeps the database’s precision and drops float noise: 0.1 + 0.2 pesos is 30 centavos', () => {
    expect(recipeCents(recipe({ perCookie: 0.1 + 0.2 }))).toBe(30);
    expect(recipeCents(recipe({ perCookie: 28.7525 }))).toBe(2875.25);
  });
});

describe('the margin', () => {
  it('is what the cookie keeps over its price: 12,500 at a cost of 3,125 keeps 9,375, which is 75 %', () => {
    const m = marginOf(12500, 3125);
    expect(m).toEqual({ cents: 9375, percent: 75 });
    expect(marginText(m)).toBe('75%');
  });

  it('shows a decimal when it is not whole: 12,000 at 4,500 keeps 7,500 = 62.5 %', () => {
    expect(marginText(marginOf(12000, 4500))).toBe('62.5%');
  });

  it('is not known without a cost or a price', () => {
    expect(marginOf(12500, null)).toBeNull();
    expect(marginOf(0, 100)).toBeNull();
    expect(marginText(null)).toBe('—');
  });

  it('is ok at the floor and warn below it, compared before rounding', () => {
    expect(MARGIN_FLOOR_PERCENT).toBe(65);
    // 10,000 at 3,500 keeps exactly 65 %.
    expect(marginTone(marginOf(10000, 3500))).toBe('ok');
    // Mutation: `>` instead of `>=` would turn the floor itself red.
    // 3,501 keeps 64.99 %: warn, and the words must not say "65%".
    const just = marginOf(10000, 3501);
    expect(marginTone(just)).toBe('warn');
    expect(marginText(just)).toBe('64.9%');
    expect(marginTone(null)).toBe('none');
  });

  it('takes the floor as an argument, so the setting can replace the constant', () => {
    expect(marginTone(marginOf(10000, 3500), 70)).toBe('warn');
  });

  it('is negative when the cost is above the price', () => {
    const m = marginOf(10000, 12000);
    expect(m?.cents).toBe(-2000);
    expect(marginTone(m)).toBe('warn');
  });
});

describe('the book’s rows', () => {
  it('give each flavour its cost, source, margin and tone', () => {
    const rows = bookRows([
      flavour({ id: 'a', name: 'Alpha' }),
      flavour({ id: 'b', name: 'Beta', typedCents: 6000 }),
      flavour({ id: 'c', name: 'Gamma', recipe: null })
    ]);
    expect(rows.map((r) => [r.id, r.costCents, r.costSource, r.tone])).toEqual([
      ['a', 3125, 'recipe', 'ok'],
      ['b', 6000, 'typed', 'warn'],
      ['c', null, 'pending', 'none']
    ]);
    // 12,500 at 6,000 keeps 6,500 = 52 %.
    expect(rows[1]?.margin?.percent).toBe(52);
  });
});

describe('search and filters', () => {
  const rows = [
    { name: 'Classic Chocolate Chip', onMenu: true },
    { name: 'Red Velvet', onMenu: false },
    { name: 'Salted Caramel', onMenu: true }
  ];

  it('On the menu leaves the flavours on the menu; All leaves every one', () => {
    expect(filterBook(rows, 'menu', '').map((r) => r.name)).toEqual([
      'Classic Chocolate Chip',
      'Salted Caramel'
    ]);
    expect(filterBook(rows, 'all', '')).toHaveLength(3);
  });

  it('search ignores case and spaces at the ends, and works inside a filter', () => {
    expect(filterBook(rows, 'all', '  VELVET ').map((r) => r.name)).toEqual(['Red Velvet']);
    // Mutation: searching before filtering would let an off-menu flavour into "On the menu".
    expect(filterBook(rows, 'menu', 'velvet')).toEqual([]);
    expect(filterBook(rows, 'menu', 'xyz')).toEqual([]);
  });

  it('counts the menu and all', () => {
    expect(bookCounts(rows)).toEqual({ menu: 2, all: 3 });
  });
});

describe('the cost field', () => {
  it('writes centavos as pesos without trailing zeros', () => {
    expect(costFieldText(3125)).toBe('31.25');
    expect(costFieldText(1200)).toBe('12');
    expect(costFieldText(2875.25)).toBe('28.7525');
    expect(costFieldText(null)).toBe('');
  });

  it('starts with her cost, else the recipe’s, else blank', () => {
    expect(startingCostText(flavour({ typedCents: 4000 }))).toBe('40');
    expect(startingCostText(flavour())).toBe('31.25');
    expect(startingCostText(flavour({ recipe: null }))).toBe('');
  });

  it('starts a recipe cost with more than four decimals at a value the field accepts: 310 over 24 is 12.916667', () => {
    // Mutation: six decimals in the field would open with a value its own check refuses.
    expect(costFieldText(1291.6667)).toBe('12.9167');
    const start = startingCostText(flavour({ recipe: recipe({ perCookie: 12.916667 }) }));
    expect(start).toBe('12.9167');
    expect(parseCostField(start)).toEqual({ cents: 1291.67, error: null });
    expect(costFieldChanged(start, start)).toBe(false);
  });

  it('reads what she types: blank goes back to the recipe, a peso sign and commas are allowed', () => {
    expect(parseCostField('')).toEqual({ cents: null, error: null });
    expect(parseCostField('   ')).toEqual({ cents: null, error: null });
    expect(parseCostField('12.50')).toEqual({ cents: 1250, error: null });
    expect(parseCostField('₱1,250')).toEqual({ cents: 125000, error: null });
    expect(parseCostField('28.7525')).toEqual({ cents: 2875.25, error: null });
  });

  it('refuses what is not a cost, with words that say how to fix it', () => {
    // Mutation: five decimals would be rounded silently.
    for (const bad of ['abc', '12.50001', '-3', '1,2,3']) {
      const r = parseCostField(bad);
      expect(r.cents).toBeNull();
      expect(r.error).toContain('Enter the cost per cookie like 12 or 12.50');
    }
  });

  it('is changed only when it would save something different from where it started', () => {
    expect(costFieldChanged('31.25', '31.25')).toBe(false);
    // The same cost written another way is not a change.
    expect(costFieldChanged('31.250', '31.25')).toBe(false);
    expect(costFieldChanged('₱31.25', '31.25')).toBe(false);
    expect(costFieldChanged('32', '31.25')).toBe(true);
    // Clearing a typed cost is a change (back to the recipe's).
    expect(costFieldChanged('', '40')).toBe(true);
    expect(costFieldChanged('', '')).toBe(false);
  });
});

describe('the cost receipt', () => {
  it('lists ingredients and packaging per cookie, the total, and the batch', () => {
    const r = receiptOf(recipe(), 24);
    expect(r?.lines).toEqual([
      { label: 'Ingredients', valueText: '₱24.50' },
      { label: 'Packaging', valueText: '₱6.75' }
    ]);
    expect(r?.totalText).toBe('₱31.25');
    // 24.50 a cookie over 24 cookies is 588.00 for the batch.
    expect(r?.batchText).toBe('One batch makes 24 cookies; its ingredients cost ₱588.00.');
    expect(r?.missing).toEqual([]);
  });

  it('leaves out packaging when the recipe has none, and says one cookie in the singular', () => {
    const r = receiptOf(recipe({ packagingPerCookie: 0, perCookie: 24.5, batch: 24.5 }), 1);
    expect(r?.lines.map((l) => l.label)).toEqual(['Ingredients']);
    expect(r?.batchText).toBe('One batch makes 1 cookie; its ingredients cost ₱24.50.');
  });

  it('has no total for an incomplete recipe and names what is missing', () => {
    const r = receiptOf(
      recipe({
        complete: false,
        missing: [
          { name: 'Flour', why: 'no cost' },
          { name: 'Box', why: 'no cost' }
        ]
      }),
      24
    );
    expect(r?.totalText).toBeNull();
    expect(r?.missing).toEqual(['Flour', 'Box']);
  });

  it('has no batch sentence without a yield, and nothing at all without a recipe cost', () => {
    expect(receiptOf(recipe(), null)?.batchText).toBeNull();
    expect(receiptOf(null, 24)).toBeNull();
  });
});

describe('where the cost came from', () => {
  it('says so in the event page’s words', () => {
    expect(costSourceText('typed', '15 Oct')).toBe('Typed by you on 15 Oct');
    expect(costSourceText('typed', null)).toBe('Typed by you');
    expect(costSourceText('recipe', null)).toBe('From the recipe');
    expect(costSourceText('pending', null)).toBe('No cost per cookie yet');
  });
});
