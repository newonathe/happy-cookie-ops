import { registerLiveStockScreens } from '@/components/live/stock/register';
import { registerLiveBazaarScreens } from '@/components/live/bazaar/register';
import { registerLiveRecipeScreens } from '@/components/live/recipes/register';
import { registerLiveMoneyScreens } from '@/components/live/money/register';
import { registerLiveHomeScreens } from '@/components/live/home/register';
import { registerLiveSellScreens } from '@/components/live/sell/register';
import { registerLiveCustomerScreens } from '@/components/live/customer/register';
import { registerLiveAccountScreens } from '@/components/live/account/register';

/**
 * Puts every live screen in the live-only registry. Live builds use this file; demo builds
 * swap it for `register-none.ts` (next.config.ts), so the live screens are not shipped there.
 */
export function registerAllLiveScreens(): void {
  registerLiveStockScreens();
  registerLiveBazaarScreens();
  registerLiveRecipeScreens();
  registerLiveMoneyScreens();
  registerLiveHomeScreens();
  registerLiveSellScreens();
  registerLiveAccountScreens();
  registerLiveCustomerScreens();
}
