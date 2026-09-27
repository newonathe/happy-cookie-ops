import { createHash } from 'node:crypto';
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generatePagesHeaders } from './pages-spike-headers.mjs';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const artifactRoot = path.join(root, 'build', 'pages-spike');
const publicOutput = path.join(artifactRoot, 'public');
const stage = await mkdtemp(path.join(path.dirname(root), 'happy-cookie-pages-stage-'));
const input = path.join(stage, 'input');
const nextOut = path.join(input, 'out');
const pagesRoot = path.join(root, 'spikes', 'pages');

function insideArtifact(target) {
  const relative = path.relative(artifactRoot, target);
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error(`Refusing to modify outside Pages artifact: ${target}`);
}

function inputPath(relative) {
  const candidate = path.resolve(root, ...relative.split('/'));
  const relativeToRoot = path.relative(root, candidate);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot))
    throw new Error(`Refusing input path outside repository: ${relative}`);
  return candidate;
}

async function ensureArtifactRoot() {
  await mkdir(artifactRoot, { recursive: true });
  for (const target of [path.join(root, 'build'), artifactRoot]) {
    if ((await lstat(target)).isSymbolicLink() || (await realpath(target)) !== target)
      throw new Error('Artifact directories must not be links.');
  }
}

async function removeArtifactTarget(target) {
  insideArtifact(target);
  const entry = await lstat(target).catch((error) =>
    error.code === 'ENOENT' ? undefined : Promise.reject(error)
  );
  if (!entry) return;
  if (entry.isSymbolicLink() || (await realpath(target)) !== target)
    throw new Error(`Refusing to remove linked Pages artifact: ${target}`);
  await rm(target, { recursive: true, force: true });
}

async function gitFiles(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve(stdout.split('\0').filter(Boolean))
        : reject(new Error(`git ${args.join(' ')} exited ${code}`))
    );
  });
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function buildEnvironment(sterileRoot) {
  const allow = ['COMSPEC', 'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR'];
  const env = Object.fromEntries(
    allow.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]]))
  );
  return {
    ...env,
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
    HOME: path.join(sterileRoot, 'home'),
    USERPROFILE: path.join(sterileRoot, 'home'),
    APPDATA: path.join(sterileRoot, 'appdata'),
    LOCALAPPDATA: path.join(sterileRoot, 'localappdata'),
    TEMP: path.join(sterileRoot, 'temp'),
    TMP: path.join(sterileRoot, 'temp'),
    // Named explicitly, not spread from process.env: this is the only place the static
    // export is told it is the live build. NEXT_PUBLIC_HARNESS is deliberately absent —
    // OpsRuntime.renderVals() reads live mode itself and starves the role-switcher chrome.
    NEXT_PUBLIC_APP_MODE: 'live',
    ...(process.env.NEXT_PUBLIC_SUPABASE_URL === undefined
      ? {}
      : { NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL }),
    ...(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === undefined
      ? {}
      : {
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: requirePublishableKey(
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
          )
        })
  };
}

// The allowlist above already keeps every other secret out of this build, but this is a
// cheap second check against the one mistake that would put a real credential in the
// static export: pasting a secret key or a legacy anon/service_role JWT into the variable
// this build actually reads.
function requirePublishableKey(value) {
  if (!value.startsWith('sb_publishable_'))
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be an sb_publishable_… key, not a secret key or a legacy JWT.'
    );
  return value;
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let timedOut = false;
    let killDeadline;
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
          stdio: 'ignore',
          timeout: 5000
        });
      } else child.kill('SIGKILL');
      killDeadline = setTimeout(() => {
        child.unref();
        reject(
          new Error('Build timed out; process-tree termination did not finish within 5 seconds.')
        );
      }, 5000);
    }, 240_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(killDeadline);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(killDeadline);
      if (timedOut) reject(new Error('Build exceeded the 240-second deadline.'));
      else resolve({ code, signal });
    });
  });
}

