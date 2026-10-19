import { registerLiveScreen } from '@/components/live/live-screens';
import { InventoryLive } from './inventory-live';
import { GroceryLive } from './grocery-live';

/**
 * Puts the New Stock screens (B5) in the live-only slot, under the keys of the ported screens they
 * replace. Safe to call more than once: a key holds one component, so a second call sets the same two.
 * Returns the function that takes both registrations back.
 */
export function registerLiveStockScreens(): () => void {
  const undo = [
    registerLiveScreen('inventory', InventoryLive),
    registerLiveScreen('grocery', GroceryLive)
  ];
  return () => undo.forEach((run) => run());
}
