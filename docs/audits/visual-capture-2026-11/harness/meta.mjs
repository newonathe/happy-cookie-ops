// Facts for the manifest that do not come from a run: the source pin, business rules quoted from repository docs, known limits.
const SECTION_REFS = {
  home: ['home'],
  bazaar: [
    'events',
    'bazaar',
    'event-edit',
    'plan',
    'plan-review',
    'till',
    'classic-till',
    'receipt',
    'void',
    'close',
    'close-review',
    'event-review',
    'event-tools',
    'event-tool-review',
    'device-recovery',
    'bazaar-settings'
  ],
  sell: [
    'sell',
    'order',
    'payment-review',
    'order-action',
    'customers',
    'customer-detail',
    'customer-message',
    'contact-remove'
  ],
  shop: [
    'shop',
    'shop-status',
    'order-rules',
    'boxes',
    'payment-methods',
    'payment-method-edit',
    'shop-text',
    'shop-schedule',
    'customer-shop',
    'customer-checkout',
    'customer-status'
  ],
  make: [
    'make',
    'production',
    'production-entry',
    'production-review',
    'recipe',
    'recipe-edit',
    'recipe-review',
    'recipe-drafts',
    'product-edit',
    'new-product',
    'cost-edit',
    'cost-review',
    'make-settings'
  ],
  stock: [
    'stock',
    'item',
    'item-edit',
    'new-item',
    'receive',
    'receive-review',
    'count',
    'count-review',
    'adjust',
    'adjust-review',
    'shopping',
    'bake-needs',
    'suppliers',
    'supplier',
    'supplier-edit',
    'purchase-prices',
    'supplier-price-edit',
    'stock-settings'
  ],
  money: [
    'money',
    'money-settings',
    'money-entry',
    'money-review',
    'transaction',
    'money-categories',
    'book-rules'
  ],
  account: [
    'account',
    'people',
    'person-edit',
    'health',
    'backups',
    'restore-preview',
    'sign-out',
    'sign-in',
    'account-help',
    'record-unavailable',
    'reset-preview'
  ]
};
const refSection = {};
for (const [s, list] of Object.entries(SECTION_REFS)) for (const r of list) refSection[r] = s;

