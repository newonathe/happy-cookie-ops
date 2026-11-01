'use client';

import { useEffect, type ComponentType } from 'react';
import Image from 'next/image';
import type { OpsVals } from '@/view-models/vals';
import { CUSTOMER_SCREENS, type ScreenKey } from '@/lib/screens';
import { isLiveMode } from '@/lib/config/app-mode';
import { s } from '@/lib/css';
import { AppFrame } from '@/components/shell/app-frame';
import { HomeScreen } from '@/components/screens/home';
import { SalesLogScreen } from '@/components/screens/sales-log';
import { OrdersScreen } from '@/components/screens/orders';
import { OrderDetailScreen } from '@/components/screens/order-detail';
import { BakePlanScreen } from '@/components/screens/bake-plan';
import { ProductionFocusScreen } from '@/components/screens/production-focus';
import { InventoryScreen } from '@/components/screens/inventory';
import { PaymentsScreen } from '@/components/screens/payments';
import { AllToolsScreen } from '@/components/screens/all-tools';
import { GroceryListScreen } from '@/components/screens/grocery-list';
import { ProfitAndLossScreen } from '@/components/screens/profit-and-loss';
import { BazaarModeScreen } from '@/components/screens/bazaar-mode';
import { FormQueueScreen } from '@/components/screens/form-queue';
import { SystemHealthScreen } from '@/components/screens/system-health';
import { ProductsScreen } from '@/components/screens/products';
import { DropsScreen } from '@/components/screens/drops';
import { SuppliersScreen } from '@/components/screens/suppliers';
import { SettingsScreen } from '@/components/screens/settings';
import { RecipesScreen } from '@/components/screens/recipes';
import { NotificationsScreen } from '@/components/screens/notifications';
import { FindMyOrderScreen } from '@/components/screens/find-my-order';
import { ShopScreen } from '@/components/screens/shop';
import { CheckoutScreen } from '@/components/screens/checkout';
import { OrderStatusScreen } from '@/components/screens/order-status';
import { LiveScreenHost } from './live-screen-host';
import styles from './owner-workspace.module.css';
import theme from './owner-theme.module.css';

const screens = {
  today: HomeScreen,
  sales: SalesLogScreen,
  orders: OrdersScreen,
  order: OrderDetailScreen,
  bake: BakePlanScreen,
  batch: ProductionFocusScreen,
  inventory: InventoryScreen,
  reconcile: PaymentsScreen,
  more: AllToolsScreen,
  grocery: GroceryListScreen,
  pnl: ProfitAndLossScreen,
  bazaar: BazaarModeScreen,
  formqueue: FormQueueScreen,
  health: SystemHealthScreen,
  products: ProductsScreen,
  drops: DropsScreen,
  suppliers: SuppliersScreen,
  settings: SettingsScreen,
  recipes: RecipesScreen,
  notifications: NotificationsScreen,
  lookup: FindMyOrderScreen,
  shop: ShopScreen,
  checkout: CheckoutScreen,
  status: OrderStatusScreen
} satisfies Record<Exclude<ScreenKey, 'stocktake'>, ComponentType<{ v: OpsVals }>>;

