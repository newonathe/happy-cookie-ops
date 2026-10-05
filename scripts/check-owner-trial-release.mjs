import { createHash } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const TARGET = Object.freeze({
  account: '0cb53d2d20d41cf04207d2b78d39de2d',
  app: 'fe0eb039-b3b5-4acc-b533-d33868810e89',
  worker: 'happy-cookie-owner-trial',
  hostname: 'happy-cookie-owner-trial.admin-kethai.workers.dev',
  accountSubdomain: 'admin-kethai',
  policy: 'cb34c3f9-1d8f-4ef7-8f69-6d3b5514a1d5',
  provider: '0337f851-5c16-4722-83a8-fda354c0818e',
  branch: 'refs/heads/agent/codex/MP-04-g1-feasibility'
});

// How many owner mailboxes the Access policy may admit, and so how many approved SHA-256
// digests the release must see: two to six, the bounds of slice A1 (final-plan.md section 9).
// The floor keeps both owners; the ceiling keeps the trial private. Changing either is a
// decision to record, never a quiet edit, because this check decides who can sign in.
export const APPROVED_EMAIL_MIN = 2;
export const APPROVED_EMAIL_MAX = 6;

// Access session lengths the release accepts, for the application and for its policy.
// Add a value only after reading it back from the live policy: Cloudflare does not publish
// the string its API returns, and a guess fails the release or admits a longer session.
// When Ethan sets "1 week" in the dashboard, the next failed release prints the value it
// found; put exactly that string in the second entry below and delete the comment marks.
export const ALLOWED_SESSION_DURATIONS = Object.freeze([
  '8h'
  // , 'FILL FROM THE POLICY: the value reported after choosing "1 week" (final-plan.md section 12)'
]);

const api = 'https://api.cloudflare.com/client/v4';
const hash = (s) => createHash('sha256').update(s.trim().toLowerCase()).digest('hex');
const fail = (message) => {
  throw new Error(message);
};

