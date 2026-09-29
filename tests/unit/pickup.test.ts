import { describe, expect, it } from 'vitest';
import {
  clockLabel,
  manilaToday,
  parseShopOrderRules,
  pickupDates,
  pickupTimes,
  waitlistRange,
  type ShopOrderRules
} from '@/lib/orders/pickup';

/** The database's own default rules (Cine's C1 to C3 answers), as get_shop_order_rules() returns them. */
const RAW = {
  pickup_days: [1, 4],
  lead_min_days: 1,
  lead_max_days: 14,
  pickup_from_hour: 9,
  pickup_cutoff_hour: 17,
  campus_from: '14:00',
  campus_to: '15:30',
  unpaid_hold_hours: 24
};
const rules = (over: Partial<ShopOrderRules> = {}): ShopOrderRules => ({
  ...(parseShopOrderRules(RAW) as ShopOrderRules),
  ...over
});

// 01:00 on Monday 5 Oct 2026 in Manila is still Sunday 4 Oct in UTC.
const MANILA_MONDAY_1AM = new Date('2026-10-04T17:00:00Z');

describe('the business clock', () => {
  it('reads today in Asia/Manila, not on the device clock', () => {
    expect(manilaToday(MANILA_MONDAY_1AM)).toBe('2026-10-05');
    expect(MANILA_MONDAY_1AM.toISOString().slice(0, 10)).toBe('2026-10-04');
  });

  it('counts lead days from the Manila date: the first offered date is Thursday 8 Oct', () => {
    // From the UTC date (Sunday 4 Oct) the first Monday, 5 Oct, would wrongly be offered.
    expect(pickupDates(rules(), MANILA_MONDAY_1AM)[0]?.value).toBe('2026-10-08');
  });
});

describe('pickup dates', () => {
  it('offers only the owner’s pickup days within the lead window', () => {
    const dates = pickupDates(rules(), MANILA_MONDAY_1AM).map((d) => d.value);
    expect(dates).toEqual(['2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19']);
  });

  it('includes both ends of the lead window', () => {
    expect(
      pickupDates(rules({ pickupDays: [4], leadMinDays: 3, leadMaxDays: 3 }), MANILA_MONDAY_1AM)
    ).toHaveLength(1);
    expect(
      pickupDates(rules({ pickupDays: [4], leadMinDays: 1, leadMaxDays: 2 }), MANILA_MONDAY_1AM)
    ).toHaveLength(0);
    expect(
      pickupDates(rules({ pickupDays: [4], leadMinDays: 4, leadMaxDays: 10 }), MANILA_MONDAY_1AM)[0]
        ?.value
    ).toBe('2026-10-15');
  });

  it('follows any weekday the owner picks, including Sunday as 7', () => {
    const dates = pickupDates(
      rules({ pickupDays: [7], leadMinDays: 1, leadMaxDays: 7 }),
      MANILA_MONDAY_1AM
    );
    expect(dates.map((d) => d.value)).toEqual(['2026-10-11']);
    expect(dates[0]?.label).toBe('Sun, Oct 11');
  });
});

describe('pickup times', () => {
  it('runs in half hours from the start hour and stops before the cutoff hour', () => {
    const times = pickupTimes(rules());
    expect(times[0]).toEqual({ value: '09:00', label: '9:00 AM' });
    expect(times.filter((t) => t.value !== 'campus').at(-1)).toEqual({
      value: '16:30',
      label: '4:30 PM'
    });
    expect(times.some((t) => t.value === '17:00')).toBe(false);
  });

  it('ends with the campus slot, worded from the owner’s campus times', () => {
    expect(pickupTimes(rules()).at(-1)).toEqual({
      value: 'campus',
      label: 'Campus · 2:00 PM – 3:30 PM'
    });
  });

  it('words noon and midnight correctly', () => {
    expect(clockLabel('12:00')).toBe('12:00 PM');
    expect(clockLabel('00:30')).toBe('12:30 AM');
  });
});

describe('parseShopOrderRules', () => {
  it('reads the RPC answer', () => {
    expect(parseShopOrderRules(RAW)).toMatchObject({
      pickupDays: [1, 4],
      leadMinDays: 1,
      unpaidHoldHours: 24
    });
  });

  it('returns null for anything malformed, so no dates are offered', () => {
    expect(parseShopOrderRules(null)).toBeNull();
    expect(parseShopOrderRules([])).toBeNull();
    expect(parseShopOrderRules({ ...RAW, pickup_days: [] })).toBeNull();
    expect(parseShopOrderRules({ ...RAW, pickup_days: [8] })).toBeNull();
    expect(parseShopOrderRules({ ...RAW, lead_min_days: 15, lead_max_days: 14 })).toBeNull();
    expect(parseShopOrderRules({ ...RAW, pickup_from_hour: 17 })).toBeNull();
    expect(parseShopOrderRules({ ...RAW, campus_to: '13:00' })).toBeNull();
    expect(parseShopOrderRules({ ...RAW, campus_from: '2pm' })).toBeNull();
    expect(parseShopOrderRules({ ...RAW, unpaid_hold_hours: '24' })).toBeNull();
  });
});

describe('waitlist range', () => {
  it('runs from today to 90 days out on the Manila date', () => {
    expect(waitlistRange(MANILA_MONDAY_1AM)).toEqual({ min: '2026-10-05', max: '2027-01-03' });
  });
});
