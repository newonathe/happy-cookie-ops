import { registerLiveScreen, type LiveScreen } from '@/components/live/live-screens';
import { OrderLive } from './order-live';
import { OrdersLive } from './orders-live';
import { PaymentsLive } from './payments-live';
import { ShopLive } from './shop-live';

const owning = (screen: LiveScreen): LiveScreen =>
  Object.assign(screen, { ownsSectionNavigation: true });

/** The live Sell pages take the ported screens' slots in live mode; the ported ones stay as the demo. */
export function registerLiveSellScreens(): () => void {
  const undo = [
    registerLiveScreen('orders', owning(OrdersLive)),
    registerLiveScreen('order', owning(OrderLive)),
    registerLiveScreen('reconcile', owning(PaymentsLive)),
    registerLiveScreen('drops', owning(ShopLive))
  ];
  return () => undo.forEach((run) => run());
}
