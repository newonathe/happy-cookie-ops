import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_ACCESS_NAME,
  CUSTOMER_PUBLIC_PATHS,
  assertOwnerRouteDenied,
  assertPublicRoute,
  waitForPublicRoute,
  buildCustomerAccessManifest,
  emittedPublicResourcePaths,
  emittedArtifactPath,
  publicMimeForPath,
  requireCustomerAccessAppId,
  validateCustomerAccessGate
} from '../../scripts/customer-access.mjs';

const appId = 'ed79f168-44f3-42b1-b4f9-fccab3500c33';
const host = 'happy-cookie-owner-trial.admin-kethai.workers.dev';
const uri = (path: string) => `${host}${path}`;
const dest = (path: string) => ({ type: 'public', uri: uri(path) });
const gate = () => ({
  appId,
  app: { id: appId, type: 'self_hosted', destinations: CUSTOMER_PUBLIC_PATHS.map(dest) },
  policies: [{ decision: 'bypass', include: [{ everyone: {} }], exclude: [], require: [] }]
});
const response =
  (status: number, body = '', mime = 'text/html', location?: string) =>
  async () =>
    new Response(status === 204 ? null : body, {
      status,
      headers: { 'content-type': mime, ...(location ? { location } : {}) }
    });
const denied = (promise: Promise<unknown>) => expect(promise).rejects.toThrow();

describe('public customer Access gate', () => {
  it('prints exact destinations and the single Everyone bypass policy', () => {
    const manifest = buildCustomerAccessManifest();
    expect(manifest.application).toMatchObject({
      name: CUSTOMER_ACCESS_NAME,
      type: 'self_hosted',
      destinations: CUSTOMER_PUBLIC_PATHS.map(dest)
    });
    expect(manifest.policies[0]).toMatchObject({
      decision: 'bypass',
      include: [{ everyone: {} }],
      exclude: [],
      require: []
    });
  });

  it('fails closed on absent/invalid/reused IDs and app destination drift', () => {
    for (const [id, error] of [
      [undefined, /TRIAL_PUBLIC_CUSTOMER_ACCESS_APP_ID/],
      ['bad', /UUID/],
      ['fe0eb039-b3b5-4acc-b533-d33868810e89', /separate/]
    ] as const)
      expect(() => requireCustomerAccessAppId(id)).toThrow(error);
    const app = gate().app;
    expect(
      validateCustomerAccessGate({
        ...gate(),
        app: { ...app, domain: uri('/shop'), self_hosted_domains: [uri('/checkout')] }
      })
    ).toBe(true);
    for (const change of [
      { id: 'wrong' },
      { domain: host },
      { self_hosted_domains: [host] },
      { self_hosted_domains: ['*.admin-kethai.workers.dev'] },
      { destinations: [...app.destinations, dest('/*')] },
      { destinations: app.destinations.map((d, i) => (i ? d : dest('/shop-admin'))) }
    ])
      expect(() => validateCustomerAccessGate({ ...gate(), app: { ...app, ...change } })).toThrow();
  });

  it('requires one exact Everyone bypass and empty exclude/require arrays', () => {
    const policy = gate().policies[0];
    for (const change of [
      { decision: 'allow' },
      { include: [{ everyone: null }] },
      { include: [{ everyone: {}, email: { email: 'owner@example.test' } }] },
      { exclude: [{}] },
      { require: [{}] },
      { exclude: undefined },
      { require: undefined }
    ])
      expect(() =>
        validateCustomerAccessGate({ ...gate(), policies: [{ ...policy, ...change }] })
      ).toThrow();
    expect(() => validateCustomerAccessGate({ ...gate(), policies: [policy, policy] })).toThrow(
      /exactly one/
    );
  });
});

