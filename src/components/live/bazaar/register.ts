import { registerLiveScreen } from '@/components/live/live-screens';
import { BazaarLive } from './bazaar-live';

/**
 * Puts the live Bazaar screen (S2) in the live-only slot, under the key of the ported Bazaar Mode it fronts. It draws the
 * ported till itself whenever the phone holds an event. Safe to call more than once: a key holds one component.
 * Returns the function that takes the registration back.
 */
export function registerLiveBazaarScreens(): () => void {
  return registerLiveScreen('bazaar', BazaarLive);
}