try {
  await ensureArtifactRoot();
  await removeArtifactTarget(publicOutput);
  await removeArtifactTarget(path.join(artifactRoot, 'manifest.json'));
  if (process.env.PAGES_SPIKE_TEST_FORCE_FAILURE === '1')
    throw new Error('Forced Pages artifact invalidation check.');

  const tracked = await gitFiles(['ls-files', '-z']);
  const untracked = await gitFiles(['ls-files', '--others', '--exclude-standard', '-z']);
  const candidates = [...new Set([...tracked, ...untracked])];

  const excluded = [];
  const copied = [];
  const rootBuildFiles = new Set([
    'package.json',
    'pnpm-lock.yaml',
    'postcss.config.mjs',
    'tsconfig.json'
  ]);
  for (const relative of candidates) {
    const isEnv = path.basename(relative).startsWith('.env');
    const isBuildInput =
      relative.startsWith('src/') || relative.startsWith('public/') || rootBuildFiles.has(relative);
    const blocked = relative.startsWith('src/app/api/') || relative === 'src/middleware.ts';
    if (isEnv || blocked) {
      excluded.push(relative);
      continue;
    }
    if (!isBuildInput) continue;
    const source = inputPath(relative);
    if ((await lstat(source)).isSymbolicLink() || (await realpath(source)) !== source) {
      throw new Error(`Refusing linked Pages input: ${relative}`);
    }
    const destination = path.join(input, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination);
    copied.push(relative);
  }

  await mkdir(input, { recursive: true });
  const sterileRoot = path.join(stage, 'environment');
  await Promise.all(
    ['home', 'appdata', 'localappdata', 'temp'].map((name) =>
      mkdir(path.join(sterileRoot, name), { recursive: true })
    )
  );
  await writeFile(
    path.join(input, 'next.config.ts'),
    `export default ${JSON.stringify({
      output: 'export',
      reactStrictMode: true,
      poweredByHeader: false
    })};\n`
  );
  await symlink(path.join(root, 'node_modules'), path.join(input, 'node_modules'), 'junction');

  const protectedPaths = copied.filter(
    (relative) =>
      relative.startsWith('src/components/screens/') ||
      relative.startsWith('src/components/sheets/') ||
      relative.startsWith('src/components/shell/') ||
      relative === 'src/store/engine/ops-engine.js'
  );
  const protectedHashes = Object.fromEntries(
    await Promise.all(
      protectedPaths.map(async (relative) => [
        relative,
        sha256(await readFile(path.join(root, relative)))
      ])
    )
  );

  for (const relative of protectedPaths) {
    if (sha256(await readFile(path.join(input, relative))) !== protectedHashes[relative])
      throw new Error(`Protected copy mismatch: ${relative}`);
  }
  const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  // Webpack resolves the explicit dependency junction without widening the
  // project root to the live checkout, which Turbopack currently requires.
  const build = await run(process.execPath, [nextCli, 'build', '--webpack'], {
    cwd: input,
    env: buildEnvironment(sterileRoot),
    stdio: 'inherit'
  });
  if (build.code !== 0)
    throw new Error(`Static Pages build failed (exit ${build.code ?? `signal ${build.signal}`}).`);

  const pages = await Promise.all(
    (await readdir(path.join(root, 'src', 'app'), { recursive: true }))
      .filter((entry) => entry.endsWith(`${path.sep}page.tsx`) || entry === 'page.tsx')
      .map(async (entry) => {
        const route =
          entry === 'page.tsx'
            ? ''
            : entry.slice(0, -`${path.sep}page.tsx`.length).split(path.sep).join('/');
        const html = route ? `${route}.html` : 'index.html';
        return {
          source: `src/app/${entry.split(path.sep).join('/')}`,
          html,
          emitted: await lstat(path.join(nextOut, html)).then(
            () => true,
            () => false
          )
        };
      })
  );
  const missing = pages.filter((page) => !page.emitted);
  if (missing.length)
    throw new Error(
      `Static export missed page output: ${missing.map((page) => page.source).join(', ')}`
    );

  await cp(nextOut, publicOutput, { recursive: true });
  const staticHeaders = await generatePagesHeaders(publicOutput, path.join(pagesRoot, '_headers'));
  await writeFile(path.join(publicOutput, '_headers'), staticHeaders.content);
  await cp(path.join(pagesRoot, '_routes.json'), path.join(publicOutput, '_routes.json'));

  const manifest = {
    scope:
      'local static Pages artifact; session API requires server bindings and remains unverified end-to-end; sync and readiness are unavailable',
    selectedCurrent: 'public',
    publicOutput,
    copied: copied.length,
    copiedInputs: copied,
    exclusions: excluded,
    protectedSourceHashes: protectedHashes,
    emittedPages: pages,
    missingPages: missing.map((page) => page.source),
    staticHeaders: {
      contentSecurityPolicy: staticHeaders.csp,
      scriptHashes: staticHeaders.hashes,
      htmlFiles: staticHeaders.htmlFiles,
      inlineScripts: staticHeaders.inlineScripts,
      staticFiles: staticHeaders.staticFiles
    }
  };
  insideArtifact(path.join(artifactRoot, 'manifest.json'));
  await writeFile(
    path.join(artifactRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  const output = { artifactRoot, stage, manifest };
  console.log(JSON.stringify(output, null, 2));
} finally {
  const resolvedStage = await realpath(stage);
  if (
    path.dirname(resolvedStage) !== path.dirname(root) ||
    !path.basename(resolvedStage).startsWith('happy-cookie-pages-stage-') ||
    resolvedStage !== stage
  ) {
    throw new Error('Refusing to remove staging path outside its designated parent.');
  }
  await rm(resolvedStage, { recursive: true, force: true });
}
