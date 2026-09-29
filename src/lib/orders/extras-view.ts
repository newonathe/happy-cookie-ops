import { centavosToPesos } from '@/lib/money';
import type { StaffOrder } from '@/lib/data/staff-orders';
import { extrasCents } from '@/lib/data/staff-orders';

/**
 * How the owner sees what an order carries beyond flavours (B4b): rows for the ported order detail
 * (name, quantity, line total in pesos) and lines for the customer messages (with the note text, which
 * the owner needs to write the card). Wording is PLACEHOLDER, like `staff-copy.ts`.
 */
export interface ExtraRow {
  name: string;
  qty: number;
  linePesos: number;
}

const label = (name: string, variant: string): string => (variant ? `${name} ${variant}` : name);

/** One row per add-on line, per box size and, when there is one, the same-day extra. */
export function extraRows(o: StaffOrder): ExtraRow[] {
  const rows: ExtraRow[] = [];
  for (const a of o.addOns)
    rows.push({
      name: label(a.name, a.variant),
      qty: a.qty,
      linePesos: centavosToPesos(a.qty * a.unitCents)
    });
  for (const b of o.boxes)
    rows.push({
      name: `Box of ${b.size}`,
      qty: b.qty,
      linePesos: centavosToPesos(b.qty * b.chargeCents)
    });
  // The extra is the total minus everything else, so a hidden component can never make the rows disagree with it.
  const listed = rows.reduce((n, r) => n + Math.round(r.linePesos * 100), 0);
  const itemsCents = o.items.reduce((n, i) => n + i.qty * i.unitCents, 0);
  const rest = o.totalCents - itemsCents - listed;
  if (o.sameDay && o.surchargeCents > 0)
    rows.push({
      name: 'Same-day pickup extra',
      qty: 1,
      linePesos: centavosToPesos(o.surchargeCents)
    });
  else if (rest > 0) rows.push({ name: 'Other charges', qty: 1, linePesos: centavosToPesos(rest) });
  return rows;
}

/** Plain lines for the messages sheet and the customer texts: what to pack, including the note text. */
export function extraDetails(o: StaffOrder): string[] {
  const out: string[] = [];
  for (const a of o.addOns)
    out.push(`${label(a.name, a.variant)} × ${a.qty}${a.note ? ': "' + a.note + '"' : ''}`);
  for (const b of o.boxes) out.push(`Box of ${b.size} × ${b.qty}`);
  if (o.sameDay && o.surchargeCents > 0) out.push('Same-day pickup');
  return out;
}

export { extrasCents };
