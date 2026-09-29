/**
 * The running bazaar, kept on the phone so a reload with no signal can carry on selling.
 *
 * Live mode never restores the demo books, but the event the server opened (its id, its
 * price snapshot, the stall stock and the day's sales) exists nowhere else on the phone:
 * `start_event` needs signal, so an event lost to a reload could not be restarted at the
 * stall, and restarting later would open a second event. No customer data is stored here.
 */
const KEY = 'hc-live-bazaar';
const KEYS = ['event', 'eventStock', 'eventPrices', 'eventLoaded', 'sales', 'unsynced'] as const;

let last = '';

export function saveBazaar(state: Record<string, unknown>): void {
  if (!state.event) return;
  const slice: Record<string, unknown> = {};
  for (const key of KEYS) slice[key] = state[key];
  const text = JSON.stringify(slice);
  if (text === last) return;
  last = text;
  try {
    localStorage.setItem(KEY, text);
  } catch {
    /* private mode or full: the queue still holds every sale */
  }
}

export function readBazaar(): Record<string, unknown> | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return null;
    const record = saved as Record<string, unknown>;
    const event = record.event as { id?: unknown } | null | undefined;
    if (!event || typeof event !== 'object' || typeof event.id !== 'string') return null;
    if (!Array.isArray(record.sales)) return null;
    const slice: Record<string, unknown> = {};
    for (const key of KEYS) if (record[key] !== undefined) slice[key] = record[key];
    return slice;
  } catch {
    return null;
  }
}

export function clearBazaar(): void {
  last = '';
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
