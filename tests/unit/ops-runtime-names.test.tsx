import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let live = true;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { ROLES } from '@/store/engine/ops-engine';
import { useOpsVals } from '@/store/use-ops';
import { AppFrame } from '@/components/shell/app-frame';
import {
  STAFF_NAME_MAX,
  cleanStaffName,
  clearStaffName,
  readStaffName,
  rememberStaffName
} from '@/lib/auth/staff-name';
import { clearRememberedCheck, rememberCheck } from '@/lib/auth/offline-trust';
import { setIdentityWords } from '@/lib/orders/identity';
import { ORDER_COPY } from '@/lib/orders/copy';
import { BOOKS_COPY, STAFF_COPY, STOCK_COPY } from '@/lib/orders/staff-copy';
import { renderMessage } from '@/lib/messaging/templates';
import { clearBazaar } from '@/lib/offline/bazaar-state';

/**
 * Slice B2: no person and no shop from the prototype is named in the live app. The signed-in
 * person's name comes from their profile (the greeting, the account chip, and who rang a
 * bazaar sale up); the owner's and the shop's names inside sentences come from her own shop
 * details, or the sentence names nobody. Each `Mutation:` line is a change one of these fails on.
 */
function Frame() {
  return <AppFrame v={useOpsVals()} />;
}
function mount(role: 'owner' | 'helper' | 'support' = 'owner') {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Frame />
    </OpsRuntime>
  );
  const runtime = ref.current!;
  act(() => runtime.setRole(role));
  return runtime;
}
const at = (runtime: OpsRuntime, iso: string) =>
  act(() => runtime.setState({ now: Date.parse(iso) } as never));
const text = (value: unknown) => String(value);
const settingsRow = (runtime: OpsRuntime, label: string) =>
  runtime
    .renderVals()
    .settingsGroups.flatMap((group) => group.rows)
    .find((row) => row.label === label);

const STAFF = [
  { id: 'u-owner', display_name: '  Marisol   Vega\n', role: 'owner', active: true },
  { id: 'u-helper', display_name: 'Tomas', role: 'helper', active: true },
  { id: 'u-gone', display_name: 'Left Last Year', role: 'helper', active: false }
];
/** A client that answers the two reads `loadStaffName` makes, as the signed-in `uid`. */
const staffClient = (uid: string | null, rows: unknown[] | null = STAFF) =>
  ({
    auth: {
      getSession: async () => ({ data: { session: uid ? { user: { id: uid } } : null } })
    },
    from: () => ({
      select: async () =>
        rows ? { data: rows, error: null } : { data: null, error: { code: 'X' } }
    })
  }) as never;
const identityClient = (answer: { data?: unknown; error?: unknown; status?: number }) =>
  ({ rpc: vi.fn(async () => ({ data: null, error: null, status: 200, ...answer })) }) as never;

const savedZone = process.env.TZ;
beforeAll(() => {
  // A device that is not in Manila: the greeting and the date must still be the shop's.
  process.env.TZ = 'America/Los_Angeles';
});
afterAll(() => {
  if (savedZone === undefined) delete process.env.TZ;
  else process.env.TZ = savedZone;
});
afterEach(() => {
  cleanup();
  clearBazaar();
  localStorage.clear();
  setIdentityWords(null);
  live = true;
});

describe('a name as a sale may carry it', () => {
  it('is plain text, single-spaced, and never longer than the sale function accepts', () => {
    expect(cleanStaffName('  Marisol \t Vega\n')).toBe('Marisol Vega');
    expect(cleanStaffName('A'.repeat(60))).toHaveLength(STAFF_NAME_MAX);
    // 25 two-unit characters: 20 fit in 40 units, and no pair is cut in half.
    const wide = cleanStaffName('😀'.repeat(25));
    expect(wide).toBe('😀'.repeat(20));
    expect(wide.slice(0, 40)).toBe(wide);
    for (const nothing of [null, undefined, 7, {}, '', ' \n ', '​‮'])
      expect(cleanStaffName(nothing)).toBe('');
    expect(cleanStaffName('To​mas‮')).toBe('Tomas'); // nothing invisible is kept
    // Mutation: cutting at 40 characters instead of 40 units lets the queue's own cut split a pair.
  });

  it('is remembered under its own key, for its role, and forgotten on request', () => {
    rememberStaffName('helper', 'Tomas');
    expect(readStaffName()).toEqual({ role: 'helper', name: 'Tomas' });
    expect(Object.keys(localStorage)).toEqual(['hc-live-staff-name']);
    clearStaffName();
    expect(readStaffName()).toBeNull();
    for (const bad of ['{', '"x"', '{"role":"boss","name":"A"}', '{"role":"owner","name":7}']) {
      localStorage.setItem('hc-live-staff-name', bad);
      expect(readStaffName()).toBeNull();
    }
  });
});

