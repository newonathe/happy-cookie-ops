export const CUSTOMER_ACCESS_NAME = 'Happy Cookie public customer pages';
export const OWNER_ACCESS_APP_ID = 'fe0eb039-b3b5-4acc-b533-d33868810e89';
export const CUSTOMER_ACCESS_HOSTNAME = 'happy-cookie-owner-trial.admin-kethai.workers.dev';
export const OWNER_ACCESS_TENANT = 'lingering-field-353a.cloudflareaccess.com';
export const CUSTOMER_PUBLIC_PATHS = Object.freeze([
  '/shop',
  '/checkout',
  '/status',
  '/lookup',
  '/_next/static/*',
  '/assets/*.png',
  '/manifest.webmanifest'
]);
export const PUBLIC_CUSTOMER_ROUTES = Object.freeze(
  ['/shop', '/checkout', '/status', '/lookup'].flatMap((route) => [route, `${route}/`])
);
export const OWNER_DENIED_ROUTES = Object.freeze([
  '/',
  '/pnl',
  '/orders',
  '/products',
  '/settings',
  '/bazaar',
  '/sign-in',
  '/sw.js',
  '/shop-admin',
  '/checkout-admin'
]);

const fail = (message) => {
  throw new Error(message);
};
const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function requireCustomerAccessAppId(value, ownerAppId = OWNER_ACCESS_APP_ID) {
  if (!value) fail('TRIAL_PUBLIC_CUSTOMER_ACCESS_APP_ID is required; release is blocked');
  if (!isUuid(value)) fail('TRIAL_PUBLIC_CUSTOMER_ACCESS_APP_ID must be a UUID');
  if (!isUuid(ownerAppId) || value.toLowerCase() === ownerAppId.toLowerCase())
    fail('Customer Access app ID must identify a separate app from the private owner app');
  return value;
}

export function buildCustomerAccessManifest(host = CUSTOMER_ACCESS_HOSTNAME) {
  if (host !== CUSTOMER_ACCESS_HOSTNAME)
    fail('Customer Access manifest host must match the trial hostname');
  return {
    application: {
      name: CUSTOMER_ACCESS_NAME,
      type: 'self_hosted',
      destinations: CUSTOMER_PUBLIC_PATHS.map((path) => ({ type: 'public', uri: `${host}${path}` }))
    },
    policies: [
      {
        name: 'Public customer pages',
        decision: 'bypass',
        include: [{ everyone: {} }],
        exclude: [],
        require: []
      }
    ]
  };
}

export function validateCustomerAccessGate({
  appId,
  privateAppId: ownerAppId = OWNER_ACCESS_APP_ID,
  host = CUSTOMER_ACCESS_HOSTNAME,
  app,
  policies
}) {
  requireCustomerAccessAppId(appId, ownerAppId);
  if (app?.id !== appId || app?.type !== 'self_hosted')
    fail('Public customer Access application identity/type mismatch');
  const expected = CUSTOMER_PUBLIC_PATHS.map((path) => `${host}${path}`).sort();
  const actual = Array.isArray(app?.destinations)
    ? app.destinations
        .map((destination) => {
          if (
            !destination ||
            Object.keys(destination).sort().join() !== 'type,uri' ||
            destination.type !== 'public' ||
            typeof destination.uri !== 'string'
          )
            fail('Public customer Access destinations must be exact public host/path entries');
          return destination.uri;
        })
        .sort()
    : [];
  if (actual.length !== expected.length || actual.some((uri, index) => uri !== expected[index]))
    fail('Public customer Access destinations do not exactly match the approved customer paths');
  const approvedUris = new Set(expected);
  const approvedDomainList = (value) =>
    value == null ||
    (Array.isArray(value) &&
      new Set(value).size === value.length &&
      value.every((uri) => approvedUris.has(uri)));
  if (
    (app.domain != null && app.domain !== '' && !approvedUris.has(app.domain)) ||
    !approvedDomainList(app.self_hosted_domains)
  )
    fail('Public customer app contains hostname-wide or unapproved destinations');
  if (!Array.isArray(policies) || policies.length !== 1)
    fail('Public customer app must have exactly one policy');
  const [policy] = policies;
  const include = policy?.include;
  if (
    policy?.decision !== 'bypass' ||
    !Array.isArray(include) ||
    include.length !== 1 ||
    Object.keys(include[0] ?? {}).join() !== 'everyone' ||
    include[0]?.everyone === null ||
    typeof include[0]?.everyone !== 'object' ||
    Array.isArray(include[0]?.everyone) ||
    Object.keys(include[0]?.everyone ?? {}).length !== 0 ||
    !Array.isArray(policy.exclude) ||
    policy.exclude.length !== 0 ||
    !Array.isArray(policy.require) ||
    policy.require.length !== 0
  )
    fail(
      'Public customer policy must be one unrestricted Everyone bypass without exclude/require selectors'
    );
  return true;
}

