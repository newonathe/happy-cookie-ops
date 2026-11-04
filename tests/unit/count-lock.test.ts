import { afterEach, expect, it, vi } from 'vitest';
import { holdCountLock } from '@/lib/stock/count-lock';
afterEach(() => vi.restoreAllMocks());

it('allows one writer and makes a closed writer available to the next instance', async () => {
  const release = await holdCountLock('first-project');
  expect(release).toBeTypeOf('function');
  expect(await holdCountLock('first-project')).toBeNull();
  release!();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const next = await holdCountLock('first-project');
  expect(next).toBeTypeOf('function');
  next!();
});

it('isolates backend projects and tolerates repeated release', async () => {
  const a = await holdCountLock('project-a'),
    b = await holdCountLock('project-b');
  expect(a).toBeTypeOf('function');
  expect(b).toBeTypeOf('function');
  a!();
  a!();
  b!();
});

it('fails closed when the browser refuses a lock request', async () => {
  vi.spyOn(navigator.locks, 'request').mockRejectedValue(new Error('unavailable'));
  expect(await holdCountLock('blocked-project')).toBeNull();
});
