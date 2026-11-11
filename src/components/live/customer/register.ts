import { registerLiveScreen } from '@/components/live/live-screens';
import { CustomerCheckoutLive } from './checkout-live';
import { CustomerShopLive } from './shop-live';
import { CustomerStatusLive } from './status-live';

/** Public live replacement beside the locked demo; lookup and waiting-list sheets stay in the frame. */
export function registerLiveCustomerScreens(): () => void {
  const undo = [
    registerLiveScreen(
      'status',
      Object.assign(CustomerStatusLive, { ownsSectionNavigation: true })
    ),
    registerLiveScreen('shop', Object.assign(CustomerShopLive, { ownsSectionNavigation: true })),
    registerLiveScreen(
      'checkout',
      Object.assign(CustomerCheckoutLive, { ownsSectionNavigation: true })
    )
  ];
  return () => undo.forEach((run) => run());
}
