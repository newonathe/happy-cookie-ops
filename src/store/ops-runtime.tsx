'use client';

import {
  ALLERGENS,
  BASE_STATE,
  DEFAULT_CFG,
  OpsProvider,
  PESO,
  PRODUCTS,
  replaceFlavours,
  replacePayAccounts
} from '@/store/engine/ops-engine';
import type { EventSale, OpsEngineProps, OpsEngineState, Role } from '@/store/engine/ops-engine';
import { idb } from '@/lib/offline/idb';
import {
  fetchOperationsHealth,
  healthView,
  HEALTH_REFRESH_MS,
  SETUP_PENDING_COPY,
  type HealthPhase,
  type LiveAlert,
  type OperationsClient,
  type OperationsHealth
} from '@/lib/data/operations-health';
import {
  defaultSalesClient,
  flushQueue,
  requestBackgroundSync,
  type FlushResult
} from '@/lib/offline/sync';
import {
  allSales,
  clientIdFor,
  commandKey,
  enqueueCommand,
  enqueueVoid,
  isSaleKey,
  pendingSales,
  type CommandKind
} from '@/lib/offline/queue';
import { clearBazaar, readBazaar, saveBazaar } from '@/lib/offline/bazaar-state';
import { isEventUuid, startEventOnServer, type EventSalesClient } from '@/lib/data/event-sales';
import { deviceId } from '@/lib/device';
import { plural } from '@/store/engine/ops-engine';
import type {
  LiveFlavourFormFields,
  LiveOrderExtrasFields,
  LiveOrderRulesFields,
  LiveScheduledRow,
  LiveStockItemEdit,
  LiveStockPriceRow,
  LiveStockSupplierEdit,
  LiveRecipeDraftEdit,
  LivePayFormFields,
  LiveShopTexts,
  OpsVals
} from '@/view-models/vals';
import { PaymentSync } from '@/lib/data/payment-sync';
import {
  EXTRAS_KEY,
  StaffOrderSync,
  type StaffOrderClient,
  type StaffOutcome
} from '@/lib/data/staff-orders';
import { messagesFor, statusLink } from '@/lib/orders/messages';
import { extraDetails, extraRows } from '@/lib/orders/extras-view';
import {
  fetchShopStatus,
  saveShopOverride,
  type ShopOverride,
  type ShopStatusClient
} from '@/lib/data/shop-status';
import {
  fetchOrderRules,
  orderRulesError,
  saveOrderRules,
  type OrderRulesRow
} from '@/lib/data/order-rules';
import {
  LINE_SEP,
  addOnId,
  fetchOrderExtras,
  orderExtrasError,
  saveOrderExtras,
  type OrderExtras,
  type OrderExtrasFields
} from '@/lib/data/order-extras';
import {
  dateRange,
  fetchScheduledEvents,
  linkScheduledEvent,
  saveScheduledEvent,
  scheduledEventError,
  upcomingEvents,
  type ScheduledClient,
  type ScheduledEvent
} from '@/lib/data/scheduled-events';
import {
  EXTRAS_COPY,
  MESSAGE_SHEET,
  RULES_COPY,
  SCHEDULED_COPY,
  RECIPE_COPY,
  STAFF_COPY,
  PRODUCTION_COPY,
  BOOKS_COPY,
  STOCK_COPY
} from '@/lib/orders/staff-copy';
import {
  engineRecipes,
  fetchRecipes,
  recipeError,
  saveRecipe,
  type Recipe,
  type RecipeClient
} from '@/lib/data/recipes';
import { fetchRecipeDrafts, saveRecipeDraft, type RecipeDraft } from '@/lib/data/recipe-drafts';
import {
  engineInventory,
  fetchStockCatalogue,
  itemError,
  priceError,
  saveStockItem,
  saveSupplier,
  saveSupplierPrice,
  supplierError,
  type ItemFields,
  type PriceFields,
  type StockCatalogue,
  type StockClient
} from '@/lib/data/stock-catalogue';
import {
  currentSuppliers,
  firstSupplierName,
  fillDemoCatalogue,
  fillLiveCatalogue
} from '@/lib/data/engine-catalogue';
import type { SaveOutcome } from '@/lib/data/payments';
import {
  enginePaid,
  fetchLastPaid,
  movementError,
  recordStockMovement,
  type LedgerClient,
  type MovementFields
} from '@/lib/data/stock-ledger';
import {
  engineProduction,
  fetchProduction,
  productionError,
  discardError,
  recordDiscard,
  recordPack,
  recordProduction,
  type DiscardFields,
  type ProductionClient,
  type Production,
  type ProductionFields,
  type ProductionResult
} from '@/lib/data/production';
import {
  booksCsv,
  correctionError,
  drawError,
  engineLedger,
  expenseError,
  fetchBooks,
  recordCostCorrection,
  recordDraw,
  recordExpense,
  saveCostBasis,
  unpaidOrders,
  type Books,
  type BooksClient,
  type CorrectionFields,
  type DrawFields,
  type ExpenseFields
} from '@/lib/data/books';
import { OrderFlow } from '@/lib/data/order-flow';
import { tokenFromHash, type FieldErrors, type OrderClient } from '@/lib/data/orders';
import { pickupLabel, statusCust } from '@/lib/orders/status-view';
import { ORDER_COPY } from '@/lib/orders/copy';
import {
  manilaMinutes,
  manilaToday,
  pickupDates,
  pickupTimes,
  waitlistRange
} from '@/lib/orders/pickup';
import { EMPTY_TEXTS, type PaymentClient, type UploadClient } from '@/lib/data/payments';
import { resolveImagePath } from '@/lib/media/resolve-image';
import { isLiveMode } from '@/lib/config/app-mode';
import { clearStoredBooks, liveBaseState } from '@/lib/data/live-state';
import { STATE_LEVEL_KEYS, type SettingsClient } from '@/lib/data/settings';
import { SettingsSync } from '@/lib/data/settings-sync';
import { centavosFromDb, centavosToPesos, pesosToCentavos } from '@/lib/money';
import {
  FLAVOUR_TOASTS,
  FlavourSync,
  catalogueStatePatch,
  engineCatalogue,
  fetchShopFlavours,
  flavourFieldError,
  flavourStatePatch,
  priceCents,
  shopCatalogue,
  slugifyFlavourId,
  type FlavourEdit,
  type FlavourFields,
  type FlavoursClient,
  type ShopClient,
  type ShopFlavourRow
} from '@/lib/data/flavours';
import { CUSTOMER_SCREENS, type ScreenKey } from '@/lib/screens';
import { helperMoneyView } from '@/lib/auth/helper-money';
import {
  IDLE_MINUTES_MAX,
  IDLE_MINUTES_MIN,
  IDLE_SETTING_KEYS,
  idleMinutesFor
} from '@/lib/auth/idle-signout';

/**
 * The engine, with the one simulated behaviour replaced by the real one.
 *
 * The prototype faked bazaar sync with a timeout — deliberately, so the owner could see
 * what a partial sync looks like. Here it is the actual IndexedDB queue talking to
 * the record_event_sale / void_event_sale RPCs. The user-facing copy is unchanged: the same sentences fire on the same
 * outcomes, because those sentences were signed off.
 *
 * Everything else is inherited from the port untouched. Overriding here rather than
 * editing the port keeps the port diffable against the prototype.
 */
const HARNESS = process.env.NEXT_PUBLIC_HARNESS !== '0';

export type Device = 'mobile' | 'tablet' | 'desktop';

/**
 * The live app picks the prototype's own layout for the screen it is on: the phone design
 * (375–430 px) below 768 px, the tablet design (834 px, side rail) below 1200 px, and the
 * desktop design (1280 px, rail plus split columns) above. Width only — never the user agent.
 */
export function deviceForWidth(width: number): Device {
  if (width < 768) return 'mobile';
  if (width < 1200) return 'tablet';
  return 'desktop';
}

/**
 * DP-15's owner-editable idle minutes (MP-09 b2): three extra rows for the ported rules
 * sheet, which maps over `v.rules`, so no protected markup changes. Live owner only; the
 * locked-UI exception is recorded in docs/state/protected-exception.md.
 */
/** `state.sheet` while the flavour editor (MP-09 c1c) is open; every other key is untyped. */
type FlavourSheetState = {
  kind?: string;
  pid?: string;
  isNew?: boolean;
  updatedAt?: string | null;
};

const IDLE_ROWS: Array<{ role: Role; label: string }> = [
  { role: 'owner', label: 'Sign Cine out after' },
  { role: 'support', label: 'Sign support out after' },
  { role: 'helper', label: 'Sign helpers out after' }
];

/** The customer form fields `state.cust` holds in live mode (B2). */
type CustFields = {
  name?: string;
  ig?: string;
  mobile?: string;
  pay?: string;
  ref?: string;
  pickupDate?: string;
  pickupTime?: string;
  box?: Record<string, number>;
};

/** Which refusal a `state.cust` key clears when the customer edits it. */
const FIELD_FOR_CUST_KEY: Record<string, keyof FieldErrors> = {
  name: 'name',
  ig: 'ig',
  mobile: 'mobile',
  pickupDate: 'date',
  pickupTime: 'time',
  pay: 'pay'
};

/** An empty checkout, the shape the ported `custRestart` resets to. */
const BLANK_CUST = {
  name: '',
  mobile: '',
  email: '',
  ig: '',
  window: 'mon',
  pay: '',
  ref: '',
  sender: '',
  amount: '',
  proof: 'none',
  errors: {},
  orderNo: ''
};

/** The engine's bazaar actions are instance fields the typings do not list; wrapped below. */
interface BazaarActions {
  recordSale: (pay: string, freebie?: boolean) => void;
  voidSale: (id: string) => void;
  startEvent: (ev: { name: string; date: string }) => void;
  setEventPrice: (pid: string, value: unknown) => void;
  setEventStock: (pid: string, d: number) => void;
  openSelling: () => void;
  addEventExpense: (label: string, amount: unknown, cat?: string) => void;
  closeEvent: () => void;
  reopenEvent: () => void;
}

/** The engine's inventory actions (instance fields the typings do not list), replaced in live mode by A3. */
interface InvActions {
  addInv: (
    cat: string,
    name: string,
    qty: unknown,
    unit: string,
    level: unknown,
    supplier: string
  ) => void;
  removeInv: (name: string) => void;
  saveInv: (name: string, qty: unknown) => void;
  adjustInv: (name: string, qty: unknown, dir: number) => void;
  logSpoilage: (name: string, qty: unknown, why: string, pid?: string, kind?: string) => void;
  reconcile: () => void;
  countInput: (name: string, v: string) => void;
  startStocktake: () => void;
  confirmReceive: (
    e: { preventDefault: () => void; target: unknown },
    item: { name: string; supplier: string; key: string; add: number }
  ) => void;
  addExpense: (
    cat: string,
    label: string,
    amount: unknown,
    itemName?: string,
    itemQty?: unknown
  ) => void;
  costPerUnit: (name: string) => number;
}

/** The engine's confirm actions for dough and baking (instance fields the typings do not list), replaced in live mode by C2. */
interface ProductionActions {
  confirmDough: () => void;
  confirmBatch: () => void;
}

/** The parts of `state` the production actions read. */
interface ProductionState {
  dropNo: number;
  recipeVer: Record<string, number>;
  doughPrep: { pid: string; balls: number } | null;
  batch: {
    pid: string;
    target: number;
    actual: number;
    rejects?: number;
    adj?: Record<string, number>;
  } | null;
}

/** The engine's recipe save (an instance field the typings do not list), replaced in live mode by A4. */
interface RecipeActions {
  recipeSave: (pid: string) => void;
}

/** The parts of `state` the recipes screen keeps, as the runtime reads them. */
interface RecipeState {
  recipes: Record<string, { yield: number; ing: Array<[string, unknown, string]> }>;
  recipeDirty?: Record<string, boolean>;
}

/** `state.sheet` while an A3 stock form is open. */
type StockSheetState = { kind?: string; id?: string; isNew?: boolean };

/** The engine's own order actions, replaced in live mode by the ones that ask the database (B3). */
interface OrderActions {
  confirmPayment: (id: string, force?: boolean) => void;
  rejectPayment: (id: string) => void;
  reopenOrder: (id: string) => void;
  refundOrder: (id: string, ref?: string) => void;
  noShow: (id: string) => void;
  recordBalance: (id: string) => void;
  flagLine: (id: string, pid: string) => void;
  replaceLine: (id: string, from: string, to: string) => void;
  clearContact: (id: string) => void;
  packOrder: (id: string) => void;
  collectOrder: (id: string) => void;
  markBaking: (pid: string, s0?: { orders: unknown[] }) => unknown[];
  demand: (pid: string) => number;
  demandDay: (pid: string, day: string) => number;
  inDrop: (s: unknown, o: unknown) => boolean;
}

/** The engine's total is an instance field the typings do not list; replaced in live mode (B4b). */
interface TotalActions {
  boxTotal: (items: Record<string, number>, priced?: Record<string, number>) => number;
  priceOf: (pid: string, priced?: Record<string, number>) => number;
}

/** The orders the bake list counts: unpaid ones too, because Cine bakes before she is paid (28 Sep). */
const BAKED_FOR = ['Payment review', 'Confirmed', 'Preparing'];

interface LiveEvent {
  id?: string;
  stage?: string;
  snapshot?: string[];
  closedAt?: number;
}

/** Whole, positive counts of the flavours the server knows for this event. */
function stockOn(counts: unknown, snapshot: string[] | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [pid, n] of Object.entries((counts ?? {}) as Record<string, unknown>)) {
    const qty = Math.floor(Number(n));
    if (qty > 0 && (!snapshot || snapshot.includes(pid))) out[pid] = qty;
  }
  return out;
}

/**
 * The engine numbers a sale `'S' + (sales.length + 1)`, so a void followed by a new sale
 * reuses an id and the two share it until one is voided (which removes both). Only the newest
 * sale, first in the list, can collide; it takes the next unused number.
 */
function withUniqueNewestId(sales: EventSale[]): EventSale[] | null {
  const newest = sales[0];
  if (!newest || !sales.slice(1).some((sale) => sale.id === newest.id)) return null;
  const highest = sales.reduce((max, sale) => Math.max(max, Number(sale.id.slice(1)) || 0), 0);
  return [{ ...newest, id: 'S' + (highest + 1) }, ...sales.slice(1)];
}

const EVENT_ATTEMPT = 'hc-event-attempt';

/** A start that lost its reply is retried under the same event id, so it cannot open a second event. */
function eventAttemptId(name: string): string {
  try {
    const saved = JSON.parse(localStorage.getItem(EVENT_ATTEMPT) ?? 'null') as {
      name?: string;
      id?: string;
      at?: number;
    } | null;
    if (
      saved &&
      saved.name === name &&
      typeof saved.id === 'string' &&
      Date.now() - (saved.at ?? 0) < 600_000
    )
      return saved.id;
  } catch {
    /* unreadable: start a fresh attempt */
  }
  const id = crypto.randomUUID();
  try {
    localStorage.setItem(EVENT_ATTEMPT, JSON.stringify({ name, id, at: Date.now() }));
  } catch {
    /* private mode: a retry after a lost reply may open a second event */
  }
  return id;
}

function clearEventAttempt(): void {
  try {
    localStorage.removeItem(EVENT_ATTEMPT);
  } catch {
    /* nothing to clear */
  }
}

const PENDING_LINK = 'hc-pending-link';

interface PendingLink {
  scheduledId: string;
  eventId: string;
  rentCents: number;
  at: number;
}

/** `₱2,500`, from centavos. */
function pesoText(cents: number): string {
  return '₱' + centavosToPesos(cents).toLocaleString('en-PH');
}

function readPendingLinks(): PendingLink[] {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_LINK) ?? '[]') as unknown;
    if (!Array.isArray(saved)) return [];
    return saved.filter(
      (l): l is PendingLink =>
        !!l &&
        typeof l.scheduledId === 'string' &&
        typeof l.eventId === 'string' &&
        typeof l.rentCents === 'number' &&
        typeof l.at === 'number' &&
        Date.now() - l.at < 3 * 86_400_000
    );
  } catch {
    return [];
  }
}

function writePendingLinks(links: PendingLink[]): void {
  try {
    if (links.length) localStorage.setItem(PENDING_LINK, JSON.stringify(links));
    else localStorage.removeItem(PENDING_LINK);
  } catch {
    /* private mode: the owner is told, and a later start of the same booking links again */
  }
}

function savePendingLink(link: PendingLink): void {
  writePendingLinks([
    ...readPendingLinks().filter((l) => l.scheduledId !== link.scheduledId),
    link
  ]);
}

function clearPendingLink(link: PendingLink): void {
  writePendingLinks(readPendingLinks().filter((l) => l.scheduledId !== link.scheduledId));
}

/** All tools › Menu and recipes (UX review, proposal 1): what each of the four entries is for. */
const MENU_TOOLS = {
  title: 'Menu and recipes',
  flavours: ' · add, edit and publish',
  products: "Each flavour's price and cost, side by side",
  recipes: 'Measured ingredients, for cost and stock',
  drafts: 'Your original recipe text, as you wrote it'
} as const;

export class OpsRuntime extends OpsProvider {
  /**
   * Where bazaar sales go. Null uses the signed-in browser client, or nothing at all in a
   * build with no backend (sales then stay queued). A test may set it on the instance.
   */
  saleClient: EventSalesClient | null = null;

  private salesTarget(): EventSalesClient | null {
    return this.saleClient ?? defaultSalesClient();
  }

  private stopViewportTracking?: () => void;
  private resetNoticeTimer?: ReturnType<typeof setTimeout>;
  private healthTimer?: ReturnType<typeof setInterval>;
  private settingsSync?: SettingsSync;
  private flavourSync?: FlavourSync;
  private paymentSync?: PaymentSync;
  private orderSync?: StaffOrderSync;
  /** The signed-in (or anonymous) browser client the shop status is read and switched through. */
  private shopClient?: ShopStatusClient;
  private rulesRow: OrderRulesRow | null = null;
  private extrasRow: OrderExtras | null = null;
  /** D4: the owner's bookings (null until read), the client they were read with, the booking being started, and the id the blank form row will use. */
  private scheduledRows: ScheduledEvent[] | null = null;
  private scheduledClient: ScheduledClient | null = null;
  private pendingSchedule: ScheduledEvent | null = null;
  private scheduledNewId = '';
  private scheduledVersion = 0;
  private stockCatalogue: StockCatalogue | null = null;
  private stockClient: StockClient | null = null;
  /** A movement whose answer never came is kept, so repeating it exactly sends the same id and time: the database answers it, never applies it twice. */
  private pendingMovements = new Map<string, MovementFields>();
  /** When each item's count was entered on the open stocktake, so a count is measured at its own moment. */
  private countedAt: Record<string, number> = {};
  /** C2: the client production is read and recorded with, the read in flight, and an action whose answer never came (repeating it reuses its id and time). */
  private productionClient: ProductionClient | null = null;
  private productionLoadSeq = 0;
  private pendingProduction = new Map<string, ProductionFields>();
  private pendingDiscards = new Map<string, DiscardFields>();
  private discardBusy = false;
  /** E1: the client the books are read and written with, the last read, the read in flight, and entries whose answer never came (repeating one reuses its id and time). */
  private booksClient: BooksClient | null = null;
  private booksRows: Books | null = null;
  private booksLoadSeq = 0;
  private operationsClient: OperationsClient | null = null;
  private operationsHealth: OperationsHealth | null = null;
  private operationsPhase: HealthPhase = 'loading';
  private operationsLoadSeq = 0;
  private operationsQueue = -1;
  private pendingExpenses = new Map<string, ExpenseFields>();
  private pendingDraws = new Map<string, DrawFields>();
  private pendingCorrections = new Map<string, CorrectionFields>();
  /** True while one dough mix or batch is being recorded: a second tap on Confirm must not mint a second record. */
  private productionBusy = false;
  /** The last picture of the database applied to `dough`, `baked` and `doughAt`: a later read moves them by what changed on the database, so a change made only on the screen (dough or cookies binned, stall stock) is kept. */
  private lastProduction: Production | null = null;
  private stockNewId = '';
  private stockNewPriceId = '';
  private stockVersion = 0;
  private recipeRows: Recipe[] | null = null;
  private recipeClient: RecipeClient | null = null;
  /** The stamp of each flavour's saved recipe as its screen last showed it: what an edit is saved against. */
  private recipeBaseStamp: Record<string, string | null> = {};
  private recipeLoadSeq = 0;
  private recipeDraftRows: RecipeDraft[] | null = null;
  private recipeDraftLoading = false;
  private recipeDraftBusy = false;
  private recipeDraftError: string | null = null;
  private recipeDraftEditing: LiveRecipeDraftEdit | null = null;
  private recipeDraftSession = 0;
  private recipeDraftLoadSeq = 0;
  private localEventExpense: ((label: string, amount: unknown, cat?: string) => void) | null = null;
  private orderFlow?: OrderFlow;
  /** The last fragment this runtime wrote or adopted, so a link pasted into the tab is told apart. */
  private lastHash = '';

