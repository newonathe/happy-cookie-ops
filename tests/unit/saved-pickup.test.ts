import { afterEach, describe, expect, it } from 'vitest';
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
