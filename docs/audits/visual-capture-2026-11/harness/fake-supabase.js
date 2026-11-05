// Replaces src/lib/supabase/client.ts for the audit build only: an in-memory simulated server.
// Nothing reaches a network. RLS and SQL rules are NOT exercised here; that is a documented evidence limit.
import { AuthRetryableFetchError } from '@supabase/supabase-js';
import { buildDb, T0 } from './fixtures.js';

const config = window.__captureConfig ?? {};
const db = buildDb(config);
const qa = {
  calls: [],
  writes: [],
  unhandled: [],
  fail: { ...(config.rpcFail ?? {}) },
  db,
  config
};
try {
  // Lets a capture simulate "the next page load has no signal" after a real selling session.
  Object.assign(qa.fail, JSON.parse(localStorage.getItem('__captureFail') ?? '{}'));
} catch {
  /* no stored failure */
}
window.__capture = qa;
window.qaCalls = qa.calls;

const sessionUser = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'owner@synthetic.invalid'
};
const ok = (data) => ({ data, error: null, status: 200 });
const fail = (code, message = code, details = null) => ({
  data: null,
  error: { code, message, details },
  status: 400
});
const now = () => new Date(Date.now()).toISOString();

async function applyFailure(name) {
  const mode = qa.fail[name] ?? qa.fail['*'];
  if (!mode) return null;
  if (typeof mode === 'string' && mode.startsWith('slow:')) {
    await new Promise((r) => setTimeout(r, Number(mode.slice(5))));
    return null;
  }
  switch (mode) {
    case 'never':
      return new Promise(() => {});
    case 'network':
      throw new TypeError('Failed to fetch');
    case 'down':
      return fail('08006', 'connection failure');
    case 'conflict':
      return fail('P0002', 'CONFLICT');
    case 'refused':
      return fail('42501', 'not allowed');
    case 'invalid':
      return fail('22023', 'refused');
    case 'gone':
      return fail('02000', 'gone');
    case 'capacity':
      return fail('ZC002', 'capacity', '0');
    case 'missing':
      return fail('PGRST202', 'missing');
    case 'malformed':
      return ok({ malformed: true });
    default:
      return null;
  }
}

const orderById = (id) => db.orders.find((o) => o.id === id);
function setOrder(args, patch) {
  const o = orderById(args.p_order_id);
  if (!o) return fail('02000');
  Object.assign(o, patch(o), { updated_at: now() });
  return ok([{ replayed: false, updated_at: o.updated_at }]);
}
const statusBody = (o) => ({
  order_no: o.id,
  state: o.state,
  pay_state: o.pay_state,
  pay_method: o.pay_method,
  total_cents: o.total_cents,
  pickup_date: o.pickup_date,
  pickup_window: o.pickup_window,
  placed_at: o.placed_at,
  hold_expires_at: o.pay_state === 'unpaid' ? new Date(T0 + 24 * 3600000).toISOString() : null,
  items: o.items.map((i) => ({
    product_id: i.product_id,
    name: db.flavours.find((f) => f.id === i.product_id)?.short_name ?? i.product_id,
    qty: i.qty,
    unit_price_cents: i.unit_price_cents
  }))
});
const allDays = () => Object.values(db.bazaars).flatMap((b) => b.summary.days);

