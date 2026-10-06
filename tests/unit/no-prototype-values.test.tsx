import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

/**
 * Slice B2, "nothing fake on screen". Written BEFORE the fix, so it is expected to fail today:
 * its job is to say exactly which prototype values still reach a live screen.
 *
 * The real `OpsRuntime` runs in live mode against a faked Supabase client (`makeWorld`) that
 * answers every read the live gate makes, in the shapes the real parsers accept. Every screen,
 * every Settings sheet and the Bazaar payment sheet are drawn through the real `AppFrame`, and
 * the visible text and the `aria-label`, `title`, `alt` and `placeholder` attributes are
 * compared with a denylist taken from the engine's own prototype constants.
 *
 * The clock is pinned (hoisted, so the engine's own module-level dates see it too) to a
 * Wednesday in October: any month or "today" the screens work out is then not August.
 */
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T03:00:00+00:00'));
});

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));
// Queue storage: the real file needs IndexedDB, which jsdom has not (as ops-runtime-operations.test.tsx).
vi.mock('@/lib/offline/idb', () => ({
  idb: {
    supported: () => true,
    all: async () => [],
    put: async () => undefined,
    get: async () => undefined,
    delete: async () => undefined
  }
}));

import {
  ALLERGENS,
  INVENTORY,
  PAY_ACCOUNTS,
  PRODUCTS,
  RAW_ORDERS,
  ROLES,
  SUPPLIERS,
  replaceFlavours,
  replacePayAccounts
} from '@/store/engine/ops-engine';
import type { OpsEngineState } from '@/store/engine/ops-engine';
import { OpsRuntime } from '@/store/ops-runtime';
import { AppFrame } from '@/components/shell/app-frame';
import { SCREEN_KEYS, type ScreenKey } from '@/lib/screens';
import { fillDemoCatalogue } from '@/lib/data/engine-catalogue';
import { clearBazaar } from '@/lib/offline/bazaar-state';
import { rememberCheck } from '@/lib/auth/offline-trust';
import { setIdentityWords } from '@/lib/orders/identity';

// ---------------------------------------------------------------------------------------------
// 1. The denylist, taken from the engine's exports at import time, before anything replaces them
// ---------------------------------------------------------------------------------------------

interface Term {
  text: string;
  source: string;
}

/** Entries shorter than this are skipped: they match ordinary words and fragments. */
const MIN_TERM_LENGTH = 4;

/**
 * Snapshot entries that are interface vocabulary, not shop data. Each needs a reason that was
 * checked against the ported copy (a word that appears whether or not the shop has any data).
 * Matched case-insensitively against the whole entry.
 */
const ALLOWED: ReadonlyArray<{ text: string; reason: string }> = [
  // Recorded, not fixed in B2 (docs/state/system-audit.md): Bazaar Mode's payment sheet offers a
  // fixed list of wallets, written in the engine, and the ported Payments screen names two of
  // them in a sentence. Bazaar Mode is not changed before the 24 to 25 October bazaar. The
  // prototype's account numbers and holder names stay on the denylist.
  { text: 'GCash', reason: 'wallet brand in Bazaar Mode’s fixed tender list (C7) and Payments' },
  { text: 'Maya', reason: 'wallet brand in Bazaar Mode’s fixed tender list (C7) and Payments' },
  { text: 'GoTyme', reason: 'wallet brand in Bazaar Mode’s fixed tender list (C7)' }
];

/**
 * Phrases masked out of the text before matching. The app's own name, the support provider and
 * the brand asset's alt text are not shop data. Nothing else is exempt.
 */
const EXEMPT_PHRASES: ReadonlyArray<{ text: string; reason: string }> = [
  {
    text: 'The Happy Cookie Ops',
    reason: 'the product name of this app (final-plan H20), not the shop name'
  },
  {
    text: 'Happy Cookie Ops',
    reason: 'the product name of this app (final-plan H20), not the shop name'
  },
  { text: 'KETH AI', reason: 'the support provider, named in the support role (not shop data)' }
];
/** `alt` values exempt on the `alt` attribute only. */
const EXEMPT_ALT: ReadonlyArray<{ text: string; reason: string }> = [
  { text: 'The Happy Cookie', reason: 'alt text of the shop logo: a brand asset' }
];

/** From the packet: values the audit (H1 to H6, H14) found on screen. */
const LITERALS = [
  'August',
  '4 permanent, 2 rotating',
  '8 saved',
  'Proof required',
  'Courier pickup',
  '2 helpers, 2 temporary',
  'Google Form bridge',
  'On · temporary',
  'Good morning, Cine.',
  '4 classics + 2 rotating flavours, baked fresh this weekend.',
  'Cine To',
  'Kristian',
  'Ethan',
  'Cervo',
  'Misty',
  'Francine T.',
  '0917 ••• 4421',
  '0155 ••• 8890',
  'Only Cine can open this',
  'Message Cine on Instagram',
  'Cine will confirm your payment',
  'Your Happy Cookie order',
  'Sign Cine out after',
  // The shop's name, which the exemptions above mask only where it is the app's own name.
  'Happy Cookie'
];

