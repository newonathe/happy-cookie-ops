import { registerLiveScreen } from '@/components/live/live-screens';
import { CustomerShopLive } from './shop-live';

/** Public live replacement beside the locked demo; lookup and waiting-list sheets stay in the frame. */
export function registerLiveCustomerScreens(): () => void {
  return registerLiveScreen(
    'shop',
    Object.assign(CustomerShopLive, { ownsSectionNavigation: true })
  );
}
