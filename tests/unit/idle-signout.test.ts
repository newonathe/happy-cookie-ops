import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MINUTES, startIdleSignOut } from '@/lib/auth/idle-signout';

describe('IDLE_MINUTES', () => {
  it('gives owner and support the shorter timeout, helper the longer one — pending DP-15', () => {
    expect(IDLE_MINUTES.owner).toBe(IDLE_MINUTES.support);
    expect(IDLE_MINUTES.helper).toBeGreaterThan(IDLE_MINUTES.owner);
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

  it('stop() cancels the timer and removes the listeners', () => {
    const onIdle = vi.fn();
    const stop = startIdleSignOut('support', onIdle);
    stop();

    vi.advanceTimersByTime(IDLE_MINUTES.support * 60_000 + 1);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
