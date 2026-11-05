// Declarative list of every view and state captured. manifest.json and coverage.csv are generated from this plus the results.
export const VIEWPORTS = {
  p320: { w: 320, h: 700 },
  p390: { w: 390, h: 844 },
  t768: { w: 768, h: 1024 },
  l1024: { w: 1024, h: 768 },
  d1440: { w: 1440, h: 900 },
  w1920: { w: 1920, h: 1080 },
  land: { w: 844, h: 390 },
  short: { w: 1280, h: 600 }
};
const ALL = ['p320', 'p390', 't768', 'l1024', 'd1440', 'w1920'];
const SUB = ['p390', 't768', 'd1440'];
const TWO = ['p390', 'd1440'];
const TIGHT = ['land', 'short'];

export const VIEWS = [];
export const SCENARIOS = [];
const SRC = 'src/components/live/';
function view(section, id, title, refs, source, extra = {}) {
  const v = {
    key: `${section}/${id}`,
    section,
    view: id,
    title,
    refs,
    source: source.startsWith('src/') ? source : SRC + source,
    role: 'owner',
    ...extra
  };
  VIEWS.push(v);
  return v;
}
function state(v, name, opt = {}) {
  SCENARIOS.push({
    id: `${v.key}/${name}`,
    section: v.section,
    view: v.view,
    state: name,
    path: opt.path ?? v.path,
    config: opt.config ?? v.config ?? {},
    steps: [...(opt.base === false ? [] : (v.steps ?? [])), ...(opt.steps ?? [])],
    viewports: opt.viewports ?? (v.primary ? ALL : SUB),
    stateSource:
      opt.source ??
      (opt.config && (opt.config.rpcFail || opt.config.data) ? 'rpc-fixture' : 'ui-driven'),
    note: opt.note ?? '',
    full: opt.full,
    motion: opt.motion,
    transparency: opt.transparency,
    engine: opt.engine,
    expect: opt.expect,
    wait: opt.wait,
    group: opt.group ?? 'interaction',
    unverified: opt.unverified
  });
}
/** The common data and failure variants of a primary screen, only where they apply. */
function variants(v, { fail = [], skip = [], states = {} } = {}) {
  const rpc = (mode) => Object.fromEntries(fail.map((n) => [n, mode]));
  const add = (name, opt) => {
    if (!skip.includes(name)) state(v, name, { viewports: TWO, ...opt });
  };
  add('empty', {
    config: { data: 'empty' },
    group: 'data',
    note: 'Simulated server answers with no records.'
  });
  add('many', {
    config: { data: 'many' },
    group: 'data',
    note: '60 extra orders and 40 extra stock items.'
  });
  add('long-text', {
    config: { data: 'long' },
    group: 'data',
    note: 'Long customer, product and item names.'
  });
  add('large-values', {
    config: { data: 'large' },
    group: 'data',
    note: 'Prices and book amounts multiplied by 90.'
  });
  if (fail.length) {
    add('loading', {
      config: { rpcFail: rpc('never') },
      group: 'failure',
      note: 'Reads never answer, so the loading treatment stays on screen.'
    });
    add('read-failure', {
      config: { rpcFail: rpc('down') },
      group: 'failure',
      note: 'Reads answer with a connection error (08006).'
    });
    add('malformed-answer', {
      config: { rpcFail: rpc('malformed') },
      group: 'failure',
      note: 'Reads answer with a shape the parser refuses.'
    });
  }
  add('offline-after-load', {
    steps: [{ offline: true }, { fail: { '*': 'network' } }, { wait: 500 }],
    group: 'failure',
    source: 'ui-driven',
    note: 'Browser goes offline after a populated load.'
  });
  add('focus-keyboard', {
    steps: [{ key: 'Tab', times: 5 }],
    viewports: ['d1440'],
    group: 'interaction',
    note: 'Five Tab presses from page start: what focus looks like.',
    full: false
  });
  for (const [k, o] of Object.entries(states)) state(v, k, o);
}

// ------------------------------------------------ HOME
const home = view('home', 'home', 'Home', ['home'], 'home/home-live.tsx', {
  primary: true,
  path: '/',
  controller: 'src/store/home-desk.ts',
  transitions: 'Each row opens its section.'
});
state(home, 'populated', { group: 'data' });
variants(home, {
  fail: ['get_staff_orders', 'get_books', 'get_stock_catalogue'],
  states: {
    'quick-add-open': { steps: ['Quick add'], viewports: SUB, note: 'Header Quick add panel.' },
    'shop-closed': { config: { shopOverride: 'closed' }, viewports: TWO, group: 'business' },
    'hover-row': { steps: [{ hover: 'Start production' }], viewports: ['d1440'], full: false },
    'pressed-row': { steps: [{ press: 'Start production' }], viewports: ['d1440'], full: false },
    'reduced-motion': { motion: 'reduce', viewports: TWO, group: 'accessibility' },
    'reduced-transparency': { transparency: true, viewports: TWO, group: 'accessibility' },
    'height-constrained': { viewports: TIGHT, group: 'responsive' },
    'playwright-webkit': {
      wait: 7000,
      engine: 'webkit',
      viewports: ['p390'],
      group: 'responsive',
      note: 'Playwright WebKit build on Windows. This is not Safari or an iPhone.'
    }
  }
});