  /**
   * Live mode never shows or stores the demo books (docs/state/G2-plan.md "Slice audit",
   * MP-09 a). `state`/`persist`/`resetData` are instance fields on the protected engine
   * (`persist = flushNow => {...}`), not prototype methods, so `super.persist` does not
   * exist — they are replaced here, after the base class field initialisers have run.
   */
  constructor(props: OpsEngineProps) {
    super(props);
    const bazaar = this as unknown as BazaarActions;
    const { recordSale, voidSale, startEvent } = bazaar;
    bazaar.recordSale = (pay, freebie) => {
      recordSale(pay, freebie);
      this.setState((s: { sales: EventSale[] }) => {
        const sales = withUniqueNewestId(s.sales);
        return sales ? { sales } : null;
      });
    };
    // A void never deletes the queued sale: it queues a void row, and the server settles
    // the pair in either order.
    bazaar.voidSale = (id) => {
      const sale = this.state.sales.find((x: EventSale) => x.id === id);
      voidSale(id);
      if (!sale) return;
      void (async () => {
        await enqueueVoid(clientIdFor({ saleId: sale.id, at: sale.at }));
        await this.reflectQueue();
        if (navigator.onLine) await this.flushSales();
        else await requestBackgroundSync();
      })().catch(() => undefined);
    };
    if (!isLiveMode()) {
      fillDemoCatalogue();
      return;
    }
    // MP-09 c2: live mode never shows the ported demo payment accounts, not even before the read.
    replacePayAccounts([]);
    this.installOrderOverrides();
    this.installShopOverrides();
    // B4b: an order's total is what the server charged: its flavours at the prices it was sold at, plus the
    // add-ons, box charges and same-day extra it carries (`EXTRAS_KEY`). The ported total also applies the demo
    // price mode, packaging fee and flat box price, none of which the server uses. This replaces it in live mode.
    const totals = this as unknown as TotalActions;
    totals.boxTotal = (items, priced) =>
      Object.keys(items).reduce((t, k) => t + totals.priceOf(k, priced) * (items[k] ?? 0), 0) +
      Number(priced?.[EXTRAS_KEY] ?? 0);
    // B2: a live checkout places real orders; the engine's local order list plays no part. The
    // form fields still live in `state.cust`, so the ported setters and reset actions are kept.
    this.custSubmit = () => {
      void this.liveSubmit();
    };
    const { custRestart, custSet } = this;
    this.custRestart = () => {
      this.orderFlow?.resetCheckout();
      custRestart();
    };
    this.custReorder = () => this.liveReorder();
    // While an order is sending, unsettled or placed, the form and the box are locked: "Try again"
    // must send exactly what the customer sees, and a placed order is not edited from this screen.
    const { custAdd } = this;
    this.custAdd = (pid, delta) => {
      if (this.orderFlow?.locked) {
        this.toast(this.orderFlow.placed ? ORDER_COPY.placedLocked : ORDER_COPY.locked, 'warn');
        return;
      }
      custAdd(pid, delta);
    };
    this.custSet = (key, value) => {
      if (this.orderFlow?.locked) return;
      const field = FIELD_FOR_CUST_KEY[key];
      if (field) this.orderFlow?.clearError(field);
      custSet(key, value);
    };
    // DP-20: an event sells at the menu prices it started with, taken by the server.
    bazaar.startEvent = (ev) => {
      void this.startLiveEvent(ev, startEvent);
    };
    bazaar.setEventPrice = () => {
      this.toast('Bazaar prices are the menu prices from the moment the event starts.', 'warn');
    };
    // D2. Only flavours on the event's menu can be put on the table, and the stock load, each
    // expense and the close are queued like sales: kept on the phone, sent when there is signal.
    const { setEventStock, openSelling, addEventExpense, closeEvent } = bazaar;
    // The engine's own function writes only the local books (the list and the close-out screen); the queued
    // override below also sends an expense. The stall rent is booked by the database, so it uses this one.
    this.localEventExpense = addEventExpense;
    bazaar.setEventStock = (pid, d) => {
      const snapshot = (this.state.event as LiveEvent | null)?.snapshot;
      if (d > 0 && snapshot && !snapshot.includes(pid)) {
        this.toast(
          "That flavour is not on this event's menu. The menu is fixed when the event starts.",
          'warn'
        );
        return;
      }
      setEventStock(pid, d);
    };
    bazaar.openSelling = () => {
      openSelling();
      this.afterUpdate(() => {
        const event = this.state.event as LiveEvent | null;
        if (!event || event.stage !== 'selling' || !isEventUuid(event.id)) return;
        const drawer = this.state.drawer as { float?: number } | null;
        void this.queueCommand('open', event.id, commandKey('open', event.id), {
          loaded: stockOn(this.state.eventLoaded, event.snapshot),
          floatCents: pesosToCentavos(Number(drawer?.float) || 0)
        });
      });
    };
    bazaar.addEventExpense = (label, amount, cat) => {
      const text = String(label ?? '').trim();
      const pesos = Number(amount);
      const event = this.state.event as LiveEvent | null;
      if (!text || !(pesos > 0) || !Number.isFinite(pesos) || !isEventUuid(event?.id)) {
        this.toast('Add a label and an amount.', 'warn');
        return;
      }
      const category =
        String(cat || 'Bazaar rent')
          .trim()
          .slice(0, 40) || 'Bazaar rent';
      addEventExpense(text, amount, cat);
      const id = 'expense:' + crypto.randomUUID();
      void this.queueCommand('expense', event.id, id, {
        clientId: id,
        eventId: event.id,
        label: text.slice(0, 80),
        category,
        amountCents: pesosToCentavos(pesos),
        at: Date.now()
      });
    };
    bazaar.closeEvent = () => {
      const before = this.state;
      const counted = (before.drawer as { counted?: unknown } | null)?.counted;
      const pesos = counted === '' || counted == null ? NaN : Number(counted);
      const snapshot = (before.event as LiveEvent | null)?.snapshot;
      const returned = stockOn(before.eventStock, snapshot);
      // The server closes only when it holds the same float and cash, so a close that overtakes
      // a sale or the stock load is retried instead of being booked as a drawer variance.
      const floatCents = pesosToCentavos(
        Number((before.drawer as { float?: unknown } | null)?.float) || 0
      );
      const cashCents = (before.sales as EventSale[])
        .filter((sale) => sale.pay === 'Cash')
        .reduce((sum, sale) => sum + pesosToCentavos(sale.total), 0);
      closeEvent();
      this.afterUpdate(() => {
        const event = this.state.event as LiveEvent | null;
        if (!event || event.stage !== 'closed' || !isEventUuid(event.id)) return;
        void this.queueCommand('close', event.id, commandKey('close', event.id), {
          eventId: event.id,
          at: Number(event.closedAt) || Date.now(),
          countedCents: Number.isFinite(pesos) && pesos >= 0 ? pesosToCentavos(pesos) : null,
          returned,
          floatCents,
          cashCents
        });
      });
    };
    // A closed event stays closed: the server has (or will have) its count and its books.
    bazaar.reopenEvent = () => {
      this.toast('A closed event stays closed. Start a new event for anything after this.', 'warn');
    };
    this.state = liveBaseState();
    // A3: no demo suppliers, prices or pack sizes in the engine's constants until the owner's are read.
    fillLiveCatalogue(null);
    // A4: none of the prototype's recipes either, until the owner's are read (an empty recipe for each flavour).
    Object.assign(
      this.state as unknown as Record<string, unknown>,
      engineRecipes(
        [],
        PRODUCTS.map((p) => p.id)
      )
    );
    // The engine's inventory actions would change only this screen: they go to the database instead.
    const inv = this as unknown as InvActions;
    inv.addInv = (cat, name, qty, unit, level, supplier) =>
      void this.liveAddInv(cat, name, qty, unit, level, supplier);
    inv.removeInv = (name) => void this.liveRemoveInv(name);
    // C1: every change of a quantity is a movement on the database; the screen then shows what the database holds.
    const keep = {
      confirmReceive: inv.confirmReceive,
      addExpense: inv.addExpense,
      logSpoilage: inv.logSpoilage,
      countInput: inv.countInput,
      startStocktake: inv.startStocktake
    };
    inv.saveInv = (name, qty) => void this.liveSaveInv(name, qty);
    inv.adjustInv = (name, qty, dir) => void this.liveAdjustInv(name, qty, dir);
    inv.reconcile = () => void this.liveReconcile();
    inv.startStocktake = () => {
      this.countedAt = {};
      keep.startStocktake();
    };
    inv.countInput = (name, v) => {
      this.countedAt[name] = Date.now();
      keep.countInput(name, v);
    };
    inv.logSpoilage = (name, qty, why, pid, kind) => {
      // Dough and baked cookies thrown away are recorded on the database (C2), so the next bake draws on what is really left.
      if (pid && (kind === 'dough' || kind === 'baked'))
        return void this.liveDiscard(
          () => keep.logSpoilage(name, qty, why, pid, kind),
          qty,
          why,
          pid,
          kind
        );
      if (pid && kind) return keep.logSpoilage(name, qty, why, pid, kind);
      void this.liveWaste(name, qty, why);
    };
    inv.confirmReceive = (e, item) => {
      const target = e.target as { rqty?: { value: string }; rpaid?: { value: string } };
      const got = Number(target.rqty?.value);
      const paid = Number(target.rpaid?.value);
      if (!(got > 0)) return keep.confirmReceive(e, item); // the engine says what is missing
      e.preventDefault();
      // The record first: the engine's own bookkeeping (part deliveries, substitutions, the grocery list) runs only once the
      // database has the delivery, and the screen then shows what the database holds.
      void (async () => {
        if (!(await this.liveReceipt(item.name, got, paid, item.supplier))) return;
        this.withoutUndo(() => keep.confirmReceive(e, item));
        await this.loadStockCatalogue(null);
        await this.loadBooks(null);
      })();
    };
    inv.addExpense = (cat, label, amount, itemName, itemQty) => {
      const item = itemName ? this.stockItem(itemName) : undefined;
      const qty = Number(itemQty) || 0;
      // The engine refuses a form with no category or amount; a plain expense (wages, transport, ...) moves money only, and is a book entry.
      if (!cat || !amount) return keep.addExpense(cat, label, amount, itemName, itemQty);
      // With a stock item named the form is a delivery: the engine says what is missing (how much came in), and nothing is booked.
      if (itemName && (!item || qty <= 0))
        return keep.addExpense(cat, label, amount, itemName, itemQty);
      if (!item)
        return void this.livePlainExpense(
          () => keep.addExpense(cat, label, amount, itemName, itemQty),
          cat,
          label,
          amount
        );
      const supplier =
        this.stockCatalogue?.suppliers.find((x) => x.id === item.supplierId)?.name ?? '';
      void (async () => {
        if (!(await this.liveReceipt(item.name, qty, Number(amount) || 0, supplier))) return;
        this.withoutUndo(() => keep.addExpense(cat, label, amount, itemName, itemQty));
        await this.loadStockCatalogue(null);
        await this.loadBooks(null);
      })();
    };
    // A4: the recipes screen saves to the database (a new version per change), never only to this screen.
    (this as unknown as RecipeActions).recipeSave = (pid) => void this.liveRecipeSave(pid);
    // C2: mixing dough and baking take their ingredients off on the database, in one step, and the screens read the records back.
    this.installProductionOverrides();
    // E1: the P&L, Home profit and the expense list read the database's books; the export writes them.
    this.installBooksOverrides();
    // Not the demo books: only the running bazaar (event id, snapshot prices, stall stock,
    // the day's sales) is kept, so a reload at the stall can carry on selling. The empty
    // start (no event) is never saved, so it cannot overwrite the event before it is read back.
    this.persist = () => saveBazaar(this.state);
    this.resetData = () => {
      clearStoredBooks();
      clearBazaar();
      const fresh = liveBaseState() as Record<string, unknown>;
      Object.keys(this.state).forEach((k) => {
        if (!(k in fresh)) fresh[k] = undefined;
      });
      fresh.device = this.state.device;
      fresh.role = this.state.role;
      fresh.screen = 'today';
      // BASE_STATE() names only the six ported flavours; keep the loaded list's own state.
      const flavours = this.flavourSync?.current() ?? [];
      if (flavours.length) Object.assign(fresh, flavourStatePatch(flavours, fresh));
      // The reset starts again from the prototype's six recipes: the owner's are put back.
      for (const p of PRODUCTS)
        this.recipeBaseStamp[p.id] =
          this.recipeRows?.find((r) => r.productId === p.id)?.updatedAt ?? null;
      Object.assign(fresh, this.recipesPatch(fresh as unknown as RecipeState, undefined, true));
      this.setState(fresh);
      clearTimeout(this.resetNoticeTimer);
      this.resetNoticeTimer = setTimeout(
        // Unlike the demo reset, this must not claim "gone": a sale already queued to
        // sync lives in IndexedDB (invariant 2), not in this cleared state.
        () => {
          this.resetNoticeTimer = undefined;
          this.toast('Back to empty. Local records on this device were cleared.', 'warn');
        },
        80
      );
      void this.settingsSync?.reload();
    };
    this.captureSettingsActions();
    const { toggleDropProduct, setPrice } = this;
    this.toggleDropProduct = (pid) => {
      const before = this.flavourEdit(pid);
      toggleDropProduct(pid);
      this.saveFlavourEdit(pid, { onMenu: !before.onMenu }, before);
    };
    // MP-09 c1b: the edit-price sheet. The engine's own clamp is repeated because its
    // setState has not landed yet. Orders already placed keep their own `priced` map (engine)
    // and `order_items.unit_price_cents` (database), so only new orders see the change.
    this.setPrice = (pid, value) => {
      const before = this.flavourEdit(pid);
      setPrice(pid, value);
      this.saveFlavourEdit(pid, { price: Math.max(0, Number(value) || 0) }, before);
    };
  }

  /** Runs once the state change just asked for has landed. */
  private afterUpdate(then: () => void): void {
    this.setState({}, then);
  }

