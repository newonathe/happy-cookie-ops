/** Read-only Bazaar location. A URL never authorizes access or changes the held day. */
export type BazaarRoute = 'till' | 'events' | `event:${string}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function bazaarBooking(route: BazaarRoute): string | null {
  const id = route.startsWith('event:') ? route.slice(6) : '';
  return UUID.test(id) ? id : null;
}

export function readBazaarRoute(search: string): BazaarRoute {
  const values = new URLSearchParams(search).getAll('bazaar');
  if (values.length !== 1) return 'events';
  const value = values[0]!;
  if (value === 'events') return 'events';
  if (value === 'till') return 'till';
  return UUID.test(value) ? `event:${value}` : 'events';
}

export function pathForBazaar(route: BazaarRoute): string {
  const id = bazaarBooking(route);
  return id ? `/bazaar?bazaar=${id}` : route === 'till' ? '/bazaar?bazaar=till' : '/bazaar';
}
