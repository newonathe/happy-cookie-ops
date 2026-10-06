import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import clockCases from '../fixtures/clock-cases.json';
import {
  BUSINESS_TIME_ZONE,
  formatManila,
  manilaHour,
  manilaMidnight,
  manilaMinutes,
  manilaStamp,
  manilaToday,
  monthStart,
  weekStart
} from '@/lib/time/business-clock';
import { manilaToday as pickupToday, manilaMinutes as pickupMinutes } from '@/lib/orders/pickup';
import { manilaToday as staffToday, weekKey } from '@/lib/data/staff-orders';

/**
 * One Manila clock (final-plan.md C10, C2). The device is deliberately put in another zone:
 * on a machine that keeps Manila time, a bug that reads the device clock passes unseen.
 * 2026-10-06T16:30Z is 00:30 on 7 October in Manila and 09:30 on 6 October in Los Angeles.
 */
const JUST_AFTER_MIDNIGHT = Date.parse('2026-10-06T16:30:00Z');
const savedZone = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'America/Los_Angeles';
});
afterAll(() => {
  if (savedZone === undefined) delete process.env.TZ;
  else process.env.TZ = savedZone;
});

describe('the business clock', () => {
  it('runs on a device that is somewhere else', () => {
    const device = new Date(JUST_AFTER_MIDNIGHT);
    expect([device.getDate(), device.getHours()]).toEqual([6, 9]);
  });

  it('gives the shop its own day, hour and minute', () => {
    expect(manilaToday(JUST_AFTER_MIDNIGHT)).toBe('2026-10-07');
    expect(manilaToday(new Date(JUST_AFTER_MIDNIGHT))).toBe('2026-10-07');
    expect(manilaHour(JUST_AFTER_MIDNIGHT)).toBe(0);
    expect(manilaMinutes(JUST_AFTER_MIDNIGHT)).toBe(30);
    expect(manilaStamp(JUST_AFTER_MIDNIGHT)).toBe('2026-10-07 00:30');
    // Midnight itself is hour 0, never 24.
    expect(manilaStamp(Date.parse('2026-10-06T16:00:00Z'))).toBe('2026-10-07 00:00');
  });

  it.each(clockCases.cases)('agrees with the shared cases at $at', (c) => {
    const today = manilaToday(Date.parse(c.at));
    expect(today).toBe(c.today);
    expect(weekStart(today)).toBe(c.weekStart);
    expect(monthStart(today)).toBe(c.monthStart);
  });

  it('knows the instant a day begins', () => {
    expect(new Date(manilaMidnight('2026-10-07')).toISOString()).toBe('2026-10-06T16:00:00.000Z');
    expect(manilaToday(manilaMidnight('2026-10-01'))).toBe('2026-10-01');
    expect(manilaToday(manilaMidnight('2026-10-01') - 1)).toBe('2026-09-30');
  });

  it('words an instant in the shop zone', () => {
    expect(
      formatManila(JUST_AFTER_MIDNIGHT, { weekday: 'long', day: 'numeric', month: 'short' })
    ).toBe('Wednesday, Oct 7');
  });

  it('is the only definition: the older names are this module', () => {
    expect(pickupToday).toBe(manilaToday);
    expect(pickupMinutes).toBe(manilaMinutes);
    expect(staffToday).toBe(manilaToday);
    expect(weekKey).toBe(weekStart);
  });
});

describe('nothing else in src names the zone or adds a fixed offset', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx|js)$/.test(name) ? [path] : [];
    });
  const OWN = join('src', 'lib', 'time', 'business-clock.ts');
  const FIXED_OFFSET = /\b8\s*\*\s*(3_600_000|3600000|60\s*\*\s*60)/;

  it('holds', () => {
    const offenders = files('src')
      .filter((path) => path !== OWN)
      .filter((path) => {
        const text = readFileSync(path, 'utf8');
        return text.includes(BUSINESS_TIME_ZONE) || FIXED_OFFSET.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