const asText = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function snapshotTerms(): Term[] {
  const out: Term[] = [];
  const add = (source: string, value: unknown) => {
    const text = asText(value);
    if (text) out.push({ text, source });
  };
  for (const [key, role] of Object.entries(ROLES)) {
    add(`ROLES.${key}.label`, role.label);
    add(`ROLES.${key}.who`, role.who);
  }
  for (const account of PAY_ACCOUNTS) {
    add('PAY_ACCOUNTS.id', account.id);
    add('PAY_ACCOUNTS.num', account.num);
    add('PAY_ACCOUNTS.name', account.name);
  }
  for (const order of RAW_ORDERS)
    for (const field of ['id', 'name', 'ig', 'email', 'mobile', 'ref'])
      add(`RAW_ORDERS.${field}`, order[field]);
  for (const supplier of SUPPLIERS) {
    add('SUPPLIERS.name', supplier.name);
    add('SUPPLIERS.place', supplier.place);
    const items: unknown = supplier.items;
    if (Array.isArray(items))
      for (const line of items as Array<Record<string, unknown>>) add('SUPPLIERS.item', line.item);
  }
  for (const item of INVENTORY) {
    add('INVENTORY.name', item.name);
    add('INVENTORY.supplier', item.supplier);
  }
  for (const flavour of PRODUCTS) {
    add('PRODUCTS.name', flavour.name);
    add('PRODUCTS.short', flavour.short);
    add('PRODUCTS.desc', flavour.desc);
  }
  for (const literal of LITERALS) add('literal', literal);
  return out;
}

const norm = (text: string) => text.replace(/\s+/g, ' ').trim();
const SNAPSHOT = snapshotTerms();
const allowedKeys = new Set(ALLOWED.map((entry) => norm(entry.text).toLowerCase()));
const SKIPPED_SHORT = SNAPSHOT.filter((t) => t.text.length < MIN_TERM_LENGTH);
const DENYLIST: Term[] = (() => {
  const seen = new Set<string>();
  const out: Term[] = [];
  for (const term of SNAPSHOT) {
    const key = norm(term.text).toLowerCase();
    if (term.text.length < MIN_TERM_LENGTH || allowedKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...term, text: norm(term.text) });
  }
  return out;
})();

// What the module-level objects held at import, to put back between runs.
const ROLES_AT_IMPORT = JSON.parse(JSON.stringify(ROLES)) as typeof ROLES;
const PRODUCTS_AT_IMPORT = PRODUCTS.map((p) => ({ ...p }));
const ALLERGENS_AT_IMPORT = { ...ALLERGENS };
const PAY_AT_IMPORT = PAY_ACCOUNTS.map((a) => ({ ...a }));
const HELPER_SCREENS = [...(ROLES.helper.screens ?? [])] as ScreenKey[];

function restoreModuleState() {
  for (const key of Object.keys(ROLES_AT_IMPORT) as Array<keyof typeof ROLES>) {
    const roleNow = ROLES[key] as unknown as Record<string, unknown>;
    for (const field of Object.keys(roleNow)) delete roleNow[field];
    Object.assign(roleNow, JSON.parse(JSON.stringify(ROLES_AT_IMPORT[key])));
  }
  replaceFlavours(
    PRODUCTS_AT_IMPORT.map((p) => ({ ...p })),
    { ...ALLERGENS_AT_IMPORT }
  );
  replacePayAccounts(PAY_AT_IMPORT.map((a) => ({ ...a })));
  fillDemoCatalogue();
  setIdentityWords(null);
  localStorage.clear();
  sessionStorage.clear();
  clearBazaar();
}

// ---------------------------------------------------------------------------------------------
// 2. The scan
// ---------------------------------------------------------------------------------------------

interface Hit {
  screen: string;
  role: string;
  term: string;
  snippet: string;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Letters and digits on either side stop a match, so "Cine" never fires inside "Francine". */
const matcher = (text: string) =>
  new RegExp(
    '(?<![\\p{L}\\p{N}])' +
      norm(text).split(' ').map(escapeRegExp).join('\\s+') +
      '(?![\\p{L}\\p{N}])',
    'iu'
  );
const compiled = new Map<string, RegExp>();
const regexFor = (text: string) => {
  let re = compiled.get(text);
  if (!re) compiled.set(text, (re = matcher(text)));
  return re;
};

function mask(text: string): string {
  let out = text;
  for (const phrase of EXEMPT_PHRASES)
    out = out.replace(new RegExp(escapeRegExp(phrase.text), 'gi'), ' ');
  return out;
}

interface Piece {
  where: string;
  text: string;
}

/** The visible text, the values of filled fields, and the four attributes a reader may meet. */
function pieces(root: Element): Piece[] {
  const out: Piece[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const tag = node.parentElement?.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    parts.push(node.nodeValue ?? '');
  }
  for (const field of root.querySelectorAll('input, textarea')) {
    const value = (field as HTMLInputElement).value;
    if (value) parts.push(value);
  }
  out.push({ where: 'text', text: norm(parts.join(' ')) });
  for (const attr of ['aria-label', 'title', 'alt', 'placeholder']) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      const value = norm(el.getAttribute(attr) ?? '');
      if (!value) continue;
      if (attr === 'alt' && EXEMPT_ALT.some((e) => e.text.toLowerCase() === value.toLowerCase()))
        continue;
      out.push({ where: attr, text: value });
    }
  }
  return out;
}

/** Every term of `terms` found in the tree: one hit per term per piece of text. */
function scan(root: Element, screen: string, role: string, terms: readonly Term[]): Hit[] {
  const hits: Hit[] = [];
  for (const piece of pieces(root)) {
    const text = mask(piece.text);
    for (const term of terms) {
      const found = regexFor(term.text).exec(text);
      if (!found) continue;
      const at = found.index;
      hits.push({
        screen: piece.where === 'text' ? screen : `${screen} [${piece.where}]`,
        role,
        term: term.text,
        snippet: '…' + text.slice(Math.max(0, at - 28), at + found[0].length + 28) + '…'
      });
    }
  }
  return hits;
}

