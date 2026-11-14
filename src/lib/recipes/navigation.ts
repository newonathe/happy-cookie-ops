/**
 * The open recipe's place in the address (HCB-013): `/recipes?recipe=<productId>` for the recipe page and
 * `/recipes?recipe=<productId>&edit=1` for its editor. The address only names a place. The runtime opens it
 * if that flavour is in the catalogue it holds, so an address can never open anything she does not have.
 */
const PRODUCT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export type RecipeRoute = `recipe=${string}` | `recipe=${string}&edit=1`;

export function isRecipeProductId(value: string): boolean {
  return PRODUCT_ID.test(value);
}

export function recipeRouteFor(id: string, edit: boolean): RecipeRoute | undefined {
  if (!isRecipeProductId(id)) return undefined;
  return edit ? `recipe=${id}&edit=1` : `recipe=${id}`;
}

/** The recipe an address names, or null for a missing, repeated or malformed one. */
export function readRecipeRoute(search: string): RecipeRoute | null {
  const params = new URLSearchParams(search);
  const ids = params.getAll('recipe');
  if (ids.length !== 1 || !isRecipeProductId(ids[0]!)) return null;
  return (
    recipeRouteFor(ids[0]!, params.getAll('edit').length === 1 && params.get('edit') === '1') ??
    null
  );
}

/** Splits a route made by `recipeRouteFor`. */
export function parseRecipeRoute(route: string): { id: string; edit: boolean } | null {
  const read = readRecipeRoute(route);
  return read
    ? { id: new URLSearchParams(read).get('recipe')!, edit: read.endsWith('&edit=1') }
    : null;
}

export function pathForRecipes(route: RecipeRoute | undefined): string {
  return route ? `/recipes?${route}` : '/recipes';
}
