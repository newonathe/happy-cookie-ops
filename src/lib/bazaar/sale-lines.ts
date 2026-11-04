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
  return summary.split(/, (?=\d+×? )/).flatMap((part) => {
    const match = /^(\d+)×? (.+)$/s.exec(part);
    if (!match) return [];
    const qty = Number(match[1]);
    return qty > 0 ? [{ qty, name: match[2]! }] : [];
  });
}

/** A sale's name for the owner. The database names a stall sale after its device id, which means nothing to her. */
export function saleName(label: unknown): string {
  return /^stall sale\b/i.test(String(label ?? '')) ? 'Bazaar sale' : String(label ?? '');
}