/** The hits grouped by term, for the message of a failed check (and the report). */
function table(hits: readonly Hit[]): string {
  const byTerm = new Map<string, Hit[]>();
  for (const hit of hits) byTerm.set(hit.term, [...(byTerm.get(hit.term) ?? []), hit]);
  return [...byTerm.entries()]
    .map(([term, list]) => {
      const where = [...new Set(list.map((h) => `${h.role}:${h.screen}`))].join(', ');
      return `  "${term}" x${list.length} in ${where}\n      e.g. ${list[0]!.snippet}`;
    })
    .join('\n');
}

// ---------------------------------------------------------------------------------------------
// 3. The world builder: a faked Supabase client that answers every read the live app makes
// ---------------------------------------------------------------------------------------------

type StaffRole = 'owner' | 'helper' | 'support';
interface Person {
  name: string;
  role: StaffRole;
}
interface FlavourSpec {
  id: string;
  name: string;
  short: string;
  price: number;
  kind: 'Permanent' | 'Rotating';
  description: string;
  allergens: string;
}
interface SupplierSpec {
  id: string;
  name: string;
  place: string;
  phone: string;
  /** What this supplier charges for a stock item, by the item's name. */
  prices: Array<{ item: string; pack: string; cents: number }>;
}
interface StockSpec {
  id: string;
  name: string;
  unit: string;
  onHand: number;
  par: number;
  supplierId: string | null;
}
interface PaymentSpec {
  id: string;
  label: string;
  number: string;
  name: string;
}
interface OrderSpec {
  id: string;
  customer: string;
  phone: string;
  flavourId: string;
  qty: number;
  payMethod: string;
}
interface IdentitySpec {
  shopName: string;
  ownerName: string;
  contactLine: string;
  tagline: string;
}
interface WorldSpec {
  staff: Person[];
  flavours: FlavourSpec[];
  stock: StockSpec[];
  suppliers: SupplierSpec[];
  payments: PaymentSpec[];
  orders: OrderSpec[];
  identity: IdentitySpec;
  /** Whether any backup, restore, retention or keep-alive run is recorded (a brand-new shop has none). */
  health: 'recorded' | 'none';
  /** `get_settings` rows; none means every setting is at its default. */
  settings: Array<Record<string, unknown>>;
}

const STAMP = '2026-10-01T02:00:00.000Z';
const NOW_ISO = new Date().toISOString();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

interface Result {
  data: unknown;
  error: null;
}

/** A `from(table).select().eq()…` chain: awaitable as a list, or ended with `maybeSingle()`. */
class Query implements PromiseLike<Result> {
  private filters: Array<[string, unknown]> = [];
  constructor(private readonly rows: Array<Record<string, unknown>>) {}
  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  order() {
    return this;
  }
  in() {
    return this;
  }
  limit() {
    return this;
  }
  private picked() {
    return this.rows.filter((row) => this.filters.every(([c, v]) => row[c] === v));
  }
  async maybeSingle(): Promise<Result> {
    return { data: this.picked()[0] ?? null, error: null };
  }
  async single(): Promise<Result> {
    return this.maybeSingle();
  }
  then<T1 = Result, T2 = never>(
    ok?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    bad?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): Promise<T1 | T2> {
    return Promise.resolve<Result>({ data: this.picked(), error: null }).then(ok, bad);
  }
}

