import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSavedPickupDate, isSavedPickupWindow, savedPickupText } from '@/lib/orders/saved-pickup';
import { pickupLabel } from '@/lib/orders/status-view';
import { STAFF_COPY } from '@/lib/orders/staff-copy';

/**
 * The owner's pickup label for a saved order (audit visual-capture-2026-11, finding 1). The stored
 * `pickup_date` is a Manila calendar date and `pickup_window` Manila wall-clock time: neither may
 * be moved by the device's zone, and nothing missing may be replaced by a default day.
 */
const savedZone = process.env.TZ;
afterEach(() => {
  if (savedZone === undefined) delete process.env.TZ;
  else process.env.TZ = savedZone;
});

describe('savedPickupText', () => {
  it('words the saved date and time exactly as the customer status page does', () => {
    expect(savedPickupText('2026-11-11', '10:00')).toBe('Wed, Nov 11 · 10:00 AM');
    expect(savedPickupText('2026-11-11', '10:00', 'long')).toBe('Wed, Nov 11 · 10:00 AM');
    expect(savedPickupText('2026-11-11', '10:00')).toBe(pickupLabel('2026-11-11', '10:00'));
    expect(savedPickupText('2026-11-14', '14:30')).toBe('Sat, Nov 14 · 2:30 PM');
    expect(savedPickupText('2026-11-11', 'campus')).toBe('Wed, Nov 11 · Campus pickup');
  });

  it('keeps the edges of the day and the year on their own date', () => {
    expect(savedPickupText('2026-11-11', '00:00')).toBe('Wed, Nov 11 · 12:00 AM');
    expect(savedPickupText('2026-11-11', '23:59')).toBe('Wed, Nov 11 · 11:59 PM');
    expect(savedPickupText('2026-12-31', '23:30')).toBe('Thu, Dec 31 · 11:30 PM');
    expect(savedPickupText('2027-01-01', '00:30')).toBe('Fri, Jan 1 · 12:30 AM');
    expect(savedPickupText('2028-02-29', '12:00')).toBe('Tue, Feb 29 · 12:00 PM');
  });

  it.each(['Asia/Manila', 'UTC', 'America/Los_Angeles', 'Pacific/Pago_Pago', 'Pacific/Kiritimati'])(
    'is the same text when the device is set to %s',
    (zone) => {
      process.env.TZ = zone;
      expect(savedPickupText('2026-11-11', '10:00')).toBe('Wed, Nov 11 · 10:00 AM');
      expect(savedPickupText('2026-11-11', '00:00')).toBe('Wed, Nov 11 · 12:00 AM');
      expect(savedPickupText('2026-11-14', '23:30')).toBe('Sat, Nov 14 · 11:30 PM');
      expect(savedPickupText('2026-11-11', 'campus', 'long')).toBe('Wed, Nov 11 · Campus pickup');
    }
  );

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['not a calendar day', '2026-02-30'],
    ['month 13', '2026-13-01'],
    ['unpadded', '2026-11-1'],
    ['a timestamp, not a date', '2026-11-11T02:00:00Z'],
    ['a number', 20261111]
  ])('a %s date is shown as not saved, never as a default day', (_label, date) => {
    expect(savedPickupText(date, '10:00')).toBe(STAFF_COPY.pickupMissing);
    expect(savedPickupText(date, '10:00', 'long')).toBe(STAFF_COPY.pickupMissingLong);
    expect(savedPickupText(date, null, 'long')).toMatch(
      /^Pickup date not saved\. Ask the customer/
    );
  });

  it.each([null, undefined, '', '25:99', '9:00', '10:00 AM', 'Campus'])(
    'a valid date with time %j keeps the date and says the time was not saved',
    (window) => {
      expect(savedPickupText('2026-11-11', window)).toBe('Wed, Nov 11 · time not saved');
      expect(savedPickupText('2026-11-11', window, 'long')).toBe('Wed, Nov 11 · time not saved');
    }
  );

  it('accepts only real dates and the values the column constraint allows', () => {
    expect(isSavedPickupDate('2026-11-11')).toBe(true);
    expect(isSavedPickupDate('2027-02-29')).toBe(false);
    expect(isSavedPickupWindow('campus')).toBe(true);
    expect(isSavedPickupWindow('23:59')).toBe(true);
    expect(isSavedPickupWindow('24:00')).toBe(false);
  });
});

/**
 * The label cache (PR #51, commit 2). Each test imports a fresh copy of the module, so the cache
 * starts empty. "Formatting" is counted through `Date.prototype.toLocaleDateString`, the call
 * `pickupLabel` makes once per label it builds.
 */
