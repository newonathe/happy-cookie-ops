'use client';

import {
  ALLERGENS,
  BASE_STATE,
  DEFAULT_CFG,
  OpsProvider,
  PRODUCTS,
  replaceFlavours
} from '@/store/engine/ops-engine';
import type { EventSale, OpsEngineProps, Role } from '@/store/engine/ops-engine';
import { flushQueue, requestBackgroundSync } from '@/lib/offline/sync';
import { pendingSales } from '@/lib/offline/queue';
import { plural } from '@/store/engine/ops-engine';
import type { OpsVals } from '@/view-models/vals';
import { isLiveMode } from '@/lib/config/app-mode';
import { clearStoredBooks, liveBaseState } from '@/lib/data/live-state';
import { STATE_LEVEL_KEYS, type SettingsClient } from '@/lib/data/settings';
import { SettingsSync } from '@/lib/data/settings-sync';
import {
  FLAVOUR_TOASTS,
  FlavourSync,
  catalogueStatePatch,
  engineCatalogue,
  fetchShopFlavours,
  flavourStatePatch,
  shopCatalogue,
  type FlavourEdit,
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
 * /api/sync. The user-facing copy is unchanged: the same sentences fire on the same
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
const IDLE_ROWS: Array<{ role: Role; label: string }> = [
  { role: 'owner', label: 'Sign Cine out after' },
  { role: 'support', label: 'Sign support out after' },
  { role: 'helper', label: 'Sign helpers out after' }
];

export class OpsRuntime extends OpsProvider {
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
    if (!isLiveMode()) return;
    this.state = liveBaseState();
    this.persist = () => {};
    this.resetData = () => {
      clearStoredBooks();
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
   * The prototype read localStorage in a field initialiser and restores the saved books
   * one commit after mount (see `OpsEngine.componentDidMount`, protected). Live mode never
   * reads or writes `hc-ops-state-v1`: `state` already starts from the emptied live state
   * (constructor, above), so this skips straight to `afterRestore` without calling
   * `super.componentDidMount()`, which would call the protected `loadState()`.
   */
  componentDidMount(): void {
    if (isLiveMode()) {
      clearStoredBooks();
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
    const result = await flushQueue();
    const sentIds = new Set(result.sent.map((clientId) => clientId.split(':')[1]));
    const failed = result.failed.length;

    if (failed) {
      await requestBackgroundSync();
      this.setState((s) => ({
        syncState: 'partial',
        syncTried: true,
        unsynced: failed,
        sales: s.sales.map((sale: EventSale) =>
          sentIds.has(sale.id)
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
