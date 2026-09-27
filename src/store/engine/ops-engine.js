/**
 * The Happy Cookie Ops — domain engine.
 *
 * Ported verbatim from the interactive prototype (docs/reference/prototype.dc.html).
 * Every business rule, number format, toast string and state transition in here was
 * signed off by the owner against that prototype, so the port is deliberately literal:
 * the only edits are the four marked ones needed to run outside the prototype runtime
 * (asset paths, SSR-safe storage, restore-after-mount, React.Component base).
 *
 * Read docs/PORTING.md before changing anything in this file. Rules live here; the UI
 * under src/components reads them through the generated contract in
 * src/view-models/vals.ts.
 */
import * as React from 'react';

export const OpsContext = React.createContext(null);
export const OpsEngineContext = React.createContext(null);

const PESO = n => (Number(n) < 0 ? '−₱' : '₱') + Math.abs(Number(n)).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const PESO2 = n => (Number(n) < 0 ? '−₱' : '₱') + Math.abs(Number(n)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const thumb = (img, size, radius, shrink) => 'width:' + size + 'px;height:' + size + 'px;border-radius:' + radius + 'px;background:#F6F4F2 center/cover no-repeat url(' + img + ')' + (shrink ? ';flex-shrink:0' : '');

// ======================= real clock =======================
const MINUTE = 60000, HOUR = 3600000, DAY = 86400000;
const SEEDED_AT = Date.now();
const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = n => (n < 10 ? '0' : '') + n;
const clockText = ts => { const d = new Date(ts); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + pad2(d.getMinutes()) + ' ' + ap; };
const dowName = ts => DOW_NAMES[new Date(ts).getDay()];
const dateText = ts => { const d = new Date(ts); return d.getDate() + ' ' + MON_NAMES[d.getMonth()]; };
const longDateText = ts => dowName(ts) + ', ' + dateText(ts);
const shortWhen = ts => dowName(ts).slice(0, 3) + ' ' + dateText(ts);
const isSameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
const relWhen = (ts, now) => {
  if (ts == null) return '—';
  const d = now - ts;
  if (d < 0) return clockText(ts);
  if (d < 45000) return 'just now';
  if (d < HOUR) return Math.max(1, Math.round(d / MINUTE)) + ' min ago';
  if (isSameDay(ts, now)) return clockText(ts);
  if (d < 6 * DAY) return dowName(ts).slice(0, 3) + ' ' + clockText(ts);
  return dateText(ts);
};
const spanText = ms => {
  const m = Math.abs(ms);
  if (m < HOUR) return Math.max(1, Math.round(m / MINUTE)) + ' min';
  if (m < 2 * DAY) return (Math.round(m / HOUR * 10) / 10) + ' h';
  return (Math.round(m / DAY * 10) / 10) + ' days';
};
const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const atTime = (ts, h, m) => { const d = new Date(ts); d.setHours(h, m || 0, 0, 0); return d.getTime(); };

// the ordering week that contains `now`, straight from the owner's schedule
const dropCycle = (now, cfg) => {
  const today = startOfDay(now);
  const back = (new Date(today).getDay() - cfg.openDow + 7) % 7;
  let open = atTime(today - back * DAY, cfg.openH, cfg.openM);
  if (now < open) open -= 7 * DAY;
  const close = atTime(open + ((cfg.closeDow - cfg.openDow + 7) % 7) * DAY, cfg.closeH, cfg.closeM) + (cfg.extendH || 0) * HOUR;
  // pickup is the first Monday after ordering closes — the only day Cine hands boxes over
  let mon = atTime(startOfDay(close), 9, 0);
  while (new Date(mon).getDay() !== 1 || mon <= close) mon += DAY;
  const sat = atTime(open + ((6 - cfg.openDow + 7) % 7) * DAY, 10, 0);
  return { open, close, nextOpen: open + 7 * DAY, mon: mon, sat: sat, sun: atTime(sat + DAY, 14, 0) };
};
const windowsFor = cyc => [
  { id: 'mon', at: cyc.mon, endAt: atTime(cyc.mon, 17, 0), label: dowName(cyc.mon) + ' ' + dateText(cyc.mon), time: '9 AM – 5 PM' }
];

// ======================= owner-editable business rules =======================
const DEFAULT_CFG = {
  capacity: 200,
  taxRate: 3,
  drawerFloat: 1000,
  discountA: 20,
  discountB: 50,
  restHours: 24,
  doughWarnDays: 14,
  groceryBudget: 6000,
  packagingFee: 38.44,
  flatBoxPrice: 860,
  cogsMultiple: 4,
  priceMode: null,
  openDow: 1, openH: 9, openM: 0,
  closeDow: 4, closeH: 21, closeM: 0,
  extendH: 0,
  retention: '1 year',
  maxPerOrder: 24
};
const RETENTION_DAYS = { '6 months': 183, '1 year': 365, '2 years': 730, 'Keep until I delete them': 0 };

// ======================= opening books =======================
// One journal. Every peso in the P&L traces back to a line in here.
// [kind, days ago, category, description, amount]
const SEED_LEDGER = [
  ['expense', 11, 'Ingredients', 'S&R — butter 4 kg, cream cheese', 2140],
  ['expense', 8, 'Ingredients', 'Landers — biscoff, nutella, flour', 1880],
  ['expense', 4, 'Ingredients', 'Chocolate Lover — dark + white choc', 2450],
  ['expense', 2, 'Ingredients', 'Landers — biscoff spread, cocoa', 1620],
  ['expense', 2, 'Ingredients', 'Puregold — sugars, marshmallow', 1310],
  ['expense', 1, 'Ingredients', 'Wet market — eggs 3 trays', 540],
  ['expense', 17, 'Ingredients', 'Japanese grocery — shiro miso', 480],
  ['expense', 17, 'Ingredients', 'Baking supply — gel colour, soda', 420],
  ['expense', 17, 'Ingredients', 'Healthy Options — Maldon salt', 400],
  ['expense', 12, 'Packaging', 'Divisoria — boxes ×50', 720],
  ['expense', 12, 'Packaging', 'Divisoria — pouches ×100', 460],
  ['expense', 9, 'Packaging', 'Sticker Shop PH — sticker roll', 620],
  ['expense', 9, 'Packaging', 'Sticker Shop PH — thank-you cards', 380],
  ['expense', 10, 'Helper wages', 'Kristian — bake day', 1500],
  ['expense', 4, 'Helper wages', 'Ethan — bake day + packing', 1800],
  ['expense', 4, 'Helper wages', 'Misty — bazaar day', 1200],
  ['expense', 5, 'Bazaar rent', 'Katipunan Weekend Market — table', 1500],
  ['expense', 11, 'Transport', 'Grab — grocery run', 210],
  ['expense', 8, 'Transport', 'Grab — grocery run', 185],
  ['expense', 5, 'Transport', 'Lalamove — bazaar haul', 260],
  ['expense', 2, 'Transport', 'Grab — grocery run', 120],
  ['expense', 1, 'Transport', 'Jeep + tricycle — wet market', 85],
  ['expense', 7, 'Marketing / influencer', 'Sent 2 boxes to @foodie.mnl', 700],
  ['expense', 3, 'Marketing / influencer', 'Boosted Instagram reel', 500],
  ['expense', 9, 'Printing / collateral', 'Menu cards + tent card print', 640],
  ['expense', 6, 'Other', 'Chiller thermometer', 190],
  ['expense', 2, 'Other', 'Dish soap, gloves', 120],
  ['revenue', 21, 'Drops', 'Drop 29 · 14 orders · 84 cookies', 6980],
  ['revenue', 14, 'Drops', 'Drop 30 · 15 orders · 90 cookies', 7460],
  ['revenue', 7, 'Drops', 'Drop 31 · 13 orders · 78 cookies', 6890],
  ['revenue', 5, 'Bazaar', 'Katipunan Weekend Market', 9880]
];
const seedLedger = () => SEED_LEDGER.map((e, i) => ({
  id: 'L' + pad2(i + 1), kind: e[0], at: SEEDED_AT - e[1] * DAY + i * MINUTE,
  cat: e[2], label: e[3], amount: e[4], seed: true
}));
// profit before this journal starts — kept as history, never recalculated
const PRIOR_MONTHS = [{ label: 'May', amount: 8940 }, { label: 'Jun', amount: 11620 }, { label: 'Jul', amount: 12880 }];

// the bundler swaps file paths for inlined data; unbundled, a path is already the answer
// Prototype asset resolver. In the app the same files are served from /public.
const RES = p => '/' + String(p).replace(/^\/+/, '');

const PAY_ACCOUNTS = [
  { id: 'GCash', num: '0962 962 ••••', name: 'Francine Reyna To', qr: 'assets/qr-gcash.png' },
  { id: 'Maya', num: '+63 ••• ••• 5341', name: '@cinereyna', qr: 'assets/qr-maya.png' },
  { id: 'GoTyme', num: '••••••• 7002', name: 'Francine Reyna To', qr: 'assets/qr-gotyme.png' }
];

const PRODUCTS = [
  { id: 'dcf', name: 'double chocolate fudge', short: 'Double Chocolate Fudge', price: 130, img: 'assets/double-chocolate-fudge.png', kind: 'Permanent', tag: '', desc: 'golden-brown edges and soft, pillowy center studded with pools of molten chocolate.' },
  { id: 'hc', name: 'happy camper', short: 'Happy Camper', price: 140, img: 'assets/happy-camper.png', kind: 'Permanent', tag: '', desc: 'browned butter, toasted marshmallow pockets, melted milk chocolate, graham cracker crunch.' },
  { id: 'wcb', name: 'white chocolate biscoff', short: 'White Chocolate Biscoff', price: 145, img: 'assets/white-chocolate-biscoff.png', kind: 'Permanent', tag: 'Best seller', desc: 'crunchy, caramelized biscuit, biscoff cookie butter. white chocolate chips that melts in your mouth.' },
  { id: 'pbm', name: 'pb & miso', short: 'PB & Miso', price: 80, img: 'assets/pb-miso.png', kind: 'Permanent', tag: 'Best seller', desc: 'white shiro miso infused with chunky peanut butter. sugar-crusted outside, soft center.' },
  { id: 'rvc', name: 'red velvet cheesecake', short: 'Red Velvet Cheesecake', price: 150, img: 'assets/red-velvet-cheesecake.png', kind: 'Rotating', tag: 'New', desc: 'rich red velvet packed with melted white chocolate and a tangy cream cheese center.' },
  { id: 'nch', name: 'nutella churro', short: 'Nutella Churro', price: 200, img: 'assets/nutella-churro.png', kind: 'Rotating', tag: 'New', desc: 'churro-inspired cinnamon sugar base, soft cookie center filled with rich molten nutella.' }
];

const P = {};
PRODUCTS.forEach(p => { P[p.id] = p; });
const SEED_PRICES = {};
PRODUCTS.forEach(p => { SEED_PRICES[p.id] = p.price; });
// MP-09 c engine exception (docs/state/protected-exception.md): live mode swaps in the
// flavour list loaded from the database. The same objects, replaced in place.
export const replaceFlavours = (list, allergens) => {
  PRODUCTS.splice(0, PRODUCTS.length, ...list);
  [P, SEED_PRICES, ALLERGENS].forEach(o => Object.keys(o).forEach(k => { delete o[k]; }));
  PRODUCTS.forEach(p => { P[p.id] = p; SEED_PRICES[p.id] = p.price; ALLERGENS[p.id] = allergens[p.id] || ''; });
};

const SCREENS = ['today', 'sales', 'orders', 'order', 'lookup', 'reconcile', 'bake', 'batch', 'inventory', 'stocktake', 'more', 'grocery', 'bazaar', 'pnl', 'formqueue', 'health', 'products', 'notifications', 'shop', 'checkout', 'status', 'recipes', 'drops', 'suppliers', 'settings'];
const CUSTOMER_SCREENS = ['shop', 'checkout', 'status', 'lookup'];

// shelf life, as real dates that actually run down
const USE_BY_DAYS = {
  'Unsalted butter': 9, 'Cream cheese': 5, 'Eggs': 13,
  'Milk chocolate': 96, 'Dark chocolate 55%': 128, 'White chocolate chips': 110,
  'Biscoff spread': 60, 'Nutella': 74
};
const SEED_USE_BY = {};
Object.keys(USE_BY_DAYS).forEach(k => { SEED_USE_BY[k] = SEEDED_AT + USE_BY_DAYS[k] * DAY; });

const ALLERGENS = {
  dcf: 'milk, eggs, wheat, soy', hc: 'milk, eggs, wheat, soy', wcb: 'milk, eggs, wheat, soy',
  pbm: 'milk, eggs, wheat, soy, peanuts', rvc: 'milk, eggs, wheat, soy', nch: 'milk, eggs, wheat, soy, tree nuts'
};

const RECIPES = {
  wcb: { yield: 24, ing: [['Unsalted butter', 340, 'g'], ['Brown sugar', 300, 'g'], ['White sugar', 150, 'g'], ['Eggs', 2, 'pcs'], ['Bread flour', 480, 'g'], ['Baking soda', 6, 'g'], ['Fine salt', 5, 'g'], ['Biscoff spread', 250, 'g'], ['Biscoff biscuits', 120, 'g'], ['White chocolate chips', 300, 'g']] },
  hc: { yield: 14, ing: [['Unsalted butter', 340, 'g'], ['Brown sugar', 320, 'g'], ['Eggs', 2, 'pcs'], ['Bread flour', 470, 'g'], ['Baking soda', 6, 'g'], ['Fine salt', 5, 'g'], ['Milk chocolate', 280, 'g'], ['Mini marshmallows', 150, 'g'], ['Graham crackers', 120, 'g']] },
  dcf: { yield: 24, ing: [['Unsalted butter', 320, 'g'], ['Brown sugar', 300, 'g'], ['Eggs', 2, 'pcs'], ['Bread flour', 400, 'g'], ['Cocoa powder', 90, 'g'], ['Baking soda', 6, 'g'], ['Dark chocolate 55%', 380, 'g'], ['Maldon sea salt', 8, 'g']] },
  pbm: { yield: 24, ing: [['Unsalted butter', 260, 'g'], ['Brown sugar', 280, 'g'], ['Eggs', 2, 'pcs'], ['All-purpose flour', 440, 'g'], ['Chunky peanut butter', 320, 'g'], ['Shiro miso', 60, 'g'], ['Baking soda', 6, 'g'], ['White sugar', 120, 'g']] },
  rvc: { yield: 24, ing: [['Unsalted butter', 300, 'g'], ['White sugar', 280, 'g'], ['Eggs', 2, 'pcs'], ['All-purpose flour', 430, 'g'], ['Cocoa powder', 40, 'g'], ['Red velvet gel colour', 12, 'ml'], ['Cream cheese', 300, 'g'], ['White chocolate chips', 220, 'g']] },
  nch: { yield: 13, ing: [['Unsalted butter', 300, 'g'], ['White sugar', 260, 'g'], ['Eggs', 2, 'pcs'], ['All-purpose flour', 450, 'g'], ['Cinnamon', 24, 'g'], ['Nutella', 360, 'g'], ['Baking soda', 6, 'g'], ['Vanilla extract', 10, 'ml']] }
};

const RAW_ORDERS = [
  { id: 'HC-1042', name: 'Bea Villanueva', ig: '@beavill', email: 'bea@mailbox.ph', mobile: '0917 402 1188', items: { wcb: 3, hc: 2, dcf: 1 }, status: 'Confirmed', pay: 'GCash', ref: '1027 8842 1190', day: 'sat', agoH: 56 },
  { id: 'HC-1043', name: 'Miguel Santos', ig: '', email: 'miguel@mailbox.ph', mobile: '0918 220 7741', items: { dcf: 2, hc: 2, pbm: 2 }, status: 'Confirmed', pay: 'Maya', ref: 'MY-77120', day: 'sat', agoH: 54 },
  { id: 'HC-1044', name: 'Joanna Reyes', ig: '@jo.reyes', email: 'joanna@mailbox.ph', mobile: '0917 881 3320', items: { wcb: 4, rvc: 4, nch: 2, pbm: 2 }, status: 'Preparing', pay: 'GCash', ref: '1027 8851 0034', day: 'sun', agoH: 51 },
  { id: 'HC-1045', name: 'Karla Mendoza', ig: '', email: 'karla@mailbox.ph', mobile: '0995 118 4402', items: { rvc: 3, wcb: 3 }, status: 'Confirmed', pay: 'GoTyme', ref: 'GT-40218', day: 'sat', agoH: 46 },
  { id: 'HC-1046', name: 'Paolo Cruz', ig: '@paolocrz', email: 'paolo@mailbox.ph', mobile: '0917 664 2019', items: { hc: 3, dcf: 3 }, status: 'Confirmed', pay: 'GCash', ref: '1027 8860 7741', day: 'sat', agoH: 33 },
  { id: 'HC-1047', name: 'Trisha Lim', ig: '', email: 'trisha@mailbox.ph', mobile: '0918 771 5560', items: { wcb: 3, pbm: 2, nch: 1 }, status: 'Confirmed', pay: 'Bank transfer', ref: 'BPI-882140', day: 'sun', agoH: 30 },
  { id: 'HC-1048', name: 'Andrei Bautista', ig: '', email: 'andrei@mailbox.ph', mobile: '0917 335 8890', items: { dcf: 4, hc: 2 }, status: 'Confirmed', pay: 'GCash', ref: '1027 8871 2265', day: 'sun', agoH: 26 },
  { id: 'HC-1049', name: 'Nikka Domingo', ig: '@nikkadmg', email: 'nikka@mailbox.ph', mobile: '0995 447 1120', items: { wcb: 3, rvc: 3 }, status: 'Ready', pay: 'Maya', ref: 'MY-77390', day: 'sat', agoH: 22 },
  { id: 'HC-1050', name: 'Rafael Gomez', ig: '', email: 'rafael@mailbox.ph', mobile: '0917 220 9931', items: { pbm: 6, dcf: 3, hc: 3 }, status: 'Confirmed', pay: 'GCash', ref: '1027 8880 1902', day: 'sun', agoH: 11 },
  { id: 'HC-1051', name: 'Denise Alonzo', ig: '@denisealz', email: 'denise@mailbox.ph', mobile: '0918 559 3374', items: { wcb: 4, rvc: 1, nch: 1 }, status: 'Confirmed', pay: 'GCash', ref: '1027 8881 4477', day: 'sun', agoH: 10 },
  { id: 'HC-1052', name: 'Chloe Tan', ig: '', email: 'chloe@mailbox.ph', mobile: '0917 118 6642', items: { dcf: 4, hc: 2 }, status: 'Confirmed', pay: 'GoTyme', ref: 'GT-40566', day: 'sat', agoH: 8 },
  { id: 'HC-1053', name: 'Grace Ocampo', ig: '@graceocampo', email: 'grace@mailbox.ph', mobile: '0995 330 2214', items: { wcb: 2, hc: 2, rvc: 2 }, status: 'Payment review', pay: 'GCash', ref: '1027 8880 1902', day: 'sat', agoH: 5, warn: 'Reference 1027 8880 1902 was already used by HC-1050' },
  { id: 'HC-1054', name: 'Ivan Del Rosario', ig: '', email: 'ivan@mailbox.ph', mobile: '0917 902 4418', items: { dcf: 3, pbm: 3 }, status: 'Payment review', pay: 'Maya', ref: 'MY-77502', day: 'sun', agoH: 3, warn: 'Paid ₱600 but the order total is ₱630', warnPlain: 'The amount sent does not match the order total', paidAmount: 600 },
  { id: 'HC-1055', name: 'Mariel Aquino', ig: '@marielaq', email: 'mariel@mailbox.ph', mobile: '0918 447 7702', items: { nch: 2, rvc: 2, wcb: 2 }, status: 'Payment review', pay: 'GCash', ref: '1027 8890 3311', day: 'sat', agoH: 1, warn: 'Screenshot is cropped — reference number is not readable' }
];

const orderCount = o => Object.keys(o.items).reduce((t, k) => t + o.items[k], 0);
const itemSummary = o => Object.keys(o.items).map(k => o.items[k] + '× ' + P[k].short).join(', ');

const INVENTORY = [
  { cat: 'Ingredients', name: 'Unsalted butter', qty: 900, unit: 'g', level: 2000, supplier: 'S&R Membership', agoD: 3 },
  { cat: 'Ingredients', name: 'Bread flour', qty: 4200, unit: 'g', level: 3000, supplier: 'Landers', agoD: 3 },
  { cat: 'Ingredients', name: 'All-purpose flour', qty: 3800, unit: 'g', level: 2500, supplier: 'Landers', agoD: 3 },
  { cat: 'Ingredients', name: 'Brown sugar', qty: 2600, unit: 'g', level: 2000, supplier: 'Puregold', agoD: 3 },
  { cat: 'Ingredients', name: 'White sugar', qty: 1900, unit: 'g', level: 1500, supplier: 'Puregold', agoD: 3 },
  { cat: 'Ingredients', name: 'Eggs', qty: 24, unit: 'pcs', level: 18, supplier: 'Wet market', agoD: 2 },
  { cat: 'Ingredients', name: 'Dark chocolate 55%', qty: 1450, unit: 'g', level: 1000, supplier: 'Chocolate Lover', agoD: 5 },
  { cat: 'Ingredients', name: 'Milk chocolate', qty: 820, unit: 'g', level: 600, supplier: 'Chocolate Lover', agoD: 5 },
  { cat: 'Ingredients', name: 'White chocolate chips', qty: 1100, unit: 'g', level: 800, supplier: 'Chocolate Lover', agoD: 5 },
  { cat: 'Ingredients', name: 'Cocoa powder', qty: 640, unit: 'g', level: 400, supplier: 'Landers', agoD: 5 },
  { cat: 'Ingredients', name: 'Biscoff spread', qty: 90, unit: 'g', level: 500, supplier: 'Landers', agoD: 3 },
  { cat: 'Ingredients', name: 'Biscoff biscuits', qty: 480, unit: 'g', level: 300, supplier: 'Landers', agoD: 3 },
  { cat: 'Ingredients', name: 'Chunky peanut butter', qty: 900, unit: 'g', level: 600, supplier: 'S&R Membership', agoD: 3 },
  { cat: 'Ingredients', name: 'Shiro miso', qty: 220, unit: 'g', level: 150, supplier: 'Japanese grocery', agoD: 17 },
  { cat: 'Ingredients', name: 'Cream cheese', qty: 700, unit: 'g', level: 500, supplier: 'S&R Membership', agoD: 3 },
  { cat: 'Ingredients', name: 'Nutella', qty: 950, unit: 'g', level: 600, supplier: 'Landers', agoD: 3 },
  { cat: 'Ingredients', name: 'Mini marshmallows', qty: 380, unit: 'g', level: 300, supplier: 'Puregold', agoD: 5 },
  { cat: 'Ingredients', name: 'Graham crackers', qty: 420, unit: 'g', level: 250, supplier: 'Puregold', agoD: 5 },
  { cat: 'Ingredients', name: 'Cinnamon', qty: 160, unit: 'g', level: 80, supplier: 'Landers', agoD: 17 },
  { cat: 'Ingredients', name: 'Baking soda', qty: 240, unit: 'g', level: 100, supplier: 'Puregold', agoD: 17 },
  { cat: 'Ingredients', name: 'Fine salt', qty: 500, unit: 'g', level: 200, supplier: 'Puregold', agoD: 17 },
  { cat: 'Ingredients', name: 'Maldon sea salt', qty: 180, unit: 'g', level: 100, supplier: 'Healthy Options', agoD: 17 },
  { cat: 'Ingredients', name: 'Vanilla extract', qty: 120, unit: 'ml', level: 60, supplier: 'Landers', agoD: 17 },
  { cat: 'Ingredients', name: 'Red velvet gel colour', qty: 45, unit: 'ml', level: 20, supplier: 'Baking supply', agoD: 17 },
  { cat: 'Packaging', name: 'Box of 6', qty: 9, unit: 'pcs', level: 20, supplier: 'Divisoria Packaging', agoD: 3 },
  { cat: 'Packaging', name: 'Single cookie pouch', qty: 64, unit: 'pcs', level: 40, supplier: 'Divisoria Packaging', agoD: 3 },
  { cat: 'Packaging', name: 'Brand sticker', qty: 4, unit: 'pcs', level: 25, supplier: 'Sticker Shop PH', agoD: 3 },
  { cat: 'Packaging', name: 'Thank-you card', qty: 42, unit: 'pcs', level: 25, supplier: 'Sticker Shop PH', agoD: 17 },
  { cat: 'Packaging', name: 'Paper bag', qty: 30, unit: 'pcs', level: 20, supplier: 'Divisoria Packaging', agoD: 17 },
  { cat: 'Packaging', name: 'Bubble wrap sheet', qty: 55, unit: 'pcs', level: 30, supplier: 'Divisoria Packaging', agoD: 17 }
];

const ROLES = {
  owner: { label: 'Cine', who: 'Cine To · owner', screens: null, money: true, cashup: true, home: 'today',
    more: null, sub: 'Interactive prototype · owner view · mock data', note: '' },
  helper: { label: 'Kristian', who: 'Kristian · helper', money: false, cashup: true, home: 'today',
    screens: ['today', 'sales', 'bazaar'],
    more: null,
    sub: 'Interactive prototype · helper view · mock data',
    note: 'You are seeing what a helper sees. Costs, expenses and profit are hidden.' },
  support: { label: 'KETH AI', who: 'KETH AI · technical support', money: false, cashup: false, home: 'health',
    screens: ['health', 'notifications', 'more'],
    more: ['System health', 'Notifications'],
    sub: 'Interactive prototype · support view · mock data',
    note: 'Technical support access. System health and backups only — no customer or money data.' }
};

const SUPPLIERS = [
  { name: 'S&R Membership', place: 'Congressional Ave', items: [
    { item: 'Unsalted butter', pack: '1 kg block', price: 420, prev: [438, 445], last: '2 Aug', preferred: true },
    { item: 'Cream cheese', pack: '900 g tub', price: 610, prev: [598], last: '2 Aug', preferred: true },
    { item: 'Chunky peanut butter', pack: '1 kg jar', price: 385, prev: [399], last: '11 Aug', preferred: true }
  ] },
  { name: 'Landers', place: 'Balintawak', items: [
    { item: 'Biscoff spread', pack: '400 g jar', price: 285, prev: [279, 295], last: '11 Aug', preferred: true },
    { item: 'Nutella', pack: '750 g jar', price: 465, prev: [480], last: '5 Aug', preferred: true },
    { item: 'Bread flour', pack: '1 kg', price: 92, prev: [88], last: '5 Aug', preferred: true },
    { item: 'Unsalted butter', pack: '1 kg block', price: 455, prev: [450], last: '19 Jul', preferred: false }
  ] },
  { name: 'Chocolate Lover', place: 'Online · ships in 2 days', items: [
    { item: 'Dark chocolate 55%', pack: '1 kg', price: 720, prev: [740, 715], last: '9 Aug', preferred: true },
    { item: 'White chocolate chips', pack: '1 kg', price: 680, prev: [690], last: '9 Aug', preferred: true },
    { item: 'Milk chocolate', pack: '1 kg', price: 640, prev: [655], last: '9 Aug', preferred: true }
  ] },
  { name: 'Divisoria Packaging', place: 'Tabora St', items: [
    { item: 'Box of 6', pack: 'Pack of 25', price: 375, prev: [360, 355], last: '1 Aug', preferred: true },
    { item: 'Single cookie pouch', pack: 'Pack of 100', price: 240, prev: [235], last: '1 Aug', preferred: true }
  ] },
  { name: 'Sticker Shop PH', place: 'Online · Shopee', items: [
    { item: 'Brand sticker', pack: 'Roll of 100', price: 205, prev: [199], last: '4 Aug', preferred: true },
    { item: 'Thank-you card', pack: 'Pack of 50', price: 180, prev: [175], last: '4 Aug', preferred: true }
  ] },
  { name: 'Puregold', place: 'Fairview', items: [
    { item: 'Brown sugar', pack: '1 kg', price: 78, prev: [75], last: '11 Aug', preferred: true },
    { item: 'White sugar', pack: '1 kg', price: 68, prev: [70], last: '11 Aug', preferred: true },
    { item: 'Unsalted butter', pack: '1 kg block', price: 438, prev: [430], last: '5 Jul', preferred: false }
  ] },
  { name: 'Wet market', place: 'Novaliches', items: [
    { item: 'Eggs', pack: 'Tray of 30', price: 240, prev: [252, 235], last: '12 Aug', preferred: true }
  ] },
  { name: 'Baking supply', place: 'Shopee · Baker\u2019s Depot', items: [
    { item: 'All-purpose flour', pack: '1 kg', price: 74, prev: [78], last: '5 Aug', preferred: true },
    { item: 'Cocoa powder', pack: '500 g', price: 320, prev: [335], last: '9 Aug', preferred: true },
    { item: 'Biscoff biscuits', pack: '250 g', price: 165, prev: [172], last: '11 Aug', preferred: true },
    { item: 'Baking soda', pack: '500 g', price: 85, prev: [82], last: '28 Jul', preferred: true },
    { item: 'Fine salt', pack: '500 g', price: 45, prev: [45], last: '28 Jul', preferred: true },
    { item: 'Vanilla extract', pack: '250 ml', price: 280, prev: [290], last: '28 Jul', preferred: true },
    { item: 'Red velvet gel colour', pack: '100 ml', price: 195, prev: [205], last: '28 Jul', preferred: true },
    { item: 'Mini marshmallows', pack: '500 g', price: 145, prev: [150], last: '9 Aug', preferred: true },
    { item: 'Graham crackers', pack: '500 g', price: 130, prev: [128], last: '9 Aug', preferred: true },
    { item: 'Cinnamon', pack: '250 g', price: 175, prev: [180], last: '28 Jul', preferred: true },
    { item: 'Shiro miso', pack: '500 g', price: 340, prev: [355], last: '28 Jul', preferred: true },
    { item: 'Maldon sea salt', pack: '250 g', price: 420, prev: [430], last: '28 Jul', preferred: true }
  ] }
];

const PACK_SIZE = {
  'Unsalted butter': 1000, 'Cream cheese': 900, 'Chunky peanut butter': 1000, 'Biscoff spread': 400,
  'Nutella': 750, 'Bread flour': 1000, 'All-purpose flour': 1000, 'Dark chocolate 55%': 1000,
  'White chocolate chips': 1000, 'Milk chocolate': 1000, 'Cocoa powder': 500, 'Biscoff biscuits': 250,
  'Brown sugar': 1000, 'White sugar': 1000, 'Eggs': 30, 'Shiro miso': 500, 'Mini marshmallows': 500,
  'Graham crackers': 500, 'Cinnamon': 250, 'Baking soda': 500, 'Fine salt': 500, 'Maldon sea salt': 250,
  'Vanilla extract': 250, 'Red velvet gel colour': 100,
  'Box of 6': 25, 'Single cookie pouch': 100, 'Brand sticker': 100, 'Thank-you card': 50,
  'Paper bag': 25, 'Bubble wrap sheet': 50
};

const BEST_BUY = {};
SUPPLIERS.forEach(v => v.items.forEach(i => {
  if (!BEST_BUY[i.item] || i.price < BEST_BUY[i.item].price) BEST_BUY[i.item] = { price: i.price, pack: i.pack, supplier: v.name };
}));

const OPTIONS_FOR = item => SUPPLIERS.filter(v => v.items.some(i => i.item === item)).map(v => {
  const i = v.items.filter(x => x.item === item)[0];
  return { name: v.name, price: i.price, pack: i.pack, last: i.last };
}).sort((a, b) => a.price - b.price);

// "1 kg block" -> "1 kg blocks"; "Pack of 25" -> "packs of 25"; "500 g" -> "500 g packs"
const packPhrase = pack => {
  const p = pack.toLowerCase();
  if (p.indexOf('pack of') === 0) return 'packs of' + p.slice(7);
  if (p.indexOf('roll of') === 0) return 'rolls of' + p.slice(7);
  if (p.indexOf('tray of') === 0) return 'trays of' + p.slice(7);
  if (/(block|jar|tub|bag|bottle)$/.test(p)) return p + 's';
  return p + ' packs';
};
const packWord = (pack, many) => {
  const p = pack.toLowerCase();
  if (p.indexOf('pack of') === 0) return many ? 'packs' : 'pack';
  if (p.indexOf('roll of') === 0) return many ? 'rolls' : 'roll';
  if (p.indexOf('tray of') === 0) return many ? 'trays' : 'tray';
  const m = p.match(/(block|jar|tub|bag|bottle)$/);
  if (m) return many ? m[1] + 's' : m[1];
  return many ? 'packs' : 'pack';
};

// exact, never rounded — 1346 g reads 1.346 kg
const amt = (n, unit) => {
  const v = Number(n) || 0;
  if (unit === 'g' && Math.abs(v) >= 1000) {
    return (Math.round(v) / 1000).toLocaleString('en-PH', { maximumFractionDigits: 3 }) + ' kg';
  }
  return (Math.round(v * 1000) / 1000).toLocaleString('en-PH', { maximumFractionDigits: 3 }) + ' ' + unit;
};

// exact — no rounding, for anywhere the number is the thing being corrected
const amtExact = (n, unit) => {
  const v = Math.round(Number(n) * 1000) / 1000;
  return v.toLocaleString('en-PH', { maximumFractionDigits: 3 }) + ' ' + unit;
};

const SCREEN_NAMES = {
  today: 'Home', bake: 'the bake plan', batch: 'production', orders: 'Orders', order: 'the order',
  inventory: 'Inventory', grocery: 'the grocery list', bazaar: 'Bazaar', pnl: 'Money',
  sales: 'the sales log', reconcile: 'Payments', formqueue: 'the form queue', health: 'System health',
  shop: 'the shop', checkout: 'checkout', status: 'the status page', more: 'All tools'
};

const FLOWS = {
  f1: { tag: 'Flow 1', title: 'Customer order', steps: [
    { hint: 'shop', label: 'Open the customer ordering page', screen: 'more' },
    { hint: 'box', label: 'Pick your cookies \u2014 any quantity', screen: 'shop' },
    { hint: 'details', label: 'Fill in details and pickup', screen: 'checkout' },
    { hint: 'proof', label: 'Choose payment and attach proof', screen: 'checkout' },
    { hint: 'submit', label: 'Submit the order', screen: 'checkout' },
    { hint: 'status', label: 'See the private status link', screen: 'status' }
  ] },
  f2: { tag: 'Flow 2', title: 'Payment review', steps: [
    { hint: 'payments', label: 'Open payments needing review', screen: 'today' },
    { hint: 'openOrder', label: 'Open a flagged order', screen: 'orders' },
    { hint: 'proofView', label: 'Check the proof and reference', screen: 'order' },
    { hint: 'confirm', label: 'Confirm or reject the payment', screen: 'order' }
  ] },
  f3: { tag: 'Flow 3', title: 'Production', steps: [
    { hint: 'bake', label: 'Open the bake plan from Today', screen: 'today' },
    { hint: 'plan', label: 'Tap the dough count on a flavour row', screen: 'bake' },
    { hint: 'batch', label: 'Tap Bake on a row with dough', screen: 'bake' },
    { hint: 'yield', label: 'Enter how many came out, then Next', screen: 'batch' },
    { hint: 'deduct', label: 'Open "what it used" and check the amounts', screen: 'batch' },
    { hint: 'done', label: 'Confirm production', screen: 'batch' }
  ] },
  f4: { tag: 'Flow 4', title: 'Grocery', steps: [
    { hint: 'grocery', label: 'Open the grocery list from Today', screen: 'today' },
    { hint: 'why', label: 'Read why something is short', screen: 'grocery' },
    { hint: 'supplier', label: 'Compare suppliers', screen: 'grocery' },
    { hint: 'bought', label: 'Mark an item bought', screen: 'grocery' },
    { hint: 'received', label: 'Receive it into inventory', screen: 'grocery' }
  ] },
  f5: { tag: 'Flow 5', title: 'Stocktake', steps: [
    { hint: 'stocktake', label: 'Start the weekly count', screen: 'inventory' },
    { hint: 'count', label: 'Enter what you actually counted', screen: 'inventory' },
    { hint: 'reconcile', label: 'Reconcile the difference', screen: 'inventory' }
  ] },
  f9: { tag: 'Flow 9', title: 'System problem', steps: [
    { hint: 'health', label: 'Open System health from the alert', screen: 'today' },
    { hint: 'retry', label: 'Retry the backup', screen: 'health' }
  ] },
  f6: { tag: 'Flow 6', title: 'Bazaar', steps: [
    { hint: 'bazaar', label: 'Open Bazaar Mode', screen: 'more' },
    { hint: 'startEvent', label: 'Start the event, then load baked cookies onto the table', screen: 'bazaar' },
    { hint: 'sale', label: 'Record a few sales', screen: 'bazaar' },
    { hint: 'offline', label: 'Lose connection, keep selling', screen: 'bazaar' },
    { hint: 'sync', label: 'Reconnect and sync', screen: 'bazaar' },
    { hint: 'close', label: 'Close out and see event profit', screen: 'bazaar' }
  ] },
  f7: { tag: 'Flow 7', title: 'Money', steps: [
    { hint: 'pnl', label: 'Open the P&L', screen: 'today' },
    { hint: 'drill', label: 'Tap an amount to see the records', screen: 'pnl' },
    { hint: 'expense', label: 'Add an expense', screen: 'pnl' },
    { hint: 'category', label: 'Edit your expense categories', screen: 'pnl' }
  ] },
  f10: { tag: 'Flow 10', title: 'Match your payments', steps: [
    { hint: 'reconcile', label: 'Open Payments from All tools', screen: 'more' },
    { hint: 'tick', label: 'Tick each reference you can see in your wallet', screen: 'reconcile' },
    { hint: 'flag', label: 'Open anything flagged as odd or duplicated', screen: 'reconcile' }
  ] },
  f11: { tag: 'Flow 11', title: 'Pickup day', steps: [
    { hint: 'ready', label: 'Filter orders down to Ready', screen: 'orders' },
    { hint: 'collect', label: 'Check the pickup code and mark collected', screen: 'order' },
    { hint: 'noshow', label: 'Record a no-show if nobody comes', screen: 'order' }
  ] },
  f8: { tag: 'Flow 8', title: 'Form queue', steps: [
    { hint: 'queue', label: 'Open the Google Form queue', screen: 'more' },
    { hint: 'review', label: 'Review the unclear response', screen: 'formqueue' },
    { hint: 'fix', label: 'Fix the suggested order', screen: 'formqueue' },
    { hint: 'accept', label: 'Accept or reject it', screen: 'formqueue' }
  ] }
};

const STORE_KEY = 'hc-ops-state-v1';
// some browsers (private mode, embedded frames) throw on localStorage; fall back rather than lose her work
const STORES = (function () {
  const out = [];
  if (typeof window === 'undefined') return out;
  ['localStorage', 'sessionStorage'].forEach(n => {
    try { const s = window[n]; s.setItem('__hc', '1'); s.removeItem('__hc'); out.push(s); } catch (e) {}
  });
  return out;
})();
const storeRead = () => { for (let i = 0; i < STORES.length; i++) { try { const v = STORES[i].getItem(STORE_KEY); if (v) return v; } catch (e) {} } return null; };
const storeWrite = json => { let ok = false; STORES.forEach(s => { try { s.setItem(STORE_KEY, json); ok = true; } catch (e) {} }); return ok; };
const storeClear = () => STORES.forEach(s => { try { s.removeItem(STORE_KEY); } catch (e) {} });
const EPHEMERAL = ['now', 'toast', 'sheet', 'quick', 'navTick', 'navDir', 'history', 'flowId', 'flowStep', 'pnlDrill', 'lookupQ', 'lookupTried', 'q',
  // which frame, which role and which screen are prototype chrome, not her books
  'device', 'role', 'screen', 'orderId', 'restored', 'savedAt', 'priceDraft'];

const BASE_STATE = () => ({
  device: 'mobile',
  screen: 'today',
  history: [],
  now: Date.now(),
  savedAt: null,
  cfg: Object.assign({}, DEFAULT_CFG),
  ledger: seedLedger(),
  online: true,
  flowId: null,
  flowStep: 0,
  toast: null,
  sheet: null,
  orderId: null,
  unsynced: 0,
  syncState: 'idle',
  backup: 'failed',
  backupAt: SEEDED_AT - 2 * DAY,
  orders: RAW_ORDERS.map(o => Object.assign({}, o, { priced: SEED_PRICES, placedAt: SEEDED_AT - o.agoH * HOUR, drop: 32 })),
  prices: Object.assign({}, SEED_PRICES),
  doughPrep: null,
  inv: INVENTORY.map(i => Object.assign({}, i, { updatedAt: SEEDED_AT - i.agoD * DAY, useBy: SEED_USE_BY[i.name] || null })),
  shopOverride: null,
  dropActive: { wcb: true, hc: true, dcf: true, pbm: true, rvc: true, nch: true },
  supplierOpen: 'S&R Membership',
  role: 'owner',
  recipes: JSON.parse(JSON.stringify(RECIPES)),
  recipeBase: JSON.parse(JSON.stringify(RECIPES)),
  recipeHistory: {},
  batches: [
    { pid: 'wcb', qty: 14, version: 1, at: SEEDED_AT - 4 * DAY },
    { pid: 'dcf', qty: 12, version: 1, at: SEEDED_AT - 4 * DAY },
    { pid: 'hc', qty: 10, version: 1, at: SEEDED_AT - 3 * DAY }
  ],
  recipeOpen: 'wcb',
  recipeVer: { wcb: 1, hc: 1, dcf: 1, pbm: 1, rvc: 1, nch: 1 },
  recipeDirty: {},
  dropNo: 32,
  doughAt: { wcb: SEEDED_AT - 30 * HOUR, dcf: SEEDED_AT - 9 * HOUR, pbm: SEEDED_AT - 16 * DAY },
  shortfalls: [],
  drawer: null,
  saleRef: '',
  tendered: '',
  cartDiscount: 0,
  queueArchive: [],
  partial: {},
  plannedBuy: {},
  subs: {},
  paid: {},
  lookupQ: '',
  lookupTried: false,
  variances: [],
  spoilage: [],
  countLog: [],
  soldOut: { nch: true },
  invoiceSeq: 128,
  orderSeq: 1055,
  notifRead: {},
  channels: {
    'New order': true, 'Low stock': true, 'Grocery shortage': true, 'Pickup reminder': true,
    'Backup failure': true, 'System error': true, 'Payment proof received': false, 'Dough nearing expiry': false
  },
  waitlist: [
    { name: 'Alyssa Ramos', want: 'Nutella Churro', at: SEEDED_AT - 2 * DAY, contacted: false },
    { name: 'Jed Villar', want: 'Any box of 6', at: SEEDED_AT - 1 * DAY, contacted: false },
    { name: 'Camille Uy', want: 'Red Velvet Cheesecake', at: SEEDED_AT - 20 * HOUR, contacted: false }
  ],
  cust: { box: {}, name: '', mobile: '', email: '', ig: '', window: 'mon', pay: '', ref: '', sender: '', amount: '', proof: 'none', errors: {}, orderNo: '' },
  dough: { wcb: 12, hc: 0, dcf: 18, pbm: 6, rvc: 0, nch: 0 },
  baked: { wcb: 14, hc: 10, dcf: 12, pbm: 10, rvc: 8, nch: 6 },
  moved: {},
  bakeDay: 'all',
  batch: null,
  invTab: 'Ingredients',
  stocktake: null,
  bought: {},
  received: {},
  supplierPick: {},
  event: null,
  cart: {},
  sales: [],
  eventPrices: {},
  eventStock: {},
  eventLoaded: {},
  matched: {},
  receiptShot: null,
  syncTried: false,
  priceDraft: null,
  eventExpenses: [{ label: 'Table rent', amount: 1500, cat: 'Bazaar rent' }, { label: 'Transport (Grab)', amount: 320, cat: 'Transport' }],
  pnlDrill: null,
  categories: ['Ingredients', 'Packaging', 'Helper wages', 'Bazaar rent', 'Transport', 'Advertising', 'Marketing / influencer', 'Printing / collateral', 'Business-paid delivery', 'Cash variance', 'Other'],
  inactiveCats: [],
  queue: [
    { id: 'F-118', name: 'Angela Ramos', raw: 'hi! 2 boxes po. 1 all biscoff, and the other one mixed na lang, surprise me 😅 pickup sat morning. gcash sent', clear: false, phone: '0917 •••• 771', pay: 'GCash', guess: { wcb: 6, dcf: 2, hc: 2, rvc: 2 }, day: 'sat', at: SEEDED_AT - 7 * HOUR, note: 'Second box is not specified. Confirm the six flavours before accepting.' },
    { id: 'F-119', name: 'Jomar Silva', raw: '1 box of 6: 2 double choc, 2 happy camper, 2 pb miso. sunday pickup. paid via maya ref MY-77611', clear: true, phone: '0918 •••• 402', pay: 'Maya', guess: { dcf: 2, hc: 2, pbm: 2 }, day: 'sun', at: SEEDED_AT - 5 * HOUR, note: '' },
    { id: 'F-120', name: 'Patricia Yu', raw: 'box of 6 all nutella churro if available, if not red velvet. saturday. will send proof later', clear: false, phone: '0995 •••• 118', pay: 'GCash', guess: { nch: 6 }, day: 'sat', at: SEEDED_AT - 2 * HOUR, note: 'Conditional order and no payment proof attached.' }
  ]
});

const loadState = () => {
  const base = BASE_STATE();
  try {
    const raw = storeRead();
    if (!raw) return base;
    const saved = JSON.parse(raw);
    if (!saved || saved.v !== 1 || !saved.data) return base;
    const data = Object.assign({}, saved.data);
    // an older save may carry prototype chrome; never let it decide where she lands
    EPHEMERAL.forEach(k => { delete data[k]; });
    // a recipe yield she never edited herself should follow the seed, not an old save
    Object.keys(RECIPES).forEach(k => {
      const untouched = !data.recipeVer || (data.recipeVer[k] || 1) === 1;
      if (!untouched) return;
      if (data.recipes && data.recipes[k]) data.recipes[k].yield = RECIPES[k].yield;
      if (data.recipeBase && data.recipeBase[k]) data.recipeBase[k].yield = RECIPES[k].yield;
    });
    const merged = Object.assign({}, base, data);
    merged.cfg = Object.assign({}, DEFAULT_CFG, data.cfg || {});
    merged.channels = Object.assign({}, base.channels, data.channels || {});
    merged.now = Date.now();
    merged.toast = null; merged.sheet = null; merged.quick = false; merged.history = [];
    merged.restored = true;
    return merged;
  } catch (e) { return base; }
};

export class OpsEngine extends React.Component {
  state = BASE_STATE();

  // ---------- lifecycle: one real clock, one saved copy ----------
  componentDidMount() {
    // The prototype read localStorage in a field initialiser. There is no localStorage
    // on the server and the first client paint must match the server's, so the saved
    // books are restored one commit after mount instead of before the first render.
    this.setState(loadState(), () => this.afterRestore());
  }

  afterRestore() {
    window.__hcOps = this;
    this._tick = setInterval(() => this.setState({ now: Date.now() }), 15000);
    this.persist();
    if (this.state.restored) {
      this.setState({ restored: false });
      setTimeout(() => this.toast('Picked up where you left off — this device had your books saved.'), 500);
    }
  }
  componentWillUnmount() {
    clearInterval(this._tick); clearInterval(this._autosave); clearTimeout(this._t); clearTimeout(this._save);
    if (this._flush) window.removeEventListener('pagehide', this._flush);
  }

  persist = flushNow => {
    clearTimeout(this._save);
    if (!this._autosave) {
      this._autosave = setInterval(() => this.persist(), 2000);
      this._flush = () => this.persist(true);
      window.addEventListener('pagehide', this._flush);
    }
    const run = () => {
      if (this._resetting) return;
      try {
        const data = {};
        Object.keys(this.state).forEach(k => { if (EPHEMERAL.indexOf(k) < 0) data[k] = this.state[k]; });
        const json = JSON.stringify({ v: 1, data: data });
        if (json === this._lastSaved) return;
        if (!storeWrite(json)) {
          if (!this._storageBlocked) { this._storageBlocked = true; this.forceUpdate(); }
          return;
        }
        // only treat it as saved once the write actually went through
        this._lastSaved = json;
        this._storageBlocked = false;
        this.setState({ savedAt: Date.now() });
      } catch (e) { this._storageBlocked = true; }
    };
    if (flushNow === true) run(); else this._save = setTimeout(run, 400);
  };
  resetData = () => {
    storeClear();
    this._lastSaved = null;
    this._resetting = true;
    setTimeout(() => { this._resetting = false; this.persist(true); }, 300);
    const fresh = BASE_STATE();
    // setState merges, so anything the app picked up at runtime has to be cleared by name
    Object.keys(this.state).forEach(k => { if (!(k in fresh)) fresh[k] = undefined; });
    fresh.device = this.state.device;
    fresh.role = this.state.role;
    fresh.screen = 'today';
    this.setState(fresh);
    setTimeout(() => this.toast('Back to the sample books. Anything you had entered on this device is gone.', 'warn'), 80);
  };

  // ---------- schedule, derived from the clock and nothing else ----------
  cfgOf = () => this.state.cfg || DEFAULT_CFG;
  setCfg = (k, v) => this.setState(s => { const c = Object.assign({}, s.cfg); c[k] = v; return { cfg: c }; });
  bumpCfg = (k, d, min, max) => this.setState(s => {
    const c = Object.assign({}, s.cfg);
    c[k] = Math.max(min, Math.min(max, Math.round(((Number(c[k]) || 0) + d) * 100) / 100));
    return { cfg: c };
  });
  numCfg = (k, v, min, max) => this.setState(s => {
    const c = Object.assign({}, s.cfg);
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    c[k] = isNaN(n) ? c[k] : Math.max(min, Math.min(max, n));
    return { cfg: c };
  });
  cycle = s0 => { const s = s0 || this.state; return dropCycle(s.now, s.cfg || DEFAULT_CFG); };
  windows = s0 => windowsFor(this.cycle(s0));
  windowById = (s, id) => this.windows(s).filter(w => w.id === id)[0] || this.windows(s)[0];
  windowText = (s, id, long) => {
    const w = this.windowById(s, id);
    return long ? w.label + ' · ' + w.time : dowName(w.at).slice(0, 3) + ' ' + new Date(w.at).getDate();
  };
  scheduleState = s => {
    const c = this.cycle(s);
    if (s.now < c.open || s.now > c.close) return 'closed';
    if (c.close - s.now < 12 * HOUR) return 'soon';
    return 'open';
  };
  shopState = s0 => {
    const s = s0 || this.state;
    if (s.shopOverride) return s.shopOverride;
    if (this.confirmedCookies(s) >= this.capacityOf()) return 'soldout';
    return this.scheduleState(s);
  };
  shopOpen = s0 => ['open', 'soon'].indexOf(this.shopState(s0)) >= 0;

  restMs = () => Math.max(0, Number(this.cfgOf().restHours) || 0) * HOUR;
  doughReadyAt = (s, pid) => (s.doughAt || {})[pid] != null ? s.doughAt[pid] + this.restMs() : null;
  doughRested = (s, pid) => { const r = this.doughReadyAt(s, pid); return r == null ? false : s.now >= r; };
  doughAgeDays = (s, pid) => (s.doughAt || {})[pid] == null ? 0 : (s.now - s.doughAt[pid]) / DAY;
  doughAging = (s, pid) => (s.dough[pid] || 0) > 0 && this.doughAgeDays(s, pid) > (Number(this.cfgOf().doughWarnDays) || 14);
  restLeftText = (s, pid) => {
    const r = this.doughReadyAt(s, pid);
    if (r == null) return '';
    return s.now >= r ? 'rested and ready' : 'ready in ' + spanText(r - s.now);
  };

  // ---------- the journal ----------
  // Every peso in the P&L is one of these lines. Nothing is typed in twice.
  entry = (kind, cat, label, amount, extra) => Object.assign({
    id: 'L' + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36),
    kind: kind, at: Date.now(), cat: cat, label: label, amount: Math.round((Number(amount) || 0) * 100) / 100
  }, extra || {});
  postEntry = (kind, cat, label, amount, extra) => {
    const e = this.entry(kind, cat, label, amount, extra);
    this.setState(s => ({ ledger: s.ledger.concat([e]) }));
    return e;
  };
  unpost = id => this.setState(s => ({ ledger: s.ledger.filter(e => e.id !== id) }));
  periodFrom = s => s.now - 30 * DAY;
  ledgerIn = s => (s.ledger || []).filter(e => e.at >= this.periodFrom(s));

  // ---------- helpers ----------
  go = (screen, opts) => {
    const o = opts || {};
    this.setState(s => ({
      navTick: (s.navTick || 0) + 1,
      navDir: 'fwd',
      screen,
      orderId: o.orderId !== undefined ? o.orderId : s.orderId,
      history: screen === s.screen ? s.history : s.history.concat([s.screen]),
      sheet: null
    }));
    this.advanceIfHint(o.hint);
  };

  goBack = () => this.setState(s => {
    // an open count is a layer on top of the screen — back should close it, not leave the screen
    if (s.stocktake) return { stocktake: null, sheet: null, navTick: (s.navTick || 0) + 1, navDir: 'back' };
    if (s.batch) return { batch: null, sheet: null, navTick: (s.navTick || 0) + 1, navDir: 'back' };
    const h = s.history.slice();
    const prev = h.pop() || 'today';
    return { screen: prev, history: h, sheet: null, navTick: (s.navTick || 0) + 1, navDir: 'back' };
  });

  toast = (msg, tone, undo) => {
    this.setState({ toast: { msg: msg, tone: tone || 'ok', id: Date.now(), undo: undo || null } });
    clearTimeout(this._t);
    this._t = setTimeout(() => this.setState({ toast: null }), undo ? 6200 : 3400);
  };
  runUndo = () => {
    const t = this.state.toast;
    this.setState({ toast: null });
    if (t && t.undo) { t.undo(); setTimeout(() => this.toast('Undone. Nothing was kept.'), 60); }
  };

  advanceIfHint = hint => {
    if (!hint) return;
    this.setState(s => {
      const f = FLOWS[s.flowId];
      if (!f || s.flowStep >= f.steps.length) return null;
      // doing a later step counts — a skipped one should never freeze the flow
      let idx = -1;
      for (let i = s.flowStep; i < f.steps.length; i++) { if (f.steps[i].hint === hint) { idx = i; break; } }
      if (idx < 0) return null;
      return { flowStep: Math.min(idx + 1, f.steps.length) };
    });
  };

  hintKey = () => {
    const f = FLOWS[this.state.flowId];
    if (!f) return null;
    const st = f.steps[this.state.flowStep];
    return st ? st.hint : null;
  };

  startFlow = id => {
    const f = FLOWS[id];
    this.setState({ flowId: id, flowStep: 0, sheet: null });
    this.go(f.steps[0].screen);
  };
  clearFlow = () => this.setState({ flowId: null, flowStep: 0 });

  setRole = r => {
    this.setState({ role: r, sheet: null, stocktake: null, batch: null, doughPrep: null });
    this.go(ROLES[r].home);
    if (r !== 'owner') this.toast(ROLES[r].note, 'warn');
  };
  canSee = k => {
    const allow = ROLES[this.state.role].screens;
    return !allow || allow.indexOf(k) >= 0;
  };
  money = () => ROLES[this.state.role].money;
  cashup = () => !!ROLES[this.state.role].cashup;
  contactWaitlist = i => {
    const w = (this.state.waitlist || [])[i];
    if (!w) return;
    if (w.contacted) {
      this.setState(st => ({ waitlist: st.waitlist.filter((x, n) => n !== i) }));
      return this.toast(w.name + ' taken off the waiting list.', 'ok', () => this.setState(st => ({ waitlist: st.waitlist.concat([w]) })));
    }
    this.setState(s => ({ waitlist: s.waitlist.map((x, n) => n === i ? Object.assign({}, x, { contacted: true, contactedAt: Date.now() }) : x) }));
    this.toast(w.name + ' marked as contacted. Send the shop link yourself \u2014 nothing is sent for you.');
  };
  // contact details drop off once the retention window has passed
  retentionDays = () => RETENTION_DAYS[this.cfgOf().retention] || 0;
  contactHidden = (s, o) => {
    const d = this.retentionDays();
    if (!d || o.status !== 'Completed') return false;
    return (s.now - (o.completedAt || o.placedAt)) > d * DAY;
  };
  denyHelper = what => this.toast('Only Cine can ' + what + '. Ask her to do this one.', 'warn');

  toggleOnline = () => {
    const on = !this.state.online;
    this.setState({ online: on });
    if (!on) {
      this.advanceIfHint('offline');
      return this.toast('Offline. Keep selling — every sale is saved on this phone.', 'warn');
    }
    // back online with sales waiting: start sending them rather than waiting to be asked
    if (this.state.sales.filter(x => !x.synced).length) setTimeout(this.syncNow, 300);
  };

  retryBackup = () => {
    this.setState({ backup: 'ok', backupAt: Date.now() });
    this.advanceIfHint('retry');
    this.toast('Backup completed just now. Everything on this device is copied off it.', 'ok');
  };
  // a real export: the whole journal, as a file she can open in Sheets
  exportBooks = () => {
    const s = this.state;
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const iso = t => new Date(t).toISOString().slice(0, 16).replace('T', ' ');
    const lines = [['Date', 'Type', 'Category', 'Description', 'Amount'].join(',')];
    (s.ledger || []).slice().sort((a, b) => a.at - b.at).forEach(e => {
      lines.push([esc(iso(e.at)), esc(e.kind), esc(e.cat), esc(e.label), e.amount].join(','));
    });
    lines.push('');
    lines.push(['Order', 'Customer', 'Status', 'Cookies', 'Total', 'Paid via', 'Reference', 'Placed'].join(','));
    s.orders.forEach(o => lines.push([esc(o.id), esc(o.name), esc(o.status), orderCount(o),
      (o.paidAmount != null ? o.paidAmount : this.boxTotal(o.items, o.priced)), esc(o.pay), esc(o.ref), esc(iso(o.placedAt))].join(',')));
    lines.push('');
    lines.push(['Item', 'On hand', 'Unit', 'Reorder level', 'Counted', 'Use by'].join(','));
    s.inv.forEach(i => lines.push([esc(i.name), i.qty, esc(i.unit), i.level, esc(iso(i.updatedAt)), esc(i.useBy ? iso(i.useBy) : '')].join(',')));
    try {
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'happy-cookie-books-' + new Date(s.now).toISOString().slice(0, 10) + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.toast('Downloaded: your ledger, orders and stock as a spreadsheet. Nothing is locked in here.');
    } catch (e) {
      this.toast('This device would not let the file download. Try again from a normal browser tab.', 'warn');
    }
  };

  sheet = (kind, data) => this.setState({ sheet: Object.assign({ kind: kind }, data || {}) });
  closeSheet = () => this.setState({ sheet: null });

  // ----- pricing -----
  priceMode = () => this.cfgOf().priceMode || this.props.boxPricing || 'Sum of menu prices';
  pickPriceMode = m => this.setState({ priceDraft: m });
  publishPriceMode = () => {
    const m = this.state.priceDraft || this.priceMode();
    this.setState(s => ({ cfg: Object.assign({}, s.cfg, { priceMode: m }), priceDraft: null, sheet: null }));
    this.toast('Published: ' + m.toLowerCase() + '. Orders already placed keep the total they were sold at.');
  };
  priceOf = (pid, priced) => (priced && priced[pid] != null) ? priced[pid] : (this.state.prices[pid] != null ? this.state.prices[pid] : P[pid].price);
  setPrice = (pid, v) => {
    const n = Math.max(0, Number(v) || 0);
    this.setState(s => { const pr = Object.assign({}, s.prices); pr[pid] = n; return { prices: pr, sheet: null }; });
    this.toast(P[pid].short + ' is ' + PESO(n) + ' from now on. Orders already placed keep what they were sold at.');
  };

  packFee = () => Number(this.cfgOf().packagingFee != null ? this.cfgOf().packagingFee : 38.44);
  flatBox = () => Number(this.cfgOf().flatBoxPrice != null ? this.cfgOf().flatBoxPrice : 860);
  cogsMult = () => Number(this.cfgOf().cogsMultiple) || 4;
  boxTotal = (items, priced) => {
    const keys = Object.keys(items);
    const n = keys.reduce((t, k) => t + items[k], 0);
    const sum = keys.reduce((t, k) => t + this.priceOf(k, priced) * items[k], 0);
    const boxes = Math.max(1, Math.ceil(n / 6));
    const mode = this.priceMode();
    if (mode === 'Flat price per box') return this.flatBox() * boxes;
    if (mode === 'Menu prices + packaging fee') return sum + this.packFee() * boxes;
    if (mode === 'Cookie cost × multiplier + packaging') {
      const cogs = keys.reduce((t, k) => t + this.ingCost(k) * items[k], 0);
      return Math.round(cogs * this.cogsMult() + this.packFee() * boxes);
    }
    return sum;
  };
  priceNote = () => {
    const mode = this.priceMode();
    if (mode === 'Flat price per box') return 'Every box of 6 costs ' + PESO(this.flatBox()) + ', whatever the mix. Singles are priced per cookie.';
    if (mode === 'Menu prices + packaging fee') return 'The cookies you picked, plus ' + PESO2(this.packFee()) + ' for the box and packaging.';
    if (mode === 'Cookie cost × multiplier + packaging') return 'Priced off what the cookies actually cost to make × ' + this.cogsMult() + ', plus ' + PESO2(this.packFee()) + ' packaging.';
    return 'You pay per cookie — no extra packaging charge.';
  };

  // ----- drops -----
  toggleDropProduct = pid => {
    // read before the update, or the message describes the state you just left
    const wasOn = this.state.dropActive[pid] !== false;
    this.setState(s => {
      const a = Object.assign({}, s.dropActive); a[pid] = !wasOn;
      return { dropActive: a };
    });
    this.toast(wasOn
      ? P[pid].short + ' taken off the order form \u2014 customers no longer see it.'
      : P[pid].short + ' is back on the order form.', 'ok', () => this.toggleDropProduct(pid));
  };
  toggleSoldOut = pid => {
    this.setState(s => {
      const so = Object.assign({}, s.soldOut); so[pid] = !so[pid];
      return { soldOut: so };
    });
    this.toast(this.state.soldOut[pid] ? P[pid].short + ' is back in stock on the customer page.' : P[pid].short + ' marked sold out. Customers see it greyed out.');
  };
  extendDrop = () => this.setState(s => {
    const cfg = Object.assign({}, s.cfg, { extendH: (Number(s.cfg.extendH) || 0) + 24 });
    const c = dropCycle(s.now, cfg);
    setTimeout(() => this.toast('Ordering now closes ' + dowName(c.close) + ' ' + clockText(c.close) + '.'), 0);
    return { cfg: cfg, shopOverride: null, sheet: null };
  });
  closeDropEarly = () => { this.setState({ shopOverride: 'closed', sheet: null }); this.toast('Drop ' + this.state.dropNo + ' closed. No new orders can come in.', 'warn'); };
  reopenDrop = () => {
    const c = this.cycle();
    this.setState({ shopOverride: null });
    this.toast(this.state.now > c.close
      ? 'Back on your schedule. This week has already closed \u2014 use Extend closing if you want more orders.'
      : 'Drop ' + this.state.dropNo + ' is open again until ' + dowName(c.close) + ' ' + clockText(c.close) + '.');
  };
  duplicateDrop = () => {
    const c = this.cycle();
    this.toast('Drop ' + (this.state.dropNo + 1) + ' queued from Drop ' + this.state.dropNo + ' \u2014 same flavours, capacity and windows. Opens ' + dowName(c.nextOpen) + ' ' + clockText(c.nextOpen) + '.');
  };
  setRetention = v => { this.setCfg('retention', v); this.setState({ sheet: null }); this.toast('Customer contact details are hidden ' + v.toLowerCase() + ' after an order is completed. Sales records are kept.'); };

  // ----- recipes -----
  openRecipe = pid => this.setState({ recipeOpen: pid });
  recipeEdit = (pid, i, field, v) => this.setState(s => {
    const r = JSON.parse(JSON.stringify(s.recipes));
    if (field === 'name') r[pid].ing[i][0] = v;
    if (field === 'qty') r[pid].ing[i][1] = v === '' ? '' : Number(v);
    if (field === 'unit') r[pid].ing[i][2] = v;
    const d = Object.assign({}, s.recipeDirty); d[pid] = true;
    return { recipes: r, recipeDirty: d };
  });
  recipeYield = (pid, d) => this.setState(s => {
    const r = JSON.parse(JSON.stringify(s.recipes));
    r[pid].yield = Math.max(1, r[pid].yield + d);
    const dd = Object.assign({}, s.recipeDirty); dd[pid] = true;
    return { recipes: r, recipeDirty: dd };
  });
  recipeAdd = pid => this.setState(s => {
    const r = JSON.parse(JSON.stringify(s.recipes));
    r[pid].ing.push(['', 0, 'g']);
    const d = Object.assign({}, s.recipeDirty); d[pid] = true;
    return { recipes: r, recipeDirty: d };
  });
  recipeRemove = (pid, i) => this.setState(s => {
    const r = JSON.parse(JSON.stringify(s.recipes));
    r[pid].ing.splice(i, 1);
    const d = Object.assign({}, s.recipeDirty); d[pid] = true;
    return { recipes: r, recipeDirty: d };
  });
  recipeSave = pid => {
    const s = this.state;
    const blank = s.recipes[pid].ing.filter(i => !i[0].trim()).length;
    if (blank) return this.toast(plural(blank, 'ingredient still has', 'ingredients still have') + ' no name.', 'warn');
    const v = Object.assign({}, s.recipeVer); v[pid] = v[pid] + 1;
    const d = Object.assign({}, s.recipeDirty); delete d[pid];
    const hist = Object.assign({}, s.recipeHistory);
    hist[pid] = (hist[pid] || []).concat([{ version: s.recipeVer[pid], snap: JSON.parse(JSON.stringify(s.recipeBase[pid])) }]);
    const base = JSON.parse(JSON.stringify(s.recipeBase));
    base[pid] = JSON.parse(JSON.stringify(s.recipes[pid]));
    const used = s.batches.filter(b => b.pid === pid).length;
    this.setState({ recipeVer: v, recipeDirty: d, recipeHistory: hist, recipeBase: base });
    this.toast('Saved as Version ' + v[pid] + '. ' + (used ? plural(used, 'batch', 'batches') + ' already baked on Version ' + (v[pid] - 1) + ' keep it.' : 'Version ' + (v[pid] - 1) + ' is kept for anything already baked on it.'));
  };

  // ----- customer -----
  custTotal = () => Object.keys(this.state.cust.box).reduce((t, k) => t + this.state.cust.box[k], 0);
  custAdd = (pid, d) => {
    const cap = Math.max(1, Number(this.cfgOf().maxPerOrder) || 24);
    if (d > 0 && this.custTotal() >= cap) return this.toast(cap + ' cookies is the most you can order in one go. Message us on Instagram for bigger orders.', 'warn');
    this.setState(s => {
      const b = Object.assign({}, s.cust.box);
      b[pid] = Math.max(0, (b[pid] || 0) + d);
      if (!b[pid]) delete b[pid];
      return { cust: Object.assign({}, s.cust, { box: b }) };
    });
    setTimeout(() => { if (this.custTotal() > 0) this.advanceIfHint('box'); }, 0);
  };
  custSet = (k, v) => this.setState(s => {
    const e = Object.assign({}, s.cust.errors); delete e[k];
    const c = Object.assign({}, s.cust, { errors: e }); c[k] = v;
    return { cust: c };
  });
  custUpload = () => {
    this.custSet('proof', 'uploading');
    setTimeout(() => { this.custSet('proof', 'done'); this.advanceIfHint('proof'); }, 900);
  };
  custToCheckout = () => {
    if (this.custTotal() === 0) return this.toast('Pick at least one cookie.', 'warn');
    this.go('checkout'); this.advanceIfHint('details');
  };
  custSubmit = () => {
    if (this.state.dropState === 'closed' || this.state.dropState === 'soldout') {
      return this.toast('Ordering closed while you were filling this in. Nothing was charged — the next drop opens Monday 9:00 AM.', 'warn');
    }
    const c = this.state.cust, e = {};
    if (!c.name.trim()) e.name = 'We need a name for the box.';
    if (c.mobile.replace(/[^0-9]/g, '').length < 10) e.mobile = 'Add a mobile number we can reach you on.';
    if (!/.+@.+\..+/.test(c.email.trim())) e.email = 'Your order link is emailed here, so it has to be a real address.';
    if (!c.window) e.window = 'Choose when you are collecting.';
    if (!c.pay) e.pay = 'Tell us how you paid.';
    if (!c.ref.trim()) e.ref = 'Type the reference number from your receipt.';
    if (!String(c.amount).trim() || !(Number(c.amount) > 0)) e.amount = 'Type the amount you actually sent.';
    if (c.proof !== 'done') e.proof = 'Attach a screenshot of your payment.';
    if (Object.keys(e).length) {
      this.setState(s => ({ cust: Object.assign({}, s.cust, { errors: e }) }));
      return this.toast(plural(Object.keys(e).length, 'thing', 'things') + ' still need filling in.', 'warn');
    }
    const s = this.state;
    const no = 'HC-' + (1042 + s.orders.length);
    const due = this.boxTotal(c.box, s.prices);
    const sent = Number(c.amount) || 0;
    const flags = [];
    const bad = this.refLooksWrong(c.pay, c.ref);
    if (bad) flags.push(bad);
    if (sent < due) flags.push('Sent ' + PESO(sent) + ' against ' + PESO(due) + ' due — ' + PESO(due - sent) + ' short.');
    if (sent > due) flags.push('Sent ' + PESO(sent) + ' against ' + PESO(due) + ' due — ' + PESO(sent - due) + ' overpaid.');
    this.setState({
      orders: s.orders.concat([{
        id: no, name: c.name, ig: c.ig, email: c.email, mobile: c.mobile, items: Object.assign({}, c.box),
        priced: Object.assign({}, s.prices), status: 'Payment review', pay: c.pay, ref: c.ref,
        paidAmount: sent, day: c.window, placedAt: Date.now(), drop: s.dropNo,
        warn: flags.length ? flags.join(' ') : null
      }]),
      cust: Object.assign({}, c, { orderNo: no })
    });
    this.go('status'); this.advanceIfHint('submit'); this.advanceIfHint('status');
  };
  custRestart = () => {
    this.setState({ cust: { box: {}, name: '', mobile: '', email: '', ig: '', window: 'mon', pay: '', ref: '', sender: '', amount: '', proof: 'none', errors: {}, orderNo: '' } });
    this.go('shop');
  };
  setLookup = v => this.setState({ lookupQ: v, lookupTried: false });
  runLookup = e => {
    if (e) e.preventDefault();
    const s = this.state, q = this.normRef(s.lookupQ);
    if (!q) return this.toast('Type your order number or payment reference.', 'warn');
    const hit = s.orders.filter(o => [o.id, o.ref, o.email, o.mobile, o.ig].some(v => v && this.normRef(v) === q))[0];
    if (hit) {
      this.setState({ lookupTried: true, cust: Object.assign({}, s.cust, { orderNo: hit.id, name: hit.name, email: hit.email || '', box: Object.assign({}, hit.items) }) });
      this.go('status');
      this.toast('Found it.');
    } else {
      this.setState({ lookupTried: true });
    }
  };
  custReorder = () => {
    const s = this.state;
    const c0 = s.cust;
    const last = s.orders.filter(o => (c0.email && o.email === c0.email) || (c0.mobile && o.mobile === c0.mobile) || (c0.ig && o.ig === c0.ig) || (c0.name && o.name === c0.name)).slice(-1)[0];
    const box = last ? Object.assign({}, last.items) : Object.assign({}, s.cust.box);
    this.setState({ cust: { box: box, name: '', mobile: '', email: '', ig: '', window: 'mon', pay: '', ref: '', sender: '', amount: '', proof: 'none', errors: {}, orderNo: '' } });
    this.go('shop');
    this.toast('Same box loaded. Change anything before you check out.');
  };
  custRequestCancel = () => {
    const s = this.state, no = s.cust.orderNo;
    if (!no) return;
    this.setState({ orders: s.orders.map(o => o.id === no ? Object.assign({}, o, { cancelRequested: true }) : o), sheet: null });
    this.toast('Cancellation requested. Cine will confirm and refund you.', 'warn');
  };

  // ----- orders -----
  capacityOf = () => Math.max(1, Number(this.cfgOf().capacity) || 200);
  setDropState = st => {
    this.setState({ shopOverride: st === 'auto' ? null : st, sheet: null });
    this.toast(st === 'auto'
      ? 'Back on your schedule — the shop opens and closes itself.'
      : 'Shop held at “' + ({ open: 'Open', soon: 'Closing soon', closed: 'Closed', soldout: 'Sold out' })[st] + '” until you change it.');
  };
  closeDrop = () => {
    const s = this.state;
    const rev = this.orderRevenue(s);
    const open = s.orders.filter(o => this.inDrop(s, o) && ['Payment review', 'Confirmed', 'Preparing'].indexOf(o.status) >= 0).length;
    if (open) return this.toast(plural(open, 'order', 'orders') + ' still unfinished in Drop ' + s.dropNo + '. Settle those before opening the next one.', 'warn');
    const n = s.orders.filter(o => this.inDrop(s, o) && this.RECOGNISED.indexOf(o.status) >= 0).length;
    const e = this.entry('revenue', 'Drops', 'Drop ' + s.dropNo + ' \u00b7 ' + plural(n, 'order', 'orders') + ' \u00b7 ' + this.confirmedCookies(s) + ' cookies', rev, { drop: s.dropNo });
    this.setState({
      dropNo: s.dropNo + 1,
      shopOverride: null,
      cfg: Object.assign({}, s.cfg, { extendH: 0 }),
      ledger: rev > 0 ? s.ledger.concat([e]) : s.ledger,
      moved: {}, sheet: null
    });
    this.toast('Drop ' + s.dropNo + ' closed at ' + PESO(rev) + ' and booked into your P&L. Drop ' + (s.dropNo + 1) + ' is open for orders.');
  };
  recordDraw = (amount, note) => {
    const n = Number(amount) || 0;
    if (!n) return this.toast('Enter how much you took out.', 'warn');
    const e = this.entry('draw', 'Owner drawings', note || 'Owner\u2019s draw', n);
    this.setState(s => ({ ledger: s.ledger.concat([e]), sheet: null }));
    this.toast(PESO(n) + ' recorded as your draw. It sits outside expenses, so profit is unchanged.');
  };
  setCapacity = v => this.numCfg('capacity', v, 50, 600);
  commitCapacity = () => this.toast('Weekly capacity saved: ' + this.capacityOf() + ' cookies per drop.');
  inDrop = (s, o) => (o.drop == null ? s.dropNo : o.drop) === s.dropNo;
  confirmedCookies = s => s.orders.filter(o => this.inDrop(s, o) && this.RECOGNISED.indexOf(o.status) >= 0).reduce((t, o) => t + orderCount(o), 0);
  reservedBaked = (s, pid) => s.orders.filter(o => this.RESERVING.indexOf(o.status) >= 0).reduce((t, o) => t + (o.items[pid] || 0), 0);
  availableBaked = (s, pid) => Math.max(0, (s.baked[pid] || 0) - this.reservedBaked(s, pid));
  orderRevenue = s => s.orders.filter(o => this.inDrop(s, o) && this.RECOGNISED.indexOf(o.status) >= 0)
    .reduce((t, o) => t + (o.paidAmount != null ? o.paidAmount : this.boxTotal(o.items, o.priced)), 0);
  refundTotal = s => this.ledgerIn(s).filter(e => e.kind === 'refund').reduce((t, r) => t + r.amount, 0);
  nextInvoice = s => 'INV-' + String(s.invoiceSeq + 1).padStart(4, '0');

  confirmPayment = (id, force) => {
    const s = this.state;
    const o = s.orders.filter(x => x.id === id)[0];
    if (!o) return;
    const cap = this.capacityOf();
    const used = this.confirmedCookies(s);
    const n = orderCount(o);
    if (!force && used + n > cap) {
      return this.sheet('overage', { id, over: used + n - cap, left: Math.max(0, cap - used), n, name: o.name });
    }
    const due = this.boxTotal(o.items, o.priced);
    const sent = o.paidAmount != null ? o.paidAmount : due;
    const balance = Math.max(0, due - sent);
    const inv = this.nextInvoice(s);
    this.setState({
      invoiceSeq: s.invoiceSeq + 1,
      orders: s.orders.map(x => x.id === id ? Object.assign({}, x, { status: 'Confirmed', warn: null, invoice: inv, balance: balance || null }) : x),
      sheet: null
    });
    this.advanceIfHint('confirm');
    const left = cap - (used + n);
    if (balance > 0) {
      this.toast('Confirmed as part payment. ' + PESO(balance) + ' still due — ' + inv + ' issued.', 'warn');
    } else {
      this.toast(left >= 0
        ? 'Payment confirmed, ' + inv + ' issued. ' + plural(n, 'cookie', 'cookies') + ' reserved — ' + left + ' left in this drop.'
        : 'Payment confirmed, ' + inv + ' issued. You are now ' + Math.abs(left) + ' over your capacity.', left >= 0 ? 'ok' : 'warn');
    }
    if (used + n >= cap && this.shopState(s) !== 'soldout') {
      setTimeout(() => this.toast('Capacity reached — the shop now shows Sold out to customers.', 'warn'), 900);
    }
  };
  recordBalance = id => {
    const s = this.state, o = s.orders.filter(x => x.id === id)[0];
    if (!o || !o.balance) return;
    this.setState({ orders: s.orders.map(x => x.id === id ? Object.assign({}, x, { balance: null, paidAmount: this.boxTotal(x.items, x.priced) }) : x), sheet: null });
    this.toast('Balance settled. ' + o.name.split(' ')[0] + '’s order is fully paid.');
  };
  rejectPayment = id => {
    this.setState(s => ({ orders: s.orders.map(o => o.id === id ? Object.assign({}, o, { status: 'Cancelled', rejected: true }) : o), sheet: null }));
    this.toast('Proof rejected. Nothing was reserved — the customer’s link now asks them to re-send.', 'warn');
  };
  reopenOrder = id => {
    this.setState(s => ({ orders: s.orders.map(o => o.id === id ? Object.assign({}, o, { status: 'Payment review', rejected: false, cancelRequested: false, warn: 'Reopened — check the new proof against the reference.' }) : o), sheet: null }));
    this.toast('Back in your review queue. Nothing is reserved until you confirm.');
  };
  refundOrder = (id, ref) => {
    const s = this.state, o = s.orders.filter(x => x.id === id)[0];
    if (!o) return;
    const amount = o.paidAmount != null ? o.paidAmount : this.boxTotal(o.items, o.priced);
    const baked = Object.assign({}, s.baked);
    if (o.status === 'Ready') Object.keys(o.items).forEach(k => { baked[k] = (baked[k] || 0) + o.items[k]; });
    // this drop's takings are only booked when the drop closes — refunding before that
    // just drops the order out of the total, so posting a refund line as well would count it twice
    const booked = !this.inDrop(s, o);
    const e = booked ? this.entry('refund', 'Drops', 'Refund \u2014 ' + o.name + ' \u00b7 ' + (ref || o.ref || '\u2014'), amount, { order: o.id }) : null;
    this.setState({
      baked,
      ledger: booked ? s.ledger.concat([e]) : s.ledger,
      orders: s.orders.map(x => x.id === id ? Object.assign({}, x, { status: 'Cancelled', refunded: true, refundRef: ref || '', cancelRequested: false }) : x),
      sheet: null
    });
    this.toast(PESO(amount) + ' refund recorded against ' + (ref ? 'ref ' + ref : 'this order') + '. ' + (booked ? 'Booked against your profit.' : 'It comes off Drop ' + s.dropNo + ' before that drop is banked.'), 'warn');
  };
  noShow = id => {
    const s = this.state, o = s.orders.filter(x => x.id === id)[0];
    if (!o) return;
    const baked = Object.assign({}, s.baked);
    Object.keys(o.items).forEach(k => { baked[k] = (baked[k] || 0) + o.items[k]; });
    this.setState({ baked, orders: s.orders.map(x => x.id === id ? Object.assign({}, x, { status: 'No-show' }) : x), sheet: null });
    this.toast(o.name.split(' ')[0] + ' did not collect. ' + plural(orderCount(o), 'cookie', 'cookies') + ' back in stock — they stay paid.', 'warn');
  };

  // ----- packing -----
  flagLine = (id, pid) => {
    const s = this.state;
    const o = s.orders.filter(x => x.id === id)[0];
    const has = (o.unavailable || []).indexOf(pid) >= 0;
    const un = has ? (o.unavailable || []).filter(x => x !== pid) : (o.unavailable || []).concat([pid]);
    this.setState({ orders: s.orders.map(x => x.id === id ? Object.assign({}, x, { unavailable: un, needsContact: un.length > 0 }) : x) });
    this.toast(has
      ? P[pid].short + ' is available again for this order.'
      : P[pid].short + ' flagged as unavailable. Message ' + o.name.split(' ')[0] + ' to agree a swap — the app will not pick one for you.', 'warn');
  };
  replaceLine = (id, from, to) => {
    const s = this.state, o = s.orders.filter(x => x.id === id)[0];
    if (!o || !o.items[from]) return;
    if (from === to) return this.toast('Pick a different flavour to swap in.', 'warn');
    const qty = o.items[from];
    const items = Object.assign({}, o.items);
    delete items[from];
    items[to] = (items[to] || 0) + qty;
    const oldTotal = this.boxTotal(o.items, o.priced);
    const newTotal = this.boxTotal(items, o.priced);
    const delta = newTotal - oldTotal;
    const swaps = (o.swaps || []).concat([{ from: from, to: to, qty: qty, at: Date.now() }]);
    this.setState({
      orders: s.orders.map(x => x.id === id ? Object.assign({}, x, {
        items: items, swaps: swaps, replaced: true,
        unavailable: (x.unavailable || []).filter(u => u !== from),
        needsContact: false,
        origItems: x.origItems || Object.assign({}, x.items),
        balance: delta > 0 ? (x.balance || 0) + delta : x.balance,
        paidAmount: delta < 0 && x.paidAmount != null ? x.paidAmount : x.paidAmount
      }) : x),
      sheet: null
    });
    this.toast(qty + ' \u00d7 ' + P[from].short + ' swapped for ' + P[to].short + '. ' + (
      delta > 0 ? PESO(delta) + ' still to collect \u2014 shown as a balance on the order.'
      : delta < 0 ? PESO(-delta) + ' owed back. Record it as a refund if you return it.'
      : 'Same price, nothing to settle.'), delta === 0 ? 'ok' : 'warn');
  };
  clearContact = id => {
    const s = this.state;
    this.setState({ orders: s.orders.map(x => x.id === id ? Object.assign({}, x, { unavailable: [], needsContact: false }) : x) });
    this.toast('Sorted. The order is back to normal.');
  };

  // anything in stock can be received, whether the shopping list asked for it or not
  openReceive = name => {
    const s = this.state;
    const it = s.inv.filter(i => i.name === name)[0];
    if (!it) return;
    const planned = this.groceryPlan(s).filter(i => i.key === name)[0];
    if (planned) return this.sheet('receive', { k: planned.key, name: planned.name, item: planned });
    const opt = OPTIONS_FOR(name)[0];
    this.sheet('receive', {
      k: name, name: name,
      item: {
        key: name, name: name, unit: it.unit, isPack: it.cat === 'Packaging',
        add: PACK_SIZE[name] || Math.max(1, it.level || 1),
        cost: opt ? opt.price : 0,
        supplier: opt ? opt.name : it.supplier,
        offList: true
      }
    });
  };

  packOrder = id => {
    const s = this.state;
    const o = s.orders.filter(x => x.id === id)[0];
    if (!o) return;
    if (o.needsContact) return this.toast('Settle the unavailable flavour with ' + o.name.split(' ')[0] + ' before packing this one.', 'warn');
    // full sixes go in a box; anything loose is pouched
    const count = orderCount(o), boxes = Math.floor(count / 6), loose = count % 6;
    const use = { 'Box of 6': boxes, 'Single cookie pouch': loose, 'Brand sticker': boxes + loose, 'Thank-you card': boxes || 1 };
    const short = Object.keys(use).filter(n => {
      if (!use[n]) return false;
      const it = s.inv.filter(i => i.name === n)[0];
      return !it || it.qty < use[n];
    });
    if (short.length) return this.toast('Not enough ' + short.join(' or ') + ' left. Buy more before packing this one.', 'warn');
    const baked = Object.assign({}, s.baked);
    Object.keys(o.items).forEach(k => { baked[k] = Math.max(0, (baked[k] || 0) - o.items[k]); });
    const inv = s.inv.map(i => use[i.name] ? Object.assign({}, i, { qty: Math.max(0, i.qty - use[i.name]), updatedAt: Date.now() }) : i);
    this.setState({ inv, baked, orders: s.orders.map(x => x.id === id ? Object.assign({}, x, { status: 'Ready' }) : x) });
    this.toast(o.name.split(' ')[0] + '\u2019s order is packed and ready. '
      + (boxes && loose ? plural(boxes, 'box', 'boxes') + ' and ' + plural(loose, 'pouch', 'pouches')
        : loose ? plural(loose, 'pouch', 'pouches') : plural(boxes, 'box', 'boxes'))
      + ' came off your stock.');
  };
  stampOrders = (s, ids, field) => s.orders.map(o => ids.indexOf(o.id) >= 0 ? Object.assign({}, o, (function (x) { x[field] = Date.now(); return x; })({})) : o);
  markBaking = (pid, s0) => {
    const s = s0 || this.state;
    return s.orders.map(o => (o.status === 'Confirmed' && (o.items[pid] || 0) > 0) ? Object.assign({}, o, { status: 'Preparing' }) : o);
  };
  collectOrder = id => {
    const s = this.state;
    const o = s.orders.filter(x => x.id === id)[0];
    this.setState({ orders: s.orders.map(x => x.id === id ? Object.assign({}, x, { status: 'Completed', completedAt: Date.now() }) : x) });
    this.toast(o.name.split(' ')[0] + '’s order is marked collected.', 'ok',
      () => this.setState(st => ({ orders: st.orders.map(x => x.id === id ? Object.assign({}, x, { status: 'Ready' }) : x) })));
  };

  // ----- bake -----
  moveDay = (pid, dir) => {
    const s = this.state;
    const satBase = this.demandDay(pid, 'sat');
    const sunBase = this.demandDay(pid, 'sun');
    const cur = s.moved[pid] || 0;
    const next = Math.max(-sunBase, Math.min(satBase, cur + dir));
    if (next === cur) return this.toast(dir > 0 ? 'Nothing left on Saturday to move over.' : 'Nothing left on Sunday to move back.', 'warn');
    const m = Object.assign({}, s.moved); m[pid] = next;
    this.setState({ moved: m });
  };

  // mix dough ahead of demand
  mixRows = (pid, balls) => {
    const s = this.state, r = s.recipes[pid];
    const scale = balls / r.yield;
    return r.ing.filter(i => i[0]).map(i => {
      const raw = (Number(i[1]) || 0) * scale;
      const amount = i[2] === 'pcs' ? Math.ceil(raw) : Math.round(raw * 10) / 10;
      const item = s.inv.filter(x => x.name === i[0])[0];
      return { name: i[0], amount, unit: i[2], onHand: item ? item.qty : 0, short: item ? item.qty < amount : false };
    });
  };
  startDough = pid => {
    const s = this.state;
    const need = Math.max(0, this.toBake(pid, s) - (s.dough[pid] || 0));
    const o = this.doughOptions(pid);
    this.setState({ doughPrep: { pid, balls: need > 0 && need <= o.half ? o.half : o.full }, sheet: { kind: 'mixDough' } });
  };
  // a recipe is only ever mixed whole or halved — nothing in between
  doughOptions = pid => {
    const full = (this.state.recipes[pid] || {}).yield || 0;
    return { full: full, half: Math.ceil(full / 2) };
  };
  setDoughPortion = kind => this.setState(s => {
    if (!s.doughPrep) return null;
    const o = this.doughOptions(s.doughPrep.pid);
    return { doughPrep: Object.assign({}, s.doughPrep, { balls: kind === 'half' ? o.half : o.full }) };
  });
  confirmDough = () => {
    const s = this.state, dp = s.doughPrep;
    if (!dp) return;
    const rows = this.mixRows(dp.pid, dp.balls);
    const inv = s.inv.map(it => {
      const row = rows.filter(r => r.name === it.name)[0];
      return row ? Object.assign({}, it, { qty: Math.max(0, Math.round((it.qty - row.amount) * 10) / 10), updatedAt: Date.now() }) : it;
    });
    const dough = Object.assign({}, s.dough);
    dough[dp.pid] = (dough[dp.pid] || 0) + dp.balls;
    const shorts = rows.filter(r => r.short);
    const made = Object.assign({}, s.doughAt || {}); made[dp.pid] = Date.now();
    this.setState({
      inv, dough, doughPrep: null, sheet: null, doughAt: made,
      shortfalls: shorts.length ? s.shortfalls.concat(shorts.map(r => ({ name: r.name, by: Math.round((r.amount - r.onHand) * 10) / 10, unit: r.unit, when: 'Dough \u2014 ' + P[dp.pid].short, at: Date.now() }))) : s.shortfalls
    });
    this.toast(shorts.length
      ? 'Mixed, but you went short on ' + shorts.map(r => r.name.toLowerCase()).join(' and ') + '. Logged so the count still adds up.'
      : plural(dp.balls, 'dough ball', 'dough balls') + ' of ' + P[dp.pid].short + ' in the chiller. Ready to bake in ' + spanText(this.restMs()) + '.',
      shorts.length ? 'warn' : 'ok');
  };

  toBake = (pid, s) => Math.max(0, this.demand(pid) - (s.baked[pid] || 0));

  demand = pid => this.state.orders.filter(o => this.PLANNED.indexOf(o.status) >= 0).reduce((t, o) => t + (o.items[pid] || 0), 0);
  demandDay = (pid, day) => this.state.orders.filter(o => this.PLANNED.indexOf(o.status) >= 0 && o.day === day).reduce((t, o) => t + (o.items[pid] || 0), 0);

  setBatchFlavour = pid => {
    const s = this.state;
    if (!s.batch || s.batch.pid === pid) return;
    const target = this.toBake(pid, s);
    this.setState({ batch: { pid, target, actual: target, step: s.batch.step, note: '', adj: {}, rejects: 0, showUsed: s.batch.showUsed } });
  };

  setDoughFlavour = pid => {
    const s = this.state;
    if (!s.doughPrep || s.doughPrep.pid === pid) return;
    const need = Math.max(0, this.toBake(pid, s) - (s.dough[pid] || 0));
    const o = this.doughOptions(pid);
    this.setState({ doughPrep: { pid, balls: need > 0 && need <= o.half ? o.half : o.full } });
  };

  toggleBatchUsed = () => {
    // read before the update — opening the list is the step, not closing it
    const opening = !(this.state.batch || {}).showUsed;
    this.setState(s => (s.batch ? { batch: Object.assign({}, s.batch, { showUsed: !s.batch.showUsed }) } : null));
    if (opening) this.advanceIfHint('deduct');
  };

  startBatch = pid => {
    const s = this.state;
    // the row offers "Bake 8" because 8 is all the dough covers — open on that same 8
    const dough = s.dough[pid] || 0;
    const target = dough > 0 ? Math.min(this.toBake(pid, s), dough) : this.toBake(pid, s);
    this.setState({ batch: { pid, target, actual: target, step: 1, note: '', adj: {}, rejects: 0 }, screen: 'batch', history: s.history.concat([s.screen]), sheet: null });
    this.advanceIfHint('batch');
    if ((s.dough[pid] || 0) > 0 && !this.doughRested(s, pid)) {
      this.toast('This dough went in the chiller ' + spanText(s.now - s.doughAt[pid]) + ' ago. It has not had its ' + this.cfgOf().restHours + 'h rest \u2014 texture will be flatter.', 'warn');
    }
  };
  setYield = d => this.setState(s => ({ batch: Object.assign({}, s.batch, { actual: Math.max(0, s.batch.actual + d) }) }));
  setRejects = d => this.setState(s => ({ batch: Object.assign({}, s.batch, { rejects: Math.max(0, Math.min(s.batch.actual, (s.batch.rejects || 0) + d)) }) }));
  batchNote = v => this.setState(s => ({ batch: Object.assign({}, s.batch, { note: v }) }));
  batchStep = n => { this.setState(s => ({ batch: Object.assign({}, s.batch, { step: n }) })); this.advanceIfHint(n === 2 ? 'yield' : null); };
  adjIng = (name, d) => this.setState(s => {
    const a = Object.assign({}, s.batch.adj);
    a[name] = (a[name] || 0) + d;
    return { batch: Object.assign({}, s.batch, { adj: a }) };
  });

  deductions = () => {
    const s = this.state, b = s.batch;
    if (!b) return { rows: [], doughUsed: 0, mixed: 0 };
    const doughUsed = Math.min(s.dough[b.pid] || 0, b.actual);
    const mixed = Math.max(0, b.actual - doughUsed);
    const r = s.recipes[b.pid];
    const scale = mixed / r.yield;
    const rows = r.ing.filter(i => i[0]).map(i => {
      const base = Math.round((Number(i[1]) || 0) * scale * 10) / 10;
      const delta = b.adj[i[0]] || 0;
      const step = i[2] === 'pcs' ? 1 : i[2] === 'ml' ? 5 : 10;
      const item = s.inv.filter(x => x.name === i[0])[0];
      const raw = Math.max(0, base + delta * step);
      const amount = i[2] === 'pcs' ? Math.ceil(raw) : Math.round(raw * 10) / 10;
      return { name: i[0], amount, unit: i[2], onHand: item ? item.qty : 0, short: item ? item.qty < amount : false, delta };
    });
    return { rows, doughUsed, mixed };
  };

  confirmBatch = () => {
    const s = this.state, b = s.batch;
    const d = this.deductions();
    const inv = s.inv.map(it => {
      const row = d.rows.filter(r => r.name === it.name)[0];
      return row ? Object.assign({}, it, { qty: Math.max(0, Math.round((it.qty - row.amount) * 10) / 10), updatedAt: Date.now() }) : it;
    });
    const dough = Object.assign({}, s.dough); dough[b.pid] = Math.max(0, (dough[b.pid] || 0) - d.doughUsed);
    const rejects = b.rejects || 0;
    const good = Math.max(0, b.actual - rejects);
    const baked = Object.assign({}, s.baked); baked[b.pid] = (baked[b.pid] || 0) + good;
    const variance = good - b.target;
    const shorts = d.rows.filter(r => r.short);
    const batches = s.batches.concat([{ pid: b.pid, qty: good, version: s.recipeVer[b.pid], at: Date.now(), rejects: rejects }]);
    this.setState({
      inv, dough, baked, batches, batch: null, screen: 'bake', sheet: null,
      orders: this.markBaking(b.pid, s),
      variances: s.variances.concat([{ pid: b.pid, target: b.target, actual: good, rejects: rejects, at: Date.now() }]),
      shortfalls: shorts.length ? s.shortfalls.concat(shorts.map(r => ({ name: r.name, by: Math.round((r.amount - r.onHand) * 10) / 10, unit: r.unit, when: 'Bake \u2014 ' + P[b.pid].short, at: Date.now() }))) : s.shortfalls
    });
    this.advanceIfHint('deduct'); this.advanceIfHint('done');
    this.toast(shorts.length
      ? good + ' baked, but ' + shorts.map(r => r.name.toLowerCase()).join(' and ') + ' ran short. Logged against this batch.'
      : rejects > 0
        ? good + ' good ' + P[b.pid].short + ', ' + rejects + ' rejected. Orders for it moved to Baking.'
        : variance === 0
          ? good + ' ' + P[b.pid].short + ' baked on Version ' + s.recipeVer[b.pid] + '. Orders for it moved to Baking.'
          : good + ' baked instead of ' + b.target + ' — variance of ' + (variance > 0 ? '+' : '') + variance + ' recorded.',
      (shorts.length || rejects || variance !== 0) ? 'warn' : 'ok');
  };

  // ----- inventory -----
  setInvTab = t => this.setState({ invTab: t });
  saveInv = (name, qty) => {
    const prev = this.state.inv.filter(i => i.name === name)[0];
    const prevQty = prev ? prev.qty : 0;
    const prevWhen = prev ? prev.updatedAt : null;
    this.setState(s => ({ inv: s.inv.map(i => i.name === name ? Object.assign({}, i, { qty: Number(qty), updatedAt: Date.now() }) : i), sheet: null }));
    this.toast(name + ' updated.', 'ok', () => this.setState(s => ({
      inv: s.inv.map(i => i.name === name ? Object.assign({}, i, { qty: prevQty, updatedAt: prevWhen }) : i)
    })));
  };
  addInv = (cat, name, qty, unit, level, supplier) => {
    if (!name) return this.toast('Give the item a name first.', 'warn');
    this.setState(s => ({ inv: s.inv.concat([{ cat, name, qty: Number(qty) || 0, unit: unit || 'g', level: Number(level) || 0, supplier: supplier || '—', updatedAt: Date.now(), useBy: USE_BY_DAYS[name] ? Date.now() + USE_BY_DAYS[name] * DAY : null }]), sheet: null }));
    this.toast(name + ' added to ' + cat + '.');
  };
  removeInv = name => {
    this.setState(s => ({ inv: s.inv.filter(i => i.name !== name), sheet: null }));
    this.toast(name + ' removed. Past records keep their history.', 'warn');
  };
  startStocktake = () => {
    const s = this.state;
    const items = s.inv.filter(i => i.cat === s.invTab);
    this.setState({ stocktake: { i: 0, counts: {}, items: items.map(x => x.name) }, sheet: null });
    this.advanceIfHint('stocktake');
  };
  countReason = (name, v) => this.setState(s => {
    const rs = Object.assign({}, s.stocktake.reasons || {}); rs[name] = v;
    return { stocktake: Object.assign({}, s.stocktake, { reasons: rs }) };
  });
  countInput = (name, v) => {
    this.setState(s => {
      const c = Object.assign({}, s.stocktake.counts); c[name] = v;
      return { stocktake: Object.assign({}, s.stocktake, { counts: c }) };
    });
    if (v !== '') this.advanceIfHint('count');
  };
  stockNext = d => this.setState(s => ({ stocktake: Object.assign({}, s.stocktake, { i: Math.max(0, Math.min(s.stocktake.items.length - 1, s.stocktake.i + d)) }) }));
  reconcile = () => {
    const s = this.state, c = s.stocktake.counts;
    let n = 0, value = 0;
    const inv = s.inv.map(i => {
      if (c[i.name] === undefined || c[i.name] === '') return i;
      const counted = Number(c[i.name]);
      if (counted !== i.qty) { n++; value += (counted - i.qty) * this.unitPriceOf(i.name); }
      return Object.assign({}, i, { qty: counted, updatedAt: Date.now() });
    });
    this.setState({
      inv, stocktake: null,
      countLog: s.countLog.concat([{ cat: s.invTab, items: Object.keys(c).length, corrected: n, value: Math.round(value), at: Date.now() }])
    });
    this.advanceIfHint('reconcile');
    this.toast(n === 0
      ? 'Count matched your records. Nothing to correct.'
      : plural(n, 'item', 'items') + ' corrected — ' + (value < 0 ? PESO(Math.abs(Math.round(value))) + ' of stock unaccounted for.' : PESO(Math.round(value)) + ' more than your records said.'),
      n === 0 ? 'ok' : 'warn');
  };
  pauseStocktake = () => { this.setState({ sheet: null }); this.go('inventory'); this.toast('Count saved where you left it. Pick it up from Home.'); };
  logSpoilage = (name, qty, why, pid, kind) => {
    const s0 = this.state;
    const n = Number(qty) || 0;
    if (!n) return this.toast('Enter how much went to waste.', 'warn');
    // cookies and dough carry their recipe cost; raw stock carries what you paid for it
    if (pid && kind === 'baked') {
      const have = s0.baked[pid] || 0;
      if (n > have) return this.toast('You only have ' + plural(have, 'baked cookie', 'baked cookies') + ' of ' + P[pid].short + '.', 'warn');
      const cost = Math.round(n * this.unitCost(pid));
      this.setState(st => {
        const b = Object.assign({}, st.baked); b[pid] = Math.max(0, (b[pid] || 0) - n);
        return {
          baked: b, sheet: null,
          spoilage: st.spoilage.concat([{ name: P[pid].short, qty: n, unit: 'cookies', why: why || 'Spoiled', cost, at: Date.now() }])
        };
      });
      return this.toast(plural(n, 'cookie', 'cookies') + ' of ' + P[pid].short + ' written off \u2014 ' + PESO(cost) + ' of ingredients and packaging gone. Anything paid orders were waiting on needs baking again.', 'warn');
    }
    if (pid && kind === 'dough') {
      const have = s0.dough[pid] || 0;
      if (n > have) return this.toast('You only have ' + plural(have, 'dough ball', 'dough balls') + ' of ' + P[pid].short + '.', 'warn');
      const cost = Math.round(n * this.ingCost(pid));
      this.setState(st => {
        const d = Object.assign({}, st.dough); d[pid] = Math.max(0, (d[pid] || 0) - n);
        const at = Object.assign({}, st.doughAt || {}); if (!d[pid]) delete at[pid];
        return {
          dough: d, doughAt: at, sheet: null,
          spoilage: st.spoilage.concat([{ name: P[pid].short + ' dough', qty: n, unit: 'balls', why: why || 'Spoiled', cost, at: Date.now() }])
        };
      });
      return this.toast(plural(n, 'dough ball', 'dough balls') + ' binned \u2014 ' + PESO(cost) + ' of ingredients gone. It is in your waste record.', 'warn');
    }
    const cost = Math.round(n * this.costPerUnit(name));
    this.setState(s => ({
      inv: s.inv.map(i => i.name === name ? Object.assign({}, i, { qty: Math.max(0, i.qty - n), updatedAt: Date.now() }) : i),
      spoilage: s.spoilage.concat([{ name, qty: n, why: why || 'Spoiled', cost, at: Date.now() }]),
      sheet: null
    }));
    this.toast(n + ' of ' + name.toLowerCase() + ' written off \u2014 ' + PESO(cost) + ' of stock gone. It was already expensed when you bought it, so profit does not move twice.', 'warn');
  };
  costPerUnit = name => {
    const paid = (this.state.paid || {})[name];
    if (paid && paid.price > 0 && paid.qty > 0) return paid.price / paid.qty;
    const best = BEST_BUY[name], size = PACK_SIZE[name];
    if (best && size) return best.price / size;
    const row = SUPPLIERS.reduce((f, sp) => f || sp.items.filter(i => i.item === name)[0], null);
    return row ? row.price / (this.packSize(row.pack) || 1) : 0;
  };
  unitPriceOf = name => this.costPerUnit(name);
  packSize = pack => {
    const m = String(pack || '').match(/([0-9.]+)\s*(kg|g|ml|l|pcs|pc)/i);
    if (!m) return 1;
    const n = Number(m[1]) || 1, u = m[2].toLowerCase();
    return u === 'kg' || u === 'l' ? n * 1000 : n;
  };

  // ----- grocery -----
  markBought = k => {
    this.setState(s => { const b = Object.assign({}, s.bought); b[k] = true; return { bought: b, sheet: null }; });
    this.advanceIfHint('bought');
    this.toast('Marked as bought. Receive it when it gets home.', 'ok',
      () => this.setState(s => { const b = Object.assign({}, s.bought); delete b[k]; return { bought: b }; }));
  };
  receiveStock = (k, name, add, unit, cost, supplier, isPack, subName) => {
    const cat = isPack ? 'Packaging' : 'Ingredients';
    const spend = Number(cost) || 0;
    const prevUnit = this.costPerUnit(name);
    const e = spend ? this.entry('expense', cat, name + ' \u00b7 ' + (supplier || 'supplier'), spend, { item: name, qty: add }) : null;
    this.setState(s => {
      const r = Object.assign({}, s.received); r[k] = true;
      const sb = Object.assign({}, s.subs || {}); if (subName) sb[k] = subName;
      const paid = Object.assign({}, s.paid || {});
      if (spend && add > 0) paid[name] = { price: spend, qty: add, supplier: supplier, at: Date.now() };
      return {
        received: r, subs: sb, paid: paid, sheet: null,
        ledger: e ? s.ledger.concat([e]) : s.ledger,
        inv: s.inv.map(i => i.name === name ? Object.assign({}, i, {
          qty: i.qty + add, updatedAt: Date.now(),
          useBy: USE_BY_DAYS[name] ? Date.now() + USE_BY_DAYS[name] * DAY : i.useBy
        }) : i)
      };
    });
    this.advanceIfHint('received');
    if (subName) setTimeout(() => this.toast('Recorded as ' + subName + ' instead of your usual. Cost per cookie uses what you actually paid.', 'warn'), 1800);
    const newUnit = add > 0 ? spend / add : 0;
    if (spend && prevUnit > 0 && newUnit > prevUnit * 1.1) {
      setTimeout(() => this.toast(name + ' cost ' + PESO2(newUnit) + ' per ' + unit + ' against ' + PESO2(prevUnit) + ' last time. Cost per cookie and your margins move with it.', 'warn'), 3600);
    }
    this.toast(add + ' ' + unit + ' of ' + name + ' in stock. ' + (spend ? PESO(spend) + ' logged under ' + cat + ' and the price saved against ' + supplier + '.' : ''), 'ok', () => {
      if (e) this.unpost(e.id);
      this.setState(s => {
        const r = Object.assign({}, s.received); delete r[k];
        return { received: r, inv: s.inv.map(i => i.name === name ? Object.assign({}, i, { qty: Math.max(0, i.qty - add), updatedAt: Date.now() }) : i) };
      });
    });
  };
  confirmReceive = (e, item) => {
    e.preventDefault();
    const got = Number(e.target.rqty.value);
    const paid = Number(e.target.rpaid.value);
    const sub = String(e.target.rsub.value || '').trim();
    if (!(got > 0)) return this.toast('Enter how much you actually came home with.', 'warn');
    const full = got >= item.add;
    if (full) {
      this.setState(s => {
        const p = Object.assign({}, s.partial || {}); delete p[item.key];
        const pb = Object.assign({}, s.plannedBuy || {}); delete pb[item.key];
        return { partial: p, plannedBuy: pb };
      });
      this.receiveStock(item.key, item.name, got, item.unit, paid, item.supplier, item.isPack, sub);
    } else {
      const already = (this.state.partial || {})[item.key] || 0;
      const planned = (this.state.plannedBuy || {})[item.key] || item.add;
      const led = paid ? this.entry('expense', item.isPack ? 'Packaging' : 'Ingredients', item.name + ' \u00b7 part delivery', paid, { item: item.name, qty: got }) : null;
      this.setState(s => {
        const p = Object.assign({}, s.partial || {}); p[item.key] = already + got;
        const pb = Object.assign({}, s.plannedBuy || {}); pb[item.key] = planned;
        const sb = Object.assign({}, s.subs || {}); if (sub) sb[item.key] = sub;
        return {
          partial: p, plannedBuy: pb, subs: sb, sheet: null,
          ledger: led ? s.ledger.concat([led]) : s.ledger,
          inv: s.inv.map(i => i.name === item.name ? Object.assign({}, i, { qty: i.qty + got, updatedAt: Date.now() }) : i)
        };
      });
      this.toast(got + ' ' + item.unit + ' of ' + item.name + ' in. Still ' + Math.round((planned - already - got) * 10) / 10 + ' ' + item.unit + ' short — it stays on your list.', 'warn');
    }
  };
  pickSupplier = (k, v) => { this.setState(s => { const p = Object.assign({}, s.supplierPick); p[k] = v; return { supplierPick: p, sheet: null }; }); this.advanceIfHint('supplier'); this.toast('Supplier changed to ' + v + '.'); };

  // ----- bazaar -----
  startEvent = ev => {
    const stock = {}; PRODUCTS.forEach(p => { stock[p.id] = 0; });
    const prices = {}; PRODUCTS.forEach(p => { prices[p.id] = this.priceOf(p.id); });
    this.setState({ event: { name: ev.name, date: ev.date, stage: 'stock' }, eventStock: stock, eventPrices: prices, eventLoaded: {}, sales: [], cart: {}, unsynced: 0, syncState: 'idle', syncTried: false });
    this.advanceIfHint('startEvent');
  };
  setEventStockTo = (pid, raw) => {
    const s = this.state;
    const want = Math.max(0, Math.floor(Number(String(raw).replace(/[^0-9]/g, '')) || 0));
    const cur = s.eventStock[pid] || 0;
    const max = cur + (s.baked[pid] || 0);
    if (want > max) {
      this.setEventStock(pid, max - cur);
      return this.toast('Only ' + plural(max, 'cookie', 'cookies') + ' of ' + P[pid].short + ' are baked. Put the rest on after the next bake.', 'warn');
    }
    this.setEventStock(pid, want - cur);
  };

  setEventStock = (pid, d) => {
    const s = this.state;
    const total = s.baked[pid] || 0;
    const avail = this.availableBaked(s, pid);
    const cur = s.eventStock[pid] || 0;
    const next = Math.max(0, Math.min(total, cur + d));
    if (d > 0 && next === cur) {
      this.toast(total === 0
        ? 'No ' + P[pid].short + ' baked yet. Bake a batch first.'
        : 'That is every ' + P[pid].short + ' you have baked. Bake more first.', 'warn');
    } else if (d > 0 && next > avail && cur <= avail) {
      this.toast(avail === 0
        ? 'Every baked ' + P[pid].short + ' is already promised to a paid order. Take these to the table only if you will bake replacements.'
        : 'Careful — past ' + avail + ' you are taking ' + P[pid].short + ' that paid orders are waiting on.', 'warn');
    }
    const st = Object.assign({}, s.eventStock); st[pid] = next;
    this.setState({ eventStock: st });
  };
  setEventPrice = (pid, v) => this.setState(s => { const p = Object.assign({}, s.eventPrices); p[pid] = Number(v) || 0; return { eventPrices: p }; });
  openSelling = () => {
    if (!this.cashup()) return this.denyHelper('open an event table');
    const s = this.state;
    const total = PRODUCTS.reduce((t, p) => t + (s.eventStock[p.id] || 0), 0);
    if (!total) return this.toast('Load at least one cookie onto the table first.', 'warn');
    const baked = Object.assign({}, s.baked);
    const loaded = {};
    PRODUCTS.forEach(p => {
      const n = s.eventStock[p.id] || 0;
      loaded[p.id] = n;
      baked[p.id] = Math.max(0, (baked[p.id] || 0) - n);
    });
    const flt = Number(this.cfgOf().drawerFloat) || 0;
    this.setState({ baked, eventLoaded: loaded, drawer: { float: flt, counted: '' }, event: Object.assign({}, s.event, { stage: 'selling' }) });
    this.toast(total + ' cookies on the table. Cash drawer opened with a ' + PESO(flt) + ' float.');
  };
  addCart = (pid, d) => this.setState(s => {
    const c = Object.assign({}, s.cart);
    const max = s.eventStock[pid] || 0;
    c[pid] = Math.max(0, Math.min(max, (c[pid] || 0) + d));
    return { cart: c };
  });
  setDiscount = n => this.setState({ cartDiscount: n });
  setSaleRef = v => this.setState({ saleRef: v });
  setTendered = v => this.setState({ tendered: v });
  cartGross = s => Object.keys(s.cart).filter(k => s.cart[k] > 0).reduce((t, k) => t + s.eventPrices[k] * s.cart[k], 0);
  recordSale = (pay, freebie) => {
    const s = this.state;
    const items = Object.keys(s.cart).filter(k => s.cart[k] > 0);
    if (!items.length) return this.toast('Add at least one cookie first.', 'warn');
    const gross = this.cartGross(s);
    const disc = freebie ? gross : Math.min(gross, s.cartDiscount || 0);
    const total = Math.max(0, gross - disc);
    const digital = ['GCash', 'Maya', 'GoTyme'].indexOf(pay) >= 0;
    if (digital && !String(s.saleRef).trim()) return this.toast('Type the last 4 digits of their ' + pay + ' reference so this sale can be reconciled.', 'warn');
    const tendered = Number(s.tendered) || 0;
    if (pay === 'Cash' && tendered && tendered < total) return this.toast('That is less than ' + PESO(total) + '. Check the cash again.', 'warn');
    const stock = Object.assign({}, s.eventStock);
    let sold = 0;
    items.forEach(k => { stock[k] = Math.max(0, stock[k] - s.cart[k]); sold += s.cart[k]; });
    // a table sale uses a pouch per cookie and a bag per customer — same stock the orders draw from
    const packUse = { 'Single cookie pouch': sold, 'Paper bag': 1 };
    const invAfter = s.inv.map(i => packUse[i.name] ? Object.assign({}, i, { qty: Math.max(0, i.qty - packUse[i.name]), updatedAt: Date.now() }) : i);
    const change = pay === 'Cash' && tendered ? tendered - total : 0;
    const sale = {
      id: 'S' + (s.sales.length + 1), items: Object.assign({}, s.cart), total, gross, discount: disc,
      pay: freebie ? 'Freebie' : pay, ref: digital ? String(s.saleRef).trim() : '', clerk: ROLES[s.role].label, at: Date.now(),
      tendered: pay === 'Cash' ? tendered : 0, change: change, synced: s.online, failed: false
    };
    const led = total > 0 ? this.entry('revenue', 'Bazaar', (s.event ? s.event.name : 'Event') + ' · ' + sale.id + ' · ' + (sale.pay), total, { sale: sale.id, ev: true }) : null;
    sale.ledgerId = led ? led.id : null;
    this.setState({ sales: [sale].concat(s.sales), inv: invAfter, cart: {}, cartDiscount: 0, saleRef: '', tendered: '', eventStock: stock, unsynced: s.online ? s.unsynced : s.unsynced + 1, sheet: null, ledger: led ? s.ledger.concat([led]) : s.ledger });
    this.advanceIfHint('sale');
    this.toast(!s.online
      ? 'Saved on this phone. It will sync when you are back online.'
      : freebie ? 'Freebie recorded.'
      : change > 0 ? PESO(total) + ' in. Give ' + PESO(change) + ' change.'
      : PESO(total) + ' sale recorded.' + (disc ? ' ' + PESO(disc) + ' off.' : ''), s.online ? 'ok' : 'warn');
  };
  voidSale = id => {
    const s = this.state, sale = s.sales.filter(x => x.id === id)[0];
    if (!sale) return;
    const stock = Object.assign({}, s.eventStock);
    Object.keys(sale.items).forEach(k => { stock[k] = (stock[k] || 0) + sale.items[k]; });
    this.setState({
      eventStock: stock,
      sales: s.sales.filter(x => x.id !== id),
      ledger: s.ledger.filter(e => e.id !== sale.ledgerId),
      unsynced: sale.synced ? s.unsynced : Math.max(0, s.unsynced - 1)
    });
    this.toast(sale.id + ' voided. ' + plural(Object.keys(sale.items).reduce((t, k) => t + sale.items[k], 0), 'cookie is', 'cookies are') + ' back on the table.', 'warn');
  };
  retrySale = id => {
    if (!this.state.online) return this.toast('Still offline. This sale is safe on the phone.', 'warn');
    this.setState(s => ({
      sales: s.sales.map(x => x.id === id ? Object.assign({}, x, { synced: true, failed: false }) : x),
      unsynced: Math.max(0, s.unsynced - 1)
    }));
    this.toast(id + ' sent.');
  };
  setDrawerCounted = v => this.setState(s => ({ drawer: Object.assign({}, s.drawer || { float: Number(this.cfgOf().drawerFloat) || 0 }, { counted: v }) }));
  syncNow = () => {
    const st0 = this.state;
    if (!st0.online) return this.toast('Still offline. Sales are safe on this phone.', 'warn');
    const pending = st0.sales.filter(x => !x.synced).length;
    if (!pending) return this.toast('Nothing waiting to sync.');
    this.setState({ syncState: 'syncing' });
    setTimeout(() => {
      const s = this.state;
      const unsent = s.sales.filter(x => !x.synced);
      if (!s.syncTried && unsent.length > 1) {
        const failId = unsent[unsent.length - 1].id;
        this.setState({
          syncTried: true, syncState: 'partial', unsynced: 1,
          sales: s.sales.map(x => x.synced ? x : (x.id === failId
            ? Object.assign({}, x, { failed: true })
            : Object.assign({}, x, { synced: true, failed: false })))
        });
        this.toast((unsent.length - 1) + ' of ' + unsent.length + ' sales synced. One could not be sent — nothing was lost. Tap Sync now again to finish.', 'warn');
      } else {
        this.setState({ syncState: 'synced', unsynced: 0, sales: s.sales.map(x => Object.assign({}, x, { synced: true, failed: false })), syncTried: true });
        this.toast(plural(unsent.length, 'sale', 'sales') + ' synced.');
        this.advanceIfHint('sync');
      }
    }, 1300);
  };
  closeEvent = () => {
    const s = this.state;
    if (!this.cashup()) return this.denyHelper('close an event');
    if (s.unsynced > 0 && s.online) return this.toast(plural(s.unsynced, 'sale has', 'sales have') + ' not synced yet. Tap Sync now in the banner at the top, then close out.', 'warn');
    const baked = Object.assign({}, s.baked);
    let back = 0;
    PRODUCTS.forEach(p => {
      const left = s.eventStock[p.id] || 0;
      back += left;
      baked[p.id] = (baked[p.id] || 0) + left;
    });
    const cash = s.sales.filter(x => x.pay === 'Cash').reduce((t, x) => t + x.total, 0);
    const expected = (s.drawer ? s.drawer.float : 0) + cash;
    const counted = s.drawer && s.drawer.counted !== '' && s.drawer.counted != null ? Number(s.drawer.counted) : null;
    const diff = counted === null ? null : counted - expected;
    const who = ROLES[s.role].label;
    // a short drawer is a real loss and belongs in the books; an over is a correction to takings
    const led = (diff !== null && diff !== 0)
      ? this.entry(diff < 0 ? 'expense' : 'revenue', diff < 0 ? 'Cash variance' : 'Bazaar',
          (s.event ? s.event.name : 'Event') + ' \u2014 drawer ' + (diff < 0 ? 'short' : 'over') + ' \u00b7 counted by ' + who, Math.abs(diff), { ev: true })
      : null;
    this.setState({
      baked, sheet: null,
      ledger: led ? s.ledger.concat([led]) : s.ledger,
      event: Object.assign({}, s.event, { stage: 'closed', zExpected: expected, zCounted: counted, zDiff: diff, closedBy: who, closedAt: Date.now() })
    });
    this.advanceIfHint('close');
    if (diff !== null && diff !== 0) {
      this.toast('Drawer is ' + (diff > 0 ? PESO(diff) + ' over' : PESO(Math.abs(diff)) + ' short') + ' against ' + PESO(expected) + ' expected. Logged under ' + (diff < 0 ? 'Cash variance' : 'Bazaar takings') + ' with your name on it.', 'warn');
    } else if (counted !== null) {
      this.toast('Drawer balances at ' + PESO(expected) + '. ' + (back ? plural(back, 'unsold cookie is', 'unsold cookies are') + ' back in baked stock.' : 'Event closed.'));
    } else if (back) {
      this.toast(plural(back, 'unsold cookie is', 'unsold cookies are') + ' back in your baked stock.');
    }
  };
  reopenEvent = () => {
    this.setState(s => ({ event: Object.assign({}, s.event, { stage: 'selling' }), sheet: null }));
    this.toast('Table reopened. Stock and sales are as you left them.', 'warn');
  };
  addEventExpense = (label, amount, cat) => {
    if (!label || !amount) return this.toast('Add a label and an amount.', 'warn');
    const s = this.state;
    const e = this.entry('expense', cat || 'Bazaar rent', (s.event ? s.event.name + ' — ' : '') + label, amount, { ev: true });
    this.setState({ ledger: s.ledger.concat([e]), sheet: null });
    this.toast(PESO(Number(amount)) + ' added under ' + (cat || 'Bazaar rent') + '. It is in your P&L already.');
  };
  resetEvent = () => this.setState(s => {
    // anything still on the table goes back to baked stock — cookies never just disappear
    const baked = Object.assign({}, s.baked);
    PRODUCTS.forEach(p => { baked[p.id] = (baked[p.id] || 0) + (s.eventStock[p.id] || 0); });
    return {
      event: null, sales: [], cart: {}, unsynced: 0, syncState: 'idle', syncTried: false,
      drawer: null, cartDiscount: 0, saleRef: '', tendered: '',
      baked: baked, eventStock: {}, eventLoaded: {}
    };
  });

  expectedCost = name => {
    const row = SUPPLIERS.reduce((f, sp) => f || sp.items.filter(i => i.item === name)[0], null);
    return row ? row.price : 0;
  };
  attachReceipt = () => { this.setState({ receiptShot: 'uploading' }); setTimeout(() => { this.setState({ receiptShot: 'done' }); this.toast('Receipt attached to this grocery run.'); }, 800); };

  // cost of one cookie, from its recipe and what she has actually paid
  ingCost = pid => {
    const r = this.state.recipes[pid];
    if (!r || !r.yield) return 0;
    const ing = r.ing.filter(i => i[0]).reduce((t, i) => t + (Number(i[1]) || 0) * this.costPerUnit(i[0]), 0);
    return ing / r.yield;
  };
  packCostPerCookie = () => ['Box of 6', 'Brand sticker', 'Thank-you card'].reduce((t, n) => t + this.costPerUnit(n) / 6, 0);
  unitCost = pid => Math.round((this.ingCost(pid) + this.packCostPerCookie()) * 100) / 100;

  // ----- pnl -----
  addExpense = (cat, label, amount, itemName, itemQty) => {
    if (!cat || !amount) return this.toast('Pick a category and an amount.', 'warn');
    const spend = Number(amount) || 0;
    const row = itemName ? this.state.inv.filter(i => i.name === itemName)[0] : null;
    const qty = Number(itemQty) || 0;

    // a plain expense: money out, nothing else moves
    if (!row || qty <= 0) {
      if (row && qty <= 0) return this.toast('Enter how much of ' + row.name + ' came in, or set it back to Not a stock item.', 'warn');
      const e = this.entry('expense', cat, label || cat, spend);
      this.setState(s => ({ ledger: s.ledger.concat([e]), sheet: null }));
      this.advanceIfHint('expense');
      return this.toast(PESO(spend) + ' recorded under ' + cat + '.', 'ok', () => this.unpost(e.id));
    }

    // a stock purchase: the price you actually paid becomes the price your cookies cost
    const bookCat = row.cat === 'Packaging' ? 'Packaging' : 'Ingredients';
    const prevUnit = this.costPerUnit(row.name);
    const e = this.entry('expense', bookCat, label || (row.name + ' \u00b7 ' + row.supplier), spend, { item: row.name, qty: qty });
    this.setState(st => {
      const paid = Object.assign({}, st.paid || {});
      paid[row.name] = { price: spend, qty: qty, supplier: row.supplier, at: Date.now() };
      return {
        paid: paid, sheet: null,
        ledger: st.ledger.concat([e]),
        inv: st.inv.map(i => i.name === row.name ? Object.assign({}, i, {
          qty: i.qty + qty, updatedAt: Date.now(),
          useBy: USE_BY_DAYS[row.name] ? Date.now() + USE_BY_DAYS[row.name] * DAY : i.useBy
        }) : i)
      };
    });
    this.advanceIfHint('expense');
    const newUnit = spend / qty;
    const moved = prevUnit > 0 && Math.abs(newUnit - prevUnit) / prevUnit > 0.02;
    this.toast(amt(qty, row.unit) + ' of ' + row.name + ' in stock at ' + PESO2(newUnit) + ' per ' + row.unit
      + (moved
        ? ' \u2014 was ' + PESO2(prevUnit) + '. Cost per cookie and your margins have moved with it.'
        : '. Cost per cookie uses this price from now on.'), 'ok', () => {
      this.unpost(e.id);
      this.setState(st => ({ inv: st.inv.map(i => i.name === row.name ? Object.assign({}, i, { qty: Math.max(0, i.qty - qty), updatedAt: Date.now() }) : i) }));
    });
  };
  addCategory = name => {
    if (!name) return this.toast('Name the category first.', 'warn');
    this.setState(s => ({ categories: s.categories.concat([name]) }));
    this.advanceIfHint('category');
    this.toast('"' + name + '" added.');
  };
  renameCategory = (old, next) => {
    if (!next) return;
    this.setState(s => ({ categories: s.categories.map(c => c === old ? next : c), ledger: s.ledger.map(e => e.cat === old ? Object.assign({}, e, { cat: next }) : e) }));
    this.advanceIfHint('category');
    this.toast('Renamed to "' + next + '". Past records kept their history.');
  };
  toggleCategory = name => {
    this.setState(s => ({ inactiveCats: s.inactiveCats.indexOf(name) >= 0 ? s.inactiveCats.filter(c => c !== name) : s.inactiveCats.concat([name]) }));
    this.advanceIfHint('category');
  };

  // ----- form queue -----
  queueSet = (id, pid, d) => this.setState(s => ({
    queue: s.queue.map(q => {
      if (q.id !== id) return q;
      const g = Object.assign({}, q.guess);
      g[pid] = Math.max(0, (g[pid] || 0) + d);
      if (!g[pid]) delete g[pid];
      return Object.assign({}, q, { guess: g, edited: true });
    })
  }));
  queueRef = (id, v) => this.setState(s => ({ queue: s.queue.map(q => q.id === id ? Object.assign({}, q, { ref: v }) : q) }));
  acceptQueue = id => {
    const s = this.state, q = s.queue.filter(x => x.id === id)[0];
    const n = Object.keys(q.guess).reduce((t, k) => t + q.guess[k], 0);
    const ref = String(q.ref || '').trim();
    if (!ref) return this.toast('Type the payment reference from their message first — an order with no reference cannot be reconciled.', 'warn');
    const id2 = 'HC-10' + (56 + s.orders.length - 14);
    const bad = this.refLooksWrong('GCash', ref);
    this.setState({
      queue: s.queue.filter(x => x.id !== id),
      orders: s.orders.concat([{ id: id2, name: q.name, ig: '', items: q.guess, priced: Object.assign({}, s.prices), status: 'Payment review', pay: q.pay || 'GCash', ref: ref, day: q.day, placedAt: Date.now(), drop: s.dropNo, warn: bad || null }]),
      sheet: null
    });
    this.advanceIfHint('accept');
    this.toast('Accepted as ' + id2 + ' with ref ' + ref + '. In Payment review until you confirm the proof.');
  };
  rejectQueue = id => {
    this.setState(s => {
      const q = s.queue.filter(x => x.id === id)[0];
      return {
        queue: s.queue.filter(x => x.id !== id),
        queueArchive: s.queueArchive.concat([Object.assign({}, q, { rejectedAt: Date.now() })]),
        sheet: null
      };
    });
    this.advanceIfHint('accept');
    this.toast('Response rejected and filed under rejected responses. Nothing was added to your orders.', 'warn');
  };
  restoreQueue = id => {
    this.setState(s => {
      const q = s.queueArchive.filter(x => x.id === id)[0];
      return { queue: s.queue.concat([q]), queueArchive: s.queueArchive.filter(x => x.id !== id), sheet: null };
    });
    this.toast('Back in the queue.');
  };

  // ===== design tokens (data-driven tones only; layout styling lives in the template) =====
  TONE = {
    ok:    { bg: '#E8F5EE', fg: '#1B7A4B', br: '#C6E5D5', dot: '#22945B' },
    warn:  { bg: '#FDF3E2', fg: '#95600A', br: '#EFDCB5', dot: '#C9860F' },
    bad:   { bg: '#FCECEA', fg: '#A8231B', br: '#F2CFCB', dot: '#C1352B' },
    info:  { bg: '#EEF4FE', fg: '#24487F', br: '#CFE0FB', dot: '#5C8BE0' },
    brand: { bg: '#FDEDE5', fg: '#A63C0E', br: '#F7D6C5', dot: '#E75F23' },
    mute:  { bg: '#F6F4F2', fg: '#6E574B', br: '#E7E2DE', dot: '#6B564C' }
  };
  STATUS_TONE = { 'Confirmed': 'ok', 'Payment review': 'warn', 'Preparing': 'info', 'Ready': 'brand', 'Completed': 'mute', 'Cancelled': 'bad', 'No-show': 'bad' };
  STATUS_LABEL = { 'Confirmed': 'Paid', 'Payment review': 'Awaiting payment', 'Preparing': 'Baking', 'Ready': 'Ready', 'Completed': 'Collected', 'Cancelled': 'Cancelled', 'No-show': 'No-show' };
  PLANNED = ['Confirmed', 'Preparing'];
  RESERVING = ['Confirmed', 'Preparing'];
  RECOGNISED = ['Confirmed', 'Preparing', 'Ready', 'Completed', 'No-show'];
  REF_RULES = {
    'GCash': { re: /^[0-9]{10,13}$/, hint: '10–13 digits on the GCash receipt' },
    'Maya': { re: /^[A-Za-z0-9-]{8,20}$/, hint: '8–20 characters on the Maya receipt' },
    'GoTyme': { re: /^[A-Za-z0-9-]{8,20}$/, hint: '8–20 characters on the GoTyme receipt' },
    'Bank transfer': { re: /^[A-Za-z0-9-]{6,24}$/, hint: 'the InstaPay or PESONet reference' }
  };
  normRef = r => String(r || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  refLooksWrong = (pay, ref) => {
    const rule = this.REF_RULES[pay];
    if (!rule) return '';
    const v = String(ref || '').replace(/[\s]/g, '');
    return rule.re.test(v) ? '' : 'Reference does not look like ' + pay + ' — expected ' + rule.hint + '.';
  };
  dupRefOf = (s, o) => {
    const n = this.normRef(o.ref);
    if (!n || n === 'FROMFORM') return null;
    return s.orders.filter(x => x.id !== o.id && this.normRef(x.ref) === n && ['Cancelled'].indexOf(x.status) < 0)[0] || null;
  };

  IC = {
    camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    home: 'M4 11.4 12 4.2l8 7.2M6.4 10v9.8h11.2V10',
    orders: 'M4.5 7h15M4.5 12h15M4.5 17h9',
    bake: 'M4.5 6.5h15v11h-15zM7.5 10.5h9M7.5 14h5',
    inventory: 'M4 8.4 12 4l8 4.4v7.2L12 20l-8-4.4zM4 8.4 12 12.9l8-4.5M12 12.9V20',
    grocery: 'M4.5 8h15l-1.8 11H6.3zM9 8V5.2h6V8',
    bazaar: 'M6.5 20V4l11 4-11 4',
    money: 'M8 6.5v11M8 6.5h4.6a3.3 3.3 0 0 1 0 6.6H8M5.8 10.4h8.8M5.8 13.2h8.8',
    tools: 'M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z',
    bell: 'M12 4.2a5 5 0 0 0-5 5v3.9l-1.8 2.7h13.6L17 13.1V9.2a5 5 0 0 0-5-5M10.2 19a2 2 0 0 0 3.6 0',
    plus: 'M12 5.5v13M5.5 12h13',
    minus: 'M5.5 12h13',
    check: 'M5.5 12.8l4.4 4.4 8.6-9.6',
    alert: 'M12 5 3.8 19.2h16.4zM12 9.8v4.4M12 16.8h.01',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 11v5.2M12 7.9h.01',
    trend: 'M4.5 16.5 9.6 10l3.6 2.8 6.3-7.5M4.5 19.5h15',
    cookie: 'M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6M9.4 10h.01M14.2 9.4h.01M11 14.2h.01M15 13.6h.01',
    clock: 'M12 4.2a7.8 7.8 0 1 0 0 15.6 7.8 7.8 0 0 0 0-15.6M12 8.2v4.4l3 2',
    pickup: 'M3.5 7h10.2v8.8H3.5zM13.7 10.2h3.9l2.9 3v2.6h-6.8M6.8 18.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2M17.4 18.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2',
    gear: 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6M12 3.4v2.4M12 18.2v2.4M5.2 7.6l2.1 1.2M16.7 15.2l2.1 1.2M5.2 16.4l2.1-1.2M16.7 8.8l2.1-1.2',
    recipe: 'M6.5 3.8h9l3 3v13.4h-12zM9.2 9.2h6M9.2 13h6M9.2 16.6h4',
    tag: 'M4.4 12.2 12.2 4.4h7v7l-7.8 7.8zM15.8 7.8h.01',
    users: 'M8.4 11.2a3 3 0 1 0 0-6 3 3 0 0 0 0 6M3.6 19.8c0-3 2.1-4.6 4.8-4.6s4.8 1.6 4.8 4.6M15.8 11a3 3 0 1 0 0-6M20.4 19.8c0-3-1.6-4.6-4.2-4.6',
    sync: 'M20 12a8 8 0 1 1-2.4-5.7M20.2 4.2v4.2h-4.2',
    right: 'M5.5 12h12.4M13 6.6 18.4 12 13 17.4',
    back: 'M18.6 12H6.2M11.4 6.6 5.6 12l5.8 5.4',
    search: 'M11 18.2a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4M16.2 16.2l4 4',
    play: 'M8.4 5.6 18.2 12 8.4 18.4z',
    close: 'M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6',
    down: 'M6 9.4 12 15.4 18 9.4',
    eye: 'M2.8 12S6.2 6.6 12 6.6 21.2 12 21.2 12 17.8 17.4 12 17.4 2.8 12 2.8 12M12 14.9a2.9 2.9 0 1 0 0-5.8 2.9 2.9 0 0 0 0 5.8',
    eyeOff: 'M4 4l16 16M9.9 5.1A7.6 7.6 0 0 1 12 4.8c5.8 0 9.2 5.4 9.2 5.4a17 17 0 0 1-2.5 3.1M6.3 7.1A17 17 0 0 0 2.8 10.2s3.4 5.4 9.2 5.4c1 0 1.9-.16 2.7-.43',
    dough: 'M12 5.2c4 0 7.2 2.6 7.2 5.8s-3.2 5.8-7.2 5.8-7.2-2.6-7.2-5.8S8 5.2 12 5.2M6 16.2c1.4 1.6 3.6 2.6 6 2.6s4.6-1 6-2.6',
    shop: 'M5.2 8.4h13.6L20 19.6H4zM8.6 8.4V6.2a3.4 3.4 0 0 1 6.8 0v2.2',
    doc: 'M6.6 3.8h7.6l3.6 3.6v12.8H6.6zM9.4 12.4h5.2M9.4 16h5.2',
    export: 'M12 15.4V4.6M8 8.4 12 4.4l4 4M4.8 15v4.4h14.4V15'
  };

  // animated numeric transition — component identity must survive re-render
  Counter = props => {
    const [v, setV] = React.useState(props.value);
    const from = React.useRef(props.value);
    React.useEffect(() => {
      const a = from.current, b = props.value;
      if (a === b) return;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { from.current = b; setV(b); return; }
      const t0 = performance.now(), dur = 420;
      let raf;
      const step = now => {
        const p = Math.min(1, (now - t0) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        setV(a + (b - a) * e);
        if (p < 1) raf = requestAnimationFrame(step); else { from.current = b; setV(b); }
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }, [props.value]);
    const shown = props.decimals ? v.toFixed(props.decimals) : Math.round(v).toLocaleString('en-PH');
    return React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums' } }, (props.prefix || '') + shown + (props.suffix || ''));
  };
  num = (value, prefix, suffix) => React.createElement(this.Counter, { value: Number(value) || 0, prefix: prefix, suffix: suffix });

  // a Tweaks change always wins over an in-app setting, then everything is saved
  componentDidUpdate(prevProps) {
    const p0 = prevProps || {};
    if (p0.boxPricing !== this.props.boxPricing) this.setState(s => ({ cfg: Object.assign({}, s.cfg, { priceMode: null }), priceDraft: null }));
    if (p0.capacity !== this.props.capacity) this.setState(s => ({ cfg: Object.assign({}, s.cfg, { capacity: Number(this.props.capacity) || s.cfg.capacity }) }));
    if (p0.packagingFee !== this.props.packagingFee) this.setState(s => ({ cfg: Object.assign({}, s.cfg, { packagingFee: Number(this.props.packagingFee) }) }));
    if (p0.flatBoxPrice !== this.props.flatBoxPrice) this.setState(s => ({ cfg: Object.assign({}, s.cfg, { flatBoxPrice: Number(this.props.flatBoxPrice) }) }));
    this.persist();
  }

  // ----- dimensional product object on Home (pointer only, never blocks) -----
  tiltRef = el => { this._tilt = el; };
  onTilt = e => {
    if (!this._tilt) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width - 0.5;
    const y = (e.clientY - box.top) / box.height - 0.5;
    this._tilt.style.transform = 'perspective(680px) rotateY(' + (x * 15).toFixed(2) + 'deg) rotateX(' + (-y * 11).toFixed(2) + 'deg) scale(1.02)';
  };
  offTilt = () => { if (this._tilt) this._tilt.style.transform = 'perspective(680px) rotateY(0deg) rotateX(0deg) scale(1)'; };

  // ----- one-item count -----
  countOne = name => {
    this.setState({ stocktake: { i: 0, counts: {}, items: [name] }, sheet: null });
    this.toast('Counting ' + name + ' only.');
  };
  adjustInv = (name, qty, dir) => {
    const n = Math.abs(Number(qty) || 0);
    if (!n) return this.toast('Type how much to ' + (dir < 0 ? 'subtract' : 'add') + '.', 'warn');
    const row = this.state.inv.filter(i => i.name === name)[0];
    if (!row) return;
    const before = row.qty;
    const after = Math.max(0, Math.round((before + dir * n) * 10) / 10);
    this.setState(s => ({
      inv: s.inv.map(i => i.name === name ? Object.assign({}, i, { qty: after, updatedAt: Date.now() }) : i),
      sheet: null
    }));
    this.toast(name + ': ' + amt(before, row.unit) + ' → ' + amt(after, row.unit) + '.', 'ok',
      () => this.setState(s => ({ inv: s.inv.map(i => i.name === name ? Object.assign({}, i, { qty: before }) : i) })));
  };
  receiveInv = (name, addQty, unit) => {
    const n = Number(addQty);
    if (!n) return this.toast('Type how much arrived.', 'warn');
    const prev = this.state.inv.filter(i => i.name === name)[0];
    const prevQty = prev ? prev.qty : 0;
    this.setState(s => ({ inv: s.inv.map(i => i.name === name ? Object.assign({}, i, { qty: i.qty + n, updatedAt: Date.now() }) : i), sheet: null }));
    this.toast(n + ' ' + unit + ' of ' + name + ' received.', 'ok', () => this.setState(s => ({
      inv: s.inv.map(i => i.name === name ? Object.assign({}, i, { qty: prevQty }) : i)
    })));
  };

  // ----- search -----
  setQ = (k, v) => this.setState(s => { const q = Object.assign({}, s.q || {}); q[k] = v; return { q: q }; });
  getQ = k => ((this.state.q || {})[k] || '');

  // ----- quick add -----
  openQuick = () => this.setState({ quick: true });
  closeQuick = () => this.setState({ quick: false });
  quickRun = fn => { this.setState({ quick: false }); setTimeout(fn, 10); };

  neediest = () => {
    const s = this.state;
    let best = PRODUCTS[0].id, n = -1;
    PRODUCTS.forEach(p => { const t = this.toBake(p.id, s); if (t > n) { n = t; best = p.id; } });
    return best;
  };

  previewCheckout = () => {
    const s = this.state;
    if (this.custTotal() === 0) {
      this.setState({ cust: Object.assign({}, s.cust, { box: { wcb: 2, rvc: 2, pbm: 2 } }) });
    }
    this.go('checkout');
  };
  previewStatus = () => {
    const s = this.state;
    if (!s.cust.orderNo) {
      const last = s.orders.filter(o => o.status === 'Payment review')[0] || s.orders[s.orders.length - 1];
      this.setState({ cust: Object.assign({}, s.cust, { orderNo: last.id, window: last.day, box: Object.assign({}, last.items) }) });
    }
    this.go('status');
  };

  reconcileVals(s) {
    const rows = s.orders.filter(o => this.RECOGNISED.indexOf(o.status) >= 0 || o.status === 'Payment review');
    const matched = s.matched || {};
    const byMethod = {};
    rows.forEach(o => {
      const amt = o.paidAmount != null ? o.paidAmount : this.boxTotal(o.items, o.priced);
      const m = byMethod[o.pay] || { pay: o.pay, total: 0, ticked: 0, n: 0 };
      m.total += amt; m.n++;
      if (matched[o.id]) m.ticked += amt;
      byMethod[o.pay] = m;
    });
    const left = rows.filter(o => !matched[o.id]);
    return {
      recRows: rows.map(o => {
        const amt = o.paidAmount != null ? o.paidAmount : this.boxTotal(o.items, o.priced);
        const dup = this.dupRefOf(s, o);
        const odd = this.refLooksWrong(o.pay, o.ref);
        return {
          id: o.id, name: o.name, ref: o.ref || '—', pay: o.pay,
          amountText: PESO(amt), when: relWhen(o.placedAt, s.now),
          ticked: !!matched[o.id], untick: !matched[o.id],
          pending: o.status === 'Payment review',
          flagged: !!dup || !!odd,
          flagText: dup ? 'Same ref as ' + dup.id : odd ? 'Odd format' : '',
          toggle: () => this.setState(st => { const m = Object.assign({}, st.matched || {}); if (m[o.id]) { delete m[o.id]; } else { m[o.id] = true; } return { matched: m }; }),
          open: () => this.go('order', { orderId: o.id })
        };
      }),
      recMethods: Object.keys(byMethod).map(k => {
        const m = byMethod[k];
        return { pay: k, totalText: PESO(m.total), tickedText: PESO(m.ticked), leftText: PESO(m.total - m.ticked), done: m.ticked === m.total, n: plural(m.n, 'order', 'orders') };
      }),
      recTotalText: PESO(rows.reduce((t, o) => t + (o.paidAmount != null ? o.paidAmount : this.boxTotal(o.items, o.priced)), 0)),
      recLeftText: left.length ? plural(left.length, 'reference', 'references') + ' still to tick off' : 'Everything matched',
      recAllDone: left.length === 0,
      recTickAll: () => { const m = {}; rows.forEach(o => { m[o.id] = true; }); this.setState({ matched: m }); this.toast('All references ticked. Your wallet and your books agree.'); },
      recClear: () => this.setState({ matched: {} })
    };
  }

  // ---------- render ----------
  renderVals() {
    const s = this.state;
    const isDesktop = s.device === 'desktop';
    const isTablet = s.device === 'tablet';
    const hint = this.hintKey();
    const f = FLOWS[s.flowId];
    const role = ROLES[s.role];
    const money = role.money;

    const phoneW = s.phoneW || 390;
    const W = isDesktop ? 1280 : isTablet ? 834 : phoneW;
    const H = isDesktop ? 800 : isTablet ? 900 : 800;
    const scale = isDesktop ? 0.88 : 1;

    const custMode = CUSTOMER_SCREENS.indexOf(s.screen) >= 0;
    const denied = !this.canSee(s.screen);
    const stocktakeOn = !!s.stocktake;
    const bzSelling = s.screen === 'bazaar' && s.event && s.event.stage === 'selling';
    const focusMode = (s.screen === 'batch' && !!s.batch) || (s.screen === 'inventory' && stocktakeOn) || !!bzSelling;

    // ---- counts that drive badges and priorities ----
    const reviewN = s.orders.filter(o => o.status === 'Payment review').length;
    const gplan = this.groceryPlan(s).filter(i => !s.received[i.key]);
    const gcost = gplan.reduce((t, i) => t + i.cost, 0);
    const queueN = s.queue.length;
    const healthN = (s.backup === 'ok' ? 0 : 1) + (s.unsynced > 0 ? 1 : 0);
    const lowStock = s.inv.filter(i => i.qty < i.level);
    const alertN = this.notifs(s).filter(n => n.tone !== 'ok').length;

    const cap = this.capacityOf();
    const capConfirmed = this.confirmedCookies(s);
    const capPending = s.orders.filter(o => o.status === 'Payment review').reduce((t, o) => t + orderCount(o), 0);
    const capLeft = Math.max(0, cap - capConfirmed);
    const pct = n => Math.min(100, n / cap * 100).toFixed(1) + '%';

    const bt = PRODUCTS.reduce((a, p) => {
      const tb = this.toBake(p.id, s);
      a.toBake += tb;
      a.toMix += Math.max(0, tb - (s.dough[p.id] || 0));
      return a;
    }, { toBake: 0, toMix: 0 });
    const confirmedOrders = s.orders.filter(o => o.status === 'Confirmed' || o.status === 'Preparing').length;

    // ---- navigation ----
    const navDef = {
      today: { icon: this.IC.home, label: 'Home' },
      orders: { icon: this.IC.orders, label: 'Orders', badge: reviewN },
      bake: { icon: this.IC.bake, label: 'Bake' },
      inventory: { icon: this.IC.inventory, label: 'Inventory' },
      grocery: { icon: this.IC.grocery, label: 'Grocery', badge: gplan.length },
      bazaar: { icon: this.IC.bazaar, label: 'Bazaar' },
      sales: { icon: this.IC.money, label: 'Sales log' },
      pnl: { icon: this.IC.money, label: 'P&L' },
      more: { icon: this.IC.tools, label: 'All tools', badge: queueN + healthN }
    };
    const mk = k => ({
      key: k, icon: navDef[k].icon, label: navDef[k].label, badge: navDef[k].badge || 0,
      active: s.screen === k, go: () => this.go(k)
    });
    const railKeys = ['today', 'sales', 'orders', 'bake', 'inventory', 'grocery', 'bazaar', 'pnl', 'more'].filter(k => this.canSee(k));
    const dockKeys = railKeys;
    const railIdx = railKeys.indexOf(s.screen);
    const dockIdx = dockKeys.indexOf(s.screen);
    const tick = s.navTick || 0;
    const dirName = s.navDir === 'back' ? 'Back' : 'Fwd';

    const titles = {
      today: ['Home', ''],
      orders: ['Orders', s.orders.filter(o => this.inDrop(s, o)).length + ' in Drop ' + s.dropNo],
      bake: ['Bake plan', 'Drop ' + s.dropNo + ' · bake day'],
      sales: ['Sales log', 'Every sale recorded'],
      inventory: ['Inventory', 'Ingredients, packaging, dough, baked'],
      more: ['All tools', 'Every part of the business'],
      grocery: ['Grocery', 'For Drop ' + s.dropNo],
      bazaar: ['Bazaar Mode', 'Event selling'],
      pnl: ['Profit & loss', MON_NAMES[new Date(s.now).getMonth()] + ' ' + new Date(s.now).getFullYear()],
      reconcile: ['Payments', 'Match refs to your wallet'],
      formqueue: ['Form queue', 'Temporary · one to two weeks'],
      health: ['System health', 'Backups, sync, errors'],
      products: ['Products', '4 permanent · 2 rotating'],
      order: ['Order', s.orderId || ''],
      recipes: ['Recipes', 'Editing creates a new version'],
      drops: ['Drops', 'Drop ' + s.dropNo + ' · this week'],
      suppliers: ['Suppliers', 'Lowest recent price is suggested'],
      settings: ['Settings', 'What you can change yourself'],
      batch: ['Production', ''],
      notifications: ['Notifications', alertN ? alertN + ' need attention' : 'Nothing urgent']
    };
    const t = titles[s.screen] || ['Home', ''];

    // ---- quick add: context first ----
    const qa = {
      order: { icon: this.IC.shop, label: 'New order', sub: 'Open the customer page and build a box', go: () => this.go('shop', { hint: 'shop' }) },
      purchase: { icon: this.IC.grocery, label: 'Record a purchase', sub: 'Any ingredient or packaging', go: () => {
        this.go('grocery');
        const plan = this.groceryPlan(this.state).filter(i => !this.state.received[i.key]);
        const first = plan.length ? plan[0].key : (s.inv.filter(i => i.cat === 'Ingredients')[0] || {}).name;
        setTimeout(() => this.openReceive(first), 60);
      } },
      adjust: { icon: this.IC.inventory, label: 'Adjust stock', sub: 'Pick any item and correct it', go: () => {
        const it = s.inv.filter(i => i.cat === 'Ingredients' || i.cat === 'Packaging')[0];
        this.setInvTab(it && it.cat === 'Packaging' ? 'Packaging' : 'Ingredients');
        this.go('inventory');
        if (it) this.sheet('invEdit', { name: it.name, qty: it.qty, unit: it.unit, level: it.level, cat: it.cat, supplier: it.supplier });
      } },
      expense: { icon: this.IC.money, label: 'Record an expense', sub: 'Amount, category, date', go: () => { this.go('pnl'); this.sheet('expense'); } },
      dough: { icon: this.IC.dough, label: 'Record dough', sub: 'Into the chiller, any flavour', go: () => { this.go('bake'); this.startDough(this.neediest()); } },
      batch: { icon: this.IC.bake, label: 'Confirm production', sub: 'Record a batch and deduct ingredients', go: () => this.startBatch(this.neediest()) },
      count: { icon: this.IC.doc, label: 'Start stock count', sub: 'Weekly count of what you have', go: () => { this.go('inventory'); setTimeout(this.startStocktake, 20); } },
      sale: { icon: this.IC.bazaar, label: 'Bazaar sale', sub: 'Fast selling at an event', go: () => this.go('bazaar', { hint: 'bazaar' }) },
      review: { icon: this.IC.clock, label: 'Review a payment', sub: reviewN + ' waiting', go: () => this.go('orders', { hint: 'payments' }) }
    };
    // one screen, only the actions that belong on it
    const qaOrder = {
      today: ['review', 'batch', 'purchase'],
      orders: ['review', 'order'],
      order: ['review'],
      bake: ['dough', 'batch'],
      inventory: ['adjust', 'count'],
      grocery: ['purchase', 'adjust'],
      sales: ['sale'],
      bazaar: ['sale', 'expense'],
      pnl: ['expense'],
      bazaar: ['sale', 'expense'],
      drops: ['order', 'review'],
      more: ['review', 'batch', 'expense']
    };
    const roleOrder = s.role === 'helper' ? ['sale'] : (qaOrder[s.screen] || qaOrder.today);
    const qkeys = roleOrder.filter(k => {
      if (k === 'expense' && !money) return false;
      if (k === 'purchase' && !this.canSee('grocery')) return false;
      if (k === 'review' && this.state.orders.filter(o => o.status === 'Payment review').length === 0) return false;
      // never offer an action that lands on a permission wall
      const dest = { review: 'orders', order: 'shop', batch: 'batch', dough: 'bake', count: 'inventory', adjust: 'inventory', purchase: 'grocery', expense: 'pnl', sale: 'bazaar' }[k];
      if (dest && !this.canSee(dest)) return false;
      return true;
    });

    // ---- resumption ----
    const resume = [];
    if (s.stocktake) resume.push({ icon: this.IC.doc, label: 'Weekly count', detail: (s.stocktake.i + 1) + ' of ' + s.stocktake.items.length + ' · ' + s.invTab.toLowerCase(), cta: 'Continue', go: () => this.go('inventory') });
    if (s.batch) resume.push({ icon: this.IC.bake, label: P[s.batch.pid].short + ' batch', detail: s.batch.actual + ' portions · step ' + s.batch.step + ' of 2', cta: 'Continue', go: () => this.go('batch') });
    if (s.doughPrep) resume.push({ icon: this.IC.dough, label: P[s.doughPrep.pid].short + ' dough', detail: s.doughPrep.balls + ' portions, not recorded yet', cta: 'Continue', go: () => { this.go('bake'); this.sheet('mixDough'); } });
    if (s.event && s.event.stage !== 'closed') resume.push({ icon: this.IC.bazaar, label: s.event.name, detail: s.sales.length + ' sales recorded · ' + (s.event.stage === 'stock' ? 'loading the table' : 'selling'), cta: 'Continue', go: () => this.go('bazaar') });
    if (this.custTotal() > 0 && !s.cust.orderNo) resume.push({ icon: this.IC.cookie, label: 'Customer order in progress', detail: plural(this.custTotal(), 'cookie', 'cookies') + ' picked', cta: 'Open', go: () => this.go('shop') });

    const greetHour = 9;
    const needCount = (reviewN > 0 ? 1 : 0) + (gplan.length > 0 && this.canSee('grocery') ? 1 : 0) + (lowStock.length > 0 ? 1 : 0) + (healthN > 0 && this.canSee('health') ? 1 : 0);
    const greetSub = s.role === 'helper'
      ? PRODUCTS.reduce((t, p) => t + (s.baked[p.id] || 0), 0) + ' cookies are baked and ready.'
      : needCount === 0
      ? 'Everything urgent is handled. ' + (bt.toBake > 0 ? bt.toBake + ' cookies still to bake for the weekend.' : 'Nothing left to bake.')
      : needCount + (needCount === 1 ? ' thing needs you' : ' things need you') + (bt.toBake > 0 ? ' before baking.' : ' today.');

    return Object.assign({
      // ---------- prototype harness ----------
      ic: this.IC, tone: this.TONE,
      // responsive recomposition (runtime, device-driven)
      cols2: isDesktop || isTablet ? 'repeat(2, minmax(0, 1fr))' : '1fr',
      cols3: isDesktop ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
      cols4: isDesktop ? 'repeat(4, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
      homeCols: isDesktop ? '1.25fr 1fr' : '1fr',
      segMax: isDesktop ? '520px' : isTablet ? '560px' : 'none',
      plCols: isDesktop ? '320px minmax(0, 1fr)' : '1fr',
      splitCols: isDesktop ? 'minmax(0, 1fr) 372px' : '1fr',
      pagePad: custMode ? '0px' : isDesktop ? '24px 28px 36px' : isTablet ? '22px 24px 34px' : '14px 14px 152px',
      pageMax: custMode ? '640px' : isDesktop ? '1100px' : '100%',
      wide: isDesktop, split: isDesktop,
      devices: [
        { key: 'mobile', label: 'Phone' }, { key: 'tablet', label: 'Tablet' }, { key: 'desktop', label: 'Desktop' }
      ].map(d => ({ label: d.label, active: s.device === d.key, go: () => this.setState({ device: d.key }) })),
      showPhoneWidths: !isDesktop && !isTablet,
      phoneWidths: [375, 390, 430].map(w => ({ label: String(w), active: phoneW === w, go: () => this.setState({ phoneW: w }) })),
      roles: ['owner', 'helper', 'support'].map(r => ({ label: ROLES[r].label, active: s.role === r, go: () => this.setRole(r) })),
      online: s.online, onlineLabel: s.online ? 'Online' : 'Offline', toggleOnline: this.toggleOnline,
      appSub: role.sub,
      showFlowStrip: this.props.showFlowStrip !== false,
      flowChips: [
        { id: null, label: 'Free roam' }, { id: 'f1', label: 'Customer order' }, { id: 'f2', label: 'Payment review' },
        { id: 'f3', label: 'Production' }, { id: 'f4', label: 'Grocery' }, { id: 'f5', label: 'Stocktake' },
        { id: 'f6', label: 'Bazaar + offline' }, { id: 'f7', label: 'Money' }, { id: 'f8', label: 'Form queue' }, { id: 'f9', label: 'Backup fix' }
      ].map(c => ({ label: c.label, active: s.flowId === c.id, go: () => c.id ? this.startFlow(c.id) : this.clearFlow() })),
      flow: f ? (function (self, st) {
        const done = st.flowStep >= f.steps.length;
        const cur = done ? null : f.steps[st.flowStep];
        const away = !!cur && cur.screen !== st.screen;
        return {
          tag: f.tag, title: f.title,
          progress: Math.min(st.flowStep + 1, f.steps.length) + ' / ' + f.steps.length,
          next: done ? 'Flow complete' : cur.label,
          away: away,
          awayLabel: away ? 'Go to ' + (SCREEN_NAMES[cur.screen] || cur.screen) : '',
          goToStep: away ? () => self.go(cur.screen) : null
        };
      })(this, s) : null,
      clearFlow: this.clearFlow,
      frameOuterStyle: 'width: ' + Math.round(W * scale) + 'px; height: ' + Math.round(H * scale) + 'px; flex-shrink: 0',
      frameStyle: 'width: ' + W + 'px; height: ' + H + 'px; transform: scale(' + scale + '); transform-origin: top left; display: flex; overflow: hidden; background: ' + (isDesktop ? '#F6F4F2' : '#FFFFFF') + '; border-radius: ' + (isDesktop ? '16px' : '30px') + '; border: 1px solid #E4DED9; box-shadow: 0 24px 60px -22px rgba(58,31,20,.30), 0 2px 6px rgba(58,31,20,.05)',

      // ---------- shell ----------
      isDesktop, isTablet, isPhone: !isDesktop && !isTablet,
      showRail: (isDesktop || isTablet) && !custMode && !focusMode,
      railW: isTablet ? '190px' : '216px',
      showTopBar: !custMode && !focusMode,
      showDock: !isDesktop && !isTablet && !custMode && !focusMode,
      showQuick: !custMode && !focusMode && !denied,
      focusMode,
      railNav: railKeys.map(mk),
      dockNav: dockKeys.map(mk),
      railPillStyle: 'position: absolute; left: 0; right: 0; top: 0; height: 42px; border-radius: 10px; background: #FDEDE5; box-shadow: inset 3px 0 0 #E75F23; transform: translate3d(0, ' + (railIdx < 0 ? 0 : railIdx * 44) + 'px, 0); opacity: ' + (railIdx < 0 ? '0' : '1') + '; transition: transform .3s cubic-bezier(.34,1.08,.4,1), opacity .18s ease; pointer-events: none',
      dockPillStyle: 'position: absolute; top: 6px; bottom: 6px; left: 6px; width: calc((100% - 12px) / ' + dockKeys.length + '); border-radius: 16px; background: #FDEDE5; transform: translate3d(' + (dockIdx < 0 ? 0 : dockIdx * 100) + '%, 0, 0); opacity: ' + (dockIdx < 0 ? '0' : '1') + '; transition: transform .3s cubic-bezier(.34,1.08,.4,1), opacity .18s ease; pointer-events: none',
      screenAnim: 'hcScr' + dirName + (tick % 2 ? 'A' : 'B') + ' .26s cubic-bezier(.22,.94,.3,1) both',
      pageTitle: t[0], pageSub: t[1],
      showBack: (s.history || []).length > 0 && s.screen !== 'today',
      goBack: this.goBack,
      offline: !s.online,
      alertCount: alertN, hasAlerts: alertN > 0,
      openNotifications: () => this.go('notifications'),
      roleWho: role.who, roleInitial: role.label.slice(0, 1), roleNote: role.note, isOwner: s.role === 'owner',
      screens: SCREENS.reduce((a, k) => { a[k] = !denied && s.screen === k; return a; }, {}),
      denied,
      deniedTitle: s.role === 'support' ? 'Not part of support access' : 'Only Cine can open this',
      deniedText: s.role === 'support'
        ? 'Support access covers system health, backups and error logs. Customer records and money are not included.'
        : 'This screen holds costs, expenses or settings. Ask Cine if you need something from it.',
      deniedHome: () => this.go(ROLES[s.role].home),

      quickOpen: !!s.quick, openQuick: this.openQuick, closeQuick: this.closeQuick,
      quickActions: qkeys.map((k, idx) => ({
        icon: qa[k].icon, label: qa[k].label, sub: qa[k].sub, suggested: idx === 0,
        go: () => this.quickRun(qa[k].go)
      })),

      toast: s.toast,
      toastWarn: !!(s.toast && s.toast.tone === 'warn'),
      toastOk: !!(s.toast && s.toast.tone !== 'warn'),
      toastStyle: 'position: absolute; left: 14px; right: 14px; bottom: ' + (isDesktop ? '18px' : focusMode ? '18px' : '96px') + '; z-index: 60',
      closeSheet: this.closeSheet, runUndo: this.runUndo,
      stopClick: e => e.stopPropagation(),

      // ---------- home ----------
      helperView: s.role === 'helper',
      ownerView: s.role !== 'helper',
      helperCookies: PRODUCTS.map(p => ({
        name: p.short, imgStyle: thumb(p.img, 34, 9, true), qty: String(s.baked[p.id] || 0)
      })),
      helperStock: s.inv.filter(i => i.cat === 'Ingredients' || i.cat === 'Packaging').map(i => ({
        name: i.name, qtyText: amt(i.qty, i.unit), low: i.qty < i.level
      })),
      salesLog: (function (self, st) {
        const live = (st.sales || []).map(x => ({
          what: Object.keys(x.items).map(k => x.items[k] + ' ' + P[k].short).join(', ') || 'Sale',
          when: (st.event ? st.event.name + ' · ' : '') + relWhen(x.at, st.now) + (x.clerk ? ' · ' + x.clerk : ''),
          amount: x.total === 0 ? 'Free' : PESO(x.total)
        }));
        const past = (st.ledger || []).filter(e => e.kind === 'revenue').sort((a, b) => b.at - a.at).map(e => ({
          what: e.label, when: relWhen(e.at, st.now), amount: PESO(e.amount)
        }));
        const rows = live.concat(past);
        return {
          rows: rows, empty: rows.length === 0,
          countNum: self.num(rows.length),
          unit: rows.length === 1 ? 'sale recorded' : 'sales recorded'
        };
      })(this, s),
      greeting: (function (h) { return h < 12 ? 'Good morning, ' : h < 18 ? 'Good afternoon, ' : 'Good evening, '; })(new Date(s.now).getHours()) + role.label + '.',
      greetSub,
      todayDate: longDateText(s.now),
      resume, hasResume: resume.length > 0,
      drop: {
        no: 'Drop ' + s.dropNo, open: this.shopOpen(s), closed: !this.shopOpen(s),
        stateLabel: ({ open: 'Open', soon: 'Closing soon', closed: 'Closed', soldout: 'Sold out' })[this.shopState(s)],
        confirmedNum: this.num(capConfirmed), capNum: cap,
        capText: capConfirmed + ' / ' + cap + ' confirmed',
        pendingText: capPending + ' awaiting payment',
        leftText: capLeft + ' still open',
        nearly: capLeft <= 30,
        barConfirmed: 'width: ' + pct(capConfirmed) + '; background: #E75F23',
        barPending: 'width: ' + pct(capPending) + '; background: #B0CEFE',
        closes: !this.shopOpen(s) ? 'No new orders' : 'Closes ' + dowName(this.cycle(s).close).slice(0, 3) + ' · ' + clockText(this.cycle(s).close),
        go: () => this.go('drops')
      },
      heroShow: (isDesktop || isTablet) && bt.toBake > 0,
      heroImg: (function (self, st) {
        let best = PRODUCTS[0], n = -1;
        PRODUCTS.forEach(p => { const t = self.toBake(p.id, st); if (t > n) { n = t; best = p; } });
        return { style: 'width: 100%; height: 100%; background: center/contain no-repeat url(' + best.img + ')', name: best.short, n: n };
      })(this, s),
      tiltRef: this.tiltRef, onTilt: this.onTilt, offTilt: this.offTilt,
      prep: {
        num: this.num(bt.toBake), n: bt.toBake,
        unit: bt.toBake === 1 ? 'cookie to bake' : 'cookies to bake',
        detail: bt.toBake === 0
          ? 'Everything ordered is baked and waiting to be packed.'
          : plural(confirmedOrders, 'confirmed order', 'confirmed orders') + ' · ' + (bt.toMix === 0 ? 'dough is ready in the chiller' : plural(bt.toMix, 'portion', 'portions') + ' still to mix'),
        thumbs: PRODUCTS.filter(p => this.toBake(p.id, s) > 0).slice(0, 4).map(p => ({ style: thumb(p.img, 30, 8, true), n: this.toBake(p.id, s), name: p.short })),
        hint: hint === 'bake',
        go: () => this.go('bake', { hint: 'bake' })
      },
      buy: {
        n: gplan.length, num: this.num(gplan.length),
        unit: gplan.length === 1 ? 'item short' : 'items short',
        names: gplan.length ? gplan.slice(0, 3).map(i => i.name).join(', ') + (gplan.length > 3 ? ' +' + (gplan.length - 3) + ' more' : '') : 'You have what you need for confirmed orders.',
        costText: gplan.length ? PESO(gcost) + ' estimate' : '',
        visible: this.canSee('grocery'),
        go: () => this.go('grocery', { hint: 'grocery' })
      },
      lowStock: {
        n: lowStock.length, num: this.num(lowStock.length),
        detail: lowStock.length ? lowStock.slice(0, 2).map(i => i.name + ' ' + amt(i.qty, i.unit)).join(' · ') : 'Everything is above your level.',
        weekend: gplan.filter(i => !i.isPack).length,
        go: () => this.go('inventory')
      },
      money: money ? (function (T, self) {
        return {
          profitText: PESO(T.profit), profitNum: self.num(T.profit, '₱'),
          revenueText: PESO(T.revenue), expenseText: PESO(T.totalExp),
          marginText: T.revenue ? Math.round(T.profit / T.revenue * 100) + '% margin' : 'No sales yet'
        };
      })(this.pnlTotals(s), this) : null,
      showMoney: money,
      goPnl: () => this.go('pnl', { hint: 'pnl' }),
      system: {
        ok: healthN === 0, bad: healthN > 0,
        label: healthN === 0 ? 'All good' : plural(healthN, 'problem', 'problems'),
        detail: s.backup === 'ok' ? (s.unsynced ? plural(s.unsynced, 'bazaar sale has', 'bazaar sales have') + ' not synced' : 'Backup completed, everything synced') : 'Last successful backup was 2 days ago',
        hint: hint === 'health',
        go: () => this.go('health', { hint: 'health' }),
        retry: this.retryBackup
      },
      statusStrip: [
        { label: 'Orders', value: String(s.orders.length), go: () => this.go('orders') },
        { label: 'To review', value: String(reviewN), warn: reviewN > 0, go: () => this.go('orders', { hint: 'payments' }) },
        { label: 'Pickups', value: '11', go: () => this.go('orders') },
        { label: 'Drop full', value: Math.round(capConfirmed / cap * 100) + '%', go: () => this.go('drops') }
      ],
      goPayments: () => this.go('orders', { hint: 'payments' }),
      reviewN, reviewHasWork: reviewN > 0,

      launcher: [
        { title: 'Orders', items: [
          { k: 'orders', icon: this.IC.orders, label: 'Orders & payments', sub: reviewN ? reviewN + ' to review' : 'All checked', go: () => this.go('orders') },
          { k: 'drops', icon: this.IC.cookie, label: 'Drops', sub: 'Drop ' + s.dropNo + ' · closes ' + dowName(this.cycle(s).close).slice(0, 3) + ' ' + clockText(this.cycle(s).close).replace(':00 ', ' '), go: () => this.go('drops') },
          { k: 'orders', icon: this.IC.users, label: 'Customers & waitlist', sub: plural(s.orders.length, 'customer', 'customers') + ' kept for ' + this.cfgOf().retention.toLowerCase(), go: () => this.sheet('customers') },
          { k: 'formqueue', icon: this.IC.sync, label: 'Form queue', sub: queueN ? queueN + ' waiting · temporary' : 'Clear · temporary', go: () => this.go('formqueue', { hint: 'queue' }) }
        ] },
        { title: 'Kitchen', items: [
          { k: 'bake', icon: this.IC.bake, label: 'Bake & dough', sub: bt.toBake + ' to bake', go: () => this.go('bake', { hint: 'bake' }) },
          { k: 'inventory', icon: this.IC.inventory, label: 'Inventory', sub: lowStock.length ? lowStock.length + ' low' : 'All healthy', go: () => this.go('inventory') },
          { k: 'grocery', icon: this.IC.grocery, label: 'Grocery', sub: gplan.length ? gplan.length + ' items · ' + PESO(gcost) : 'Nothing to buy', go: () => this.go('grocery', { hint: 'grocery' }) },
          { k: 'recipes', icon: this.IC.recipe, label: 'Recipes', sub: PRODUCTS.length + ' flavours · v' + Math.max.apply(null, PRODUCTS.map(p => s.recipeVer[p.id] || 1)), go: () => this.go('recipes') }
        ] },
        { title: 'Business', items: [
          { k: 'pnl', icon: this.IC.money, label: 'Profit & loss', sub: 'August', go: () => this.go('pnl', { hint: 'pnl' }) },
          { k: 'reconcile', icon: this.IC.check, label: 'Payments', sub: 'Match refs to your wallet', go: () => this.go('reconcile') },
          { k: 'bazaar', icon: this.IC.bazaar, label: 'Bazaar Mode', sub: 'Works offline', go: () => this.go('bazaar', { hint: 'bazaar' }) },
          { k: 'products', icon: this.IC.tag, label: 'Products', sub: '4 permanent, 2 rotating', go: () => this.go('products') },
          { k: 'suppliers', icon: this.IC.shop, label: 'Suppliers', sub: '8 saved', go: () => this.go('suppliers') }
        ] },
        { title: 'System', items: [
          { k: 'notifications', icon: this.IC.bell, label: 'Notifications', sub: alertN ? alertN + ' need attention' : 'Nothing urgent', go: () => this.go('notifications') },
          { k: 'settings', icon: this.IC.gear, label: 'Settings', sub: 'Everything you control', go: () => this.go('settings') },
          { k: 'health', icon: this.IC.alert, label: 'System health', sub: healthN ? 'Needs attention' : 'Healthy', go: () => this.go('health') },
          { k: 'health', icon: this.IC.export, label: 'Backups & export', sub: s.backup === 'ok' ? 'Backed up' : 'Last backup failed', go: () => this.go('health') }
        ] },
        { title: 'Customer view', quiet: true, items: [
          { k: 'shop', icon: this.IC.eye, label: 'Preview shop', sub: '', go: () => this.go('shop', { hint: 'shop' }) },
          { k: 'shop', icon: this.IC.eye, label: 'Preview checkout', sub: '', go: this.previewCheckout },
          { k: 'shop', icon: this.IC.eye, label: 'Preview order status', sub: '', go: this.previewStatus }
        ] }
      ].map(g => ({ title: g.title, quiet: !!g.quiet, items: g.items.filter(i => this.canSee(i.k)) })).filter(g => g.items.length > 0)
    },
      this.ordersVals(s, isDesktop, hint, money),
      this.bakeVals(s, hint),
      this.invVals(s, isDesktop, hint),
      this.groceryVals(s, hint),
      this.bazaarVals(s, hint),
      this.pnlVals(s, hint),
      this.reconcileVals(s),
      this.queueVals(s, hint),
      this.miscVals(s, hint, isDesktop),
      this.custVals(s, hint),
      this.recipeVals(s, isDesktop, isTablet),
      this.adminVals(s));
  }

  // =========== orders ===========
  ordersVals(s, isDesktop, hint, money) {
    const st = o => {
      const tn = this.TONE[this.STATUS_TONE[o.status] || 'mute'];
      return { label: this.STATUS_LABEL[o.status] || o.status, bg: tn.bg, fg: tn.fg, br: tn.br, dot: tn.dot };
    };
    const nextAction = o => o.status === 'Payment review' ? 'Review payment'
      : (o.status === 'Confirmed' || o.status === 'Preparing') ? 'Mark ready'
      : o.status === 'Ready' ? 'Mark collected'
      : o.status === 'Cancelled' ? 'Reopen' : '';
    const oq = this.getQ('orders').trim().toLowerCase();
    const list = s.orders.slice().reverse()
      .filter(o => s.orderFilter === 'review' ? o.status === 'Payment review'
        : s.orderFilter === 'ready' ? o.status === 'Ready'
        : s.orderFilter === 'paid' ? (o.status === 'Confirmed' || o.status === 'Preparing')
        : s.orderFilter === 'closed' ? ['Completed', 'Cancelled', 'No-show'].indexOf(o.status) >= 0
        : true)
      .filter(o => !oq || (o.name + ' ' + o.id + ' ' + (o.ig || '') + ' ' + (o.ref || '')).toLowerCase().indexOf(oq) >= 0)
      .map(o => {
        const b = st(o);
        return {
          id: o.id, name: o.name, first: o.name.split(' ')[0], summary: itemSummary(o),
          totalText: PESO(this.boxTotal(o.items, o.priced)),
          count: orderCount(o) + ' cookies', pay: o.pay,
          pickup: this.windowText(s, o.day),
          label: b.label, bg: b.bg, fg: b.fg, br: b.br, dot: b.dot,
          selected: s.orderId === o.id,
          warn: (money ? o.warn : (o.warnPlain || o.warn)) || (o.needsContact ? 'A flavour ran out — agree a swap with ' + o.name.split(' ')[0] : ''),
          action: nextAction(o), review: o.status === 'Payment review',
          hint: hint === 'openOrder' && o.status === 'Payment review' && o.id === 'HC-1055',
          go: () => this.go('order', { orderId: o.id, hint: 'openOrder' }),
          select: () => isDesktop ? this.setState({ orderId: o.id }) : this.go('order', { orderId: o.id, hint: 'openOrder' }),
          act: () => o.status === 'Payment review' ? this.go('order', { orderId: o.id, hint: 'openOrder' })
            : o.status === 'Ready' ? this.collectOrder(o.id)
            : o.status === 'Cancelled' ? this.reopenOrder(o.id)
            : this.packOrder(o.id)
        };
      });
    const filters = [
      { k: 'all', label: 'All', n: s.orders.length },
      { k: 'review', label: 'To review', n: s.orders.filter(o => o.status === 'Payment review').length },
      { k: 'paid', label: 'Paid', n: s.orders.filter(o => o.status === 'Confirmed' || o.status === 'Preparing').length },
      { k: 'ready', label: 'Ready', n: s.orders.filter(o => o.status === 'Ready').length },
      { k: 'closed', label: 'Closed', n: s.orders.filter(o => ['Completed', 'Cancelled', 'No-show'].indexOf(o.status) >= 0).length }
    ].map(x => ({ label: x.label, n: x.n, active: (s.orderFilter || 'all') === x.k, go: () => this.setState({ orderFilter: x.k }) }));

    const o = s.orders.filter(x => x.id === s.orderId)[0] || (isDesktop ? s.orders.filter(x => x.status === 'Payment review')[0] : null);
    const b = o ? st(o) : null;
    const rev = s.orders.filter(x => x.status === 'Payment review');
    return {
      orderList: list, orderFilters: filters,
      flavourTally: (function (self, st) {
        const t = {};
        st.orders.filter(o => self.inDrop(st, o) && self.RECOGNISED.indexOf(o.status) >= 0)
          .forEach(o => Object.keys(o.items).forEach(k => { t[k] = (t[k] || 0) + o.items[k]; }));
        return PRODUCTS.filter(p => t[p.id] > 0).sort((a, b) => t[b.id] - t[a.id]).map(p => ({
          name: P[p.id].short, qtyText: t[p.id] + '\u00d7', imgStyle: thumb(P[p.id].img, 30, 8, true)
        }));
      })(this, s),
      flavourTallyTotal: plural(s.orders.filter(o => this.inDrop(s, o) && this.RECOGNISED.indexOf(o.status) >= 0)
        .reduce((n, o) => n + orderCount(o), 0), 'cookie', 'cookies'),
      orderQ: this.getQ('orders'), hasOrderQ: oq.length > 0,
      setOrderQ: e => this.setQ('orders', e.target.value),
      clearOrderQ: () => this.setQ('orders', ''),
      orderEmpty: list.length === 0,
      reviewCount: rev.length,
      reviewCountText: plural(rev.length, 'payment needs', 'payments need') + ' review',
      reviewDetail: rev.length
        ? 'Check the reference and the amount on each one.'
        : 'You are caught up. Every payment has been checked.',
      reviewHint: hint === 'payments',
      od: o ? {
        go: () => this.go('order', { orderId: o.id }),
        id: o.id, name: o.name, first: o.name.split(' ')[0], ig: o.ig || '', hasIg: !!o.ig,
        phone: o.mobile || '0917 ••• ' + o.id.slice(-3),
        email: o.email || o.name.split(' ')[0].toLowerCase() + '@mailbox.ph',
        // only the parts that exist, separated between rather than after
        metaBits: [o.id, o.ig || '', relWhen(o.placedAt, s.now)].filter(Boolean)
          .map((t, i) => ({ text: i ? '· ' + t : t })),
        contactBits: [o.ig || '', o.mobile || '0917 ••• ' + o.id.slice(-3), o.email || ''].filter(Boolean)
          .map((t, i) => ({ text: i ? '· ' + t : t })),
        label: b.label, bg: b.bg, fg: b.fg, br: b.br,
        totalText: PESO(this.boxTotal(o.items, o.priced)),
        paidText: PESO(o.paidAmount != null ? o.paidAmount : (o.paid != null ? o.paid : this.boxTotal(o.items, o.priced))),
        mismatch: (function (self, ord) {
          const due = self.boxTotal(ord.items, ord.priced);
          const sent = ord.paidAmount != null ? ord.paidAmount : (ord.paid != null ? ord.paid : due);
          return sent !== due;
        })(this, o),
        paidOk: (function (self, ord) {
          const due = self.boxTotal(ord.items, ord.priced);
          const sent = ord.paidAmount != null ? ord.paidAmount : (ord.paid != null ? ord.paid : due);
          return sent === due;
        })(this, o),
        pay: o.pay, ref: o.ref, placed: relWhen(o.placedAt, s.now), warn: o.warn || '',
        pickup: this.windowText(s, o.day, true),
        needsReview: o.status === 'Payment review', money,
        invoice: o.invoice || '', hasInvoice: !!o.invoice,
        contactHidden: this.contactHidden(s, o),
        contactShown: !this.contactHidden(s, o),
        contactNote: 'Contact details were removed ' + this.cfgOf().retention.toLowerCase() + ' after this order completed. The sale itself is still on record.',
        email: o.email || '', mobile: o.mobile || '',
        refBad: this.refLooksWrong(o.pay, o.ref),
        dup: (function (self, st, ord) {
          const d = self.dupRefOf(st, ord);
          return d ? { id: d.id, name: d.name, go: () => self.go('order', { orderId: d.id }) } : null;
        })(this, s, o),
        hasBalance: !!o.balance,
        balanceText: o.balance ? PESO(o.balance) : '',
        settleBalance: () => this.recordBalance(o.id),
        isCancelled: o.status === 'Cancelled',
        wasRejected: !!o.rejected, wasRefunded: !!o.refunded,
        cancelRequested: !!o.cancelRequested,
        reopen: () => this.reopenOrder(o.id),
        canNoShow: o.status === 'Ready',
        noShow: () => this.sheet('noshow', { id: o.id, name: o.name }),
        canRefund: ['Confirmed', 'Preparing', 'Ready'].indexOf(o.status) >= 0 && money,
        askRefund: () => this.sheet('refund', { id: o.id, name: o.name, amount: this.boxTotal(o.items, o.priced) }),
        canPack: o.status === 'Confirmed' || o.status === 'Preparing',
        canCollect: o.status === 'Ready',
        packHint: (function (items, inv) {
          const boxes = Math.ceil(orderCount({ items: items }) / 6);
          const it = inv.filter(i => i.name === 'Box of 6')[0];
          return 'Uses ' + plural(boxes, 'box, sticker and card', 'boxes, stickers and cards') + '. ' + (it ? it.qty : 0) + ' boxes left.';
        })(o.items, s.inv),
        pack: () => this.packOrder(o.id),
        collect: () => this.collectOrder(o.id),
        lines: Object.keys(o.items).map(k => {
          const out = (o.unavailable || []).indexOf(k) >= 0;
          return {
            name: P[k].short, qty: o.items[k] + '×', imgStyle: thumb(P[k].img, 36, 9, true),
            price: PESO(this.priceOf(k, o.priced)), line: PESO(this.priceOf(k, o.priced) * o.items[k]),
            out, inStock: !out, flagLabel: out ? 'Available' : 'Ran out',
            flag: () => this.flagLine(o.id, k),
            swap: () => this.sheet('swap', { id: o.id, from: k })
          };
        }),
        hasSwaps: (o.swaps || []).length > 0,
        swaps: (o.swaps || []).map(w => ({ text: w.qty + ' × ' + P[w.from].short + ' → ' + P[w.to].short + ' · ' + relWhen(w.at, s.now) })),
        askSwap: () => this.sheet('swap', { id: o.id, from: (o.unavailable || [])[0] || Object.keys(o.items)[0] }),
        needsContact: !!o.needsContact,
        contactText: 'Message ' + o.name.split(' ')[0] + ' and agree a swap between you. Nothing is chosen for you.',
        clearContact: () => this.clearContact(o.id),
        link: 'happycookie.ph/o/' + o.id.toLowerCase(),
        linkSent: o.status === 'Payment review' ? 'Emailed when they submitted' : 'Emailed again when you confirmed',
        copyLink: () => this.toast('Link copied.'),
        timeline: [
          { when: relWhen(o.placedAt, s.now), what: 'Order submitted with proof', tone: 'done' },
          { when: o.status === 'Payment review' ? 'Waiting' : relWhen(o.confirmedAt || o.placedAt, s.now), what: o.status === 'Payment review' ? 'Payment waiting for approval' : 'Payment confirmed', tone: o.status === 'Payment review' ? 'now' : 'done' },
          { when: o.status === 'Preparing' || o.status === 'Ready' ? relWhen(o.bakedAt || s.now, s.now) : '—', what: 'Baked', tone: o.status === 'Preparing' || o.status === 'Ready' ? 'done' : 'todo' },
          { when: o.status === 'Ready' ? relWhen(o.readyAt || s.now, s.now) : '—', what: 'Ready for pickup', tone: o.status === 'Ready' ? 'done' : 'todo' }
        ].map(x => ({ when: x.when, what: x.what, done: x.tone === 'done', now: x.tone === 'now', todo: x.tone === 'todo' })),
        confirm: () => this.confirmPayment(o.id),
        reject: () => this.rejectPayment(o.id),
        askClearer: () => { this.closeSheet(); this.toast('Asked ' + o.name.split(' ')[0] + ' for a clearer screenshot. Order stays in review.', 'warn'); },
        confirmHint: hint === 'confirm', proofHint: hint === 'proofView',
        openProof: () => { this.sheet('proof', { id: o.id }); this.advanceIfHint('proofView'); }
      } : null
    };
  }

  // =========== bake + production focus ===========
  bakeVals(s, hint) {
    const rows = PRODUCTS.map(p => {
      const demand = this.demand(p.id);
      const baked = s.baked[p.id] || 0;
      const dough = s.dough[p.id] || 0;
      const toBake = Math.max(0, demand - baked);
      const toMix = Math.max(0, toBake - dough);
      const mv = s.moved[p.id] || 0;
      const sat = Math.max(0, this.demandDay(p.id, 'sat') - mv);
      const sun = this.demandDay(p.id, 'sun') + mv;
      return {
        id: p.id, name: p.short, imgStyle: thumb(p.img, 42, 10, true), kind: p.kind,
        demand, baked, dough, toBake, toMix, sat, sun,
        shown: s.bakeDay === 'sat' ? sat : s.bakeDay === 'sun' ? sun : demand,
        done: toBake === 0,
        hasWork: toBake > 0,
        // two facts, once each: how much dough is in the chiller and how much is ordered
        doughText: dough > 0 ? dough + ' chilled dough' : 'no dough yet',
        demandText: plural(demand, 'confirmed order', 'confirmed orders'),
        // no dough means the only step available is mixing; baking unlocks once it is mixed
        hasDough: dough > 0,
        noDough: dough === 0 && toBake > 0,
        openDough: () => { this.sheet('dough', { pid: p.id }); this.advanceIfHint('plan'); },
        canMixMore: dough > 0,
        // the headline is always what the flavour needs, so the rows add up to the total above them;
        // the button carries what you can do right now, which the dough line explains
        actNum: toBake,
        actWord: 'to bake',
        actLabel: dough > 0 ? 'Bake ' + Math.min(toBake, dough) : 'Mix ' + toMix,
        act: () => dough > 0 ? this.startBatch(p.id) : this.startDough(p.id),
        hint: hint === 'batch' && p.id === 'wcb',
        mixAhead: () => this.startDough(p.id),
        left: () => this.moveDay(p.id, -1),
        right: () => this.moveDay(p.id, 1)
      };
    });
    const b = s.batch;
    const d = this.deductions();
    return {
      bakeRows: rows,
      restHoursText: this.cfgOf().restHours + 'h rest',
      bakeRejects: b ? (b.rejects || 0) : 0,
      rejectsMinus: () => this.setRejects(-1),
      rejectsPlus: () => this.setRejects(1),
      goodCount: b ? Math.max(0, b.actual - (b.rejects || 0)) : 0,
      hasRejects: b ? (b.rejects || 0) > 0 : false,
      bakeTotals: {
        demand: rows.reduce((t, r) => t + r.demand, 0),
        baked: rows.reduce((t, r) => t + r.baked, 0),
        dough: rows.reduce((t, r) => t + r.dough, 0),
        toBake: rows.reduce((t, r) => t + r.toBake, 0),
        toMix: rows.reduce((t, r) => t + r.toMix, 0),
        toBakeNum: this.num(rows.reduce((t, r) => t + r.toBake, 0)),
        summary: (function (mix, bake) {
          if (bake === 0) return 'Everything confirmed for this drop is baked.';
          return mix > 0
            ? '' + plural(mix, 'portion', 'portions') + ' still to mix.'
            : 'Dough is ready for all of it.';
        })(rows.reduce((t, r) => t + r.toMix, 0), rows.reduce((t, r) => t + r.toBake, 0))
      },
      bakeAllDone: rows.every(r => r.toBake === 0),
      bakeHintPlan: hint === 'plan',
      ackPlan: () => this.advanceIfHint('plan'),
      startFirst: () => { const r = rows.filter(x => x.hasWork)[0]; if (r) this.startBatch(r.id); else this.toast('Nothing left to bake for this drop.'); },
      bakeFlavours: (function (self, st) {
        const open = [st.batch && st.batch.pid, st.doughPrep && st.doughPrep.pid].filter(Boolean);
        // anything ordered, anything with dough sitting in the chiller, and whatever you already have open
        let list = PRODUCTS.filter(p => self.toBake(p.id, st) > 0 || (st.dough[p.id] || 0) > 0 || open.indexOf(p.id) >= 0);
        if (!list.length) list = PRODUCTS;
        return list.map(p => {
          const n = self.toBake(p.id, st), d = st.dough[p.id] || 0;
          return {
            id: p.id,
            label: P[p.id].short + ' · ' + (n > 0
              ? n + ' to bake'
              : d > 0 ? d + ' chilled dough' : 'all baked')
          };
        });
      })(this, s),
      batch: b ? {
        pid: b.pid, name: P[b.pid].short, imgStyle: thumb(P[b.pid].img, 42, 10, true),
        targetWord: this.toBake(b.pid, s) > b.target ? 'this batch' : 'to bake',
        setFlavour: e => this.setBatchFlavour(e.target.value),
        doughText: (s.dough[b.pid] || 0) > 0 ? (s.dough[b.pid] || 0) + ' chilled dough' : 'no dough yet',
        demandText: plural(this.demand(b.pid), 'confirmed order', 'confirmed orders'),
        showUsed: !!b.showUsed,
        toggleUsed: this.toggleBatchUsed,
        usedLabel: b.showUsed ? 'Hide what it used' : 'Next: what it used',
        usedCaret: 'display: grid; place-items: center; flex-shrink: 0; transition: transform .22s cubic-bezier(.2,.8,.2,1); transform: rotate(' + (b.showUsed ? 180 : 0) + 'deg)',
        target: b.target, actual: b.actual, actualNum: this.num(b.actual), note: b.note,
        step1: b.step === 1, step2: b.step === 2,
        remaining: Math.max(0, this.toBake(b.pid, s) - b.actual),
        varianceText: b.actual === b.target ? 'Matches the plan' : (b.actual > b.target ? '+' : '') + (b.actual - b.target) + ' vs plan',
        varianceOk: b.actual === b.target,
        doughUsed: d.doughUsed, mixed: d.mixed,
        doughLine: (s.dough[b.pid] || 0) === 0
          ? 'Nothing chilled for this flavour, so all ' + d.mixed + ' are mixed fresh.'
          : d.doughUsed > 0
          ? d.doughUsed + ' of these come out of the ' + (s.dough[b.pid] || 0) + ' chilled dough, so only ' + d.mixed + ' worth of ingredients come off stock.'
          : (s.dough[b.pid] || 0) + ' chilled dough waiting, and nothing is ordered against it yet — no ingredients come off.',
        rows: d.rows.map(r => ({
          name: r.name, amountText: r.amount + ' ' + r.unit, onHandText: r.onHand + ' ' + r.unit + ' on hand',
          deltaText: r.delta === 0 ? '' : (r.delta > 0 ? '+' : '') + r.delta,
          short: r.short, ok: !r.short,
          minus: () => this.adjIng(r.name, -1), plus: () => this.adjIng(r.name, 1)
        })),
        anyShort: d.rows.some(r => r.short),
        plus: () => this.setYield(1), minus: () => this.setYield(-1),
        setNote: e => this.batchNote(e.target.value),
        toStep2: () => this.batchStep(2), toStep1: () => this.batchStep(1),
        confirm: this.confirmBatch,
        exit: () => { this.go('bake'); this.toast('Batch left open. Continue it from Home.'); },
        discard: () => { this.setState({ batch: null }); this.go('bake'); this.toast('Batch discarded. No ingredients were deducted.', 'warn'); },
        hintYield: hint === 'yield', hintDeduct: hint === 'deduct' || hint === 'done'
      } : null
    };
  }

  // =========== inventory ===========
  invVals(s, isDesktop, hint) {
    let rows = [];
    if (s.invTab === 'Dough') {
      rows = PRODUCTS.filter(p => (s.dough[p.id] || 0) > 0).map(p => {
        const aging = this.doughAging(s, p.id);
        const at = (s.doughAt || {})[p.id];
        return {
          name: P[p.id].short + ' dough', qtyText: (s.dough[p.id] || 0) + ' dough',
          sub: '80 g each · ' + (at ? 'mixed ' + relWhen(at, s.now) : 'mixed date unknown') + ' · ' + (this.doughRested(s, p.id) ? 'rested' : this.restLeftText(s, p.id)),
          state: aging ? 'Check this batch' : this.doughRested(s, p.id) ? 'Ready' : 'Resting', warn: aging, low: false,
          go: () => { this.go('bake'); this.toast('Dough is recorded and used from the bake plan.'); }
        };
      });
    } else if (s.invTab === 'Baked stock') {
      rows = PRODUCTS.filter(p => (s.baked[p.id] || 0) > 0).map(p => ({
        name: P[p.id].short, qtyText: (s.baked[p.id] || 0) + ' cookies', sub: 'Baked and ready to pack',
        state: 'Good', warn: false, low: false,
        go: () => this.sheet('baked', { pid: p.id })
      }));
    } else {
      rows = s.inv.filter(i => i.cat === s.invTab).map(i => {
        const low = i.qty < i.level, out = i.qty === 0;
        return {
          name: i.name, qtyText: amt(i.qty, i.unit),
          sub: 'Reorder at ' + amt(i.level, i.unit) + ' · ' + i.supplier + ' · counted ' + relWhen(i.updatedAt, s.now),
          useBy: i.useBy ? (i.useBy < s.now ? 'Expired ' + dateText(i.useBy) : 'Use by ' + dateText(i.useBy)) : '',
          expiring: !!i.useBy && i.useBy - s.now < 7 * DAY,
          spoil: () => this.sheet('spoil', { name: i.name }),
          state: out ? 'Out' : low ? 'Low' : 'Healthy', warn: low && !out, low: out,
          pct: Math.max(4, Math.min(100, Math.round(i.qty / Math.max(1, i.level) * 100))),
          go: () => this.sheet('invEdit', { name: i.name, qty: i.qty, unit: i.unit, level: i.level, cat: i.cat, supplier: i.supplier })
        };
      });
    }
    const iq = this.getQ('inv').trim().toLowerCase();
    if (iq) rows = rows.filter(r => r.name.toLowerCase().indexOf(iq) >= 0);
    const st = s.stocktake;
    const cur = st ? s.inv.filter(i => i.name === st.items[st.i])[0] : null;
    const entered = st && cur ? st.counts[cur.name] : '';
    const variance = cur && entered !== '' && entered !== undefined ? Number(entered) - cur.qty : null;
    return {
      invTabs: ['Ingredients', 'Packaging', 'Dough', 'Baked stock'].map(t => ({ label: t, active: s.invTab === t, go: () => this.setInvTab(t) })),
      invTabPill: 'position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 4); border-radius: 9px; background: #FFFFFF; box-shadow: 0 1px 3px rgba(58,31,20,.14); transform: translate3d(' + (['Ingredients', 'Packaging', 'Dough', 'Baked stock'].indexOf(s.invTab) * 100) + '%, 0, 0); transition: transform .34s cubic-bezier(.32,1.24,.42,1); pointer-events: none',
      invRows: rows,
      invQ: this.getQ('inv'), hasInvQ: iq.length > 0,
      setInvQ: e => this.setQ('inv', e.target.value),
      clearInvQ: () => this.setQ('inv', ''),
      invEmpty: rows.length === 0,
      invEmptyText: s.invTab === 'Dough' ? 'No dough in the chiller. Mix some from the bake plan.' : 'Nothing baked and waiting. Confirm a batch to add stock here.',
      invEditable: s.invTab === 'Ingredients' || s.invTab === 'Packaging',
      invCountLabel: plural(rows.length, 'item', 'items'),
      invLowCount: rows.filter(r => r.warn || r.low).length,
      openAddInv: () => this.sheet('addInv', { cat: s.invTab }),
      startStocktake: this.startStocktake,
      stocktakeHint: hint === 'stocktake',
      stock: st && cur ? {
        name: cur.name, pos: (st.i + 1) + ' of ' + st.items.length,
        posNum: st.i + 1, total: st.items.length,
        expected: amt(cur.qty, cur.unit), unit: cur.unit,
        value: entered === undefined ? '' : entered,
        onInput: e => this.countInput(cur.name, e.target.value),
        bump: d => this.countInput(cur.name, String(Math.max(0, (Number(entered) || cur.qty) + d))),
        down: () => this.countInput(cur.name, String(Math.max(0, (entered === '' || entered === undefined ? cur.qty : Number(entered)) - (cur.unit === 'pcs' ? 1 : 10)))),
        up: () => this.countInput(cur.name, String((entered === '' || entered === undefined ? cur.qty : Number(entered)) + (cur.unit === 'pcs' ? 1 : 10))),
        varianceText: variance === null ? 'Enter what you counted' : variance === 0 ? 'Matches your records' : (variance > 0 ? '+' : '') + variance + ' ' + cur.unit,
        varianceOk: variance === 0, varianceNone: variance === null, varianceWarn: variance !== null && variance !== 0,
        reason: (st.reasons || {})[cur.name] || '',
        setReason: e => this.countReason(cur.name, e.target.value),
        prev: () => this.stockNext(-1), next: () => this.stockNext(1),
        done: this.reconcile,
        pause: () => { this.go('today'); this.toast('Count paused at ' + (st.i + 1) + ' of ' + st.items.length + '. Continue it from Home.'); },
        cancel: () => this.setState({ stocktake: null }),
        doneHint: hint === 'reconcile',
        progress: 'width: ' + Math.round((st.i + 1) / st.items.length * 100) + '%'
      } : null
    };
  }

  // =========== grocery ===========
  groceryPlan(s) {
    const req = {}, reasons = {};
    PRODUCTS.forEach(p => {
      const toBake = Math.max(0, this.demand(p.id) - (s.baked[p.id] || 0));
      const balls = Math.max(0, toBake - (s.dough[p.id] || 0));
      if (!balls) return;
      const r = s.recipes[p.id];
      const scale = balls / r.yield;
      r.ing.filter(i => i[0]).forEach(i => {
        req[i[0]] = (req[i[0]] || 0) + (Number(i[1]) || 0) * scale;
        (reasons[i[0]] = reasons[i[0]] || []).push({ n: balls, name: p.short });
      });
    });
    const unpacked = s.orders.filter(o => ['Confirmed', 'Preparing'].indexOf(o.status) >= 0);
    const boxes = unpacked.reduce((t, o) => t + Math.ceil(orderCount(o) / 6), 0);
    const looseC = unpacked.reduce((t, o) => t + orderCount(o) % 6, 0);
    const packReq = { 'Box of 6': boxes, 'Single cookie pouch': looseC, 'Brand sticker': boxes + looseC, 'Thank-you card': boxes };

    return s.inv.map(it => {
      const isPack = it.cat === 'Packaging';
      const need = isPack ? (packReq[it.name] || 0) : (req[it.name] || 0);
      // buy what this drop is short of; with nothing ordered, buy back up to the reorder level
      const atLevel = it.qty <= it.level;
      const target = need > 0 ? need : (atLevel ? it.level : 0);
      const gotSoFar = (s.partial || {})[it.name] || 0;
      const planned = (s.plannedBuy || {})[it.name] || 0;
      const outstanding = gotSoFar > 0 ? Math.max(0, Math.round((planned - gotSoFar) * 10) / 10) : 0;
      const short = gotSoFar > 0 ? outstanding : Math.max(0, Math.round((target - it.qty) * 10) / 10);
      if (short <= 0) return null;
      const size = PACK_SIZE[it.name] || 1;
      const best = BEST_BUY[it.name];
      const packs = Math.max(1, Math.ceil(short / size));
      const chosen = s.supplierPick[it.name] || (best ? best.supplier : '—');
      const opt = OPTIONS_FOR(it.name).filter(o => o.name === chosen)[0] || (best ? { price: best.price, pack: best.pack } : { price: 0, pack: '—' });
      const rs = (reasons[it.name] || []).slice().sort((a, b) => b.n - a.n);
      const totalBalls = rs.reduce((t, x) => t + x.n, 0);
      const breakdown = rs.map(x => x.n + ' ' + x.name).join(', ');
      const packs2 = packs === 1 ? 'one ' + packWord(opt.pack) : packs + ' ' + packWord(opt.pack, true);
      const reorderOnly = need === 0 && atLevel;
      const why = reorderOnly
        ? 'Nothing this drop needs it, but you are down to ' + amt(it.qty, it.unit) + ' against a reorder level of ' + amt(it.level, it.unit) + '. Buying ' + amt(short, it.unit) + ' puts you back on level. It sells in ' + packPhrase(opt.pack) + ', so ' + packs2 + ' covers it.'
        : isPack
        ? plural(unpacked.length, 'order still needs packing', 'orders still need packing') + ', so you need ' + amt(need, it.unit) + '. You have ' + amt(it.qty, it.unit) + ', leaving you ' + amt(short, it.unit) + ' short. It only comes in ' + packPhrase(opt.pack) + ', so ' + packs2 + ' covers it.'
        : 'Mixing ' + plural(totalBalls, 'dough portion', 'dough portions') + (breakdown ? ' (' + breakdown + ')' : '') + ' needs ' + amt(need, it.unit) + '. You have ' + amt(it.qty, it.unit) + ', leaving you ' + amt(short, it.unit) + ' short. It sells in ' + packPhrase(opt.pack) + '.';
      return {
        key: it.name, name: it.name, unit: it.unit, isPack, reorderOnly,
        needText: amt(need, it.unit), haveText: amt(it.qty, it.unit), shortText: amt(short, it.unit),
        levelText: amt(it.level, it.unit),
        cells: [
          { label: 'Need', value: amt(need, it.unit), red: false },
          { label: 'On hand', value: amt(it.qty, it.unit), red: false }
        ].concat(reorderOnly
          ? [{ label: 'Reorder at', value: amt(it.level, it.unit), red: false }, { label: 'Buy', value: amt(short, it.unit), red: true }]
          : [{ label: 'Short', value: amt(short, it.unit), red: true }]),
        packText: opt.pack, packs, add: packs * size,
        cost: packs * opt.price, supplier: chosen, why
      };
    }).filter(Boolean).sort((a, b) => (a.isPack === b.isPack ? b.cost - a.cost : a.isPack ? 1 : -1));
  }

  groceryVals(s, hint) {
    const plan = this.groceryPlan(s);
    const first = plan.length ? plan[0].key : '';
    const rows = plan.map(i => ({
      name: i.name, isPack: i.isPack,
      buyText: i.packs + ' × ' + i.packText, costText: PESO(i.cost), supplier: i.supplier,
      reason: (s.partial || {})[i.key] ? 'Part of this delivery is still outstanding' : i.reorderOnly ? 'At or below your reorder level' : i.isPack ? 'Needed for orders still to pack' : 'Needed for confirmed orders this drop',
      cells: i.cells.map(c => ({ label: c.label, value: c.value, red: !!c.red, plain: !c.red })),
      received: !!s.received[i.key], bought: !!s.bought[i.key],
      part: (s.partial || {})[i.key] || 0,
      partial: !!(s.partial || {})[i.key],
      partText: ((s.partial || {})[i.key] || 0) + ' of ' + (((s.plannedBuy || {})[i.key]) || i.add) + ' ' + i.unit + ' in',
      sub: (s.subs || {})[i.key] || '',
      subbed: !!(s.subs || {})[i.key],
      statusText: s.received[i.key] ? 'In stock' : (s.partial || {})[i.key] ? 'Part of it arrived' : 'To buy',
      actionLabel: s.received[i.key] ? 'Bought again' : (s.partial || {})[i.key] ? 'Add the rest' : 'I bought this',
      whyHint: hint === 'why' && i.key === first,
      why: () => { this.sheet('why', { name: i.name, why: i.why }); this.advanceIfHint('why'); },
      supplierSheet: () => this.sheet('supplier', { k: i.key, name: i.name }),
      receive: () => this.sheet('receive', { k: i.key, name: i.name, item: i })
    }));
    const open = plan.filter(i => !s.received[i.key]);
    const sheetItem = s.sheet && s.sheet.kind === 'supplier' ? s.sheet.k : '';
    return {
      groceryRows: rows,
      groceryTotal: PESO(open.reduce((t, i) => t + i.cost, 0)),
      groceryBudgetText: PESO(this.cfgOf().groceryBudget),
      groceryOverBudget: open.reduce((t, i) => t + i.cost, 0) > this.cfgOf().groceryBudget,
      groceryUnderBudget: open.reduce((t, i) => t + i.cost, 0) <= this.cfgOf().groceryBudget,
      groceryLeftText: (function (spend, budget) {
        return spend > budget ? PESO(spend - budget) + ' over your ' + PESO(budget) + ' budget' : PESO(budget - spend) + ' left of your ' + PESO(budget) + ' budget';
      })(open.reduce((t, i) => t + i.cost, 0), this.cfgOf().groceryBudget),
      receiptDone: s.receiptShot === 'done',
      receiptUploading: s.receiptShot === 'uploading',
      receiptNone: !s.receiptShot,
      attachReceipt: this.attachReceipt,
      groceryTotalNum: this.num(open.reduce((t, i) => t + i.cost, 0), '₱'),
      groceryAllDone: plan.length === 0 || open.length === 0,
      groceryCountText: plural(open.length, 'item', 'items') + ' to buy',
      groceryShortCount: open.length,
      canPickSupplier: sheetItem ? OPTIONS_FOR(sheetItem).map((o, idx) => ({
        name: o.name, price: PESO(o.price) + ' / ' + o.pack.toLowerCase(), when: 'bought ' + o.last,
        best: idx === 0, pick: () => this.pickSupplier(sheetItem, o.name)
      })) : []
    };
  }

  // =========== bazaar ===========
  bazaarVals(s, hint) {
    const ev = s.event;
    const cartItems = Object.keys(s.cart).filter(k => s.cart[k] > 0);
    const cartTotal = cartItems.reduce((t, k) => t + s.eventPrices[k] * s.cart[k], 0);
    const revenue = s.sales.reduce((t, x) => t + x.total, 0);
    const evRows = s.ledger.filter(e => e.ev && e.kind === 'expense');
    const evExp = evRows.reduce((t, x) => t + x.amount, 0);
    const cogs = s.sales.reduce((t, x) => t + Object.keys(x.items).reduce((a, k) => a + x.items[k] * this.unitCost(k), 0), 0);
    return {
      events: (function (self, now) {
        const sat = atTime(now + ((6 - new Date(now).getDay() + 7) % 7 || 7) * DAY, 10, 0);
        const sun2 = atTime(sat + 8 * DAY, 11, 0);
        return [
          { name: 'Katipunan Weekend Market', at: sat, date: longDateText(sat) + ' · 10 AM – 8 PM', place: 'Katipunan Ave, QC' },
          { name: 'UP Town Center Pop-up', at: sun2, date: longDateText(sun2) + ' · 11 AM – 9 PM', place: 'UP Town Center, QC' }
        ].map(e => Object.assign({}, e, { go: () => self.startEvent({ name: e.name, date: shortWhen(e.at) }) }));
      })(this, s.now),
      bzHintStart: hint === 'startEvent',
      bzNoEvent: !ev,
      event: ev ? {
        name: ev.name, date: ev.date,
        stage1: ev.stage === 'stock', stage2: ev.stage === 'selling', stage3: ev.stage === 'closed',
        reset: this.resetEvent
      } : null,
      bzStock: PRODUCTS.map(p => ({
        name: p.short, imgStyle: thumb(p.img, 40, 10, true), qty: s.eventStock[p.id] || 0,
        availText: (s.baked[p.id] || 0) + ' baked and ready',
        none: (s.baked[p.id] || 0) === 0,
        priceValue: s.eventPrices[p.id] || this.priceOf(p.id),
        menuNote: (s.eventPrices[p.id] || this.priceOf(p.id)) === this.priceOf(p.id) ? 'Menu price' : 'Menu ' + PESO(this.priceOf(p.id)),
        minus: () => this.setEventStock(p.id, -1), plus: () => this.setEventStock(p.id, 1),
        onQty: e => this.setEventStockTo(p.id, e.target.value),
        onPrice: e => this.setEventPrice(p.id, e.target.value)
      })),
      bzStockTotal: PRODUCTS.reduce((t, p) => t + (s.eventStock[p.id] || 0), 0),
      openSelling: this.openSelling,
      bzSell: PRODUCTS.map(p => {
        const left = s.eventStock[p.id] || 0;
        return {
          name: p.short, imgStyle: thumb(p.img, 56, 12, false),
          priceText: PESO(s.eventPrices[p.id] || this.priceOf(p.id)),
          left, inCart: s.cart[p.id] || 0, soldOut: left === 0,
          qtyText: String(s.cart[p.id] || 0),
          tap: () => this.addCart(p.id, 1), minus: () => this.addCart(p.id, -1)
        };
      }),
      bzCartCount: cartItems.reduce((t, k) => t + s.cart[k], 0),
      bzCartTotal: PESO(cartTotal),
      bzDueText: PESO(Math.max(0, cartTotal - (s.cartDiscount || 0))),
      bzCartTotalNum: this.num(cartTotal, '₱'),
      bzCartEmpty: cartItems.length === 0,
      bzCartLines: cartItems.map(k => ({ name: P[k].short, qty: s.cart[k] + '×', line: PESO(s.eventPrices[k] * s.cart[k]) })),
      openPay: () => this.sheet('pay'),
      payMethods: ['Cash', 'GCash', 'Maya', 'GoTyme'].map(m => {
        const blocked = m !== 'Cash' && !String(s.saleRef || '').trim();
        return {
          label: m, blocked: blocked,
          style: 'display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 60px; border: 1px solid '
            + (blocked ? '#F2E4DF' : '#EDE8E4') + '; background: ' + (blocked ? '#FCF9F8' : '#FFFFFF')
            + '; color: ' + (blocked ? '#9B8579' : '#3A1F14') + '; border-radius: 13px; transition: transform .16s cubic-bezier(.2,.8,.2,1), background-color .18s ease',
          // a digital tap with no reference typed puts the cursor where it is needed
          go: () => {
            if (blocked) {
              const el = document.getElementById('hc-sale-ref');
              if (el) { el.focus(); el.select && el.select(); }
              return this.toast('Type the last 4 digits of their ' + m + ' reference first \u2014 it is how you match this sale to your wallet.', 'warn');
            }
            this.recordSale(m, false);
          }
        };
      }),
      recordFreebie: () => this.recordSale('Freebie', true),
      clerkName: ROLES[s.role].label,
      saleRef: s.saleRef, setSaleRefIn: e => this.setSaleRef(e.target.value),
      tendered: s.tendered, setTenderedIn: e => this.setTendered(e.target.value),
      changeText: (function (self, st) {
        const t = Number(st.tendered) || 0;
        const due = Math.max(0, self.cartGross(st) - (st.cartDiscount || 0));
        return t > due ? PESO(t - due) : '';
      })(this, s),
      discountOptions: [0, Number(this.cfgOf().discountA) || 0, Number(this.cfgOf().discountB) || 0]
        .filter((v, i, a) => v === 0 || (v > 0 && a.indexOf(v) === i))
        .map(v => ({ label: v === 0 ? 'No discount' : '₱' + v + ' off', on: (s.cartDiscount || 0) === v, go: () => this.setDiscount(v) })),
      cashTenders: [100, 200, 500, 1000].map(n => ({ label: '₱' + n, go: () => this.setTendered(String(n)) })),
      drawerFloatText: s.drawer ? PESO(s.drawer.float) : PESO(0),
      drawerCashText: PESO(s.sales.filter(x => x.pay === 'Cash').reduce((t, x) => t + x.total, 0)),
      drawerExpectedText: PESO((s.drawer ? s.drawer.float : 0) + s.sales.filter(x => x.pay === 'Cash').reduce((t, x) => t + x.total, 0)),
      drawerCounted: s.drawer ? s.drawer.counted : '',
      setCounted: e => this.setDrawerCounted(e.target.value),
      drawerDiffText: (function (st) {
        if (!st.drawer || st.drawer.counted === '' || st.drawer.counted == null) return '';
        const exp = st.drawer.float + st.sales.filter(x => x.pay === 'Cash').reduce((t, x) => t + x.total, 0);
        const d = Number(st.drawer.counted) - exp;
        return d === 0 ? 'Drawer balances exactly' : d > 0 ? PESO(d) + ' over' : PESO(Math.abs(d)) + ' short';
      })(s),
      drawerOff: (function (st) {
        if (!st.drawer || st.drawer.counted === '' || st.drawer.counted == null) return false;
        const exp = st.drawer.float + st.sales.filter(x => x.pay === 'Cash').reduce((t, x) => t + x.total, 0);
        return Number(st.drawer.counted) - exp !== 0;
      })(s),
      digitalTotals: ['GCash', 'Maya', 'GoTyme'].map(m => ({
        pay: m,
        totalText: PESO(s.sales.filter(x => x.pay === m).reduce((t, x) => t + x.total, 0)),
        n: s.sales.filter(x => x.pay === m).length
      })).filter(x => x.n > 0),
      reopenEvent: this.reopenEvent,
      bzSales: s.sales.map(x => ({
        id: x.id, summary: Object.keys(x.items).map(k => x.items[k] + '× ' + P[k].short).join(', '),
        totalText: x.total === 0 ? 'Free' : PESO(x.total), pay: x.pay,
        refText: x.ref ? 'ref ' + x.ref : '',
        clerk: x.clerk || '',
        stateText: x.failed ? 'Failed to sync' : x.synced ? 'Synced' : 'Waiting',
        bad: x.failed, ok: x.synced,
        void: () => this.voidSale(x.id),
        retry: () => this.retrySale(x.id)
      })),
      bzSalesCount: plural(s.sales.length, 'sale', 'sales'),
      bzRevenue: PESO(revenue), bzRevenueNum: this.num(revenue, '₱'),
      unsynced: s.unsynced,
      syncing: s.syncState === 'syncing', syncPartial: s.syncState === 'partial', syncDone: s.syncState === 'synced',
      syncBanner: s.unsynced > 0 || s.syncState !== 'idle' || !s.online,
      syncText: !s.online ? 'Offline · sales are being saved on this device'
        : s.syncState === 'syncing' ? 'Back online · syncing ' + plural(s.unsynced, 'sale', 'sales')
        : s.syncState === 'partial' ? '1 sale could not be sent — nothing was lost'
        : s.syncState === 'synced' ? 'Synced' : s.unsynced + ' waiting to sync',
      syncNow: this.syncNow,
      askClose: () => this.cashup() ? this.sheet('closeout') : this.denyHelper('cash up an event'),
      closeEvent: this.closeEvent,
      bzReturns: PRODUCTS.filter(p => (s.eventStock[p.id] || 0) > 0).map(p => ({ name: p.short, qtyText: (s.eventStock[p.id] || 0) + ' back to inventory' })),
      bzStockEmpty: PRODUCTS.every(p => (s.baked[p.id] || 0) === 0),
      helperBazaarNote: !ROLES[s.role].money,
      canCashUp: this.cashup(),
      showEventMoney: this.money(),
      bzCloseout: {
        revenue: PESO(revenue), cogs: PESO(cogs), expenses: PESO(evExp),
        profit: PESO(revenue - cogs - evExp), profitOk: revenue - cogs - evExp >= 0,
        salesCount: plural(s.sales.length, 'sale', 'sales'),
        opening: PRODUCTS.reduce((t, p) => t + ((s.eventLoaded || {})[p.id] || 0), 0) + ' cookies loaded',
        drawerFloatText: PESO(this.cfgOf().drawerFloat),
        sold: s.sales.reduce((t, x) => t + Object.keys(x.items).reduce((a, k) => a + x.items[k], 0), 0) + ' cookies sold',
        remaining: PRODUCTS.reduce((t, p) => t + (s.eventStock[p.id] || 0), 0) + ' still on the table',
        returned: PRODUCTS.reduce((t, p) => t + (s.eventStock[p.id] || 0), 0) + ' cookies returned',
        samples: s.sales.filter(x => x.total === 0).length + ' freebies given'
      },
      eventExpenses: evRows.map(x => ({ label: x.label, cat: x.cat, amountText: PESO(x.amount), when: relWhen(x.at, s.now) })),
      hasEventExpenses: evRows.length > 0,
      openEventExpense: () => this.sheet('evExp')
    };
  }

  // =========== p&l ===========
  pnlTotals(s) {
    const rows = this.ledgerIn(s);
    const byCat = {};
    rows.filter(e => e.kind === 'expense').forEach(e => {
      const r = byCat[e.cat] = byCat[e.cat] || { cat: e.cat, amount: 0, n: 0 };
      r.amount += e.amount; r.n++;
    });
    const merged = Object.keys(byCat).map(k => byCat[k]).sort((a, b) => b.amount - a.amount);
    const totalExp = merged.reduce((t, x) => t + x.amount, 0);
    const sum = (kind, cat) => rows.filter(e => e.kind === kind && (!cat || e.cat === cat)).reduce((t, e) => t + e.amount, 0);
    const refunded = sum('refund');
    const bookedDrops = sum('revenue', 'Drops');
    const thisDrop = this.orderRevenue(s);
    const revBazaar = sum('revenue', 'Bazaar');
    const revDrops = bookedDrops + thisDrop - refunded;
    const revenue = revDrops + revBazaar;
    const draw = sum('draw');
    const profit = revenue - totalExp;
    const rate = Number(this.cfgOf().taxRate) || 0;
    return { merged, revenue, revDrops, revBazaar, totalExp, profit, thisDrop, bookedDrops,
      refunded, draw, taxRate: rate, taxSetAside: Math.round(revenue * rate / 100), cash: profit - draw };
  }

  pnlVals(s, hint) {
    const T = this.pnlTotals(s);
    const merged = T.merged, evLines = T.evLines, eventRev = T.eventRev;
    const totalExp = T.totalExp, revenue = T.revenue;
    const drillRows = cat => this.ledgerIn(s).filter(e => e.kind === 'expense' && (cat === 'All expenses' || e.cat === cat))
      .sort((a, b) => b.at - a.at)
      .map(e => ({ when: dateText(e.at), what: e.label, amountText: PESO(e.amount), amount: e.amount }));
    const revRows = this.ledgerIn(s).filter(e => e.kind === 'revenue' || e.kind === 'refund')
      .sort((a, b) => b.at - a.at)
      .map(e => ({ when: dateText(e.at), what: e.label, amountText: (e.kind === 'refund' ? '−' : '') + PESO(e.amount), amount: e.kind === 'refund' ? -e.amount : e.amount }));
    const liveDrop = T.thisDrop ? [{ when: 'Open now', what: 'Drop ' + s.dropNo + ' · ' + plural(s.orders.filter(o => this.inDrop(s, o) && this.RECOGNISED.indexOf(o.status) >= 0).length, 'order paid', 'orders paid'), amountText: PESO(T.thisDrop), amount: T.thisDrop }] : [];
    const dr = s.pnlDrill;
    const maxCat = merged.reduce((m, x) => Math.max(m, x.amount), 1);
    return {
      pl: {
        profitNum: this.num(T.profit, '₱'), profitText: PESO(T.profit),
        revenueText: PESO(revenue), expenseText: PESO(totalExp),
        taxText: PESO(T.taxSetAside), taxRateText: T.taxRate + '% set aside', taxPctText: T.taxRate + '%',
        drawText: PESO(T.draw), hasDraw: T.draw > 0, cashText: PESO(T.cash),
        periodText: 'Last 30 days · ' + dateText(this.periodFrom(s)) + ' to ' + dateText(s.now),
        openRules: () => this.sheet('rules'),
        refundedText: PESO(T.refunded), hasRefunds: T.refunded > 0,
        openDraw: () => this.sheet('draw'),
        thisDropText: PESO(T.thisDrop),
        marginRows: PRODUCTS.map(p => {
          const price = this.priceOf(p.id);
          const cost = this.unitCost(p.id);
          const sold = s.orders.filter(o => this.RECOGNISED.indexOf(o.status) >= 0).reduce((t, o) => t + (o.items[p.id] || 0), 0)
            + s.sales.reduce((t, x) => t + (x.items[p.id] || 0), 0);
          const each = price - cost;
          return {
            name: p.short, sold: sold,
            eachText: PESO2(each), soldText: sold + ' sold',
            madeText: PESO(Math.round(each * sold)),
            pctText: price ? Math.round((each / price) * 100) + '%' : '—',
            barStyle: 'width:' + Math.max(4, Math.min(100, price ? (each / price) * 100 : 0)) + '%'
          };
        }).filter(r => r.sold > 0),
        hasMargins: PRODUCTS.some(p => s.orders.filter(o => this.RECOGNISED.indexOf(o.status) >= 0).reduce((t, o) => t + (o.items[p.id] || 0), 0) + s.sales.reduce((t, x) => t + (x.items[p.id] || 0), 0) > 0),
        marginText: revenue ? Math.round(T.profit / revenue * 100) + '% margin' : 'No sales yet',
        drops: PESO(T.revDrops), bazaar: PESO(T.revBazaar),
        note: 'Sales minus every expense, helper wages included.',
        emptyExpenses: merged.length === 0
      },
      plTrend: (function (self, profit, now) {
        const past = PRIOR_MONTHS.map(m => ({ label: m.label, amt: m.amount }));
        const rows = past.concat([{ label: MON_NAMES[new Date(now).getMonth()], amt: profit, now: true }]);
        const max = rows.reduce((m, r) => Math.max(m, r.amt), 1);
        return rows.map(r => ({
          label: r.label, v: Math.max(6, Math.round(r.amt / max * 100)),
          amount: PESO(Math.round(r.amt / 1000)) + 'k', now: !!r.now, past: !r.now
        }));
      })(this, T.profit, s.now),
      plRows: merged.map(m => ({
        cat: m.cat, amountText: PESO(m.amount), n: m.n + (m.n === 1 ? ' record' : ' records'),
        barStyle: 'width: ' + Math.round(m.amount / maxCat * 100) + '%',
        go: () => { this.setState({ pnlDrill: m.cat, sheet: { kind: 'records' } }); this.advanceIfHint('drill'); }
      })),
      plRevenueDrill: () => { this.setState({ pnlDrill: 'Revenue', sheet: { kind: 'records' } }); this.advanceIfHint('drill'); },
      plExpenseDrill: () => { this.setState({ pnlDrill: 'All expenses', sheet: { kind: 'records' } }); this.advanceIfHint('drill'); },
      plHintDrill: hint === 'drill', plHintExpense: hint === 'expense',
      drill: dr && s.sheet && s.sheet.kind === 'records' ? (function (list) {
        return {
          title: dr === 'Revenue' ? 'Where revenue came from' : dr === 'All expenses' ? 'Where the money went' : dr,
          sub: dr === 'Revenue' ? 'Every drop and event in the last 30 days' : dr === 'All expenses' ? 'Every expense in the last 30 days, newest first' : 'Every record behind this amount',
          rows: list,
          empty: list.length === 0, hasRows: list.length > 0,
          totalText: PESO(list.reduce((t, r) => t + r.amount, 0)),
          close: () => this.setState({ pnlDrill: null, sheet: null })
        };
      })(dr === 'Revenue' ? liveDrop.concat(revRows) : drillRows(dr)) : null,
      openExpense: () => this.sheet('expense'),
      openCategories: () => this.sheet('categories'),
      catRows: s.categories.map(c => {
        const off = s.inactiveCats.indexOf(c) >= 0;
        return {
          name: c, off, stateText: off ? 'Hidden' : 'Active',
          toggle: () => this.toggleCategory(c),
          rename: () => { const v = window.prompt('Rename "' + c + '" to:', c); if (v) this.renameCategory(c, v); }
        };
      }),
      catOptions: s.categories.filter(c => s.inactiveCats.indexOf(c) < 0)
    };
  }

  // =========== drops, suppliers, settings ===========
  adminVals(s) {
    const sh = s.sheet || {};
    const sq = this.getQ('sup').trim().toLowerCase();
    const cap = this.capacityOf();
    const confirmed = this.confirmedCookies(s);
    const sup = SUPPLIERS.filter(x => x.name === s.supplierOpen)[0] || SUPPLIERS[0];
    const cheapest = {};
    SUPPLIERS.forEach(v => v.items.forEach(i => { if (!cheapest[i.item] || i.price < cheapest[i.item]) cheapest[i.item] = i.price; }));
    return {
      drop2: {
        no: 'Drop ' + s.dropNo,
        stateText: ({ open: 'Open for orders', soon: 'Closing soon', closed: 'Closed', soldout: 'Sold out' })[this.shopState(s)],
        closed: !this.shopOpen(s),
        scheduleLine: 'Ordering ' + dowName(this.cycle(s).open) + ' ' + clockText(this.cycle(s).open).replace(':00 ', ' ') + ' to ' + dowName(this.cycle(s).close) + ' ' + clockText(this.cycle(s).close).replace(':00 ', ' '),
        openAt: dowName(this.cycle(s).open) + ', ' + clockText(this.cycle(s).open),
        closeAt: dowName(this.cycle(s).close) + ', ' + clockText(this.cycle(s).close),
        extended: (Number(this.cfgOf().extendH) || 0) > 0,
        overridden: !!s.shopOverride,
        countdown: s.now < this.cycle(s).close ? 'closes in ' + spanText(this.cycle(s).close - s.now) : 'closed ' + spanText(s.now - this.cycle(s).close) + ' ago',
        capText: confirmed + ' / ' + cap + ' confirmed', capNum: this.num(confirmed),
        capValue: cap,
        capBar: 'width: ' + Math.min(100, confirmed / cap * 100).toFixed(1) + '%',
        capInput: cap, capValue: cap,
        setCap: e => this.setCapacity(e.target.value),
        capDown: () => this.setCapacity(cap - 10),
        capUp: () => this.setCapacity(cap + 10),
        commitCap: this.commitCapacity,
        windows: this.windows(s).map(w => {
          const booked = s.orders.filter(o => this.inDrop(s, o) && o.day === w.id && this.RECOGNISED.indexOf(o.status) >= 0).reduce((t, o) => t + orderCount(o), 0);
          return { label: w.label, time: w.time, left: Math.max(0, Math.round(cap / 2) - booked) + ' slots left' };
        }),
        extend: this.extendDrop,
        closeEarly: () => this.sheet('closeDrop'),
        reopen: this.reopenDrop,
        duplicate: this.duplicateDrop,
        preview: () => this.go('shop')
      },
      dropProducts: PRODUCTS.map(p => {
        const on = s.dropActive[p.id] !== false;
        const so = !!s.soldOut[p.id];
        return {
          name: p.short, imgStyle: thumb(p.img, 38, 9, true), kind: p.kind, priceText: PESO(this.priceOf(p.id)),
          on, soldOut: so,
          stateText: !on ? 'Not this drop' : so ? 'Sold out' : 'On the menu',
          toggleLabel: on ? 'Remove' : 'Add back',
          soldLabel: so ? 'Back in stock' : 'Mark sold out',
          toggle: () => this.toggleDropProduct(p.id),
          toggleSold: () => this.toggleSoldOut(p.id)
        };
      }),
      pastDrops: (s.ledger || []).filter(e => e.kind === 'revenue' && e.cat === 'Drops').sort((a, b) => b.at - a.at).slice(0, 4).map(e => ({
        label: e.label.split(' · ')[0], when: dateText(e.at), detail: e.label.split(' · ').slice(1).join(' · ') + ' · ' + PESO(e.amount)
      })),
      supplierTabs: SUPPLIERS.map(v => ({ label: v.name, active: s.supplierOpen === v.name, go: () => this.setState({ supplierOpen: v.name }) })),
      supQ: this.getQ('sup'), hasSupQ: sq.length > 0,
      setSupQ: e => this.setQ('sup', e.target.value),
      clearSupQ: () => this.setQ('sup', ''),
      supplier: {
        name: sup.name, place: sup.place,
        countText: plural(sup.items.length, 'item', 'items') + ' bought here',
        items: sup.items.filter(i => !sq || i.item.toLowerCase().indexOf(sq) >= 0).map(i => ({
          item: i.item, pack: i.pack,
          priceText: PESO(((s.paid || {})[i.item] && sup.name === (s.paid || {})[i.item].supplier) ? s.paid[i.item].price : i.price),
          last: ((s.paid || {})[i.item] && sup.name === (s.paid || {})[i.item].supplier)
            ? 'You bought this ' + relWhen(s.paid[i.item].at, s.now)
            : 'Last bought ' + i.last,
          prevText: i.prev.length ? 'Before: ' + i.prev.map(p => PESO(p)).join(', ') : 'First purchase',
          best: i.price === cheapest[i.item], notBest: i.price !== cheapest[i.item], preferred: i.preferred
        }))
      },
      settingsGroups: [
        { title: 'Orders & payments', rows: [
          { label: 'Payment methods and proof rule', value: 'Proof required', go: () => this.sheet('payrules') },
          { label: 'Order statuses', value: plural(Object.keys(this.STATUS_LABEL).length, 'status', 'statuses') + ' in use', go: () => this.sheet('statuses') },
          { label: 'Collection options', value: 'Courier pickup', go: () => this.go('drops') }
        ] },
        { title: 'Drops & capacity', rows: [
          { label: 'Drop schedule', value: dowName(this.cycle(s).open).slice(0, 3) + ' ' + clockText(this.cycle(s).open).replace(':00 ', ' ') + ' – ' + dowName(this.cycle(s).close).slice(0, 3) + ' ' + clockText(this.cycle(s).close).replace(':00 ', ' '), go: () => this.go('drops') },
          { label: 'Weekly capacity', value: this.capacityOf() + ' cookies', go: () => this.go('drops') },
          { label: 'Pricing rule', value: this.priceMode(), go: () => this.sheet('pricing') }
        ] },
        { title: 'Products & recipes', rows: [
          { label: 'Products and prices', value: PRODUCTS.filter(p => s.dropActive[p.id] !== false).length + ' on the menu', go: () => this.go('products') },
          { label: 'Recipes and versions', value: 'Up to v' + Math.max.apply(null, PRODUCTS.map(p => s.recipeVer[p.id] || 1)), go: () => this.go('recipes') }
        ] },
        { title: 'Inventory & grocery', rows: [
          { label: 'Tracked items', value: plural(s.inv.length, 'item', 'items'), go: () => this.go('inventory') },
          { label: 'Weekly count', value: 'Ingredients, packaging, dough', go: () => this.go('inventory') },
          { label: 'Grocery period', value: 'Next weekly drop', go: () => this.go('grocery') },
          { label: 'Supplier suggestion', value: 'Lowest recent price', go: () => this.go('suppliers') }
        ] },
        { title: 'Customer experience', rows: [
          { label: 'Preview the shop', value: 'Live', go: () => this.go('shop') },
          { label: 'Preview checkout', value: '', go: this.previewCheckout },
          { label: 'Waitlist', value: plural((s.waitlist || []).length, 'person', 'people') + ' waiting', go: () => this.sheet('customers') },
          { label: 'Customer feedback', value: 'Off for now', go: () => this.toast('Feedback stays switched off until you want it. Nothing is collected and nothing is shown to customers.') }
        ] },
        { title: 'People', rows: [
          { label: 'Who can see what', value: '2 helpers, 2 temporary', go: () => this.sheet('users') },
          { label: 'Technical support access', value: 'KETH AI', go: () => this.sheet('users') }
        ] },
        { title: 'Money rules', rows: [
          { label: 'Tax set-aside', value: this.cfgOf().taxRate + '% of takings', go: () => this.sheet('rules') },
          { label: 'Bazaar float', value: PESO(this.cfgOf().drawerFloat), go: () => this.sheet('rules') },
          { label: 'Quick discounts', value: PESO(this.cfgOf().discountA) + ' / ' + PESO(this.cfgOf().discountB), go: () => this.sheet('rules') }
        ] },
        { title: 'Kitchen rules', rows: [
          { label: 'Dough rest window', value: this.cfgOf().restHours + ' hours', go: () => this.sheet('rules') },
          { label: 'Flag dough older than', value: this.cfgOf().doughWarnDays + ' days', go: () => this.sheet('rules') },
          { label: 'Grocery budget', value: PESO(this.cfgOf().groceryBudget) + ' a week', go: () => this.sheet('rules') }
        ] },
        { title: 'Notifications & data', rows: [
          { label: 'Alerts', value: Object.keys(s.channels).filter(k => s.channels[k]).length + ' on', go: () => this.go('notifications') },
          { label: 'Keep customer details for', value: this.cfgOf().retention, go: () => this.sheet('retention') },
          { label: 'Backups and export', value: s.backup === 'ok' ? 'Healthy' : 'Needs attention', go: () => this.go('health') },
          { label: 'Google Form bridge', value: 'On · temporary', go: () => this.go('formqueue') },
          { label: 'Saved on this device', value: s.savedAt ? 'Saved ' + relWhen(s.savedAt, s.now) : 'Saving as you work', go: () => this.sheet('storage') }
        ] }
      ],
      rules: [
        { k: 'taxRate', label: 'Tax set-aside', value: this.cfgOf().taxRate, valueText: this.cfgOf().taxRate + '%', step: 0.5, min: 0, max: 25,
          note: 'Held back from takings so the tax bill is never a surprise. It is not an expense.' },
        { k: 'drawerFloat', label: 'Bazaar cash float', value: this.cfgOf().drawerFloat, valueText: PESO(this.cfgOf().drawerFloat), step: 100, min: 0, max: 10000,
          note: 'What goes in the cash box before selling starts, so you can give change.' },
        { k: 'discountA', label: 'Quick discount 1', value: this.cfgOf().discountA, valueText: PESO(this.cfgOf().discountA), step: 5, min: 0, max: 500,
          note: 'One tap at the bazaar table.' },
        { k: 'discountB', label: 'Quick discount 2', value: this.cfgOf().discountB, valueText: PESO(this.cfgOf().discountB), step: 5, min: 0, max: 500,
          note: 'The bigger one, for bundles and regulars.' },
        { k: 'restHours', label: 'Dough rest window', value: this.cfgOf().restHours, valueText: this.cfgOf().restHours + ' h', step: 1, min: 0, max: 96,
          note: 'Dough is only counted ready once this much time has actually passed since mixing.' },
        { k: 'doughWarnDays', label: 'Flag dough older than', value: this.cfgOf().doughWarnDays, valueText: this.cfgOf().doughWarnDays + ' days', step: 1, min: 1, max: 60,
          note: 'Old dough gets a check-this warning in Inventory.' },
        { k: 'groceryBudget', label: 'Grocery budget', value: this.cfgOf().groceryBudget, valueText: PESO(this.cfgOf().groceryBudget), step: 500, min: 0, max: 40000,
          note: 'Compared against the shopping list total each week.' },
        { k: 'packagingFee', label: 'Packaging fee per box', value: this.cfgOf().packagingFee, valueText: PESO2(this.cfgOf().packagingFee), step: 1, min: 0, max: 500,
          note: 'Used by the packaging-fee and cost-multiplier pricing rules.' },
        { k: 'flatBoxPrice', label: 'Flat price per box', value: this.cfgOf().flatBoxPrice, valueText: PESO(this.cfgOf().flatBoxPrice), step: 10, min: 0, max: 5000,
          note: 'Used when the pricing rule is a flat box price.' },
        { k: 'cogsMultiple', label: 'Cost multiplier', value: this.cfgOf().cogsMultiple, valueText: '\u00d7 ' + this.cfgOf().cogsMultiple, step: 0.5, min: 1, max: 10,
          note: 'What you multiply the cookie cost by when pricing off cost.' },
        { k: 'maxPerOrder', label: 'Cookies per order limit', value: this.cfgOf().maxPerOrder, valueText: plural(this.cfgOf().maxPerOrder, 'cookie', 'cookies'), step: 1, min: 1, max: 120,
          note: 'Stops one customer taking the whole drop.' }
      ].map(r => Object.assign({}, r, {
        down: () => this.bumpCfg(r.k, -r.step, r.min, r.max),
        up: () => this.bumpCfg(r.k, r.step, r.min, r.max),
        set: e => this.numCfg(r.k, e.target.value, r.min, r.max)
      })),
      schedRows: [
        { k: 'openDow', label: 'Ordering opens', value: DOW_NAMES[this.cfgOf().openDow] + ' ' + clockText(atTime(s.now, this.cfgOf().openH, this.cfgOf().openM)),
          prev: () => this.setCfg('openDow', (this.cfgOf().openDow + 6) % 7), next: () => this.setCfg('openDow', (this.cfgOf().openDow + 1) % 7) },
        { k: 'closeDow', label: 'Ordering closes', value: DOW_NAMES[this.cfgOf().closeDow] + ' ' + clockText(atTime(s.now, this.cfgOf().closeH, this.cfgOf().closeM)),
          prev: () => this.setCfg('closeDow', (this.cfgOf().closeDow + 6) % 7), next: () => this.setCfg('closeDow', (this.cfgOf().closeDow + 1) % 7) }
      ],
      schedHours: [
        { k: 'openH', label: 'Opening hour', valueText: clockText(atTime(s.now, this.cfgOf().openH, this.cfgOf().openM)), down: () => this.bumpCfg('openH', -1, 0, 23), up: () => this.bumpCfg('openH', 1, 0, 23) },
        { k: 'closeH', label: 'Closing hour', valueText: clockText(atTime(s.now, this.cfgOf().closeH, this.cfgOf().closeM)), down: () => this.bumpCfg('closeH', -1, 0, 23), up: () => this.bumpCfg('closeH', 1, 0, 23) }
      ],
      goHealth: () => { this.setState({ sheet: null }); this.go('health'); },
      retentionOptions: Object.keys(RETENTION_DAYS).map(o => ({
        label: o, on: this.cfgOf().retention === o, pick: () => this.setRetention(o)
      })),
      priceModes: ['Sum of menu prices', 'Menu prices + packaging fee', 'Flat price per box', 'Cookie cost × multiplier + packaging'].map(m => ({
        label: m, on: (s.priceDraft || this.priceMode()) === m, pick: () => this.pickPriceMode(m)
      })),
      priceModePreview: (function (self, st) {
        const sample = { wcb: 2, rvc: 2, pbm: 2 };
        const mode = st.priceDraft || self.priceMode();
        const sum = Object.keys(sample).reduce((t, k) => t + self.priceOf(k) * sample[k], 0);
        const total = mode === 'Flat price per box' ? self.flatBox()
          : mode === 'Menu prices + packaging fee' ? sum + self.packFee()
          : mode === 'Cookie cost × multiplier + packaging'
            ? Math.round(Object.keys(sample).reduce((t, k) => t + self.ingCost(k) * sample[k], 0) * self.cogsMult() + self.packFee())
            : sum;
        return { mode: mode, items: '2 White Chocolate Biscoff · 2 Red Velvet · 2 PB & Miso', total: PESO2(total),
          changed: mode !== self.priceMode() };
      })(this, s),
      publishPriceMode: this.publishPriceMode,
      closeDropConfirm: this.closeDropEarly,
      overageConfirm: () => { if (sh.id) this.confirmPayment(sh.id, true); },
      savePrice: e => { e.preventDefault(); this.setPrice(sh.pid, e.target.pval.value); },
      mix: s.doughPrep ? (function (self, dp) {
        const rows = self.mixRows(dp.pid, dp.balls);
        return {
          pid: dp.pid, name: P[dp.pid].short, balls: dp.balls,
          setFlavour: e => self.setDoughFlavour(e.target.value),
          fullBalls: self.doughOptions(dp.pid).full, halfBalls: self.doughOptions(dp.pid).half,
          isFull: dp.balls === self.doughOptions(dp.pid).full,
          isHalf: dp.balls === self.doughOptions(dp.pid).half,
          pickFull: () => self.setDoughPortion('full'), pickHalf: () => self.setDoughPortion('half'),
          ballsText: plural(dp.balls, 'portion', 'portions'),
          gramText: 'about ' + (dp.balls * 80) + ' g of dough',
          rows: rows.map(r => ({ name: r.name, amountText: r.amount + ' ' + r.unit, onHandText: r.onHand + ' ' + r.unit + ' on hand', short: r.short })),
          anyShort: rows.some(r => r.short),
          plus: () => self.setDoughBalls(1), minus: () => self.setDoughBalls(-1),
          confirm: self.confirmDough
        };
      })(this, s.doughPrep) : null,
      overageText: sh.kind === 'overage'
        ? sh.name + '\u2019s order is ' + plural(sh.n, 'cookie', 'cookies') + ', but only ' + plural(sh.left, 'cookie', 'cookies') + ' of your ' + this.capacityOf() + ' are still free. Confirming puts you ' + plural(sh.over, 'cookie', 'cookies') + ' over.'
        : '',
      customers: s.orders.filter(o => this.inDrop(s, o) && o.status !== 'Cancelled').slice().reverse().map(o => ({
        name: o.name, count: orderCount(o) + ' cookies'
      })),
      waitlist: (s.waitlist || []).map((w, i) => ({
        name: w.name, want: w.want,
        when: w.contacted ? 'told about this drop' : 'joined ' + relWhen(w.at, s.now),
        contacted: !!w.contacted, notContacted: !w.contacted,
        go: () => this.contactWaitlist(i)
      })),
      hasWaitlist: (s.waitlist || []).length > 0,
      retentionLine: this.retentionDays()
        ? 'Names, numbers and payment proofs are hidden ' + this.cfgOf().retention.toLowerCase() + ' after an order is completed. Sales records stay.'
        : 'Contact details are kept until you delete them yourself.'
    };
  }

  // =========== recipes ===========
  recipeVals(s, isDesktop, isTablet) {
    const wide = isDesktop || isTablet;
    const pid = s.recipeOpen;
    const r = s.recipes[pid];
    const names = s.inv.filter(i => i.cat === 'Ingredients').map(i => i.name);
    return {
      recipeTabs: PRODUCTS.map(p => ({
        label: p.short, dirty: !!s.recipeDirty[p.id], active: pid === p.id, go: () => this.openRecipe(p.id)
      })),
      recipe: {
        name: P[pid].short, imgStyle: thumb(P[pid].img, 44, 11, true),
        version: 'Version ' + s.recipeVer[pid],
        dirty: !!s.recipeDirty[pid],
        yieldText: r.yield + ' cookies', yieldNum: r.yield,
        costText: PESO2(this.unitCost(pid)) + ' per cookie',
        perBall: Math.round(r.ing.filter(i => i[0]).reduce((t, i) => t + (i[2] === 'g' ? Number(i[1]) || 0 : 0), 0) / r.yield) + ' g per portion',
        yieldUp: () => this.recipeYield(pid, 1),
        yieldDown: () => this.recipeYield(pid, -1),
        addRow: () => this.recipeAdd(pid),
        save: () => this.recipeSave(pid),
        rows: r.ing.map((i, idx) => ({
          name: i[0], qty: i[1], unit: i[2], blank: !i[0],
          setName: e => this.recipeEdit(pid, idx, 'name', e.target.value),
          setQty: e => this.recipeEdit(pid, idx, 'qty', e.target.value),
          setUnit: e => this.recipeEdit(pid, idx, 'unit', e.target.value),
          remove: () => this.recipeRemove(pid, idx),
          warn: i[0] && names.indexOf(i[0]) < 0 ? 'Not in inventory yet — add it there so stock can be tracked' : ''
        })),
        history: (s.recipeHistory[pid] || []).map(h => ({
          label: 'Version ' + h.version,
          detail: plural(h.snap.ing.filter(i => i[0]).length, 'ingredient', 'ingredients') + ' · makes ' + h.snap.yield,
          batches: (function (n) { return n ? plural(n, 'batch', 'batches') + ' baked on it' : 'never baked on'; })(s.batches.filter(b => b.pid === pid && b.version === h.version).length)
        })),
        currentBatches: (function (n) {
          return n ? plural(n, 'batch', 'batches') + ' baked on this version' : 'Nothing baked on this version yet';
        })(s.batches.filter(b => b.pid === pid && b.version === s.recipeVer[pid]).length),
        hasHistory: (s.recipeHistory[pid] || []).length > 0,
        units: ['g', 'ml', 'pcs'],
        wide, ingredientNames: names
      }
    };
  }

  // =========== form queue ===========
  queueVals(s, hint) {
    return {
      queueArchive: s.queueArchive.map(q => ({ id: q.id, name: q.name, when: relWhen(q.rejectedAt, s.now), restore: () => this.restoreQueue(q.id) })),
      hasQueueArchive: s.queueArchive.length > 0,
      queueRows: s.queue.map(q => {
        const n = Object.keys(q.guess).reduce((t, k) => t + q.guess[k], 0);
        return {
          id: q.id, name: q.name, raw: q.raw,
          clear: q.clear, unclear: !q.clear, note: q.note,
          ref: q.ref || '', setRef: e => this.queueRef(q.id, e.target.value),
          // what the message adds up to, in one line
          orderLine: PRODUCTS.filter(p => q.guess[p.id]).map(p => q.guess[p.id] + ' ' + p.short).join(', ') || 'Nothing picked out yet',
          countText: plural(n, 'cookie', 'cookies') + ' · ' + this.windowById(s, q.day).label,
          accept: () => this.acceptQueue(q.id),
          reject: () => this.rejectQueue(q.id),
          hint: hint === 'review' && !q.clear && q.id === 'F-118'
        };
      }),
      queueEmpty: s.queue.length === 0,
      queueCount: plural(s.queue.length, 'response', 'responses') + ' waiting'
    };
  }

  notifs(s) {
    const reviewN = s.orders.filter(o => o.status === 'Payment review').length;
    const groceryN = this.groceryPlan(s).filter(i => !s.received[i.key]).length;
    const low = s.inv.filter(i => i.qty < i.level);
    const newest = s.orders[s.orders.length - 1];
    const satN = s.orders.filter(o => o.day === 'sat' && ['Confirmed', 'Preparing', 'Ready'].indexOf(o.status) >= 0).length;
    return [
      s.backup === 'ok'
        ? { k: 'health', label: 'Backup completed', sub: 'System · ' + relWhen(s.backupAt, s.now), tone: 'ok', urgency: 'Information', go: () => this.go('health') }
        : { k: 'health', label: 'Automatic backup failed', sub: 'System · ' + relWhen(s.backupAt, s.now), tone: 'bad', urgency: 'Action needed now', go: () => this.go('health') },
      s.unsynced > 0
        ? { k: 'health', label: plural(s.unsynced, 'bazaar sale has', 'bazaar sales have') + ' not synced', sub: 'System · today', tone: 'bad', urgency: 'Action needed now', go: () => this.go('health') }
        : null,
      reviewN
        ? { k: 'orders', label: plural(reviewN, 'payment needs', 'payments need') + ' review', sub: 'Orders · today', tone: 'warn', urgency: 'Needs attention soon', go: () => this.go('orders') }
        : null,
      low.length
        ? { k: 'inventory', label: low[0].name + ' is below your level', sub: 'Inventory · today', tone: 'warn', urgency: 'Needs attention soon', go: () => this.go('inventory') }
        : null,
      groceryN
        ? { k: 'grocery', label: plural(groceryN, 'item', 'items') + ' short for Drop ' + s.dropNo, sub: 'Grocery · today', tone: 'warn', urgency: 'Needs attention soon', go: () => this.go('grocery') }
        : null,
      newest
        ? { k: 'orders', label: 'New order from ' + newest.name, sub: 'Orders · ' + relWhen(newest.placedAt, s.now), tone: 'info', urgency: 'Information', go: () => this.go('orders') }
        : null,
      satN
        ? { k: 'today', label: 'Pickup reminder: ' + plural(satN, 'order', 'orders') + ' ' + this.windowText(s, 'sat'), sub: 'Fulfilment · ' + (this.windowById(s, 'sat').at > s.now ? 'in ' + spanText(this.windowById(s, 'sat').at - s.now) : 'today'), tone: 'info', urgency: 'Information', go: () => this.go('today') }
        : null
    ].filter(Boolean).filter(n => this.canSee(n.k));
  }

  // =========== tools, sheets, misc ===========
  miscVals(s, hint, isDesktop) {
    const sh = s.sheet || {};
    const groceryN = this.groceryPlan(s).filter(i => !s.received[i.key]).length;
    const queueN = s.queue.length;
    const healthN = (s.backup === 'ok' ? 0 : 1) + (s.unsynced > 0 ? 1 : 0);
    const unmatchedN = s.orders.filter(o => this.RECOGNISED.indexOf(o.status) >= 0 && !(s.matched || {})[o.id]).length;
    const titleOf = {
      invEdit: sh.name, addInv: 'Add ' + (sh.cat === 'Packaging' ? 'packaging item' : 'ingredient'),
      why: 'Why you need this', supplier: 'Where to buy ' + (sh.name || ''), pay: 'How did they pay?',
      receive: 'Receive ' + (sh.name || ''), refund: 'Refund ' + String(sh.name || '').split(' ')[0], noshow: 'Nobody collected?',
      spoil: 'Write off ' + (sh.name || ''), draw: 'Take money out', dropState: 'Shop status',
      expense: 'Record an expense', categories: 'Expense categories', closeout: 'Close the event?',
      evExp: 'Event expense', proof: 'Payment proof', users: 'Who can see what', dough: 'Dough batch',
      retention: 'Keep customer details for', closeDrop: 'Close Drop ' + s.dropNo + ' early?',
      rules: 'Business rules', reset: 'Start the books over', swap: 'Swap a flavour',
      overage: 'This goes over your capacity', mixDough: 'Record dough', editPrice: 'Price of ' + (sh.name || ''),
      customers: 'Customers & waitlist', pricing: 'Pricing rule', baked: 'Baked and ready',
      payrules: 'Payments and proof', statuses: 'Order statuses',
      records: s.pnlDrill === 'Revenue' ? 'Where revenue came from' : s.pnlDrill === 'All expenses' ? 'Where the money went' : (s.pnlDrill || 'Records')
    };
    return {
      toolGroups: [
        { title: 'Orders', items: [
          { k: 'orders', icon: this.IC.orders, label: 'Orders & payments', sub: plural(s.orders.filter(o => this.inDrop(s, o)).length, 'order', 'orders') + ' in Drop ' + s.dropNo, go: () => this.go('orders') },
          { k: 'drops', icon: this.IC.cookie, label: 'Drops', sub: 'Drop ' + s.dropNo + ' open', go: () => this.go('drops') },
          { k: 'drops', icon: this.IC.eye, label: 'Shop status', sub: ({ open: 'Open', soon: 'Closing soon', closed: 'Closed', soldout: 'Sold out' })[this.shopState(s)] + (s.shopOverride ? ' · held by you' : ' · on schedule'), go: () => this.sheet('dropState') },
          { k: 'orders', icon: this.IC.users, label: 'Customers & waitlist', sub: plural((s.waitlist || []).filter(w => !w.contacted).length, 'person', 'people') + ' waiting for the next drop', go: () => this.sheet('customers') },
          { k: 'formqueue', icon: this.IC.sync, label: 'Form queue', sub: queueN ? plural(queueN, 'response', 'responses') + ' waiting' : 'Clear', badge: queueN, go: () => this.go('formqueue', { hint: 'queue' }) }
        ] },
        { title: 'Kitchen', items: [
          { k: 'bake', icon: this.IC.bake, label: 'Bake & dough', sub: 'Plan, batches, portions', go: () => this.go('bake', { hint: 'bake' }) },
          { k: 'inventory', icon: this.IC.inventory, label: 'Inventory', sub: 'Ingredients, packaging, dough', go: () => this.go('inventory') },
          { k: 'grocery', icon: this.IC.grocery, label: 'Grocery', sub: groceryN ? plural(groceryN, 'item', 'items') + ' short' : 'Nothing to buy', badge: groceryN, go: () => this.go('grocery', { hint: 'grocery' }) },
          { k: 'recipes', icon: this.IC.recipe, label: 'Recipes', sub: 'Versioned, cost per cookie', go: () => this.go('recipes') }
        ] },
        { title: 'Business', items: [
          { k: 'pnl', icon: this.IC.money, label: 'Profit & loss', sub: 'Revenue, expenses, profit', go: () => this.go('pnl', { hint: 'pnl' }) },
          { k: 'reconcile', icon: this.IC.check, label: 'Payments', sub: unmatchedN ? plural(unmatchedN, 'reference', 'references') + ' unticked' : 'All matched', badge: unmatchedN, go: () => this.go('reconcile') },
          { k: 'bazaar', icon: this.IC.bazaar, label: 'Bazaar Mode', sub: 'Fast selling, offline safe', go: () => this.go('bazaar', { hint: 'bazaar' }) },
          { k: 'products', icon: this.IC.tag, label: 'Products', sub: PRODUCTS.filter(p => s.dropActive[p.id] !== false).length + ' on the menu', go: () => this.go('products') },
          { k: 'suppliers', icon: this.IC.shop, label: 'Suppliers', sub: 'Prices you have actually paid', go: () => this.go('suppliers') }
        ] },
        { title: 'System', items: [
          { k: 'notifications', icon: this.IC.bell, label: 'Notifications', sub: 'What you get told about', go: () => this.go('notifications') },
          { k: 'settings', icon: this.IC.gear, label: 'Settings', sub: 'Rules you control', go: () => this.go('settings') },
          { k: 'health', icon: this.IC.alert, label: 'System health', sub: healthN ? 'Needs attention' : 'Healthy', badge: healthN, go: () => this.go('health') },
            { k: 'health', icon: this.IC.export, label: 'Backups & export', sub: 'Your data, downloadable', go: () => this.go('health') }
        ] },
        { title: 'Customer view', quiet: true, items: [
          { k: 'shop', icon: this.IC.eye, label: 'Preview shop', sub: 'What customers see', go: () => this.go('shop', { hint: 'shop' }) },
          { k: 'shop', icon: this.IC.eye, label: 'Preview checkout', sub: 'Order, details, payment', go: this.previewCheckout },
          { k: 'shop', icon: this.IC.eye, label: 'Preview order status', sub: 'The private link', go: this.previewStatus }
        ] }
      ].map(g => ({
        title: g.title, quiet: !!g.quiet,
        items: g.items.filter(i => this.canSee(i.k) && (!ROLES[s.role].more || i.k !== 'pnl')).map(i => Object.assign({}, i, { badge: i.badge || 0 }))
      })).filter(g => g.items.length > 0),

      sheet: sh.kind ? {
        kind: sh.kind, title: titleOf[sh.kind] || '',
        isInvEdit: sh.kind === 'invEdit', isAddInv: sh.kind === 'addInv', isWhy: sh.kind === 'why',
        isSupplier: sh.kind === 'supplier', isPay: sh.kind === 'pay', isExpense: sh.kind === 'expense',
        isCategories: sh.kind === 'categories', isCloseout: sh.kind === 'closeout', isEvExp: sh.kind === 'evExp',
        isProof: sh.kind === 'proof', isUsers: sh.kind === 'users', isDough: sh.kind === 'dough',
        isRetention: sh.kind === 'retention', isCloseDrop: sh.kind === 'closeDrop', isOverage: sh.kind === 'overage',
        isRules: sh.kind === 'rules', isStorage: sh.kind === 'storage', isReset: sh.kind === 'reset', isSwap: sh.kind === 'swap',
        isMixDough: sh.kind === 'mixDough', isEditPrice: sh.kind === 'editPrice', isCustomers: sh.kind === 'customers',
        isReceive: sh.kind === 'receive', isRefund: sh.kind === 'refund', isNoShow: sh.kind === 'noshow', isSpoil: sh.kind === 'spoil', isDraw: sh.kind === 'draw',
        isDropState: sh.kind === 'dropState',
        isPricing: sh.kind === 'pricing', isBaked: sh.kind === 'baked',
        isPayRules: sh.kind === 'payrules', isStatuses: sh.kind === 'statuses',
        over: sh.over, left: sh.left, n: sh.n,
        name: sh.name || '', qty: sh.qty, unit: sh.unit || '', level: sh.level, cat: sh.cat || '',
        supplier: sh.supplier || '', why: sh.why || ''
      } : null,
      sheetStyle: 'width: 100%; max-width: ' + (isDesktop ? '520px' : '100%') + '; max-height: 88%; overflow-y: auto; border-radius: ' + (isDesktop ? '20px' : '24px 24px 0 0') + '; margin-top: auto; margin-bottom: ' + (isDesktop ? 'auto' : '0'),
      bakedSheet: sh.kind === 'baked' && sh.pid ? (function (self, st, pid) {
        const baked = st.baked[pid] || 0;
        const need = self.demand(pid);
        const committed = Math.min(baked, need);
        const last = st.batches.filter(b => b.pid === pid).slice(-1)[0];
        return {
          name: P[pid].short, imgStyle: thumb(P[pid].img, 44, 11, true),
          count: baked + ' baked',
          committed: committed + ' of these are spoken for by confirmed orders',
          free: Math.max(0, baked - need) + ' free to sell at an event',
          lastBatch: last ? 'Last batch: ' + last.qty + ' on version ' + last.version + ' · ' + relWhen(last.at, st.now) : 'No batch recorded yet',
          shortfall: Math.max(0, need - baked),
          toBake: () => { self.closeSheet(); self.go('bake'); },
          toBazaar: () => { self.closeSheet(); self.go('bazaar'); },
          writeOff: () => self.sheet('spoil', { name: P[pid].short, pid: pid, spoilKind: 'baked', max: st.baked[pid] || 0 })
        };
      })(this, s, sh.pid) : null,
      doughSheet: sh.kind === 'dough' && sh.pid ? {
        name: P[sh.pid].short, qty: (s.dough[sh.pid] || 0) + ' dough',
        stored: (s.doughAt || {})[sh.pid] ? 'Mixed ' + relWhen(s.doughAt[sh.pid], s.now) + ' · ' + spanText(s.now - s.doughAt[sh.pid]) + ' in the chiller' : 'Mix date not recorded',
        aged: this.doughAging(s, sh.pid),
        keep: () => { this.closeSheet(); this.toast('Kept as usable. Nothing changed.'); },
        discard: () => this.sheet('spoil', { name: P[sh.pid].short + ' dough', pid: sh.pid, spoilKind: 'dough', max: s.dough[sh.pid] || 0 })
      } : null,
      saveInvEdit: e => { e.preventDefault(); this.saveInv(sh.name, e.target.qty.value); },
      saveInvDelta: e => { e.preventDefault(); this.adjustInv(sh.name, e.target.dq.value, 1); },
      invSubtract: e => {
        const form = e.target.form || e.target.closest('form');
        this.adjustInv(sh.name, form ? form.dq.value : 0, -1);
      },
      invMeta: sh.kind === 'invEdit' ? (function (row) {
        return row ? {
          counted: 'Last counted ' + relWhen(row.updatedAt, Date.now()),
          system: 'System says ' + amtExact(row.qty, row.unit),
          level: 'Reorder level ' + amtExact(row.level, row.unit),
          supplier: row.supplier
        } : null;
      })(s.inv.filter(i => i.name === sh.name)[0]) : null,
      invPickList: s.inv.filter(i => i.cat === 'Ingredients' || i.cat === 'Packaging')
        .map(i => ({ id: i.name, label: i.name + ' — ' + amtExact(i.qty, i.unit) })),
      pickInvItem: e => {
        const it = s.inv.filter(i => i.name === e.target.value)[0];
        if (it) this.sheet('invEdit', { name: it.name, qty: it.qty, unit: it.unit, level: it.level, cat: it.cat, supplier: it.supplier });
      },
      setSheetQty: e => {
        const v = e.target.value;
        this.setState(st => (st.sheet ? { sheet: Object.assign({}, st.sheet, { qty: v }) } : null));
      },
      removeInvItem: () => this.removeInv(sh.name),
      openSpoil: () => this.sheet('spoil', { name: sh.name }),
      sheetAmountText: sh.amount ? PESO(sh.amount) : '',
      recvPickList: s.inv.filter(i => i.cat === 'Ingredients' || i.cat === 'Packaging')
        .map(i => ({ id: i.name, label: i.name + ' \u2014 ' + amt(i.qty, i.unit) + ' on hand' })),
      pickRecvItem: e => this.openReceive(e.target.value),
      recvItem: sh.item ? {
        plannedText: sh.item.add + ' ' + sh.item.unit, name: sh.item.name,
        offListText: sh.item.offList
          ? 'You already have enough ' + sh.item.name.toLowerCase() + ' for this drop, so the shopping list did not ask for it. Recording what you bought anyway keeps your stock and your cost per cookie right \u2014 the amounts below are a usual pack, so change them to what you actually got.'
          : '',
        plannedLine: sh.item.offList ? ''
          : 'You planned to order ' + sh.item.add + ' ' + sh.item.unit + ' of ' + sh.item.name + ' for ' + PESO(sh.item.cost) + ' from ' + sh.item.supplier + '. Change these to what you actually came home with.',
        planned: sh.item.add,
        costText: PESO(sh.item.cost),
        cost: sh.item.cost,
        supplier: sh.item.supplier,
        unit: sh.item.unit,
        alreadyText: (s.partial || {})[sh.item.key] ? ((s.partial || {})[sh.item.key] + ' ' + sh.item.unit + ' already in') : ''
      } : null,
      saveReceive: e => this.confirmReceive(e, sh.item),
      sheetName: sh.name || '',
      saveRefund: e => { e.preventDefault(); this.refundOrder(sh.id, e.target.rref.value); },
      confirmNoShow: () => this.noShow(sh.id),
      saveSpoil: e => { e.preventDefault(); this.logSpoilage(sh.name, e.target.sqty.value, e.target.swhy.value, sh.pid, sh.spoilKind); },
      swapIntro: sh.kind === 'swap' && sh.from
        ? (function (self, st, from, id) {
            const ord = st.orders.filter(x => x.id === id)[0];
            const q = ord ? (ord.items[from] || 0) : 0;
            return q + ' × ' + P[from].short + ' on this order. Pick what goes in instead — availability and price difference are shown for each.';
          })(this, s, sh.from, sh.id)
        : '',
      swapOptions: sh.kind === 'swap' && sh.from ? (function (self, st, from, id) {
        const ord = st.orders.filter(x => x.id === id)[0];
        if (!ord) return [];
        const qty = ord.items[from] || 0;
        const base = self.boxTotal(ord.items, ord.priced);
        return PRODUCTS.filter(p => p.id !== from && st.dropActive[p.id] !== false && !st.soldOut[p.id]).map(p => {
          const items = Object.assign({}, ord.items);
          delete items[from];
          items[p.id] = (items[p.id] || 0) + qty;
          const d = self.boxTotal(items, ord.priced) - base;
          const have = self.availableBaked(st, p.id) + (st.dough[p.id] || 0);
          return {
            name: p.short, imgStyle: thumb(p.img, 38, 9, true),
            stockText: have >= qty ? have + ' available now' : 'needs baking — ' + have + ' on hand',
            deltaText: d === 0 ? 'same price' : (d > 0 ? '+' : '−') + PESO(Math.abs(d)).replace('₱', '₱'),
            go: () => self.replaceLine(id, from, p.id)
          };
        });
      })(this, s, sh.from, sh.id) : [],
      saveDraw: e => { e.preventDefault(); this.recordDraw(e.target.damount.value, e.target.dnote.value); },
      dropStateOptions: [
        { id: 'open', label: 'Open', what: 'Customers can order.' },
        { id: 'soon', label: 'Closing soon', what: 'Still open, with a warning banner.' },
        { id: 'closed', label: 'Closed', what: 'No new orders. Existing ones are unaffected.' },
        { id: 'soldout', label: 'Sold out', what: 'Capacity is gone for this drop.' }
      ].concat([{ id: 'auto', label: 'Follow my schedule', what: 'Opens ' + DOW_NAMES[this.cfgOf().openDow] + ' ' + this.cfgOf().openH + ':00, closes ' + DOW_NAMES[this.cfgOf().closeDow] + '.' }])
        .map(o => ({ label: o.label, what: o.what, on: o.id === 'auto' ? !s.shopOverride : s.shopOverride === o.id, go: () => this.setDropState(o.id) })),
      closeDropRollover: this.closeDrop,
      dropNoText: 'Drop ' + s.dropNo,
      savedText: s.savedAt
        ? 'Everything you enter is saved on this device. Last save ' + relWhen(s.savedAt, s.now) + '.'
        : 'Everything you enter is saved on this device as you work.',
      askReset: () => this.sheet('reset'),
      resetData: () => this.sheet('reset'),
      confirmReset: this.resetData,
      saveAddInv: e => { e.preventDefault(); this.addInv(sh.cat, e.target.iname.value, e.target.iqty.value, e.target.iunit.value, e.target.ilevel.value, e.target.isupplier.value); },
      saveExpense: e => { e.preventDefault(); this.addExpense(e.target.ecat.value, e.target.elabel.value, e.target.eamount.value, e.target.eitem.value, e.target.eqty.value); },
      expenseItems: s.inv.filter(i => i.cat === 'Ingredients' || i.cat === 'Packaging')
        .map(i => ({ id: i.name, label: i.name + ' (' + i.unit + ')' })),
      saveEvExp: e => { e.preventDefault(); this.addEventExpense(e.target.xlabel.value, e.target.xamount.value, e.target.xcat.value); },
      saveCategory: e => { e.preventDefault(); this.addCategory(e.target.cname.value); e.target.reset(); },
      payChannels: [
        { label: 'GCash', num: '0917 ••• 4421', holder: 'Francine T.' },
        { label: 'Maya', num: '0917 ••• 4421', holder: 'Francine T.' },
        { label: 'GoTyme', num: '0155 ••• 8890', holder: 'Francine To' }
      ],
      statusList: [
        { label: 'Awaiting payment', what: 'Order and proof are in. Nothing is reserved yet.' },
        { label: 'Paid', what: 'You confirmed the payment. Capacity, bake plan and grocery now count it.' },
        { label: 'Ready', what: 'Packed, boxed and waiting for collection.' },
        { label: 'Collected', what: 'Handed over or picked up by their courier.' },
        { label: 'No-show', what: 'Nobody came. They stay paid and the cookies go back into stock.' },
        { label: 'Cancelled', what: 'Rejected proof or a refunded order. You can reopen it if they re-send.' }
      ],
      users: [
        { name: 'Cine To', role: 'Owner', tone: 'brand', can: 'Everything, including P&L, costs and margins', extra: '' },
        { name: 'Kristian', role: 'Helper', tone: 'info', can: 'Orders, sales, inventory, counts, bazaar', extra: 'No costs, expenses or profit anywhere in the app' },
        { name: 'Ethan', role: 'Helper', tone: 'info', can: 'Orders, sales, inventory, counts, bazaar', extra: 'No costs, expenses or profit anywhere in the app' },
        { name: 'Cervo', role: 'Temporary', tone: 'mute', can: 'Bazaar sales only · expires ' + dateText(this.cycle(s).sun + 7 * DAY), extra: 'Revoke any time' },
        { name: 'Misty', role: 'Temporary', tone: 'mute', can: 'Bazaar sales only · expires ' + dateText(this.cycle(s).sun + 7 * DAY), extra: 'Revoke any time' },
        { name: 'KETH AI Support', role: 'Support', tone: 'mute', can: 'System health, backups, error logs, exports', extra: 'No customer or financial browsing' }
      ].map(u => Object.assign({}, u, { bg: this.TONE[u.tone].bg, fg: this.TONE[u.tone].fg, br: this.TONE[u.tone].br })),
      healthRows: (function (self, st) {
        const T = self.pnlTotals(st);
        const led = st.ledger || [];
        const bad = led.filter(e => !e.kind || !e.cat || typeof e.amount !== 'number' || isNaN(e.amount)).length;
        const negStock = st.inv.filter(i => i.qty < 0).length;
        const orphanCat = led.filter(e => e.kind === 'expense' && st.categories.indexOf(e.cat) < 0).length;
        const nextBackup = atTime(st.now + DAY, 2, 0);
        return [
          { label: 'Automatic backup', value: st.backup === 'ok' ? 'Completed ' + relWhen(st.backupAt, st.now) : 'Failed ' + relWhen(st.backupAt, st.now),
            bad: st.backup !== 'ok',
            hint: st.backup === 'ok' ? 'Next backup ' + dowName(nextBackup) + ' ' + clockText(nextBackup) + '.' : 'Your data is still here on this device. The off-device copy could not be completed.',
            retry: st.backup !== 'ok' },
          { label: 'Saved on this device', value: st.savedAt ? 'Saved ' + relWhen(st.savedAt, st.now) : 'Saving as you work',
            bad: !!self._storageBlocked,
            hint: self._storageBlocked
              ? 'This device is blocking storage, so nothing will survive a reload. Check your browser privacy settings.'
              : 'Orders, stock, recipes, expenses and your rules stay here between visits. A backup is what protects you if the device is lost.',
            retry: false },
          { label: 'Bazaar sync', value: st.unsynced > 0 ? plural(st.unsynced, 'sale', 'sales') + ' waiting' : 'Up to date',
            bad: st.unsynced > 0,
            hint: st.unsynced > 0 ? 'Sales are saved on the phone that recorded them. Nothing is lost.' : 'Everything recorded on this phone has been sent.',
            retry: false },
          { label: 'Books balance', value: bad + orphanCat === 0 ? plural(led.length, 'record', 'records') + ' \u00b7 all traceable' : (bad + orphanCat) + ' need a look',
            bad: bad + orphanCat > 0,
            hint: bad + orphanCat === 0
              ? 'Every peso in the P&L (' + PESO(T.revenue) + ' in, ' + PESO(T.totalExp) + ' out) comes from a record you can open.'
              : 'Some records have no category or no amount. Open the P&L and correct them.',
            retry: false },
          { label: 'Stock sanity', value: negStock ? plural(negStock, 'item is', 'items are') + ' below zero' : 'Nothing below zero',
            bad: negStock > 0,
            hint: negStock ? 'A count or deduction went wrong. Do a stocktake on those items.' : 'No item has been deducted past what you had.',
            retry: false },
          { label: 'Data export', value: 'Export any time', bad: false, hint: 'Orders, inventory, ledger and expenses as a spreadsheet, so nothing is locked in here.', retry: false }
        ];
      })(this, s).map(h => Object.assign({}, h, { good: !h.bad })),
      recordGroups: [
        { title: 'Weekly counts', rows: (s.countLog || []).slice().reverse().map(c => ({ what: c.corrected ? c.corrected + ' of ' + c.items + ' corrected' : 'All ' + c.items + ' matched', when: c.cat + ' · ' + relWhen(c.at, s.now), value: c.value ? (c.value < 0 ? '−' + PESO(Math.abs(c.value)) : '+' + PESO(c.value)) : 'Nil' })) },
        { title: 'Waste written off', rows: (s.spoilage || []).slice().reverse().map(x => ({ what: x.qty + ' × ' + x.name, when: x.why + ' · ' + relWhen(x.at, s.now), value: PESO(x.cost) })) },
        { title: 'Ran short mid-bake', rows: (s.shortfalls || []).slice().reverse().map(x => ({ what: x.name + ' short by ' + x.by + x.unit, when: x.when + ' · ' + relWhen(x.at, s.now), value: 'Logged' })) },
        { title: 'Yield against plan', rows: (s.variances || []).slice().reverse().map(v => ({ what: P[v.pid].short, when: (v.rejects ? v.rejects + ' rejected · ' : '') + relWhen(v.at, s.now), value: (v.actual - v.target >= 0 ? '+' : '') + (v.actual - v.target) })) },
        { title: 'Closed drops', rows: s.ledger.filter(e => e.kind === 'revenue' && e.cat === 'Drops' && e.drop).slice().reverse().map(d => ({ what: d.label.split(' · ')[0], when: d.label.split(' · ').slice(1).join(' · ') + ' · ' + relWhen(d.at, s.now), value: PESO(d.amount) })) }
      ].filter(g => g.rows.length).map(g => Object.assign({}, g, { countText: plural(g.rows.length, 'entry', 'entries') })),
      hasRecords: [(s.countLog || []), (s.spoilage || []), (s.shortfalls || []), (s.variances || []), s.ledger.filter(e => e.drop)].some(a => a.length > 0),
      healthOk: s.backup === 'ok' && s.unsynced === 0,
      healthTitle: s.backup === 'ok' && s.unsynced === 0 ? 'Healthy' : 'Needs attention',
      healthSub: s.backup === 'ok' && s.unsynced === 0
        ? 'Backups, sync and this device are all in step.'
        : 'Backup needs attention. Last successful backup was ' + relWhen(s.backupAt, s.now) + '.',
      retryBackup: this.retryBackup,
      exportNow: () => this.exportBooks(),
      contactSupport: () => this.toast('Message sent to KETH AI support with your error log attached.'),
      notifEmpty: this.notifs(s).filter(n => !(s.notifRead || {})[n.label]).length === 0,
      notifAny: this.notifs(s).filter(n => !(s.notifRead || {})[n.label]).length > 0,
      notifDismissed: this.notifs(s).filter(n => (s.notifRead || {})[n.label]).length > 0,
      notifDismissedText: plural(this.notifs(s).filter(n => (s.notifRead || {})[n.label]).length, 'notification', 'notifications') + ' dismissed',
      clearNotifs: () => { const r = {}; this.notifs(s).forEach(n => { r[n.label] = true; }); this.setState({ notifRead: r }); this.toast('Cleared. They come back if the underlying problem is still there.'); },
      restoreNotifs: () => this.setState({ notifRead: {} }),
      notifications: this.notifs(s).filter(n => !(s.notifRead || {})[n.label]).map(n => ({
        label: n.label, sub: n.sub, urgency: n.urgency, go: n.go,
        dismiss: () => this.setState(st => { const r = Object.assign({}, st.notifRead || {}); r[n.label] = true; return { notifRead: r }; }),
        bg: this.TONE[n.tone].bg, fg: this.TONE[n.tone].fg, br: this.TONE[n.tone].br,
        icon: n.tone === 'bad' ? this.IC.alert : n.tone === 'warn' ? this.IC.clock : this.IC.check
      })),
      channels: Object.keys(s.channels).map(k => ({
        label: k, on: !!s.channels[k], off: !s.channels[k], stateText: s.channels[k] ? 'On' : 'Off',
        toggle: () => this.toggleChannel(k)
      })),
      productRows: PRODUCTS.map(p => ({
        name: p.short, menuName: p.name, imgStyle: thumb(p.img, 58, 12, true),
        priceText: PESO(this.priceOf(p.id)), desc: p.desc, kind: p.kind, tag: p.tag,
        rotating: p.kind === 'Rotating',
        soldOut: !!s.soldOut[p.id],
        offForm: s.dropActive[p.id] === false,
        formLabel: s.dropActive[p.id] !== false ? 'Take ' + P[p.id].short + ' off the order form' : 'Put ' + P[p.id].short + ' back on the order form',
        formIcon: s.dropActive[p.id] !== false ? this.IC.eye : this.IC.eyeOff,
        formBtnStyle: 'width: 44px; height: 44px; flex-shrink: 0; border-radius: 11px; display: grid; place-items: center; border: 1px solid '
          + (s.dropActive[p.id] !== false ? '#E7E1DC' : '#F2CFCB')
          + '; background: ' + (s.dropActive[p.id] !== false ? '#FFFFFF' : '#FCECEA')
          + '; color: ' + (s.dropActive[p.id] !== false ? '#6E574B' : '#A8231B'),
        toggleOnForm: () => this.toggleDropProduct(p.id),
        costText: PESO2(this.unitCost(p.id)) + ' cost',
        edit: () => this.sheet('editPrice', { pid: p.id, name: p.short, qty: this.priceOf(p.id) }),
        goRecipe: () => { this.openRecipe(p.id); this.go('recipes'); },
        preview: () => this.go('shop')
      }))
    };
  }

  // =========== customer ===========
  custVals(s, hint) {
    const c = s.cust;
    const n = Object.keys(c.box).reduce((t, k) => t + c.box[k], 0);
    const boxes = Math.floor(n / 6);
    const inBox = n % 6;
    const total = n ? this.boxTotal(c.box) : 0;
    const ds = this.shopState(s);
    const cyc = this.cycle(s);
    const open = ds === 'open' || ds === 'soon';
    const err = k => c.errors[k] || '';
    const nextOpenText = dowName(cyc.nextOpen) + ' at ' + clockText(cyc.nextOpen);
    const banner = {
      open: ['ok', 'Orders are open', 'Closing ' + dowName(cyc.close) + ' ' + clockText(cyc.close) + ' · baking this weekend'],
      soon: ['warn', 'Closing ' + (isSameDay(cyc.close, s.now) ? 'tonight' : dowName(cyc.close)), 'Last orders at ' + clockText(cyc.close) + ' · ' + spanText(cyc.close - s.now) + ' left'],
      closed: ['mute', 'Orders are closed', 'The next drop opens ' + nextOpenText],
      soldout: ['bad', 'This drop is sold out', 'All ' + this.capacityOf() + ' cookies are spoken for. Next drop ' + nextOpenText]
    }[ds];
    const bt = this.TONE[banner[0]];
    const order = s.orders.filter(o => o.id === c.orderNo)[0];
    const slots = [0, 1, 2, 3, 4, 5];
    const filled = [];
    Object.keys(c.box).forEach(k => { for (let i = 0; i < c.box[k]; i++) filled.push(k); });
    return {
      dropStates: [
        { id: 'open', label: 'Open' }, { id: 'soon', label: 'Closing soon' }, { id: 'closed', label: 'Closed' }, { id: 'soldout', label: 'Sold out' }
      ].map(d => ({ label: d.label, on: ds === d.id, go: () => this.setState({ shopOverride: d.id }) })),
      dropOpen: open,
      dropBannerBg: bt.bg, dropBannerFg: bt.fg, dropBannerBr: bt.br,
      dropBannerTitle: banner[1], dropBannerSub: banner[2],
      shopFlavours: PRODUCTS.filter(p => s.dropActive[p.id] !== false).map(p => {
        const so = !!s.soldOut[p.id] || ds === 'soldout';
        const q = c.box[p.id] || 0;
        return {
          name: p.short, desc: p.desc, imgStyle: thumb(p.img, 76, 14, true),
          allergens: 'Contains ' + ALLERGENS[p.id],
          priceText: PESO(this.priceOf(p.id)), qty: q, picked: q > 0,
          kind: p.kind === 'Rotating' ? 'This month only' : p.tag,
          soldOut: so, available: !so && open,
          minus: () => this.custAdd(p.id, -1), plus: () => this.custAdd(p.id, 1)
        };
      }),
      pickedItems: Object.keys(c.box).map(pid => ({
        imgStyle: thumb(P[pid].img, 32, 999, true),
        name: P[pid].short, qty: c.box[pid] + '×',
        remove: () => this.custAdd(pid, -1)
      })),
      boxCount: n, boxesReady: boxes, inBox,
      boxCountText: plural(n, 'cookie', 'cookies') + ' picked',
      boxProgressText: n === 0 ? 'Nothing picked yet'
        : plural(Object.keys(c.box).length, 'flavour', 'flavours') + ' \u00b7 packed to keep them whole',
      boxTotalText: PESO(total),
      priceNote: this.priceNote(),
      boxTitle: n === 0 ? 'Your order' : plural(n, 'cookie', 'cookies'),
      boxReady: n > 0,
      boxCta: n === 0 ? 'Pick your cookies' : 'Continue · ' + PESO(total),
      custToCheckout: this.custToCheckout,
      custHintBox: hint === 'box', custHintDetails: hint === 'details',
      openCustomer: () => this.go('shop', { hint: 'shop' }),
      backToShop: () => this.go('shop'),
      goBackOwner: () => this.go('today'),
      openLookup: () => this.go('lookup'),
      lookupQ: s.lookupQ,
      setLookupIn: e => this.setLookup(e.target.value),
      runLookup: this.runLookup,
      lookupMissed: s.lookupTried && !s.orders.some(o => this.normRef(o.id) === this.normRef(s.lookupQ) || this.normRef(o.ref) === this.normRef(s.lookupQ) || this.normRef(o.email) === this.normRef(s.lookupQ)),

      cust: {
        name: c.name, mobile: c.mobile, email: c.email, ig: c.ig, ref: c.ref, window: c.window, pay: c.pay,
        lines: Object.keys(c.box).map(k => ({ name: P[k].short, imgStyle: thumb(P[k].img, 32, 8, true), qty: c.box[k] + '×', line: PESO(this.priceOf(k) * c.box[k]) })),
        countText: plural(n, 'cookie', 'cookies'),
        totalText: PESO(total), priceNote: this.priceNote(),
        setName: e => this.custSet('name', e.target.value),
        setMobile: e => this.custSet('mobile', e.target.value),
        setEmail: e => this.custSet('email', e.target.value),
        setIg: e => this.custSet('ig', e.target.value),
        setRef: e => this.custSet('ref', e.target.value),
        setSender: e => this.custSet('sender', e.target.value),
        setAmount: e => this.custSet('amount', e.target.value),
        sender: c.sender, amount: c.amount,
        errSender: err('sender'), errAmount: err('amount'),
        refHint: c.pay ? 'The ' + (({ 'GCash': '10–13 digit', 'Maya': '', 'GoTyme': '', 'Bank transfer': 'InstaPay' })[c.pay] || '') + ' reference on your ' + c.pay + ' receipt' : 'Pick how you paid first',
        amountHint: 'Should match ' + PESO(total) + ' exactly',
        errName: err('name'), errMobile: err('mobile'), errEmail: err('email'),
        errRef: err('ref'), errWindow: err('window'), errPay: err('pay'), errProof: err('proof'),
        windows: this.windows(s).map(w => {
          const booked = s.orders.filter(o => this.inDrop(s, o) && this.RECOGNISED.indexOf(o.status) >= 0).reduce((t, o) => t + orderCount(o), 0);
          return { label: w.label, time: w.time, left: Math.max(0, this.capacityOf() - booked) + ' slots left', on: c.window === w.id, pick: () => this.custSet('window', w.id) };
        }),
        methods: PAY_ACCOUNTS.map(m => ({ label: m.id, num: m.num, holder: m.name, on: c.pay === m.id, pick: () => this.custSet('pay', m.id) })),
        qr: (function (pick) {
          return pick ? 'width: 190px; height: 190px; border-radius: 12px; border: 1px solid #EADCC4; background: #FFFFFF url(' + RES(pick.qr) + ') center/contain no-repeat' : '';
        })(PAY_ACCOUNTS.filter(m => m.id === c.pay)[0]),
        noQr: !c.pay,
        qrTitle: 'Scan with ' + (c.pay || 'your app'),
        qrNote: 'Open ' + (c.pay || 'your app') + ', scan this, send exactly ' + PESO(this.boxTotal(c.box, s.prices)) + ', then attach the screenshot below.',
        payPicked: !!c.pay,
        proofNone: c.proof === 'none', proofUploading: c.proof === 'uploading', proofDone: c.proof === 'done',
        upload: this.custUpload, removeProof: () => this.custSet('proof', 'none'),
        submit: this.custSubmit,
        hintProof: hint === 'proof', hintSubmit: hint === 'submit',
        orderNo: c.orderNo || '—',
        windowText: this.windowText(s, c.window || 'mon', true),
        statusStage: order ? (this.STATUS_LABEL[order.status] || order.status) : 'Awaiting payment',
        confirmed: order ? this.RECOGNISED.indexOf(order.status) >= 0 : false,
        restart: this.custRestart,
        reorder: this.custReorder,
        copyLink: () => this.toast('Link copied.'),
        st: (order ? order.status : 'Payment review'),
        isReview: !order || order.status === 'Payment review',
        isPaid: !!order && ['Confirmed', 'Preparing'].indexOf(order.status) >= 0,
        isReady: !!order && order.status === 'Ready',
        isCollected: !!order && order.status === 'Completed',
        isStopped: !!order && ['Cancelled', 'No-show'].indexOf(order.status) >= 0,
        wasRejected: !!order && !!order.rejected,
        wasRefunded: !!order && !!order.refunded,
        heroTitle: !order || order.status === 'Payment review' ? 'Order received'
          : order.status === 'Cancelled' ? (order.rejected ? 'We could not verify your payment' : 'Order cancelled')
          : order.status === 'No-show' ? 'You missed your slot'
          : order.status === 'Ready' ? 'Your box is ready'
          : order.status === 'Completed' ? 'Collected — thank you'
          : 'Payment confirmed',
        heroBody: !order || order.status === 'Payment review'
          ? 'We have your order and your payment proof. Your order is confirmed after Cine verifies it.'
          : order.status === 'Cancelled' && order.rejected
            ? 'The reference or the screenshot did not match. Nothing was charged by us. Send the payment again and Cine will recheck it.'
            : order.status === 'Cancelled'
              ? 'This order is cancelled. Your refund has been sent back to the account you paid from.'
              : order.status === 'No-show'
                ? 'Nobody collected during your window. Message Cine on Instagram and she will sort out a new slot.'
                : order.status === 'Ready'
                  ? 'Packed and waiting. Show your pickup code at collection.'
                  : order.status === 'Completed'
                    ? 'Enjoy them. If something was not right, message Cine and she will make it good.'
                    : 'Payment verified. Your cookies are in this weekend’s bake.',
        showRetry: !!order && order.status === 'Cancelled' && !!order.rejected,
        pickupCode: order ? order.id.replace('HC-', '') + '-' + order.name.trim().charAt(0).toUpperCase() : '—',
        showCode: !!order && ['Confirmed', 'Preparing', 'Ready'].indexOf(order.status) >= 0,
        canCancel: !!order && ['Payment review', 'Confirmed'].indexOf(order.status) >= 0 && !order.cancelRequested,
        cancelPending: !!order && !!order.cancelRequested,
        requestCancel: this.custRequestCancel,
        invoiceLine: order && order.invoice ? 'Invoice ' + order.invoice + ' · ref ' + order.ref : '',
        allergenNote: 'Contains milk, eggs, wheat and soy. Peanut Butter Miso contains peanuts and Nutella Churro contains tree nuts. Baked in a kitchen that handles all of these.',
        timeline: (function (self, o) {
          const st = o ? o.status : 'Payment review';
          const at = k => ['Confirmed', 'Preparing', 'Ready', 'Completed'].indexOf(st) >= k;
          if (st === 'Cancelled') return [
            { what: 'Order received', sub: 'Your order and proof reached us', done: true, now: false },
            { what: o && o.rejected ? 'Payment could not be verified' : 'Cancelled and refunded', sub: o && o.rejected ? 'Send the payment again to restart this order' : 'Refunded to the account you paid from', done: false, now: true }
          ];
          return [
            { what: 'Order received', sub: 'We have your order and your payment proof', done: true, now: false },
            { what: at(0) ? 'Payment verified' : 'Payment verification', sub: at(0) ? 'Confirmed by Cine' : 'Cine checks every payment by hand', done: at(0), now: !at(0) },
            { what: 'Baking', sub: at(1) ? 'In the oven this weekend' : 'This weekend', done: at(1), now: at(0) && !at(1) },
            { what: 'Ready for pickup', sub: at(2) ? 'Show your pickup code at collection' : 'We send the exact address the morning of your slot', done: at(2), now: at(1) && !at(2) },
            { what: st === 'No-show' ? 'Missed collection' : 'Collected', sub: st === 'No-show' ? 'Message Cine for a new slot' : at(3) ? 'Thank you' : 'During your window', done: at(3), now: st === 'No-show' }
          ];
        })(this, order)
      }
    };
  }
}

/** Provides the render values to the tree, exactly as the prototype's template read them. */
export class OpsProvider extends OpsEngine {
  render() {
    return React.createElement(
      OpsEngineContext.Provider,
      { value: this },
      React.createElement(OpsContext.Provider, { value: this.renderVals() }, this.props.children)
    );
  }
}

OpsProvider.defaultProps = {
  boxPricing: 'Sum of menu prices',
  packagingFee: 38.44,
  flatBoxPrice: 860,
  capacity: 200,
  showFlowStrip: true
};

export {
  PESO, PESO2, plural, amt, amtExact, packPhrase, packWord,
  clockText, dateText, longDateText, shortWhen, relWhen, spanText, startOfDay, atTime, isSameDay,
  dropCycle, windowsFor, DEFAULT_CFG, RETENTION_DAYS,
  PRODUCTS, P, SEED_PRICES, RECIPES, INVENTORY, SUPPLIERS, PACK_SIZE, BEST_BUY, OPTIONS_FOR,
  USE_BY_DAYS, ALLERGENS, ROLES, PAY_ACCOUNTS, PRIOR_MONTHS, RAW_ORDERS, SEED_LEDGER,
  SCREENS, CUSTOMER_SCREENS, SCREEN_NAMES, FLOWS, orderCount, itemSummary,
  BASE_STATE, loadState, STORE_KEY, EPHEMERAL, MINUTE, HOUR, DAY
};
