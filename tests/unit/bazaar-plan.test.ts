import { describe, expect, it } from 'vitest';
import { cookiesText, eventWhen, pesoInput, planFromForm } from '@/lib/bazaar/plan';
import type { PlanFlavour } from '@/lib/bazaar/live-bazaar-types';

/**
 * S2: the day plan form as pure functions. What is typed becomes whole centavos and whole cookies through `src/lib/money.ts`
 * only, or the words for what is wrong. Each `Mutation:` line names a change one of these tests must catch.
 */
const flavour = (over: Partial<PlanFlavour> = {}): PlanFlavour => ({
  id: 'dcf',
  name: 'Double Chocolate Fudge',
  made: '20',
  carried: '',
  price: '125',
  ...over
});

describe('planFromForm', () => {
  it('turns pesos and counts into centavos and whole cookies, leaving off a flavour with none', () => {
    const r = planFromForm({
      floatPesos: '500.50',
      flavours: [
        flavour(),
        flavour({ id: 'hc', made: '', price: '' }),
        flavour({ id: 'wcb', made: '3', carried: '2', price: '38.44' })
      ]
    });
    expect(r).toEqual({
      ok: true,
      plan: {
        floatCents: 50050,
        lines: [
          { productId: 'dcf', made: 20, carried: 0, priceCents: 12500 },
          { productId: 'wcb', made: 3, carried: 2, priceCents: 3844 }
        ]
      }
    });
    // Mutation: price * 100 without rounding makes 38.44 pesos 3843 centavos: one centavo short on every cookie.
  });

  it('a blank float is none', () => {
    const r = planFromForm({ floatPesos: '', flavours: [flavour()] });
    expect(r).toMatchObject({ ok: true, plan: { floatCents: 0 } });
  });

  it.each([
    ['a float with letters', { floatPesos: '5oo', flavours: [flavour()] }, /drawer float/],
    ['a float over a million', { floatPesos: '1000001', flavours: [flavour()] }, /at most/],
    [
      'a count with a decimal',
      { floatPesos: '0', flavours: [flavour({ made: '2.5' })] },
      /whole number/
    ],
    ['a negative count', { floatPesos: '0', flavours: [flavour({ made: '-1' })] }, /whole number/],
    [
      'a count over 9,999',
      { floatPesos: '0', flavours: [flavour({ made: '10000' })] },
      /whole number/
    ],
    [
      'cookies with no price',
      { floatPesos: '0', flavours: [flavour({ price: '' })] },
      /set a price/
    ],
    [
      'a price with three decimals',
      { floatPesos: '0', flavours: [flavour({ price: '1.005' })] },
      /set a price/
    ],
    [
      'no cookies at all',
      { floatPesos: '0', flavours: [flavour({ made: '' })] },
      /at least one cookie/
    ]
  ])('refuses %s, in words', (_name, input, words) => {
    const r = planFromForm(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(words);
  });

  it('names the flavour that is wrong', () => {
    const r = planFromForm({
      floatPesos: '0',
      flavours: [flavour(), flavour({ id: 'hc', name: 'Happy Camper', made: 'x' })]
    });
    expect(r).toEqual({
      ok: false,
      error: 'Happy Camper: cookies made must be a whole number from 0 to 9,999.'
    });
  });

  it('a flavour with no cookies is not asked for a price', () => {
    const r = planFromForm({
      floatPesos: '0',
      flavours: [flavour(), flavour({ id: 'hc', made: '0', price: 'abc' })]
    });
    expect(r.ok).toBe(true);
  });
});

describe('texts', () => {
  it('writes input text and counts (money text is src/lib/money/format.ts, tested in money-format.test.ts)', () => {
    expect(pesoInput(12500)).toBe('125');
    expect(pesoInput(12550)).toBe('125.5');
    expect(cookiesText(1)).toBe('1 cookie');
    expect(cookiesText(1200)).toBe('1,200 cookies');
  });
});

describe('eventWhen', () => {
  it('says when an event is, from its dates and today (Manila dates, YYYY-MM-DD)', () => {
    expect(eventWhen('2026-10-24', '2026-10-25', '2026-10-24')).toBe('Today');
    expect(eventWhen('2026-10-24', '2026-10-25', '2026-10-25')).toBe('Today');
    expect(eventWhen('2026-10-24', '2026-10-25', '2026-10-23')).toBe('Tomorrow');
    expect(eventWhen('2026-10-24', '2026-10-25', '2026-10-15')).toBe('In 9 days');
    // Across a month end.
    expect(eventWhen('2026-11-02', '2026-11-02', '2026-10-30')).toBe('In 3 days');
    // Mutation: counting from the end date says "In 10 days" for a two-day event.
  });
});
