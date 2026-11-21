import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canWatchDay, watchDay, type LiveDayClient } from '@/lib/bazaar/live-day';

/**
 * S4 (20 November 2026): the open day's changes reach every device. This module only listens and asks for the day to be read again;
 * it never carries a sale, so what a change says is never trusted. Each `Mutation:` line names a change a test must catch.
 */
const DAY = 'd5a00000-0000-4000-8000-000000000001';
const EVENT = 'e5a00000-0000-4000-8000-000000000001';

type Handler = () => void;
interface FakeChannel {
  name: string;
  filters: Array<{ table: string; filter: string; event: string; schema: string }>;
  handlers: Handler[];
  status?: (status: string) => void;
  removed: boolean;
  on: (type: string, filter: Record<string, string>, cb: Handler) => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
}
function fake() {
  const channels: FakeChannel[] = [];
  const client = {
    channel(name: string) {
      const ch: FakeChannel = {
        name,
        filters: [],
        handlers: [],
        removed: false,
        on(_type, filter, cb) {
          ch.filters.push(filter as never);
          ch.handlers.push(cb);
          return ch;
        },
        subscribe(cb) {
          ch.status = cb;
          return ch;
        }
      };
      channels.push(ch);
      return ch;
    },
    removeChannel: vi.fn((ch: FakeChannel) => void (ch.removed = true))
  };
  return { client: client as unknown as LiveDayClient, raw: client, channels };
}
const change = (ch: FakeChannel, i = 0) => ch.handlers[i]!();

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('what is listened to', () => {
  it('opens one channel for the day, filtered to its event and its day, on the four kinds of change', () => {
    const { client, channels } = fake();
    watchDay({ client, eventId: EVENT, dayId: DAY, onChange: vi.fn() });
    expect(channels).toHaveLength(1);
    // Mutation: an unfiltered subscription would hear (and re-read for) every day.
    expect(channels[0]!.filters).toEqual([
      { event: '*', schema: 'public', table: 'event_sales', filter: `event_id=eq.${EVENT}` },
      { event: '*', schema: 'public', table: 'bazaar_stock_adds', filter: `day_id=eq.${DAY}` },
      { event: '*', schema: 'public', table: 'bazaar_losses', filter: `day_id=eq.${DAY}` }
    ]);
  });

  it('knows a client that cannot subscribe (a test double, a build with no backend)', () => {
    expect(canWatchDay(null)).toBe(false);
    expect(canWatchDay({ rpc: vi.fn() })).toBe(false);
    expect(canWatchDay(fake().client)).toBe(true);
    const onChange = vi.fn();
    expect(watchDay({ client: null, eventId: EVENT, dayId: DAY, onChange }).active).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('asking for the day to be read again', () => {
  it('reads once when the channel is joined, so a change between the first read and the join is not missed', () => {
    const { client, channels } = fake();
    const onChange = vi.fn();
    watchDay({ client, eventId: EVENT, dayId: DAY, onChange });
    expect(onChange).not.toHaveBeenCalled();
    channels[0]!.status!('SUBSCRIBED');
    vi.advanceTimersByTime(10);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('waits for a burst to settle, then reads once', () => {
    const { client, channels } = fake();
    const onChange = vi.fn();
    watchDay({ client, eventId: EVENT, dayId: DAY, onChange, debounceMs: 300 });
    change(channels[0]!, 0);
    vi.advanceTimersByTime(200);
    change(channels[0]!, 1);
    change(channels[0]!, 2);
    vi.advanceTimersByTime(299);
    // Mutation: reading on every event would already have called it three times.
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('reads while sales keep arriving: a steady stream cannot starve the till', () => {
    const { client, channels } = fake();
    const onChange = vi.fn();
    watchDay({ client, eventId: EVENT, dayId: DAY, onChange, debounceMs: 300, maxWaitMs: 1500 });
    for (let t = 0; t < 4000; t += 200) {
      change(channels[0]!);
      vi.advanceTimersByTime(200);
    }
    // Mutation: a pure trailing debounce never fires here.
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('losing and finding the connection again', () => {
  it('checks the foreground day and replaces a silent channel without a browser event', () => {
    const { client, channels } = fake();
    const onChange = vi.fn();
    const stop = watchDay({ client, eventId: EVENT, dayId: DAY, onChange, doc: null, win: null });
    channels[0]!.status!('SUBSCRIBED');
    vi.advanceTimersByTime(1);
    onChange.mockClear();

    vi.advanceTimersByTime(15_001);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(1);

    channels[0]!.status!('CHANNEL_ERROR');
    vi.advanceTimersByTime(15_000);
    expect(channels[0]!.removed).toBe(true);
    expect(channels).toHaveLength(2);
    stop.close();
    onChange.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(onChange).not.toHaveBeenCalled();
    expect(channels).toHaveLength(2);
  });

  it('reads the whole day again every time the channel re-joins after a drop', () => {
    const { client, channels } = fake();
    const onChange = vi.fn();
    watchDay({ client, eventId: EVENT, dayId: DAY, onChange });
    channels[0]!.status!('SUBSCRIBED');
    vi.advanceTimersByTime(10);
    channels[0]!.status!('CHANNEL_ERROR');
    channels[0]!.status!('SUBSCRIBED');
    vi.advanceTimersByTime(10);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('on coming back to the front: reads again, and builds a new channel only if the old one is not joined', () => {
    const { client, channels, raw } = fake();
    const onChange = vi.fn();
    const doc = new EventTarget() as unknown as Document;
    Object.defineProperty(doc, 'visibilityState', { value: 'visible' });
    watchDay({ client, eventId: EVENT, dayId: DAY, onChange, doc, win: null });
    channels[0]!.status!('SUBSCRIBED');
    vi.advanceTimersByTime(10);
    onChange.mockClear();

    doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(10);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(1);

    channels[0]!.status!('TIMED_OUT');
    doc.dispatchEvent(new Event('visibilitychange'));
    // Mutation: keeping a dead channel leaves the phone deaf until reload.
    expect(raw.removeChannel).toHaveBeenCalledWith(channels[0]);
    expect(channels).toHaveLength(2);
    expect(channels[0]!.removed).toBe(true);
    channels[1]!.status!('SUBSCRIBED');
    vi.advanceTimersByTime(10);
    // The wake-up and the new channel's join ask together: one read, not two.
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('does not read when the page is hidden', () => {
    const { client } = fake();
    const onChange = vi.fn();
    const doc = new EventTarget() as unknown as Document;
    Object.defineProperty(doc, 'visibilityState', { value: 'hidden' });
    watchDay({ client, eventId: EVENT, dayId: DAY, onChange, doc, win: null });
    doc.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(1000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('on the network coming back: reads again and re-joins a channel that is not joined', () => {
    const { client, channels } = fake();
    const onChange = vi.fn();
    const win = new EventTarget() as unknown as Window;
    watchDay({ client, eventId: EVENT, dayId: DAY, onChange, doc: null, win });
    channels[0]!.status!('CLOSED');
    win.dispatchEvent(new Event('online'));
    expect(channels).toHaveLength(2);
    channels[1]!.status!('SUBSCRIBED');
    vi.advanceTimersByTime(10);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe('letting go', () => {
  it('closing removes the channel and the listeners and cancels a read that was waiting', () => {
    const { client, channels, raw } = fake();
    const onChange = vi.fn();
    const doc = new EventTarget() as unknown as Document;
    Object.defineProperty(doc, 'visibilityState', { value: 'visible' });
    const live = watchDay({ client, eventId: EVENT, dayId: DAY, onChange, doc, win: null });
    change(channels[0]!);
    live.close();
    expect(raw.removeChannel).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    // Mutation: a read left waiting would run on a day the till has let go of.
    expect(onChange).not.toHaveBeenCalled();
    doc.dispatchEvent(new Event('visibilitychange'));
    channels[0]!.status!('SUBSCRIBED');
    change(channels[0]!);
    vi.advanceTimersByTime(5000);
    expect(onChange).not.toHaveBeenCalled();
    expect(channels).toHaveLength(1);
    expect(live.active).toBe(false);
    live.close();
    expect(raw.removeChannel).toHaveBeenCalledTimes(1);
  });
});
