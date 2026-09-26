import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/auth/cleanup-worker-provider.test.mjs'],
    testTimeout: 120_000,
    maxWorkers: 1
  }
});
