import { describe, expect, it, vi } from 'vitest';
import { EventEntry } from '@/store/event-entry';
import {
  emptyEventEntry,
  freezeEventEntry,
  readEventEntry,
  writeEventEntry
} from '@/lib/bazaar/event-entry-recovery';
import type { EventEntryScope } from '@/lib/bazaar/event-entry-recovery';

const scope = { userId: '11111111-1111-4111-8111-111111111111', business: 'https://one.example' };
const id = '22222222-2222-4222-8222-222222222222';
const input = {
  id,
  name: ' Weekend market ',
  place: 'Hall',
  startsOn: '2026-12-12',
  endsOn: '2026-12-13',
  rent: '2,500.50'
};
function setup() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    }
  };
  const release = vi.fn(),
    send = vi.fn().mockResolvedValue(true),
    changed = vi.fn();
  const write = vi.fn(
    (s: EventEntryScope, v: Parameters<typeof writeEventEntry>[1], resolvedId?: string) =>
      writeEventEntry(s, v, { storage, resolvedId })
  );
  const ports = {
    lock: vi.fn().mockResolvedValue(release),
    read: (s: EventEntryScope) => readEventEntry(s, storage),
    write,
    send,
    changed,
    online: () => true,
    uuid: () => id
  };
  return { entry: new EventEntry(ports), ports, data, storage, release, send, write, changed };
}
function fill(entry: EventEntry) {
  entry.begin();
  for (const key of ['name', 'place', 'startsOn', 'endsOn', 'rent'] as const)
    entry.set(key, input[key]);
  entry.review();
}
describe('retained event entry controller', () => {
  it.each([false, null])(
    'keeps the exact uncertain request after a non-confirming check: %s',
    async (answer) => {
      const x = setup();
      const listed = vi.fn().mockResolvedValue(answer);
      const entry = new EventEntry({ ...x.ports, listed });
      x.send.mockResolvedValue(false);
      await entry.bind(scope);
      fill(entry);
      await entry.save();
      const before = readEventEntry(scope, x.storage).value;
      await entry.abandon();
      expect(listed).toHaveBeenCalledWith(freezeEventEntry(input));
      expect(entry.view().pending).toBe(true);
      expect(entry.view().saved).toBeNull();
      expect(readEventEntry(scope, x.storage).value).toEqual(before);
      entry.discard();
      expect(entry.view().pending).toBe(true);
    }
  );
  it('resolves recovery only when a fresh check confirms the exact body', async () => {
    const x = setup();
    const entry = new EventEntry({ ...x.ports, listed: vi.fn().mockResolvedValue(true) });
    x.send.mockResolvedValue(false);
    await entry.bind(scope);
    fill(entry);
    await entry.save();
    await entry.abandon();
    expect(entry.view().saved?.id).toBe(id);
    expect(readEventEntry(scope, x.storage).value?.submitted).toBeNull();
  });
  it('restores raw incomplete values under the same owner without posting', async () => {
    const x = setup();
    await x.entry.bind(scope);
    x.entry.begin();
    x.entry.set('rent', 'invalid');
    x.entry.dispose();
    await x.entry.bind(scope);
    expect(x.entry.view().draft?.rent).toBe('invalid');
    expect(x.send).not.toHaveBeenCalled();
    expect(x.release).toHaveBeenCalledOnce();
    x.entry.begin();
    expect(x.entry.view().draft?.rent).toBe('invalid');
  });
  it('validates before review, follows the first day, and requires review before sending', async () => {
    const x = setup();
    await x.entry.bind(scope);
    x.entry.begin();
    x.entry.review();
    expect(x.entry.view().errors.length).toBeGreaterThan(0);
    x.entry.set('startsOn', '2026-12-12');
    expect(x.entry.view().draft?.endsOn).toBe('2026-12-12');
    await x.entry.save();
    expect(x.send).not.toHaveBeenCalled();
    fill(x.entry);
    await x.entry.save();
    expect(x.send).toHaveBeenCalledWith(freezeEventEntry(input));
    expect(x.entry.view().saved?.id).toBe(id);
    expect(x.entry.view().draft).toBeNull();
    expect(readEventEntry(scope, x.storage).value?.submitted).toBeNull();
  });
  it('freezes uncertain requests across reload and retries the exact same request only on demand', async () => {
    const x = setup();
    x.send.mockResolvedValue(false);
    await x.entry.bind(scope);
    fill(x.entry);
    await x.entry.save();
    const first = x.send.mock.calls[0]?.[0];
    x.entry.set('name', 'Changed');
    x.entry.discard();
    expect(x.entry.view().draft?.name).toBe(input.name);
    x.entry.dispose();
    await x.entry.bind(scope);
    expect(x.send).toHaveBeenCalledTimes(1);
    expect(x.entry.view().pending).toBe(true);
    x.send.mockResolvedValue(true);
    await x.entry.save();
    expect(x.send.mock.calls[1]?.[0]).toEqual(first);
    expect(x.entry.view().saved?.id).toBe(id);
  });
  it('never posts when the checked device write fails or while offline', async () => {
    const x = setup();
    await x.entry.bind(scope);
    fill(x.entry);
    x.write.mockReturnValueOnce(false);
    await x.entry.save();
    expect(x.send).not.toHaveBeenCalled();
    expect(x.entry.view().phase).toBe('unavailable');
    await x.entry.retryStorage();
    expect(x.entry.view().phase).toBe('ready');
    x.ports.online = () => false;
    await x.entry.save();
    expect(x.send).not.toHaveBeenCalled();
  });
  it('blocks a second writer and does not read before acquiring the lock', async () => {
    const x = setup();
    const read = vi.spyOn(x.ports, 'read');
    x.ports.lock.mockResolvedValue(null);
    await x.entry.bind(scope);
    x.entry.begin();
    await x.entry.save();
    expect(x.entry.view().phase).toBe('locked');
    expect(read).not.toHaveBeenCalled();
    expect(x.send).not.toHaveBeenCalled();
  });
  it('binding the same owner again keeps the open page and its lock', async () => {
    const x = setup();
    await x.entry.bind(scope);
    x.entry.begin();
    x.entry.set('name', 'Typed');
    await x.entry.bind({ ...scope });
    expect(x.ports.lock).toHaveBeenCalledOnce();
    expect(x.release).not.toHaveBeenCalled();
    expect(x.entry.view()).toMatchObject({ open: true, phase: 'ready' });
    expect(x.entry.view().draft?.name).toBe('Typed');
  });
  it('asks once more when its own just-released lock is not free yet', async () => {
    const x = setup();
    x.ports.lock.mockResolvedValueOnce(null);
    await x.entry.bind(scope);
    expect(x.ports.lock).toHaveBeenCalledTimes(2);
    expect(x.entry.view().phase).toBe('ready');
  });
  it('does not replace an invalid stored copy', async () => {
    const x = setup();
    writeEventEntry(scope, emptyEventEntry(scope), { storage: x.storage });
    const key = [...x.data.keys()][0]!;
    x.data.set(key, '{');
    await x.entry.bind(scope);
    x.entry.begin();
    x.entry.discard();
    expect(x.entry.view().phase).toBe('invalid');
    expect(x.data.get(key)).toBe('{');
  });
  it('ignores late replies after owner/backend changes and releases a late acquired lock', async () => {
    const x = setup();
    let finish!: (value: boolean) => void;
    x.send.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    await x.entry.bind(scope);
    fill(x.entry);
    const saving = x.entry.save();
    await x.entry.bind({ ...scope, business: 'https://two.example' });
    x.entry.begin();
    x.entry.set('name', 'Other draft');
    finish(true);
    await saving;
    expect(x.entry.view().draft?.name).toBe('Other draft');
    expect(x.entry.view().saved).toBeNull();
    expect(readEventEntry(scope, x.storage).value?.submitted).not.toBeNull();
    let acquire!: (release: () => void) => void;
    x.entry.dispose();
    x.ports.lock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acquire = resolve;
        })
    );
    const binding = x.entry.bind(scope);
    x.entry.dispose();
    const lateRelease = vi.fn();
    acquire(lateRelease);
    await binding;
    expect(lateRelease).toHaveBeenCalledOnce();
    expect(x.entry.view().phase).toBe('closed');
  });
  it('ignores double submit and keeps confirmed truth if clearing the device copy fails', async () => {
    const x = setup();
    let finish!: (value: boolean) => void;
    x.send.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        })
    );
    await x.entry.bind(scope);
    fill(x.entry);
    const save = x.entry.save();
    await x.entry.save();
    expect(x.send).toHaveBeenCalledOnce();
    x.write.mockReturnValueOnce(false);
    finish(true);
    await save;
    expect(x.entry.view().saved?.id).toBe(id);
    expect(x.entry.view().phase).toBe('unavailable');
    expect(readEventEntry(scope, x.storage).value?.submitted).not.toBeNull();
    await x.entry.retryStorage();
    expect(x.entry.view().phase).toBe('ready');
    expect(readEventEntry(scope, x.storage).value?.draft).toBeNull();
    expect(x.send).toHaveBeenCalledOnce();
  });
});
