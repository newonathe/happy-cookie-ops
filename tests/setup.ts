import '@testing-library/jest-dom/vitest';

// jsdom has no IndexedDB and no crypto.randomUUID in older versions. The queue tests
// use fake-indexeddb-free stubs so they exercise real logic rather than mocks.
if (!('randomUUID' in crypto)) {
  Object.defineProperty(crypto, 'randomUUID', {
    value: () => 'test-' + Math.random().toString(16).slice(2, 10)
  });
}

// jsdom has no Web Locks. Model browser-origin exclusivity for real runtime tests.
if (!navigator.locks) {
  const held = new Set<string>();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (
        name: string,
        _options: { ifAvailable?: boolean },
        run: (lock: Lock | null) => unknown
      ) => {
        if (held.has(name)) return run(null);
        held.add(name);
        try {
          return await run({ name, mode: 'exclusive' });
        } finally {
          held.delete(name);
        }
      }
    }
  });
}
