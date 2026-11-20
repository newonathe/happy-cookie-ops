import { registerLiveScreen } from '@/components/live/live-screens';
import { CafeScreen } from './cafe-screen';

/** Puts the live Café screen in the live-only slot, under its own key. Returns the function that takes it back. */
export function registerLiveCafeScreens(): () => void {
  return registerLiveScreen('cafe', CafeScreen);
}
