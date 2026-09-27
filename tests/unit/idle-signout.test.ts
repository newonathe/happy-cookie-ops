import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MINUTES, idleMinutesFor, startIdleSignOut } from '@/lib/auth/idle-signout';

describe('IDLE_MINUTES', () => {
  it('signs owner and support out after 60 idle minutes and helper after 240 (DP-15)', () => {
    expect(IDLE_MINUTES).toEqual({ owner: 60, support: 60, helper: 240 });
  });
});

describe('startIdleSignOut', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires once after the role minutes of no activity', () => {
    const onIdle = vi.fn();
    startIdleSignOut('owner', onIdle);

    vi.advanceTimersByTime(IDLE_MINUTES.owner * 60_000 - 1);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('resets the clock on activity', () => {
    const onIdle = vi.fn();
    startIdleSignOut('helper', onIdle);

    vi.advanceTimersByTime(IDLE_MINUTES.helper * 60_000 - 1000);
    window.dispatchEvent(new Event('pointerdown'));
    vi.advanceTimersByTime(1000);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(IDLE_MINUTES.helper * 60_000);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('keeps a helper signed in for four idle hours, then signs out', () => {
    const onIdle = vi.fn();
    startIdleSignOut('helper', onIdle);

    vi.advanceTimersByTime(240 * 60_000 - 1);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it('stop() cancels the timer and removes the listeners', () => {
    const onIdle = vi.fn();
    const stop = startIdleSignOut('support', onIdle);
    stop();

    vi.advanceTimersByTime(IDLE_MINUTES.support * 60_000 + 1);
    expect(onIdle).not.toHaveBeenCalled();
  });
});

describe('idleMinutesFor (MP-09 b2)', () => {
  it('uses the database value for the role when present', () => {
    const cfg = { idleMinutesOwner: 90, idleMinutesSupport: 45, idleMinutesHelper: 300 };
    expect(idleMinutesFor('owner', cfg)).toBe(90);
    expect(idleMinutesFor('support', cfg)).toBe(45);
    expect(idleMinutesFor('helper', cfg)).toBe(300);
  });

  it('falls back to IDLE_MINUTES when the value is absent (not saved yet, or offline)', () => {
    expect(idleMinutesFor('owner', undefined)).toBe(IDLE_MINUTES.owner);
    expect(idleMinutesFor('helper', {})).toBe(IDLE_MINUTES.helper);
    expect(idleMinutesFor('support', { idleMinutesSupport: null })).toBe(IDLE_MINUTES.support);
    expect(idleMinutesFor('support', { idleMinutesSupport: '90' })).toBe(IDLE_MINUTES.support);
  });

  it('clamps to 15–480 whatever the source says', () => {
    expect(idleMinutesFor('owner', { idleMinutesOwner: 1 })).toBe(15);
    expect(idleMinutesFor('helper', { idleMinutesHelper: 10_000 })).toBe(480);
    expect(idleMinutesFor('owner', { idleMinutesOwner: Number.NaN })).toBe(IDLE_MINUTES.owner);
  });
});

describe('startIdleSignOut with the database minutes', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
  });

  it('signs out after the minutes the getter returns, re-read on each activity', () => {
    const onIdle = vi.fn();
    let minutes = 30;
    startIdleSignOut('owner', onIdle, () => minutes);

    vi.advanceTimersByTime(29 * 60_000);
    minutes = 90;
    window.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(89 * 60_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(onIdle).toHaveBeenCalledOnce();
  });
});
