import { describe, expect, it } from 'vitest';
import { centavosFromDb, centavosToPesos, pesosToCentavos, sumCentavos } from '@/lib/money';
import { PRODUCTS } from '@/store/engine/ops-engine';

/**
 * The conversion boundary. Every price, total and ledger entry crosses it, so an error
 * here is an error in her books rather than on one screen.
 */
describe('pesosToCentavos', () => {
  it('converts the packaging fee without losing the centavo that float maths eats', () => {
    // 38.44 * 100 is 3843.9999999999995 in IEEE-754. Truncating loses a centavo on
    // every box, forever. This assertion is the reason Math.round is not optional.
    expect(pesosToCentavos(38.44)).toBe(3844);
  });

  it('converts every seeded price losslessly, both ways', () => {
    for (const product of PRODUCTS) {
      const centavos = pesosToCentavos(product.price);
      expect(Number.isInteger(centavos)).toBe(true);
      expect(centavosToPesos(centavos)).toBe(product.price);
    }
  });

  it('handles a whole-peso price exactly', () => {
    expect(pesosToCentavos(130)).toBe(13000);
    expect(pesosToCentavos(860)).toBe(86000);
  });

  it('handles zero and a refund', () => {
    expect(pesosToCentavos(0)).toBe(0);
    expect(pesosToCentavos(-1200)).toBe(-120000);
  });

  it('refuses a value that is not a number rather than storing NaN', () => {
    expect(() => pesosToCentavos(Number.NaN)).toThrow(TypeError);
    expect(() => pesosToCentavos(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('centavosToPesos', () => {
  it('refuses a fractional centavo, so the bad conversion is found where it happened', () => {
    expect(() => centavosToPesos(3844.5)).toThrow(TypeError);
  });
});

describe('centavosFromDb', () => {
  it('accepts the string Postgres actually returns for a bigint column', () => {
    expect(centavosFromDb('13000')).toBe(13000);
  });

  it('treats a null column as zero rather than NaN', () => {
    expect(centavosFromDb(null)).toBe(0);
  });

  it('refuses a value that has lost precision', () => {
    expect(() => centavosFromDb('9007199254740993')).toThrow(TypeError);
  });
});

describe('sumCentavos', () => {
  it('adds a day of takings exactly, which summing pesos would not', () => {
    const prices = PRODUCTS.map((p) => pesosToCentavos(p.price));
    const total = sumCentavos([...prices, ...prices, 3844]);
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(prices.reduce((a, b) => a + b, 0) * 2 + 3844);
  });

  it('is zero for an empty day', () => {
    expect(sumCentavos([])).toBe(0);
  });
});