const handlers = {
  get_settings: () => ok(db.settings),
  get_operating_settings: () => ok(db.settings),
  get_flavours: () => ok(db.flavours),
  get_shop_status: () => ok(db.shopStatus),
  get_order_rules: () => ok([db.shopRules]),
  get_shop_order_rules: () => ok(db.shopRules),
  get_order_extras: () => ok(db.extras),
  get_shop_extras: () =>
    ok({
      same_day: {
        enabled: db.extras.same_day_enabled,
        percent: db.extras.same_day_percent,
        on_extras: db.extras.same_day_on_extras
      },
      sampler: {
        product_id: db.extras.sampler_product_id,
        max_qty: db.extras.sampler_max_qty,
        flavours: db.extras.sampler_flavours
      },
      boxes: db.extras.box_sizes.filter((b) => b.active),
      add_ons: db.extras.add_ons.filter((a) => a.active)
    }),
  get_shop_identity: () => ok(db.identity),
  get_shop_payment_info: () =>
    ok({
      methods: db.paymentMethods
        .filter((m) => m.active)
        .map((m) => ({
          id: m.id,
          label: m.label,
          number: m.account_number,
          name: m.account_name,
          qr: m.qr_path
        })),
      texts: db.texts
    }),
  get_payment_methods: () => ok(db.paymentMethods),
  get_operations_health: () => ok(db.health),
  get_books: () => ok(db.books),
  get_staff_orders: () => ok(db.orders),
  get_production: () => ok(db.production),
  get_recipes: () => ok(db.recipes),
  get_recipe_drafts: () => ok(db.recipeDrafts),
  get_flavour_costs: () => ok(db.flavourCosts),
  get_stock_catalogue: () => ok({ items: db.items, suppliers: db.suppliers, prices: db.prices }),
  get_last_paid: () => ok(db.lastPaid),
  get_item_costs: () =>
    ok(
      db.items.map((i, n) => ({
        item_id: i.id,
        name: i.name,
        active: i.active,
        unit_cost: n % 3 === 2 ? null : 800 + n * 15,
        source: n % 3 === 2 ? null : 'average'
      }))
    ),
  get_recipe_costs: () =>
    ok(
      db.recipes.map((r, n) => ({
        product_id: r.product_id,
        version: r.version,
        complete: n !== 1,
        per_cookie_cents: n === 1 ? null : 4200 + n * 300,
        batch_cents: n === 1 ? null : (4200 + n * 300) * r.yield,
        ingredient_cents_per_cookie: n === 1 ? null : 3900 + n * 300,
        packaging_cents_per_cookie: 300,
        missing: n === 1 ? [{ name: 'Marshmallows', why: 'no cost recorded' }] : []
      }))
    ),
  get_item_movements: (a) =>
    ok(a.p_item === 'item-flour' ? db.movements : db.movements.slice(1, 2)),
  get_scheduled_events: () => ok(db.events),
  get_bazaar: (a) => (db.bazaars[a.p_booking] ? ok(db.bazaars[a.p_booking]) : fail('02000')),
  consume_rate_limit: () => ok(true),

  staff_confirm_payment: (a) =>
    setOrder(a, (o) => ({
      state: o.state === 'Payment review' ? 'Confirmed' : o.state,
      pay_state: 'confirmed',
      paid_cents: o.total_cents
    })),
  staff_reject_payment: (a) =>
    setOrder(a, () => ({ state: 'Cancelled', pay_state: 'unpaid', holds: false })),
  staff_reopen_order: (a) =>
    setOrder(a, () => ({ state: 'Payment review', pay_state: 'claimed', holds: true })),
  staff_set_status: (a) =>
    setOrder(a, () => ({ state: a.p_to, holds: a.p_to !== 'Cancelled' && a.p_to !== 'No-show' })),
  staff_flag_item: (a) =>
    setOrder(a, (o) => ({
      items: o.items.map((i) => (i.product_id === a.p_product_id ? { ...i, unavailable: true } : i))
    })),
  staff_swap_item: (a) =>
    setOrder(a, (o) => ({
      swaps: [
        ...o.swaps,
        {
          from: a.p_from ?? 'dcf',
          to: a.p_to ?? 'hc',
          qty: a.p_qty ?? 1,
          delta_cents: 0,
          at: now()
        }
      ]
    })),
  staff_refund: (a) => setOrder(a, () => ({ pay_state: 'refunded', refund_ref: a.p_ref })),
  staff_settle_balance: (a) => setOrder(a, (o) => ({ paid_cents: o.total_cents })),

  record_stock_movement: (a) => {
    const m = a.p_movement ?? {};
    const it = db.items.find((i) => i.id === m.item_id);
    if (it && typeof m.qty === 'number') {
      if (m.kind === 'count' || m.kind === undefined) it.on_hand = m.qty;
      else if (m.kind === 'receipt') it.on_hand += m.qty;
      else it.on_hand -= Math.abs(m.qty);
      it.last_counted = now();
    }
    return ok([{ item_id: m.item_id, on_hand: it?.on_hand ?? 0, duplicate: false }]);
  },
  save_supplier: (a) => {
    const row = a.p_supplier;
    const ex = db.suppliers.find((s) => s.id === row.id);
    if (ex) Object.assign(ex, row, { updated_at: now() });
    else db.suppliers.push({ ...row, updated_at: now() });
    return ok([{ id: row.id, updated_at: now() }]);
  },
  save_supplier_price: (a) => {
    const row = a.p_price;
    const ex = db.prices.find((p) => p.id === row.id);
    if (ex)
      Object.assign(ex, row, {
        previous_cents:
          ex.price_cents === row.price_cents
            ? ex.previous_cents
            : [ex.price_cents, ...ex.previous_cents],
        updated_at: now()
      });
    else db.prices.push({ ...row, previous_cents: [], updated_at: now() });
    return ok([{ id: row.id, updated_at: now() }]);
  },
  record_event_sale: (a) => {
    const s = a.p_sale ?? {};
    db.sales.push(s);
    return ok([{ client_id: s.clientId, duplicate: false }]);
  },
  void_event_sale: (a) => ok([{ client_id: a.p_void?.clientId, duplicate: false }]),
  record_pack: () => ok([{ shortfall: [], duplicate: false }]),
  record_discard: () => ok([{ duplicate: false }]),
  record_production: (a) => {
    const rec = a.p_rec ?? {};
    const qty = Number(rec.qty ?? rec.good ?? rec.actual ?? 0);
    const rejects = Number(rec.rejects ?? 0);
    db.production.batches.push({
      product_id: rec.product_id,
      qty: Math.max(qty - rejects, 0),
      target: rec.target ?? null,
      rejects,
      version: rec.recipe_version ?? 1,
      at: Date.now()
    });
    const baked = db.production.baked.find((b) => b.product_id === rec.product_id);
    if (baked) baked.qty += Math.max(qty - rejects, 0);
    else db.production.baked.push({ product_id: rec.product_id, qty: Math.max(qty - rejects, 0) });
    return ok([{ shortfall: [], used_dough: 0, duplicate: false }]);
  },
  record_dough_preparation: (a) => {
    const rec = a.p_rec ?? {};
    db.production.dough.push({
      product_id: rec.product_id,
      balls: Number(rec.balls ?? 0),
      at: Date.now()
    });
    return ok([{ record_id: rec.id, duplicate: false, shortfall: [] }]);
  },
  save_recipe: (a) => {
    const body = a.p_recipe ?? a.p_rec ?? a;
    const r = db.recipes.find((x) => x.product_id === (body.product_id ?? a.p_product_id));
    if (r) {
      r.history = [...r.history, { version: r.version, yield: r.yield, lines: r.lines }];
      r.version += 1;
      r.updated_at = now();
    }
    return ok([{ version: r?.version ?? 1, updated_at: now() }]);
  },
  save_flavour: (a) => {
    const f = db.flavours.find((x) => x.id === a.p_id);
    if (f) f.updated_at = now();
    return ok([{ updated_at: now() }]);
  },
  save_scheduled_event: (a) => {
    const e = a.p_event;
    const at = now();
    const ex = db.events.find((x) => x.id === e.id);
    if (ex) Object.assign(ex, e, { updated_at: at });
    else db.events.push({ ...e, started: false, updated_at: at });
    return ok([{ id: e.id, updated_at: at }]);
  },
  save_bazaar_day: () => ok([{ updated_at: now() }]),
  add_bazaar_day_stock: (a) => ok([{ loaded: Number(a.p_qty ?? 0), duplicate: false }]),
  record_expense: (a) => {
    const e = a.p_expense ?? a.p_entry ?? {};
    db.books.lines.push({
      id: 'new-' + db.books.lines.length,
      kind: 'expense',
      cat: e.category ?? e.cat ?? 'Ingredients',
      label: e.label ?? e.description ?? 'New expense',
      amount_cents: Number(e.amount_cents ?? 0),
      at: Date.now()
    });
    return ok([{ duplicate: false }]);
  },
  record_draw: (a) => {
    const e = a.p_draw ?? {};
    db.books.lines.push({
      id: 'new-' + db.books.lines.length,
      kind: 'draw',
      cat: 'Owner drawings',
      label: e.note ?? 'Owner draw',
      amount_cents: Number(e.amount_cents ?? 0),
      at: Date.now()
    });
    return ok([{ duplicate: false }]);
  },
  record_cost_correction: () => ok([{ duplicate: false }]),
  set_cost_basis: (a) => {
    db.books.basis = a.p_basis;
    return ok(a.p_basis);
  },
  set_shop_override: (a) => {
    db.shopStatus.override = a.p_mode;
    return ok(null);
  },
  anonymise_customer: () => ok(3),
  finalise_bazaar: (a) => {
    const b = db.bazaars[a.p_booking] ?? Object.values(db.bazaars)[0];
    b.finalised_at = now();
    b.final_hash = b.summary.hash;
    b.final_summary = JSON.parse(JSON.stringify(b.summary));
    return ok(b.summary);
  },
  order_status: (a) => {
    const o = db.orders.find((x) => x.status_token === a.p_token);
    return ok(o ? statusBody(o) : null);
  },
  find_order: (a) => {
    const o = orderById(a.p_order_no);
    return ok(o && o.phone === a.p_phone ? o.status_token : null);
  },
  place_order: (a) => {
    const n = 2000 + db.orders.length;
    const token = String(n).repeat(16);
    const body = a.p_order ?? {};
    const priceOf = (id) => db.flavours.find((f) => f.id === id)?.price_cents ?? 12500;
    const items = (body.items ?? []).map((i) => {
      const id = i.product_id ?? i.id;
      return { product_id: id, qty: i.qty, unit_price_cents: priceOf(id), unavailable: false };
    });
    const total = items.reduce((t, i) => t + i.qty * i.unit_price_cents, 0);
    const pickup = body.pickup_date ?? '2026-11-14';
    db.orders.push({
      id: `HC-${n}`,
      name: body.name ?? 'Fictional Customer',
      phone: body.mobile ?? '09170000000',
      ig: '',
      state: 'Payment review',
      pay_state: 'unpaid',
      pay_method: '',
      pay_ref: null,
      total_cents: total,
      paid_cents: null,
      refund_ref: null,
      pickup_date: pickup,
      pickup_window: '10:00',
      placed_at: now(),
      updated_at: now(),
      status_token: token,
      holds: true,
      items: items.length
        ? items
        : [{ product_id: 'dcf', qty: 6, unit_price_cents: 12500, unavailable: false }],
      swaps: [],
      surcharge_cents: 0,
      same_day: false,
      add_ons: [],
      boxes: []
    });
    return ok([
      {
        order_no: `HC-${n}`,
        status_token: token,
        total_cents: total,
        pickup_date: pickup,
        pickup_window: '10:00',
        replayed: false
      }
    ]);
  },
  join_waitlist: () => ok([{ replayed: false, waitlist_id: 'fake-waitlist-1' }]),
  start_bazaar_day: (a) => {
    const day = allDays().find((d) => d.id === a.p_day);
    if (day) {
      day.state = 'open';
      day.event_id = a.p_event_id ?? day.event_id;
    }
    const loaded = {};
    const prices = {};
    for (const l of day?.lines ?? []) {
      loaded[l.product_id] = l.made + l.carried;
      prices[l.product_id] = l.price_cents;
    }
    return ok([
      {
        event_id: a.p_event_id ?? day?.event_id,
        selling_device: a.p_device ?? 'fake-device',
        float_cents: day?.float_cents ?? 0,
        prices,
        loaded
      }
    ]);
  },
  close_bazaar_day: (a) => {
    const body = a.p_close ?? a;
    const day = allDays().find((d) => d.id === (body.day_id ?? a.p_day));
    if (day) {
      day.state = 'closed';
      day.count = day.lines.map((l) => ({
        product_id: l.product_id,
        left: l.made - l.sold,
        carry_next: 0,
        to_shop: l.made - l.sold,
        written_off: 0,
        not_accounted: 0
      }));
      day.closed_at = Date.now();
      const counted = body.counted_cents ?? null;
      day.counted_cents = counted;
      day.over_cents = counted === null ? null : Math.max(counted - day.cash_expected_cents, 0);
      day.short_cents = counted === null ? null : Math.max(day.cash_expected_cents - counted, 0);
    }
    const owner = Object.values(db.bazaars).find((b) => b.summary.days.includes(day));
    return ok(owner?.summary ?? { closed: true });
  }
};

