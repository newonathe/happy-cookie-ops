/**
 * How the live screens write money. One helper, two decimals (docs/design/bazaar-v2.md, section 3): `₱1,234.00`.
 * The ported screens keep whole pesos until U8, so nothing in `src/components/screens|sheets|shell` calls this.
 *
 * It takes whole centavos, never pesos: a bare number that might be either is how a ledger goes wrong.
 */
const FORMAT = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
} as const;

/** Whole centavos from a figure that may carry a fraction of one (a mean, a share). Halves go away from zero. */
export function roundCentavos(centavos: number): number {
  if (!Number.isFinite(centavos)) {
    throw new TypeError(`roundCentavos: expected a finite number, got ${centavos}`);
  }
  const rounded = Math.round(Math.abs(centavos));
  return centavos < 0 && rounded !== 0 ? -rounded : rounded;
}

/** `₱1,234.00`, `-₱5.00` (the minus before the sign), `₱0.00`. */
export function peso(centavos: number): string {
  const whole = roundCentavos(centavos);
  const text = '₱' + (Math.abs(whole) / 100).toLocaleString('en-PH', FORMAT);
  return whole < 0 ? '-' + text : text;
}

/**
 * A cost per cookie, which the database keeps to four decimals of a centavo: `₱12.00`, `₱28.7525`. Never rounded, so a
 * typed cost reads back exactly as it was typed; at least two decimals.
 */
export function pesoUnit(unitCentavos: number): string {
  if (!Number.isFinite(unitCentavos)) {
    throw new TypeError(`pesoUnit: expected a finite number, got ${unitCentavos}`);
  }
  const text =
    '₱' +
    (Math.abs(unitCentavos) / 100).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
  return unitCentavos < 0 ? '-' + text : text;
}
