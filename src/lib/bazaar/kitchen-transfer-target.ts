import { fetchBazaar, type BazaarClient, type BazaarDay } from '@/lib/data/bazaar-days';
import { dayRange } from '@/lib/date/day-text';
import { readKitchenAvailability } from './kitchen-availability';
import { readKitchenSources } from './kitchen-sources';

export interface KitchenTransferTarget {
  name: string;
  date: string;
  day: BazaarDay;
  closed: boolean;
  products: Array<{
    id: string;
    name: string;
    sourceDrop: number;
    separate: boolean;
    available: number | null;
    dayTotal: number;
  }>;
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
  const products: KitchenTransferTarget['products'] = day.lines.map((line) => ({
    id: line.productId,
    name: line.name,
    sourceDrop: byProduct.get(line.productId) ?? ports.defaultDrop,
    separate:
      !byProduct.has(line.productId) &&
      data.days.some((d) => d.lines.some((l) => l.productId === line.productId && l.made > 0)),
    available: null,
    dayTotal: line.made + line.carried
  }));
  const periods = [...new Set(products.filter((p) => !p.separate).map((p) => p.sourceDrop))];
  const counts = new Map(
    await Promise.all(
      periods.map(
        async (period) =>
          [period, await readKitchenAvailability(ports.client, period, ports.current)] as const
      )
    )
  );
  if (!ports.current()) throw Error('retired kitchen transfer view');
  for (const product of products) {
    const read = counts.get(product.sourceDrop);
    product.available =
      !product.separate && read?.outcome === 'read' ? (read.balances.get(product.id) ?? 0) : null;
  }
  return {
    name: data.booking.name,
    date: dayRange(day.day, day.day, new Date(ports.now())),
    day,
    closed: day.state === 'closed' || data.finalised || !data.booking.active,
    products
  };
}