describe('sentences that used to name the owner or the shop (audit H14)', () => {
  it('name nobody until she has set her shop details', () => {
    expect(ORDER_COPY.status.receivedNoHold).toBe(
      'We have your order. We will confirm your payment.'
    );
    expect(ORDER_COPY.status.cancelledBody).toBe('This order is cancelled.');
    expect(ORDER_COPY.lookupMiss).toBe('Nothing matches that. Check the number.');
    expect(ORDER_COPY.waitlistDone).toBe('You are on the waiting list. We will message you.');
    expect(ORDER_COPY.noMethods).toBe('No payment method is set up yet.');
    expect(STOCK_COPY.ownerOnly).toBe('Only the owner can change stock.');
    expect(BOOKS_COPY.ownerOnly).toBe('Only the owner can change the books.');
    expect(
      renderMessage('pickup_ready', { name: 'Ana', orderId: 'HC-7', window: 'x', place: 'y' })
    ).toContain('Your order HC-7 is ready.');
  });

  it('use her own name, shop name and contact line once set, and nothing of another shop', () => {
    setIdentityWords({
      shopName: 'Dulce Lab',
      ownerName: 'Marisol',
      contactLine: 'Text 0900 000 0137.'
    });
    expect(ORDER_COPY.status.receivedNoHold).toBe(
      'We have your order. Marisol will confirm your payment.'
    );
    expect(ORDER_COPY.status.cancelledBody).toBe('This order is cancelled. Text 0900 000 0137.');
    expect(STOCK_COPY.ownerOnly).toBe('Only Marisol can change stock.');
    expect(
      renderMessage('pickup_ready', { name: 'Ana', orderId: 'HC-7', window: 'x', place: 'y' })
    ).toContain('Your Dulce Lab order HC-7 is ready.');
    setIdentityWords({ shopName: 'Ube House', ownerName: 'Pilar', contactLine: '' });
    expect(ORDER_COPY.status.receivedNoHold).toContain('Pilar');
    expect(ORDER_COPY.status.cancelledBody).toBe('This order is cancelled.');
    expect(STAFF_COPY.offline).toBe('Offline. That did not save.');
    // Mutation: a sentence that keeps a name in it shows shop A's owner to shop B's customers.
  });
});

