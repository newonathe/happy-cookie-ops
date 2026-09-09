const KEY = 'hc-device-id';

/** A per-device id, used to make offline sale ids unique across phones at one bazaar. */
export function deviceId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) return saved;
    const id = crypto.randomUUID().slice(0, 8);
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return 'anon';
  }
}
