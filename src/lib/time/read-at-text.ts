import { formatManila, manilaToday } from '@/lib/time/business-clock';

/** When a shown list was read, on the shop's clock: "10:00 AM", or "Mon 10:00 AM" on an earlier day. */
export function readAtText(at: number): string {
  const time = formatManila(at, { hour: 'numeric', minute: '2-digit' });
  return manilaToday(at) === manilaToday()
    ? time
    : formatManila(at, { weekday: 'short' }) + ' ' + time;
}
