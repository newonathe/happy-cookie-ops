import { registerLiveScreen } from '@/components/live/live-screens';
import { RecipeBookLive } from './recipe-book';
import { ProductsLive } from './products-live';

/**
 * Product library and saved-recipe reader use the live slots beside the locked demo.
 * The book retains the existing editor. Safe to register repeatedly; returns cleanup for both slots.
 */
export function registerLiveRecipeScreens(): () => void {
  const undo = [
    registerLiveScreen('recipes', RecipeBookLive),
    registerLiveScreen('products', ProductsLive)
  ];
  return () => undo.forEach((run) => run());
}
