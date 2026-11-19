import { describe, expect, it } from 'vitest';
import { dayLabel, dayTimeLabel, timeLabel } from '@/lib/date/display';

// 2026-11-19 02:15 UTC is 10:15 AM on the shop's clock (Manila, UTC+8).
const AT = Date.UTC(2026, 10, 19, 2, 15);
// 2026-11-19 17:30 UTC is already 1:30 AM on 20 Nov in Manila.
const LATE = Date.UTC(2026, 10, 19, 17, 30);
const NOW = new Date(Date.UTC(2026, 10, 19, 2, 15));

describe('shared date display (HCB-018)', () => {
  it('writes a day as "Thu, 19 Nov"', () => {
    expect(dayLabel(AT, NOW)).toBe('Thu, 19 Nov');
  });

  it('adds the year only when it is not the current year', () => {
    expect(dayLabel(Date.UTC(2027, 0, 5, 4), NOW)).toBe('Tue, 5 Jan 2027');
  });

  it('writes a day and time as "Thu, 19 Nov · 10:15 AM"', () => {
    expect(dayTimeLabel(AT, NOW)).toBe('Thu, 19 Nov · 10:15 AM');
  });

  it('writes a time alone as "10:15 AM" with a plain space', () => {
    expect(timeLabel(AT)).toBe('10:15 AM');
    expect(timeLabel(AT)).not.toMatch(/[  ]/);
  });

  it('reads the shop clock, so a late-UTC instant is the next Manila day', () => {
    expect(dayLabel(LATE, NOW)).toBe('Fri, 20 Nov');
    expect(timeLabel(LATE)).toBe('1:30 AM');
  });

  it('reads a date-only YYYY-MM-DD as that calendar day', () => {
    expect(dayLabel('2026-10-24', NOW)).toBe('Sat, 24 Oct');
  });

  it('accepts Date objects and ISO strings', () => {
    expect(dayTimeLabel(new Date(AT), NOW)).toBe('Thu, 19 Nov · 10:15 AM');
    expect(dayTimeLabel('2026-11-19T02:15:00Z', NOW)).toBe('Thu, 19 Nov · 10:15 AM');
  });

  it('never prints "Invalid Date" for malformed input', () => {
    for (const bad of [Number.NaN, 'nope', '', null, undefined, new Date('x'), '2026-02-30']) {
      for (const fn of [dayLabel, dayTimeLabel, timeLabel]) {
        const text = fn(bad as never);
        expect(text).toBe('');
        expect(text).not.toMatch(/Invalid|NaN|undefined/);
      }
    }
  });

  it('gives the same text whatever zone the device is set to', () => {
    const original = process.env.TZ;
    const outputs: string[] = [];
    try {
      for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        outputs.push(dayTimeLabel(LATE, NOW));
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
    expect(new Set(outputs).size).toBe(1);
    expect(outputs[0]).toBe('Fri, 20 Nov · 1:30 AM');
  });
});