function makeWorld(spec: WorldSpec, viewer: StaffRole | null) {
  const unknown: string[] = [];
  const calls: string[] = [];
  const people = spec.staff.map((person, i) => ({
    id: `user-${person.role}-${i}`,
    display_name: person.name,
    role: person.role,
    active: true
  }));
  const me = viewer ? people.find((p) => p.role === viewer) : undefined;
  const methodRows = spec.payments.map((p, i) => ({
    account_name: p.name,
    account_number: p.number,
    active: true,
    id: p.id,
    label: p.label,
    qr_path: '',
    sort_order: i,
    updated_at: STAMP
  }));
  const flavourRows = spec.flavours.map((f, i) => ({
    id: f.id,
    name: f.name,
    short_name: f.short,
    price_cents: f.price * 100,
    kind: f.kind,
    item_type: 'cookie',
    capacity_weight: 1,
    tag: '',
    description: f.description,
    image_path: '/assets/placeholder.png',
    allergens: f.allergens,
    active: true,
    published: true,
    sort_order: i + 1,
    updated_at: STAMP
  }));
  const job = {
    last_run: { status: 'success', completed_at: NOW_ISO, archive_sha256: 'a'.repeat(64) },
    last_success: { status: 'success', completed_at: NOW_ISO, archive_sha256: 'a'.repeat(64) }
  };
  let priceNo = 0;
  const catalogue = {
    suppliers: spec.suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      notes: '',
      place: s.place,
      active: true,
      updated_at: STAMP
    })),
    items: spec.stock.map((s) => ({
      id: s.id,
      name: s.name,
      category: 'Ingredients',
      unit: s.unit,
      on_hand: s.onHand,
      par_level: s.par,
      pack_size: null,
      pack_label: '',
      supplier_id: s.supplierId,
      use_by_days: null,
      last_counted: STAMP,
      active: true,
      updated_at: STAMP
    })),
    prices: spec.suppliers.flatMap((s) =>
      s.prices.map((p) => ({
        id: uuid(++priceNo),
        supplier_id: s.id,
        item_name: p.item,
        pack_label: p.pack,
        price_cents: p.cents,
        previous_cents: [],
        last_bought: '1 Oct',
        preferred: true,
        active: true,
        updated_at: STAMP
      }))
    )
  };
  const orders = spec.orders.map((o) => {
    const flavour = spec.flavours.find((f) => f.id === o.flavourId);
    const cents = (flavour?.price ?? 0) * 100;
    return {
      id: o.id,
      name: o.customer,
      phone: o.phone,
      ig: '',
      state: 'Confirmed',
      pay_state: 'confirmed',
      pay_method: o.payMethod,
      pay_ref: 'REF-' + o.id,
      total_cents: cents * o.qty,
      paid_cents: cents * o.qty,
      refund_ref: '',
      pickup_date: '2026-10-15',
      pickup_window: '3:00 PM',
      placed_at: '2026-10-12T02:00:00.000Z',
      updated_at: STAMP,
      status_token: null,
      holds: true,
      items: [{ product_id: o.flavourId, qty: o.qty, unit_price_cents: cents, unavailable: false }],
      swaps: [],
      surcharge_cents: 0,
      same_day: false,
      add_ons: [],
      boxes: []
    };
  });
  const rules = {
    pickup_days: [1, 4],
    lead_min_days: 1,
    lead_max_days: 14,
    pickup_from_hour: 9,
    pickup_cutoff_hour: 17,
    campus_from: '14:00',
    campus_to: '16:00',
    unpaid_hold_hours: 24
  };
  const answers: Record<string, unknown> = {
    get_settings: spec.settings,
    get_operating_settings: spec.settings,
    get_flavours: flavourRows,
    get_shop_payment_info: {
      methods: spec.payments.map((p) => ({
        id: p.id,
        label: p.label,
        number: p.number,
        name: p.name,
        qr: ''
      })),
      texts: {
        registration_badge: '',
        tin_line: '',
        invoice_note: '',
        allergen_note: '',
        updated_at: null
      }
    },
    get_payment_methods: methodRows,
    get_shop_order_rules: rules,
    get_order_rules: [{ ...rules, max_unpaid_per_phone: 3, updated_at: STAMP }],
    get_order_extras: {
      same_day_enabled: false,
      same_day_percent: 0,
      same_day_on_extras: false,
      sampler_product_id: null,
      sampler_max_qty: 1,
      box_sizes: [],
      add_ons: [],
      updated_at: STAMP
    },
    get_shop_extras: {
      same_day: { enabled: false, percent: 0, on_extras: false },
      sampler: { product_id: null, max_qty: 1 },
      boxes: [],
      add_ons: []
    },
    get_shop_status: {
      open_dow: 1,
      open_h: 8,
      open_m: 0,
      close_dow: 4,
      close_h: 20,
      close_m: 0,
      extend_h: 0,
      override: null
    },
    get_staff_orders: orders,
    get_stock_catalogue: catalogue,
    get_last_paid: [],
    get_recipes: [],
    get_recipe_drafts: [],
    get_production: { batches: [], dough: [], baked: [], shortfalls: [] },
    get_books: { basis: 'bought', lines: [], receipts: [] },
    get_scheduled_events: [],
    get_operations_health: {
      checked_at: NOW_ISO,
      jobs:
        spec.health === 'recorded'
          ? { backup: job, restore: job, retention: job, keepalive: job }
          : Object.fromEntries(
              ['backup', 'restore', 'retention', 'keepalive'].map((k) => [
                k,
                { last_run: null, last_success: null }
              ])
            )
    },
    order_status: {
      order_no: 'HC-7001',
      state: 'No-show',
      pay_state: 'confirmed',
      pay_method: spec.payments[0]?.label ?? '',
      total_cents: 100,
      pickup_date: '2026-10-12',
      pickup_window: '3:00 PM',
      placed_at: '2026-10-10T02:00:00.000Z',
      hold_expires_at: null,
      items: spec.flavours.slice(0, 1).map((f) => ({
        product_id: f.id,
        name: f.short,
        qty: 1,
        unit_price_cents: f.price * 100
      }))
    },
    get_shop_identity: {
      shop_name: spec.identity.shopName,
      owner_name: spec.identity.ownerName,
      contact_line: spec.identity.contactLine,
      tagline: spec.identity.tagline,
      updated_at: spec.identity.shopName ? STAMP : null
    }
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: me ? { id: me.id } : null }, error: null }),
      getSession: async () => ({
        data: { session: me ? { user: { id: me.id } } : null },
        error: null
      })
    },
    rpc: async (name: string) => {
      calls.push(name);
      if (name in answers) return { data: answers[name], error: null };
      unknown.push('rpc ' + name);
      return { data: null, error: { code: '', message: 'unanswered rpc ' + name } };
    },
    from: (table: string) => {
      calls.push('from ' + table);
      if (table === 'shop_products')
        return new Query(flavourRows.map((f) => ({ ...f, tag: f.tag })));
      if (table === 'profiles') return new Query(me ? (me.role === 'owner' ? people : [me]) : []);
      unknown.push('from ' + table);
      return new Query([]);
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) }
  };
  return { client, unknown, calls };
}

type World = ReturnType<typeof makeWorld>;

/** The runtime's `load*` methods, typed loosely so this file compiles whatever they are called with. */
interface Loaders {
  loadShopPayment(c: unknown): Promise<boolean>;
  loadShopOrders(c: unknown): Promise<boolean>;
  loadShopStatus(c: unknown): Promise<boolean>;
  loadShopMenu(c: unknown): Promise<boolean>;
  loadOperationsHealth(c: unknown): Promise<boolean>;
  loadSettings(c: unknown, role: string): Promise<boolean>;
  loadScheduledEvents(c: unknown): Promise<boolean>;
  loadStockCatalogue(c: unknown): Promise<boolean>;
  loadProduction(c: unknown): Promise<boolean>;
  loadBooks(c: unknown): Promise<boolean>;
  loadFlavours(c: unknown): Promise<boolean>;
  loadOrders(c: unknown): Promise<boolean>;
  loadRecipes(c: unknown): Promise<boolean>;
  /**
   * Slice B2, being built in parallel. The packet named `loadIdentity(client)`; the code today has
   * `loadShopIdentity(client)` (the shop) and `loadStaffName(client, role)` (the signed-in person),
   * which `live-gate.tsx` calls. All three are called through optionals so this file compiles at any stage.
   */
  loadIdentity?: (c: unknown) => Promise<boolean>;
  loadShopIdentity?: (c: unknown) => Promise<boolean>;
  loadStaffName?: (c: unknown, role: string) => Promise<boolean>;
}
const loaders = (runtime: OpsRuntime) => runtime as unknown as Loaders;

