'use client';

import {
  ALLERGENS,
  BASE_STATE,
  DEFAULT_CFG,
  OpsProvider,
  PESO,
  PRODUCTS,
  replaceFlavours
} from '@/store/engine/ops-engine';
import type { EventSale, OpsEngineProps, Role } from '@/store/engine/ops-engine';
import { defaultSalesClient, flushQueue, requestBackgroundSync, type FlushResult } from '@/lib/offline/sync';
import { allSales, clientIdFor, enqueueVoid, pendingSales } from '@/lib/offline/queue';
import { clearBazaar, readBazaar, saveBazaar } from '@/lib/offline/bazaar-state';
import { startEventOnServer, type EventSalesClient } from '@/lib/data/event-sales';
import { deviceId } from '@/lib/device';
import { plural } from '@/store/engine/ops-engine';
import type { LiveFlavourFormFields, OpsVals } from '@/view-models/vals';
import { isLiveMode } from '@/lib/config/app-mode';
import { clearStoredBooks, liveBaseState } from '@/lib/data/live-state';
import { STATE_LEVEL_KEYS, type SettingsClient } from '@/lib/data/settings';
import { SettingsSync } from '@/lib/data/settings-sync';
import { centavosFromDb, centavosToPesos } from '@/lib/money';
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

/** The engine's bazaar actions are instance fields the typings do not list; wrapped below. */
interface BazaarActions {
  recordSale: (pay: string, freebie?: boolean) => void;
  voidSale: (id: string) => void;
  startEvent: (ev: { name: string; date: string }) => void;
  setEventPrice: (pid: string, value: unknown) => void;
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
    // DP-20: an event sells at the menu prices it started with, taken by the server.
    bazaar.startEvent = (ev) => {
      void this.startLiveEvent(ev, startEvent);
    };
    bazaar.setEventPrice = () => {
      this.toast('Bazaar prices are the menu prices from the moment the event starts.', 'warn');
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
      event: { ...(s.event ?? {}), id: outcome.eventId },
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
            cancel: () => this.openFlavourList()
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
      this.toast(
        result.sent.length +
          ' of ' +
          (result.sent.length + failed) +
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
    this.toast(plural(result.sent.length || pending, 'sale', 'sales') + ' synced.');
  }
}

export type OpsRuntimeProps = OpsEngineProps;
