/** One cookie line of a sale. */
export interface SaleLine {
  qty: number;
  name: string;
}

/**
 * A sale's cookies as lines, from the engine's one-line summary ("2× Happy Camper, 1× PB & Miso"). A cookie tapped and
 * then taken off again stays in the sale as "0× …"; it was not sold, so it has no line. A new line starts only at a
 * count, so a comma inside a cookie's name stays in that name.
 */
export function saleLines(summary: string): SaleLine[] {
  return summary.split(/, (?=\d+× )/).flatMap((part) => {
    const match = /^(\d+)× (.+)$/s.exec(part);
    if (!match) return [];
    const qty = Number(match[1]);
    return qty > 0 ? [{ qty, name: match[2]! }] : [];
  });
}