describe('the signed-in person in live mode', () => {
  it('is never one of the prototype’s people: with no name known, the role word stands in', () => {
    const runtime = mount('owner');
    at(runtime, '2026-10-06T10:30:00Z'); // 18:30 in Manila, 03:30 on this device
    const v = runtime.renderVals();
    expect(text(v.greeting)).toBe('Good evening.');
    expect(text(v.roleWho)).toBe('Owner');
    expect(text(v.clerkName)).toBe('Owner');
    expect(ROLES.owner.label).toBe('Owner');
    expect(ROLES.helper.label).toBe('Helper');
    expect(text(v.deniedTitle)).toBe('Only the owner can open this');
    // Mutation: taking the hour from the device says "Good morning" at half past six in the evening.
  });

  it('dates Home on the shop’s clock, not the device’s', () => {
    const runtime = mount('owner');
    at(runtime, '2026-10-06T17:00:00Z'); // Wednesday 01:00 in Manila, Tuesday 10:00 on this device
    expect(text(runtime.renderVals().todayDate)).toBe('Wednesday, 7 Oct');
    expect(text(runtime.renderVals().greeting)).toBe('Good morning.');
  });

  it('takes their name from their own profile: the greeting, the chip, and who rang a sale up', async () => {
    const runtime = mount('owner');
    at(runtime, '2026-10-06T02:00:00Z');
    rememberCheck('owner'); // the gate records a passed check before it asks for the name
    expect(runtime.staffNameRead).toBe(false);
    await act(async () => void (await runtime.loadStaffName(staffClient('u-owner'), 'owner')));
    expect(runtime.staffNameRead).toBe(true);
    const v = runtime.renderVals();
    expect(text(v.greeting)).toBe('Good morning, Marisol Vega.');
    expect(text(v.roleWho)).toBe('Marisol Vega · owner');
    expect(text(v.roleInitial)).toBe('M');
    expect(text(v.clerkName)).toBe('Marisol Vega');
    expect(ROLES.owner.label).toBe('Marisol Vega'); // what the engine writes on each sale
    expect(ROLES.helper.label).toBe('Helper');
    expect(readStaffName()).toEqual({ role: 'owner', name: 'Marisol Vega' });
    // "Who can see what": the people on record, the one who left not among them.
    expect(v.users.map((u) => [u.name, u.role])).toEqual([
      ['Marisol Vega', 'Owner'],
      ['Tomas', 'Helper']
    ]);
    expect(text(settingsRow(runtime, 'Who can see what')?.value)).toBe('1 owner, 1 helper');
    expect(text(settingsRow(runtime, 'Technical support access')?.value)).toBe('None');
    // Mutation: reading the first row instead of the signed-in one greets the owner as a helper.
  });

  it('keeps what it had when the profile cannot be read, and reads nothing when signed out', async () => {
    const runtime = mount('helper');
    rememberCheck('helper');
    expect(await runtime.loadStaffName(staffClient('u-helper', null), 'helper')).toBe(false);
    expect(await runtime.loadStaffName(staffClient(null), 'helper')).toBe(false);
    expect(await runtime.loadStaffName(null, 'helper')).toBe(false);
    expect(text(runtime.renderVals().clerkName)).toBe('Helper');
    expect(readStaffName()).toBeNull();
    expect(runtime.renderVals().users).toEqual([]);
    expect(runtime.staffNameRead).toBe(false); // so the gate asks again at its next check
  });

  it('never sells under the last person’s name: an online load waits for the profile', async () => {
    // Tomas closed the tab without signing out; the phone still remembers him.
    rememberStaffName('helper', 'Tomas');
    const runtime = mount('helper');
    rememberCheck('helper');
    // Before the profile answers, and when it cannot be read at all: the role word, not Tomas.
    expect(text(runtime.renderVals().clerkName)).toBe('Helper');
    expect(ROLES.helper.label).toBe('Helper');
    expect(await runtime.loadStaffName(staffClient('u-other', null), 'helper')).toBe(false);
    expect(text(runtime.renderVals().clerkName)).toBe('Helper');
    // Mutation: applying the remembered name when the app starts puts Tomas on the next
    // helper's sales for as long as her own profile cannot be read.
  });

  it('drops a profile read that lands after a sign-out, instead of writing the name back', async () => {
    const runtime = mount('helper');
    rememberCheck('helper');
    let answer!: (value: { data: unknown; error: null }) => void;
    const slow = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'u-helper' } } } }) },
      from: () => ({ select: () => new Promise((resolve) => void (answer = resolve)) })
    } as never;
    const read = runtime.loadStaffName(slow, 'helper');
    await Promise.resolve();
    await Promise.resolve();
    clearRememberedCheck(); // what signing out does first
    answer({ data: STAFF, error: null });
    expect(await read).toBe(false);
    expect(readStaffName()).toBeNull();
    expect(ROLES.helper.label).toBe('Helper');
    // Mutation: without the check, Tomas's name is back on the phone after he signed out.
  });

  it('a helper is named from their own row and never gets the staff list', async () => {
    const runtime = mount('helper');
    rememberCheck('helper');
    await act(async () => void (await runtime.loadStaffName(staffClient('u-helper'), 'helper')));
    expect(text(runtime.renderVals().clerkName)).toBe('Tomas');
    expect(runtime.renderVals().users).toEqual([]);
  });

  it('a phone that reopens with no signal still knows who is selling, for that role only', () => {
    rememberStaffName('helper', 'Tomas');
    const helper = mount('helper');
    act(() => helper.restoreStaffName('owner')); // the gate reopened it as another role
    expect(text(helper.renderVals().clerkName)).toBe('Helper');
    act(() => helper.restoreStaffName('helper')); // what the gate does when it holds offline
    expect(text(helper.renderVals().clerkName)).toBe('Tomas');
    expect(ROLES.owner.label).toBe('Owner');
    cleanup();
    // Signing out forgets it (`signOutLocal`): the next person never sells under this name.
    clearStaffName();
    const next = mount('helper');
    act(() => next.restoreStaffName('helper'));
    expect(text(next.renderVals().clerkName)).toBe('Helper');
    // Mutation: applying a remembered name to every role names the owner after the helper.
  });

  it('leaves the demo exactly as ported, even after a live runtime ran in the same page', () => {
    mount('owner');
    cleanup();
    live = false;
    const demo = mount('owner');
    expect(ROLES.owner.label).toBe('Cine');
    expect(ROLES.helper.label).toBe('Kristian');
    expect(text(demo.renderVals().greeting)).toContain(', Cine.');
    expect(text(demo.renderVals().roleWho)).toBe('Cine To · owner');
  });
});

