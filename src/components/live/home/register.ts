import { registerLiveScreen, type LiveScreen } from '@/components/live/live-screens';
import { HomeLive } from './home-live';

const Home: LiveScreen = Object.assign(HomeLive, { ownsSectionNavigation: true });

/** The live Home replaces the ported one in live mode; Account stays in the header, not a second tab row. */
export function registerLiveHomeScreens(): () => void {
  return registerLiveScreen('today', Home);
}
