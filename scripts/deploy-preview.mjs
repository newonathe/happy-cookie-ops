// The only supported way to update the hosted preview: build, swap the payment QR images
// for placeholders, prove the real ones are gone, then deploy. A plain build copies the
// real QR codes back into the output, so deploying without this sequence would publish them.
//
// Needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the synthetic
// preview project, and a logged-in Wrangler. Never point it at a project with real data.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseConnectOrigin } from './pages-spike-headers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (
  !supabaseConnectOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
  !(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').startsWith('sb_publishable_')
) {
  throw new Error('Set the preview project URL and publishable key before deploying.');
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
  if (result.status !== 0) throw new Error(`${args.join(' ')} exited ${result.status}`);
}

run([path.join(root, 'scripts', 'build-pages-spike.mjs')]);
run([path.join(root, 'scripts', 'preview-placeholder-qr.mjs')]);

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const built = path.join(root, 'build', 'pages-spike', 'public', 'assets');
const qrs = (await readdir(path.join(root, 'public', 'assets'))).filter((name) =>
  /^qr-.*\.png$/.test(name)
);
for (const name of qrs) {
  const real = sha(await readFile(path.join(root, 'public', 'assets', name)));
  if (sha(await readFile(path.join(built, name))) === real)
    throw new Error(`Refusing to deploy: ${name} is the real payment QR.`);
}

// wrangler's package `exports` hide bin/, so resolve its folder and use the launcher file.
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
run([wrangler, 'deploy', '--config', path.join('spikes', 'workers-preview', 'wrangler.jsonc')]);