function mountRuntime(): OpsRuntime {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(<OpsRuntime ref={(r) => void (ref.current = r)} />);
  return ref.current!;
}

/** Signed-in staff: the same calls as `live-gate.tsx`, in its order. */
async function bootStaff(role: StaffRole, world: World): Promise<OpsRuntime> {
  const runtime = mountRuntime();
  const c = world.client;
  const L = loaders(runtime);
  act(() => runtime.setRole(role));
  await act(async () => {
    await L.loadShopPayment(c);
    await L.loadShopIdentity?.(c);
    await L.loadShopOrders(c);
    await L.loadShopStatus(c);
    if (role !== 'helper') await L.loadOperationsHealth(c);
    rememberCheck(role); // the gate records a passed check before it asks for the name
    await L.loadStaffName?.(c, role);
    await L.loadSettings(c, role);
    await L.loadIdentity?.(c);
    if (role === 'owner') {
      await L.loadScheduledEvents(c);
      await L.loadStockCatalogue(c);
      await L.loadProduction(c);
      await L.loadBooks(c);
    }
    const loaded = await L.loadFlavours(c);
    if (role === 'owner' && loaded !== false) {
      await L.loadOrders(c);
      await L.loadRecipes(c);
    }
  });
  return runtime;
}

/** A customer, signed out: the loads a public page makes, on the shop. */
async function bootCustomer(world: World): Promise<OpsRuntime> {
  const runtime = mountRuntime();
  const c = world.client;
  const L = loaders(runtime);
  act(() => runtime.setState({ screen: 'shop', device: 'mobile' }));
  await act(async () => {
    await L.loadShopPayment(c);
    await L.loadShopIdentity?.(c);
    await L.loadShopOrders(c);
    await L.loadShopStatus(c);
    await L.loadShopMenu(c);
    await L.loadIdentity?.(c);
  });
  return runtime;
}

// ---------------------------------------------------------------------------------------------
// 4. What is rendered
// ---------------------------------------------------------------------------------------------

interface Rendered {
  hits: Hit[];
  crashes: string[];
  /** The text of each drawn view, keyed `role:screen`. */
  texts: Map<string, string>;
}
const emptyRendered = (): Rendered => ({ hits: [], crashes: [], texts: new Map() });