function pathIsPublic(pathname) {
  const route = pathname.replace(/\/$/, '') || '/';
  return (
    CUSTOMER_PUBLIC_PATHS.slice(0, 4).includes(route) ||
    pathname.startsWith('/_next/static/') ||
    /^\/assets\/[^/]+\.png$/i.test(pathname) ||
    pathname === '/manifest.webmanifest'
  );
}

export function publicMimeForPath(pathname) {
  const page = pathname.replace(/\/$/, '') || '/';
  if (CUSTOMER_PUBLIC_PATHS.slice(0, 4).includes(page)) return 'text/html';
  const extension = pathname.slice(pathname.lastIndexOf('.')).toLowerCase();
  const types = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json'
  };
  const mime = types[extension];
  if (!mime) fail(`No expected MIME type for public resource (${pathname})`);
  return mime;
}

export async function assertPublicRoute(fetcher, origin, route, expectedBody) {
  const base = new URL(origin);
  let current = new URL(route, base);
  if (current.origin !== base.origin || !pathIsPublic(current.pathname))
    fail(`Not an approved public customer path (${route})`);
  if (expectedBody == null) fail(`Missing emitted body for public route (${route})`);
  const expected = Buffer.from(expectedBody);
  const expectedMime = publicMimeForPath(current.pathname);
  for (let redirects = 0; redirects <= 2; redirects += 1) {
    const response = await fetcher(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 200) {
      const actualMime = (response.headers.get('content-type') ?? '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();
      const mimeMatches =
        actualMime === expectedMime ||
        (expectedMime === 'application/javascript' && actualMime === 'text/javascript');
      if (!mimeMatches) fail(`Public route MIME mismatch (${route}: ${actualMime || 'missing'})`);
      const actual = Buffer.from(await response.arrayBuffer());
      if (!actual.equals(expected)) fail(`Public route body mismatch (${route})`);
      return true;
    }
    if (response.status >= 200 && response.status < 300)
      fail(`Public customer route must return HTTP 200 (${route}: ${response.status})`);
    if (![301, 302, 303, 307, 308].includes(response.status))
      fail(`Public customer route was not accessible (${route}: ${response.status})`);
    if (redirects === 2) fail(`Public customer route redirected more than twice (${route})`);
    const next = new URL(response.headers.get('location') ?? '', current);
    const samePath = next.pathname.replace(/\/$/, '') === current.pathname.replace(/\/$/, '');
    if (next.origin !== base.origin || !samePath || next.search !== current.search)
      fail(`Public customer route redirected outside its canonical same-origin path (${route})`);
    current = next;
  }
}

/**
 * Right after a deploy the edge can still serve the previous build for a short while (each build has a new build id, so
 * its HTML differs). Poll one public route until it serves the emitted bytes, then let the full check run. Gives up after
 * `attempts` with the last real reason (19 November 2026: a release was switched off over a few seconds of rollout).
 */
export async function waitForPublicRoute(
  fetcher,
  origin,
  route,
  expectedBody,
  {
    attempts = 24,
    delayMs = 5000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await assertPublicRoute(fetcher, origin, route, expectedBody);
      return attempt;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

/**
 * Every public route and resource of a release, each waited for as `waitForPublicRoute` waits for one (19 November
 * 2026: after #97 waited on `/shop` alone, `/lookup/` still served the previous build for a few seconds and the gate
 * switched the release off). `entries` are `[route, emittedBody]`; stops at the first route that never matches, with
 * its reason. `attempts: 1` is the strict single read for a preflight with no deploy.
 */
export async function assertPublicRoutesSettled(fetcher, origin, entries, options = {}) {
  for (const [route, body] of entries)
    await waitForPublicRoute(fetcher, origin, route, body, options);
  return entries.length;
}

export async function assertOwnerRouteDenied(fetcher, origin, route) {
  const base = new URL(origin);
  const url = new URL(route, base);
  if (url.origin !== base.origin) fail(`Owner denial check must use the trial origin (${route})`);
  const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  if ([401, 403].includes(response.status)) return true;
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = new URL(response.headers.get('location') ?? '', url);
    if (
      location.protocol === 'https:' &&
      ((location.origin === base.origin && location.pathname.startsWith('/cdn-cgi/access/')) ||
        location.hostname === OWNER_ACCESS_TENANT)
    )
      return true;
  }
  fail(`Owner route was not denied by Access (${route}: ${response.status})`);
}

export function emittedPublicResourcePaths(files = []) {
  const paths = new Set(['/manifest.webmanifest']);
  for (const file of files) {
    const path = `/${file.replaceAll('\\', '/').replace(/^\/+/, '')}`;
    if (pathIsPublic(path) && !PUBLIC_CUSTOMER_ROUTES.includes(path)) paths.add(path);
  }
  return [...paths];
}

export function emittedArtifactPath(route) {
  const pathname = new URL(route, `https://${CUSTOMER_ACCESS_HOSTNAME}`).pathname;
  const page = pathname.replace(/\/$/, '');
  return PUBLIC_CUSTOMER_ROUTES.includes(page)
    ? `${page.slice(1)}.html`
    : decodeURIComponent(pathname.slice(1));
}