// ------------------------------------------------ BAZAAR
const OPEN = /^Open event ?Harbor Street Fair/;
const PLANNED = { bazaar: 'planned' };
const TILL = [OPEN, 'Start the day', 'Resume selling'];
const P1 = /^Double Chocolate Fudge, ₱/;
const P2 = /^Happy Camper, ₱/;
const SALE = [P1, /^Charge/, { fill: 'Cash handed over', value: '200' }, /^Cash$/];
const events = view('bazaar', 'events', 'Bazaar events', ['events'], 'bazaar/event-list.tsx', {
  primary: true,
  path: '/bazaar',
  controller: 'src/store/bazaar-days.ts'
});
state(events, 'populated', { group: 'data' });
variants(events, {
  fail: ['get_scheduled_events'],
  states: {
    'upcoming-open': { steps: ['Upcoming 1'], viewports: TWO },
    'past-open': { steps: ['Past 1'], viewports: TWO, group: 'data' },
    'active-event-held': {
      config: PLANNED,
      steps: [...TILL, 'Back to events'],
      viewports: SUB,
      group: 'business',
      note: 'Return to selling while a day is held on this device.'
    }
  }
});
const eventPage = view('bazaar', 'event', 'Event page', ['bazaar'], 'bazaar/event-page.tsx', {
  primary: true,
  path: '/bazaar',
  steps: [OPEN],
  controller: 'src/store/bazaar-days.ts'
});
state(eventPage, 'day-selling-elsewhere', {
  group: 'business',
  note: 'A day is open on another device.'
});
state(eventPage, 'day-planned-today', { config: PLANNED, viewports: SUB, group: 'business' });
state(eventPage, 'day-planned-not-today', {
  config: { bazaar: 'plannedTomorrow' },
  viewports: TWO,
  group: 'business'
});
state(eventPage, 'all-days-closed', {
  config: { bazaar: 'allClosed' },
  viewports: SUB,
  group: 'business'
});
state(eventPage, 'upcoming-no-days', {
  base: false,
  steps: ['Upcoming 1', /^Riverside Night Market/],
  viewports: SUB,
  group: 'business'
});
state(eventPage, 'finalized', {
  base: false,
  steps: ['Past 1', /^October Sample Weekend/],
  viewports: SUB,
  group: 'business'
});
state(eventPage, 'read-failure', {
  config: { rpcFail: { get_bazaar: 'down' } },
  viewports: TWO,
  group: 'failure'
});
state(eventPage, 'loading', {
  base: false,
  steps: [{ fail: { get_bazaar: 'never' } }, OPEN],
  viewports: TWO,
  group: 'failure'
});
state(events, 'detail-summary-loading', {
  config: { rpcFail: { get_bazaar: 'never' } },
  viewports: TWO,
  group: 'failure',
  note: 'The active row reads its figures from get_bazaar; that read never answers.'
});
const eventAdd = view('bazaar', 'event-add', 'Add event', ['event-edit'], 'bazaar/event-form.tsx', {
  path: '/bazaar',
  steps: ['Add an event'],
  controller: 'src/store/event-entry.ts'
});
state(eventAdd, 'form-untouched');
state(eventAdd, 'invalid-empty', { steps: ['Review event'], viewports: TWO });
state(eventAdd, 'review', {
  steps: [
    { fill: 'Name', value: 'Sample Holiday Fair' },
    { fill: 'Place', value: 'Demo Plaza' },
    { fill: 'First day', value: '2026-12-05' },
    { fill: 'Last day', value: '2026-12-06' },
    { fill: 'Stall rent', value: '1500' },
    'Review event'
  ]
});
state(eventAdd, 'date-order-invalid', {
  steps: [
    { fill: 'Name', value: 'Sample' },
    { fill: 'First day', value: '2026-12-06' },
    { fill: 'Last day', value: '2026-12-05' },
    'Review event'
  ],
  viewports: TWO
});
const eventEdit = view(
  'bazaar',
  'event-edit-list',
  'Edit or switch off events',
  ['event-edit'],
  'scheduled-events-form.tsx',
  { path: '/bazaar', steps: ['Edit or switch off events'] }
);
state(eventEdit, 'default');
const plan = view(
  'bazaar',
  'day-plan',
  'Plan a day',
  ['plan', 'plan-review'],
  'bazaar/day-plan.tsx',
  {
    path: '/bazaar',
    config: PLANNED,
    steps: [OPEN, 'Change the plan'],
    note: 'Saving a plan opens nothing, so the app has no Review page; starting the day asks first when the date is not today.'
  }
);
state(plan, 'change-existing');
state(plan, 'new-day', { config: {}, base: false, steps: [OPEN, /^Wed, 11 Nov/] });
state(plan, 'start-not-today-prompt', {
  config: { bazaar: 'plannedTomorrow' },
  base: false,
  steps: [OPEN, /Start the day|Start this day/],
  viewports: TWO,
  group: 'business',
  note: 'plan-review equivalent: the question asked before opening a day dated elsewhere.'
});
const till = view('bazaar', 'till', 'Sell at the bazaar (till)', ['till'], 'bazaar/till.tsx', {
  primary: true,
  path: '/bazaar',
  config: PLANNED,
  steps: TILL,
  controller: 'src/store/bazaar-days.ts',
  extraSources: [
    SRC + 'bazaar/till-card.tsx',
    SRC + 'bazaar/current-sale.tsx',
    SRC + 'bazaar/till-takings.tsx'
  ]
});
state(till, 'empty-cart', { group: 'data' });
state(till, 'height-constrained', { viewports: TIGHT, group: 'responsive' });
state(till, 'one-product', { steps: [P1], viewports: ALL });
state(till, 'several-products', { steps: [P1, P1, P2], viewports: SUB });
state(till, 'cash-handed-over', {
  steps: [P1, P2, /^Charge/, { fill: 'Cash handed over', value: '500' }],
  viewports: SUB
});
state(till, 'cash-too-little', {
  steps: [P1, P2, /^Charge/, { fill: 'Cash handed over', value: '100' }],
  viewports: TWO,
  group: 'interaction'
});
state(till, 'wallet-needs-reference', { steps: [P1, /^Charge/, /^GCash/], viewports: TWO });
state(till, 'discount-selected', { steps: [P1, P2, /^Charge/, '₱20 off'], viewports: TWO });
state(till, 'sale-acknowledged', {
  steps: [...SALE, { wait: 400 }],
  viewports: SUB,
  group: 'business'
});
state(till, 'freebie-recorded', {
  steps: [P1, { tryClick: /^Review sale/ }, 'Freebie', { wait: 400 }],
  viewports: TWO,
  group: 'business'
});
state(till, 'summary-collapsed', {
  steps: [...SALE, { wait: 400 }, /^Today's summary/],
  viewports: TWO
});
state(till, 'offline-indicator', {
  steps: [{ offline: true }, { fail: { '*': 'network' } }, { wait: 500 }],
  viewports: TWO,
  group: 'failure'
});
state(till, 'offline-toast-over-charge', {
  steps: [{ offline: true }, { fail: { '*': 'network' } }, { wait: 500 }, P1],
  viewports: ['p390', 't768'],
  group: 'failure',
  note: 'While the offline message shows, it sits on top of the Charge button at tablet width. Measured with elementFromPoint.'
});
state(till, 'offline-sale-queued', {
  steps: [{ offline: true }, { fail: { '*': 'network' } }, { wait: 6500 }, ...SALE, { wait: 600 }],
  viewports: SUB,
  group: 'business'
});
state(till, 'sale-refused-waiting', {
  steps: [{ fail: { record_event_sale: 'refused' } }, ...SALE, { wait: 800 }],
  viewports: TWO,
  group: 'failure',
  note: 'Stuck-sale display only. The simulated server refused this sale. Not a diagnosis of the real stuck sales.'
});
state(till, 'sale-server-error-waiting', {
  steps: [{ fail: { record_event_sale: 'down' } }, ...SALE, { wait: 800 }],
  viewports: TWO,
  group: 'failure',
  note: 'Stuck-sale display only. The simulated server was unreachable.'
});
state(till, 'reload-holds-day', {
  steps: [...SALE, { wait: 400 }, { reload: true }],
  viewports: TWO,
  group: 'failure'
});
state(till, 'sold-out-product', {
  steps: [{ setState: { eventStock: { dcf: 0, hc: 14, wcb: 10, pbm: 8 } } }],
  viewports: TWO,
  source: 'setState-injection',
  group: 'business',
  note: 'Stock injected to zero so the sold-out tile shows without 20 sales.'
});
state(till, 'reduced-motion', { motion: 'reduce', viewports: TWO, group: 'accessibility' });
state(till, 'reduced-transparency', { transparency: true, viewports: TWO, group: 'accessibility' });
state(till, 'review-sale-sheet', {
  steps: [P1, P2, { tryClick: /^Review sale/ }],
  viewports: ['p320', 'p390'],
  note: 'Phone only: the cart opens from the floating bar.'
});
state(till, 'pay-panel', {
  steps: [P1, P2, /^Charge/],
  viewports: ALL,
  note: 'The payment panel.'
});
state(till, 'playwright-webkit', {
  wait: 7000,
  engine: 'webkit',
  viewports: ['p390'],
  group: 'responsive',
  note: 'Playwright WebKit on Windows. Not Safari or an iPhone.'
});
state(till, 'focus-keyboard', {
  steps: [{ key: 'Tab', times: 8 }],
  viewports: ['d1440'],
  full: false
});
const classic = view(
  'bazaar',
  'classic-till',
  'Classic till (ported fallback)',
  ['classic-till'],
  'src/components/screens/bazaar-mode.tsx',
  {
    path: '/bazaar',
    config: PLANNED,
    steps: [...TILL, 'Till menu', 'Open Use the classic till'],
    oldScreen: true
  }
);
state(classic, 'default');
const receipt = view(
  'bazaar',
  'receipt',
  'Sale row and receipt',
  ['receipt'],
  'bazaar/till-takings.tsx',
  { path: '/bazaar', config: PLANNED, steps: [...TILL, ...SALE, { wait: 400 }, /^Sale 1/] }
);
state(receipt, 'default');
const voidPage = view('bazaar', 'void', 'Void a sale', ['void'], 'bazaar/till.tsx', {
  path: '/bazaar',
  config: PLANNED,
  steps: [...TILL, ...SALE, { wait: 400 }, /^Sale 1/, /[Vv]oid/]
});
state(voidPage, 'confirm');
state(voidPage, 'done', { steps: [/^(Void|Confirm)/], viewports: TWO, group: 'business' });
const closeForm = view(
  'bazaar',
  'close',
  'Close day: count and drawer',
  ['close', 'close-review'],
  'bazaar/close-form.tsx',
  {
    path: '/bazaar',
    config: PLANNED,
    steps: [...TILL, 'Close day'],
    extraSources: [SRC + 'bazaar/day-review.tsx']
  }
);
state(closeForm, 'untouched');
state(closeForm, 'cash-matches', {
  steps: [{ fill: 'Cash counted', value: '2000' }],
  viewports: TWO,
  group: 'business'
});
state(closeForm, 'cash-short', {
  steps: [{ fill: 'Cash counted', value: '1850' }],
  viewports: SUB,
  group: 'business'
});
state(closeForm, 'cash-over', {
  steps: [{ fill: 'Cash counted', value: '2150' }],
  viewports: TWO,
  group: 'business'
});
state(closeForm, 'closed-without-cash-typed', {
  steps: [{ tryClick: /^(Close the day|Close day)/ }],
  viewports: TWO,
  group: 'business',
  note: 'Close pressed with the form untouched: the app closed the day.'
});
state(closeForm, 'closed-short', {
  steps: [{ fill: 'Cash counted', value: '1850' }, { tryClick: /^(Close the day|Close day)/ }],
  viewports: TWO,
  group: 'business'
});
state(closeForm, 'unsent-sales-block', {
  steps: [],
  viewports: TWO,
  group: 'business',
  base: false,
  config: PLANNED,
  note: 'A refused sale still waits when the day is being closed.'
});
SCENARIOS[SCENARIOS.length - 1].steps = [
  ...TILL,
  { fail: { record_event_sale: 'down' } },
  ...SALE,
  { wait: 800 },
  'Close day'
];
const dayReview = view(
  'bazaar',
  'day-review',
  'Review of a closed day',
  ['close-review'],
  'bazaar/day-review.tsx',
  { path: '/bazaar', steps: [OPEN, 'See the review'] }
);
state(dayReview, 'closed-short');
const eventReview = view(
  'bazaar',
  'event-review',
  'Review and close the event',
  ['event-review'],
  'bazaar/close-event-sheet.tsx',
  {
    path: '/bazaar',
    config: { bazaar: 'allClosed' },
    steps: [OPEN, /^Close the event|^Review and close/]
  }
);
state(eventReview, 'ready');
const tools = view(
  'bazaar',
  'till-tools',
  'Add cookies, fees and losses',
  ['event-tools', 'event-tool-review'],
  'bazaar/till-bar.tsx',
  {
    path: '/bazaar',
    config: PLANNED,
    steps: TILL,
    note: 'No Review step exists; each entry can be removed from the same page (coverage.md: Partial).'
  }
);
state(tools, 'add-cookies', { steps: ['Add cookies'] });
state(tools, 'add-cookies-filled', {
  steps: ['Add cookies', { fill: 'How many', value: '6' }],
  viewports: TWO
});
state(tools, 'add-cookies-invalid', { steps: ['Add cookies', 'Add to the table'], viewports: TWO });
state(tools, 'fees', { steps: ['Fees and expenses'] });
state(tools, 'fees-invalid', { steps: ['Fees and expenses', 'Add the fee'], viewports: TWO });
const settingsTill = view(
  'bazaar',
  'selling-settings',
  'Selling settings and device',
  ['device-recovery', 'bazaar-settings'],
  'bazaar/till.tsx',
  { path: '/bazaar', config: PLANNED, steps: [...TILL, 'Till menu'] }
);
state(settingsTill, 'default');
const evSettings = view(
  'bazaar',
  'event-settings',
  'Bazaar settings (event)',
  ['bazaar-settings'],
  'bazaar/event-page.tsx',
  { path: '/bazaar', steps: [OPEN, 'Settings'] }
);
state(evSettings, 'default');
state(evSettings, 'fees', { steps: [/^Fees/], viewports: TWO });
state(evSettings, 'target', { steps: [/^Target profit/], viewports: TWO });
state(evSettings, 'cookie-cost', { steps: [/^Cost per cookie/], viewports: TWO });

// ------------------------------------------------ SELL
const orders = view('sell', 'orders', 'Orders', ['sell'], 'sell/orders-live.tsx', {
  primary: true,
  path: '/orders',
  controller: 'src/lib/data/staff-orders.ts'
});
state(orders, 'populated', { group: 'data' });
variants(orders, {
  fail: ['get_staff_orders'],
  states: {
    'one-order': { config: { data: 'one' }, viewports: TWO, group: 'data' },
    'filter-to-review': { steps: [/^To review/], viewports: TWO },
    'filter-paid': { steps: [/^Paid/], viewports: TWO },
    'filter-ready': { steps: [/^Ready for customer pickup/], viewports: TWO },
    'filter-closed': { steps: [/^Closed/], viewports: TWO },
    'search-result': {
      steps: [{ fillRole: 'searchbox', name: /Search orders/, value: 'Elsa' }],
      viewports: TWO
    },
    'search-no-match': {
      steps: [{ fillRole: 'searchbox', name: /Search orders/, value: 'zzzz' }],
      viewports: TWO
    },
    'mark-packed-pending': {
      steps: [{ fail: { record_pack: 'never' } }, 'Mark packed'],
      viewports: TWO,
      group: 'failure'
    },
    'mark-packed-refused': {
      steps: [{ fail: { record_pack: 'refused' } }, 'Mark packed', { wait: 300 }],
      viewports: TWO,
      group: 'failure'
    },
    'mark-packed-offline': {
      steps: [{ fail: { record_pack: 'network' } }, 'Mark packed', { wait: 300 }],
      viewports: TWO,
      group: 'failure'
    },
    'mark-packed-done': {
      steps: ['Mark packed', { wait: 300 }],
      viewports: TWO,
      group: 'business'
    },
    'reduced-motion': { motion: 'reduce', viewports: ['p390'], group: 'accessibility' }
  }
});
const order = view(
  'sell',
  'order',
  'Order detail',
  ['order', 'payment-review'],
  'sell/order-live.tsx',
  { path: '/orders', controller: 'src/lib/data/staff-orders.ts' }
);
const ORDER_STATES = [
  ['claimed-payment-review', 'Ana Placeholder', ALL],
  ['unpaid-awaiting', 'Ben Sample', SUB],
  ['confirmed-note-card', 'Carla Fictional', SUB],
  ['preparing-box', 'Dino Example', TWO],
  ['ready', 'Elsa Testcase', SUB],
  ['completed', 'Gina Notreal', TWO],
  ['cancelled', 'Hugo Invented', TWO],
  ['no-show', 'Iris Madeup', TWO],
  ['refunded', 'Jon Imaginary', TWO],
  ['item-unavailable', 'Kim Unreal', TWO],
  ['sampler-with-swap', 'Lia Dummy', TWO]
];
for (const [name, who, vps] of ORDER_STATES)
  state(order, name, { steps: [new RegExp('^' + who)], viewports: vps, group: 'business' });
state(order, 'view-proof', { steps: [/^Ana Placeholder/, 'View proof'], viewports: TWO });
state(order, 'ask-clearer-proof', {
  steps: [/^Ana Placeholder/, 'Ask for clearer proof'],
  viewports: TWO
});
state(order, 'rejected-at-once', {
  steps: [/^Ana Placeholder/, 'Reject'],
  viewports: TWO,
  note: 'Reject took effect on the first press, with no question first.'
});
state(order, 'ran-out', { steps: [/^Carla Fictional/, 'Ran out'], viewports: TWO });
state(order, 'extra-added', { steps: [/^Carla Fictional/, 'Extra'], viewports: TWO });
state(order, 'confirm-acknowledged', {
  steps: [/^Ana Placeholder/, 'Confirm payment', { wait: 400 }],
  viewports: SUB,
  group: 'business'
});
state(order, 'confirm-conflict', {
  steps: [
    /^Ana Placeholder/,
    { fail: { staff_confirm_payment: 'conflict' } },
    'Confirm payment',
    { wait: 400 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(order, 'confirm-rejected', {
  steps: [
    /^Ana Placeholder/,
    { fail: { staff_confirm_payment: 'refused' } },
    'Confirm payment',
    { wait: 400 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(order, 'confirm-unknown-outcome', {
  steps: [
    /^Ana Placeholder/,
    { fail: { staff_confirm_payment: 'network' } },
    'Confirm payment',
    { wait: 400 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(order, 'confirm-pending', {
  steps: [/^Ana Placeholder/, { fail: { staff_confirm_payment: 'never' } }, 'Confirm payment'],
  viewports: TWO,
  group: 'failure'
});
state(order, 'saved-refresh-failed', {
  steps: [
    /^Ana Placeholder/,
    { fail: { get_staff_orders: 'down' } },
    'Confirm payment',
    { wait: 500 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(order, 'record-unavailable', {
  steps: [
    /^Ana Placeholder/,
    { fail: { staff_confirm_payment: 'gone' } },
    'Confirm payment',
    { wait: 500 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(order, 'no-order-selected', {
  path: '/order',
  viewports: TWO,
  group: 'failure',
  note: 'Direct address with no order chosen: lands on Orders.'
});
const unavailable = view(
  'sell',
  'record-unavailable',
  'Record unavailable',
  ['record-unavailable'],
  'src/components/ui/owner-patterns.tsx',
  { path: '/orders', steps: [/^Ana Placeholder/] }
);
state(unavailable, 'order-id-unknown', {
  unverified:
    'Not reached: with an unknown order id the engine returned to Orders, and an order removed while open stayed on screen. The component exists, but no path to it was found.',
  base: false,
  path: '/orders',
  steps: [
    { setState: { orderId: 'HC-9999' } },
    { inject: () => window.__hcOps.go('order'), wait: 500 }
  ],
  viewports: TWO,
  group: 'failure',
  source: 'setState-injection',
  note: 'The order id is injected through the test bridge. Reaching this from the real interface was not observed: an order removed while open stayed on screen after a reload of the orders.'
});
const orderRefund = view(
  'sell',
  'order-refund',
  'Record refund',
  ['order-action'],
  'settings-pages.tsx',
  { path: '/orders', steps: [/^Carla Fictional/, /^Refund and cancel/] }
);
state(orderRefund, 'form-untouched');
state(orderRefund, 'submitted-empty-reference', {
  steps: ['Record refund and cancel'],
  viewports: TWO,
  note: 'Pressed with the reference empty: the client sent the request.'
});
state(orderRefund, 'filled', {
  steps: [{ fill: 'Refund reference', value: 'FAKEREFUND-1103' }],
  viewports: TWO
});
const orderOther = view(
  'sell',
  'order-actions',
  'No-show and swap',
  ['order-action'],
  'settings-pages.tsx',
  { path: '/orders' }
);
state(orderOther, 'no-show-from-ready', {
  steps: [/^Elsa Testcase/, /[Nn]o-show/],
  viewports: TWO
});
state(orderOther, 'swap-from-paid', {
  steps: [/^Carla Fictional/, 'Ran out', { tryClick: /[Ss]wap/ }],
  viewports: TWO
});
const pay = view(
  'sell',
  'payments',
  'Payments reconciliation',
  ['payment-review'],
  'sell/payments-live.tsx',
  { primary: true, path: '/reconcile' }
);
state(pay, 'populated', { group: 'data' });
variants(pay, {
  fail: ['get_staff_orders'],
  skip: ['many', 'long-text', 'large-values'],
  states: { 'all-ticked': { steps: ['Tick all'], viewports: TWO } }
});
const customers = view(
  'sell',
  'customers',
  'Customers/Waitlist',
  ['customers'],
  'sell/customers-live.tsx',
  {
    primary: true,
    path: '/orders',
    steps: ['Customers/Waitlist'],
    controller: 'src/store/customer-desk.ts'
  }
);
state(customers, 'populated', { group: 'data' });
state(customers, 'empty', { config: { data: 'empty' }, viewports: TWO, group: 'data' });
state(customers, 'many', { config: { data: 'many' }, viewports: TWO, group: 'data' });
const custDetail = view(
  'sell',
  'customer-detail',
  'Customer detail',
  ['customer-detail'],
  'sell/customers-live.tsx',
  { path: '/orders', steps: ['Customers/Waitlist', 'Open customer Ana Placeholder'] }
);
state(custDetail, 'default');
const custMsg = view(
  'sell',
  'customer-message',
  'Message a customer',
  ['customer-message'],
  'sell/customers-live.tsx',
  { path: '/orders', steps: ['Customers/Waitlist', 'Open customer Ana Placeholder'] }
);
state(custMsg, 'open', { steps: [/[Mm]essage/] });
const custRemove = view(
  'sell',
  'contact-remove',
  'Remove contact details',
  ['contact-remove'],
  'sell/customers-live.tsx',
  { path: '/orders', steps: ['Customers/Waitlist', 'Open customer Ana Placeholder'] }
);
state(custRemove, 'prompt', { steps: [/[Rr]emove/] });
const orderMsgs = view(
  'sell',
  'order-messages',
  'Customer messages (ready to copy)',
  [],
  'order-messages.tsx',
  { path: '/orders', steps: ['Customer messages'], discovered: true }
);
state(orderMsgs, 'default');

// ------------------------------------------------ SHOP (owner)
const shopHub = view('shop', 'shop', 'Shop', ['shop'], 'sell/shop-live.tsx', {
  primary: true,
  path: '/drops'
});
state(shopHub, 'populated', { group: 'data' });
variants(shopHub, {
  fail: ['get_shop_status'],
  skip: ['many', 'long-text', 'large-values'],
  states: {
    'closed-override': { config: { shopOverride: 'closed' }, viewports: TWO, group: 'business' }
  }
});
const shopChild = (id, title, refs, src, label, extra = {}) => {
  const v = view('shop', id, title, refs, src, { path: '/drops', steps: [label], ...extra });
  state(v, 'default');
  return v;
};
const shopStatus = shopChild(
  'shop-status',
  'Shop status',
  ['shop-status'],
  'sell/shop-live.tsx',
  'Open Shop status'
);
state(shopStatus, 'forced-closed', {
  config: { shopOverride: 'closed' },
  viewports: TWO,
  group: 'business'
});
const rules = shopChild(
  'order-rules',
  'Order rules',
  ['order-rules'],
  'order-rules-form.tsx',
  'Open Order rules'
);
state(rules, 'read-failure', {
  note: 'The form does not open: the page falls back to the Shop hub, with no message on the page.',
  config: { rpcFail: { get_order_rules: 'down' } },
  viewports: TWO,
  group: 'failure'
});
state(rules, 'save-conflict', {
  steps: [{ fail: { save_order_rules: 'conflict' } }, { tryClick: /^Save/ }],
  viewports: TWO,
  group: 'failure'
});
const boxes = shopChild(
  'boxes',
  'Boxes & add-ons',
  ['boxes'],
  'order-extras-form.tsx',
  'Open Boxes & add-ons'
);
state(boxes, 'add-on-added', { steps: ['Add add-on'], viewports: TWO });
state(boxes, 'read-failure', {
  note: 'The form does not open: the page falls back to the Shop hub, with no message on the page.',
  config: { rpcFail: { get_order_extras: 'down' } },
  viewports: TWO,
  group: 'failure'
});
const methods = shopChild(
  'payment-methods',
  'Payment methods',
  ['payment-methods'],
  'payment-forms.tsx',
  'Open Payment methods'
);
state(methods, 'empty', { config: { data: 'empty' }, viewports: TWO, group: 'data' });
const methodEdit = view(
  'shop',
  'payment-method-edit',
  'Add or edit a payment method',
  ['payment-method-edit'],
  'payment-forms.tsx',
  { path: '/drops', steps: ['Open Payment methods'] }
);
state(methodEdit, 'add-new', { steps: ['Add a payment method'] });
state(methodEdit, 'edit-existing', { steps: [/^(Edit|GCash)/] });
state(methodEdit, 'invalid', {
  steps: ['Add a payment method', { tryClick: /^Save/ }],
  viewports: TWO
});
shopChild(
  'shop-text',
  'Shop details & messages',
  ['shop-text'],
  'payment-forms.tsx',
  'Open Shop details & messages'
);
const sched = shopChild(
  'shop-schedule',
  'Opening schedule & drop',
  ['shop-schedule'],
  'sell/shop-live.tsx',
  'Open Opening schedule & drop'
);
void sched;

// ------------------------------------------------ SHOP (customer-facing, locked ported screens)
const custBase = { config: { session: false }, role: 'public', oldScreen: true };
const cShop = view(
  'shop',
  'customer-shop',
  'Customer shop',
  ['customer-shop'],
  'src/components/screens/shop.tsx',
  { primary: true, path: '/shop', ...custBase, extraSources: [SRC + 'live-shop-footer.tsx'] }
);
state(cShop, 'populated', { group: 'data' });
state(cShop, 'empty-menu', {
  config: { session: false, data: 'empty' },
  viewports: TWO,
  group: 'data'
});
state(cShop, 'long-text', {
  config: { session: false, data: 'long' },
  viewports: TWO,
  group: 'data'
});
state(cShop, 'quantities-added', {
  steps: [
    { click: 'Add one', idx: 0 },
    { click: 'Add one', idx: 0 },
    { click: 'Add one', idx: 1 }
  ],
  viewports: SUB
});
state(cShop, 'shop-closed', {
  config: { session: false, shopOverride: 'closed' },
  viewports: TWO,
  group: 'business'
});
state(cShop, 'read-failure', {
  config: { session: false, rpcFail: { shop_products: 'down', get_shop_status: 'down' } },
  viewports: TWO,
  group: 'failure'
});
state(cShop, 'waiting-list', { steps: ['Join the waiting list'], viewports: TWO });
const cLookup = view(
  'shop',
  'customer-lookup',
  'Find my order',
  [],
  'src/components/screens/find-my-order.tsx',
  { primary: true, path: '/lookup', ...custBase, discovered: true }
);
state(cLookup, 'untouched');
state(cLookup, 'not-found', { steps: [{ fillAll: true }, /^Find/], viewports: TWO });
const cCheckout = view(
  'shop',
  'customer-checkout',
  'Customer checkout',
  ['customer-checkout'],
  'src/components/screens/checkout.tsx',
  {
    primary: true,
    path: '/checkout',
    ...custBase,
    extraSources: [SRC + 'live-checkout.tsx'],
    steps: []
  }
);
state(cCheckout, 'direct-address', {
  group: 'data',
  note: 'Opened by address, with no box chosen.'
});
state(cCheckout, 'from-shop', {
  path: '/shop',
  steps: [
    { click: 'Add one', idx: 0 },
    { click: 'Add one', idx: 0 },
    { click: 'Add one', idx: 0 },
    { click: 'Add one', idx: 1 },
    { click: 'Add one', idx: 1 },
    { click: 'Add one', idx: 1 },
    /^(Checkout|Continue|Next|Review|Order)/
  ],
  viewports: SUB
});
const cStatus = view(
  'shop',
  'customer-status',
  'Customer order status',
  ['customer-status'],
  'src/components/screens/order-status.tsx',
  { primary: true, path: '/status', ...custBase, steps: [] }
);
const TOK = (n) => String(n).repeat(16);
for (const [nm, id] of [
  ['awaiting-payment-claimed', 1101],
  ['awaiting-payment-unpaid', 1102],
  ['confirmed', 1103],
  ['preparing', 1104],
  ['ready', 1105],
  ['completed', 1107],
  ['cancelled', 1108],
  ['no-show', 1109]
])
  state(cStatus, nm, {
    path: `/status#t=${TOK(id)}`,
    viewports: nm === 'ready' ? ALL : TWO,
    group: 'business'
  });
state(cStatus, 'unknown-link', {
  path: `/status#t=${'f'.repeat(64)}`,
  viewports: TWO,
  group: 'failure'
});
state(cStatus, 'no-link', { path: '/status', viewports: TWO, group: 'failure' });
state(cStatus, 'read-failure', {
  path: `/status#t=${TOK(1101)}`,
  config: { session: false, rpcFail: { order_status: 'down' } },
  viewports: TWO,
  group: 'failure'
});

// ------------------------------------------------ MAKE
const R1 = 'Recipe for Double Chocolate Fudge';
const products = view('make', 'products', 'Products', ['make'], 'recipes/products-live.tsx', {
  primary: true,
  path: '/products',
  controller: 'src/store/make-desk.ts'
});
state(products, 'populated', { group: 'data' });
variants(products, {
  fail: ['get_flavours', 'get_recipes'],
  states: {
    'filter-all': { steps: ['All products'], viewports: TWO },
    'filter-needs-recipe': { steps: ['Needs recipe'], viewports: TWO, group: 'business' },
    'taken-off-order-form': {
      steps: [/^Take Double Chocolate Fudge off/, { wait: 300 }],
      viewports: TWO
    }
  }
});
const pEdit = view('make', 'product-edit', 'Edit product', ['product-edit'], 'live-form-host.tsx', {
  path: '/products',
  steps: ['Edit product Double Chocolate Fudge']
});
state(pEdit, 'default');
state(pEdit, 'save-failure', {
  steps: [{ fail: { save_flavour: 'down' } }, { tryClick: /^Save/ }, { wait: 300 }],
  viewports: TWO,
  group: 'failure'
});
const pNew = view('make', 'new-product', 'Add product', ['new-product'], 'live-form-host.tsx', {
  path: '/products',
  steps: ['Add product']
});
state(pNew, 'form-untouched');
state(pNew, 'invalid', { steps: [{ tryClick: /^Save/ }], viewports: TWO });
const drafts = view(
  'make',
  'recipe-drafts',
  'Recipe drafts',
  ['recipe-drafts'],
  'recipe-drafts-form.tsx',
  { path: '/products', steps: ['Recipe drafts'] }
);
state(drafts, 'list');
state(drafts, 'open-draft', { steps: [/^ube coconut crinkle/i], viewports: TWO });
state(drafts, 'new-draft', { steps: [/^double chocolate fudge/i], viewports: TWO });
const recipe = view('make', 'recipe', 'Recipe page', ['recipe'], 'recipes/recipe-reader.tsx', {
  primary: true,
  path: '/products',
  steps: [R1],
  controller: 'src/store/recipe-book.ts',
  extraSources: ['src/lib/recipes/batch.ts']
});
state(recipe, 'default', { group: 'data' });
state(recipe, 'scaled-half', { steps: [{ fill: 'Cookies to make', value: '6' }], viewports: TWO });
state(recipe, 'scaled-large-shortage', {
  steps: [{ fill: 'Cookies to make', value: '96' }],
  viewports: SUB,
  group: 'business'
});
state(recipe, 'ingredients-ticked', { steps: [{ check: 'All-purpose flour' }], viewports: TWO });
state(recipe, 'no-recipe-yet', {
  base: false,
  steps: ['Needs recipe', 'Recipe for Ube Coconut Crinkle'],
  viewports: TWO,
  group: 'business'
});
state(recipe, 'read-failure', {
  config: { rpcFail: { get_recipes: 'down' } },
  viewports: TWO,
  group: 'failure'
});
const flavour = view(
  'make',
  'flavour-cost',
  'Cost, history & edit',
  ['cost-edit', 'cost-review'],
  'recipes/flavour-page.tsx',
  { path: '/products', steps: [R1, 'Cost, history & edit'] }
);
state(flavour, 'default');
state(flavour, 'cost-typed', {
  steps: [{ fillRole: 'textbox', name: /Cost per cookie/, value: '55' }],
  viewports: TWO
});
state(flavour, 'cost-review', {
  steps: [{ fillRole: 'textbox', name: /Cost per cookie/, value: '55' }, 'Review the cost'],
  viewports: SUB
});
state(flavour, 'cost-saved', {
  steps: [
    { fillRole: 'textbox', name: /Cost per cookie/, value: '55' },
    'Review the cost',
    'Save the cost',
    { wait: 300 }
  ],
  viewports: TWO,
  group: 'business'
});
state(flavour, 'incomplete-cost', {
  base: false,
  steps: ['Recipe for Happy Camper', 'Cost, history & edit'],
  viewports: TWO,
  group: 'business',
  note: 'Recipe cost is incomplete because one ingredient has no cost.'
});
const recEdit = view(
  'make',
  'recipe-edit',
  'Edit recipe',
  ['recipe-edit', 'recipe-review'],
  'recipes/recipe-editor.tsx',
  { path: '/products', steps: [R1, 'Cost, history & edit', 'Edit recipe'] }
);
state(recEdit, 'default');
state(recEdit, 'line-changed', { steps: [{ fill: 'Quantity', value: '260' }], viewports: TWO });
state(recEdit, 'review', {
  steps: [{ fill: 'Quantity', value: '260' }, 'Review recipe'],
  viewports: SUB
});
state(recEdit, 'line-added', { steps: ['Add ingredient'], viewports: TWO });
state(recEdit, 'saved-new-version', {
  steps: [{ fill: 'Quantity', value: '260' }, 'Review recipe', /^(Save|Confirm)/, { wait: 300 }],
  viewports: TWO,
  group: 'business'
});
state(recEdit, 'save-failure', {
  steps: [
    { fail: { save_recipe: 'down' } },
    { fill: 'Quantity', value: '260' },
    'Review recipe',
    /^(Save|Confirm)/,
    { wait: 300 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(recEdit, 'save-conflict', {
  steps: [
    { fail: { save_recipe: 'conflict' } },
    { fill: 'Quantity', value: '260' },
    'Review recipe',
    /^(Save|Confirm)/,
    { wait: 300 }
  ],
  viewports: TWO,
  group: 'failure'
});
const book = view('make', 'recipe-book', 'Recipe book', [], 'recipes/recipe-book.tsx', {
  primary: true,
  path: '/recipes',
  discovered: true
});
state(book, 'populated', { group: 'data' });
variants(book, { fail: ['get_recipes'], skip: ['many', 'large-values'] });
const prod = view(
  'make',
  'production',
  'Production',
  ['production'],
  'production/production-live.tsx',
  {
    primary: true,
    path: '/bake',
    controller: 'src/lib/production/workspace.ts',
    extraSources: [
      SRC + 'production/production-results.tsx',
      SRC + 'production/production-dough.tsx'
    ]
  }
);
state(prod, 'populated', { group: 'data' });
variants(prod, {
  fail: ['get_production'],
  skip: ['many', 'large-values'],
  states: {
    'two-jobs-in-progress': {
      steps: [
        { click: 'Mix', idx: 0 },
        { key: 'Escape' },
        { tryClick: 'Leave for now' },
        { click: 'Mix', idx: 0 },
        { tryClick: 'Leave for now' }
      ],
      viewports: TWO,
      group: 'business'
    },
    'reduced-motion': { motion: 'reduce', viewports: ['p390'], group: 'accessibility' }
  }
});
const prodStart = view(
  'make',
  'production-entry',
  'Start production',
  ['production-entry', 'production-review'],
  'production/production-start.tsx',
  {
    path: '/bake',
    steps: ['Start production'],
    extraSources: [SRC + 'production/production-plan-entry.tsx']
  }
);
state(prodStart, 'nothing-selected');
state(prodStart, 'two-products-selected', {
  steps: [{ check: 'Double Chocolate Fudge' }, { check: 'Happy Camper' }],
  viewports: SUB
});
state(prodStart, 'review', {
  steps: [{ check: 'Double Chocolate Fudge' }, /^Review \d/],
  viewports: SUB
});
state(prodStart, 'started', {
  steps: [{ check: 'Double Chocolate Fudge' }, /^Review \d/, /^Start \d/, { wait: 300 }],
  viewports: TWO,
  group: 'business'
});
const batch = view(
  'make',
  'batch-focus',
  'Cookies made (bake entry)',
  ['production-review'],
  'production/production-focus-live.tsx',
  { primary: true, path: '/bake', steps: ['Bake 3'] }
);
state(batch, 'untouched');
state(batch, 'invalid', { steps: ['Review production'], viewports: TWO });
state(batch, 'filled', {
  steps: [
    { fill: 'Cookies made', value: '12' },
    { fill: 'Rejects', value: '1' }
  ],
  viewports: TWO
});
state(batch, 'review', {
  steps: [
    { fill: 'Cookies made', value: '12' },
    { fill: 'Rejects', value: '1' },
    'Review production'
  ],
  viewports: SUB
});
state(batch, 'save-acknowledged', {
  steps: [
    { fill: 'Cookies made', value: '12' },
    { fill: 'Rejects', value: '1' },
    'Review production',
    /^(Save|Confirm|Record)/,
    { wait: 400 }
  ],
  viewports: TWO,
  group: 'business'
});
state(batch, 'save-failed', {
  steps: [
    { fail: { record_production: 'down' } },
    { fill: 'Cookies made', value: '12' },
    { fill: 'Rejects', value: '1' },
    'Review production',
    /^(Save|Confirm|Record)/,
    { wait: 400 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(batch, 'direct-no-batch', {
  note: '',
  base: false,
  path: '/batch',
  viewports: TWO,
  group: 'failure',
  note: 'Direct address with no batch open.'
});
const dough = view(
  'make',
  'dough-prepare',
  'Prepare dough',
  ['production-entry'],
  'production/production-dough.tsx',
  {
    path: '/bake',
    steps: [{ click: 'Mix', idx: 0 }],
    note: 'Newly separated recipe amount from actual dough balls at this commit.'
  }
);
state(dough, 'sheet-untouched');
state(dough, 'half-recipe', { steps: ['Half recipe'], viewports: TWO, group: 'business' });
state(dough, 'review', {
  steps: [{ fill: 'Actual dough balls', value: '12' }, 'Review dough'],
  viewports: SUB
});
state(dough, 'confirmed', {
  steps: [
    { fill: 'Actual dough balls', value: '12' },
    'Review dough',
    'Confirm dough',
    { wait: 300 }
  ],
  viewports: TWO,
  group: 'business'
});
state(dough, 'confirm-failed', {
  steps: [
    { fail: { record_dough_preparation: 'network' } },
    { fill: 'Actual dough balls', value: '12' },
    'Review dough',
    'Confirm dough',
    { wait: 300 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(dough, 'invalid', { steps: ['Review dough'], viewports: TWO });
const makeSet = view(
  'make',
  'make-settings',
  'Make settings',
  ['make-settings'],
  'account/settings-areas.tsx',
  { path: '/products', steps: ['Settings'] }
);
state(makeSet, 'default');
const rulesPage = view('make', 'rules', 'Rules (kitchen)', [], 'settings-pages.tsx', {
  path: '/products',
  steps: ['Settings', 'Open Dough rest window'],
  discovered: true
});
state(rulesPage, 'default');
const menu = view('make', 'menu-flavours', 'Menu & flavours', [], 'live-form-host.tsx', {
  path: '/products',
  steps: ['Settings', 'Open Menu & flavours'],
  discovered: true
});
state(menu, 'default');

// ------------------------------------------------ STOCK
const F = /^All-purpose flour/;
const inv = view('stock', 'inventory', 'Inventory', ['stock'], 'stock/inventory-live.tsx', {
  primary: true,
  path: '/inventory',
  controller: 'src/store/stock-entries.ts'
});
state(inv, 'populated', { group: 'data' });
variants(inv, {
  fail: ['get_stock_catalogue'],
  states: {
    'packaging-tab': { steps: ['Packaging'], viewports: TWO },
    'dough-tab': { steps: ['Dough in the fridge'], viewports: TWO, group: 'business' },
    'baked-tab': { steps: ['Baked cookies'], viewports: TWO, group: 'business' },
    'filter-low': { steps: [{ select: 'Stock status', value: { label: 'Low' } }], viewports: TWO },
    'filter-out': { steps: [{ select: 'Stock status', value: { label: 'Out' } }], viewports: TWO },
    'dough-tab-empty': {
      config: { data: 'empty' },
      steps: ['Dough in the fridge'],
      viewports: TWO,
      group: 'data'
    }
  }
});
const itemV = view('stock', 'item', 'Stock item', ['item'], 'stock/inventory-live.tsx', {
  primary: true,
  path: '/inventory',
  steps: [F]
});
state(itemV, 'with-history', { group: 'data' });
state(itemV, 'zero-confirmed', {
  base: false,
  steps: [/^Brown sugar/],
  viewports: TWO,
  group: 'business',
  note: 'Counted and confirmed zero.'
});
state(itemV, 'never-counted', {
  base: false,
  steps: ['Packaging', /^Brand sticker/],
  viewports: TWO,
  group: 'business',
  note: 'Zero recorded, never counted: must differ from confirmed zero.'
});
state(itemV, 'history-failed', {
  config: { rpcFail: { get_item_movements: 'down' } },
  viewports: TWO,
  group: 'failure'
});
const itemForm = view(
  'stock',
  'item-form',
  'New item and edit item',
  ['item-edit', 'new-item'],
  'stock-items-form.tsx',
  { path: '/inventory' }
);
state(itemForm, 'new-untouched', { steps: ['New item'] });
state(itemForm, 'new-invalid', { steps: ['New item', { tryClick: /^Save/ }], viewports: TWO });
state(itemForm, 'edit', { steps: [F, 'Edit item'] });
state(itemForm, 'save-conflict', {
  steps: [
    F,
    'Edit item',
    { fail: { save_stock_item: 'conflict' } },
    { tryClick: /^Save/ },
    { wait: 300 }
  ],
  viewports: TWO,
  group: 'failure'
});
const receive = view(
  'stock',
  'receive',
  'Add to inventory (receive)',
  ['receive', 'receive-review'],
  'stock/stock-entry-live.tsx',
  { path: '/inventory', steps: ['Add to inventory'], controller: 'src/store/stock-entries.ts' }
);
state(receive, 'untouched');
state(receive, 'invalid', { steps: ['Review'], viewports: TWO });
state(receive, 'two-items', { steps: ['Add another item'], viewports: TWO });
const FILL_RECEIVE = [
  { select: 'Item', value: { index: 1 } },
  { fill: 'Packs received', value: '2' },
  { fill: 'Total paid', value: '160' }
];
state(receive, 'filled', { steps: FILL_RECEIVE, viewports: TWO });
state(receive, 'review', { steps: [...FILL_RECEIVE, 'Review'] });
state(receive, 'saved', {
  steps: [...FILL_RECEIVE, 'Review', /^(Save|Confirm|Add)/, { wait: 400 }],
  viewports: TWO,
  group: 'business'
});
state(receive, 'save-failed', {
  steps: [
    { fail: { record_stock_movement: 'down' } },
    ...FILL_RECEIVE,
    'Review',
    /^(Save|Confirm|Add)/,
    { wait: 400 }
  ],
  viewports: TWO,
  group: 'failure'
});
const count = view(
  'stock',
  'count',
  'Count inventory',
  ['count', 'count-review'],
  'stock/count-inventory.tsx',
  { path: '/inventory', steps: ['Count stock'] }
);
state(count, 'untouched');
state(count, 'one-entered', {
  steps: [{ fill: 'Counted quantity', value: '1750' }],
  viewports: TWO
});
state(count, 'review', { steps: [{ fill: 'Counted quantity', value: '1750' }, 'Review count'] });
state(count, 'cancel-prompt', {
  steps: [{ fill: 'Counted quantity', value: '1750' }, 'Cancel count'],
  viewports: TWO
});
state(count, 'reload-keeps-draft', {
  steps: [{ fill: 'Counted quantity', value: '1750' }, { wait: 300 }, { reload: true }],
  viewports: TWO,
  group: 'failure'
});
state(count, 'saved', {
  steps: [
    { fill: 'Counted quantity', value: '1750' },
    'Review count',
    /^(Save|Confirm)/,
    { wait: 400 }
  ],
  viewports: TWO,
  group: 'business'
});
const adjust = view(
  'stock',
  'adjust',
  'Waste / correction',
  ['adjust', 'adjust-review'],
  'stock/stock-entry-live.tsx',
  { path: '/inventory', steps: [F, 'Waste / correction'] }
);
state(adjust, 'untouched');
state(adjust, 'invalid', { steps: [/^Review/], viewports: TWO });
state(adjust, 'review', { steps: [{ fillAll: true }, /^Review/], viewports: SUB });
const shop2 = view('stock', 'shopping', 'Shopping', ['shopping'], 'stock/grocery-live.tsx', {
  primary: true,
  path: '/grocery'
});
state(shop2, 'populated', { group: 'data' });
variants(shop2, {
  fail: ['get_stock_catalogue'],
  skip: ['large-values'],
  states: {
    'receive-from-shopping': { steps: ['Add to inventory: Brand sticker'], viewports: TWO },
    'compare-from-shopping': { steps: ['Compare prices for Brown sugar'], viewports: TWO }
  }
});
const bakeNeeds = view(
  'stock',
  'bake-needs',
  'Planned bake',
  ['bake-needs'],
  'stock/bake-plan-live.tsx',
  { path: '/grocery', steps: ['Plan a bake'], controller: 'src/store/bake-plan.ts' }
);
state(bakeNeeds, 'default');
state(bakeNeeds, 'plan-entered', {
  steps: [
    { select: 'Product', value: { index: 1 } },
    { fill: 'Cookies planned', value: '48' }
  ],
  viewports: TWO,
  group: 'business'
});
state(bakeNeeds, 'plan-used', {
  steps: [
    { select: 'Product', value: { index: 1 } },
    { fill: 'Cookies planned', value: '48' },
    'Use this plan',
    { wait: 300 }
  ],
  viewports: SUB,
  group: 'business'
});
const sups = view('stock', 'suppliers', 'Suppliers', ['suppliers'], 'stock/suppliers-live.tsx', {
  primary: true,
  path: '/suppliers'
});
state(sups, 'populated', { group: 'data' });
variants(sups, {
  fail: ['get_stock_catalogue'],
  skip: ['many', 'large-values'],
  states: { 'inactive-shown': { steps: [{ check: 'Show inactive suppliers' }], viewports: TWO } }
});
const sup = view('stock', 'supplier', 'Supplier', ['supplier'], 'stock/suppliers-live.tsx', {
  path: '/suppliers',
  steps: [/^Baking Supply Co/]
});
state(sup, 'default');
const supEdit = view(
  'stock',
  'supplier-edit',
  'Add or edit supplier',
  ['supplier-edit'],
  'stock-suppliers-form.tsx',
  { path: '/suppliers' }
);
state(supEdit, 'add-untouched', { steps: ['Add supplier'] });
state(supEdit, 'add-invalid', { steps: ['Add supplier', 'Save'], viewports: TWO });
state(supEdit, 'edit-existing', { steps: [/^Baking Supply Co/, 'Edit supplier'] });
state(supEdit, 'saved', {
  steps: ['Add supplier', { fill: 'Name', value: 'New Sample Supplier' }, 'Save', { wait: 400 }],
  viewports: TWO,
  group: 'business'
});
const prices = view(
  'stock',
  'purchase-prices',
  'Supplier prices & history',
  ['purchase-prices'],
  'stock/item-prices.tsx',
  { path: '/inventory', steps: [F, 'Supplier prices & history'] }
);
state(prices, 'compare');
state(prices, 'no-prices', {
  base: false,
  steps: [/^Cocoa powder/, 'Supplier prices & history'],
  viewports: TWO,
  group: 'data'
});
const priceEdit = view(
  'stock',
  'supplier-price-edit',
  'Edit a supplier price',
  ['supplier-price-edit'],
  'stock-suppliers-form.tsx',
  { path: '/inventory', steps: [F, 'Supplier prices & history'] }
);
state(priceEdit, 'open', { steps: ['Edit price'] });
state(priceEdit, 'add-price', { steps: ['Add price'], viewports: TWO });
state(priceEdit, 'conflict', {
  steps: [
    { fail: { save_supplier_price: 'conflict' } },
    'Edit price',
    { tryClick: /^(Review|Save)/ },
    { tryClick: /^Save/ },
    { wait: 300 }
  ],
  viewports: TWO,
  group: 'failure'
});
const stockSet = view(
  'stock',
  'stock-settings',
  'Stock settings',
  ['stock-settings'],
  'account/settings-areas.tsx',
  { path: '/inventory', steps: ['Settings'] }
);
state(stockSet, 'default');
const stockItems = view(
  'stock',
  'tracked-items',
  'Stock items (tracked items)',
  [],
  'stock-items-form.tsx',
  { path: '/inventory', steps: ['Settings', 'Open Manage inventory items'], discovered: true }
);
state(stockItems, 'default');

// ------------------------------------------------ MONEY
const money = view('money', 'money', 'Money', ['money'], 'money/money-live.tsx', {
  primary: true,
  path: '/pnl',
  controller: 'src/store/money-desk.ts'
});
state(money, 'populated', { group: 'data' });
variants(money, {
  fail: ['get_books'],
  skip: ['many'],
  states: {
    'last-7-days': { steps: ['Last 7 days'], viewports: TWO },
    'last-30-days': { steps: ['Last 30 days'], viewports: TWO },
    'income-only': { steps: ['Income'], viewports: TWO },
    'expenses-only': { steps: ['Expenses'], viewports: TWO },
    'category-opened': { steps: [/^Ingredients \d/], viewports: TWO },
    'export-clicked': {
      steps: ['Export this period (CSV)'],
      viewports: ['d1440'],
      note: 'The browser download itself is not inspected.'
    },
    'reduced-transparency': { transparency: true, viewports: ['p390'], group: 'accessibility' }
  }
});
const moneyEntry = view(
  'money',
  'expense',
  'Record expense',
  ['money-entry', 'money-review'],
  'money/money-pages.tsx',
  { path: '/pnl', steps: ['Record expense'], controller: 'src/store/money-entry.ts' }
);
state(moneyEntry, 'untouched');
state(moneyEntry, 'invalid', { steps: ['Review transaction'], viewports: TWO });
const FILL_EXP = [
  { fill: 'Description', value: 'Sample delivery fee' },
  { fill: 'Amount', value: '250' },
  { select: 'Category', value: { index: 1 } }
];
state(moneyEntry, 'review', { steps: [...FILL_EXP, 'Review transaction'] });
state(moneyEntry, 'saved', {
  steps: [...FILL_EXP, 'Review transaction', /^(Save|Record|Confirm)/, { wait: 400 }],
  viewports: TWO,
  group: 'business'
});
state(moneyEntry, 'save-failed', {
  steps: [
    { fail: { record_expense: 'down' } },
    ...FILL_EXP,
    'Review transaction',
    /^(Save|Record|Confirm)/,
    { wait: 400 }
  ],
  viewports: TWO,
  group: 'failure'
});
const draw = view(
  'money',
  'owner-draw',
  'Record owner draw',
  ['money-entry', 'money-review'],
  'money/money-pages.tsx',
  { path: '/pnl', steps: ['Record owner draw'] }
);
state(draw, 'untouched');
state(draw, 'review', { steps: [{ fill: 'Amount', value: '500' }, /^Review/], viewports: TWO });
const tx = view('money', 'transaction', 'Transaction', ['transaction'], 'money/money-pages.tsx', {
  path: '/pnl'
});
state(tx, 'income', { steps: [/^Harbor Street Fair, day 1/] });
state(tx, 'expense', { steps: [/^Flour, butter and chocolate/], viewports: TWO });
state(tx, 'owner-draw', { steps: [/^Owner draw/], viewports: TWO });
state(tx, 'refund', { steps: [/^Refund, order/], viewports: TWO });
const monSet = view(
  'money',
  'money-settings',
  'Money settings',
  ['money-settings'],
  'money/money-pages.tsx',
  { path: '/pnl', steps: ['Settings'] }
);
state(monSet, 'default');
const cats = view(
  'money',
  'money-categories',
  'Expense categories',
  ['money-categories'],
  'money/money-pages.tsx',
  { path: '/pnl', steps: ['Settings', { click: 'Open', idx: 1 }] }
);
state(cats, 'default');
const bookRules = view('money', 'book-rules', 'Books & costs', ['book-rules'], 'books-form.tsx', {
  path: '/pnl',
  steps: ['Settings', 'Open'],
  extraSources: [SRC + 'settings-pages.tsx']
});
state(bookRules, 'default');
state(bookRules, 'correction-filled', {
  steps: [
    { select: 'Delivery', value: { index: 0 } },
    { fill: 'What it really cost', value: '410' }
  ],
  viewports: TWO,
  group: 'interaction'
});
const moneyRules = view(
  'money',
  'money-rules',
  'Rules (from Money area)',
  [],
  'settings-pages.tsx',
  { path: '/settings', steps: ['Open Money settings', 'Open Tax set-aside'], discovered: true }
);
state(moneyRules, 'default');
state(monSet, 'cost-of-flavour', {
  steps: ['View cost of Double Chocolate Fudge'],
  viewports: TWO
});
const sales = view('money', 'sales-log', 'Sales', [], 'money/sales-live.tsx', {
  primary: true,
  path: '/sales',
  discovered: true
});
state(sales, 'populated', { group: 'data' });
variants(sales, { fail: ['get_books'], skip: ['many', 'long-text', 'large-values'] });

// ------------------------------------------------ ACCOUNT
const account = view('account', 'account', 'Account', ['account'], 'account/account-live.tsx', {
  primary: true,
  path: '/settings',
  extraSources: [SRC + 'account/settings-areas.tsx']
});
state(account, 'populated', { group: 'data' });
variants(account, { fail: ['get_settings'], skip: ['many', 'long-text', 'large-values', 'empty'] });
const areas = [
  ['shop-settings', 'Shop settings', 'Open Shop settings'],
  ['make-area', 'Make settings (from Account)', 'Open Make settings'],
  ['stock-area', 'Stock settings (from Account)', 'Open Stock settings'],
  ['money-area', 'Money settings (from Account)', 'Open Money settings'],
  ['notifications-data', 'Notifications & data', 'Open Notifications & data']
];
for (const [id, title, label] of areas) {
  const v = view('account', id, title, [], 'account/settings-areas.tsx', {
    path: '/settings',
    steps: [label],
    discovered: true
  });
  state(v, 'default');
}
const people = view(
  'account',
  'people',
  'People & access',
  ['people', 'person-edit'],
  'settings-pages.tsx',
  {
    path: '/settings',
    steps: ['Open People & access'],
    note: 'Adding a person needs hosted accounts, so no person-edit page exists (coverage.md: Partial).'
  }
);
state(people, 'hub');
state(people, 'who-can-see-what', { steps: ['Open Who can see what'] });
state(people, 'support-access', { steps: ['Open Technical support access'], viewports: TWO });
const health = view(
  'account',
  'health',
  'Health & backups',
  ['health', 'backups', 'restore-preview'],
  'account/account-live.tsx',
  {
    primary: true,
    path: '/health',
    controller: 'src/lib/data/operations-health.ts',
    note: 'Status and export only; a browser restore is not offered on purpose (coverage.md).'
  }
);
state(health, 'populated-restore-failed', { group: 'data' });
state(health, 'read-failure', {
  config: { rpcFail: { get_operations_health: 'down' } },
  viewports: TWO,
  group: 'failure'
});
state(health, 'malformed-answer', {
  config: { rpcFail: { get_operations_health: 'malformed' } },
  viewports: TWO,
  group: 'failure'
});
state(health, 'loading', {
  config: { rpcFail: { get_operations_health: 'never' } },
  viewports: TWO,
  group: 'failure'
});
state(health, 'empty', { config: { data: 'empty' }, viewports: TWO, group: 'data' });
const notes = view('account', 'notifications', 'Notifications', [], 'account/account-live.tsx', {
  primary: true,
  path: '/notifications',
  discovered: true
});
state(notes, 'populated', { group: 'data' });
state(notes, 'empty', { config: { data: 'empty' }, viewports: TWO, group: 'data' });
state(notes, 'one-dismissed', { steps: [{ click: 'Dismiss', idx: 0 }], viewports: TWO });
state(notes, 'all-cleared', { steps: ['Clear all'], viewports: TWO });
const signIn = view(
  'account',
  'sign-in',
  'Sign in',
  ['sign-in', 'account-help'],
  'src/app/sign-in/sign-in-form.tsx',
  { primary: true, path: '/sign-in', config: { session: false }, role: 'public' }
);
state(signIn, 'untouched', { group: 'data' });
state(signIn, 'account-help', { steps: ['Account help'], viewports: TWO });
state(signIn, 'wrong-password', {
  steps: [
    { fill: 'Email', value: 'sample@synthetic.invalid' },
    { fillRole: 'textbox', name: /Password/, value: 'wrong-password' },
    /^Sign in$/,
    { wait: 500 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(signIn, 'network-failure', {
  config: { session: false, rpcFail: { signIn: 'network' } },
  steps: [
    { fill: 'Email', value: 'sample@synthetic.invalid' },
    { fillRole: 'textbox', name: /Password/, value: 'synthetic-test-value' },
    /^Sign in$/,
    { wait: 500 }
  ],
  viewports: TWO,
  group: 'failure'
});
state(signIn, 'empty-submit', { steps: [/^Sign in$/], viewports: TWO });
state(signIn, 'password-shown', { steps: ['Show password'], viewports: ['p390'] });
const signOut = view(
  'account',
  'sign-out',
  'Sign out',
  ['sign-out'],
  'src/components/app/sign-out-control.tsx',
  { path: '/settings', steps: [] }
);
state(signOut, 'no-unsent', { steps: ['Sign out'], viewports: TWO });
state(signOut, 'with-unsent-sales', {
  path: '/bazaar',
  config: PLANNED,
  steps: [
    ...TILL,
    { fail: { record_event_sale: 'down' } },
    ...SALE,
    { wait: 800 },
    /^Home/,
    'Sign out'
  ],
  viewports: SUB,
  group: 'business',
  note: 'Warns about unsent sales first.'
});
const gate = view(
  'account',
  'access-gate',
  'Session and access gate',
  [],
  'src/components/app/live-gate.tsx',
  { discovered: true, extraSources: ['src/components/app/offline-hold.tsx'] }
);
state(gate, 'session-expired-redirect', {
  path: '/orders',
  config: { rpcFail: { auth: 'expired' } },
  viewports: TWO,
  group: 'failure',
  note: 'getUser returns no user: the real gate redirects to sign-in, so this is the same image as Sign in, untouched.'
});
state(gate, 'idle-time-spent', {
  path: '/orders',
  steps: [
    { clock: '2026-11-10T07:30:00.000Z' },
    { inject: () => document.dispatchEvent(new Event('visibilitychange')), wait: 2500 }
  ],
  viewports: TWO,
  group: 'failure',
  unverified:
    'Page unchanged: the fixed clock does not run the idle timer, so idle sign-out was not reached.',
  note: 'Clock moved five and a half hours forward with no activity. The page did not change.'
});
state(gate, 'inactive-profile', {
  note: 'Lands on the sign-in page: the same image as Sign in, untouched.',
  path: '/orders',
  config: { rpcFail: { profile: 'inactive' } },
  viewports: TWO,
  group: 'failure'
});
state(gate, 'no-signal-first-open', {
  path: '/orders',
  config: { rpcFail: { auth: 'network' } },
  viewports: TWO,
  group: 'failure',
  note: 'First check cannot complete: notice instead of sign-out.'
});
state(gate, 'identity-check-pending', {
  path: '/orders',
  config: { rpcFail: { auth: 'never' } },
  viewports: TWO,
  group: 'failure',
  note: 'Before the first check answers the app draws nothing behind the gate.',
  wait: 1500
});
state(gate, 'profile-read-failed', {
  path: '/orders',
  config: { rpcFail: { profile: 'down' } },
  viewports: TWO,
  group: 'failure'
});
state(gate, 'bazaar-only-offline-open', {
  path: '/bazaar',
  config: PLANNED,
  steps: [
    ...TILL,
    {
      inject: () =>
        localStorage.setItem('__captureFail', JSON.stringify({ auth: 'network', '*': 'network' }))
    },
    { reload: true },
    { wait: 800 }
  ],
  viewports: TWO,
  group: 'failure',
  source: 'ui-driven',
  note: 'A day is held; reload with no signal opens Bazaar Mode alone.'
});
state(gate, 'other-screen-refused-offline', {
  path: '/bazaar',
  config: PLANNED,
  steps: [
    ...TILL,
    {
      inject: () =>
        localStorage.setItem('__captureFail', JSON.stringify({ auth: 'network', '*': 'network' }))
    },
    { goto: '/orders' }
  ],
  viewports: TWO,
  group: 'failure'
});

// ------------------------------------------------ ROLES (live gate decides; server role simulated)
const helper = view(
  'account',
  'role-helper',
  'Helper role',
  [],
  'src/components/shell/app-frame.tsx',
  { discovered: true, role: 'helper', oldScreen: true, config: { role: 'helper' } }
);
state(helper, 'home', { path: '/', viewports: SUB, group: 'role' });
state(helper, 'orders-denied', { path: '/orders', viewports: TWO, group: 'role' });
state(helper, 'money-denied', { path: '/pnl', viewports: TWO, group: 'role' });
state(helper, 'sales-log', { path: '/sales', viewports: TWO, group: 'role' });
state(helper, 'bazaar', { path: '/bazaar', viewports: SUB, group: 'role' });
state(helper, 'inventory', { path: '/inventory', viewports: TWO, group: 'role' });
state(helper, 'settings-denied', { path: '/settings', viewports: TWO, group: 'role' });
const support = view(
  'account',
  'role-support',
  'Support role',
  [],
  'src/components/shell/app-frame.tsx',
  { discovered: true, role: 'support', oldScreen: true, config: { role: 'support' } }
);
state(support, 'home', { path: '/', viewports: TWO, group: 'role' });
state(support, 'orders', { path: '/orders', viewports: TWO, group: 'role' });
state(support, 'money', { path: '/pnl', viewports: TWO, group: 'role' });
state(support, 'settings', { path: '/settings', viewports: TWO, group: 'role' });
state(support, 'health', { path: '/health', viewports: TWO, group: 'role' });

// ------------------------------------------------ OTHER ROUTES (old addresses and tools)
const more = view(
  'other',
  'all-tools',
  'All tools (old address)',
  [],
  'src/components/screens/all-tools.tsx',
  { primary: true, path: '/more', discovered: true, oldScreen: true }
);
state(more, 'default');
const fq = view(
  'other',
  'form-queue',
  'Form queue (old address)',
  [],
  'src/components/screens/form-queue.tsx',
  { primary: true, path: '/formqueue', discovered: true, oldScreen: true }
);
state(fq, 'default');
const st = view('other', 'stocktake-address', 'Stocktake address', [], 'stock/inventory-live.tsx', {
  path: '/stocktake',
  discovered: true
});
state(st, 'default', { viewports: TWO });
const moreBooks = view(
  'other',
  'books-costs',
  'Books & costs (from All tools)',
  ['book-rules'],
  'books-form.tsx',
  { path: '/more', steps: [/^Books & costs/], discovered: true }
);
state(moreBooks, 'default', { viewports: TWO });

// References with no page of their own.
export const NOT_APPLICABLE = [
  {
    ref: 'reset-preview',
    why: 'Mockup tool only: coverage.md marks it Not a feature. Real records are never reset.'
  }
];