/** Draws the runtime as it stands and scans it; a crash is recorded and the run carries on. */
function drawAndScan(
  runtime: OpsRuntime,
  label: string,
  role: string,
  terms: readonly Term[],
  into: Rendered
) {
  try {
    const { container, unmount } = render(<AppFrame v={runtime.renderVals()} />);
    into.hits.push(...scan(container, label, role, terms));
    into.texts.set(`${role}:${label}`, pieces(container)[0]?.text ?? '');
    unmount();
  } catch (error) {
    cleanup();
    into.crashes.push(
      `${role}:${label}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function drawScreens(
  runtime: OpsRuntime,
  role: string,
  screens: readonly ScreenKey[],
  device: 'desktop' | 'mobile',
  terms: readonly Term[],
  into: Rendered
) {
  for (const screen of screens) {
    try {
      act(() => runtime.setState({ screen, device, sheet: null }));
    } catch (error) {
      // The runtime itself re-renders on setState: a crash in the engine's own render lands here.
      into.crashes.push(`${role}:${screen} (runtime render): ${String(error)}`);
      continue;
    }
    drawAndScan(runtime, screen, role, terms, into);
  }
}

/** Each Settings row's `go`, drawn: the sheet it opens (or the screen it goes to), then closed. */
async function drawSettingsRows(runtime: OpsRuntime, terms: readonly Term[], into: Rendered) {
  act(() => runtime.setState({ screen: 'settings', device: 'desktop', sheet: null }));
  const shape = runtime.renderVals().settingsGroups.map((g) => g.rows.map((r) => r.label));
  for (const [g, labels] of shape.entries()) {
    for (const [r, label] of labels.entries()) {
      act(() => runtime.setState({ screen: 'settings', sheet: null }));
      const row = runtime.renderVals().settingsGroups[g]?.rows[r];
      if (!row) continue;
      try {
        await act(async () => {
          row.go();
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
      } catch (error) {
        into.crashes.push(`owner:settings row "${label}": ${String(error)}`);
        continue;
      }
      drawAndScan(runtime, `settings row "${label}"`, 'owner', terms, into);
      act(() => runtime.closeSheet());
    }
  }
}

/** The Bazaar payment sheet with one cookie in the cart, set up through the engine's own actions. */
function drawBazaarPay(
  runtime: OpsRuntime,
  flavourId: string,
  terms: readonly Term[],
  into: Rendered
) {
  const engine = runtime as unknown as { addCart: (id: string, delta: number) => void };
  act(() =>
    runtime.setState({
      screen: 'bazaar',
      device: 'mobile',
      sheet: null,
      event: {
        id: uuid(900),
        name: 'Test fair',
        stage: 'selling',
        snapshot: [flavourId]
      } as unknown as OpsEngineState['event'],
      eventStock: { [flavourId]: 10 },
      eventPrices: { [flavourId]: runtime.priceOf(flavourId) },
      cart: {}
    })
  );
  act(() => engine.addCart(flavourId, 1));
  act(() => runtime.renderVals().openPay());
  drawAndScan(runtime, 'bazaar payment sheet', 'owner', terms, into);
  act(() => runtime.closeSheet());
}

/** Everything the packet asks for, as the owner, as a helper (when there is one) and as a customer. */
async function drawEverything(
  spec: WorldSpec,
  terms: readonly Term[],
  options: { helper: boolean }
): Promise<{ rendered: Rendered; unknownAfterBoot: string[]; unknownLater: string[] }> {
  const rendered = emptyRendered();
  const unknownAfterBoot: string[] = [];
  const unknownLater: string[] = [];

  const ownerWorld = makeWorld(spec, 'owner');
  const owner = await bootStaff('owner', ownerWorld);
  unknownAfterBoot.push(...ownerWorld.unknown);
  const bootCalls = ownerWorld.unknown.length;
  drawScreens(owner, 'owner', SCREEN_KEYS, 'desktop', terms, rendered);
  drawScreens(owner, 'owner', ['today'], 'mobile', terms, rendered);
  await drawSettingsRows(owner, terms, rendered);
  // A shop with no flavour has nothing to put in a cart, so no payment sheet to open.
  const firstFlavour = spec.flavours[0]?.id;
  if (firstFlavour) drawBazaarPay(owner, firstFlavour, terms, rendered);
  const orderId = spec.orders[0]?.id;
  if (orderId) {
    act(() => owner.go('order', { orderId }));
    drawAndScan(owner, 'order detail', 'owner', terms, rendered);
    act(() => owner.sheet('ordermessages', {}));
    drawAndScan(owner, 'order messages sheet', 'owner', terms, rendered);
    act(() => owner.closeSheet());
  }
  unknownLater.push(...ownerWorld.unknown.slice(bootCalls));
  cleanup();

  if (options.helper) {
    const helperWorld = makeWorld(spec, 'helper');
    const helper = await bootStaff('helper', helperWorld);
    unknownAfterBoot.push(...helperWorld.unknown);
    drawScreens(helper, 'helper', HELPER_SCREENS, 'mobile', terms, rendered);
    // What a helper meets on a screen that is not hers ("Only … can open this"), and in the refusal toast.
    const notHers = SCREEN_KEYS.filter(
      (key) =>
        !HELPER_SCREENS.includes(key) && !['shop', 'checkout', 'status', 'lookup'].includes(key)
    );
    drawScreens(helper, 'helper', notHers, 'mobile', terms, rendered);
    const deny = (helper as unknown as { denyHelper?: (what: string) => void }).denyHelper;
    act(() => deny?.('change stock'));
    drawAndScan(helper, 'refusal toast', 'helper', terms, rendered);
    cleanup();
  }

  const customerWorld = makeWorld(spec, null);
  const customer = await bootCustomer(customerWorld);
  unknownAfterBoot.push(...customerWorld.unknown);
  drawScreens(
    customer,
    'customer',
    ['shop', 'checkout', 'status', 'lookup'],
    'mobile',
    terms,
    rendered
  );
  // The status page of a no-show order, opened from its link as a customer's browser would.
  try {
    act(() => customer.setState({ screen: 'status', device: 'mobile', sheet: null }));
    window.history.replaceState(null, '', '/status#t=' + 'ab'.repeat(32));
    await act(async () => {
      customer.syncStatusRoute();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    drawAndScan(customer, 'status (no-show order)', 'customer', terms, rendered);
  } finally {
    window.history.replaceState(null, '', '/');
  }
  cleanup();
  return { rendered, unknownAfterBoot, unknownLater };
}

// ---------------------------------------------------------------------------------------------
// 5. The shops
// ---------------------------------------------------------------------------------------------

const EMPTY_SHOP: WorldSpec = {
  staff: [{ name: 'Zoltan', role: 'owner' }],
  flavours: [],
  stock: [],
  suppliers: [],
  payments: [],
  orders: [],
  identity: { shopName: '', ownerName: '', contactLine: '', tagline: '' },
  health: 'none',
  settings: []
};

const SHOP_A: WorldSpec = {
  staff: [
    { name: 'Thessaly', role: 'owner' },
    { name: 'Wilhelmina', role: 'helper' }
  ],
  flavours: [
    {
      id: 'wcb',
      name: 'salted tidepool',
      short: 'Salted Tidepool',
      price: 137,
      kind: 'Permanent',
      description: 'brine-kissed caramel with a crackle of sea glass sugar.',
      allergens: 'milk, wheat'
    },
    {
      id: 'pbm',
      name: 'ember fig',
      short: 'Ember Fig',
      price: 263,
      kind: 'Rotating',
      description: 'smoked fig jam folded through a rye dough.',
      allergens: 'milk, wheat'
    },
    {
      id: 'rvc',
      name: 'brine biscotti',
      short: 'Brine Biscotti',
      price: 211,
      kind: 'Rotating',
      description: 'twice-baked almond fingers dipped in sea salt.',
      allergens: 'milk, wheat'
    }
  ],
  stock: [
    {
      id: 'tamarind-paste',
      name: 'Tamarind paste',
      unit: 'g',
      onHand: 900,
      par: 400,
      supplierId: 'granite-pantry'
    }
  ],
  suppliers: [
    {
      id: 'granite-pantry',
      name: 'Granite Pantry',
      place: 'Hilltop Lane',
      phone: '0933 100 2002',
      prices: [{ item: 'Tamarind paste', pack: '500 g tub', cents: 21700 }]
    }
  ],
  payments: [
    { id: 'kiosk-wallet', label: 'Kiosk Wallet', number: '0933 100 2001', name: 'Thessaly Voss' }
  ],
  orders: [
    {
      id: 'MG-7001',
      customer: 'Philippa Dunmore',
      phone: '0933 111 2003',
      flavourId: 'wcb',
      qty: 3,
      payMethod: 'Kiosk Wallet'
    }
  ],
  identity: {
    shopName: 'Marigold Oven',
    ownerName: 'Thessaly',
    contactLine: 'Message @marigold.oven on Instagram',
    tagline: 'Saltwater caramel, baked on Fridays.'
  },
  health: 'recorded',
  settings: []
};

const SHOP_B: WorldSpec = {
  staff: [
    { name: 'Odalys', role: 'owner' },
    { name: 'Brannock', role: 'helper' }
  ],
  flavours: [
    {
      id: 'wcb',
      name: 'moss cake',
      short: 'Moss Cake',
      price: 191,
      kind: 'Permanent',
      description: 'pistachio sponge under a hush of matcha frosting.',
      allergens: 'milk, wheat'
    },
    {
      id: 'pbm',
      name: 'pearl tart',
      short: 'Pearl Tart',
      price: 349,
      kind: 'Rotating',
      description: 'coconut custard in a brown butter shell.',
      allergens: 'milk, wheat'
    },
    {
      id: 'rvc',
      name: 'fennel fold',
      short: 'Fennel Fold',
      price: 173,
      kind: 'Permanent',
      description: 'laminated dough around roasted fennel and honey.',
      allergens: 'milk, wheat'
    }
  ],
  stock: [
    {
      id: 'cardamom-pods',
      name: 'Cardamom pods',
      unit: 'g',
      onHand: 700,
      par: 300,
      supplierId: 'lantern-provisions'
    }
  ],
  suppliers: [
    {
      id: 'lantern-provisions',
      name: 'Lantern Provisions',
      place: 'Orchard Row',
      phone: '0944 700 8003',
      prices: [{ item: 'Cardamom pods', pack: '250 g bag', cents: 38300 }]
    }
  ],
  payments: [{ id: 'zing-pay', label: 'Zing Pay', number: '0944 700 8002', name: 'Odalys Fenn' }],
  orders: [
    {
      id: 'QF-5001',
      customer: 'Lucinda Harcourt',
      phone: '0944 222 8004',
      flavourId: 'wcb',
      qty: 2,
      payMethod: 'Zing Pay'
    }
  ],
  identity: {
    shopName: 'Quillfeather Bakes',
    ownerName: 'Odalys',
    contactLine: 'Text Odalys on 0944 555 0147',
    tagline: 'Warm tarts for rainy Tuesdays.'
  },
  health: 'recorded',
  settings: []
};

/** Everything distinctive about a shop: none of it may appear on screen while the other shop is loaded. */
function distinctiveValues(spec: WorldSpec): Term[] {
  const values: string[] = [
    spec.identity.shopName,
    spec.identity.ownerName,
    spec.identity.contactLine,
    spec.identity.tagline,
    ...spec.staff.map((p) => p.name),
    ...spec.flavours.flatMap((f) => [f.name, f.short, f.description, `₱${f.price}`]),
    ...spec.stock.map((s) => s.name),
    ...spec.suppliers.flatMap((s) => [s.name, s.place, s.phone]),
    ...spec.payments.flatMap((p) => [p.label, p.number, p.name]),
    ...spec.orders.flatMap((o) => [o.id, o.customer, o.phone])
  ];
  return values.map((text) => ({ text, source: 'other shop' }));
}

// ---------------------------------------------------------------------------------------------
// 6. The tests
// ---------------------------------------------------------------------------------------------

const HEAVY = 120_000;
/** Two shops, each drawn in full with every sheet, twice over: well beyond the 20 s of the lighter render tests. */
const VERY_HEAVY = 300_000;

describe('B2: nothing fake on screen', () => {
  beforeEach(() => {
    live = true;
    restoreModuleState();
  });
  afterEach(() => {
    cleanup();
    live = true;
    restoreModuleState();
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('has a denylist that is not empty and was taken before anything replaced the prototype values', () => {
    const texts = DENYLIST.map((t) => t.text.toLowerCase());
    expect(DENYLIST.length).toBeGreaterThan(50);
    for (const known of [
      'Francine Reyna To',
      'Double Chocolate Fudge',
      'S&R Membership',
      'Cine To · owner'
    ])
      expect(texts, known).toContain(known.toLowerCase());
    // The module-level objects are not mutated by merely importing the runtime.
    expect(PRODUCTS.map((p) => p.short)).toContain('Double Chocolate Fudge');
    expect(SKIPPED_SHORT.every((t) => t.text.length < MIN_TERM_LENGTH)).toBe(true);
  });

  it('catches a planted prototype value, and ignores the exempt names and look-alike words', () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<p>Pay Francine Reyna To</p>' +
      '<p>Francine and cinema</p>' +
      '<p>The Happy Cookie Ops · KETH AI</p>' +
      '<img alt="The Happy Cookie" src="x">' +
      '<p>Your Happy Cookie order</p>' +
      '<button title="Message Cine on Instagram">x</button>' +
      '<input placeholder="HC-1042" aria-label="Maya">';
    document.body.append(host);
    try {
      const found = scan(host, 'planted', 'test', DENYLIST).map((h) => h.term);
      expect(found).toContain('Francine Reyna To');
      expect(found).toContain('Your Happy Cookie order');
      expect(found).toContain('Message Cine on Instagram');
      expect(found).toContain('HC-1042');
      expect(found).not.toContain('Maya'); // a wallet brand, allowed by name above
      // Only the whole phrase hits, in the title attribute; "Francine" and "cinema" do not hit "Cine".
      expect(found.filter((t) => t === 'Cine')).toHaveLength(1);
      expect(found).not.toContain('KETH AI');
      expect(found).not.toContain('Happy Cookie Ops');
      // The logo alt and the app's own name leave only the order sentence's "Happy Cookie".
      expect(found.filter((t) => t === 'Happy Cookie')).toHaveLength(1);
    } finally {
      host.remove();
    }
  });

  it('shows the prototype values in demo mode, so the scan is not vacuous', () => {
    live = false;
    const runtime = mountRuntime();
    const rendered = emptyRendered();
    drawScreens(runtime, 'demo owner', ['today', 'shop'], 'desktop', DENYLIST, rendered);
    expect(rendered.crashes).toEqual([]);
    expect(rendered.hits.map((h) => h.term)).toContain('Cine');
  });

  it(
    'shows no prototype value anywhere for an empty shop, and 0 pickups',
    async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const { rendered, unknownAfterBoot, unknownLater } = await drawEverything(
          EMPTY_SHOP,
          DENYLIST,
          { helper: false }
        );
        expect.soft(unknownAfterBoot, 'reads the fake client had no answer for').toEqual([]);
        expect.soft(unknownLater, 'calls made while drawing sheets that had no answer').toEqual([]);
        expect.soft(rendered.crashes, 'views that crashed instead of drawing').toEqual([]);
        expect
          .soft(
            rendered.hits.length,
            `${rendered.hits.length} prototype value(s) on screen:\n${table(rendered.hits)}`
          )
          .toBe(0);

        const runtime = await bootStaff('owner', makeWorld(EMPTY_SHOP, 'owner'));
        act(() => runtime.setState({ screen: 'today', device: 'desktop' }));
        const pickups = runtime.renderVals().statusStrip.find((s) => s.label === 'Pickups');
        expect.soft(pickups?.value, 'Home status strip "Pickups"').toBe('0');
      } finally {
        errorSpy.mockRestore();
      }
    },
    HEAVY
  );

  // Not reached through the public surface within the attempt budget: nothing on a drawn view carries them.
  it.todo(
    'the customer cancellation toast does not say "Cine will confirm and refund you" (ops-engine.js:1072, a toast after the customer asks to cancel)'
  );
  it.todo(
    'the message the owner sends does not say "Your Happy Cookie order" (src/lib/messaging/templates.ts, text built for the owner to send, not drawn on a view)'
  );

  it(
    'draws an owner whose flavours have ids of their own, not the prototype ids wcb, pbm and rvc',
    async () => {
      // The engine's price-rule preview (ops-engine.js `priceModePreview`) prices { wcb, rvc, pbm } unconditionally.
      const slugs = ['moss-cake', 'pearl-tart', 'fennel-fold'];
      const own: WorldSpec = {
        ...SHOP_B,
        orders: [],
        flavours: SHOP_B.flavours.map((f, i) => ({ ...f, id: slugs[i]! }))
      };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let failure = '';
      try {
        const runtime = await bootStaff('owner', makeWorld(own, 'owner'));
        act(() => runtime.setState({ screen: 'today', device: 'desktop' }));
        runtime.renderVals();
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      } finally {
        errorSpy.mockRestore();
      }
      expect.soft(failure, 'the owner screens could not be drawn').toBe('');
    },
    HEAVY
  );

  describe.each([
    ['A, then B', SHOP_A, SHOP_B],
    ['B, then A', SHOP_B, SHOP_A]
  ])('two shops that share nothing (%s)', (_name, first, second) => {
    it(
      'shows the second shop only its own values, and none of the prototype or the first shop',
      async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
          // The first shop is loaded and drawn, then the page is "reloaded" onto the second.
          await drawEverything(first, DENYLIST, { helper: true });
          cleanup();
          restoreModuleState();

          const leaks = distinctiveValues(first);
          const { rendered, unknownAfterBoot, unknownLater } = await drawEverything(
            second,
            [...DENYLIST, ...leaks],
            { helper: true }
          );
          expect.soft(unknownAfterBoot, 'reads the fake client had no answer for').toEqual([]);
          expect
            .soft(unknownLater, 'calls made while drawing sheets that had no answer')
            .toEqual([]);
          expect.soft(rendered.crashes, 'views that crashed instead of drawing').toEqual([]);
          const leaked = new Set(leaks.map((l) => l.text));
          const prototype = rendered.hits.filter((h) => !leaked.has(h.term));
          const other = rendered.hits.filter((h) => leaked.has(h.term));
          expect.soft(prototype.length, `prototype values on screen:\n${table(prototype)}`).toBe(0);
          expect.soft(other.length, `the other shop's values on screen:\n${table(other)}`).toBe(0);

          const text = (key: string) => rendered.texts.get(key) ?? '';
          const owner = second.identity.ownerName;
          const f1 = second.flavours[0]!;
          expect.soft(text('owner:today'), 'the owner name in the Home greeting').toContain(owner);
          for (const flavour of second.flavours) {
            expect
              .soft(text('owner:products'), `${flavour.short} on Products`)
              .toContain(flavour.short);
            expect
              .soft(text('customer:shop'), `${flavour.short} on the customer shop`)
              .toContain(flavour.short);
          }
          expect
            .soft(text('customer:shop'), `₱${f1.price} on the customer shop`)
            .toContain(`₱${f1.price}`);
          expect
            .soft(text('owner:suppliers'), 'the supplier on Suppliers')
            .toContain(second.suppliers[0]!.name);
          expect
            .soft(text('customer:shop'), 'the tagline on the customer shop')
            .toContain(second.identity.tagline);
        } finally {
          errorSpy.mockRestore();
        }
      },
      VERY_HEAVY
    );
  });
});
