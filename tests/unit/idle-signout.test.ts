import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MINUTES, startIdleSignOut } from '@/lib/auth/idle-signout';

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
