/**
 * The live static export against the LOCAL Supabase stack, built and served for a headless
 * browser. Shared by scripts/test-live-checkout.mjs (customer pages) and
 * scripts/test-live-smoke.mjs (the signed-in owner), so there is one build, one emulator
 * launch and one local-only guard.
 */
import { createServer } from 'node:net';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const root = await realpath(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
);
const output = path.join(root, 'build', 'pages-spike', 'public');
const config = path.join(root, 'spikes', 'pages', 'wrangler.jsonc');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/**
 * The three values a live run needs, or exit 2. The service-role key seeds the world and
 * reads rows back, so the address must be this machine: anything else is refused.
 */
export function localStack() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishable || !service) {
    console.error(
      'Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY (see the header of this file).'
    );
    process.exit(2);
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) {
    console.error(
      'Refusing to run: the service-role key is used against a local Supabase address only.'
    );
    process.exit(2);
  }
  return { url, publishable, service };
}

/** Builds the live export, serves it on a free local port, and waits until it answers. */
export async function serveLiveBuild() {
  const reused = process.env.LIVE_REUSE_BUILD === '1';
  if (reused) {
    // For working on a script only. A run offered as evidence builds, so it tests this tree.
    // The last build must have been made for this same local stack: a bundle built for
    // another address would send the test sign-in there.
    const manifest = JSON.parse(
      await readFile(path.join(root, 'build', 'pages-spike', 'manifest.json'), 'utf8')
    );
    assert(
      manifest.staticHeaders?.supabaseOrigin ===
        new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin,
      'LIVE_REUSE_BUILD=1, but the last build was made for a different address. Build again.'
    );
    console.log('REUSING the last build (LIVE_REUSE_BUILD=1): not evidence for the current tree.');
  } else {
    console.log('Building the live static export against the local stack…');
    // The build needs the address and the publishable key only; the service-role key stays here.
    const { SUPABASE_SERVICE_ROLE_KEY: _kept, ...buildEnv } = process.env;
    const build = spawnSync(
      process.execPath,
      [path.join(root, 'scripts', 'build-pages-spike.mjs')],
      { cwd: root, env: buildEnv, stdio: ['ignore', 'ignore', 'inherit'] }
    );
    assert(build.status === 0, 'build:pages:spike failed.');
  }

  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string')
        return reject(new Error('Could not reserve a local port.'));
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  // The emulator gets no secrets: the browser bundle carries the publishable key, the server needs none.
  const allowedEnv = [
    'APPDATA',
    'COMSPEC',
    'LOCALAPPDATA',
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'WINDIR'
  ];
  const localEnv = Object.fromEntries(
    allowedEnv.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]]))
  );
  const state = path.join(root, 'build', 'pages-spike', 'wrangler-state');
  assert(
    !(await readdir(path.dirname(config))).some(
      (name) => name.startsWith('.dev.vars') || name.startsWith('.env')
    ),
    'Local fixture directory must contain no environment files.'
  );
  const child = spawn(
    process.execPath,
    [
      wrangler,
      'pages',
      'dev',
      output,
      '--ip',
      '127.0.0.1',
      '--port',
      String(port),
      '--persist-to',
      state,
      '--log-level',
      'error'
    ],
    {
      cwd: path.dirname(config),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...localEnv,
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false',
        CI: '1',
        NO_PROXY: '127.0.0.1,localhost',
        WRANGLER_SEND_METRICS: 'false'
      }
    }
  );
  let logs = '';
  child.stdout.on('data', (chunk) => (logs += chunk));
  child.stderr.on('data', (chunk) => (logs += chunk));
  const stop = () => {
    if (child.exitCode === null && child.pid) {
      if (process.platform === 'win32')
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      else child.kill('SIGTERM');
    }
  };
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`Emulator exited early: ${logs.slice(-500)}`);
    try {
      const response = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) });
      if (response.status === 200) return { base, stop, reused };
    } catch {}
    if (Date.now() > deadline) {
      stop();
      throw new Error(`Wrangler Pages emulator did not become ready. ${logs.slice(-500)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
