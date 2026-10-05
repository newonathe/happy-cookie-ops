/**
 * Screen keys double as URL segments, so /orders, /bake and /shop are real routes.
 *
 * The engine holds its own copy of this list (it predates the routes); the unit test in
 * tests/unit/screens.test.ts fails if the two ever drift apart.
 */
export const SCREEN_KEYS = [
  'today',
  'sales',
  'orders',
  'order',
  'lookup',
  'reconcile',
  'bake',
  'batch',
  'inventory',
  'stocktake',
  'more',
  'grocery',
  'bazaar',
  'pnl',
  'formqueue',
  'health',
  'products',
  'notifications',
  'shop',
  'checkout',
  'status',
  'recipes',
  'drops',
  'suppliers',
  'settings'
] as const;

export type ScreenKey = (typeof SCREEN_KEYS)[number];

/** Public, no login. Everything else is behind the role gate. */
export const CUSTOMER_SCREENS: ScreenKey[] = ['shop', 'checkout', 'status', 'lookup'];

export const HOME_SCREEN: ScreenKey = 'today';

export function isScreenKey(value: string): value is ScreenKey {
  return (SCREEN_KEYS as readonly string[]).includes(value);
}

export function pathForScreen(screen: ScreenKey): string {
  return screen === HOME_SCREEN ? '/' : '/' + screen;
}

export function screenForPath(pathname: string): ScreenKey {
  const seg = pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
  return seg && isScreenKey(seg) ? seg : HOME_SCREEN;
}
