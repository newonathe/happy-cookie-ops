import { fetchBazaar, type BazaarClient, type BazaarDay } from '@/lib/data/bazaar-days';
import { dayRange } from '@/lib/date/day-text';
import { readKitchenSources } from './kitchen-sources';

export interface KitchenTransferTarget {
  name: string;
  date: string;
  day: BazaarDay;
  closed: boolean;
  products: Array<{ id: string; name: string; sourceDrop: number; separate: boolean }>;
}
interface Ports {
  client: BazaarClient;
  bookingId: string;
  dayId: string;
  defaultDrop: number;
  current: () => boolean;
  now: () => number;
}

/** Quantities first, then immutable source markers: a transfer already read
 * in the day's stock must never be mistaken for separately-made stock. */
export async function readKitchenTransferTarget(ports: Ports): Promise<KitchenTransferTarget> {
  if (!ports.current()) throw Error('retired kitchen transfer view');
  const data = await fetchBazaar(ports.client, ports.bookingId);
  if (!ports.current()) throw Error('retired kitchen transfer view');
  const sources = await readKitchenSources(ports.client, ports.bookingId);
  if (!ports.current() || sources.outcome !== 'read') throw Error('kitchen sources unavailable');
  const day = data.days.find((item) => item.id === ports.dayId);
  if (data.booking.id !== ports.bookingId || !day) throw Error('destination changed');
  const byProduct = new Map(sources.sources.map((item) => [item.product_id, item.source_drop]));
  return {
    name: data.booking.name,
    date: dayRange(day.day, day.day, new Date(ports.now())),
    day,
    closed: day.state === 'closed' || data.finalised || !data.booking.active,
    products: day.lines.map((line) => ({
      id: line.productId,
      name: line.name,
      sourceDrop: byProduct.get(line.productId) ?? ports.defaultDrop,
      separate:
        !byProduct.has(line.productId) &&
        data.days.some((d) => d.lines.some((l) => l.productId === line.productId && l.made > 0))
    }))
  };
}
