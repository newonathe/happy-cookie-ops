import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flavoursRead } from '@/lib/data/flavours-read-state';

/** HCB-004 a3: a reader that is due but not bound yet reads as loading, never as idle. */
describe('flavoursRead.expect / unexpect', () => {
  beforeEach(() => flavoursRead.reset());
  afterEach(() => flavoursRead.reset());

  it('expect() with no reader publishes loading with nothing to retry, and notifies once', () => {
    const listener = vi.fn();
    const stop = flavoursRead.subscribe(listener);
    flavoursRead.expect();
    expect(flavoursRead.get()).toMatchObject({
      phase: 'loading',
      everRead: false,
      empty: false,
      readAt: null,
      retry: null
    });
    flavoursRead.expect();
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  it('unexpect() with no reader goes back to idle', () => {
    flavoursRead.expect();
    flavoursRead.unexpect();
    expect(flavoursRead.get().phase).toBe('idle');
  });

  it('claim() resets the expectation, and an owned store ignores expect() and unexpect()', () => {
    const reader = {};
    flavoursRead.expect();
    flavoursRead.claim(reader);
    expect(flavoursRead.get().phase).toBe('idle');
    flavoursRead.expect();
    expect(flavoursRead.get().phase).toBe('idle');
    const retry = () => undefined;
    flavoursRead.publish(reader, {
      phase: 'loading',
      everRead: false,
      empty: false,
      readAt: 1,
      retry
    });
    flavoursRead.unexpect();
    expect(flavoursRead.get().phase).toBe('loading');
    expect(flavoursRead.get().retry).toBe(retry);
  });

  it('after a reader is released, expect() publishes loading again and unexpect() clears it', () => {
    const reader = {};
    flavoursRead.claim(reader);
    flavoursRead.publish(reader, {
      phase: 'read',
      everRead: true,
      empty: false,
      readAt: 5,
      retry: null
    });
    flavoursRead.release(reader);
    flavoursRead.expect();
    expect(flavoursRead.get().phase).toBe('loading');
    flavoursRead.unexpect();
    expect(flavoursRead.get().phase).toBe('idle');
  });
});