describe('savedPickupText label cache', () => {
  type Text = typeof savedPickupText;
  const fresh = async (): Promise<Text> => {
    vi.resetModules();
    return (await import('@/lib/orders/saved-pickup')).savedPickupText;
  };
  const formatting = () => vi.spyOn(Date.prototype, 'toLocaleDateString');
  /** The label exactly as the uncached rules build it, straight from `pickupLabel` and the copy. */
  const uncached = (date: unknown, window: unknown, form: 'short' | 'long'): string => {
    if (!isSavedPickupDate(date))
      return form === 'long' ? STAFF_COPY.pickupMissingLong : STAFF_COPY.pickupMissing;
    return isSavedPickupWindow(window)
      ? pickupLabel(date, window)
      : pickupLabel(date, null) + ' · ' + STAFF_COPY.pickupNoTime;
  };
  const CASES: Array<[unknown, unknown]> = [
    ['2026-11-11', '10:00'],
    ['2026-11-11', '10:30'],
    ['2026-11-12', '10:00'],
    ['2026-11-11', 'campus'],
    ['2026-11-11', '00:00'],
    ['2026-11-11', '23:59'],
    ['2026-12-31', '23:30'],
    ['2028-02-29', '12:00'],
    ['2026-11-11', null],
    ['2026-11-11', undefined],
    ['2026-11-11', ''],
    ['2026-11-11', '25:99'],
    ['2026-11-11', ' 10:00'],
    [null, '10:00'],
    ['2026-02-30', '10:00'],
    ['2026-11-11T02:00:00Z', '10:00'],
    [20261111, '10:00']
  ];
  afterEach(() => vi.restoreAllMocks());

  it('returns exactly the uncached text, on the first call and on every repeat, in both forms', async () => {
    const text = await fresh();
    for (const form of ['short', 'long'] as const)
      for (const [date, window] of CASES) {
        const expected = uncached(date, window, form);
        expect(text(date, window, form)).toBe(expected);
        expect(text(date, window, form)).toBe(expected);
      }
  });

  it('formats a repeated date and time once', async () => {
    const text = await fresh();
    const spy = formatting();
    for (let i = 0; i < 500; i++) text('2031-03-03', '10:00', i % 2 ? 'long' : 'short');
    expect(spy).toHaveBeenCalledTimes(1);
    text('2031-03-03', '25:99');
    text('2031-03-03', null);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('keeps distinct dates, times and forms distinct', async () => {
    const text = await fresh();
    const labels = [
      text('2026-11-11', '10:00'),
      text('2026-11-11', '10:30'),
      text('2026-11-12', '10:00'),
      text('2026-11-11', 'campus'),
      text('2026-11-11', null)
    ];
    expect(new Set(labels).size).toBe(labels.length);
    expect(text(null, null, 'short')).not.toBe(text(null, null, 'long'));
    // With a saved date the two forms read the same by design: the long form only adds a recovery sentence when the date is missing.
    expect(text('2026-11-11', '10:00', 'long')).toBe(text('2026-11-11', '10:00', 'short'));
  });

  it('never gives an invalid value the label of a valid one', async () => {
    const text = await fresh();
    expect(text('2026-11-11', '10:00')).toBe('Wed, Nov 11 · 10:00 AM');
    expect(text('2026-02-30', '10:00')).toBe(STAFF_COPY.pickupMissing);
    expect(text('2026-11-11T02:00:00Z', '10:00')).toBe(STAFF_COPY.pickupMissing);
    expect(text('2026-11-11', '25:99')).toBe('Wed, Nov 11 · time not saved');
    expect(text('2026-11-11', ' 10:00')).toBe('Wed, Nov 11 · time not saved');
    expect(text('2026-11-11', 'campus|x')).toBe('Wed, Nov 11 · time not saved');
    expect(text('2026-11-11', '10:00')).toBe('Wed, Nov 11 · 10:00 AM');
  });

  it('introduces no time-zone shift: labels cached in Manila stay right elsewhere and match a fresh start there', async () => {
    process.env.TZ = 'Asia/Manila';
    const text = await fresh();
    const manila = CASES.map(([d, w]) => text(d, w));
    const spy = formatting();
    // 11 Nov 2026 02:00 UTC, as a local [day, hour]: proof each switch really happened.
    const LOCAL: Record<string, [number, number]> = {
      'America/Los_Angeles': [10, 18],
      'Pacific/Kiritimati': [11, 16],
      'Pacific/Pago_Pago': [10, 15]
    };
    for (const [zone, local] of Object.entries(LOCAL)) {
      process.env.TZ = zone;
      const instant = new Date(Date.UTC(2026, 10, 11, 2));
      expect([instant.getDate(), instant.getHours()]).toEqual(local);
      expect(CASES.map(([d, w]) => text(d, w))).toEqual(manila);
    }
    expect(spy).not.toHaveBeenCalled();
    process.env.TZ = 'America/Los_Angeles';
    expect(new Date(Date.UTC(2026, 10, 11, 2)).getDate()).toBe(10);
    const elsewhere = await fresh();
    expect(CASES.map(([d, w]) => elsewhere(d, w))).toEqual(manila);
  });

  it('follows the saved values after a reload: a changed date or time gets its own label', async () => {
    const text = await fresh();
    expect(text('2026-11-11', '10:00')).toBe('Wed, Nov 11 · 10:00 AM');
    expect(text('2026-11-18', '11:00')).toBe('Wed, Nov 18 · 11:00 AM');
    expect(text('2026-11-18', null)).toBe('Wed, Nov 18 · time not saved');
    expect(text(null, null, 'long')).toBe(STAFF_COPY.pickupMissingLong);
  });

  it('stays bounded: past 512 labels the oldest is built again, the newest is not', async () => {
    const text = await fresh();
    const day = (i: number) => new Date(Date.UTC(2030, 0, 1 + i)).toISOString().slice(0, 10);
    const spy = formatting();
    for (let i = 0; i < 600; i++) text(day(i), '10:00');
    expect(spy).toHaveBeenCalledTimes(600);
    text(day(599), '10:00');
    expect(spy).toHaveBeenCalledTimes(600);
    const oldest = text(day(0), '10:00');
    expect(spy).toHaveBeenCalledTimes(601);
    expect(oldest).toBe(uncached(day(0), '10:00', 'short'));
  });
});
