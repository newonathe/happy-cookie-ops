import { registerLiveScreen, type LiveScreen } from '@/components/live/live-screens';
import { MoneyLive } from './money-live';
import { SalesLive } from './sales-live';

const Money: LiveScreen = Object.assign(MoneyLive, { ownsSectionNavigation: true });

/** The live Money page replaces the ported P&L in live mode; the ported screen stays as the demo. */
export function registerLiveMoneyScreens(): () => void {
  const undo = [registerLiveScreen('pnl', Money), registerLiveScreen('sales', SalesLive)];
  return () => undo.forEach((run) => run());
}
