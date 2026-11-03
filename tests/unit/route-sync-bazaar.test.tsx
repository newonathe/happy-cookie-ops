import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';

const EVENT = 'd5b00000-0000-4000-8000-000000000001';
let route = 'till';
let narrow = false;
const held = { dayId: 'day-one' };
const cart = { dcf: 2 };
const engine = {
  state: {
    screen: 'bazaar',
    role: 'owner',
    inv: [],
    invTab: 'Ingredients',
    navTick: 0,
    history: [] as string[],
    event: held,
    cart
  },
  go: vi.fn((screen: string) => {
    engine.state.screen = screen;
    engine.state.navTick++;
  }),
  setState: vi.fn((change: object) => Object.assign(engine.state, change))
};
const restore = vi.fn((next: string) => {
  route = narrow ? 'till' : next;
  return route;
});
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));
vi.mock('@/store/use-ops', () => ({
  useOpsEngine: () => engine,
  useOpsVals: () => ({ liveBazaar: { navigation: { route, restore } } })
}));
import { RouteSync } from '@/components/app/route-sync';
import { readBazaarRoute, pathForBazaar } from '@/lib/bazaar/navigation';

beforeEach(() => {
  route = 'till';
  narrow = false;
  Object.assign(engine.state, { screen: 'bazaar', navTick: 0, history: [], event: held, cart });
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/bazaar?bazaar=till');
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

function mount() {
  const view = render(<RouteSync initialScreen="bazaar" />);
  const update = () => view.rerender(<RouteSync initialScreen="bazaar" />);
  update();
  return update;
}

describe('Bazaar subviews use the existing browser history', () => {
  it('opens the directory by default and requires an explicit selling address', () => {
    expect(readBazaarRoute('')).toBe('events');
    expect(readBazaarRoute('?bazaar=not-an-event')).toBe('events');
    expect(readBazaarRoute('?bazaar=till')).toBe('till');
    expect(pathForBazaar('events')).toBe('/bazaar');
    expect(pathForBazaar('till')).toBe('/bazaar?bazaar=till');
  });
  it('restores a plain Bazaar visit to Events without changing held work', () => {
    window.history.replaceState(null, '', '/bazaar');
    mount();
    expect(restore).toHaveBeenCalledWith('events');
    expect(window.location.search).toBe('');
    expect(engine.state.event).toBe(held); expect(engine.state.cart).toBe(cart);
  });
  it.each(['events', 'till', `event:${EVENT}`])(
    'restores a direct %s address without a new history entry',
    (target) => {
      const value = target === 'events' || target === 'till' ? target : EVENT;
      window.history.replaceState(null, '', `/bazaar?bazaar=${value}`);
      const length = window.history.length;
      mount();
      expect(restore).toHaveBeenCalledWith(target);
      expect(window.location.search).toBe(target === 'events' ? '' : `?bazaar=${value}`);
      expect(window.history.length).toBe(length);
      expect(engine.state.event).toBe(held);
      expect(engine.state.cart).toBe(cart);
    }
  );

  it('pushes till, directory and event views even though the screen key stays the same', () => {
    const update = mount();
    const length = window.history.length;
    route = 'events';
    update();
    expect(window.location.search).toBe('');
    route = `event:${EVENT}`;
    update();
    expect(window.location.search).toBe(`?bazaar=${EVENT}`);
    route = 'till';
    update();
    expect(window.location.search).toBe('?bazaar=till');
    expect(window.history.length).toBe(length + 3);
    expect(engine.state.event).toBe(held);
    expect(engine.state.cart).toBe(cart);
  });

  it('restores a pop entry without pushing another or remounting selling state', () => {
    const update = mount();
    const till = window.history.state;
    route = 'events';
    update();
    const length = window.history.length;
    window.history.replaceState(till, '', '/bazaar?bazaar=till');
    act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: till })));
    update();
    expect(restore).toHaveBeenLastCalledWith('till');
    expect(window.history.length).toBe(length);
    expect(engine.state.event).toBe(held);
    expect(engine.state.cart).toBe(cart);
  });

  it('canonicalizes malformed links to Events and restricted links to the permitted till', () => {
    narrow = true;
    window.history.replaceState(null, '', `/bazaar?bazaar=${EVENT}`);
    mount();
    expect(route).toBe('till');
    expect(window.location.pathname + window.location.search).toBe('/bazaar?bazaar=till');
    cleanup();
    narrow = false;
    restore.mockClear();
    window.history.replaceState(null, '', '/bazaar?bazaar=not-an-event');
    mount();
    expect(restore).toHaveBeenCalledWith('events');
  });
});
