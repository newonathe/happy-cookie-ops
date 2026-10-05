import { writeFileSync } from 'node:fs';

// Separate Node process: freeze seed construction without editing the protected engine.
Date.now = () => new Date('2026-03-04T09:30:00+08:00').getTime();
const { BASE_STATE } = await import('../src/store/engine/ops-engine.js');
writeFileSync(
  new URL('../tests/fixtures/g0-demo-state.json', import.meta.url),
  JSON.stringify(BASE_STATE()) + '\n'
);