export const META = {
  // Reference views the app has no page for. A nearby screen is listed, but that is not parity.
  noPage: {
    'plan-review':
      'The app has no Review page for a plan: saving a plan opens nothing, and starting a day asks first only when the date is not today (coverage.md).',
    'event-tool-review':
      'The app has no Review step for fees, losses or added cookies: each entry can be removed from the same page (coverage.md).',
    'person-edit':
      'The app lists people and access but has no add or edit page: adding a person needs accounts on the hosted service (coverage.md).',
    'restore-preview':
      'The app has no restore page: restoring from a browser file is left out on purpose because it would overwrite real records (coverage.md).'
  },
  notReached: {
    'record-unavailable':
      'The RecordUnavailable component exists (src/components/ui/owner-patterns.tsx), but no path to it was found: an unknown order id returns to Orders, and an order removed while open stays on screen.'
  },
  referenceViews: Object.values(SECTION_REFS).flat(),
  refSection,
  source: {
    captured_branch: 'codex/refined-workflows',
    captured_sha: 'b54239c1258f580e5d14ee0cd383e82bff753450',
    development_branch_head_when_published: '93135433fd88def7cbc5a05c0d22de3b17cfe764',
    moved_during_capture:
      'While this ran, the development branch moved from b54239c to 9313543 (3 commits). Between them, the only change under src is the generated types file src/lib/types/database.ts. No screen, store or rule changed in the browser code. The new dough-only baking SQL migration is not exercised because the server is simulated.',
    deployed_trial_branch: 'agent/codex/MP-04-g1-feasibility',
    deployed_trial_sha: 'ed64a51570b6b4f918eb575e399ee22164d683ae',
    deployed_trial_captured: false,
    difference:
      'The development branch has 6 commits the deployed branch lacks (all the production preparation changes). The deployed branch has 4 commits the development branch lacks (release merges). Under src, the two differ in 13 files (410 insertions, 67 deletions), mainly dough preparation and recovery. Only the development commit was captured.',
    not_included:
      'Uncommitted work in the shared main checkout at capture time is not in this capture.'
  },
  environment: {
    runtime:
      'Vite production build of the real OpsApp, LiveGate, RouteSync, OfflineBridge and all live screens, with NEXT_PUBLIC_APP_MODE=live',
    server:
      'A simulated in-memory server (harness/fake-supabase.js) replaces the Supabase browser client only. No hosted URL, key or record is reachable.',
    browser:
      'Playwright 1.63.0 Chromium headless, device scale factor 1. One state per primary area also ran in Playwright WebKit on Windows, labelled as such.',
    clock: 'Fixed at 2026-11-10T02:00:00Z (Tuesday 10:00 in Manila), time zone Asia/Manila',
    fixtures:
      'harness/fixtures.js. All names, phones, references, suppliers, events, prices and costs are invented. Product names and cookie photos are the ones already public in this repository.',
    network:
      'Every request outside 127.0.0.1 is blocked; the sample QR host is answered with a generated image reading SAMPLE QR.',
    service_workers:
      'Blocked, so an offline page reload through the service worker is not exercised.'
  },
  sectionRules: {
    home: [
      'Show actual facts only; no sample names, fake trends or unproved backup success (owner-workflow-brief.md section 6).'
    ],
    bazaar: [
      'Never remove a queued sale the server has not acknowledged by clientId (AGENTS.md).',
      'Day close is distinct from final event completion (owner-workflow-brief.md section 6).',
      'A day is sold on the device that started it (src/store/ops-runtime.tsx).',
      'Selecting Bazaar opens the Events directory first, including while an event is active (owner-workflow-brief.md section 1).'
    ],
    sell: [
      'Never treat unpaid or expected amounts as confirmed money (owner-workflow-brief.md section 6).',
      'Picked Up means Completed; pickup is from the owner (current.md).',
      'Every change checks the updated_at stamp; a stale change is refused (src/lib/data/staff-orders.ts).'
    ],
    shop: [
      'Remove the operator input "Unpaid orders allowed per mobile number"; call the sampler "Sampler box" (owner-workflow-brief.md section 6).',
      'Customers never see the raw products table; only published rows (src/lib/data/flavours.ts).'
    ],
    make: [
      'Recipe amount and actual dough balls are separate facts (active-bazaar-parallel-production-plan.md, production transaction contract).',
      'Returned quantity is good output; rejects are separate (current.md).',
      'Different products can be in production at once; each keeps its own draft (owner-workflow-brief.md).'
    ],
    stock: [
      'Distinguish missing, unknown and pending from a confirmed zero (owner-workflow-brief.md section 5).',
      'Never compare incompatible packs or units (owner-workflow-brief.md section 5).',
      'Paid may stay empty: the cost stays pending (coverage.md).'
    ],
    money: [
      'Money is centavos in Postgres and pesos in the engine (AGENTS.md).',
      'Owner draws are separate from expenses (coverage.md).',
      'Positive money is green, negative red and zero neutral, with signs so colour is not the only signal (owner-workflow-brief.md section 5).',
      'No complete profit from partial costs (owner-workflow-brief.md section 5).'
    ],
    account: [
      'Missing or old backup results do not prove the data is protected (HealthLive).',
      'Sign-out warns about unsent sales first (coverage.md).',
      'No restore from a browser file (coverage.md).'
    ],
    other: ['Old addresses stay reachable for compatibility (owner-workflow-brief.md section 3).']
  },
  rules: {},
  viewLimits: {
    'bazaar/till': [
      'The sale queue, retry timer and refusal handling are real client code. The simulated server decides refusals, so this does not explain why real sales stay stuck.'
    ],
    'account/role-helper': [
      'Roles are decided by the real gate, from a simulated profile row. RLS is not exercised.'
    ],
    'account/role-support': [
      'Roles are decided by the real gate, from a simulated profile row. RLS is not exercised.'
    ],
    'shop/customer-checkout': [
      'The real checkout calls place_order against the simulated server; payment is never real.'
    ]
  },
  unreachable: [
    {
      state:
        'Physical iPhone or Safari behaviour, safe-area insets, real touch, on-screen keyboard',
      why: 'Only desktop Chromium and Playwright WebKit on Windows ran here.'
    },
    {
      state: 'RLS, SQL rules, real concurrency, migrations',
      why: 'The server is simulated. No hosted or local database was used.'
    },
    {
      state: 'Offline reload through the service worker',
      why: 'Service workers are blocked in the capture so runs stay deterministic. The offline first-open states use the real gate with a simulated dead connection.'
    },
    {
      state: 'Hosted data, deployed trial build',
      why: 'Forbidden for this capture; the deployed commit was not built.'
    },
    {
      state: 'Changed by another tab or device, live',
      why: 'Not driven with two browsers. The answer the app gets (conflict, sold on another phone) is simulated and captured.'
    },
    {
      state: 'Idle sign-out after hours of inactivity',
      why: 'The fixed clock does not advance. The session-expired redirect is captured instead.'
    },
    {
      state: 'File download contents (CSV export) and photo upload',
      why: 'The press is captured. The file itself is not inspected, and no photo was uploaded.'
    },
    {
      state: 'Windows hover on touch devices, print layouts',
      why: 'Not in scope of the viewport runs.'
    }
  ]
};