  /** Keeps a bazaar command on the phone under a stable key, then tries to send the queue. */
  private async queueCommand(
    kind: CommandKind,
    eventId: string,
    key: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      await enqueueCommand({ clientId: key, kind, eventId, payload, at: Date.now() });
    } catch {
      this.toast('That could not be saved on this phone. Try again.', 'warn');
      return;
    }
    await this.reflectQueue();
    try {
      if (navigator.onLine) await this.flushSales();
      else await requestBackgroundSync();
    } catch {
      this.toast('Saved on this phone. Sync is still pending.', 'warn');
    }
  }

  /** Online only: the server snapshots the prices and names this phone the selling device. */
  private async startLiveEvent(
    ev: { name: string; date: string },
    begin: (ev: { name: string; date: string }) => void
  ): Promise<void> {
    const pending = this.pendingSchedule;
    this.pendingSchedule = null;
    const target = this.state.online ? this.salesTarget() : null;
    if (!target) {
      this.toast('Start the event while you have signal. Sales can go offline after that.', 'warn');
      return;
    }
    const outcome = await startEventOnServer(target, {
      name: ev.name,
      deviceId: deviceId(),
      eventId: eventAttemptId(pending ? 'booking:' + pending.id : ev.name)
    });
    if (!outcome.ok) {
      this.toast('The event could not be started. Try again.', 'warn');
      return;
    }
    clearEventAttempt();
    begin(ev);
    const unsellable = PRODUCTS.filter((p) => !(p.id in outcome.prices)).length;
    if (unsellable) {
      this.toast(
        plural(unsellable, 'flavour is', 'flavours are') +
          ' not on the menu, so ' +
          (unsellable === 1 ? 'it' : 'they') +
          ' cannot be sold at this event.',
        'warn'
      );
    }
    this.setState((s) => ({
      event: { ...(s.event ?? {}), id: outcome.eventId, snapshot: Object.keys(outcome.prices) },
      eventPrices: { ...(s.eventPrices as Record<string, number>), ...outcome.prices }
    }));
    if (pending) void this.afterScheduledStart(pending, outcome.eventId);
  }

  /**
   * Live only. With no staff list loaded (a page that started on the customer shop), there is
   * nothing to save against: the change goes back rather than showing an edit never sent.
   */
  private saveFlavourEdit(pid: string, change: Partial<FlavourEdit>, before: FlavourEdit): void {
    if (this.flavourSync) {
      void this.flavourSync.save(pid, change, before);
      return;
    }
    this.restoreFlavour(pid, before);
    this.toast(FLAVOUR_TOASTS.offline, 'warn');
  }

  private restoreFlavour(pid: string, edit: FlavourEdit): void {
    this.setState((s) => ({
      dropActive: { ...(s.dropActive as Record<string, boolean>), [pid]: edit.onMenu },
      prices: { ...(s.prices as Record<string, number>), [pid]: edit.price }
    }));
  }

  /** A flavour's on-menu switch and price as the engine shows them now. */
  private flavourEdit(pid: string): FlavourEdit {
    return {
      onMenu: (this.state.dropActive as Record<string, boolean>)[pid] !== false,
      price: this.priceOf(pid)
    };
  }

  /**
   * MP-09 b2: every engine action that writes `cfg` keeps its own optimistic change and
   * copy, then queues the touched key for `save_setting`. `setRetention` and `setCapacity`
   * go through `setCfg`/`numCfg`, and the rules/schedule rows call `this.bumpCfg` at tap
   * time, so they are covered by the first three. `componentDidUpdate`'s prop-driven cfg
   * writes are the review harness's tweak panel, which live mode never renders.
   */
  private captureSettingsActions(): void {
    const queue = (key: string) => this.settingsSync?.queue(key);
    const { setCfg, bumpCfg, numCfg, publishPriceMode, extendDrop, closeDrop } = this;
    this.setCfg = (key, value) => {
      setCfg(key, value);
      queue(key);
    };
    this.bumpCfg = (key, delta, min, max) => {
      bumpCfg(key, delta, min, max);
      queue(key);
    };
    this.numCfg = (key, value, min, max) => {
      numCfg(key, value, min, max);
      queue(key);
    };
    this.publishPriceMode = () => {
      publishPriceMode();
      queue('priceMode');
    };
    this.extendDrop = () => {
      extendDrop();
      queue('extendH');
    };
    // Closing a drop resets extendH to 0; unsaved, every later drop would close late.
    this.closeDrop = () => {
      closeDrop();
      queue('extendH');
    };
    // MP-09 b3: the expense-category actions write the top-level lists, not cfg. Renaming
    // also rewrites the ledger's categories, which stays on the device until MP-15.
    const { addCategory, renameCategory, toggleCategory } = this;
    this.addCategory = (name) => {
      addCategory(name);
      queue('categories');
    };
    this.renameCategory = (old, next) => {
      renameCategory(old, next);
      queue('categories');
    };
    this.toggleCategory = (name) => {
      toggleCategory(name);
      queue('inactiveCats');
    };
  }

  /**
   * Called by the live gate once, on the first verified sign-in: the owner reads every
   * setting, helper and support the staff-safe projection, into `cfg` (and, for the three
   * lists in `STATE_LEVEL_KEYS`, the top of state). `role` is the
   * verified profile role, passed in because `setRole` has not landed in `state` yet.
   */
  loadSettings(client: SettingsClient, role: Role): Promise<boolean> {
    if (!isLiveMode()) return Promise.resolve(false);
    this.settingsSync?.dispose();
    this.settingsSync = new SettingsSync(client, {
      role: () => role,
      read: (key) =>
        STATE_LEVEL_KEYS.has(key)
          ? this.state[key]
          : (this.state.cfg as Record<string, unknown> | undefined)?.[key],
      apply: (patch) =>
        this.setState((s) => {
          const cfg = { ...(s.cfg as Record<string, unknown>) };
          const top: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(patch)) {
            if (STATE_LEVEL_KEYS.has(key)) top[key] = value;
            else cfg[key] = value;
          }
          return { ...top, cfg };
        }),
      online: () => this.state.online && (typeof navigator === 'undefined' || navigator.onLine),
      toast: (message, tone) => this.toast(message, tone)
    });
    const base = BASE_STATE();
    return this.settingsSync.load({
      ...DEFAULT_CFG,
      channels: base.channels,
      categories: base.categories,
      inactiveCats: base.inactiveCats
    });
  }

  /**
   * MP-09 c1: every role reads the flavour list on the first verified sign-in, and the
   * engine's PRODUCTS/ALLERGENS are replaced in place with it (the approved engine
   * exception, docs/state/protected-exception.md). Prices and the on-menu switch follow
   * the rows. An empty or failed read keeps the ported list.
   */
  loadFlavours(client: FlavoursClient): Promise<boolean> {
    if (!isLiveMode()) return Promise.resolve(false);
    this.flavourSync = new FlavourSync(client, {
      apply: (rows) => {
        const { list, allergens } = engineCatalogue(rows);
        replaceFlavours(list, allergens);
        this.setState((s) => flavourStatePatch(rows, s));
      },
      edit: (id) => this.flavourEdit(id),
      restore: (id, edit) => this.restoreFlavour(id, edit),
      online: () => this.state.online && (typeof navigator === 'undefined' || navigator.onLine),
      toast: (message, tone) => this.toast(message, tone)
    });
    return this.flavourSync.load();
  }

  /**
   * MP-09 c2: every live page reads the owner's payment methods and shop texts through
   * `get_shop_payment_info()` (anon may execute it). A failed or empty read shows no method, no
   * QR and no footer claim. With no client (a live build with no Supabase) it shows the same.
   */
  async loadShopPayment(client: (PaymentClient & UploadClient) | null): Promise<boolean> {
    if (!isLiveMode()) return false;
    if (!client) {
      replacePayAccounts([]);
      this.forceUpdate();
      return false;
    }
    this.paymentSync = new PaymentSync(client, {
      apply: (accounts) => replacePayAccounts(accounts),
      changed: () => this.forceUpdate(),
      toast: (message, tone) => this.toast(message, tone)
    });
    return this.paymentSync.loadPublic();
  }

  /** False until the customer shop's menu has been read (or failed to be read). */
  private shopMenuRead = false;

  /**
   * MP-09 c1b: the customer pages in live mode (anonymous or not) read the owner's published
   * menu from `shop_products`, never `products`. Only published flavours that are on the
   * order form show; with nothing published, or a failed read, the shop shows no flavours
   * rather than the ported demo menu and prices. Called by the live gate on customer pages;
   * a staff list already loaded (or loading) wins, because it is the fuller authorised view.
   */
  async loadShopMenu(client: ShopClient | null): Promise<boolean> {
    if (!isLiveMode()) return false;
    let rows: ShopFlavourRow[] = [];
    if (client) {
      try {
        rows = await fetchShopFlavours(client);
      } catch {
        rows = [];
      }
    }
    if (this.flavourSync) return false;
    const { list, allergens, onMenu } = shopCatalogue(
      rows,
      PRODUCTS.map((p) => ({ ...p })),
      { ...ALLERGENS }
    );
    replaceFlavours(list, allergens);
    this.shopMenuRead = true;
    this.setState((s) => catalogueStatePatch(list, onMenu, s));
    return rows.length > 0;
  }

  /**
   * The flavour editor's entry points (MP-09 c1c): "Menu & flavours" in toolGroups and the
   * products screen's "Edit price" button, live owner only. `state.sheet` carries an
   * otherwise-unrecognised `kind` ('flavours'), which the ported engine stores and renders
   * with an empty body (`titleOf['flavours']` is `''`, every `isX` false) — the live-only
   * form host (F3) is the one new render branch that fills it in.
   */
  private openFlavourList(): void {
    this.sheet('flavours', {});
  }

  /**
   * The `updated_at` this flavour was showing the moment the editor opened is frozen into
   * the sheet, not re-read fresh on every render: the form's own fields are uncontrolled
   * (`defaultValue`, set once at mount), so a quick edit that lands while the form is open
   * would otherwise let `saveFlavourForm` send a *fresh* `updated_at` alongside the form's
   * *stale* field values — passing `save_flavour`'s conflict check and silently overwriting
   * the quick edit instead of reporting a conflict.
   */
  private openFlavourEditor(pid: string): void {
    const updatedAt = this.flavourSync?.current().find((r) => r.id === pid)?.updated_at ?? null;
    this.sheet('flavours', { pid, updatedAt });
  }

  private openNewFlavour(): void {
    this.sheet('flavours', { isNew: true });
  }

  private publishMenu = async (): Promise<void> => {
    if (!this.flavourSync) return;
    const status = await this.flavourSync.publish();
    if (status === 'published') {
      const shown = this.flavourSync.current().filter((r) => r.active).length;
      this.toast(
        shown
          ? 'Published. Customers now see ' + plural(shown, 'flavour', 'flavours') + '.'
          : 'Published. The shop shows no flavours — none are on the order form.'
      );
      return;
    }
    this.toast(
      status === 'offline' ? FLAVOUR_TOASTS.offline : 'The menu could not be published. Try again.',
      'warn'
    );
  };

  /**
   * Converts the form's pesos back to centavos and the same bounds `save_flavour` checks
   * (`flavourFieldError`), so a sure refusal never reaches the network. A brand-new flavour
   * (`id` null) gets a slug derived from its name, unique against every id already loaded —
   * nothing is ever deleted, so that set is every flavour that has ever existed.
   */
  private async saveFlavourForm(
    id: string | null,
    fields: LiveFlavourFormFields,
    expectedUpdatedAt: string | null
  ): Promise<void> {
    if (!this.flavourSync) return;
    const priceInCents = priceCents(fields.price);
    if (priceInCents === null) {
      this.toast('Price is out of range.', 'warn');
      return;
    }
    const dbFields: FlavourFields = {
      name: fields.name,
      short_name: fields.shortName,
      price_cents: priceInCents,
      kind: fields.kind,
      item_type: fields.itemType,
      capacity_weight: fields.capacityWeight,
      tag: fields.badge,
      description: fields.description,
      image_path: fields.imagePath,
      allergens: fields.allergens,
      active: fields.active,
      sort_order: fields.sortOrder
    };
    const problem = flavourFieldError(dbFields);
    if (problem) {
      this.toast(problem, 'warn');
      return;
    }
    const existing = new Set(this.flavourSync.current().map((r) => r.id));
    const flavourId = id ?? slugifyFlavourId(fields.name, existing);
    const status = await this.flavourSync.saveWhole(flavourId, dbFields, expectedUpdatedAt);
    if (status === 'saved') {
      this.toast('Flavour saved.');
      this.openFlavourList();
    }
  }

  /**
   * The prototype read localStorage in a field initialiser and restores the saved books
   * one commit after mount (see `OpsEngine.componentDidMount`, protected). Live mode never
   * reads or writes `hc-ops-state-v1`: `state` already starts from the emptied live state
   * (constructor, above), so this skips straight to `afterRestore` without calling
   * `super.componentDidMount()`, which would call the protected `loadState()`.
   */
  componentDidMount(): void {
    if (isLiveMode()) {
      clearStoredBooks();
      const bazaar = readBazaar();
      if (bazaar) this.setState(bazaar);
      this.afterRestore();
      return;
    }
    super.componentDidMount?.();
  }

  /**
   * Live mode only: follow the real viewport instead of the harness's device picker. Runs
   * after the engine restores the saved books, because that restore resets `device`.
   */
  afterRestore(): void {
    super.afterRestore();
    if (!isLiveMode()) return;
    const apply = () => {
      const device = deviceForWidth(window.innerWidth);
      if (this.state.device !== device) this.setState({ device });
    };
    apply();
    window.addEventListener('resize', apply);
    this.stopViewportTracking = () => window.removeEventListener('resize', apply);
  }

  componentWillUnmount(): void {
    clearTimeout(this.resetNoticeTimer);
    this.resetNoticeTimer = undefined;
    clearInterval(this.healthTimer);
    this.healthTimer = undefined;
    super.componentWillUnmount?.();
    this.stopViewportTracking?.();
    this.settingsSync?.dispose();
  }

  /**
   * The prototype's review harness — the phone/tablet frame picker, the role switcher
   * and the width toggles — is part of the ported frame markup, which may not be edited.
   * Switching it off is therefore done by starving it: with NEXT_PUBLIC_HARNESS=0 the
   * engine stops producing those lists, and the ported `{(devices ?? []).map(…)}` and
   * `{showPhoneWidths ? … : null}` branches render nothing. Same markup, no chrome.
   *
   * Live mode starves it unconditionally, regardless of NEXT_PUBLIC_HARNESS: the static
   * export build never sets that variable, so HARNESS defaults true there, and a signed-in
   * helper must not be able to flip the role switcher to the owner view. Routing follows
   * the role loaded from the profile (`src/components/app/live-gate.tsx`), not a picker.
   *
   * This is not a security boundary. Row-level security is (docs/DATA.md).
   */
  async loadOperationsHealth(client: OperationsClient | null): Promise<boolean> {
    if (!isLiveMode() || this.state.role === 'helper') return false;
    const use = client ?? this.operationsClient;
    if (!use) return false;
    this.operationsClient = use;
    this.keepHealthFresh();
    const seq = ++this.operationsLoadSeq;
    try {
      if (!idb.supported()) throw new Error('Queue storage unavailable');
      const [health, queue] = await Promise.all([fetchOperationsHealth(use), pendingSales()]);
      if (seq !== this.operationsLoadSeq) return false;
      this.operationsHealth = health;
      this.operationsQueue = queue.length;
      this.operationsPhase = 'ready';
      this.setState({});
      return true;
    } catch {
      if (seq !== this.operationsLoadSeq) return false;
      this.operationsPhase = 'error';
      this.operationsQueue = -1;
      this.setState({});
      return false;
    }
  }

  /**
   * A health read is trusted for five minutes (`healthView`). Re-read it while the page is
   * visible, so a screen left open does not drift into "could not verify" and bring back
   * alerts the last read had cleared. A hidden page waits for the gate's visibility
   * re-check. Offline nothing can be re-read, so the alerts do return after five minutes.
   */
  private keepHealthFresh(): void {
    if (this.healthTimer) return;
    this.healthTimer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.loadOperationsHealth(null);
    }, HEALTH_REFRESH_MS);
  }

  /** The recorded checks as System health shows them, for the state given. */
  private liveHealth(s: OpsEngineState) {
    return healthView(
      this.operationsHealth,
      this.operationsPhase,
      Date.now(),
      this.operationsQueue < 0 ? -1 : Math.max(this.operationsQueue, s.unsynced),
      s.online
    );
  }

  /**
   * Live only. The protected engine adds `backup` to the All tools badge and to Home's
   * "things need you" line, and nothing else feeds that flag in live mode, so it stayed
   * 'failed' whatever the recorded checks said. Keep it in step with them: 'failed' while
   * any health row is raising an alert. The device's own queue is left out when the engine
   * already counts it through `unsynced`. The wording the flag also drives ("Healthy",
   * "Backed up") is replaced in `renderVals`, so 'ok' here never becomes a green claim.
   */
  componentDidUpdate(...args: Parameters<NonNullable<OpsProvider['componentDidUpdate']>>): void {
    super.componentDidUpdate?.(...args);
    if (!isLiveMode()) return;
    const s = this.state;
    const backup = this.liveHealth(s).healthRows.some(
      (row) => row.bad && (row.label !== 'Bazaar sync' || !(s.unsynced > 0))
    )
      ? 'failed'
      : 'ok';
    if (s.backup !== backup) this.setState({ backup });
  }

  /** The inherited screens and badges call this method; demo uses the original implementation. */
  notifs(s: OpsEngineState): LiveAlert[] {
    if (!isLiveMode())
      return (
        OpsProvider.prototype as unknown as { notifs: (s: OpsEngineState) => LiveAlert[] }
      ).notifs.call(this, s);
    const alerts: LiveAlert[] = [];
    const channels = (s.channels ?? {}) as Record<string, boolean>;
    const add = (
      channel: string,
      k: LiveAlert['k'],
      label: string,
      sub: string,
      tone: LiveAlert['tone']
    ) => {
      if (channels[channel] === false || (s.role !== 'owner' && k !== 'health')) return;
      if (s.role === 'helper') return;
      alerts.push({
        k,
        label,
        sub,
        tone,
        urgency:
          tone === 'bad'
            ? 'Action needed now'
            : tone === 'warn'
              ? 'Needs attention soon'
              : 'Information',
        go: () => this.go(k)
      });
    };
    // Checks that were never switched on are not `bad` (see `healthView`), so they raise nothing here.
    for (const row of this.liveHealth(s).healthRows.filter((row) => row.bad)) {
      add(
        row.label === 'Encrypted database backup' ? 'Backup failure' : 'System error',
        'health',
        String(row.label) + ': ' + String(row.value),
        'System health',
        'bad'
      );
    }
    if (s.role !== 'owner') return alerts;
    const orders = this.orderSync?.current() ?? [];
    const newest = orders
      .filter(
        (o) =>
          !['Cancelled', 'No-show', 'Completed'].includes(o.state) &&
          o.placedAt <= Date.now() &&
          Date.now() - o.placedAt <= 86_400_000
      )
      .sort((a, b) => b.placedAt - a.placedAt)[0];
    if (newest) add('New order', 'orders', 'New order ' + newest.id, newest.name, 'info');
    const today = manilaToday();
    const pickups = orders.filter(
      (o) => o.pickupDate === today && ['Confirmed', 'Preparing', 'Ready'].includes(o.state)
    );
    if (pickups.length)
      add(
        'Pickup reminder',
        'orders',
        `${pickups.length} order(s) for pickup today`,
        'Fulfilment · ' + today,
        'info'
      );
    const low = this.stockCatalogue?.items.filter((i) => i.active && i.onHand < i.parLevel) ?? [];
    if (low.length)
      add(
        'Low stock',
        'inventory',
        `${low.length} stock item(s) below reorder level`,
        low.map((i) => i.name).join(', '),
        'warn'
      );
    if (this.stockCatalogue && this.recipeRows && this.orderSync?.loaded) {
      const plan = (
        this as unknown as { groceryPlan: (s: OpsEngineState) => Array<{ key: string }> }
      ).groceryPlan(s);
      if (plan.length)
        add(
          'Grocery shortage',
          'grocery',
          `${plan.length} item(s) on the grocery list`,
          'Based on current orders, stock and recipes',
          'warn'
        );
    }
    return alerts;
  }

  renderVals(): OpsVals {
    const vals = super.renderVals();
    if (HARNESS && !isLiveMode()) return vals;
    const starved = { ...vals, devices: [], roles: [], showPhoneWidths: false } as OpsVals;
    if (!isLiveMode()) return starved;
    const { setupPending, ...health } = this.liveHealth(this.state);
    const healthProblems = health.healthRows.filter((row) => row.bad).length;
    // Live: the real app, not the review harness. No header row, flow strip or flow bar,
    // and the device frame fills the screen instead of drawing a phone/tablet mock-up (so the
    // mock-up bezel — radius, border, shadow — goes too; background colours are unchanged).
    // `transform: scale(1)` is kept only to match the prototype's frame; the sheets, toast,
    // dock and quick-action layer are positioned by the frame's inner `position: relative` box.
    // The fabricated PRIOR_MONTHS trend (protected `pnlVals`) is dropped down to the real
    // current month, and its bar height is recomputed from just that row — the same
    // Math.max(6, round(amt/max*100)) clamp the protected engine uses, with `max` now
    // trivially this row's own profit (or the reduce's floor of 1 when profit <= 0).
    const trend = Array.isArray(starved.plTrend) ? starved.plTrend : [];
    const profit = this.pnlTotals(this.state).profit;
    const barHeight = Number.isFinite(profit)
      ? Math.max(6, Math.round((profit / Math.max(1, profit)) * 100))
      : 6;
    return {
      ...starved,
      bareFrame: true,
      showFlowStrip: false,
      flow: null,
      frameOuterStyle: 'width: 100%; height: 100dvh; flex-shrink: 0',
      frameStyle:
        'width: 100%; height: 100%; transform: scale(1); transform-origin: top left; display: flex; overflow: hidden; background: ' +
        (this.state.device === 'desktop' ? '#F6F4F2' : '#FFFFFF'),
      plTrend: trend.filter((row) => row.now).map((row) => ({ ...row, v: barHeight })),
      rules: this.state.role === 'owner' ? this.liveRules(starved.rules ?? []) : starved.rules,
      // MP-09 c1c: the flavour editor's entry points and form host, live owner only.
      toolGroups: (this.state.role === 'owner'
        ? this.liveToolGroups(starved.toolGroups ?? [])
        : starved.toolGroups
      ).map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.label === 'System health'
            ? { ...item, sub: health.healthTitle, badge: healthProblems || null }
            : item.label === 'Backups & export'
              ? { ...item, sub: 'Recorded checks and books CSV' }
              : item
        )
      })),
      // Home's grid and the Settings row word the engine's `backup` flag; say what was recorded instead.
      launcher: (starved.launcher ?? []).map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.label === 'System health'
            ? { ...item, sub: health.healthTitle }
            : item.label === 'Backups & export'
              ? { ...item, sub: 'Recorded checks and books CSV' }
              : item
        )
      })),
      settingsGroups: (starved.settingsGroups ?? []).map((group) => ({
        ...group,
        rows: group.rows.map((row) =>
          row.label === 'Backups and export' ? { ...row, value: health.healthTitle } : row
        )
      })),
      productRows:
        this.state.role === 'owner'
          ? this.liveProductRows(starved.productRows ?? [])
          : starved.productRows,
      ...(this.state.screen === 'products'
        ? {
            pageSub:
              PRODUCTS.length +
              ' flavours · ' +
              PRODUCTS.filter(
                (p) =>
                  (this.state.dropActive as Record<string, boolean> | undefined)?.[p.id] !== false
              ).length +
              ' on menu'
          }
        : {}),
      recipe: starved.recipe
        ? {
            ...starved.recipe,
            costText: this.completeRecipeCost(this.state.recipeOpen)
              ? starved.recipe.costText
              : 'Cost pending'
          }
        : starved.recipe,
      invRows: (starved.invRows ?? []).map((row) => {
        const item = this.stockCatalogue?.items.find((i) => i.name === row.name);
        return ['Ingredients', 'Packaging'].includes(String(this.state.invTab)) &&
          !item?.lastCounted
          ? { ...row, sub: 'Opening count pending' }
          : row;
      }),
      sheet: this.liveSheet(starved.sheet),
      liveForm: this.liveFormVals(),
      livePay: this.livePayVals(),
      liveTexts: this.liveTextsVals(),
      liveMessages: this.liveMessagesVals(),
      ...(this.orderSync ? { od: this.liveOrderDetail(starved.od) } : {}),
      liveOrderRules: this.liveOrderRulesVals(),
      liveOrderExtras: this.liveOrderExtrasVals(),
      liveScheduled: this.liveScheduledVals(),
      liveBooks: this.liveBooksVals(),
      ...health,
      system: {
        ...starved.system,
        ok: health.healthOk,
        bad: !health.healthOk,
        label: health.healthTitle,
        detail:
          setupPending && health.healthTitle === SETUP_PENDING_COPY.title
            ? SETUP_PENDING_COPY.home
            : health.healthSub
      },
      // The database's books are exportable; demo record-group examples are never live evidence.
      recordGroups:
        this.state.role === 'owner' && this.booksRows?.lines.length
          ? [
              {
                title: 'Database books',
                countText: plural(this.booksRows.lines.length, 'record', 'records'),
                rows: this.booksRows.lines.slice(-10).map((line) => ({
                  what: line.label,
                  when: new Date(line.at).toLocaleDateString('en-PH', {
                    timeZone: 'Asia/Manila'
                  }),
                  value: PESO(line.amountCents / 100)
                }))
              }
            ]
          : [],
      hasRecords: this.state.role === 'owner' && !!this.booksRows?.lines.length,
      retryBackup: () => {
        void this.loadOperationsHealth(null);
        this.toast('Checking recorded results. Backups are run by the operator.', 'warn');
      },
      contactSupport: () =>
        this.toast('Please contact KETH AI support and share the result shown here.', 'warn'),
      ...(this.state.role !== 'owner'
        ? { exportNow: () => this.toast('Only the owner can export the books.', 'warn') }
        : {}),
      liveStockItems: this.liveStockItemsVals(),
      liveStockSuppliers: this.liveStockSuppliersVals(),
      liveRecipeDrafts: this.liveRecipeDraftsVals(),
      // D4: in live mode the Bazaar list is the owner's bookings, never the ported prototype events.
      events: this.liveBazaarEvents(),
      cust: this.liveStatusCust(this.livePayCust(starved.cust)),
      openLookup: () => this.openLookupSheet(),
      openWaitlist: () => this.openWaitlist(),
      liveCheckout: this.liveCheckoutVals(),
      liveLookup: this.liveLookupVals(),
      liveWaitlist: this.liveWaitlistVals(),
      shopFooter: this.shopFooterVals(),
      // MP-09 c1b: until the published menu is read, a customer page shows no flavours
      // (the engine still holds the ported list, which is not the owner's menu).
      ...(CUSTOMER_SCREENS.includes(this.state.screen as ScreenKey) &&
      !this.flavourSync &&
      !this.shopMenuRead
        ? { shopFlavours: [] }
        : {}),
      // MP-09 b4: helpers (and any other non-owner) never see cost, expenses or profit, and
      // see sale totals only when the owner's helperSeesSales switch is on.
      ...(this.state.role === 'owner'
        ? {}
        : helperMoneyView(starved, {
            seesTotals:
              (this.state.cfg as Record<string, unknown> | undefined)?.helperSeesSales === 1,
            liveSales: (this.state.sales ?? []).length,
            count: (n) => this.num(n)
          }))
    };
  }

  /** The rules sheet in live mode: the ported rows, DP-15's idle minutes and the helper-totals switch. */
  private liveRules(rules: OpsVals['rules']): OpsVals['rules'] {
    const cfg = (this.state.cfg ?? {}) as Record<string, unknown>;
    const clamp = (n: number) => Math.min(IDLE_MINUTES_MAX, Math.max(IDLE_MINUTES_MIN, n));
    const idle = IDLE_ROWS.map(({ role, label }) => {
      const k = IDLE_SETTING_KEYS[role];
      const minutes = idleMinutesFor(role, cfg);
      return {
        k,
        label,
        value: minutes,
        valueText: plural(minutes, 'minute', 'minutes') + ' idle',
        note: 'With no taps for this long, the device signs out. 15 minutes to 8 hours.',
        down: () => this.setCfg(k, clamp(minutes - 15)),
        up: () => this.setCfg(k, clamp(minutes + 15)),
        set: (e?: unknown) =>
          this.numCfg(
            k,
            (e as { target?: { value?: unknown } } | undefined)?.target?.value,
            IDLE_MINUTES_MIN,
            IDLE_MINUTES_MAX
          )
      };
    });
    const seesTotals = cfg.helperSeesSales === 1;
    const helperTotals = {
      k: 'helperSeesSales',
      label: 'Helpers see sale totals',
      value: seesTotals ? 1 : 0,
      valueText: seesTotals ? 'On' : 'Off',
      note: 'The running bazaar total and past drop totals. Costs, expenses and profit stay hidden either way.',
      down: () => this.setCfg('helperSeesSales', 0),
      up: () => this.setCfg('helperSeesSales', 1),
      set: (e?: unknown) =>
        this.numCfg(
          'helperSeesSales',
          (e as { target?: { value?: unknown } } | undefined)?.target?.value,
          0,
          1
        )
    };
    return [...rules, ...idle, helperTotals];
  }

  // ------------------------------------------------------------------ B3: the shop's open state

  /**
   * Every live page reads the owner's ordering window and the "close now" switch from the
   * server. The switch is always applied; the window only where the staff settings are not
   * loaded (a customer page), because a signed-in owner's settings already carry it and an
   * unsaved edit must not be overwritten. A failed or malformed read keeps what was there.
   */
  async loadShopStatus(client: ShopStatusClient | null): Promise<boolean> {
    if (!isLiveMode() || !client) return false;
    this.shopClient = client;
    let status;
    try {
      status = await fetchShopStatus(client);
    } catch {
      return false;
    }
    if (!status) return false;
    this.setState((s) => ({
      shopOverride: status.override,
      cfg: this.settingsSync ? s.cfg : { ...(s.cfg as Record<string, unknown>), ...status.window }
    }));
    return true;
  }

  /** A customer's banner must not go stale: read again when the tab comes back. */
  reloadShopStatus(): Promise<boolean> {
    return this.loadShopStatus(this.shopClient ?? null);
  }

  /**
   * The owner's "close now", "sold out", "closing soon", "open" and "follow my schedule" reach the
   * server first; only then does the ported action run, so the screen, its toast and the database
   * agree. A refused or unsent switch changes nothing on screen.
   */
  private installShopOverrides(): void {
    const shop = this as unknown as {
      setDropState: (st: string) => void;
      closeDropEarly: () => void;
      reopenDrop: () => void;
      extendDrop: () => void;
      closeDrop: () => void;
    };
    const { setDropState, closeDropEarly, reopenDrop, extendDrop, closeDrop } = shop;
    shop.setDropState = (st) => {
      const mode = st === 'auto' ? null : (st as ShopOverride);
      void this.persistOverride(mode).then((ok) => ok && setDropState(st));
    };
    shop.closeDropEarly = () =>
      void this.persistOverride('closed').then((ok) => ok && closeDropEarly());
    shop.reopenDrop = () => void this.persistOverride(null).then((ok) => ok && reopenDrop());
    // Extending the closing time also hands the shop back to the window (the ported action clears the hold).
    shop.extendDrop = () => void this.persistOverride(null).then((ok) => ok && extendDrop());
    // Closing the drop (the rollover) also clears the hold, but only when the engine lets it close: it refuses
    // while orders are unfinished. So the ported action runs first and the server follows what it did. Its local
    // ledger line is a demo-side effect that live mode has no books for until E1.
    shop.closeDrop = () => {
      const before = (this.state as unknown as { dropNo: number }).dropNo;
      closeDrop();
      this.afterUpdate(() => {
        if ((this.state as unknown as { dropNo: number }).dropNo !== before)
          void this.persistOverride(null);
      });
    };
  }

  private async persistOverride(mode: ShopOverride | null): Promise<boolean> {
    const client = this.shopClient;
    if (!client || !this.state.online || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      this.toast(STAFF_COPY.offline, 'warn');
      return false;
    }
    const outcome = await saveShopOverride(client, mode);
    if (outcome === 'saved') return true;
    this.toast(outcome === 'refused' ? RULES_COPY.switchRefused : STAFF_COPY.offline, 'warn');
    return false;
  }

  // ------------------------------------------------------------------ B3: the order rules form

  private async loadOrderRules(): Promise<boolean> {
    if (!this.shopClient) return false;
    try {
      this.rulesRow = await fetchOrderRules(this.shopClient);
    } catch {
      this.toast(STAFF_COPY.offline, 'warn');
      return false;
    }
    this.forceUpdate();
    return this.rulesRow !== null;
  }

  /** Read fresh first, so the stamp the form saves against is the current one. */
  private openOrderRules = async (): Promise<void> => {
    if (!(await this.loadOrderRules()) || !this.rulesRow) return;
    this.sheet('orderrules', { updatedAt: this.rulesRow.updated_at });
  };

  private liveOrderRulesVals(): OpsVals['liveOrderRules'] {
    const sh = this.state.sheet as FlavourSheetState | null;
    const r = this.rulesRow;
    if (this.state.role !== 'owner' || sh?.kind !== 'orderrules' || !r) return null;
    return {
      online: this.state.online && (typeof navigator === 'undefined' || navigator.onLine),
      rules: {
        unpaidHoldHours: r.unpaid_hold_hours,
        maxUnpaidPerPhone: r.max_unpaid_per_phone,
        pickupDays: [...r.pickup_days],
        leadMinDays: r.lead_min_days,
        leadMaxDays: r.lead_max_days,
        pickupFromHour: r.pickup_from_hour,
        pickupCutoffHour: r.pickup_cutoff_hour,
        campusFrom: r.campus_from,
        campusTo: r.campus_to
      },
      save: (f: LiveOrderRulesFields) => void this.saveOrderRulesForm(f, sh.updatedAt ?? null),
      close: () => this.closeSheet()
    };
  }

  private async saveOrderRulesForm(
    f: LiveOrderRulesFields,
    expectedUpdatedAt: string | null
  ): Promise<void> {
    const fields = {
      unpaid_hold_hours: f.unpaidHoldHours,
      max_unpaid_per_phone: f.maxUnpaidPerPhone,
      pickup_days: [...f.pickupDays].sort((a, b) => a - b),
      lead_min_days: f.leadMinDays,
      lead_max_days: f.leadMaxDays,
      pickup_from_hour: f.pickupFromHour,
      pickup_cutoff_hour: f.pickupCutoffHour,
      campus_from: f.campusFrom.trim(),
      campus_to: f.campusTo.trim()
    };
    const problem = orderRulesError(fields);
    if (problem) return void this.toast(problem, 'warn');
    if (!this.shopClient || !expectedUpdatedAt) return void this.toast(STAFF_COPY.offline, 'warn');
    const outcome = await saveOrderRules(this.shopClient, fields, expectedUpdatedAt);
    if (outcome === 'saved') {
      this.toast(RULES_COPY.saved);
      this.closeSheet();
      await this.loadOrderRules();
    } else if (outcome === 'conflict') {
      this.toast(RULES_COPY.conflict, 'warn');
      await this.openOrderRules();
    } else this.toast(outcome === 'refused' ? RULES_COPY.refused : STAFF_COPY.offline, 'warn');
  }

  // ------------------------------------------------------------------ B4: the boxes and add-ons form

  private async loadOrderExtras(): Promise<boolean> {
    if (!this.shopClient) return false;
    try {
      this.extrasRow = await fetchOrderExtras(this.shopClient);
    } catch {
      this.toast(STAFF_COPY.offline, 'warn');
      return false;
    }
    this.forceUpdate();
    return this.extrasRow !== null;
  }

  /** Read fresh first, so the stamp the form saves against is the current one. */
  private openOrderExtras = async (): Promise<void> => {
    if (!(await this.loadOrderExtras()) || !this.extrasRow) return;
    this.sheet('orderextras', { updatedAt: this.extrasRow.updated_at });
  };

  private liveOrderExtrasVals(): OpsVals['liveOrderExtras'] {
    const sh = this.state.sheet as FlavourSheetState | null;
    const x = this.extrasRow;
    if (this.state.role !== 'owner' || sh?.kind !== 'orderextras' || !x) return null;
    const sets = (this.flavourSync?.current() ?? [])
      .filter((r) => r.item_type === 'set')
      .map((r) => ({ id: r.id, name: r.name }));
    if (x.sampler_product_id && !sets.some((s) => s.id === x.sampler_product_id))
      sets.push({ id: x.sampler_product_id, name: x.sampler_product_id });
    return {
      online: this.state.online && (typeof navigator === 'undefined' || navigator.onLine),
      extras: {
        sameDayEnabled: x.same_day_enabled,
        sameDayPercent: x.same_day_percent,
        sameDayOnExtras: x.same_day_on_extras,
        samplerProductId: x.sampler_product_id ?? '',
        samplerMaxQty: x.sampler_max_qty,
        boxSizes: x.box_sizes.map((b) => ({
          size: b.size,
          chargePesos: centavosToPesos(b.charge_cents),
          active: b.active
        })),
        addOns: x.add_ons.map((a) => ({
          id: a.id,
          name: a.name,
          pricePesos: centavosToPesos(a.price_cents),
          active: a.active,
          variants: [...a.variants],
          textLabel: a.text_label ?? '',
          textMax: a.text_max,
          maxQty: a.max_qty
        }))
      },
      sets,
      save: (f: LiveOrderExtrasFields) => void this.saveOrderExtrasForm(f, sh.updatedAt ?? null),
      close: () => this.closeSheet()
    };
  }

  private async saveOrderExtrasForm(
    f: LiveOrderExtrasFields,
    expectedUpdatedAt: string | null
  ): Promise<void> {
    const numbers = [
      f.sameDayPercent,
      f.samplerMaxQty,
      ...f.boxSizes.flatMap((b) => [b.size, b.chargePesos]),
      ...f.addOns.flatMap((a) => [a.pricePesos, a.textMax, a.maxQty])
    ];
    if (!numbers.every((n) => Number.isFinite(n)))
      return void this.toast(EXTRAS_COPY.refused, 'warn');
    const taken = new Set(f.addOns.map((a) => a.id).filter(Boolean));
    const fields: OrderExtrasFields = {
      same_day_enabled: f.sameDayEnabled,
      same_day_percent: f.sameDayPercent,
      same_day_on_extras: f.sameDayOnExtras,
      sampler_product_id: f.samplerProductId === '' ? null : f.samplerProductId,
      sampler_max_qty: f.samplerMaxQty,
      box_sizes: f.boxSizes.map((b) => ({
        size: b.size,
        charge_cents: pesosToCentavos(b.chargePesos),
        active: b.active
      })),
      add_ons: f.addOns.map((a) => {
        const id = a.id || addOnId(a.name, taken);
        taken.add(id);
        return {
          id,
          name: a.name,
          price_cents: pesosToCentavos(a.pricePesos),
          active: a.active,
          variants: a.variants,
          text_label: a.textLabel.trim() === '' ? null : a.textLabel,
          text_max: a.textMax,
          max_qty: a.maxQty
        };
      })
    };
    const problem = orderExtrasError(fields);
    if (problem) return void this.toast(problem, 'warn');
    if (!this.shopClient || !expectedUpdatedAt) return void this.toast(STAFF_COPY.offline, 'warn');
    const outcome = await saveOrderExtras(this.shopClient, fields, expectedUpdatedAt);
    if (outcome === 'saved') {
      this.toast(EXTRAS_COPY.saved);
      this.closeSheet();
      await this.loadOrderExtras();
    } else if (outcome === 'conflict') {
      this.toast(EXTRAS_COPY.conflict, 'warn');
      await this.openOrderExtras();
    } else this.toast(outcome === 'refused' ? EXTRAS_COPY.refused : STAFF_COPY.offline, 'warn');
  }

  // ------------------------------------------------------------------ D4: the owner's upcoming bazaars

  /** Reads the owner's bookings (the gate calls it once the owner is verified). False when it could not. */
  async loadScheduledEvents(client: ScheduledClient | null): Promise<boolean> {
    if (client) this.scheduledClient = client;
    const use = client ?? this.scheduledClient;
    if (!isLiveMode() || !use) return false;
    try {
      this.scheduledRows = await fetchScheduledEvents(use);
    } catch {
      return false;
    }
    this.forceUpdate();
    void this.retryPendingLink(use);
    return true;
  }

  /**
   * A start whose link to its booking was not confirmed is retried whenever the list loads. The database books the
   * stall rent with the first link and answers a repeat harmlessly, so retrying can never book it twice.
   */
  private async retryPendingLink(client: ScheduledClient): Promise<void> {
    let again = false;
    for (const pending of readPendingLinks()) {
      const linked = await linkScheduledEvent(client, pending.scheduledId, pending.eventId);
      if (linked === 'failed') continue;
      clearPendingLink(pending);
      again = true;
      if (linked === 'first') this.showRentBooked(pending.eventId, pending.rentCents);
    }
    if (again) await this.loadScheduledEvents(null);
  }

  /**
   * The database has just booked a booking's stall rent. When that event is the one on screen, the engine's local
   * expense row shows it in the event's list and the close-out (display only, never sent: the server has it);
   * otherwise she is only told.
   */
  private showRentBooked(eventId: string, rentCents: number): void {
    if (rentCents <= 0) return;
    // After the start has landed in the state, which is what says whether this event is the one on screen.
    this.afterUpdate(() => {
      const event = this.state.event as LiveEvent | null;
      if (event?.id === eventId && this.localEventExpense)
        this.localEventExpense(SCHEDULED_COPY.rentLabel, centavosToPesos(rentCents), 'Bazaar rent');
      else this.toast(SCHEDULED_COPY.rentBooked(pesoText(rentCents)));
    });
  }

  private openScheduled = async (): Promise<void> => {
    if (!(await this.loadScheduledEvents(null)) || !this.scheduledRows) {
      this.toast(STAFF_COPY.offline, 'warn');
      return;
    }
    this.scheduledNewId = crypto.randomUUID();
    this.sheet('scheduledevents', {});
  };

  private liveScheduledVals(): OpsVals['liveScheduled'] {
    const sh = this.state.sheet as FlavourSheetState | null;
    const rows = this.scheduledRows;
    if (this.state.role !== 'owner' || sh?.kind !== 'scheduledevents' || !rows) return null;
    return {
      online: this.state.online && (typeof navigator === 'undefined' || navigator.onLine),
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        startsOn: r.startsOn,
        endsOn: r.endsOn,
        place: r.place,
        rentPesos: centavosToPesos(r.rentCents),
        active: r.active,
        started: r.started
      })),
      newId: this.scheduledNewId,
      version: this.scheduledVersion,
      save: (form: LiveScheduledRow[]) => void this.saveScheduledForm(form),
      close: () => this.closeSheet()
    };
  }

  /** Saves each booking that is new or changed, one at a time and each with its own stamp; stops at the first failure. */
  private async saveScheduledForm(form: LiveScheduledRow[]): Promise<void> {
    const client = this.scheduledClient;
    const before = this.scheduledRows ?? [];
    if (!client) return void this.toast(STAFF_COPY.offline, 'warn');
    if (form.some((r) => !Number.isFinite(r.rentPesos)))
      return void this.toast(SCHEDULED_COPY.refused, 'warn');
    const jobs = form.flatMap((r) => {
      const fields = {
        id: r.id,
        name: r.name,
        startsOn: r.startsOn,
        endsOn: r.endsOn,
        place: r.place,
        rentCents: pesosToCentavos(r.rentPesos),
        active: r.active
      };
      const was = before.find((b) => b.id === r.id);
      const same =
        !!was &&
        was.name === fields.name.trim() &&
        was.startsOn === fields.startsOn &&
        was.endsOn === fields.endsOn &&
        was.place === fields.place.trim() &&
        was.rentCents === fields.rentCents &&
        was.active === fields.active;
      return same ? [] : [{ fields, stamp: was?.updatedAt ?? null }];
    });
    for (const job of jobs) {
      const problem = scheduledEventError(job.fields);
      if (problem) return void this.toast(problem, 'warn');
    }
    for (const job of jobs) {
      const outcome = await saveScheduledEvent(client, job.fields, job.stamp);
      if (outcome === 'saved') continue;
      await this.loadScheduledEvents(null);
      // The blank row must not reuse an id the list now holds (a create whose reply was lost).
      const taken = (this.scheduledRows ?? []).some((r) => r.id === this.scheduledNewId);
      if (outcome === 'conflict' || taken) {
        this.scheduledNewId = crypto.randomUUID();
        this.scheduledVersion += 1;
      }
      if (outcome === 'conflict') {
        this.toast(SCHEDULED_COPY.conflict, 'warn');
        this.forceUpdate();
      } else
        this.toast(outcome === 'refused' ? SCHEDULED_COPY.refused : STAFF_COPY.offline, 'warn');
      return;
    }
    this.toast(SCHEDULED_COPY.saved);
    await this.loadScheduledEvents(null);
    this.closeSheet();
  }

  /**
   * The Bazaar screen's "Start an event" list in live mode: the owner's upcoming bookings, then one row to start an
   * event that was never booked. The ported list (two prototype events) is never shown.
   */
  private liveBazaarEvents(): OpsVals['events'] {
    const bazaar = this as unknown as BazaarActions;
    const today = manilaToday();
    const rows = upcomingEvents(this.scheduledRows ?? [], today).map((row) => ({
      name: row.name,
      date: dateRange(row.startsOn, row.endsOn),
      place: row.place || SCHEDULED_COPY.unbookedPlace,
      go: () => {
        this.pendingSchedule = row;
        bazaar.startEvent({ name: row.name, date: dateRange(row.startsOn, row.endsOn) });
      }
    }));
    const label = dateRange(today, today);
    rows.push({
      name: SCHEDULED_COPY.unbookedTitle,
      date: label,
      place: SCHEDULED_COPY.unbookedPlace,
      go: () => {
        this.pendingSchedule = null;
        bazaar.startEvent({ name: 'Bazaar · ' + label, date: label });
      }
    });
    return rows;
  }

  /** The event is open: record which booking it was, and book the stall rent as an event expense, once. */
  private async afterScheduledStart(row: ScheduledEvent, eventId: string): Promise<void> {
    const client = this.scheduledClient;
    const linked = client ? await linkScheduledEvent(client, row.id, eventId) : 'failed';
    if (linked === 'failed') {
      // The database books the rent with the first link; keep the pair until a retry is confirmed.
      savePendingLink({ scheduledId: row.id, eventId, rentCents: row.rentCents, at: Date.now() });
      this.toast(SCHEDULED_COPY.linkPending, 'warn');
    } else if (linked === 'first') {
      this.showRentBooked(eventId, row.rentCents);
    }
    await this.loadScheduledEvents(null);
  }

  // ------------------------------------------------------------------ A4: the owner's recipes

  /**
   * Reads the owner's recipes (the gate calls it once the flavour list is in: a recipe for a flavour the screens do not
   * know is ignored). `refresh` is the flavour whose local edit the read replaces (it was just saved, or conflicted);
   * an unsaved edit on any other flavour is kept.
   */
  async loadRecipes(client: RecipeClient | null, refresh?: string): Promise<boolean> {
    if (client) this.recipeClient = client;
    const use = client ?? this.recipeClient;
    if (!isLiveMode() || !use) return false;
    const seq = (this.recipeLoadSeq += 1);
    let rows: Recipe[];
    try {
      rows = await fetchRecipes(use);
    } catch {
      return false;
    }
    // A newer read started meanwhile: it will apply, an older answer must not bring back an older stamp.
    if (seq !== this.recipeLoadSeq) return true;
    // Anything typed before the first read was on an empty placeholder: the saved recipe replaces it.
    const first = this.recipeRows === null;
    this.recipeRows = rows;
    const dirty = (this.state as unknown as RecipeState).recipeDirty ?? {};
    for (const p of PRODUCTS)
      if (first || !dirty[p.id] || p.id === refresh)
        this.recipeBaseStamp[p.id] = rows.find((r) => r.productId === p.id)?.updatedAt ?? null;
    this.setState((s) => this.recipesPatch(s as unknown as RecipeState, refresh, first));
    return true;
  }

  private async loadRecipeDrafts(session = this.recipeDraftSession): Promise<void> {
    const isOpen = () => (this.state.sheet as { kind?: string } | null)?.kind === 'recipedrafts';
    if (session !== this.recipeDraftSession || !isOpen()) return;
    if (this.state.role !== 'owner' || !isLiveMode() || !this.recipeClient) {
      this.recipeDraftError = 'Recipe drafts are available to the owner in live mode.';
      this.setState({});
      return;
    }
    const seq = ++this.recipeDraftLoadSeq;
    this.recipeDraftLoading = true;
    this.recipeDraftError = null;
    this.setState({});
    try {
      const rows = await fetchRecipeDrafts(
        this.recipeClient,
        PRODUCTS.map((product) => product.id)
      );
      if (
        session !== this.recipeDraftSession ||
        seq !== this.recipeDraftLoadSeq ||
        !isOpen() ||
        this.state.role !== 'owner'
      )
        return;
      this.recipeDraftRows = rows;
    } catch (error) {
      if (session !== this.recipeDraftSession || seq !== this.recipeDraftLoadSeq || !isOpen())
        return;
      this.recipeDraftError =
        error instanceof Error ? error.message : 'Recipe drafts could not be read.';
    } finally {
      if (session === this.recipeDraftSession && seq === this.recipeDraftLoadSeq) {
        this.recipeDraftLoading = false;
        this.setState({});
      }
    }
  }

  private openRecipeDrafts = (): void => {
    if (this.state.role !== 'owner' || !isLiveMode()) return;
    const session = ++this.recipeDraftSession;
    this.recipeDraftLoadSeq++;
    this.recipeDraftRows = null;
    this.recipeDraftEditing = null;
    this.recipeDraftBusy = false;
    this.recipeDraftLoading = false;
    this.recipeDraftError = null;
    this.sheet('recipedrafts', {});
    this.afterUpdate(() => void this.loadRecipeDrafts(session));
  };

  private liveRecipeDraftsVals(): OpsVals['liveRecipeDrafts'] {
    const sh = this.state.sheet as { kind?: string } | null;
    if (this.state.role !== 'owner' || !isLiveMode() || sh?.kind !== 'recipedrafts') return null;
    const session = this.recipeDraftSession;
    const rows = this.recipeDraftRows;
    return {
      loading: this.recipeDraftLoading,
      loaded: rows !== null,
      busy: this.recipeDraftBusy,
      error: this.recipeDraftError,
      selectedName: this.recipeDraftEditing
        ? (PRODUCTS.find((product) => product.id === this.recipeDraftEditing?.productId)?.name ??
          null)
        : null,
      rows:
        rows === null
          ? []
          : PRODUCTS.map((product) => {
              const draft = rows.find((row) => row.productId === product.id);
              return {
                productId: product.id,
                name: product.name,
                yield: draft?.yield ?? 14,
                saved: !!draft
              };
            }),
      editing: this.recipeDraftEditing,
      open: (productId) => {
        if (
          session !== this.recipeDraftSession ||
          sh?.kind !== 'recipedrafts' ||
          !rows ||
          this.recipeDraftBusy ||
          !PRODUCTS.some((product) => product.id === productId)
        )
          return;
        const draft = rows.find((row) => row.productId === productId);
        this.recipeDraftEditing = {
          productId,
          yield: draft?.yield ?? 14,
          sourceText: draft?.sourceText ?? '',
          expectedUpdatedAt: draft?.updatedAt ?? null
        };
        this.recipeDraftError = null;
        this.setState({});
      },
      save: (fields) => void this.saveRecipeDraftForm(fields, session),
      back: () => {
        if (session !== this.recipeDraftSession || this.recipeDraftBusy) return;
        this.recipeDraftEditing = null;
        this.recipeDraftError = null;
        this.setState({});
      },
      reload: () => void this.loadRecipeDrafts(session),
      close: () => {
        if (session !== this.recipeDraftSession) return;
        this.recipeDraftSession++;
        this.recipeDraftLoadSeq++;
        this.recipeDraftEditing = null;
        this.recipeDraftRows = null;
        this.recipeDraftLoading = false;
        this.recipeDraftBusy = false;
        this.recipeDraftError = null;
        this.closeSheet();
      }
    };
  }

  private async saveRecipeDraftForm(
    fields: LiveRecipeDraftEdit,
    session = this.recipeDraftSession
  ): Promise<void> {
    const isOpen = () => (this.state.sheet as { kind?: string } | null)?.kind === 'recipedrafts';
    if (
      session !== this.recipeDraftSession ||
      this.recipeDraftBusy ||
      this.state.role !== 'owner' ||
      !isLiveMode() ||
      !this.recipeClient ||
      !this.recipeDraftRows ||
      !this.recipeDraftEditing ||
      fields.productId !== this.recipeDraftEditing.productId ||
      fields.expectedUpdatedAt !== this.recipeDraftEditing.expectedUpdatedAt
    )
      return;
    const editor = this.recipeDraftEditing;
    this.recipeDraftBusy = true;
    this.recipeDraftError = null;
    this.setState({});
    const result = await saveRecipeDraft(
      this.recipeClient,
      PRODUCTS.map((product) => product.id),
      fields
    );
    if (session !== this.recipeDraftSession) return;
    if (this.state.role !== 'owner' || !isOpen() || this.recipeDraftEditing !== editor) {
      this.recipeDraftBusy = false;
      this.setState({});
      return;
    }
    if (result.outcome === 'saved' && result.updatedAt) {
      const row: RecipeDraft = {
        productId: fields.productId,
        yield: fields.yield,
        sourceText: fields.sourceText,
        updatedAt: result.updatedAt
      };
      this.recipeDraftRows = [
        ...this.recipeDraftRows.filter((item) => item.productId !== fields.productId),
        row
      ];
      this.recipeDraftEditing = null;
    } else if (result.outcome === 'conflict') {
      this.recipeDraftError =
        'This draft changed elsewhere. Your text is preserved; go back and reload before saving again.';
    } else {
      this.recipeDraftError =
        result.error ??
        (result.outcome === 'refused'
          ? 'The draft was refused. Check the yield and recipe text.'
          : 'Draft was not saved. Your text is preserved.');
    }
    this.recipeDraftBusy = false;
    this.setState({});
  }

  /** The state keys the recipes screen reads: the saved recipe for each flavour, or an empty one, never the prototype's. */
  private recipesPatch(
    s: RecipeState,
    refresh?: string,
    discardEdits = false
  ): Record<string, unknown> {
    // With no read yet (a helper, or a read that failed) the screens still get empty recipes, never the prototype's.
    const mapped = engineRecipes(
      this.recipeRows ?? [],
      PRODUCTS.map((p) => p.id)
    );
    const dirty: Record<string, boolean> = {};
    const recipes = { ...mapped.recipes } as Record<string, unknown>;
    for (const pid of Object.keys(mapped.recipes)) {
      if (!discardEdits && s.recipeDirty?.[pid] && pid !== refresh && s.recipes?.[pid]) {
        recipes[pid] = s.recipes[pid];
        dirty[pid] = true;
      }
    }
    return {
      recipes,
      recipeBase: mapped.recipeBase,
      recipeVer: mapped.recipeVer,
      recipeHistory: mapped.recipeHistory,
      recipeDirty: dirty
    };
  }

  /** The ported "Save" on a recipe: the database makes the new version; the screen then shows what it holds. */
  private async liveRecipeSave(pid: string): Promise<void> {
    const client = this.recipeClient;
    const r = (this.state as unknown as RecipeState).recipes[pid];
    if (!r) return;
    const blank = r.ing.filter((i) => !String(i[0]).trim()).length;
    if (blank)
      return void this.toast(
        plural(blank, 'ingredient still has', 'ingredients still have') + ' no name.',
        'warn'
      );
    if (this.state.role !== 'owner' || !client || !this.recipeRows)
      return void this.toast(STAFF_COPY.offline, 'warn');
    const fields = {
      productId: pid,
      yield: r.yield,
      lines: r.ing.map((i) => ({ name: String(i[0]), qty: Number(i[1]), unit: String(i[2]) }))
    };
    const problem = recipeError(fields);
    if (problem) return void this.toast(problem, 'warn');
    const was = this.recipeRows.find((x) => x.productId === pid);
    // Against the stamp this edit was started on, never a newer one read since: if the recipe moved meanwhile, the
    // database says so (a conflict) instead of being overwritten.
    const { outcome, version, updatedAt } = await saveRecipe(
      client,
      fields,
      this.recipeBaseStamp[pid] ?? null
    );
    if (outcome === 'saved' && updatedAt) this.recipeBaseStamp[pid] = updatedAt;
    // A saved recipe, or another person's newer one, replaces this edit; a refusal or a lost connection keeps it.
    const read = await this.loadRecipes(
      null,
      outcome === 'saved' || outcome === 'conflict' ? pid : undefined
    );
    if (outcome === 'saved') {
      if (!read && version !== null && updatedAt) {
        // The read after the save failed: the answer to the save is enough to show it saved and to save again.
        this.recipeRows = (this.recipeRows ?? []).map((x) =>
          x.productId === pid ? { ...x, version, updatedAt } : x
        );
        this.setState((s) => {
          const t = s as unknown as RecipeState & { recipeVer: Record<string, number> };
          const dirty = { ...(t.recipeDirty ?? {}) };
          delete dirty[pid];
          return { recipeDirty: dirty, recipeVer: { ...t.recipeVer, [pid]: version } };
        });
      }
      this.toast(
        !was
          ? RECIPE_COPY.created
          : version !== null && version === was.version
            ? RECIPE_COPY.unchanged
            : RECIPE_COPY.saved(version ?? 0)
      );
    } else if (outcome === 'conflict') this.toast(RECIPE_COPY.conflict, 'warn');
    else this.toast(outcome === 'refused' ? RECIPE_COPY.refused : STAFF_COPY.offline, 'warn');
  }

  // ------------------------------------------------------------------ A3: the owner's stock catalogue

  /** Reads the owner's items, suppliers and prices (the gate calls it once the owner is verified). False when it could not. */
  async loadStockCatalogue(client: StockClient | null): Promise<boolean> {
    if (client) this.stockClient = client;
    const use = client ?? this.stockClient;
    if (!isLiveMode() || !use) return false;
    try {
      this.stockCatalogue = await fetchStockCatalogue(use);
    } catch {
      return false;
    }
    this.applyStockCatalogue();
    // What was last paid for each item, which the cost per unit is worked out from (a failed read leaves what was there).
    try {
      const paid = enginePaid(await fetchLastPaid(use as LedgerClient));
      this.setState({ paid });
    } catch {
      /* the catalogue's own best-buy prices stand in */
    }
    return true;
  }

  /**
   * The inventory rows go into state; the suppliers, pack sizes and best buys go into the engine's own constants,
   * which nothing in state reaches (see engine-catalogue.ts). The suppliers screen opens on a supplier that exists.
   */
  private applyStockCatalogue(): void {
    const c = this.stockCatalogue;
    if (!c) return;
    fillLiveCatalogue(c);
    const first = firstSupplierName();
    // The database's quantities always win: every change of a quantity is a movement (C1).
    this.setState((s) => ({
      inv: engineInventory(c),
      supplierOpen: currentSuppliers().some((x) => x.name === s.supplierOpen)
        ? s.supplierOpen
        : first
    }));
  }

  private openStockItems = async (): Promise<void> => {
    if (!(await this.loadStockCatalogue(null)) || !this.stockCatalogue) {
      this.toast(STAFF_COPY.offline, 'warn');
      return;
    }
    this.sheet('stockitems', {});
  };

  private openStockSuppliers = async (): Promise<void> => {
    if (!(await this.loadStockCatalogue(null)) || !this.stockCatalogue) {
      this.toast(STAFF_COPY.offline, 'warn');
      return;
    }
    this.sheet('stocksuppliers', {});
  };

  private stockOnline(): boolean {
    return this.state.online && (typeof navigator === 'undefined' || navigator.onLine);
  }

  private liveStockItemsVals(): OpsVals['liveStockItems'] {
    const sh = this.state.sheet as StockSheetState | null;
    const c = this.stockCatalogue;
    if (this.state.role !== 'owner' || sh?.kind !== 'stockitems' || !c) return null;
    const names = new Map(c.suppliers.map((s) => [s.id, s.name]));
    const found = sh.id ? c.items.find((i) => i.id === sh.id) : undefined;
    let editing: LiveStockItemEdit | null = null;
    if (sh.isNew)
      editing = {
        id: this.stockNewId,
        isNew: true,
        name: '',
        category: 'Ingredients',
        unit: 'g',
        parLevel: 0,
        packSize: null,
        packLabel: '',
        supplierId: null,
        useByDays: null,
        active: true
      };
    else if (found)
      editing = {
        id: found.id,
        isNew: false,
        name: found.name,
        category: found.category,
        unit: found.unit,
        parLevel: found.parLevel,
        packSize: found.packSize,
        packLabel: found.packLabel,
        supplierId: found.supplierId,
        useByDays: found.useByDays,
        active: found.active
      };
    return {
      online: this.stockOnline(),
      rows: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        unit: i.unit,
        supplierName: (i.supplierId && names.get(i.supplierId)) || 'No supplier',
        active: i.active
      })),
      editing,
      suppliers: c.suppliers.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name })),
      version: this.stockVersion,
      add: () => {
        this.stockNewId = crypto.randomUUID();
        this.sheet('stockitems', { isNew: true });
      },
      edit: (id) => this.sheet('stockitems', { id }),
      save: (f) => void this.saveStockItemForm(f),
      back: () => this.sheet('stockitems', {}),
      close: () => this.closeSheet()
    };
  }

  private liveStockSuppliersVals(): OpsVals['liveStockSuppliers'] {
    const sh = this.state.sheet as StockSheetState | null;
    const c = this.stockCatalogue;
    if (this.state.role !== 'owner' || sh?.kind !== 'stocksuppliers' || !c) return null;
    const found = sh.id ? c.suppliers.find((s) => s.id === sh.id) : undefined;
    const pesos = (cents: number) => '₱' + centavosToPesos(cents).toLocaleString('en-PH');
    let editing: LiveStockSupplierEdit | null = null;
    if (sh.isNew)
      editing = {
        id: this.stockNewId,
        isNew: true,
        name: '',
        phone: '',
        notes: '',
        place: '',
        active: true,
        prices: [],
        newPriceId: this.stockNewPriceId
      };
    else if (found)
      editing = {
        id: found.id,
        isNew: false,
        name: found.name,
        phone: found.phone,
        notes: found.notes,
        place: found.place,
        active: found.active,
        prices: c.prices
          .filter((p) => p.supplierId === found.id)
          .map((p): LiveStockPriceRow => ({
            id: p.id,
            itemName: p.itemName,
            packLabel: p.packLabel,
            pricePesos: centavosToPesos(p.priceCents),
            lastBought: p.lastBought,
            preferred: p.preferred,
            active: p.active,
            previousText: p.previousCents.length
              ? 'Before: ' + p.previousCents.map(pesos).join(', ')
              : 'First price'
          })),
        newPriceId: this.stockNewPriceId
      };
    return {
      online: this.stockOnline(),
      rows: c.suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        place: s.place,
        priceCount: c.prices.filter((p) => p.supplierId === s.id && p.active).length,
        active: s.active
      })),
      editing,
      itemNames: c.items.filter((i) => i.active).map((i) => i.name),
      version: this.stockVersion,
      add: () => {
        this.stockNewId = crypto.randomUUID();
        this.sheet('stocksuppliers', { isNew: true });
      },
      edit: (id) => {
        this.stockNewPriceId = crypto.randomUUID();
        this.sheet('stocksuppliers', { id });
      },
      save: (f) => void this.saveStockSupplierForm(f),
      back: () => this.sheet('stocksuppliers', {}),
      close: () => this.closeSheet()
    };
  }

  /** After a save: on success the list is re-read and shown; otherwise the list is re-read and she is told why. */
  private async finishStockSave(
    outcome: SaveOutcome,
    kind: 'stockitems' | 'stocksuppliers',
    refused: string
  ): Promise<void> {
    await this.loadStockCatalogue(null);
    if (outcome === 'saved') {
      this.toast(STOCK_COPY.saved);
      this.sheet(kind, {});
      return;
    }
    // A price create whose reply was lost is saved: the blank price row must not reuse its id (it would overwrite
    // that price). A new item or supplier keeps its id, so an identical retry is answered, not duplicated; only a
    // different body under a saved id (a conflict) gets a fresh one.
    const c = this.stockCatalogue;
    const takenPrice = !!c && c.prices.some((p) => p.id === this.stockNewPriceId);
    if (takenPrice) this.stockNewPriceId = crypto.randomUUID();
    const takenNew =
      !!c &&
      (c.items.some((i) => i.id === this.stockNewId) ||
        c.suppliers.some((x) => x.id === this.stockNewId));
    if (takenNew && outcome === 'conflict') this.stockNewId = crypto.randomUUID();
    if (takenPrice || outcome === 'conflict') this.stockVersion += 1;
    if (outcome === 'conflict') {
      this.toast(STOCK_COPY.conflict, 'warn');
      this.forceUpdate();
    } else this.toast(outcome === 'refused' ? refused : STAFF_COPY.offline, 'warn');
  }

  private async saveStockItemForm(f: LiveStockItemEdit): Promise<void> {
    const client = this.stockClient;
    const c = this.stockCatalogue;
    if (!client || !c) return void this.toast(STAFF_COPY.offline, 'warn');
    const fields: ItemFields = {
      id: f.id,
      name: f.name,
      category: f.category,
      unit: f.unit,
      parLevel: f.parLevel,
      packSize: f.packSize,
      packLabel: f.packLabel,
      supplierId: f.supplierId,
      useByDays: f.useByDays,
      active: f.active
    };
    const problem = itemError(fields);
    if (problem) return void this.toast(problem, 'warn');
    const was = c.items.find((i) => i.id === f.id);
    const outcome = await saveStockItem(client, fields, was?.updatedAt ?? null);
    await this.finishStockSave(outcome, 'stockitems', STOCK_COPY.refusedItem);
  }

  /** The supplier, then each new or changed price, one at a time and each with its own stamp; stops at the first failure. */
  private async saveStockSupplierForm(f: LiveStockSupplierEdit): Promise<void> {
    const client = this.stockClient;
    const c = this.stockCatalogue;
    if (!client || !c) return void this.toast(STAFF_COPY.offline, 'warn');
    const supplier = {
      id: f.id,
      name: f.name,
      phone: f.phone,
      notes: f.notes,
      place: f.place,
      active: f.active
    };
    const problem = supplierError(supplier);
    if (problem) return void this.toast(problem, 'warn');
    if (f.prices.some((r) => !Number.isFinite(r.pricePesos)))
      return void this.toast(STOCK_COPY.refusedSupplier, 'warn');
    const priceJobs: Array<{ fields: PriceFields; stamp: string | null }> = [];
    for (const r of f.prices) {
      const fields: PriceFields = {
        id: r.id,
        supplierId: f.id,
        itemName: r.itemName,
        packLabel: r.packLabel,
        priceCents: pesosToCentavos(r.pricePesos),
        lastBought: r.lastBought,
        preferred: r.preferred,
        active: r.active
      };
      const bad = priceError(fields);
      if (bad) return void this.toast(bad, 'warn');
      const was = c.prices.find((p) => p.id === r.id);
      const same =
        !!was &&
        was.itemName === fields.itemName.trim() &&
        was.packLabel === fields.packLabel.trim() &&
        was.priceCents === fields.priceCents &&
        was.lastBought === fields.lastBought.trim() &&
        was.preferred === fields.preferred &&
        was.active === fields.active;
      if (!same) priceJobs.push({ fields, stamp: was?.updatedAt ?? null });
    }
    const wasSupplier = c.suppliers.find((s) => s.id === f.id);
    const supplierSame =
      !!wasSupplier &&
      wasSupplier.name === supplier.name.trim() &&
      wasSupplier.phone === supplier.phone.trim() &&
      wasSupplier.notes === supplier.notes.trim() &&
      wasSupplier.place === supplier.place.trim() &&
      wasSupplier.active === supplier.active;
    if (!supplierSame) {
      const outcome = await saveSupplier(client, supplier, wasSupplier?.updatedAt ?? null);
      if (outcome !== 'saved')
        return void (await this.finishStockSave(
          outcome,
          'stocksuppliers',
          STOCK_COPY.refusedSupplier
        ));
    }
    for (const job of priceJobs) {
      const outcome = await saveSupplierPrice(client, job.fields, job.stamp);
      if (outcome !== 'saved')
        return void (await this.finishStockSave(
          outcome,
          'stocksuppliers',
          STOCK_COPY.refusedSupplier
        ));
    }
    await this.finishStockSave('saved', 'stocksuppliers', STOCK_COPY.refusedSupplier);
  }

  /** The ported "Add item" sheet: the item is created in the catalogue. Its quantity is not kept (stock ledger, C1). */
  private async liveAddInv(
    cat: string,
    name: string,
    qty: unknown,
    unit: string,
    level: unknown,
    supplier: string
  ): Promise<void> {
    const client = this.stockClient;
    const c = this.stockCatalogue;
    if (this.state.role !== 'owner' || !client || !c)
      return void this.toast(STAFF_COPY.offline, 'warn');
    const sup = c.suppliers.find((s) => s.active && s.name === supplier);
    const fields: ItemFields = {
      id: crypto.randomUUID(),
      name: String(name ?? '').trim(),
      category: cat === 'Packaging' ? 'Packaging' : 'Ingredients',
      unit: String(unit || 'g').trim(),
      parLevel: Number(level) || 0,
      packSize: null,
      packLabel: '',
      supplierId: sup?.id ?? null,
      useByDays: null,
      active: true
    };
    const problem = itemError(fields);
    if (problem) return void this.toast(problem, 'warn');
    const outcome = await saveStockItem(client, fields, null);
    if (outcome !== 'saved') {
      return void this.toast(
        outcome === 'refused' ? STOCK_COPY.refusedItem : STAFF_COPY.offline,
        'warn'
      );
    }
    const opening =
      Number(qty) > 0
        ? await this.recordMovement(fields.id, 'opening', Number(qty), null, '', '')
        : true;
    await this.loadStockCatalogue(null);
    this.setState({ sheet: null });
    if (opening) this.toast(fields.name + ' added to ' + fields.category + '.');
    else this.toast(STOCK_COPY.itemAddedNoOpening, 'warn');
  }

  // ------------------------------------------------------------------ C1: the stock ledger

  /** The engine's toasts offer an Undo that would change only this screen; a stock change is a movement, so none is offered. */
  private withoutUndo(fn: () => void): void {
    const original = this.toast;
    this.toast = (message: string, tone?: 'ok' | 'warn') => original(message, tone);
    try {
      fn();
    } finally {
      this.toast = original;
    }
  }

  private stockItem(name: string) {
    return this.stockCatalogue?.items.find((i) => i.active && i.name === name);
  }

  /**
   * Records one movement and, whatever happens, re-reads the catalogue so the screen shows what the database holds.
   * Returns whether it was saved; if not, she is told nothing changed.
   */
  private async recordMovement(
    itemId: string,
    kind: MovementFields['kind'],
    qty: number,
    costCents: number | null,
    supplier: string,
    reason: string,
    at?: number
  ): Promise<boolean> {
    const client = this.stockClient as LedgerClient | null;
    if (this.state.role !== 'owner') {
      this.toast(STOCK_COPY.ownerOnly, 'warn');
      return false;
    }
    if (!client) {
      this.toast(STAFF_COPY.offline, 'warn');
      return false;
    }
    const rounded = Math.round(qty * 1000) / 1000;
    // The same entry repeated after an unconfirmed answer is the same movement (same id, same time), never a second one.
    const signature = [itemId, kind, rounded, costCents, supplier.trim(), reason.trim()].join('|');
    const fields: MovementFields = this.pendingMovements.get(signature) ?? {
      id: crypto.randomUUID(),
      itemId,
      kind,
      qty: rounded,
      costCents,
      supplier,
      reason,
      at: at ?? Date.now()
    };
    const problem = movementError(fields);
    if (problem) {
      this.toast(problem, 'warn');
      await this.loadStockCatalogue(null);
      return false;
    }
    const result = await recordStockMovement(client, fields);
    if (result.outcome === 'offline') this.pendingMovements.set(signature, fields);
    else this.pendingMovements.delete(signature);
    await this.loadStockCatalogue(null);
    if (result.outcome !== 'saved') {
      this.toast(
        result.outcome === 'refused' ? STOCK_COPY.movementRefused : STOCK_COPY.movementNotSaved,
        'warn'
      );
      return false;
    }
    return true;
  }

  /** The ported "Set to" on an item: the total counted becomes a count movement. */
  private async liveSaveInv(name: string, qty: unknown): Promise<void> {
    const item = this.stockItem(name);
    const n = Number(qty);
    if (!item || qty === '' || !Number.isFinite(n) || n < 0)
      return void this.toast('Enter a quantity of 0 or more.', 'warn');
    if (await this.recordMovement(item.id, 'count', n, null, '', '')) {
      this.setState({ sheet: null });
      this.toast(name + ' updated.');
    } else this.setState({ sheet: null });
  }

  /** The ported add and subtract on an item: a signed adjustment with a fixed reason. */
  private async liveAdjustInv(name: string, qty: unknown, dir: number): Promise<void> {
    const item = this.stockItem(name);
    const n = Math.abs(Number(qty) || 0);
    if (!n)
      return void this.toast('Type how much to ' + (dir < 0 ? 'subtract' : 'add') + '.', 'warn');
    if (!item) return;
    const before = item.onHand;
    if (await this.recordMovement(item.id, 'adjust', dir * n, null, '', STOCK_COPY.adjustReason)) {
      const after = this.stockItem(name)?.onHand ?? before;
      this.setState({ sheet: null });
      this.toast(name + ': ' + before + ' ' + item.unit + ' → ' + after + ' ' + item.unit + '.');
    } else this.setState({ sheet: null });
  }

  /** The ported waste sheet for raw stock: a waste movement (never more than is there), with the cost the engine works out. */
  private async liveWaste(name: string, qty: unknown, why: string): Promise<void> {
    const item = this.stockItem(name);
    const n = Number(qty) || 0;
    if (!n) return void this.toast('Enter how much went to waste.', 'warn');
    if (!item) return;
    const cost = Math.round(n * (this as unknown as InvActions).costPerUnit(name));
    if (await this.recordMovement(item.id, 'waste', n, null, '', why || 'Spoiled')) {
      this.setState({ sheet: null });
      this.toast(
        n +
          ' of ' +
          name.toLowerCase() +
          ' written off. About ₱' +
          cost.toLocaleString('en-PH') +
          ' of stock gone. It was already expensed when you bought it, so profit does not move twice.',
        'warn'
      );
    } else this.setState({ sheet: null });
  }

  /** A delivery came in: a receipt movement, with what was paid, which also writes the cost to the books once. */
  private async liveReceipt(
    name: string,
    qty: number,
    spendPesos: number,
    supplier: string
  ): Promise<boolean> {
    const item = this.stockItem(name);
    if (!item) {
      await this.loadStockCatalogue(null);
      return false;
    }
    const cents =
      Number.isFinite(spendPesos) && spendPesos > 0 ? pesosToCentavos(spendPesos) : null;
    return this.recordMovement(
      item.id,
      'receipt',
      qty,
      cents,
      supplier === '—' ? '' : supplier,
      ''
    );
  }

  /**
   * The ported stocktake: each item counted becomes a count movement, taken at the moment it was entered (a delivery received
   * after that is refused, not wiped out). It stops at the first count that cannot be saved and keeps the rest on the count sheet.
   */
  private async liveReconcile(): Promise<void> {
    const stocktake = this.state.stocktake as { counts?: Record<string, string> } | null;
    const counts = { ...(stocktake?.counts ?? {}) } as Record<string, string>;
    const names = Object.keys(counts).filter((n) => counts[n] !== undefined && counts[n] !== '');
    let corrected = 0;
    let value = 0;
    let saved = 0;
    for (const name of names) {
      const item = this.stockItem(name);
      const counted = Number(counts[name]);
      if (!item || !Number.isFinite(counted) || counted < 0) break;
      const before = item.onHand;
      if (
        !(await this.recordMovement(item.id, 'count', counted, null, '', '', this.countedAt[name]))
      )
        break;
      saved += 1;
      delete counts[name];
      if (counted !== before) {
        corrected += 1;
        value += (counted - before) * (this as unknown as InvActions).costPerUnit(name);
      }
    }
    if (saved < names.length) {
      // Some are not in: what is unsaved stays on the count sheet.
      this.setState((s) => ({
        stocktake: s.stocktake ? { ...(s.stocktake as object), counts } : s.stocktake
      }));
      this.toast(STOCK_COPY.someSaved(saved, names.length), 'warn');
      return;
    }
    this.setState({ stocktake: null });
    if (!saved) return;
    const shown = Math.abs(Math.round(value)).toLocaleString('en-PH');
    this.toast(
      corrected === 0
        ? STOCK_COPY.counted(0)
        : STOCK_COPY.counted(corrected) +
            (value < 0
              ? ' ₱' + shown + ' of stock unaccounted for.'
              : ' ₱' + shown + ' more than your records said.'),
      corrected === 0 ? 'ok' : 'warn'
    );
  }

  /** The ported "Remove" button: the item is switched off (never deleted), so past records keep their history. */
  private async liveRemoveInv(name: string): Promise<void> {
    const client = this.stockClient;
    const item = this.stockCatalogue?.items.find((i) => i.active && i.name === name);
    if (this.state.role !== 'owner' || !client || !item)
      return void this.toast(STAFF_COPY.offline, 'warn');
    const outcome = await saveStockItem(
      client,
      {
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit,
        parLevel: item.parLevel,
        packSize: item.packSize,
        packLabel: item.packLabel,
        supplierId: item.supplierId,
        useByDays: item.useByDays,
        active: false
      },
      item.updatedAt
    );
    await this.loadStockCatalogue(null);
    if (outcome !== 'saved') {
      return void this.toast(
        outcome === 'conflict' ? STOCK_COPY.conflict : STAFF_COPY.offline,
        'warn'
      );
    }
    this.setState({ sheet: null });
    this.toast(name + ' ' + STOCK_COPY.removedNote, 'warn');
  }

  // ------------------------------------------------------------------ C2: production

  /** Reads the owner's batches, dough and baked counts (the live gate calls it once the owner is verified). False when it could not. */
  async loadProduction(client: ProductionClient | null): Promise<boolean> {
    if (client) this.productionClient = client;
    const use = client ?? this.productionClient;
    if (!isLiveMode() || !use) return false;
    const seq = (this.productionLoadSeq += 1);
    let rows;
    try {
      rows = await fetchProduction(use, (this.state as unknown as { dropNo: number }).dropNo);
    } catch {
      return false;
    }
    // A newer read started meanwhile: it will apply, an older answer must not bring back an older picture.
    if (seq !== this.productionLoadSeq) return true;
    this.applyProduction(rows);
    return true;
  }

  /**
   * The screens read the batches, the variances and the shortfalls straight from the database. The chilled dough and the baked
   * count are also changed by actions that are not recorded there yet (binned dough or cookies, the stall's stock), so a later
   * read moves them by what changed on the database since the last one instead of replacing them.
   */
  private applyProduction(rows: Production): void {
    const patch = engineProduction(rows, (pid) => this.flavourName(pid));
    const prev = this.lastProduction
      ? engineProduction(this.lastProduction, (pid) => this.flavourName(pid))
      : null;
    this.lastProduction = rows;
    this.setState((s: unknown) => {
      if (!prev) return patch;
      const st = s as {
        dough: Record<string, number>;
        baked: Record<string, number>;
        doughAt: Record<string, number>;
      };
      const moved = (
        now: Record<string, number>,
        was: Record<string, number>,
        cur: Record<string, number>
      ) => {
        const out: Record<string, number> = {};
        for (const pid of new Set([
          ...Object.keys(now),
          ...Object.keys(was),
          ...Object.keys(cur)
        ])) {
          const n = Math.max(0, (cur[pid] || 0) + (now[pid] || 0) - (was[pid] || 0));
          if (n > 0) out[pid] = n;
        }
        return out;
      };
      const dough = moved(patch.dough, prev.dough, st.dough ?? {});
      const doughAt: Record<string, number> = {};
      for (const pid of Object.keys(dough)) {
        const at = patch.doughAt[pid] ?? st.doughAt?.[pid];
        if (at !== undefined) doughAt[pid] = at;
      }
      return { ...patch, dough, doughAt, baked: moved(patch.baked, prev.baked, st.baked ?? {}) };
    });
  }

  /**
   * Sends one dough mix or batch. Returns the answer when it was recorded (an identical retry counts), else null after telling
   * her why. Nothing is re-read here: the engine's own bookkeeping runs next against the quantities it was shown.
   */
  private async recordProductionNow(
    f: Omit<ProductionFields, 'id' | 'at'>
  ): Promise<ProductionResult | null> {
    const client = this.productionClient;
    if (this.state.role !== 'owner') {
      this.toast(PRODUCTION_COPY.ownerOnly, 'warn');
      return null;
    }
    if (!client) {
      this.toast(STAFF_COPY.offline, 'warn');
      return null;
    }
    // A second tap while the first is being recorded does nothing: it would be a second record.
    if (this.productionBusy) return null;
    // The same entry repeated after an unconfirmed answer is the same record (same id, same time), never a second one.
    const signature = JSON.stringify([
      f.kind,
      f.productId,
      f.qty,
      f.target,
      f.rejects,
      Object.entries(f.adj).sort(),
      f.recipeVersion,
      f.dropNo
    ]);
    const fields: ProductionFields = this.pendingProduction.get(signature) ?? {
      ...f,
      id: crypto.randomUUID(),
      at: Date.now()
    };
    const problem = productionError(fields);
    if (problem) {
      this.toast(problem, 'warn');
      return null;
    }
    // Kept from before the call: whatever happens to the answer, this entry keeps its id until an answer says otherwise.
    this.pendingProduction.set(signature, fields);
    this.productionBusy = true;
    let result: ProductionResult;
    try {
      result = await recordProduction(client, fields);
    } finally {
      this.productionBusy = false;
    }
    if (result.outcome !== 'offline') this.pendingProduction.delete(signature);
    if (result.outcome === 'saved') return result;
    if (result.outcome === 'stale') void this.loadRecipes(null);
    this.toast(
      result.outcome === 'stale'
        ? PRODUCTION_COPY.stale
        : result.outcome === 'refused'
          ? PRODUCTION_COPY.refused
          : PRODUCTION_COPY.notSaved,
      'warn'
    );
    return null;
  }

  /**
   * The ported waste sheet for dough or baked cookies: recorded first, then the engine's own bookkeeping (the waste record, the
   * toast) with its own change to the counts undone, then the counts are read back. Anything the engine would refuse (more than is
   * there) is left to it, and nothing is recorded.
   */
  private async liveDiscard(
    run: () => void,
    qty: unknown,
    why: string,
    pid: string,
    kind: 'dough' | 'baked'
  ): Promise<void> {
    const st = this.state as unknown as {
      dropNo: number;
      dough: Record<string, number>;
      baked: Record<string, number>;
    };
    const n = Number(qty) || 0;
    const have = (kind === 'dough' ? st.dough : st.baked)[pid] || 0;
    if (!n || n > have) return run(); // the engine says what is wrong
    const client = this.productionClient;
    if (this.state.role !== 'owner') return void this.toast(PRODUCTION_COPY.ownerOnly, 'warn');
    if (!client) return void this.toast(STAFF_COPY.offline, 'warn');
    if (!Number.isInteger(n)) return void this.toast(PRODUCTION_COPY.discardWhole, 'warn');
    if (this.discardBusy) return;
    const reason = (why || 'Spoiled').trim().slice(0, 80) || 'Spoiled';
    const signature = JSON.stringify([kind, pid, n, reason, st.dropNo]);
    const fields: DiscardFields = this.pendingDiscards.get(signature) ?? {
      id: crypto.randomUUID(),
      kind,
      productId: pid,
      qty: n,
      reason,
      dropNo: st.dropNo,
      at: Date.now()
    };
    const problem = discardError(fields);
    if (problem) return void this.toast(problem, 'warn');
    this.pendingDiscards.set(signature, fields);
    this.discardBusy = true;
    let result;
    try {
      result = await recordDiscard(client, fields);
    } finally {
      this.discardBusy = false;
    }
    if (result.outcome !== 'offline') this.pendingDiscards.delete(signature);
    if (result.outcome !== 'saved') {
      this.toast(
        result.outcome === 'refused' ? PRODUCTION_COPY.refused : PRODUCTION_COPY.notSaved,
        'warn'
      );
      if (result.outcome === 'refused') await this.refreshProduction();
      return;
    }
    this.keepBookkeeping(run);
    await this.refreshProduction();
  }

  /** What the database holds now, for the screens (after every production action, whatever happened). */
  private async refreshProduction(): Promise<void> {
    await this.loadStockCatalogue(null);
    await this.loadProduction(null);
  }

  /**
   * Runs one of the engine's confirm actions for its own bookkeeping (the toast, what ran short, the screen it returns to), then
   * puts the dough and the baked count back as they were: the database's record moves them, once, when it is read back.
   */
  private keepBookkeeping(run: () => void): void {
    const before = this.state as unknown as { dough: unknown; baked: unknown; doughAt: unknown };
    const keep = { dough: before.dough, baked: before.baked, doughAt: before.doughAt };
    this.withoutUndo(run);
    this.setState(keep as never);
  }

  private installProductionOverrides(): void {
    const eng = this as unknown as ProductionActions;
    const keep = { confirmDough: eng.confirmDough, confirmBatch: eng.confirmBatch };
    eng.confirmDough = () => {
      const s = this.state as unknown as ProductionState;
      const dp = s.doughPrep;
      if (!dp) return;
      void (async () => {
        const done = await this.recordProductionNow({
          kind: 'dough',
          productId: dp.pid,
          qty: dp.balls,
          target: null,
          rejects: 0,
          adj: {},
          recipeVersion: s.recipeVer[dp.pid] ?? 1,
          dropNo: s.dropNo
        });
        if (!done) return;
        // The record is in. If the sheet is still open, the engine's own bookkeeping (the sheet, the toast) runs against the
        // quantities it showed; its own change to the dough is undone, because the database's record replaces it below.
        if ((this.state as unknown as ProductionState).doughPrep?.pid === dp.pid)
          this.keepBookkeeping(() => keep.confirmDough());
        else this.toast(PRODUCTION_COPY.recorded);
        await this.refreshProduction();
      })();
    };
    eng.confirmBatch = () => {
      const s = this.state as unknown as ProductionState;
      const b = s.batch;
      if (!b) return;
      void (async () => {
        const adj: Record<string, number> = {};
        for (const [name, steps] of Object.entries(b.adj ?? {})) if (steps) adj[name] = steps;
        const done = await this.recordProductionNow({
          kind: 'batch',
          productId: b.pid,
          qty: b.actual,
          target: b.target,
          rejects: b.rejects || 0,
          adj,
          recipeVersion: s.recipeVer[b.pid] ?? 1,
          dropNo: s.dropNo
        });
        if (!done) return;
        if ((this.state as unknown as ProductionState).batch?.pid === b.pid)
          this.keepBookkeeping(() => keep.confirmBatch());
        else this.toast(PRODUCTION_COPY.recorded);
        await this.refreshProduction();
      })();
    };
  }

  // ------------------------------------------------------------------ E1: the owner's books

  /**
   * Reads the owner's books for the last 35 days and puts them in the engine's ledger (the P&L, Home profit and the expense
   * list read it). The ledger is replaced, never added to: the engine's own entries for the same event (a receipt, a stall
   * sale, an expense) are the database's lines by the time this returns. False when it could not be read.
   */
  async loadBooks(client: BooksClient | null): Promise<boolean> {
    if (client) this.booksClient = client;
    const use = client ?? this.booksClient;
    if (!isLiveMode() || !use) return false;
    const seq = (this.booksLoadSeq += 1);
    let books: Books;
    try {
      const now = Date.now();
      books = await fetchBooks(use, now - 35 * 86_400_000, now + 86_400_000);
    } catch {
      return false;
    }
    if (seq !== this.booksLoadSeq) return true;
    this.booksRows = books;
    this.setState({ ledger: engineLedger(books.lines) } as never);
    return true;
  }

  private installBooksOverrides(): void {
    const eng = this as unknown as {
      orderRevenue: (s: unknown) => number;
      pnlTotals: (s: unknown) => {
        revenue: number;
        profit: number;
        draw: number;
        taxRate: number;
        taxSetAside: number;
        cash: number;
        [key: string]: unknown;
      };
      ledgerIn: (s: unknown) => Array<{ kind?: string; cat?: string; amount?: number }>;
      exportBooks: () => void;
      recordDraw: (amount: unknown, note: string) => void;
      closeDrop: () => void;
    };
    // Revenue is booked as each order is paid, so closing a drop books nothing more: the engine's toast would say "closed at 0".
    const keepClose = eng.closeDrop;
    eng.closeDrop = () => {
      const original = this.toast;
      this.toast = (message: string, tone?: 'ok' | 'warn') => {
        const m = /^Drop (\d+) closed at .* Drop (\d+) is open/.exec(message);
        return original(m ? BOOKS_COPY.dropClosed(m[1]!, m[2]!) : message, tone);
      };
      try {
        keepClose();
      } finally {
        this.toast = original;
      }
    };
    const keepDraw = eng.recordDraw;
    // Money the owner takes out is a book entry of its own (outside expenses); the engine's own toast and sheet still run.
    eng.recordDraw = (amount, note) => {
      if (!Number(amount)) return keepDraw(amount, note); // the engine says what is missing
      void this.liveDraw(() => keepDraw(amount, note), amount, note);
    };
    // Revenue is each paid order in the books, so the engine's own count of the open drop's orders would count it twice.
    eng.orderRevenue = () => 0;
    // The ported engine recognizes Drops and Bazaar only. Include other real book revenue without guessing its sales channel.
    const keepPnlTotals = eng.pnlTotals.bind(this);
    eng.pnlTotals = (state) => {
      const totals = keepPnlTotals(state);
      if (!isLiveMode()) return totals;
      const rows = eng.ledgerIn(state);
      const otherRevenue = rows
        .filter((row) => row.kind === 'revenue' && row.cat !== 'Drops' && row.cat !== 'Bazaar')
        .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
      if (!otherRevenue) return totals;
      const revenue = totals.revenue + otherRevenue;
      const profit = totals.profit + otherRevenue;
      return {
        ...totals,
        revenue,
        profit,
        taxSetAside: Math.round((revenue * totals.taxRate) / 100),
        cash: profit - totals.draw
      };
    };
    eng.exportBooks = () => void this.liveExport();
  }

  /** A plain expense: recorded first (once, however often it is repeated), then the engine's own bookkeeping, then the books are read back. */
  private async livePlainExpense(
    run: () => void,
    cat: string,
    label: string,
    amount: unknown
  ): Promise<void> {
    const client = this.booksClient;
    if (this.state.role !== 'owner') return void this.toast(BOOKS_COPY.ownerOnly, 'warn');
    if (!client) return void this.toast(STAFF_COPY.offline, 'warn');
    const cents = pesosToCentavos(Number(amount));
    const signature = JSON.stringify([cat, label, cents]);
    const fields: ExpenseFields = this.pendingExpenses.get(signature) ?? {
      id: crypto.randomUUID(),
      category: cat,
      memo: String(label ?? '').slice(0, 120),
      amountCents: cents,
      at: Date.now()
    };
    const problem = expenseError(fields);
    if (problem) return void this.toast(problem, 'warn');
    this.pendingExpenses.set(signature, fields);
    const outcome = await recordExpense(client, fields);
    if (outcome !== 'offline') this.pendingExpenses.delete(signature);
    if (outcome !== 'saved')
      return void this.toast(
        outcome === 'refused' ? BOOKS_COPY.refused : BOOKS_COPY.notSaved,
        'warn'
      );
    this.withoutUndo(run);
    await this.loadBooks(null);
  }

  private async liveDraw(run: () => void, amount: unknown, note: string): Promise<void> {
    const client = this.booksClient;
    if (this.state.role !== 'owner') return void this.toast(BOOKS_COPY.ownerOnly, 'warn');
    if (!client) return void this.toast(STAFF_COPY.offline, 'warn');
    const cents = pesosToCentavos(Number(amount));
    const memo = String(note ?? '').slice(0, 120);
    const signature = JSON.stringify([memo, cents]);
    const fields: DrawFields = this.pendingDraws.get(signature) ?? {
      id: crypto.randomUUID(),
      memo,
      amountCents: cents,
      at: Date.now()
    };
    const problem = drawError(fields);
    if (problem) return void this.toast(problem, 'warn');
    this.pendingDraws.set(signature, fields);
    const outcome = await recordDraw(client, fields);
    if (outcome !== 'offline') this.pendingDraws.delete(signature);
    if (outcome !== 'saved')
      return void this.toast(
        outcome === 'refused' ? BOOKS_COPY.refused : BOOKS_COPY.notSaved,
        'warn'
      );
    this.withoutUndo(run);
    await this.loadBooks(null);
  }

  private async openBooks(): Promise<void> {
    if (!(await this.loadBooks(null)) || !this.booksRows)
      return void this.toast(STAFF_COPY.offline, 'warn');
    this.sheet('books', {});
  }

  private liveBooksVals(): OpsVals['liveBooks'] {
    const sh = this.state.sheet as { kind?: string } | null;
    const books = this.booksRows;
    if (this.state.role !== 'owner' || sh?.kind !== 'books' || !books) return null;
    return {
      online: this.state.online && (typeof navigator === 'undefined' || navigator.onLine),
      basis: books.basis,
      unpaid: this.unpaidVals(),
      receipts: books.receipts.map((r) => ({
        movementId: r.movementId,
        label:
          r.item +
          ' · ' +
          r.qty +
          ' · ₱' +
          (r.costCents / 100).toLocaleString('en-PH') +
          (r.supplier ? ' · ' + r.supplier : '') +
          ' · ' +
          new Date(r.at).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })
      })),
      setBasis: (b) => void this.liveSetBasis(b),
      correct: (movementId, pesos) => void this.liveCorrect(movementId, pesos),
      download: () => void this.liveExport(),
      close: () => this.closeSheet()
    };
  }

  /** The orders still owed money, from the owner's orders (null until they are read). */
  private unpaidVals(): NonNullable<OpsVals['liveBooks']>['unpaid'] {
    const orders = this.orderSync?.current();
    if (!orders) return null;
    const peso = (cents: number) => '₱' + (cents / 100).toLocaleString('en-PH');
    const { rows, totalCents } = unpaidOrders(orders, Date.now());
    return {
      summary: rows.length
        ? BOOKS_COPY.unpaidSummary(rows.length, peso(totalCents))
        : BOOKS_COPY.unpaidNone,
      rows: rows.map((r) => ({
        id: r.id,
        title: r.id + ' · ' + r.name,
        detail:
          (r.status === 'claimed'
            ? BOOKS_COPY.unpaidClaimed
            : r.status === 'balance'
              ? BOOKS_COPY.unpaidBalance
              : BOOKS_COPY.unpaidWaiting) +
          ' · ' +
          BOOKS_COPY.unpaidDays(r.days),
        amount: peso(r.owedCents)
      }))
    };
  }

  private async liveSetBasis(basis: 'bought' | 'used'): Promise<void> {
    const client = this.booksClient;
    if (this.state.role !== 'owner') return void this.toast(BOOKS_COPY.ownerOnly, 'warn');
    if (!client) return void this.toast(STAFF_COPY.offline, 'warn');
    const outcome = await saveCostBasis(client, basis);
    if (outcome !== 'saved')
      return void this.toast(
        outcome === 'refused' ? BOOKS_COPY.refused : BOOKS_COPY.notSaved,
        'warn'
      );
    await this.loadBooks(null);
    this.toast(BOOKS_COPY.basisSaved(basis));
  }

  private async liveCorrect(movementId: string, pesos: string): Promise<void> {
    const client = this.booksClient;
    if (this.state.role !== 'owner') return void this.toast(BOOKS_COPY.ownerOnly, 'warn');
    if (!client) return void this.toast(STAFF_COPY.offline, 'warn');
    const value = Number(pesos);
    if (pesos.trim() === '' || !Number.isFinite(value) || value < 0)
      return void this.toast(BOOKS_COPY.refused, 'warn');
    const cents = pesosToCentavos(value);
    const signature = JSON.stringify([movementId, cents]);
    const fields: CorrectionFields = this.pendingCorrections.get(signature) ?? {
      id: crypto.randomUUID(),
      movementId,
      costCents: cents,
      at: Date.now()
    };
    const problem = correctionError(fields);
    if (problem) return void this.toast(problem, 'warn');
    this.pendingCorrections.set(signature, fields);
    const outcome = await recordCostCorrection(client, fields);
    if (outcome !== 'offline') this.pendingCorrections.delete(signature);
    if (outcome !== 'saved')
      return void this.toast(
        outcome === 'refused' ? BOOKS_COPY.refused : BOOKS_COPY.notSaved,
        'warn'
      );
    await this.loadBooks(null);
    void this.loadStockCatalogue(null); // what was last paid follows the correction
    this.toast(BOOKS_COPY.corrected);
  }

  /** The books for the last 13 months as a CSV download: read fresh from the database, so it is the same numbers as the screens. */
  private async liveExport(): Promise<void> {
    const client = this.booksClient;
    if (this.state.role !== 'owner') return void this.toast(BOOKS_COPY.ownerOnly, 'warn');
    if (!client) return void this.toast(STAFF_COPY.offline, 'warn');
    let books: Books;
    try {
      const now = Date.now();
      books = await fetchBooks(client, now - 396 * 86_400_000, now + 86_400_000);
    } catch {
      return void this.toast(STAFF_COPY.offline, 'warn');
    }
    try {
      const blob = new Blob([booksCsv(books)], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'happy-cookie-books-' + new Date().toISOString().slice(0, 10) + '.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.toast(BOOKS_COPY.downloaded);
    } catch {
      this.toast(BOOKS_COPY.downloadBlocked, 'warn');
    }
  }

  // ------------------------------------------------------------------ B3: the owner's orders

  /**
   * Reads the owner's orders into `state.orders` (owner, staff screens; after the flavour list, so
   * every ordered flavour is known to the screens). The engine's local order list plays no part in
   * live mode; the demo books are never shown.
   */
  loadOrders(client: StaffOrderClient): Promise<boolean> {
    if (!isLiveMode()) return Promise.resolve(false);
    this.orderSync = new StaffOrderSync(client, {
      apply: (orders) => this.setState({ orders }),
      online: () => this.state.online && (typeof navigator === 'undefined' || navigator.onLine),
      toast: (message, tone) => this.toast(message, tone),
      pickupDays: () => this.orderFlow?.rules?.pickupDays ?? [1, 4]
    });
    return this.orderSync.load();
  }

  /** Customers order all day: the live gate reads the list again when the tab comes back. */
  reloadOrders(): Promise<boolean> {
    return this.orderSync?.load() ?? Promise.resolve(false);
  }

  private flavourName(pid: string): string {
    const p = PRODUCTS.find((x) => x.id === pid) as { short?: string; name?: string } | undefined;
    return p?.short ?? p?.name ?? pid;
  }

  private firstName(id: string): string {
    const name = this.orderSync?.find(id)?.name ?? '';
    return name.trim().split(/\s+/)[0] || 'The customer';
  }

  /** What was actually paid (a refund returns that), falling back to the total. */
  private orderPesos(id: string): number {
    const order = this.orderSync?.find(id);
    return order ? centavosToPesos(order.paidCents ?? order.totalCents) : 0;
  }

  /** The client id of a swap that has not been settled, so a second tap after a lost reply is a replay. */
  private swapIds = new Map<string, string>();

  /**
   * The order detail's link row: the ported values are a made-up address and a "Link copied." toast that
   * copies nothing. Live mode shows the customer's real status link and really copies it.
   */
  private liveOrderDetail(od: OpsVals['od']): OpsVals['od'] {
    if (!od || !this.orderSync) return od;
    const order = this.orderSync.find(String(od.id));
    if (!order) return od;
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const link = statusLink(origin, order.statusToken);
    // B4b: add-ons, boxes and the same-day extra as rows after the flavours. `orders.tsx` shows name, quantity
    // and line total; `order-detail.tsx` also draws the flag button, so it says "Extra" and does nothing.
    const extra = extraRows(order).map((r) => ({
      name: r.name,
      qty: r.qty + '×',
      imgStyle: 'display:block;width:36px;height:36px;border-radius:9px;background:#F8F6F4',
      price: PESO(r.linePesos / r.qty),
      line: PESO(r.linePesos),
      out: false,
      inStock: true,
      flagLabel: EXTRAS_COPY.extraFlag,
      flag: () => this.toast(EXTRAS_COPY.extraFlagToast),
      swap: () => undefined
    }));
    return {
      ...od,
      lines: [...(od.lines ?? []), ...extra],
      link: link ?? '',
      linkSent: link ? STAFF_COPY.linkHint : STAFF_COPY.linkErased,
      copyLink: () => void this.copyMessage(link ?? '', link ? undefined : STAFF_COPY.linkErased)
    };
  }

  /**
   * One owner change, server first: nothing changes on screen until the database says so, then the
   * list is read again (in `StaffOrderSync`). `done` words the success; the caller words the rest.
   */
  private async liveOrder(
    run: (sync: StaffOrderSync) => Promise<StaffOutcome>,
    done: string,
    undo?: () => void
  ): Promise<StaffOutcome | null> {
    const sync = this.orderSync;
    if (!sync?.loaded) {
      this.toast(STAFF_COPY.notLoaded, 'warn');
      return null;
    }
    const outcome = await run(sync);
    if (outcome.kind === 'ok') {
      this.closeSheet();
      this.toast(done, 'ok', undo);
      if (this.state.role === 'owner') void this.loadBooks(null);
    }
    return outcome;
  }

  /**
   * Live mode replaces the engine's order actions, which only edit the local list, with the ones
   * that call the `staff_*` RPCs. The engine's local side effects are deliberately not repeated:
   * packing does not check packaging stock (there is none in live mode until C1/C2), refunds and
   * no-shows do not touch the local ledger or baked counts, no invoice is issued (F10 is open),
   * and the capacity check on payment is the server's.
   */
  private installOrderOverrides(): void {
    const eng = this as unknown as OrderActions;
    eng.confirmPayment = (id, force) => void this.liveConfirm(id, force === true);
    eng.rejectPayment = (id) => void this.liveOrder((s) => s.reject(id), STAFF_COPY.rejected);
    eng.reopenOrder = (id) => {
      if (this.orderSync?.find(id)?.payState === 'refunded')
        return void this.toast(STAFF_COPY.reopenRefunded, 'warn');
      void this.liveOrder((s) => s.reopen(id), STAFF_COPY.reopened);
    };
    eng.recordBalance = (id) =>
      void this.liveOrder((s) => s.settle(id), STAFF_COPY.settled(this.firstName(id)));
    eng.noShow = (id) =>
      void this.liveOrder((s) => s.setStatus(id, 'No-show'), STAFF_COPY.noShow(this.firstName(id)));
    eng.refundOrder = (id, ref) => {
      const amount = PESO(this.orderPesos(id));
      void this.liveOrder(
        (s) => s.refund(id, String(ref ?? '').trim()),
        STAFF_COPY.refunded(amount)
      );
    };
    eng.packOrder = (id) => {
      const order = this.orderSync?.find(id);
      if (order?.state === 'Payment review') return void this.toast(STAFF_COPY.packUnpaid, 'warn');
      if (order?.items.some((i) => i.unavailable))
        return void this.toast(
          'Settle the unavailable flavour with ' + this.firstName(id) + ' before packing this one.',
          'warn'
        );
      void (async () => {
        // C2: packing takes the packaging off stock, once per order (the database answers a repeat without taking more). A
        // helper's pack still moves the order on: recording stock is the owner's, like every stock change.
        let ranShort = '';
        const client = this.productionClient;
        if (this.state.role === 'owner' && client) {
          const st = this.state as unknown as {
            dropNo: number;
            orders: Array<{ id: string; drop?: number | null }>;
          };
          // An order for another week carries no drop number of ours (-1): its cookies are still taken from what is baked now.
          const orderDrop = st.orders.find((o) => o.id === id)?.drop;
          const dropNo = typeof orderDrop === 'number' && orderDrop >= 0 ? orderDrop : st.dropNo;
          const result = await recordPack(client, id, dropNo);
          if (result.outcome !== 'saved') {
            this.toast(
              result.outcome === 'offline' ? PRODUCTION_COPY.packNotSaved : PRODUCTION_COPY.refused,
              'warn'
            );
            return;
          }
          if (result.shortfall.length)
            ranShort = PRODUCTION_COPY.ranShort(
              result.shortfall.map((x) => x.name.toLowerCase()).join(' and ')
            );
        }
        await this.liveOrder(
          (s) => s.setStatus(id, 'Ready'),
          STAFF_COPY.packed(this.firstName(id)) + ranShort
        );
        if (this.state.role === 'owner' && client) await this.refreshProduction();
      })();
    };
    eng.collectOrder = (id) => {
      const undo = () =>
        void this.liveOrder((s) => s.setStatus(id, 'Ready'), STAFF_COPY.packed(this.firstName(id)));
      void this.liveOrder(
        (s) => s.setStatus(id, 'Completed'),
        STAFF_COPY.collected(this.firstName(id)),
        undo
      );
    };
    eng.flagLine = (id, pid) => {
      const on = !this.orderSync?.find(id)?.items.some((i) => i.productId === pid && i.unavailable);
      void this.liveOrder(
        (s) => s.flag(id, pid, on),
        on
          ? STAFF_COPY.flagged(this.flavourName(pid), this.firstName(id))
          : STAFF_COPY.unflagged(this.flavourName(pid))
      );
    };
    eng.clearContact = (id) => {
      const flagged = (this.orderSync?.find(id)?.items ?? []).filter((i) => i.unavailable);
      void (async () => {
        for (const item of flagged) {
          const outcome = await this.orderSync?.flag(id, item.productId, false);
          if (outcome?.kind !== 'ok') return;
        }
        this.toast(STAFF_COPY.cleared);
      })();
    };
    eng.replaceLine = (id, from, to) => {
      if (from === to) return void this.toast('Pick a different flavour to swap in.', 'warn');
      const qty = (this.orderSync?.find(id)?.items ?? [])
        .filter((i) => i.productId === from)
        .reduce((n, i) => n + i.qty, 0);
      const key = `${id}|${from}|${to}`;
      const clientId = this.swapIds.get(key) ?? globalThis.crypto.randomUUID();
      this.swapIds.set(key, clientId);
      void this.liveOrder(
        (s) => s.swap(id, from, to, clientId),
        STAFF_COPY.swapped(qty, this.flavourName(from), this.flavourName(to))
      ).then((outcome) => {
        // Only a lost reply keeps the id: the next tap must be a replay, not a second swap.
        if (outcome?.kind !== 'offline') this.swapIds.delete(key);
        if (outcome?.kind === 'capacity') this.toast(STAFF_COPY.noRoom(outcome.left), 'warn');
      });
    };
    // Baking is not a status the live app records: a baked flavour's orders stay Confirmed until they
    // are packed (Ready), so the bake list keeps counting them until then.
    eng.markBaking = (_pid, s0) => (s0 ?? (this.state as unknown as { orders: unknown[] })).orders;
    const orders = () =>
      this.state.orders as Array<{ status: string; day?: string; items: Record<string, number> }>;
    // This pickup week only: an order for a later week (the lead window is up to 14 days) is not baked yet.
    const counted = () =>
      orders().filter((o) => BAKED_FOR.includes(o.status) && eng.inDrop(this.state, o));
    eng.demand = (pid) => counted().reduce((n, o) => n + (o.items[pid] || 0), 0);
    eng.demandDay = (pid, day) =>
      counted()
        .filter((o) => o.day === day)
        .reduce((n, o) => n + (o.items[pid] || 0), 0);
  }

  /** The paid tick. A lapsed unpaid order that no longer fits its week opens the ported overage sheet. */
  private async liveConfirm(id: string, force: boolean): Promise<void> {
    const order = this.orderSync?.find(id);
    const first = this.firstName(id);
    const outcome = await this.liveOrder((s) => s.confirm(id, force), STAFF_COPY.paid(first));
    if (outcome?.kind === 'capacity') {
      const n = (order?.items ?? []).reduce((total, i) => total + i.qty, 0);
      this.sheet('overage', {
        id,
        over: Math.max(1, n - outcome.left),
        left: outcome.left,
        n,
        name: order?.name ?? first
      });
    }
  }

  private openMessages(): void {
    this.sheet('ordermessages', {});
    void this.reloadOrders();
  }

  /** The messages sheet: a status link and a text to copy for each open order (live owner). */
  private liveMessagesVals(): OpsVals['liveMessages'] {
    const sh = this.state.sheet as FlavourSheetState | null;
    if (this.state.role !== 'owner' || sh?.kind !== 'ordermessages') return null;
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    const rows = (this.orderSync?.current() ?? []).flatMap((o) =>
      messagesFor(o, origin, (pid) => this.flavourName(pid)).map((m) => ({
        key: m.key,
        order: o.id,
        name: o.name,
        label: m.label,
        text: m.text,
        details: extraDetails(o, true),
        copy: () => void this.copyMessage(m.text)
      }))
    );
    return { rows, close: () => this.closeSheet() };
  }

  private async copyMessage(text: string, none?: string): Promise<void> {
    if (!text) return void this.toast(none ?? MESSAGE_SHEET.copyFailed, 'warn');
    try {
      await navigator.clipboard.writeText(text);
      this.toast(MESSAGE_SHEET.copied);
    } catch {
      this.toast(MESSAGE_SHEET.copyFailed, 'warn');
    }
  }

  /**
   * The live owner's All tools. No markup edit: All tools already maps `toolGroups`.
   *
   * UX review, proposal 1: the four flavour and recipe entries were spread over Kitchen
   * (Recipes) and Business (Products, Menu & flavours, Recipe drafts). They sit together in
   * one "Menu and recipes" group after Kitchen, each with a line saying what it is for.
   *
   * Keep every description short. The ported card shows it on one line, and a line wider
   * than the card stretches the whole group past the edge of a phone instead of being cut
   * (UX review, finding 11). Measured at 360 px wide: about 276 px, roughly 50 characters.
   */
  private liveToolGroups(groups: OpsVals['toolGroups']): OpsVals['toolGroups'] {
    const ported = (label: string) =>
      groups.flatMap((g) => g.items).find((item) => item.label === label);
    const products = ported('Products');
    const recipes = ported('Recipes');
    const menuGroup: OpsVals['toolGroups'][number] = {
      title: MENU_TOOLS.title,
      items: [
        {
          icon: this.IC.cookie,
          label: 'Menu & flavours',
          sub:
            plural(this.flavourSync?.current().length ?? 0, 'flavour', 'flavours') +
            MENU_TOOLS.flavours,
          badge: null,
          go: () => this.openFlavourList()
        },
        ...(products ? [{ ...products, sub: MENU_TOOLS.products }] : []),
        ...(recipes ? [{ ...recipes, sub: MENU_TOOLS.recipes }] : []),
        {
          icon: this.IC.cookie,
          label: 'Recipe drafts',
          sub: MENU_TOOLS.drafts,
          badge: null,
          go: () => void this.openRecipeDrafts()
        }
      ]
    };
    const live = groups.map((g) =>
      g.title === 'Business'
        ? {
            ...g,
            items: [
              ...g.items,
              {
                icon: this.IC.cookie,
                label: 'Payment methods',
                sub: 'GCash, Maya, bank: numbers and QR codes',
                badge: null,
                go: () => this.openPayments()
              },
              {
                icon: this.IC.cookie,
                label: 'Shop texts',
                sub: 'Shop footer: registration, TIN, invoice, allergens',
                badge: null,
                go: () => void this.openShopTexts()
              },
              {
                icon: this.IC.cookie,
                label: 'Order rules',
                sub: 'Pickup days, lead time, unpaid holds, campus slot',
                badge: null,
                go: () => void this.openOrderRules()
              },
              {
                icon: this.IC.cookie,
                label: SCHEDULED_COPY.title,
                sub: 'Your upcoming bazaars: dates, place and stall rent',
                badge: null,
                go: () => void this.openScheduled()
              },
              {
                icon: this.IC.cookie,
                label: BOOKS_COPY.title,
                sub: BOOKS_COPY.sub,
                badge: null,
                go: () => void this.openBooks()
              },
              {
                icon: this.IC.cookie,
                label: STOCK_COPY.itemsTitle,
                sub: STOCK_COPY.itemsSub,
                badge: null,
                go: () => void this.openStockItems()
              },
              {
                icon: this.IC.cookie,
                label: STOCK_COPY.suppliersTitle,
                sub: STOCK_COPY.suppliersSub,
                badge: null,
                go: () => void this.openStockSuppliers()
              },
              {
                icon: this.IC.cookie,
                label: EXTRAS_COPY.title,
                sub: 'Box sizes, add-ons, sampler, same-day extra',
                badge: null,
                go: () => void this.openOrderExtras()
              },
              {
                icon: this.IC.cookie,
                label: MESSAGE_SHEET.title,
                sub: 'A status link and a message for each open order',
                badge: null,
                go: () => this.openMessages()
              }
            ]
          }
        : g
    );
    const rest = live
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => item !== products && item !== recipes)
      }))
      .filter((g) => g.items.length > 0);
    const at = rest.findIndex((g) => g.title === 'Kitchen') + 1;
    return [...rest.slice(0, at), menuGroup, ...rest.slice(at)];
  }

  /** The products screen's "Edit price" opens the live flavour editor instead of the ported sheet. */
  private liveProductRows(rows: OpsVals['productRows']): OpsVals['productRows'] {
    return rows.map((row, i) => {
      const pid = PRODUCTS[i]?.id;
      return pid
        ? {
            ...row,
            edit: () => this.openFlavourEditor(pid),
            costText: this.completeRecipeCost(pid) ? row.costText : 'Cost pending'
          }
        : row;
    });
  }

  /** Partial recipes and missing prices cannot be presented as a complete zero-peso cost. */
  private completeRecipeCost(pid: unknown): boolean {
    const recipe = this.recipeRows?.find((row) => row.productId === pid);
    const catalogue = this.stockCatalogue;
    if (!recipe?.lines.length || !catalogue) return false;
    const priced = (name: string, unit?: string) => {
      const item = catalogue.items.find((row) => row.active && row.name === name);
      if (!item || (unit !== undefined && item.unit !== unit)) return false;
      const paid = (
        this.state.paid as Record<string, { price: number; qty: number }> | undefined
      )?.[name];
      return (
        !!(paid && paid.qty > 0 && paid.price > 0) ||
        catalogue.prices.some(
          (row) =>
            row.active &&
            row.itemName === name &&
            item.packSize !== null &&
            item.packSize > 0 &&
            row.packLabel === item.packLabel &&
            catalogue.suppliers.some(
              (supplier) => supplier.id === row.supplierId && supplier.active
            )
        )
      );
    };
    return (
      recipe.lines.every((line) => priced(line.name, line.unit)) &&
      ['Box of 6', 'Brand sticker', 'Thank-you card'].every((name) => priced(name))
    );
  }

  /**
   * Only the sheet chrome (backdrop, header, close button) is ported; `liveForm` gates the
   * one new render branch (F3, docs/state/protected-exception.md).
   */
  private liveSheet(sheet: OpsVals['sheet']): OpsVals['sheet'] {
    if (!sheet) return sheet;
    const sh = this.state.sheet as FlavourSheetState | null;
    const customerKind = this.customerSheetKind();
    if (customerKind)
      return {
        ...sheet,
        liveForm: true,
        title: customerKind === 'liveLookup' ? 'Find my order' : 'Join the waiting list'
      };
    if (this.state.role === 'owner' && sh?.kind === 'payments') {
      const method = sh.pid ? this.paymentSync?.rows.find((r) => r.id === sh.pid) : undefined;
      return {
        ...sheet,
        liveForm: true,
        title: sh.isNew
          ? 'Add a payment method'
          : method
            ? 'Edit ' + method.label
            : 'Payment methods'
      };
    }
    if (this.state.role === 'owner' && sh?.kind === 'shoptexts')
      return { ...sheet, liveForm: true, title: 'Shop texts' };
    if (this.state.role === 'owner' && sh?.kind === 'ordermessages')
      return { ...sheet, liveForm: true, title: MESSAGE_SHEET.title };
    if (this.state.role === 'owner' && sh?.kind === 'orderrules')
      return { ...sheet, liveForm: true, title: 'Order rules' };
    if (this.state.role === 'owner' && sh?.kind === 'orderextras')
      return { ...sheet, liveForm: true, title: EXTRAS_COPY.title };
    if (this.state.role === 'owner' && sh?.kind === 'scheduledevents')
      return { ...sheet, liveForm: true, title: SCHEDULED_COPY.title };
    if (this.state.role === 'owner' && sh?.kind === 'books')
      return { ...sheet, liveForm: true, title: BOOKS_COPY.title };
    if (this.state.role === 'owner' && sh?.kind === 'stockitems')
      return { ...sheet, liveForm: true, title: STOCK_COPY.itemsTitle };
    if (this.state.role === 'owner' && sh?.kind === 'stocksuppliers')
      return { ...sheet, liveForm: true, title: STOCK_COPY.suppliersTitle };
    if (this.state.role === 'owner' && sh?.kind === 'recipedrafts')
      return { ...sheet, liveForm: true, title: 'Recipe drafts' };
    if (this.state.role !== 'owner' || sh?.kind !== 'flavours')
      return { ...sheet, liveForm: false };
    const row = sh.pid ? this.flavourSync?.current().find((r) => r.id === sh.pid) : undefined;
    return {
      ...sheet,
      liveForm: true,
      title: sh.isNew ? 'Add a flavour' : row ? 'Edit ' + row.name : 'Menu & flavours'
    };
  }

  /** The live-only form host's content (MP-09 c1c, F3): list, add or edit one flavour. */
  private liveFormVals(): OpsVals['liveForm'] {
    const sh = this.state.sheet as FlavourSheetState | null;
    if (this.state.role !== 'owner' || sh?.kind !== 'flavours') return null;
    const rows = [...(this.flavourSync?.current() ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)
    );
    const online = this.state.online && (typeof navigator === 'undefined' || navigator.onLine);
    const target = sh.pid ? rows.find((r) => r.id === sh.pid) : undefined;
    // Frozen at open time (openFlavourEditor), not re-read here: see that method's comment.
    const expectedUpdatedAt = sh.isNew ? null : (sh.updatedAt ?? target?.updated_at ?? null);
    const editing =
      sh.isNew || target
        ? {
            id: target?.id ?? null,
            name: target?.name ?? '',
            shortName: target?.short_name ?? '',
            description: target?.description ?? '',
            imagePath: target?.image_path ?? '',
            allergens: target?.allergens ?? '',
            badge: target?.tag ?? '',
            kind: (target?.kind === 'Rotating' ? 'Rotating' : 'Permanent') as
              'Permanent' | 'Rotating',
            itemType: (target?.item_type === 'set' ? 'set' : 'cookie') as 'cookie' | 'set',
            capacityWeight: target?.capacity_weight ?? 1,
            sortOrder:
              target?.sort_order ??
              (rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 0),
            price: target ? centavosToPesos(centavosFromDb(target.price_cents)) : 0,
            active: target?.active ?? true,
            save: (fields: LiveFlavourFormFields) =>
              void this.saveFlavourForm(target?.id ?? null, fields, expectedUpdatedAt),
            cancel: () => this.openFlavourList(),
            upload: this.uploadImage('flavours')
          }
        : null;
    return {
      kind: 'flavours',
      online,
      rows: rows.map((r) => ({
        id: r.id,
        name: r.name,
        shortName: r.short_name,
        priceText: PESO(centavosToPesos(centavosFromDb(r.price_cents))),
        published: r.published,
        active: r.active,
        edit: () => this.openFlavourEditor(r.id)
      })),
      addNew: () => this.openNewFlavour(),
      publish: () => void this.publishMenu(),
      close: () => this.closeSheet(),
      editing
    };
  }

  /** The owner's payment methods and shop texts (MP-09 c2). Sheet kinds 'payments' and 'shoptexts'. */
  private openPayments(): void {
    this.sheet('payments', {});
    void this.paymentSync?.loadRows();
  }

  private openPayEditor(id: string): void {
    const updatedAt = this.paymentSync?.rows.find((r) => r.id === id)?.updated_at ?? null;
    this.sheet('payments', { pid: id, updatedAt });
  }

  private openNewPay(): void {
    this.sheet('payments', { isNew: true });
  }

  private openShopTexts = async (): Promise<void> => {
    // Read fresh first, so the stamp the form saves against is the current one.
    await this.paymentSync?.loadPublic();
    this.sheet('shoptexts', { updatedAt: this.paymentSync?.info?.textsUpdatedAt ?? null });
  };

  private async savePayForm(
    id: string | null,
    f: LivePayFormFields,
    expectedUpdatedAt: string | null
  ): Promise<void> {
    if (!this.paymentSync) {
      this.toast('Payment methods cannot be saved here: no connection to the database.', 'warn');
      return;
    }
    const fields = {
      label: f.label.trim(),
      account_number: f.accountNumber.trim(),
      account_name: f.accountName.trim(),
      qr_path: f.qrPath.trim(),
      active: f.active,
      sort_order: f.sortOrder
    };
    const existing = new Set(this.paymentSync.rows.map((r) => r.id));
    const methodId = id ?? slugifyFlavourId(fields.label, existing);
    if ((await this.paymentSync.saveMethod(methodId, fields, expectedUpdatedAt)) === 'saved') {
      this.toast('Payment method saved.');
      this.openPayments();
    }
  }

  private async saveTextsForm(t: LiveShopTexts, expectedUpdatedAt: string | null): Promise<void> {
    if (!this.paymentSync) {
      this.toast('Shop texts cannot be saved here: no connection to the database.', 'warn');
      return;
    }
    const outcome = await this.paymentSync.saveTexts(
      {
        registration_badge: t.registrationBadge.trim(),
        tin_line: t.tinLine.trim(),
        invoice_note: t.invoiceNote.trim(),
        allergen_note: t.allergenNote.trim()
      },
      expectedUpdatedAt
    );
    if (outcome === 'saved') {
      this.toast('Shop texts saved.');
      this.closeSheet();
    }
  }

  private uploadImage = (folder: 'qr' | 'flavours') => (file: File) =>
    this.paymentSync ? this.paymentSync.upload(folder, file) : Promise.resolve(null);

  /** The checkout's methods and QR in live mode: only what the read returned, never the ported accounts. */
  private livePayCust(cust: OpsVals['cust']): OpsVals['cust'] {
    const info = this.paymentSync?.info;
    // `noQr` is the ported 'Pick a payment method…' note, which also names a bank number and cash on
    // pickup: a customer must never be told to pay a number the owner did not enter (finding 16).
    if (!info) return { ...cust, methods: [], qr: '', noQr: false };
    const picked = info.methods.find(
      (m) => m.label === (this.state.cust as { pay?: string } | undefined)?.pay
    );
    const url = picked ? resolveImagePath(picked.qr) : '';
    // The engine builds the style with `url(RES(qr))`, which turns an absolute URL into a
    // relative one, so the image URL is swapped for the resolved one; a method with no QR shows none.
    const style = typeof cust.qr === 'string' ? cust.qr : '';
    return {
      ...cust,
      // The ported note says there is no extra charge; boxes, add-ons and same-day can add to the total (B4b).
      priceNote: ORDER_COPY.extras.priceNote,
      noQr: false,
      qr: url && style ? style.replace(/url\([^)]*\)/, 'url(' + url + ')') : ''
    };
  }

  /**
   * B2: the customer's checkout, lookup and waiting list talk to the database through one
   * `OrderFlow`. With no client (a live build with no Supabase) there is none, and the pages say
   * ordering is unavailable rather than pretending.
   */
  async loadShopOrders(client: OrderClient | null): Promise<boolean> {
    if (!isLiveMode() || !client) return false;
    if (!this.orderFlow) {
      this.orderFlow = new OrderFlow(client, {
        changed: () => this.forceUpdate(),
        mintId: () => crypto.randomUUID()
      });
    }
    this.syncStatusRoute();
    void this.orderFlow.loadExtras();
    return this.orderFlow.loadRules();
  }

  private async liveSubmit(): Promise<void> {
    if (!this.orderFlow) {
      this.toast(ORDER_COPY.unavailable, 'warn');
      return;
    }
    const c = (this.state.cust ?? {}) as CustFields;
    const flow = this.orderFlow;
    const sameDay = flow.extras?.sameDay;
    // A date picked as tomorrow that is today by the time it is sent (midnight passed) would be charged the same-day
    // extra without ever showing it. A retry of an unsettled attempt sends its frozen body and is left alone.
    if (
      sameDay?.enabled &&
      !flow.unresolved &&
      c.pickupDate === manilaToday() &&
      flow.renderedSameDay !== c.pickupDate
    ) {
      flow.holdSameDay(ORDER_COPY.extras.sameDayNow(sameDay.percent));
      return;
    }
    await this.orderFlow.submit({
      name: c.name ?? '',
      ig: c.ig ?? '',
      mobile: c.mobile ?? '',
      method: c.pay ?? '',
      pickupDate: c.pickupDate ?? '',
      pickupWindow: c.pickupTime ?? '',
      ref: c.ref ?? '',
      items: c.box ?? {}
    });
  }

  /** "Order this cookie again": the cookies of the order on screen that are still on the menu. */
  private liveReorder(): void {
    const items = this.orderFlow?.status?.items;
    if (!items) {
      this.toast(ORDER_COPY.noOrderToRepeat, 'warn');
      return;
    }
    const box: Record<string, number> = {};
    for (const item of items) {
      if (PRODUCTS.some((p) => p.id === item.productId)) box[item.productId] = item.qty;
    }
    this.orderFlow?.resetCheckout();
    this.setState({ cust: { ...BLANK_CUST, box } });
    this.go('shop');
    const any = Object.keys(box).length > 0;
    this.toast(
      any ? 'Same box loaded. Change anything before you check out.' : ORDER_COPY.noMenu,
      any ? 'ok' : 'warn'
    );
  }

  /**
   * Keeps the status link (`#t=` in the fragment, never the query string) in the address bar and
   * adopts it on a direct load. Called after every render by `LiveOrderRoute`, which runs after
   * `RouteSync`, so the route's own `pushState` (which drops a fragment) has already happened.
   */
  syncStatusRoute(): void {
    if (!isLiveMode() || typeof window === 'undefined' || !this.orderFlow) return;
    if (this.state.screen !== 'status') return;
    const flow = this.orderFlow;
    const hash = window.location.hash;
    const fromUrl = tokenFromHash(hash);
    // A link the customer opened or pasted into this tab: the fragment changed and nothing here wrote it.
    if (fromUrl && fromUrl !== flow.statusToken && hash !== this.lastHash) {
      this.lastHash = hash;
      void flow.loadStatus(fromUrl);
      return;
    }
    if (!flow.statusToken) return;
    const wanted = '#t=' + flow.statusToken;
    if (hash !== wanted) {
      this.lastHash = wanted;
      window.history.replaceState(window.history.state, '', window.location.pathname + wanted);
    }
  }

  private onCustomerScreen(): boolean {
    return CUSTOMER_SCREENS.includes(this.state.screen as ScreenKey);
  }

  /**
   * The customer sheets are gated on the CURRENT SCREEN being a customer screen, never on the role:
   * an anonymous visitor's engine role defaults to 'owner'.
   */
  private customerSheetKind(): 'liveLookup' | 'liveWaitlist' | null {
    const kind = (this.state.sheet as FlavourSheetState | null)?.kind;
    return this.onCustomerScreen() && (kind === 'liveLookup' || kind === 'liveWaitlist')
      ? kind
      : null;
  }

  private openLookupSheet(): void {
    this.orderFlow?.clearLookup();
    this.sheet('liveLookup', {});
  }

  private openWaitlist(): void {
    if (this.orderFlow && this.orderFlow.waitlistState !== 'unknown')
      this.orderFlow.resetWaitlist();
    this.sheet('liveWaitlist', {});
  }

  /** Not `runLookup`: that is the engine's own instance field, which would replace this method. */
  private async runLiveLookup(orderNo: string, mobile: string): Promise<void> {
    if (!this.orderFlow) {
      this.toast(ORDER_COPY.lookupError, 'warn');
      return;
    }
    if ((await this.orderFlow.lookup(orderNo, mobile)) === 'found') {
      this.closeSheet();
      this.go('status');
    }
  }

  /** The checkout's live slot (B2): fields, pickup choices, refusals and the placed order. */
  private liveCheckoutVals(): OpsVals['liveCheckout'] {
    if (this.state.screen !== 'checkout') return null;
    const flow = this.orderFlow;
    const c = (this.state.cust ?? {}) as CustFields;
    const rules = flow?.rules ?? null;
    const placed = flow?.placed ?? null;
    const statusUrl = (token: string) => window.location.origin + '/status#t=' + token;
    const x = flow?.extras ?? null;
    const dates = rules
      ? pickupDates(rules, Date.now(), x?.sameDay.enabled ? x.sameDay.percent : null)
      : [];
    const sameDayPicked = dates.some((d) => d.sameDay && d.value === c.pickupDate);
    // What the customer can see right now, kept for `liveSubmit`: a same-day date shown as same-day was agreed to.
    if (flow) flow.renderedSameDay = sameDayPicked ? (c.pickupDate ?? null) : null;
    const times = rules ? pickupTimes(rules, sameDayPicked ? manilaMinutes() : null) : [];
    const samplerId = x?.sampler.productId ?? null;
    const cookieQty = Object.entries(c.box ?? {})
      .filter(([id]) => id !== samplerId)
      .reduce((n, [, qty]) => n + Math.max(0, qty), 0);
    const boxed = Object.entries(flow?.boxQty ?? {}).reduce(
      (n, [size, qty]) => n + Number(size) * qty,
      0
    );
    const money = (cents: number) => PESO(centavosToPesos(centavosFromDb(cents)));
    const extras: NonNullable<OpsVals['liveCheckout']>['extras'] = x
      ? {
          sameDayNotice: !sameDayPicked
            ? ''
            : times.length === 0
              ? ORDER_COPY.extras.noSlotsToday
              : ORDER_COPY.extras.sameDayNotice(x.sameDay.percent),
          boxes:
            x.boxes.length &&
            (cookieQty >= x.boxes[0]!.size || Object.keys(flow?.boxQty ?? {}).length > 0)
              ? x.boxes.map((b) => {
                  const qty = flow?.boxQty[b.size] ?? 0;
                  return {
                    size: b.size,
                    label: ORDER_COPY.extras.boxLabel(
                      b.size,
                      b.chargeCents > 0 ? money(b.chargeCents) : ''
                    ),
                    qty,
                    max: qty + Math.max(0, Math.floor((cookieQty - boxed) / b.size)),
                    setQty: (n: number) => flow?.setBox(b.size, n)
                  };
                })
              : [],
          addOns: x.addOns.map((a) => {
            const keys = (a.variants.length ? a.variants : ['']).map((v) => a.id + LINE_SEP + v);
            const used = keys.reduce((n, k) => n + (flow?.lines[k]?.qty ?? 0), 0);
            return {
              id: a.id,
              name: a.name,
              priceText: money(a.priceCents),
              textLabel: a.textLabel,
              textMax: a.textMax,
              rows: keys.map((key) => {
                const v = key.slice(a.id.length + 1);
                const line = flow?.lines[key];
                const qty = line?.qty ?? 0;
                return {
                  key,
                  label: v ? a.name + ' ' + v : a.name,
                  qty,
                  max: a.textLabel !== null ? 1 : qty + Math.max(0, a.maxQty - used),
                  text: line?.text ?? '',
                  setQty: (n: number) => flow?.setLine(key, { qty: n }),
                  setText: (t: string) => flow?.setLine(key, { text: t.slice(0, a.textMax) })
                };
              })
            };
          })
        }
      : null;
    const anyExtras =
      Object.keys(flow?.boxQty ?? {}).length > 0 ||
      Object.values(flow?.lines ?? {}).some((l) => l.qty > 0);
    return {
      fields: {
        name: c.name ?? '',
        ig: c.ig ?? '',
        mobile: c.mobile ?? '',
        ref: c.ref ?? '',
        pickupDate: c.pickupDate ?? '',
        pickupTime: c.pickupTime ?? '',
        pay: c.pay ?? ''
      },
      set: (key, value) => this.custSet(key, value),
      errors: flow?.errors ?? {},
      dates,
      times,
      extras,
      totalNote: anyExtras || sameDayPicked ? ORDER_COPY.extras.totalNote : '',
      rulesState: flow ? flow.rulesState : 'failed',
      readOnly: (flow?.unresolved ?? false) || (flow?.sending ?? false),
      frozen: flow?.unresolved ?? false,
      sending: flow?.sending ?? false,
      banner: flow?.banner ?? null,
      submit: () => this.custSubmit(),
      changeOrder: () => flow?.changeOrder(),
      openWaitlist: () => this.openWaitlist(),
      holdNote: rules ? ORDER_COPY.payLater(rules.unpaidHoldHours) : '',
      placed: placed
        ? {
            orderNo: placed.orderNo,
            statusUrl: statusUrl(placed.token),
            totalText: PESO(centavosToPesos(centavosFromDb(placed.totalCents))),
            pickupText: pickupLabel(placed.pickupDate, placed.pickupWindow),
            extraLines: flow?.placedLines ?? [],
            copyLink: () => {
              const write = navigator.clipboard?.writeText(statusUrl(placed.token));
              if (!write) {
                this.toast(ORDER_COPY.linkCopyFailed, 'warn');
                return;
              }
              void write.then(
                () => this.toast(ORDER_COPY.linkCopied),
                () => this.toast(ORDER_COPY.linkCopyFailed, 'warn')
              );
            },
            seeOrder: () => {
              flow?.resetCheckout();
              this.setState({ cust: { ...BLANK_CUST, box: {} } });
              void flow?.loadStatus(placed.token);
              this.go('status');
            },
            orderAgain: () => this.custRestart()
          }
        : null
    };
  }

  private liveLookupVals(): OpsVals['liveLookup'] {
    // The /lookup screen carries the form itself (the guarded slot in find-my-order.tsx, B3); on any
    // other customer screen it is the sheet the shop footer opens.
    const onLookupScreen = this.state.screen === 'lookup';
    if (!onLookupScreen && this.customerSheetKind() !== 'liveLookup') return null;
    return {
      state: this.orderFlow?.lookupState ?? 'idle',
      run: (orderNo, mobile) => void this.runLiveLookup(orderNo, mobile),
      close: () => this.closeSheet()
    };
  }

  private liveWaitlistVals(): OpsVals['liveWaitlist'] {
    if (this.customerSheetKind() !== 'liveWaitlist') return null;
    const flow = this.orderFlow;
    return {
      state: flow?.waitlistState ?? 'idle',
      message: flow?.waitlistMessage ?? '',
      errors: flow?.waitlistErrors ?? {},
      ...waitlistRange(),
      join: (fields) => {
        if (!flow) {
          this.toast(ORDER_COPY.unavailable, 'warn');
          return;
        }
        void flow.joinWaitlist(fields);
      },
      close: () => {
        // An unsettled entry stays frozen, so opening the form again resends it under the same id.
        if (flow && flow.waitlistState !== 'unknown') flow.resetWaitlist();
        this.closeSheet();
      }
    };
  }

  /** The status page's values from `order_status`, never from the engine's local orders. */
  private liveStatusCust(cust: OpsVals['cust']): OpsVals['cust'] {
    if (this.state.screen !== 'status') return cust;
    const flow = this.orderFlow;
    const allergenNote = this.paymentSync?.info?.texts.allergen_note ?? '';
    if (flow?.status && flow.statusState !== 'missing')
      return {
        ...cust,
        ...statusCust(flow.status, { allergenNote }),
        reorder: () => this.liveReorder()
      };
    const shell = {
      ...cust,
      orderNo: '—',
      invoiceLine: '',
      showRetry: false,
      showCode: false,
      pickupCode: '',
      windowText: '',
      allergenNote,
      timeline: [] as OpsVals['cust']['timeline']
    };
    const state = flow?.statusState ?? 'idle';
    if (state === 'loading') return { ...shell, heroTitle: ORDER_COPY.loadingOrder, heroBody: '' };
    if (state === 'error')
      return { ...shell, heroTitle: ORDER_COPY.statusErrorTitle, heroBody: ORDER_COPY.statusError };
    return {
      ...shell,
      heroTitle: ORDER_COPY.statusMissingTitle,
      heroBody: ORDER_COPY.statusMissing
    };
  }

  /** The shop footer's lines: the owner's own text, or nothing (finding 16). */
  private shopFooterVals(): NonNullable<OpsVals['shopFooter']> {
    const texts = this.paymentSync?.info?.texts ?? EMPTY_TEXTS;
    return {
      badge: texts.registration_badge,
      tin: texts.tin_line,
      invoice: texts.invoice_note,
      allergens: texts.allergen_note
    };
  }

  private livePayVals(): OpsVals['livePay'] {
    const sh = this.state.sheet as FlavourSheetState | null;
    if (this.state.role !== 'owner' || sh?.kind !== 'payments') return null;
    const rows = this.paymentSync?.rows ?? [];
    const target = sh.pid ? rows.find((r) => r.id === sh.pid) : undefined;
    const expectedUpdatedAt = sh.isNew ? null : (sh.updatedAt ?? target?.updated_at ?? null);
    const online = this.state.online && (typeof navigator === 'undefined' || navigator.onLine);
    return {
      online,
      rows: rows.map((r) => ({
        id: r.id,
        label: r.label,
        detail: [r.account_number, r.account_name].filter(Boolean).join(' · '),
        active: r.active,
        hasQr: r.qr_path !== '',
        edit: () => this.openPayEditor(r.id)
      })),
      addNew: () => this.openNewPay(),
      close: () => this.closeSheet(),
      editing:
        sh.isNew || target
          ? {
              id: target?.id ?? null,
              label: target?.label ?? '',
              accountNumber: target?.account_number ?? '',
              accountName: target?.account_name ?? '',
              qrPath: target?.qr_path ?? '',
              active: target?.active ?? true,
              sortOrder:
                target?.sort_order ??
                (rows.length ? Math.max(...rows.map((r) => r.sort_order)) + 1 : 0),
              save: (fields: LivePayFormFields) =>
                void this.savePayForm(target?.id ?? null, fields, expectedUpdatedAt),
              cancel: () => this.openPayments(),
              upload: this.uploadImage('qr')
            }
          : null
    };
  }

  private liveTextsVals(): OpsVals['liveTexts'] {
    const sh = this.state.sheet as FlavourSheetState | null;
    if (this.state.role !== 'owner' || sh?.kind !== 'shoptexts') return null;
    const texts = this.paymentSync?.info?.texts ?? EMPTY_TEXTS;
    const online = this.state.online && (typeof navigator === 'undefined' || navigator.onLine);
    return {
      online,
      texts: {
        registrationBadge: texts.registration_badge,
        tinLine: texts.tin_line,
        invoiceNote: texts.invoice_note,
        allergenNote: texts.allergen_note
      },
      save: (t: LiveShopTexts) => void this.saveTextsForm(t, sh.updatedAt ?? null),
      close: () => this.closeSheet()
    };
  }

  /**
   * The notifications screen's alert switches call `this.toggleChannel(k)`, which the
   * protected engine (and the prototype it was ported from) never defines, so every tap
   * threw. Flips that one channel; the switch's On/Off text is the feedback, as in the
   * prototype. In live mode the owner's change saves through `save_setting` (MP-09 b3).
   */
  toggleChannel = (key: string): void => {
    this.setState((s) => {
      const channels = s.channels as Record<string, boolean>;
      return { channels: { ...channels, [key]: !channels[key] } };
    });
    this.settingsSync?.queue('channels');
  };

  syncNow = (): void => {
    void this.runSync();
  };

  /**
   * Sends the queue, then makes the sale rows on screen say what the queue says. Live only:
   * the prototype's optimistic flags stay as they were in demo mode.
   */
  flushSales = async (): Promise<FlushResult> => {
    const result = await flushQueue(this.saleClient);
    await this.reflectQueue();
    // A sale that reached the server used its pouches and bag there (stock only: no batch or dough changed): show what stock the database holds.
    if (result.sent.length > 0 && this.state.role === 'owner') {
      void this.loadStockCatalogue(null);
      void this.loadBooks(null);
    }
    return result;
  };

  private async reflectQueue(): Promise<void> {
    if (!isLiveMode()) return;
    let queue: Awaited<ReturnType<typeof allSales>>;
    try {
      queue = await allSales();
    } catch {
      this.operationsQueue = -1;
      this.setState({});
      return;
    }
    this.operationsQueue = queue.filter((row) => row.state !== 'sent').length;
    const states = new Map(queue.map((row) => [row.clientId, row.state]));
    this.setState((s) => {
      const sales = (s.sales as EventSale[]).map((sale) => {
        const state = states.get(clientIdFor({ saleId: sale.id, at: sale.at }));
        if (!state) return sale;
        const synced = state === 'sent';
        const failed = state === 'failed';
        return sale.synced === synced && sale.failed === failed
          ? sale
          : { ...sale, synced, failed };
      });
      return { sales, unsynced: sales.filter((sale) => !sale.synced).length };
    });
  }

  private async runSync(): Promise<void> {
    if (!this.state.online) {
      this.toast('Still offline. Sales are safe on this phone.', 'warn');
      return;
    }
    const queued = await pendingSales();
    const pending = queued.length || this.state.sales.filter((sale) => !sale.synced).length;
    if (!pending) {
      this.toast('Nothing waiting to sync.');
      return;
    }

    this.setState({ syncState: 'syncing' });
    const result = await this.flushSales();
    if (result.skipped) {
      this.setState({ syncState: 'partial', syncTried: true });
      this.toast(
        'Sales are safe on this phone. They will send once it can reach the server.',
        'warn'
      );
      return;
    }
    const sentIds = new Set(result.sent);
    const sentSales = result.sent.filter(isSaleKey).length;
    const failed = result.failed.length;

    if (failed) {
      await requestBackgroundSync();
      this.setState((s) => ({
        syncState: 'partial',
        syncTried: true,
        unsynced: isLiveMode() ? s.unsynced : failed,
        sales: isLiveMode()
          ? s.sales
          : s.sales.map((sale: EventSale) =>
              sentIds.has(clientIdFor({ saleId: sale.id, at: sale.at }))
                ? { ...sale, synced: true, failed: false }
                : { ...sale, failed: !sale.synced }
            )
      }));
      if (result.failed.some((f) => f.permanent)) {
        this.toast(
          'The server refused something it was sent. It is still saved on this phone. Ask Ethan to look at it.',
          'warn'
        );
        return;
      }
      this.toast(
        sentSales +
          ' of ' +
          (sentSales + failed) +
          ' sales synced. One could not be sent — nothing was lost. Tap Sync now again to finish.',
        'warn'
      );
      return;
    }

    this.setState((s) => ({
      syncState: 'synced',
      syncTried: true,
      unsynced: 0,
      sales: s.sales.map((sale: EventSale) => ({ ...sale, synced: true, failed: false }))
    }));
    this.toast(plural(sentSales || pending, 'sale', 'sales') + ' synced.');
  }
}

export type OpsRuntimeProps = OpsEngineProps;