export function validateGate({
  app,
  policies,
  providers,
  subdomain,
  accountSubdomain,
  routes,
  emailHashes,
  afterDeploy = false
}) {
  if (app?.id !== TARGET.app || app?.domain !== TARGET.hostname || app?.type !== 'self_hosted')
    fail('Access application identity/domain/type mismatch');
  if (accountSubdomain?.subdomain !== TARGET.accountSubdomain)
    fail('Cloudflare account workers.dev subdomain mismatch');
  if (!ALLOWED_SESSION_DURATIONS.includes(app?.session_duration))
    fail(
      `Access application session must be one of ${ALLOWED_SESSION_DURATIONS.join(', ')} (found ${JSON.stringify(app?.session_duration)})`
    );
  if (
    !Array.isArray(providers) ||
    !Array.isArray(app.allowed_idps) ||
    app.allowed_idps.length !== 1
  )
    fail('Application must allow exactly one identity provider');
  const selectedProvider = providers.find((p) => p.id === app.allowed_idps[0]);
  if (
    app.allowed_idps[0] !== TARGET.provider ||
    selectedProvider?.id !== TARGET.provider ||
    selectedProvider?.type !== 'onetimepin'
  )
    fail('Application must allow only the configured one-time PIN provider');
  if (!Array.isArray(policies) || policies.length !== 1 || policies[0]?.id !== TARGET.policy)
    fail('Expected exactly one application policy');
  const [p] = policies;
  if (p?.decision !== 'allow' || p?.exclude?.length || p?.require?.length)
    fail('Policy must be an allow policy without exclude/require selectors');
  if (!ALLOWED_SESSION_DURATIONS.includes(p?.session_duration))
    fail(
      `Access policy session must be one of ${ALLOWED_SESSION_DURATIONS.join(', ')} (found ${JSON.stringify(p?.session_duration)})`
    );
  const selectors = p?.include;
  if (
    !Array.isArray(selectors) ||
    selectors.some(
      (s) =>
        Object.keys(s).length !== 1 ||
        Object.keys(s.email ?? {}).length !== 1 ||
        typeof s.email?.email !== 'string'
    )
  )
    fail('Policy include rules must be single email selectors');
  const bounds = `between ${APPROVED_EMAIL_MIN} and ${APPROVED_EMAIL_MAX}`;
  if (selectors.length < APPROVED_EMAIL_MIN || selectors.length > APPROVED_EMAIL_MAX)
    fail(`Policy must contain ${bounds} email selectors (found ${selectors.length})`);
  const actual = selectors.map((s) => hash(s.email.email));
  if (new Set(actual).size !== actual.length) fail('Policy contains a duplicate email selector');
  const expected = String(emailHashes ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (
    expected.length < APPROVED_EMAIL_MIN ||
    expected.length > APPROVED_EMAIL_MAX ||
    new Set(expected).size !== expected.length
  )
    fail(`Approved SHA-256 digest list must contain ${bounds} unique digests`);
  const approved = new Set(expected);
  if (
    expected.some((s) => !/^[a-f0-9]{64}$/.test(s)) ||
    actual.length !== expected.length ||
    actual.some((s) => !approved.has(s))
  )
    fail('Policy email selectors do not match the approved SHA-256 digests');
  if (
    subdomain?.previews_enabled !== false ||
    (afterDeploy && subdomain?.enabled !== true) ||
    (!afterDeploy && typeof subdomain?.enabled !== 'boolean')
  )
    fail('Worker domain must have preview URLs disabled and be enabled after deployment');
  if (!Array.isArray(routes) || routes.length) fail('Expected zero Worker routes');
  return true;
}

export function requireExistingWorker(scripts) {
  if (!Array.isArray(scripts) || !scripts.some((script) => script.id === TARGET.worker))
    fail('Expected existing Worker; creation is disabled');
}

async function get(path, token) {
  const response = await fetch(`${api}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) fail(`Cloudflare read failed (${response.status})`);
  const body = await response.json();
  if (body.success !== true) fail('Cloudflare read returned an unsuccessful result');
  return body.result;
}

async function snapshot(afterDeploy = false) {
  const accessToken = process.env.CLOUDFLARE_ACCESS_API_TOKEN;
  const workerToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accessToken || !workerToken) fail('Required Cloudflare tokens are missing');
  const base = `/accounts/${TARGET.account}`;
  const [app, policies, providers, accountSubdomain, subdomain, routes, scripts] =
    await Promise.all([
      get(`${base}/access/apps/${TARGET.app}`, accessToken),
      get(`${base}/access/apps/${TARGET.app}/policies`, accessToken),
      get(`${base}/access/identity_providers`, accessToken),
      get(`${base}/workers/subdomain`, workerToken),
      get(`${base}/workers/scripts/${TARGET.worker}/subdomain`, workerToken),
      get(`${base}/workers/scripts/${TARGET.worker}/routes`, workerToken),
      get(`${base}/workers/scripts`, workerToken)
    ]);
  requireExistingWorker(scripts);
  validateGate({
    app,
    policies,
    providers,
    subdomain,
    accountSubdomain,
    routes,
    emailHashes: process.env.TRIAL_ACCESS_EMAIL_SHA256,
    afterDeploy
  });
}

async function detachCanonicalDomain() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) fail('Cannot run fail-closed action without Workers API token');
  const response = await fetch(
    `${api}/accounts/${TARGET.account}/workers/scripts/${TARGET.worker}/subdomain`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: false, previews_enabled: false }),
      signal: AbortSignal.timeout(15000)
    }
  );
  if (!response.ok || !(await response.json()).success)
    fail('Fail-closed Worker domain disable failed; manual intervention required');
  const state = await get(
    `/accounts/${TARGET.account}/workers/scripts/${TARGET.worker}/subdomain`,
    token
  );
  if (state.enabled !== false || state.previews_enabled !== false)
    fail('Fail-closed Worker domain state could not be verified');
}

async function assertAnonymousDenied() {
  const origin = `https://${TARGET.hostname}`;
  const index = await readFile('build/pages-spike/public/index.html', 'utf8');
  const jsPath = index.match(/src=["']([^"']+\.js(?:\?[^"']*)?)["']/)?.[1];
  if (!jsPath) fail('Could not identify the emitted application JavaScript');
  for (const route of ['/', '/pnl', jsPath, '/sw.js']) {
    const response = await fetch(new URL(route, origin), {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });
    const location = response.headers.get('location') ?? '';
    if (
      ![302, 401, 403].includes(response.status) ||
      (response.status === 302 && !/cloudflareaccess\.com|\/cdn-cgi\/access\//i.test(location))
    )
      fail(`Anonymous request was not denied by Access (${route})`);
  }
}

async function deploy() {
  const config = 'spikes/owner-trial/wrangler.jsonc';
  const temporary = 'spikes/owner-trial/.wrangler-deploy.jsonc';
  await snapshot();
  const source = JSON.parse((await readFile(config, 'utf8')).replace(/^\s*\/\/.*$/gm, ''));
  if (
    source.account_id !== TARGET.account ||
    source.name !== TARGET.worker ||
    source.compatibility_date !== '2026-09-08' ||
    source.workers_dev !== false ||
    source.preview_urls !== false ||
    source.assets?.directory !== '../../build/pages-spike/public' ||
    source.assets?.not_found_handling !== 'none'
  )
    fail('Checked-in Worker config is not the approved disabled target');
  const allowed = [
    '$schema',
    'name',
    'account_id',
    'compatibility_date',
    'workers_dev',
    'preview_urls',
    'assets'
  ].sort();
  if (
    Object.keys(source).sort().join() !== allowed.join() ||
    Object.keys(source.assets).sort().join() !== ['directory', 'not_found_handling'].sort().join()
  )
    fail('Worker config contains an unapproved resource, binding, trigger, route, or environment');
  await writeFile(
    temporary,
    JSON.stringify({ ...source, workers_dev: true, preview_urls: false }, null, 2)
  );
  let deployAttempted = false;
  try {
    deployAttempted = true;
    const result = spawnSync('pnpm', ['exec', 'wrangler', 'deploy', '--config', temporary], {
      stdio: 'inherit',
      timeout: 15 * 60 * 1000,
      shell: process.platform === 'win32'
    });
    if (result.status !== 0) fail(`Wrangler deploy failed (${result.status ?? 'spawn error'})`);
    await snapshot(true);
    await assertAnonymousDenied();
  } catch (error) {
    if (deployAttempted) {
      try {
        await detachCanonicalDomain();
      } catch {
        fail('Post-deploy gate failed and automatic fail-closed detach also failed');
      }
    }
    throw error;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const checkOnly = process.argv.length === 3 && process.argv[2] === '--check-only';
  const run = async () => {
    if (checkOnly) {
      await snapshot(true);
      await assertAnonymousDenied();
      console.log('Existing private trial release preflight PASS; no hosted writes.');
    } else if (process.argv.length === 2) await deploy();
    else fail('Supported usage: no arguments to deploy, or --check-only for read-only preflight');
  };
  run().catch((error) => {
    console.error(`Owner-trial release blocked: ${error.message}`);
    process.exitCode = 1;
  });
}