const GENERIC_WRITE =
  /^(save_|record_|set_|add_|close_|finalise_|void_|start_|load_|link_|publish_|reverse_|anonymise_)/;

async function rpc(name, args = {}) {
  qa.calls.push(name);
  if (!name.startsWith('get_'))
    qa.writes.push({ name, args: JSON.parse(JSON.stringify(args ?? {})) });
  const failure = await applyFailure(name);
  if (failure) return failure;
  const handler = handlers[name];
  if (handler) return handler(args);
  if (GENERIC_WRITE.test(name)) {
    return ok([
      {
        id: args.p_id ?? 'fake-id',
        updated_at: now(),
        duplicate: false,
        replayed: false,
        first_link: true,
        client_id: args.p_client_id ?? null
      }
    ]);
  }
  qa.unhandled.push(name);
  return { data: null, error: { code: 'PGRST202', message: 'not in harness' }, status: 404 };
}

function builder(table) {
  const q = {
    select: () => q,
    eq: () => q,
    limit: () => q,
    order: () => q,
    maybeSingle: async () => {
      if (table === 'profiles') {
        const mode = qa.fail.profile;
        if (mode === 'down') return fail('08006');
        if (mode === 'inactive') return ok({ role: config.role ?? 'owner', active: false });
        return ok({ role: config.role ?? 'owner', active: true, display_name: 'Sample Owner' });
      }
      return ok(null);
    },
    then: (resolve) => {
      if (table === 'shop_products')
        return Promise.resolve(
          qa.fail.shop_products === 'down'
            ? fail('08006')
            : ok(db.flavours.filter((f) => f.published && f.active))
        ).then(resolve);
      if (table === 'profiles')
        return Promise.resolve(
          ok([{ role: config.role ?? 'owner', active: true, display_name: 'Sample Owner' }])
        ).then(resolve);
      return Promise.resolve(ok([])).then(resolve);
    }
  };
  return q;
}