function Icon({ path, size, weight }: { path: string; size: number; weight: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

/** Keep existing sheet/quick-action operations on their proven host, without its page chrome. */
function WorkspaceOverlays({ v }: { v: OpsVals }) {
  if (!v.sheet && !v.quickOpen) return null;
  const overlayVals: OpsVals = {
    ...v,
    toast: null,
    bareFrame: true,
    showRail: false,
    showDock: false,
    showTopBar: false,
    showFlowStrip: false,
    showPhoneWidths: false,
    flow: null,
    liveScreen: null,
    denied: false,
    screens: Object.fromEntries(
      Object.keys(v.screens).map((key) => [key, false])
    ) as OpsVals['screens'],
    frameOuterStyle: 'width:100%;height:100dvh',
    frameStyle:
      'width:100%;height:100%;display:flex;flex-direction:column;position:relative;background:transparent',
    pagePad: '0',
    pageMax: '100%'
  };
  return (
    <div
      className={styles.overlays}
      style={{ pointerEvents: v.sheet || v.quickOpen ? 'auto' : 'none' }}
    >
      <AppFrame v={overlayVals} />
    </div>
  );
}

/** Messages need no page frame behind them. Their lifetime and Undo still belong to the runtime. */
function WorkspaceToast({ v }: { v: OpsVals }) {
  if (!v.toast) return null;
  return (
    <div
      role={v.toastWarn ? 'alert' : 'status'}
      aria-atomic="true"
      style={s(
        `${v.toastStyle};position:fixed;z-index:90;left:calc(var(--workspace-sidebar, 0px) + 14px);pointer-events:none`
      )}
    >
      <div className={styles.toastBox}>
        {v.toastWarn ? <Icon path={v.ic.alert} size={18} weight={1.8} /> : null}
        {v.toastOk ? <Icon path={v.ic.check} size={18} weight={2} /> : null}
        <span>{v.toast.msg}</span>
        {v.toast.undo ? (
          <button type="button" onClick={v.runUndo}>
            Undo
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Navigation({ items, phone = false }: { items: OpsVals['dockNav']; phone?: boolean }) {
  return (
    <nav
      aria-label={phone ? 'Phone navigation' : 'Main navigation'}
      className={phone ? styles.dock : styles.navigation}
    >
      {items.map((item) => (
        <button
          key={String(item.label)}
          type="button"
          aria-current={item.active ? 'page' : undefined}
          onClick={item.go}
        >
          <Icon path={item.icon} size={19} weight={1.6} />
          <span>{item.label}</span>
          {item.badge ? <span className={styles.badge}>{item.badge}</span> : null}
        </button>
      ))}
    </nav>
  );
}

/** The approved live frame is separate from the locked demo. Its domain runtime never remounts. */
export function OwnerWorkspace({
  v,
  screen,
  role,
  onAccount
}: {
  v: OpsVals;
  screen: string;
  role: string;
  onAccount: () => void;
}) {
  const title = !v.denied && typeof v.pageTitle === 'string' ? v.pageTitle : 'The Happy Cookie';
  useEffect(() => {
    if (isLiveMode())
      document.title = title === 'The Happy Cookie' ? title : `${title} · The Happy Cookie`;
  }, [title]);
  // Keep public, denied, helper and restricted selling/focus modes on their existing boundary.
  if (
    !isLiveMode() ||
    role !== 'owner' ||
    v.denied ||
    !v.showTopBar ||
    CUSTOMER_SCREENS.includes(screen as ScreenKey)
  )
    return <AppFrame v={v} />;
  const active = v.dockNav.find((item) => item.active);
  const back =
    screen === 'inventory' && v.liveStock
      ? v.liveStock.count && !v.liveStock.count.paused
        ? v.liveStock.count.back
        : v.liveStock.page?.pricesOpen
          ? (v.liveStock.page.closePrices ?? v.liveStock.page.close)
          : (v.liveStock.page?.close ?? v.goBack)
      : v.goBack;
  return (
    <div
      className={`${styles.workspace} ${theme.theme}`}
      data-refined-frame
      data-owner-theme="neutral-glass"
    >
      <aside className={styles.rail}>
        <div className={styles.brand}>
          <Image src="/assets/mark.png" alt="" width={30} height={30} unoptimized />
          <span>
            The Happy Cookie<small>Owner workspace</small>
          </span>
        </div>
        <Navigation items={v.dockNav} />
        <div className={styles.owner}>
          <span className={styles.avatar}>{v.roleInitial}</span>
          <span>
            {v.roleWho}
            {v.roleWho !== 'Owner' ? <small>Owner</small> : null}
          </span>
        </div>
      </aside>
      <div className={styles.work}>
        <header className={styles.header}>
          <div className={styles.location}>
            {v.showBack ? (
              <button type="button" className={styles.back} aria-label="Back" onClick={back}>
                <Icon path={v.ic.back} size={18} weight={1.7} />
              </button>
            ) : null}
            <span>{active?.label ?? title}</span>
          </div>
          <div className={styles.accountActions}>
            {v.offline ? <span className={styles.connection}>Offline</span> : null}
            <button type="button" className={styles.quickAdd} onClick={v.openQuick}>
              <Icon path={v.ic.plus} size={16} weight={1.7} />
              <span>Quick add</span>
            </button>
            <button
              type="button"
              className={styles.notification}
              onClick={v.openNotifications}
              aria-label="Notifications"
            >
              <Icon path={v.ic.bell} size={18} weight={1.6} />
              {v.hasAlerts ? <span className={styles.alertDot} aria-hidden="true" /> : null}
            </button>
            <button
              type="button"
              className={styles.account}
              onClick={onAccount}
              aria-label="Account"
            >
              <span className={styles.avatar}>{v.roleInitial}</span>
              <span>Account</span>
            </button>
          </div>
        </header>
        <main key={screen} className={styles.main}>
          {v.liveScreen ? <LiveScreenHost v={v} /> : null}
          {Object.entries(screens).map(([key, Screen]) =>
            v.screens[key as keyof typeof v.screens] ? <Screen key={key} v={v} /> : null
          )}
        </main>
      </div>
      <Navigation items={v.dockNav} phone />
      <WorkspaceOverlays v={v} />
      <WorkspaceToast v={v} />
    </div>
  );
}
