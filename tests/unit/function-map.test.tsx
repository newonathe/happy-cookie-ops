import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => true }));

import { OpsRuntime } from '@/store/ops-runtime';
import { SCREEN_KEYS } from '@/lib/screens';
import {
  PLACES,
  TABS,
  placeOfEntry,
  placeOfRoute,
  placesOf,
  tabOfRoute
} from '@/lib/nav/function-map';

/**
 * final-plan.md, section 8.1, as a test: every All tools entry and every route has
 * exactly one home, and none has two. The entries are read from the running live owner's
 * app and the routes from the router's list and the folders on disk, never from a copy
 * kept here, so a new entry or route with no home fails this file.
 */
function liveOwnerEntries(): string[] {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <span />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole('owner'));
  return runtime.liveToolEntries().map((item) => String(item.label));
}
const count = <T,>(list: readonly T[], value: T) => list.filter((item) => item === value).length;
const mappedEntries = PLACES.flatMap((place) => place.entries.map((entry) => entry.label));
const mappedRoutes = PLACES.flatMap((place) => place.routes);

afterEach(cleanup);

describe('the function map (final-plan.md section 8.1)', () => {
  it('has six tabs, in order, each opening a screen that belongs to it', () => {
    expect(TABS.map((tab) => tab.label)).toEqual([
      'Home',
      'Bazaar',
      'Sell',
      'Make',
      'Stock',
      'Money'
    ]);
    for (const tab of TABS) {
      expect([tab.id, tabOfRoute(tab.screen)]).toEqual([tab.id, tab.id]);
      // A tab lands on its first place.
      expect([tab.id, placesOf(tab.id)[0]?.screen]).toEqual([tab.id, tab.screen]);
    }
  });

  it('has thirteen places under the six tabs, and four homes outside them', () => {
    expect(TABS.map((tab) => placesOf(tab.id).map((place) => place.label))).toEqual([
      ['This week'],
      ['Bazaar'],
      ['Orders', 'Customers/Waitlist', 'Shop'],
      ['Bake plan', 'Recipes'],
      ['Inventory', 'Grocery', 'Suppliers'],
      ['P&L', 'Sales', 'Expenses']
    ]);
    expect(TABS.flatMap((tab) => placesOf(tab.id))).toHaveLength(13);
    const outside = PLACES.filter((place) => !TABS.some((tab) => tab.id === place.home));
    expect(outside.map((place) => place.home)).toEqual(['account', 'bell', 'customer', 'retired']);
    expect(new Set(PLACES.map((place) => place.id)).size).toBe(PLACES.length);
    // Every place holds something.
    for (const place of PLACES)
      expect([place.id, place.entries.length + place.routes.length > 0]).toEqual([place.id, true]);
  });

  it('gives each of the 33 All tools entries exactly one home', () => {
    const entries = liveOwnerEntries();
    expect(entries).toHaveLength(33);
    expect(new Set(entries).size).toBe(33);
    for (const label of entries) expect([label, count(mappedEntries, label)]).toEqual([label, 1]);
    // And the map names nothing the app does not have.
    expect([...mappedEntries].sort()).toEqual([...entries].sort());
    for (const label of entries) expect(placeOfEntry(label)).toBeTruthy();
  });

  it('gives each of the 25 routes exactly one home', () => {
    expect(SCREEN_KEYS).toHaveLength(25);
    for (const route of SCREEN_KEYS)
      expect([route, count(mappedRoutes, route)]).toEqual([route, 1]);
    expect([...mappedRoutes].sort()).toEqual([...SCREEN_KEYS].sort());
    for (const route of SCREEN_KEYS) expect(placeOfRoute(route)).toBeTruthy();
  });

  it('covers every page folder the app really has', () => {
    const app = join(process.cwd(), 'src', 'app');
    const pages = readdirSync(app, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(app, entry.name, 'page.tsx')))
      .map((entry) => entry.name);
    // The home page is src/app/page.tsx; sign-in is a page but not a screen of the app.
    expect(existsSync(join(app, 'page.tsx'))).toBe(true);
    expect([...pages.filter((name) => name !== 'sign-in'), 'today'].sort()).toEqual(
      [...SCREEN_KEYS].sort()
    );
  });

  it('retires exactly All tools and Form queue, and nothing else', () => {
    const retired = PLACES.filter((place) => place.home === 'retired');
    expect(retired).toHaveLength(1);
    expect(retired[0]!.entries.map((entry) => entry.label)).toEqual(['Form queue']);
    expect([...retired[0]!.routes].sort()).toEqual(['formqueue', 'more']);
  });

  it('opens each place on a screen that is its own, or on its one entry', () => {
    for (const place of PLACES.filter((p) => p.home !== 'retired')) {
      if (place.screen)
        expect([place.id, placeOfRoute(place.screen)?.id]).toEqual([place.id, place.id]);
      else expect([place.id, place.entries.length]).toEqual([place.id, 1]);
    }
    // An entry that opens a screen opens one of its own place's routes.
    for (const place of PLACES)
      for (const entry of place.entries)
        if (entry.screen)
          expect([entry.label, placeOfRoute(entry.screen)?.id]).toEqual([entry.label, place.id]);
  });
});
