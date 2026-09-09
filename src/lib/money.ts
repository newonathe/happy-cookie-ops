/**
 * Peso ↔ centavo conversion. The only place it happens.
 *
 * Postgres stores money as `bigint` centavos; the engine speaks pesos, because that is
 * what the prototype's signed-off screens display. Something has to convert, and the
 * failure mode of letting each caller do it is not hypothetical: `scripts/gen-seed.mjs`
 * already had `Math.round(pesos * 100)` inlined with no test, which is exactly the
 * one-rule-in-two-places problem `src/lib/rules/capacity.ts` exists to prevent.
 *
 * Why the rounding is not optional: 38.44 is the packaging fee, and in IEEE-754
 * `38.44 * 100` is 3843.9999999999995. Truncating gives 3843 — one centavo short, on
 * every box, forever. `Math.round` is correct across this domain (values are well under
 * 2^53 centavos), and there is no float arithmetic anywhere else in a ledger path.
 */

/** Pesos as the engine and the screens use them. `1234.5` is ₱1,234.50. */
export type Pesos = number;

/** Centavos as Postgres stores them. `123450` is ₱1,234.50. */
export type Centavos = number;

export function pesosToCentavos(pesos: Pesos): Centavos {
  if (!Number.isFinite(pesos)) {
    throw new TypeError(`pesosToCentavos: expected a finite number, got ${pesos}`);
  }
  return Math.round(pesos * 100);
}

export function centavosToPesos(centavos: Centavos): Pesos {
  if (!Number.isInteger(centavos)) {
    // A fractional centavo means a conversion happened somewhere it should not have.
    // Failing here is how you find that call instead of shipping a rounding error.
    throw new TypeError(`centavosToPesos: expected whole centavos, got ${centavos}`);
  }
  return centavos / 100;
}

/**
 * Postgres returns `bigint` columns as strings through the JS client, because a bigint
 * can exceed `Number.MAX_SAFE_INTEGER`. Ours cannot — a hundred trillion pesos is not a
 * concern for a cookie business — but the string still arrives, and `'3844' / 100` is a
 * silent coercion nobody reviewed. This makes the boundary explicit.
 */
export function centavosFromDb(value: string | number | null | undefined): Centavos {
  if (value == null) return 0;
  const centavos = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError(`centavosFromDb: not a safe integer: ${String(value)}`);
  }
  return centavos;
}

/** For an insert or update. Postgres accepts a JS number for a bigint in this range. */
export function centavosToDb(centavos: Centavos): number {
  if (!Number.isSafeInteger(centavos)) {
    throw new TypeError(`centavosToDb: not a safe integer: ${centavos}`);
  }
  return centavos;
}

/**
 * Sums centavos. Trivial, and here so that no caller is ever tempted to sum pesos —
 * adding floats accumulates error, and this runs over a day's takings.
 */
export function sumCentavos(values: Centavos[]): Centavos {
  return values.reduce((total, value) => total + centavosToDb(value), 0);
}
