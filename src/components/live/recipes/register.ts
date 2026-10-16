import { registerLiveScreen } from '@/components/live/live-screens';
import { RecipeBookLive } from './recipe-book';

/**
 * Puts the live recipe book (U7) in the live-only slot, under the key of the ported Recipes screen it fronts. The ported
 * screen is drawn by the book itself, for editing a recipe. Safe to call more than once: a key holds one component.
 * Returns the function that takes the registration back.
 */
export function registerLiveRecipeScreens(): () => void {
  return registerLiveScreen('recipes', RecipeBookLive);
}
