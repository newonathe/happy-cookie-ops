// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUEUE_RETRY_MS, startQueueRetry } from '@/lib/offline/retry';
import { saleProblemWords } from '@/lib/offline/sale-problem';

describe('trying again while a sale waits', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const tick = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  it('sends on the timer while something is waiting', async () => {
    const flush = vi.fn();
    stop = startQueueRetry({ hasRetryable: async () => true, flush });
    await tick(QUEUE_RETRY_MS - 1);
    expect(flush).not.toHaveBeenCalled();
    await tick(1);
    expect(flush).toHaveBeenCalledTimes(1);
    await tick(QUEUE_RETRY_MS);
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when only refused sales, or nothing at all, are left', async () => {
    const flush = vi.fn();
    stop = startQueueRetry({ hasRetryable: async () => false, flush });
    await tick(QUEUE_RETRY_MS * 3);
    expect(flush).not.toHaveBeenCalled();
  });

  it('waits while offline or hidden', async () => {
    const flush = vi.fn();
    const hasRetryable = vi.fn(async () => true);
    stop = startQueueRetry({ hasRetryable, flush });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await tick(QUEUE_RETRY_MS);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await tick(QUEUE_RETRY_MS);
    expect(hasRetryable).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });

  it('tries at once when the app comes back to the front', async () => {
    const flush = vi.fn();
    stop = startQueueRetry({ hasRetryable: async () => true, flush });
    document.dispatchEvent(new Event('visibilitychange'));
    await tick(0);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('survives a failed read or send, and stops when asked', async () => {
    const flush = vi.fn(async () => {
      throw new Error('boom');
    });
    stop = startQueueRetry({ hasRetryable: async () => true, flush });
    await tick(QUEUE_RETRY_MS);
    expect(flush).toHaveBeenCalledTimes(1);
    stop();
    await tick(QUEUE_RETRY_MS * 2);
    document.dispatchEvent(new Event('visibilitychange'));
    await tick(0);
    expect(flush).toHaveBeenCalledTimes(1);
  });
});

describe('why a sale has not sent', () => {
  it('has nothing to say when there was no error', () => {
    expect(saleProblemWords({ lastError: null })).toBeNull();
    expect(saleProblemWords({ lastError: '  ' })).toBeNull();
  });

  it("puts each of the server's known refusals in plain words", () => {
    const cases: Array<[string, RegExp]> = [
      ['no server event: start the event while online', /never opened on the server/],
      ['42501 this phone is not the selling device for the event', /Another device/],
      ['55000 event closed before this sale', /closed before/],
      ['P0002 event not found', /no record of this event/],
      ['22023 sale total does not match the event prices', /does not match/],
      ['22023 flavour dcf is not in the event price snapshot', /price list/],
      ['22023 sale time is before the event started', /before the event started/],
      ['42501 only the owner may record a bazaar sale', /owner's sign-in/],
      ['PGRST301 JWT expired', /Sign in again/]
    ];
    for (const [error, words] of cases) {
      const text = saleProblemWords({ lastError: error, refused: true });
      expect(text).toMatch(words);
      expect(text).toContain('still saved on this device');
    }
  });

  it('says a lost connection will sort itself out', () => {
    expect(saleProblemWords({ lastError: 'TypeError: Failed to fetch' })).toMatch(/keep trying/);
    expect(saleProblemWords({ lastError: 'not acknowledged' })).toMatch(/keep trying/);
  });

  it('shows an unknown error as it came, so the real reason is on the screen', () => {
    expect(saleProblemWords({ lastError: '42883 function missing', refused: true })).toContain(
      '42883 function missing'
    );
    expect(saleProblemWords({ lastError: '500 odd' })).toContain('500 odd');
  });
});
