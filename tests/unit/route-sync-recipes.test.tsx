import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

let route: string | undefined;
/** The flavours the held catalogue has. */
let held = ['dcf', 'wcb'];
const engine = {
  state: {
    screen: 'recipes',
    role: 'owner',
    inv: [],
    invTab: 'Ingredients',
    navTick: 0,
    history: [] as string[]
  },
  go: vi.fn((screen: string) => {
    engine.state.screen = screen;
    engine.state.navTick++;
  }),
  setState: vi.fn((change: object) => Object.assign(engine.state, change))
};
const restore = vi.fn((asked: string | null) => {
  const id = asked ? new URLSearchParams(asked).get('recipe') : null;
  if (asked && id && held.includes(id)) route = asked;
  return asked ? (id && held.includes(id) ? asked : undefined) : route;
});
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/store/use-ops', () => ({
  useOpsEngine: () => engine,
  useOpsVals: () => ({
    liveRecipeNavigation: { route, restore },
    liveBazaar: { navigation: { route: 'till', restore: vi.fn() } }
  })
}));
import { RouteSync } from '@/components/app/route-sync';
import { pathForRecipes, readRecipeRoute } from '@/lib/recipes/navigation';

beforeEach(() => {
  route = undefined;
  held = ['dcf', 'wcb'];
  Object.assign(engine.state, { screen: 'recipes', navTick: 0, history: [] });
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function mount(initial: 'recipes' | 'bazaar' = 'recipes') {
  const view = render(<RouteSync initialScreen={initial} />);
  const update = () => view.rerender(<RouteSync initialScreen={initial} />);
  update();
  return update;
}
const address = () => window.location.pathname + window.location.search;

describe('HCB-013: the open recipe is in the address', () => {
  it('reads only a single, well-formed product id', () => {
    expect(readRecipeRoute('?recipe=dcf')).toBe('recipe=dcf');
    expect(readRecipeRoute('?recipe=dcf&edit=1')).toBe('recipe=dcf&edit=1');
    expect(readRecipeRoute('?recipe=dcf&edit=yes')).toBe('recipe=dcf');
    for (const bad of [
      '',
      '?recipe=',
      '?recipe=a&recipe=b',
      '?recipe=<img src=x>',
      '?recipe=../x',
      '?recipe=a%20b',
      '?recipe=' + 'a'.repeat(65)
    ])
      expect(readRecipeRoute(bad)).toBeNull();
    expect(pathForRecipes(undefined)).toBe('/recipes');
    expect(pathForRecipes('recipe=dcf&edit=1')).toBe('/recipes?recipe=dcf&edit=1');
  });
  it('reloading the recipe address lands on that recipe, replacing the entry', () => {
    window.history.replaceState(null, '', '/recipes?recipe=wcb');
    const length = window.history.length;
    mount();
    expect(restore).toHaveBeenCalledWith('recipe=wcb');
    expect(address()).toBe('/recipes?recipe=wcb');
    expect(window.history.length).toBe(length);
    expect(engine.go).not.toHaveBeenCalledWith('products');
  });
  it('reloading the editor address asks for the editor too', () => {
    window.history.replaceState(null, '', '/recipes?recipe=dcf&edit=1');
    mount();
    expect(restore).toHaveBeenCalledWith('recipe=dcf&edit=1');
    expect(address()).toBe('/recipes?recipe=dcf&edit=1');
  });
  it('an unknown id lands on the Recipe book and cleans the address', () => {
    window.history.replaceState(null, '', '/recipes?recipe=nope');
    const length = window.history.length;
    mount();
    expect(restore).toHaveBeenCalledWith('recipe=nope');
    expect(address()).toBe('/recipes');
    expect(window.history.length).toBe(length);
  });
  it('a plain Recipes visit stays plain', () => {
    window.history.replaceState(null, '', '/recipes');
    mount();
    expect(address()).toBe('/recipes');
  });
  it('opening and closing a recipe or its editor rewrites the address without a new entry', () => {
    window.history.replaceState(null, '', '/recipes');
    const update = mount();
    const length = window.history.length;
    route = 'recipe=dcf';
    update();
    expect(address()).toBe('/recipes?recipe=dcf');
    route = 'recipe=dcf&edit=1';
    update();
    expect(address()).toBe('/recipes?recipe=dcf&edit=1');
    route = undefined;
    update();
    expect(address()).toBe('/recipes');
    expect(window.history.length).toBe(length);
  });
  it('leaves the Bazaar route alone and never reads the recipe query there', () => {
    engine.state.screen = 'bazaar';
    window.history.replaceState(null, '', '/bazaar?bazaar=till&recipe=dcf');
    mount('bazaar');
    expect(restore).not.toHaveBeenCalled();
    expect(address()).toBe('/bazaar?bazaar=till');
  });
  it('a pop onto a recipe address asks the runtime to open it', () => {
    window.history.replaceState(null, '', '/recipes');
    mount();
    restore.mockClear();
    window.history.replaceState(window.history.state, '', '/recipes?recipe=wcb');
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state })));
    expect(restore).toHaveBeenCalledWith('recipe=wcb');
  });
});
