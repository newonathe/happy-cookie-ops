import { test } from 'vitest';

test('disposable scheduled Worker provider lifecycle', async () => {
  await import('../../../scripts/test-cleanup-worker-provider.mjs');
});