const listeners = new Set();
const auth = {
  async getUser() {
    if (qa.fail.auth === 'network') throw new AuthRetryableFetchError('Failed to fetch', 0);
    if (qa.fail.auth === 'never') return new Promise(() => {});
    if (config.session === false || qa.fail.auth === 'expired')
      return { data: { user: null }, error: null };
    return { data: { user: sessionUser }, error: null };
  },
  async getSession() {
    return {
      data: { session: config.session === false ? null : { user: sessionUser } },
      error: null
    };
  },
  async signInWithPassword({ password }) {
    if (qa.fail.signIn === 'network')
      return { data: {}, error: new AuthRetryableFetchError('Failed to fetch', 0) };
    if (password === 'wrong-password')
      return {
        data: {},
        error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' }
      };
    document.cookie = 'sb-synthetic-auth-token=fake; path=/';
    return { data: { user: sessionUser, session: { user: sessionUser } }, error: null };
  },
  async signOut() {
    document.cookie = 'sb-synthetic-auth-token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    return { error: null };
  },
  onAuthStateChange(cb) {
    listeners.add(cb);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  }
};
const storage = {
  from: () => ({
    upload: async () => ({ data: { path: 'qr/sample.png' }, error: null }),
    getPublicUrl: (p) => ({
      data: {
        publicUrl: 'https://synthetic-audit.invalid/storage/v1/object/public/shop-media/' + p
      }
    })
  })
};
const client = { rpc, from: builder, auth, storage };
export function createClient() {
  return client;
}
