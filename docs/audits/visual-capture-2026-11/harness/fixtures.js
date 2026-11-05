// Synthetic records only. Every person, phone, reference, supplier, event, price and cost here is invented for this audit.
// Clock: every capture runs at T0 (Tuesday 10 November 2026, 10:00 Manila), so all relative dates are deterministic.
export const T0 = Date.parse('2026-11-10T02:00:00.000Z');
export const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const ymd = (days) => new Date(T0 + 8 * 3600000 + days * DAY).toISOString().slice(0, 10);
const STAMP = '2026-11-01T02:00:00.000Z';
const uuid = (group, n) => `${group}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = (c) => String(c).repeat(64).slice(0, 64);

export function buildDb(opts = {}) {
  const long = opts.data === 'long';
  const many = opts.data === 'many';
  const empty = opts.data === 'empty';
  const big = opts.data === 'large';
  const flavourRows = [
    [
      'dcf',
      'double chocolate fudge',
      'Double Chocolate Fudge',
      12500,
      'Permanent',
      '',
      'assets/double-chocolate-fudge.png',
      true,
      true
    ],
    [
      'hc',
      'happy camper',
      'Happy Camper',
      13500,
      'Permanent',
      '',
      'assets/happy-camper.png',
      true,
      true
    ],
    [
      'wcb',
      'white chocolate biscoff',
      'White Chocolate Biscoff',
      14000,
      'Permanent',
      'Best seller',
      'assets/white-chocolate-biscoff.png',
      true,
      true
    ],
    [
      'pbm',
      'pb & miso',
      'PB & Miso',
      11000,
      'Permanent',
      'Best seller',
      'assets/pb-miso.png',
      true,
      true
    ],
    [
      'rvc',
      'red velvet cheesecake',
      'Red Velvet Cheesecake',
      15000,
      'Rotating',
      'New',
      'assets/red-velvet-cheesecake.png',
      true,
      true
    ],
    [
      'nch',
      'nutella churro',
      'Nutella Churro',
      16000,
      'Rotating',
      'New',
      'assets/nutella-churro.png',
      true,
      true
    ],
    ['ube', 'ube coconut crinkle', 'Ube Coconut Crinkle', 13000, 'Rotating', '', '', true, true],
    ['esp', 'espresso brownie', 'Espresso Brownie', 12000, 'Rotating', '', '', false, false]
  ];
  const flavours = (empty ? [] : flavourRows).map(
    ([id, name, short, price, kind, tag, img, active, published], i) => ({
      id,
      name:
        long && id === 'hc'
          ? 'happy camper with toasted marshmallow, browned butter and extra-long sea salt caramel swirl'
          : name,
      short_name:
        long && id === 'hc'
          ? 'Happy Camper Toasted Marshmallow Browned Butter Sea Salt Caramel'
          : short,
      price_cents: big ? price * 90 : price,
      kind,
      item_type: 'cookie',
      capacity_weight: 1,
      tag,
      description: `Fictional description of ${short} for this audit.`,
      image_path: img,
      allergens: 'milk, eggs, wheat',
      active,
      published,
      sort_order: i,
      updated_at: STAMP
    })
  );
  if (!empty)
    flavours.push({
      ...flavours[0],
      id: 'sampler',
      name: 'sampler box',
      short_name: 'Sampler box',
      item_type: 'set',
      kind: 'Set',
      price_cents: 42000,
      tag: '',
      description: 'Fictional sampler box.',
      sort_order: 99
    });
  const price = (id) => flavours.find((f) => f.id === id)?.price_cents ?? 12500;

  const ORDERS = [
    [
      'HC-1101',
      'Ana Placeholder',
      'Payment review',
      'claimed',
      'GCash',
      'FAKEREF-1101',
      [
        ['dcf', 3],
        ['hc', 3]
      ],
      1,
      5,
      {}
    ],
    ['HC-1102', 'Ben Sample', 'Payment review', 'unpaid', '', '', [['wcb', 6]], 1, 2, {}],
    [
      'HC-1103',
      'Carla Fictional',
      'Confirmed',
      'confirmed',
      'GCash',
      'FAKEREF-1103',
      [
        ['wcb', 4],
        ['dcf', 2]
      ],
      1,
      20,
      {
        add_ons: [
          {
            name: 'Note card',
            qty: 1,
            unit_price_cents: 1000,
            variant: '',
            note: 'Fictional message: happy birthday!'
          }
        ]
      }
    ],
    [
      'HC-1104',
      'Dino Example',
      'Preparing',
      'confirmed',
      'Maya',
      'FAKEREF-1104',
      [['hc', 6]],
      1,
      30,
      { boxes: [{ size: 6, qty: 1, charge_cents: 2000 }] }
    ],
    [
      'HC-1105',
      'Elsa Testcase',
      'Ready',
      'confirmed',
      'GCash',
      'FAKEREF-1105',
      [['dcf', 6]],
      0,
      40,
      {}
    ],
    [
      'HC-1106',
      'Fred Mockname',
      'Confirmed',
      'confirmed',
      'Cash',
      '',
      [
        ['pbm', 3],
        ['hc', 3]
      ],
      4,
      8,
      {}
    ],
    [
      'HC-1107',
      'Gina Notreal',
      'Completed',
      'confirmed',
      'GCash',
      'FAKEREF-1107',
      [['rvc', 6]],
      -3,
      90,
      {}
    ],
    [
      'HC-1108',
      'Hugo Invented',
      'Cancelled',
      'unpaid',
      '',
      '',
      [['nch', 3]],
      4,
      60,
      { holds: false }
    ],
    [
      'HC-1109',
      'Iris Madeup',
      'No-show',
      'confirmed',
      'GCash',
      'FAKEREF-1109',
      [['dcf', 4]],
      -4,
      120,
      { holds: false }
    ],
    [
      'HC-1110',
      'Jon Imaginary',
      'Completed',
      'refunded',
      'GCash',
      'FAKEREF-1110',
      [['wcb', 2]],
      -6,
      150,
      { refund_ref: 'FAKEREFUND-1110', holds: false }
    ],
    [
      'HC-1111',
      'Kim Unreal',
      'Confirmed',
      'confirmed',
      'GCash',
      'FAKEREF-1111',
      [
        ['dcf', 2],
        ['rvc', 1]
      ],
      4,
      12,
      { unavailable: 'rvc', surcharge_cents: 3000, same_day: true }
    ],
    [
      'HC-1112',
      'Lia Dummy',
      'Preparing',
      'confirmed',
      'GoTyme',
      'FAKEREF-1112',
      [['sampler', 1]],
      1,
      26,
      { swaps: [{ from: 'hc', to: 'dcf', qty: 1, delta_cents: -1000, at: iso(T0 - 4 * 3600000) }] }
    ]
  ];
  const makeOrder = ([id, name, state, pay, method, ref, items, pickup, placed, extra]) => {
    const total = items.reduce((t, [p, q]) => t + q * price(p), 0) + (extra.surcharge_cents ?? 0);
    return {
      id,
      name: long ? `${name} with a very long fictional customer name for wrapping tests` : name,
      phone: '0917000' + id.slice(3).padStart(4, '0'),
      ig: '@' + name.split(' ')[0].toLowerCase() + '.fictional',
      state,
      pay_state: pay,
      pay_method: method,
      pay_ref: ref || null,
      total_cents: total,
      paid_cents: pay === 'confirmed' || pay === 'refunded' ? total : null,
      refund_ref: extra.refund_ref ?? null,
      pickup_date: ymd(pickup),
      pickup_window: '10:00',
      placed_at: iso(T0 - placed * 3600000),
      updated_at: STAMP,
      status_token: id.slice(3).padStart(4, '0').repeat(16),
      holds: extra.holds ?? true,
      items: items.map(([p, q]) => ({
        product_id: p,
        qty: q,
        unit_price_cents: price(p),
        unavailable: extra.unavailable === p
      })),
      swaps: extra.swaps ?? [],
      surcharge_cents: extra.surcharge_cents ?? 0,
      same_day: extra.same_day ?? false,
      add_ons: extra.add_ons ?? [],
      boxes: extra.boxes ?? []
    };
  };
  let orders = empty ? [] : ORDERS.map(makeOrder);
  if (many) {
    const names = ['Mara', 'Nico', 'Olga', 'Pia', 'Quin', 'Rae', 'Sol', 'Tess', 'Uma', 'Vic'];
    for (let i = 0; i < 60; i++)
      orders.push(
        makeOrder([
          `HC-${1200 + i}`,
          `${names[i % 10]} Fictional${i}`,
          ['Confirmed', 'Preparing', 'Ready', 'Completed'][i % 4],
          'confirmed',
          'GCash',
          `FAKEREF-${1200 + i}`,
          [[['dcf', 'hc', 'wcb'][i % 3], 2 + (i % 5)]],
          1 + (i % 4),
          6 + i * 3,
          {}
        ])
      );
  }
  if (opts.data === 'one') orders = orders.slice(0, 1);

  const item = (
    id,
    name,
    unit,
    qty,
    par,
    pack,
    category = 'Ingredients',
    counted = true,
    supplier = 'sup-baking',
    active = true
  ) => ({
    id: 'item-' + id,
    name:
      long && id === 'flour'
        ? 'All-purpose flour, extra-long fictional stock item name used to test wrapping'
        : name,
    unit,
    category,
    on_hand: big ? (id === 'vanilla' ? -20 : qty * 1000) : qty,
    par_level: par,
    pack_size: pack,
    pack_label: `${pack} ${unit}`,
    supplier_id: supplier,
    use_by_days: id === 'cream' ? 14 : null,
    last_counted: counted ? iso(T0 - 2 * DAY) : null,
    active,
    updated_at: STAMP
  });
  const items = empty
    ? []
    : [
        item('flour', 'All-purpose flour', 'g', 1800, 1000, 1000),
        item('butter', 'Unsalted butter', 'g', 600, 500, 225),
        item('sugar', 'Brown sugar', 'g', 0, 500, 1000, 'Ingredients', true),
        item('choc', 'Chocolate chunks', 'g', 1400, 500, 1000),
        item('cocoa', 'Cocoa powder', 'g', 500, 200, 500),
        item('marsh', 'Marshmallows', 'g', 150, 200, 500),
        item('biscoff', 'Biscoff spread', 'g', 90, 200, 400),
        item('pb', 'Peanut butter', 'g', 400, 200, 500),
        item('cream', 'Cream cheese', 'g', 300, 200, 250),
        item('hazel', 'Hazelnut spread', 'g', 500, 200, 400),
        item('vanilla', 'Vanilla extract', 'ml', 40, 50, 100, 'Ingredients', false, null),
        item('pouch', 'Cookie pouch', 'pcs', 120, 50, 50, 'Packaging', true, 'sup-pack'),
        item('sticker', 'Brand sticker', 'pcs', 0, 50, 100, 'Packaging', false, 'sup-pack'),
        item('box6', 'Box of 6', 'pcs', 18, 20, 25, 'Packaging', true, 'sup-pack'),
        item('oldjar', 'Old packaging jar', 'pcs', 0, 0, 10, 'Packaging', true, null, false)
      ];
  if (many)
    for (let i = 0; i < 40; i++)
      items.push(item('x' + i, `Fictional ingredient ${i + 1}`, 'g', i * 37, 200, 500));
  const suppliers = empty
    ? []
    : [
        {
          id: 'sup-baking',
          name: long
            ? 'Baking Supply Company with an extra-long fictional trading name, Sample City branch'
            : 'Baking Supply Co.',
          place: 'Sample City',
          phone: '09170000101',
          notes: 'Fictional supplier. Morning delivery.',
          active: true,
          updated_at: STAMP
        },
        {
          id: 'sup-pack',
          name: 'Packaging Supply',
          place: 'Sample City',
          phone: '',
          notes: 'Cookie pouches and stickers.',
          active: true,
          updated_at: STAMP
        },
        {
          id: 'sup-pantry',
          name: 'Pantry Wholesale',
          place: 'Demo Town',
          phone: '09170000102',
          notes: 'Alternative ingredient supplier.',
          active: true,
          updated_at: STAMP
        },
        {
          id: 'sup-old',
          name: 'Previous supplier',
          place: '',
          phone: '',
          notes: '',
          active: false,
          updated_at: STAMP
        }
      ];
  const pr = (n, sup, name, pack, cents, prev, bought, preferred = false) => ({
    id: uuid('a3a00000', n),
    supplier_id: sup,
    item_name: name,
    pack_label: pack,
    price_cents: cents,
    previous_cents: prev,
    last_bought: bought,
    preferred,
    active: true,
    updated_at: STAMP
  });
  const prices = empty
    ? []
    : [
        pr(1, 'sup-baking', 'All-purpose flour', '1000 g', 8050, [7900, 8000], '2 Nov', true),
        pr(2, 'sup-pantry', 'All-purpose flour', '1000 g', 7800, [7800], '20 Oct'),
        pr(3, 'sup-baking', 'Unsalted butter', '225 g', 12500, [11900], '2 Nov', true),
        pr(4, 'sup-pantry', 'Unsalted butter', '250 g', 14000, [], '12 Oct'),
        pr(5, 'sup-baking', 'Chocolate chunks', '1000 g', 45000, [43000, 44000], '28 Oct', true),
        pr(6, 'sup-pack', 'Cookie pouch', '50 pcs', 15000, [14500], '20 Oct', true),
        pr(7, 'sup-pack', 'Brand sticker', '100 pcs', 9000, [], '1 Oct', true),
        pr(8, 'sup-baking', 'Brown sugar', '1000 g', 9500, [9000], '20 Oct', true)
      ];
  const line = (name, qty, unit = 'g', kind = 'ingredient', itemId) => ({
    name,
    qty,
    unit,
    kind,
    item_id: itemId ?? null
  });
  const base = [
    line('All-purpose flour', 250, 'g', 'ingredient', 'item-flour'),
    line('Unsalted butter', 130, 'g', 'ingredient', 'item-butter'),
    line('Brown sugar', 120, 'g', 'ingredient', 'item-sugar')
  ];
  const recipeRows = [
    [
      'dcf',
      3,
      [
        line('Chocolate chunks', 150, 'g', 'ingredient', 'item-choc'),
        line('Cocoa powder', 25, 'g', 'ingredient', 'item-cocoa')
      ]
    ],
    [
      'hc',
      2,
      [
        line('Chocolate chunks', 120, 'g', 'ingredient', 'item-choc'),
        line('Marshmallows', 80, 'g', 'ingredient', 'item-marsh')
      ]
    ],
    ['wcb', 2, [line('Biscoff spread', 80, 'g', 'ingredient', 'item-biscoff')]],
    ['pbm', 1, [line('Peanut butter', 100, 'g', 'ingredient', 'item-pb')]],
    ['rvc', 1, [line('Cream cheese', 100, 'g', 'ingredient', 'item-cream')]],
    ['nch', 1, [line('Hazelnut spread', 80, 'g', 'ingredient', 'item-hazel')]]
  ];
  const recipes = empty
    ? []
    : recipeRows.map(([product_id, version, extra]) => {
        const lines = [
          ...base,
          ...extra,
          line('Cookie pouch', 12, 'pcs', 'packaging', 'item-pouch')
        ];
        return {
          product_id,
          version,
          yield: 12,
          updated_at: STAMP,
          lines,
          history:
            version > 1
              ? [
                  {
                    version: version - 1,
                    yield: 12,
                    lines: lines.map((l) => ({ ...l, qty: Math.round(l.qty * 0.9) }))
                  }
                ]
              : []
        };
      });
  const production = empty
    ? { batches: [], dough: [], baked: [], shortfalls: [] }
    : {
        batches: [
          { product_id: 'dcf', qty: 24, target: 24, rejects: 2, version: 3, at: T0 - 26 * 3600000 },
          { product_id: 'hc', qty: 9, target: 12, rejects: 1, version: 2, at: T0 - 24 * 3600000 },
          { product_id: 'wcb', qty: 4, target: null, rejects: 0, version: 2, at: T0 - 20 * 3600000 }
        ],
        dough: [
          { product_id: 'dcf', balls: 14, at: T0 - 30 * 3600000 },
          { product_id: 'hc', balls: 8, at: T0 - 28 * 3600000 }
        ],
        baked: [
          { product_id: 'dcf', qty: 24 },
          { product_id: 'hc', qty: 9 },
          { product_id: 'wcb', qty: 4 }
        ],
        shortfalls: []
      };
  const L = (id, kind, cat, label, pesos, days) => ({
    id,
    kind,
    cat,
    label: long ? `${label}, with a long fictional description to test wrapping in lists` : label,
    amount_cents: pesos * 100 * (big ? 90 : 1),
    at: T0 - days * DAY
  });
  const books = {
    basis: 'used',
    lines: empty
      ? []
      : [
          L('b1', 'revenue', 'Orders', 'Drop 31, 14 orders paid', 8400, 26),
          L('b2', 'expense', 'Ingredients', 'Flour, butter and chocolate', 5100, 24),
          L('b3', 'revenue', 'Bazaar', 'Harbor Street Fair, day 1', 6250, 1),
          L('b4', 'expense', 'Stall rent', 'Harbor Street Fair stall', 2000, 1),
          L('b5', 'expense', 'Packaging', 'Cookie pouches', 700, 12),
          L('b6', 'revenue', 'Orders', 'Drop 32, 9 orders paid', 3600, 5),
          L('b7', 'refund', 'Orders', 'Refund, order HC-1110', 280, 4),
          L('b8', 'expense', 'Ingredients', 'Biscoff spread and cream cheese', 1480, 3),
          L('b9', 'draw', 'Owner drawings', 'Owner draw', 1500, 2),
          L('b10', 'revenue', 'Orders', 'Earlier orders', 9200, 48),
          L('b11', 'expense', 'Ingredients', 'Earlier ingredients', 4300, 50)
        ],
    uncosted: empty
      ? []
      : [
          { id: 'u1', kind: 'use', item: 'Cream cheese', qty: 225, unit: 'g', at: T0 - 3 * DAY },
          { id: 'u2', kind: 'waste', item: 'Cocoa powder', qty: 30, unit: 'g', at: T0 - 5 * DAY }
        ],
    receipts: empty
      ? []
      : [
          {
            movement_id: uuid('b1000000', 1),
            item: 'All-purpose flour',
            qty: 5000,
            cost_cents: 40250,
            supplier: 'Baking Supply Co.',
            at: T0 - 8 * DAY
          }
        ],
    held: []
  };
  const movements = empty
    ? []
    : [
        {
          id: 'm1',
          kind: 'receipt',
          qty_delta: 1000,
          unit_cost: 805,
          cost_source: 'average',
          paid_cents: 8050,
          supplier: 'Baking Supply Co.',
          reason: '',
          at: T0 - 8 * DAY
        },
        {
          id: 'm2',
          kind: 'use',
          qty_delta: -500,
          unit_cost: 805,
          cost_source: 'average',
          paid_cents: null,
          supplier: '',
          reason: 'Production',
          at: T0 - 26 * 3600000
        },
        {
          id: 'm3',
          kind: 'waste',
          qty_delta: -50,
          unit_cost: 805,
          cost_source: 'average',
          paid_cents: null,
          supplier: '',
          reason: 'Spilled',
          at: T0 - 5 * DAY
        },
        {
          id: 'm4',
          kind: 'count',
          qty_delta: -20,
          unit_cost: null,
          cost_source: null,
          paid_cents: null,
          supplier: '',
          reason: '',
          at: T0 - 2 * DAY
        },
        {
          id: 'm5',
          kind: 'opening',
          qty_delta: 1370,
          unit_cost: null,
          cost_source: null,
          paid_cents: null,
          supplier: '',
          reason: '',
          at: T0 - 30 * DAY
        }
      ];
  const settings = [
    ['capacity', { int_value: 60 }],
    ['drawerFloat', { cents_value: 200000 }],
    ['restHours', { int_value: 12 }],
    ['doughWarnDays', { int_value: 3 }],
    ['groceryBudget', { cents_value: 1500000 }],
    ['packagingFee', { cents_value: 2000 }],
    ['flatBoxPrice', { cents_value: 70000 }],
    ['maxPerOrder', { int_value: 24 }],
    ['idleMinutesOwner', { int_value: 240 }],
    ['idleMinutesSupport', { int_value: 60 }],
    ['idleMinutesHelper', { int_value: 60 }],
    ['offlineOpenHours', { int_value: 72 }],
    ['helperSeesSales', { int_value: 1 }],
    ['priceMode', { text_value: 'perCookie' }],
    ['retention', { text_value: '1y' }],
    [
      'categories',
      {
        json_value: [
          'Ingredients',
          'Packaging',
          'Stall rent',
          'Bazaar fees',
          'Transport',
          'Utilities'
        ]
      }
    ],
    ['inactiveCats', { json_value: ['Utilities'] }],
    [
      'channels',
      {
        json_value: {
          'New order': true,
          'Low stock': true,
          'Grocery shortage': true,
          'Pickup reminder': true,
          'Backup failure': true,
          'System error': true,
          'Payment proof received': false,
          'Dough nearing expiry': false
        }
      }
    ]
  ].map(([key, value]) => ({
    key,
    cents_value: null,
    int_value: null,
    text_value: null,
    json_value: null,
    is_default: false,
    updated_at: STAMP,
    ...value
  }));
  const run = (status, days) => ({
    status,
    completed_at: iso(T0 - days * DAY),
    archive_sha256: status === 'success' ? hash('a') : null
  });
  const health = {
    checked_at: iso(T0),
    jobs: {
      backup: { last_run: run('success', 2), last_success: run('success', 2) },
      restore: { last_run: run('failed', 3), last_success: run('success', 40) },
      retention: {
        last_run: { ...run('success', 1), archive_sha256: null },
        last_success: { ...run('success', 1), archive_sha256: null }
      },
      keepalive: { last_run: null, last_success: null }
    }
  };
  const paymentMethods = empty
    ? []
    : [
        {
          id: 'gcash',
          label: 'GCash',
          account_number: '09170000001',
          account_name: 'Sample Account Holder',
          qr_path: 'qr/sample-gcash.png',
          active: true,
          sort_order: 0,
          updated_at: STAMP
        },
        {
          id: 'maya',
          label: 'Maya',
          account_number: '09170000002',
          account_name: 'Sample Account Holder',
          qr_path: '',
          active: true,
          sort_order: 1,
          updated_at: STAMP
        },
        {
          id: 'gotyme',
          label: 'GoTyme',
          account_number: '0000 0000 0000',
          account_name: 'Sample Account Holder',
          qr_path: '',
          active: false,
          sort_order: 2,
          updated_at: STAMP
        }
      ];
  const texts = {
    registration_badge: 'SAMPLE',
    tin_line: 'TIN 000-000-000 (fictional)',
    invoice_note: 'Fictional invoice note.',
    allergen_note: 'Fictional allergen note: contains milk, eggs and wheat.',
    updated_at: STAMP
  };
  const shopRules = {
    campus_from: '14:00',
    campus_to: '15:30',
    lead_max_days: 14,
    lead_min_days: 2,
    max_unpaid_per_phone: 2,
    pickup_cutoff_hour: 18,
    pickup_days: [3, 6],
    pickup_from_hour: 10,
    unpaid_hold_hours: 24,
    updated_at: STAMP
  };
  const extras = {
    same_day_enabled: true,
    same_day_percent: 20,
    same_day_on_extras: false,
    sampler_product_id: 'sampler',
    sampler_max_qty: 3,
    sampler_flavours: ['dcf', 'hc', 'wcb'],
    box_sizes: [
      { size: 6, charge_cents: 2000, active: true },
      { size: 8, charge_cents: 2500, active: true },
      { size: 12, charge_cents: 3500, active: false }
    ],
    add_ons: [
      {
        id: 'note-card',
        name: 'Note card',
        price_cents: 1000,
        active: true,
        variants: [],
        text_label: 'Message',
        text_max: 150,
        max_qty: 1
      },
      {
        id: 'ribbon',
        name: 'Ribbon',
        price_cents: 1500,
        active: true,
        variants: ['Cream', 'Red', 'Gold'],
        text_label: null,
        text_max: 150,
        max_qty: 10
      }
    ],
    updated_at: STAMP
  };
  const identity = {
    shop_name: 'The Happy Cookie',
    owner_name: 'Sample Owner',
    contact_line: 'Fictional contact line: 0917 000 0000',
    tagline: 'Fictional tagline for this audit',
    updated_at: STAMP
  };
  const db = {
    flavours,
    orders,
    items,
    suppliers,
    prices,
    recipes,
    production,
    books,
    movements,
    settings,
    health,
    paymentMethods,
    texts,
    shopRules,
    extras,
    identity,
    recipeDrafts: empty
      ? []
      : [
          {
            product_id: 'ube',
            yield: 12,
            source_text: 'Fictional draft: 250 g flour, 120 g butter, 100 g ube halaya.',
            updated_at: STAMP
          }
        ],
    flavourCosts: empty
      ? []
      : [
          { product_id: 'dcf', cost_cents: 4800, typed_at: T0 - 9 * DAY },
          { product_id: 'hc', cost_cents: 5200, typed_at: T0 - 9 * DAY }
        ],
    shopStatus: {
      open_dow: 1,
      open_h: 9,
      open_m: 0,
      close_dow: 4,
      close_h: 21,
      close_m: 0,
      extend_h: 0,
      override: opts.shopOverride ?? null
    },
    lastPaid: empty
      ? []
      : [
          {
            item_name: 'All-purpose flour',
            cost_cents: 8050,
            qty: 1000,
            supplier: 'Baking Supply Co.',
            at: T0 - 8 * DAY
          }
        ],
    waitlist: [],
    sales: []
  };
  db.bazaars = empty ? {} : buildBazaars(flavours, opts);
  db.events = Object.values(db.bazaars).map((b) => ({
    ...b.summary.booking,
    started: b.summary.days.some((d) => d.state !== 'planned'),
    updated_at: STAMP
  }));
  if (!empty) {
    const up = uuid('e0000000', 9);
    db.events.push({
      id: up,
      name: 'Riverside Night Market',
      place: 'Demo Riverside Park',
      starts_on: ymd(11),
      ends_on: ymd(12),
      rent_cents: 150000,
      active: true,
      started: false,
      updated_at: STAMP
    });
    db.events.push({
      id: uuid('e0000000', 8),
      name: 'Cancelled Holiday Bazaar',
      place: 'Sample Mall',
      starts_on: ymd(25),
      ends_on: ymd(25),
      rent_cents: 0,
      active: false,
      started: false,
      updated_at: STAMP
    });
    db.bazaars[up] = makeBazaar({
      id: up,
      name: 'Riverside Night Market',
      place: 'Demo Riverside Park',
      from: 11,
      to: 12,
      rent: 150000,
      days: [],
      flavours
    });
  }
  return db;
}

function buildBazaars(flavours, opts) {
  const out = {};
  const stateOf = opts.bazaar ?? 'open';
  const a = uuid('e0000000', 1);
  const dayOne = {
    n: 1,
    on: -1,
    state: 'closed',
    sold: [18, 12, 9, 6],
    made: [24, 18, 12, 12],
    cash: 'short'
  };
  const dayTwo =
    stateOf === 'planned'
      ? { n: 2, on: 0, state: 'planned', sold: [0, 0, 0, 0], made: [20, 14, 10, 8] }
      : stateOf === 'allClosed'
        ? { n: 2, on: 0, state: 'closed', sold: [12, 9, 6, 6], made: [20, 14, 10, 8], cash: 'over' }
        : { n: 2, on: 0, state: 'open', sold: [4, 2, 1, 0], made: [20, 14, 10, 8] };
  const days =
    stateOf === 'plannedTomorrow'
      ? [
          dayOne,
          {
            n: 2,
            on: 0,
            state: 'closed',
            sold: [12, 9, 6, 6],
            made: [20, 14, 10, 8],
            cash: 'even'
          },
          { n: 3, on: 1, state: 'planned', sold: [0, 0, 0, 0], made: [18, 12, 10, 6] }
        ]
      : [dayOne, dayTwo];
  out[a] = makeBazaar({
    id: a,
    name:
      opts.data === 'long'
        ? 'Harbor Street Fair and Weekend Holiday Night Market with a very long fictional name'
        : 'Harbor Street Fair',
    place: 'Demo Harbor Plaza',
    from: -1,
    to: 1,
    rent: 250000,
    days,
    flavours,
    target: 800000
  });
  const b = uuid('e0000000', 2);
  out[b] = makeBazaar({
    id: b,
    name: 'October Sample Weekend',
    place: 'Sample Community Hall',
    from: -24,
    to: -23,
    rent: 100000,
    days: [
      {
        n: 1,
        on: -24,
        state: 'closed',
        sold: [20, 14, 8, 10],
        made: [24, 18, 12, 12],
        cash: 'even'
      },
      { n: 2, on: -23, state: 'closed', sold: [9, 6, 4, 2], made: [10, 8, 6, 4], cash: 'even' }
    ],
    flavours,
    target: 500000,
    finalised: true
  });
  return out;
}

export function makeBazaar({
  id,
  name,
  place,
  from,
  to,
  rent,
  days,
  flavours,
  target = null,
  finalised = false
}) {
  const pick = ['dcf', 'hc', 'wcb', 'pbm'];
  const unit = { dcf: 4800, hc: 5200, wcb: 5400, pbm: 4100 };
  const priceOf = (p) => flavours.find((f) => f.id === p)?.price_cents ?? 12500;
  const nameOf = (p) => flavours.find((f) => f.id === p)?.short_name ?? p;
  const tag = Number(String(id).slice(-1));
  const dayRows = days.map((d) => {
    const lines = pick.map((p, i) => ({
      product_id: p,
      name: nameOf(p),
      made: d.made[i],
      carried: 0,
      price_cents: priceOf(p),
      sold: d.sold[i],
      given: i === 0 && d.state === 'closed' ? 1 : 0,
      lost: i === 1 && d.state === 'closed' ? 1 : 0
    }));
    const revenue = lines.reduce((t, l) => t + l.sold * l.price_cents, 0);
    const freebie = lines.reduce((t, l) => t + l.given * l.price_cents, 0);
    const cashSales = Math.round(revenue * 0.6);
    const float = 200000;
    const fees = 15000;
    const closed = d.state === 'closed';
    const expected = float + cashSales - (closed ? fees : 0);
    const delta = d.cash === 'short' ? -2000 : d.cash === 'over' ? 1500 : 0;
    const count = closed
      ? lines.map((l) => {
          const left = l.made - l.sold - l.given - l.lost;
          return {
            product_id: l.product_id,
            left,
            carry_next: Math.floor(left / 2),
            to_shop: left - Math.floor(left / 2),
            written_off: 0,
            not_accounted: 0
          };
        })
      : null;
    return {
      id: uuid('d0000000', tag * 10 + d.n),
      day: ymd(d.on),
      event_id: d.state === 'planned' ? null : uuid('c0000000', tag * 10 + d.n),
      float_cents: float,
      lines,
      revenue_cents: revenue,
      gross_cents: revenue + freebie,
      discount_cents: 0,
      freebie_cents: freebie,
      by_pay: revenue ? { Cash: cashSales, GCash: revenue - cashSales } : {},
      sales: lines.reduce((t, l) => t + l.sold, 0),
      voided: closed ? 1 : 0,
      cash_sales_cents: cashSales,
      cash_expected_cents: expected,
      fees_cents: closed ? fees : 0,
      hash: hash(d.n),
      state: d.state,
      count,
      closed_at: closed ? T0 + (d.on - 1) * DAY + 8 * 3600000 : null,
      counted_cents: closed ? expected + delta : null,
      over_cents: closed ? Math.max(delta, 0) : null,
      short_cents: closed ? Math.max(-delta, 0) : null,
      changed_after_close: false
    };
  });
  const allClosed = dayRows.length > 0 && dayRows.every((d) => d.state === 'closed');
  const sum = (key) => dayRows.reduce((t, d) => t + d[key], 0);
  const across = (p, key) =>
    dayRows.reduce((t, d) => t + (d.lines.find((l) => l.product_id === p)?.[key] ?? 0), 0);
  const costLines = pick.map((p) => {
    const made = across(p, 'made');
    const sold = across(p, 'sold');
    const given = across(p, 'given');
    const lost = across(p, 'lost');
    const toShop = allClosed ? made - sold - given - lost : 0;
    const u = unit[p];
    return {
      product_id: p,
      name: nameOf(p),
      unit_cents: u,
      source: p === 'hc' ? 'typed' : 'recipe',
      made,
      to_shop: toShop,
      sold,
      given,
      lost,
      written_off: 0,
      not_accounted: 0,
      uncosted: false,
      made_cents: made * u,
      to_shop_cents: toShop * u,
      sold_cents: sold * u,
      given_cents: given * u,
      lost_cents: lost * u,
      written_off_cents: 0,
      not_accounted_cents: 0,
      cost_cents: (made - toShop) * u,
      rounding_cents: 0
    };
  });
  const total = (key) => costLines.reduce((t, l) => t + l[key], 0);
  const cookieCost = total('cost_cents');
  const revenue = sum('revenue_cents');
  const short = dayRows.reduce((t, d) => t + (d.short_cents ?? 0), 0);
  const over = dayRows.reduce((t, d) => t + (d.over_cents ?? 0), 0);
  const fees = rent + sum('fees_cents');
  const profit = revenue - fees - cookieCost + over - short;
  const byPay = {};
  for (const d of dayRows)
    for (const [k, v] of Object.entries(d.by_pay)) byPay[k] = (byPay[k] ?? 0) + v;
  const summary = {
    booking: {
      id,
      name,
      place,
      starts_on: ymd(from),
      ends_on: ymd(to),
      rent_cents: rent,
      active: true
    },
    counted: allClosed,
    days: dayRows,
    revenue: {
      revenue_cents: revenue,
      gross_cents: sum('gross_cents'),
      discount_cents: 0,
      freebie_cents: sum('freebie_cents'),
      by_pay: byPay,
      sales: sum('sales'),
      voided: sum('voided')
    },
    cash: { over_cents: over, short_cents: short },
    fees: {
      total_cents: fees,
      event_cents: rent,
      parts: [
        {
          client_id: 'rent:' + id,
          label: 'Stall rent',
          category: 'Bazaar rent',
          day_id: null,
          paid_on: ymd(from),
          amount_cents: rent
        },
        ...dayRows
          .filter((d) => d.fees_cents)
          .map((d) => ({
            client_id: 'fee-' + d.id,
            label: 'Parking',
            category: 'Bazaar fees',
            day_id: d.id,
            paid_on: d.day,
            amount_cents: d.fees_cents
          }))
      ]
    },
    cookie_cost: {
      cents: cookieCost,
      why: null,
      made_cents: total('made_cents'),
      to_shop_cents: total('to_shop_cents'),
      parts: [
        { label: 'Sold', quantity: total('sold'), amount_cents: total('sold_cents') },
        { label: 'Given away', quantity: total('given'), amount_cents: total('given_cents') },
        { label: 'Lost', quantity: total('lost'), amount_cents: total('lost_cents') },
        { label: 'Rounding', quantity: null, amount_cents: 0 }
      ],
      made: total('made'),
      to_shop: total('to_shop'),
      lines: costLines
    },
    profit: {
      cents: profit,
      why: null,
      parts: [
        { label: 'Revenue', amount_cents: revenue },
        { label: 'Fees', amount_cents: -fees },
        { label: 'Cookie cost', amount_cents: -cookieCost },
        { label: 'Cash over', amount_cents: over },
        { label: 'Cash short', amount_cents: -short }
      ]
    },
    target:
      target == null
        ? { cents: null, against_cents: null, revenue_needed_cents: null }
        : {
            cents: target,
            against_cents: profit - target,
            revenue_needed_cents: Math.max(target - profit, 0)
          },
    hash: hash(3)
  };
  return {
    summary,
    target_profit_cents: target,
    updated_at: STAMP,
    finalised_at: finalised ? iso(T0 - 22 * DAY) : null,
    final_hash: finalised ? hash(4) : null,
    final_summary: finalised ? JSON.parse(JSON.stringify(summary)) : null,
    stamps: dayRows.map((d) => ({ id: d.id, day: d.day, updated_at: STAMP })),
    costs: pick.map((p) => ({
      product_id: p,
      recipe_cents: p === 'hc' ? null : unit[p],
      recipe_read_at: STAMP,
      typed_cents: p === 'hc' ? unit[p] : null,
      typed_at: p === 'hc' ? STAMP : null
    })),
    losses: dayRows
      .filter((d) => d.state === 'closed')
      .map((d, i) => ({
        client_id: 'loss:' + uuid('11111111', i + 1),
        day_id: d.id,
        product_id: 'hc',
        qty: 1,
        reason: 'Dropped (fictional)',
        at: T0 - DAY
      })),
    stock_adds: []
  };
}
