import { registerLiveScreen } from '@/components/live/live-screens';
import { RecipeBookLive } from './recipe-book';
import { ProductsLive } from './products-live';
import { ProductionLive } from '../production/production-live';

/**
 * Make screens use the live slots beside the locked demo. The recipe book retains the
 * existing editor. Safe to register repeatedly; returns cleanup for all three slots.
 */
export function registerLiveRecipeScreens(): () => void {
  const undo = [
    registerLiveScreen('recipes', RecipeBookLive),
    registerLiveScreen('products', ProductsLive),
    registerLiveScreen('bake', ProductionLive)
  ];
  return () => undo.forEach((run) => run());
}
