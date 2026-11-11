import { registerLiveScreen, type LiveScreen } from '@/components/live/live-screens';
import { AccountLive, HealthLive, NotificationsLive } from './account-live';

const owning = (screen: LiveScreen): LiveScreen =>
  Object.assign(screen, { ownsSectionNavigation: true });

/** The live Account pages take the ported screens' slots in live mode; the ported ones stay as the demo. */
export function registerLiveAccountScreens(): () => void {
  const undo = [
    registerLiveScreen('settings', owning(AccountLive)),
    registerLiveScreen('health', owning(HealthLive)),
    registerLiveScreen('notifications', owning(NotificationsLive))
  ];
  return () => undo.forEach((run) => run());
}
