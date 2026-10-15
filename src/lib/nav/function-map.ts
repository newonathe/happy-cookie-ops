import type { ScreenKey } from '../screens';

/**
 * One home for everything that exists (docs/state/final-plan.md, section 8.1).
 *
 * The live owner's navigation is read from this file: the five tabs, the places under
 * each, and which All tools entry and which route belongs to which place. Every entry
 * and every route has exactly one home (tests/unit/function-map.test.tsx), so nothing is
 * offered twice and nothing is lost.
 *
 * Pure data with a type-only import, so scripts can read it too. The labels are the
 * plan's words until the wording pass with the owner; change them here and nowhere else.
 */
export const TABS = [
  { id: 'home', label: 'Home', screen: 'today' },
  { id: 'sell', label: 'Sell', screen: 'orders' },
  { id: 'make', label: 'Make', screen: 'bake' },
  { id: 'stock', label: 'Stock', screen: 'inventory' },
  { id: 'money', label: 'Money', screen: 'pnl' }
] as const satisfies ReadonlyArray<{ id: string; label: string; screen: ScreenKey }>;

export type TabId = (typeof TABS)[number]['id'];

/** Homes outside the five tabs. */
export type OtherHome = 'account' | 'bell' | 'customer' | 'retired';

/** An All tools entry, by its label, and the screen it opens when it opens one. */
export interface Entry {
  label: string;
  screen?: ScreenKey;
}

export interface Place {
  id: string;
  /** The tab the place sits under, or the home it has outside the tabs. */
  home: TabId | OtherHome;
  label: string;
  /** The screen the place opens on. Null when it has none yet and opens its one entry. */
  screen: ScreenKey | null;
  /** The entries that live here, the place's own first. */
  entries: readonly Entry[];
  /** Every route that belongs here, the ones no entry opens included. */
  routes: readonly ScreenKey[];
}

export const PLACES: readonly Place[] = [
  { id: 'week', home: 'home', label: 'This week', screen: 'today', entries: [], routes: ['today'] },
  {
    id: 'orders',
    home: 'sell',
    label: 'Orders',
    screen: 'orders',
    entries: [
      { label: 'Orders & payments', screen: 'orders' },
      { label: 'Payments', screen: 'reconcile' },
      { label: 'Customer messages' }
    ],
    routes: ['orders', 'order', 'reconcile']
  },
  {
    id: 'bazaar',
    home: 'sell',
    label: 'Bazaar',
    screen: 'bazaar',
    entries: [{ label: 'Bazaar Mode', screen: 'bazaar' }, { label: 'Bazaar events' }],
    routes: ['bazaar']
  },
  {
    id: 'customers',
    home: 'sell',
    label: 'Customers',
    screen: null,
    entries: [{ label: 'Customers & waitlist' }],
    routes: []
  },
  {
    id: 'shop',
    home: 'sell',
    label: 'Shop',
    screen: 'drops',
    entries: [
      { label: 'Drops', screen: 'drops' },
      { label: 'Shop status' },
      { label: 'Order rules' },
      { label: 'Boxes & add-ons' },
      { label: 'Payment methods' },
      { label: 'Shop texts' },
      { label: 'Preview shop' },
      { label: 'Preview checkout' },
      { label: 'Preview order status' }
    ],
    routes: ['drops']
  },
  {
    id: 'bake',
    home: 'make',
    label: 'Bake plan',
    screen: 'bake',
    entries: [{ label: 'Bake & dough', screen: 'bake' }],
    routes: ['bake', 'batch']
  },
  {
    id: 'recipes',
    home: 'make',
    label: 'Recipes',
    screen: 'recipes',
    entries: [
      { label: 'Recipes', screen: 'recipes' },
      { label: 'Products', screen: 'products' },
      { label: 'Menu & flavours' },
      { label: 'Recipe drafts' }
    ],
    routes: ['recipes', 'products']
  },
  {
    id: 'inventory',
    home: 'stock',
    label: 'Inventory',
    screen: 'inventory',
    entries: [
      { label: 'Inventory', screen: 'inventory' },
      { label: 'Stock items' },
      { label: 'Packaging' }
    ],
    routes: ['inventory', 'stocktake']
  },
  {
    id: 'grocery',
    home: 'stock',
    label: 'Grocery',
    screen: 'grocery',
    entries: [{ label: 'Grocery', screen: 'grocery' }],
    routes: ['grocery']
  },
  {
    id: 'suppliers',
    home: 'stock',
    label: 'Suppliers',
    screen: 'suppliers',
    entries: [{ label: 'Suppliers', screen: 'suppliers' }, { label: 'Suppliers & prices' }],
    routes: ['suppliers']
  },
  {
    id: 'pnl',
    home: 'money',
    label: 'P&L',
    screen: 'pnl',
    entries: [{ label: 'Profit & loss', screen: 'pnl' }],
    routes: ['pnl']
  },
  {
    id: 'sales',
    home: 'money',
    label: 'Sales',
    screen: 'sales',
    entries: [{ label: 'Sales log', screen: 'sales' }],
    routes: ['sales']
  },
  {
    id: 'expenses',
    home: 'money',
    label: 'Expenses',
    screen: null,
    entries: [{ label: 'Books & costs' }],
    routes: []
  },
  {
    id: 'account',
    home: 'account',
    label: 'Account',
    screen: 'settings',
    entries: [
      { label: 'Settings', screen: 'settings' },
      { label: 'System health', screen: 'health' },
      // Opens the same screen as System health until they are one entry (section 8.1).
      { label: 'Backups & export', screen: 'health' }
    ],
    routes: ['settings', 'health']
  },
  {
    id: 'bell',
    home: 'bell',
    label: 'Notifications',
    screen: 'notifications',
    entries: [{ label: 'Notifications', screen: 'notifications' }],
    routes: ['notifications']
  },
  {
    id: 'customer',
    home: 'customer',
    label: 'Customer pages',
    screen: 'shop',
    entries: [],
    routes: ['shop', 'checkout', 'status', 'lookup']
  },
  // The only two things not carried over: All tools itself, which the tabs replace, and
  // the Form queue entry, whose Google Form bridge was cut on 28 September and never built.
  // Both addresses still open; nothing links to them.
  {
    id: 'retired',
    home: 'retired',
    label: 'No longer used',
    screen: null,
    entries: [{ label: 'Form queue', screen: 'formqueue' }],
    routes: ['formqueue', 'more']
  }
];

/** The tab with this id, or undefined for a home outside the five tabs. */
export function tabOf(home: Place['home']) {
  return TABS.find((tab) => tab.id === home);
}

/** The places under one tab, in order. */
export function placesOf(tab: TabId): Place[] {
  return PLACES.filter((place) => place.home === tab);
}

/** The place a route belongs to. */
export function placeOfRoute(route: string): Place | undefined {
  return PLACES.find((place) => (place.routes as readonly string[]).includes(route));
}

/** The place an All tools entry belongs to. */
export function placeOfEntry(label: string): Place | undefined {
  return PLACES.find((place) => place.entries.some((entry) => entry.label === label));
}

/** The tab a route sits under, or null for a home outside the five tabs. */
export function tabOfRoute(route: string): TabId | null {
  const place = placeOfRoute(route);
  return (place && tabOf(place.home)?.id) ?? null;
}
