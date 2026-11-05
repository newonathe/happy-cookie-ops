// node probe.mjs path|config|click1;click2 ... compact exploration of several states
import { execFileSync } from 'node:child_process';
for (const spec of process.argv.slice(2)) {
  const [p, cfg, clicks] = spec.split('|');
  const steps = (clicks ?? '')
    .split(';')
    .filter(Boolean)
    .map((s) =>
      s.startsWith('=') ? { fill: s.slice(1).split('=')[0], value: s.slice(1).split('=')[1] } : s
    );
  const out = execFileSync(
    process.execPath,
    [
      'inspect.mjs',
      JSON.stringify({ path: p, config: cfg ? JSON.parse(cfg) : {}, clicks: steps, terse: true })
    ],
    { encoding: 'utf8' }
  );
  for (const line of out.trim().split('\n')) {
    if (!line.startsWith('{')) {
      console.log('  !', line.slice(0, 200));
      continue;
    }
    const f = JSON.parse(line);
    const skip =
      /^(Home|Bazaar|Sell|Make|Stock|Money)( \d+)?$|^(Quick add|Notifications|Account|Sign out|Back)$/;
    console.log('#', spec.slice(0, 110));
    console.log(
      '  url',
      f.url,
      'scr',
      f.screen,
      'of',
      f.overflow,
      'W',
      (f.writes ?? []).join(','),
      'U',
      [...new Set(f.unhandled ?? [])].join(',')
    );
    console.log('  H', f.heads.join(' | ').slice(0, 300));
    console.log(
      '  B',
      [...new Set(f.btn.filter((b) => !skip.test(b)).map((b) => b.slice(0, 42)))]
        .join(' | ')
        .slice(0, 1100)
    );
    if (f.inputs.length)
      console.log(
        '  I',
        f.inputs
          .map((i) => i.replace(/\n.*/s, '').slice(0, 40))
          .join(' | ')
          .slice(0, 500)
      );
  }
}