describe('the shop’s own details', () => {
  const IDENTITY = {
    shop_name: 'Dulce Lab',
    owner_name: 'Marisol',
    contact_line: 'Text 0900 000 0137.',
    tagline: 'Three kinds, baked on Thursdays.',
    updated_at: '2026-10-06T01:00:00.000Z'
  };

  it('a database without them yet reads as nothing set: neutral wording, no tagline, no error', async () => {
    const runtime = mount('owner');
    for (const answer of [
      { error: { code: 'PGRST202', message: 'no function' }, status: 404 },
      { error: { code: '42883', message: 'no function' }, status: 404 },
      { error: { code: '57014', message: 'timeout' }, status: 500 },
      { data: { shop_name: 7 } }
    ]) {
      let read = true;
      await act(async () => void (read = await runtime.loadShopIdentity(identityClient(answer))));
      expect(read).toBe(false);
      expect(runtime.renderVals().shopTagline).toBe('');
      expect(ORDER_COPY.status.receivedNoHold).toBe(
        'We have your order. We will confirm your payment.'
      );
    }
    // Mutation: treating a missing function as a failure to report breaks the trial, which runs
    // this code before the migration is applied there.
  });

  it('once read, the tagline, the sentences and the owner’s sign-out row are hers', async () => {
    const runtime = mount('owner');
    await act(
      async () => void (await runtime.loadShopIdentity(identityClient({ data: IDENTITY })))
    );
    const v = runtime.renderVals();
    expect(v.shopTagline).toBe('Three kinds, baked on Thursdays.');
    expect(text(v.deniedTitle)).toBe('Only Marisol can open this');
    expect(v.rules.map((r) => text(r.label))).toContain('Sign Marisol out after');
    expect(ORDER_COPY.lookupMiss).toBe(
      'Nothing matches that. Check the number. Text 0900 000 0137.'
    );
    // A later failed read puts the neutral wording back rather than keeping a stale name.
    await act(
      async () => void (await runtime.loadShopIdentity(identityClient({ error: { code: 'X' } })))
    );
    expect(runtime.renderVals().shopTagline).toBe('');
    expect(runtime.renderVals().rules.map((r) => text(r.label))).toContain(
      'Sign the owner out after'
    );
  });
});

describe('Home and Settings show records, not the prototype (audit H1 to H3, C1)', () => {
  it('has no fixed pickups count, no August, no proof rule, no form bridge, no fake accounts', () => {
    const runtime = mount('owner');
    const v = runtime.renderVals();
    const pickups = v.statusStrip.find((cell) => cell.label === 'Pickups');
    expect(text(pickups?.value)).toBe('—'); // orders not read yet: unknown, never "11"
    const shown = JSON.stringify([
      v.launcher.flatMap((g) => g.items.map((i) => [i.label, i.sub])),
      v.settingsGroups.flatMap((g) => g.rows.map((r) => [r.label, r.value]))
    ]);
    for (const fake of ['August', '8 saved', 'Proof required', 'Courier pickup', '2 temporary'])
      expect(shown).not.toContain(fake);
    expect(shown).not.toContain('Google Form bridge');
    expect(shown).toContain('Last 30 days');
    expect(v.payChannels).toEqual([]);
    expect(v.users).toEqual([]);
  });

  it('"Profit this month" is the shop’s calendar month to date', () => {
    const runtime = mount('owner');
    const sale = (id: string, iso: string, amount: number) => ({
      id,
      kind: 'revenue',
      at: Date.parse(iso),
      cat: 'Bazaar',
      label: 'Stall',
      amount
    });
    act(() =>
      runtime.setState({
        now: Date.parse('2026-10-31T10:00:00Z'), // 18:00 on the 31st in Manila
        ledger: [
          sale('a', '2026-09-30T15:00:00Z', 900), // 23:00 on 30 September: last month
          sale('b', '2026-09-30T17:00:00Z', 500), // 01:00 on 1 October: this month
          sale('c', '2026-10-20T03:00:00Z', 137)
        ]
      } as never)
    );
    expect(text(runtime.renderVals().money?.revenueText)).toBe('₱637');
    // Mutation: the engine's rolling 30 days starts at 18:00 on the 1st and drops the ₱500 sale.
    // Mutation: the device's midnight (Los Angeles here) would count the ₱900 sale as October.
  });

  it('marks a setting she has never saved as a default, and no other', () => {
    const runtime = mount('owner');
    (runtime as unknown as { settingsSync: unknown }).settingsSync = {
      dispose: () => undefined,
      isDefault: (key: string) => key === 'taxRate'
    };
    const rules = runtime.renderVals().rules as Array<{ k?: string; note: unknown }>;
    expect(text(rules.find((r) => r.k === 'taxRate')?.note)).toMatch(
      /^Default, not confirmed yet\. /
    );
    expect(text(rules.find((r) => r.k === 'drawerFloat')?.note)).not.toContain('Default');
  });
});