describe('anonymous customer and owner routes', () => {
  it('enumerates emitted assets and their MIME types', () => {
    expect(
      emittedPublicResourcePaths([
        '_next/static/a.js',
        '_next/static/a.css',
        '_next/static/a.woff2',
        'assets/a.png',
        'private/a.js'
      ])
    ).toEqual(
      expect.arrayContaining([
        '/_next/static/a.js',
        '/_next/static/a.css',
        '/_next/static/a.woff2',
        '/assets/a.png',
        '/manifest.webmanifest'
      ])
    );
    for (const [path, mime] of [
      ['/shop', 'text/html'],
      ['/_next/static/a.js', 'application/javascript'],
      ['/_next/static/a.css', 'text/css'],
      ['/_next/static/a.woff2', 'font/woff2'],
      ['/assets/a.png', 'image/png'],
      ['/manifest.webmanifest', 'application/manifest+json']
    ])
      expect(publicMimeForPath(path)).toBe(mime);
  });

  it('checks 200, MIME and exact emitted bytes through canonical redirects', async () => {
    const origin = `https://${host}`,
      body = Buffer.from('<main>shop</main>');
    let count = 0;
    await expect(
      assertPublicRoute(
        async () =>
          ++count === 1
            ? response(308, '', 'text/html', '/shop/')()
            : response(200, body.toString(), 'text/html; charset=utf-8')(),
        origin,
        '/shop',
        body
      )
    ).resolves.toBe(true);
    for (const [status, text, mime] of [
      [200, '<main>signin</main>', 'text/html'],
      [200, body.toString(), 'text/plain'],
      [204, '', 'text/html']
    ] as const)
      await denied(assertPublicRoute(response(status, text, mime), origin, '/shop', body));
    for (const location of [
      'https://tenant.cloudflareaccess.com',
      '/cdn-cgi/access/login',
      '/settings',
      '/shop/'
    ])
      await denied(
        assertPublicRoute(response(302, '', 'text/html', location), origin, '/shop', body)
      );
    await denied(assertPublicRoute(response(403), origin, '/checkout', body));
  });

  it('accepts the standard JavaScript MIME with the exact emitted script bytes', async () => {
    const script = 'console.log("synthetic");';
    await expect(
      assertPublicRoute(
        response(200, script, 'text/javascript'),
        `https://${host}`,
        '/_next/static/app.js',
        Buffer.from(script)
      )
    ).resolves.toBe(true);
  });

  it('keeps owner routes denied and accepts only same-origin Access or its pinned tenant', async () => {
    const origin = `https://${host}`;
    for (const route of [
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
    ])
      await expect(assertOwnerRouteDenied(response(403), origin, route)).resolves.toBe(true);
    for (const location of [
      '/cdn-cgi/access/login',
      'https://lingering-field-353a.cloudflareaccess.com/cdn-cgi/access/login'
    ])
      await expect(
        assertOwnerRouteDenied(response(302, '', 'text/html', location), origin, '/orders')
      ).resolves.toBe(true);
    for (const location of [
      'https://another.cloudflareaccess.com/cdn-cgi/access/login',
      'http://lingering-field-353a.cloudflareaccess.com/cdn-cgi/access/login',
      'https://evil.example/cdn-cgi/access/login',
      '/sign-in'
    ])
      await denied(
        assertOwnerRouteDenied(response(302, '', 'text/html', location), origin, '/orders')
      );
    await denied(assertOwnerRouteDenied(response(200), origin, '/shop-admin'));
  });
});

describe('public emitted artifacts', () => {
  it.each(['shop', 'checkout', 'status', 'lookup'])(
    'maps both %s routes to its emitted HTML',
    (page) => {
      expect(emittedArtifactPath(`/${page}`)).toBe(`${page}.html`);
      expect(emittedArtifactPath(`/${page}/`)).toBe(`${page}.html`);
    }
  );
  it('retains emitted asset filenames', () => {
    expect(emittedArtifactPath('/_next/static/chunks/app.js')).toBe('_next/static/chunks/app.js');
  });
});

describe('waiting for a new release to reach the edge (19 November 2026)', () => {
  const origin = `https://${host}`;
  const fresh = Buffer.from('<main>new build</main>');
  const page = (text: string) =>
    new Response(text, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });

  it('polls until the edge serves the emitted bytes, then passes', async () => {
    let calls = 0;
    const waits: number[] = [];
    const attempts = await waitForPublicRoute(
      async () => page(++calls < 3 ? '<main>old build</main>' : '<main>new build</main>'),
      origin,
      '/shop',
      fresh,
      { attempts: 5, delayMs: 10, sleep: async (ms: number) => void waits.push(ms) }
    );
    expect(attempts).toBe(3);
    expect(waits).toEqual([10, 10]);
  });

  it('gives up after the last attempt with the real reason', async () => {
    await expect(
      waitForPublicRoute(async () => page('<main>old build</main>'), origin, '/shop', fresh, {
        attempts: 3,
        delayMs: 0,
        sleep: async () => {}
      })
    ).rejects.toThrow('Public route body mismatch (/shop)');
  });
});
