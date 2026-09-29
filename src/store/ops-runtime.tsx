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
import type { EventSale, OpsEngineProps, Role } from '@/store/engine/ops-engine';
import { defaultSalesClient, flushQueue, requestBackgroundSync, type FlushResult } from '@/lib/offline/sync';
import { allSales, clientIdFor, commandKey, enqueueCommand, enqueueVoid, isSaleKey, pendingSales, type CommandKind } from '@/lib/offline/queue';
import { clearBazaar, readBazaar, saveBazaar } from '@/lib/offline/bazaar-state';
import { isEventUuid, startEventOnServer, type EventSalesClient } from '@/lib/data/event-sales';
import { deviceId } from '@/lib/device';
import { plural } from '@/store/engine/ops-engine';
import type { LiveFlavourFormFields, LivePayFormFields, LiveShopTexts, OpsVals } from '@/view-models/vals';
import { PaymentSync } from '@/lib/data/payment-sync';
import { OrderFlow } from '@/lib/data/order-flow';
import { tokenFromHash, type FieldErrors, type OrderClient } from '@/lib/data/orders';
import { pickupLabel, statusCust } from '@/lib/orders/status-view';
import { ORDER_COPY } from '@/lib/orders/copy';
import { pickupDates, pickupTimes, waitlistRange } from '@/lib/orders/pickup';
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
    const saved = JSON.parse(localStorage.getItem(EVENT_ATTEMPT) ?? 'null') as { name?: string; id?: string; at?: number } | null;
    if (saved && saved.name === name && typeof saved.id === 'string' && Date.now() - (saved.at ?? 0) < 600_000) return saved.id;
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
  private settingsSync?: SettingsSync;
  private flavourSync?: FlavourSync;
  private paymentSync?: PaymentSync;
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
        if (navigator.onLine) await flushQueue(this.saleClient);
        else await requestBackgroundSync();
      })().catch(() => undefined);
    };
    if (!isLiveMode()) return;
    // MP-09 c2: live mode never shows the ported demo payment accounts, not even before the read.
    replacePayAccounts([]);
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
    bazaar.setEventStock = (pid, d) => {
      const snapshot = (this.state.event as LiveEvent | null)?.snapshot;
      if (d > 0 && snapshot && !snapshot.includes(pid)) {
        this.toast("That flavour is not on this event's menu. The menu is fixed when the event starts.", 'warn');
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
      const category = String(cat || 'Bazaar rent').trim().slice(0, 40) || 'Bazaar rent';
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
      const floatCents = pesosToCentavos(Number((before.drawer as { float?: unknown } | null)?.float) || 0);
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
      this.setState(fresh);
      setTimeout(
        // Unlike the demo reset, this must not claim "gone": a sale already queued to
        // sync lives in IndexedDB (invariant 2), not in this cleared state.
        () => this.toast('Back to empty. Local records on this device were cleared.', 'warn'),
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
      if (navigator.onLine) await this.flushSales();
      else await requestBackgroundSync();
    } catch {
      this.toast('That could not be saved on this phone. Try again.', 'warn');
    }
  }

  /** Online only: the server snapshots the prices and names this phone the selling device. */
  private async startLiveEvent(
    ev: { name: string; date: string },
    begin: (ev: { name: string; date: string }) => void
  ): Promise<void> {
    const target = this.state.online ? this.salesTarget() : null;
    if (!target) {
      this.toast('Start the event while you have signal. Sales can go offline after that.', 'warn');
      return;
    }
    const outcome = await startEventOnServer(target, {
      name: ev.name,
      deviceId: deviceId(),
      eventId: eventAttemptId(ev.name)
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
        plural(unsellable, 'flavour is', 'flavours are') + ' not on the menu, so ' + (unsellable === 1 ? 'it' : 'they') + ' cannot be sold at this event.',
        'warn'
      );
    }
    this.setState((s) => ({
      event: { ...(s.event ?? {}), id: outcome.eventId, snapshot: Object.keys(outcome.prices) },
      eventPrices: { ...(s.eventPrices as Record<string, number>), ...outcome.prices }
    }));
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
  renderVals(): OpsVals {
    const vals = super.renderVals();
    if (HARNESS && !isLiveMode()) return vals;
    const starved = { ...vals, devices: [], roles: [], showPhoneWidths: false } as OpsVals;
    if (!isLiveMode()) return starved;
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
      toolGroups:
        this.state.role === 'owner'
          ? this.liveToolGroups(starved.toolGroups ?? [])
          : starved.toolGroups,
      productRows:
        this.state.role === 'owner'
          ? this.liveProductRows(starved.productRows ?? [])
          : starved.productRows,
      sheet: this.liveSheet(starved.sheet),
      liveForm: this.liveFormVals(),
      livePay: this.livePayVals(),
      liveTexts: this.liveTextsVals(),
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

  /** "Menu & flavours" in the Business group. No markup edit: All tools already maps `toolGroups`. */
  private liveToolGroups(groups: OpsVals['toolGroups']): OpsVals['toolGroups'] {
    return groups.map((g) =>
      g.title === 'Business'
        ? {
            ...g,
            items: [
              ...g.items,
              {
                icon: this.IC.cookie,
                label: 'Menu & flavours',
                sub:
                  plural(this.flavourSync?.current().length ?? 0, 'flavour', 'flavours') +
                  ' · edit, add, publish',
                badge: null,
                go: () => this.openFlavourList()
              },
              {
                icon: this.IC.cookie,
                label: 'Payment methods',
                sub: 'GCash, Maya, bank: account numbers and QR codes',
                badge: null,
                go: () => this.openPayments()
              },
              {
                icon: this.IC.cookie,
                label: 'Shop texts',
                sub: 'The shop footer: registration, TIN, invoice, allergens',
                badge: null,
                go: () => void this.openShopTexts()
              }
            ]
          }
        : g
    );
  }

  /** The products screen's "Edit price" opens the live flavour editor instead of the ported sheet. */
  private liveProductRows(rows: OpsVals['productRows']): OpsVals['productRows'] {
    return rows.map((row, i) => {
      const pid = PRODUCTS[i]?.id;
      return pid ? { ...row, edit: () => this.openFlavourEditor(pid) } : row;
    });
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
        title: sh.isNew ? 'Add a payment method' : method ? 'Edit ' + method.label : 'Payment methods'
      };
    }
    if (this.state.role === 'owner' && sh?.kind === 'shoptexts')
      return { ...sheet, liveForm: true, title: 'Shop texts' };
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
    return this.orderFlow.loadRules();
  }

  private async liveSubmit(): Promise<void> {
    if (!this.orderFlow) {
      this.toast(ORDER_COPY.unavailable, 'warn');
      return;
    }
    const c = (this.state.cust ?? {}) as CustFields;
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
    this.toast(any ? 'Same box loaded. Change anything before you check out.' : ORDER_COPY.noMenu, any ? 'ok' : 'warn');
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
    return this.onCustomerScreen() && (kind === 'liveLookup' || kind === 'liveWaitlist') ? kind : null;
  }

  private openLookupSheet(): void {
    this.orderFlow?.clearLookup();
    this.sheet('liveLookup', {});
  }

  private openWaitlist(): void {
    if (this.orderFlow && this.orderFlow.waitlistState !== 'unknown') this.orderFlow.resetWaitlist();
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
      dates: rules ? pickupDates(rules) : [],
      times: rules ? pickupTimes(rules) : [],
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
    if (this.customerSheetKind() !== 'liveLookup') return null;
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
    return { ...shell, heroTitle: ORDER_COPY.statusMissingTitle, heroBody: ORDER_COPY.statusMissing };
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
    return result;
  };

  private async reflectQueue(): Promise<void> {
    if (!isLiveMode()) return;
    const states = new Map((await allSales()).map((row) => [row.clientId, row.state]));
    this.setState((s) => {
      const sales = (s.sales as EventSale[]).map((sale) => {
        const state = states.get(clientIdFor({ saleId: sale.id, at: sale.at }));
        if (!state) return sale;
        const synced = state === 'sent';
        const failed = state === 'failed';
        return sale.synced === synced && sale.failed === failed ? sale : { ...sale, synced, failed };
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
      this.toast('Sales are safe on this phone. They will send once it can reach the server.', 'warn');
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
        this.toast('The server refused something it was sent. It is still saved on this phone. Ask Ethan to look at it.', 'warn');
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
