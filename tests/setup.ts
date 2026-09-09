import '@testing-library/jest-dom/vitest';

// jsdom has no IndexedDB and no crypto.randomUUID in older versions. The queue tests
// use fake-indexeddb-free stubs so they exercise real logic rather than mocks.
if (!('randomUUID' in crypto)) {
  Object.defineProperty(crypto, 'randomUUID', {
    value: () => 'test-' + Math.random().toString(16).slice(2, 10)
  });
}
