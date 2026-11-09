import { registerLiveScreen } from '@/components/live/live-screens';
import { CustomerCheckoutLive } from './checkout-live';
import { CustomerShopLive } from './shop-live';

/** Public live replacement beside the locked demo; lookup and waiting-list sheets stay in the frame. */
export function registerLiveCustomerScreens(): () => void {
  const undo = [
    registerLiveScreen('shop', Object.assign(CustomerShopLive, { ownsSectionNavigation: true })),
    registerLiveScreen(
      'checkout',
      Object.assign(CustomerCheckoutLive, { ownsSectionNavigation: true })
    )
  ];
  return () => undo.forEach((run) => run());
}
