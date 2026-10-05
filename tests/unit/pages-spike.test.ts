import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { handleApiRequest } from '../../spikes/pages/functions/api/[[path]]';
import {
  analyzeHtml,
  generatePagesHeaders,
  supabaseConnectOrigin
} from '../../scripts/pages-spike-headers.mjs';

const health = 'https://pages-spike.test/api/v1/health';

describe('Pages feasibility API fixture', () => {
  it('offers only credential-free, non-readiness liveness over GET and HEAD', async () => {
    const get = await handleApiRequest(new Request(health));
    expect(get.status).toBe(200);
    expect(get.headers.get('cache-control')).toBe('no-store');
    await expect(get.json()).resolves.toMatchObject({
      database: 'not-checked',
      auth: 'not-checked',
      readiness: false
    });

    const head = await handleApiRequest(new Request(health, { method: 'HEAD' }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('does not imply a mutation or unavailable API succeeded', async () => {
    const method = await handleApiRequest(new Request(health, { method: 'POST' }));
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET, HEAD');

    const unavailable = await handleApiRequest(
      new Request('https://pages-spike.test/api/sync', {
        method: 'POST',
        body: '{"clientId":"must-not-be-acknowledged"}'
      })
    );
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain('must-not-be-acknowledged');
  });
});

describe('Pages static header preflight', () => {
  it('hashes exact executable script text and fails closed on malformed or event-handler HTML', () => {
    expect(
      analyzeHtml(
        '<!doctype html><html><body><script> globalThis.ready = true; </script></body></html>'
      )
    ).toEqual([' globalThis.ready = true; ']);
    expect(() =>
      analyzeHtml(
        '<!doctype html><html><body><button onclick="run()">x</button><script>x()</script></body></html>'
      )
    ).toThrow(/event handler/);
    expect(() =>
      analyzeHtml(
        '<!doctype html><html><body><script src="/a.js" src="/b.js"></script><script>x()</script></body></html>'
      )
    ).toThrow(/Malformed exported HTML/);
  });

  it('rejects empty or scriptless output instead of emitting stale policy', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pages-spike-headers-'));
    const output = path.join(root, 'public');
    const template = path.join(root, '_headers');
    try {
      await mkdir(path.join(output, '_next', 'static', 'chunks'), { recursive: true });
      await writeFile(
        path.join(output, '_next', 'static', 'chunks', 'chunk-abcdef0123456789.js'),
        ''
      );
      await writeFile(
        template,
        '/*\n  Permissions-Policy: camera=()\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n'
      );
      await expect(generatePagesHeaders(output, template)).rejects.toThrow(/contains no HTML/);
      await writeFile(
        path.join(output, 'index.html'),
        '<!doctype html><html><head></head><body></body></html>'
      );
      await expect(generatePagesHeaders(output, template)).rejects.toThrow(/no inline scripts/);
      const script = ' globalThis.preflight = true; ';
      await writeFile(
        path.join(output, 'index.html'),
        `<!doctype html><html><head></head><body><script type="application/json">${script}</script></body></html>`
      );
      const result = await generatePagesHeaders(output, template);
      const hash = createHash('sha256').update(script, 'utf8').digest('base64');
      expect(result.csp).toContain(`'sha256-${hash}'`);
      await writeFile(path.join(output, '_next', 'static', 'chunks', 'checkoutpanel2026.js'), '');
      await expect(generatePagesHeaders(output, template)).rejects.toThrow(/non-fingerprinted/);
      await rm(path.join(output, '_next', 'static', 'chunks', 'checkoutpanel2026.js'));

      // Bundled fonts (src/app/fonts): every emitted name carries a content hash.
      const media = path.join(output, '_next', 'static', 'media');
      await mkdir(media, { recursive: true });
      for (const name of [
        '0123456789abcdef-s.p.woff2',
        '0123456789abcdef.p.woff2',
        '0123456789abcdef.woff2',
        'onest-latin-ext.c1b02c1a.woff2'
      ])
        await writeFile(path.join(media, name), '');
      await expect(generatePagesHeaders(output, template)).resolves.toBeDefined();
      for (const name of [
        'onest-latin.woff2',
        'onest-latin.c1b02c.woff2',
        '0123456789abcde.woff2'
      ]) {
        await writeFile(path.join(media, name), '');
        await expect(generatePagesHeaders(output, template)).rejects.toThrow(/non-fingerprinted/);
        await rm(path.join(media, name));
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

const template =
  '/*\n  Permissions-Policy: camera=()\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n';

// Exact directive values: a substring check on "connect-src 'self'" would also pass 'self' *.
function directives(csp: string) {
  return new Map(
    csp
      .split(';')
      .map((part) => part.trim().split(/\s+/))
      .map(([name, ...values]) => [name, values.join(' ')])
  );
}

async function withExport(
  html: string,
  run: (output: string, templatePath: string) => Promise<void>
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pages-spike-csp-'));
  const output = path.join(root, 'public');
  try {
    await mkdir(path.join(output, '_next', 'static', 'chunks'), { recursive: true });
    await writeFile(
      path.join(output, '_next', 'static', 'chunks', 'chunk-abcdef0123456789.js'),
      ''
    );
    await writeFile(path.join(root, '_headers'), template);
    await writeFile(path.join(output, 'index.html'), html);
    await run(output, path.join(root, '_headers'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe('Static CSP for direct Supabase (architecture A)', () => {
  const page =
    '<!doctype html><html><head></head><body><script>globalThis.ready = true;</script></body></html>';

  it('reduces NEXT_PUBLIC_SUPABASE_URL to one origin and rejects anything broader or unsafe', () => {
    expect(supabaseConnectOrigin(undefined)).toBeNull();
    expect(supabaseConnectOrigin('')).toBeNull();
    expect(supabaseConnectOrigin('https://abcdefghijklmnop.supabase.co')).toBe(
      'https://abcdefghijklmnop.supabase.co'
    );
    expect(supabaseConnectOrigin('https://abcdefghijklmnop.supabase.co/rest/v1/')).toBe(
      'https://abcdefghijklmnop.supabase.co'
    );
    expect(supabaseConnectOrigin('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
    for (const unsafe of [
      'http://abcdefghijklmnop.supabase.co',
      'wss://abcdefghijklmnop.supabase.co',
      'javascript:alert(1)',
      'https://user:pass@abcdefghijklmnop.supabase.co',
      'https://abcdefghijklmnop.supabase.co/?x=1',
      'https://abcdefghijklmnop.supabase.co/#x',
      "https://abcdefghijklmnop.supabase.co; script-src 'unsafe-inline'",
      'not a url'
    ])
      expect(() => supabaseConnectOrigin(unsafe), unsafe).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("emits form-action 'self' and connect-src 'self' only when no Supabase URL is configured", async () => {
    await withExport(page, async (output, templatePath) => {
      const result = await generatePagesHeaders(output, templatePath);
      const policy = directives(result.csp);
      expect(policy.get('form-action')).toBe("'self'");
      expect(policy.get('connect-src')).toBe("'self'");
      expect(policy.get('img-src')).toBe("'self'");
      expect(result.supabaseOrigin).toBeNull();
      expect(result.content.split(/\r?\n/).every((line) => line.length <= 2000)).toBe(true);
    });
  });

  it('adds exactly the configured Supabase origin to connect-src, with no ws/wss or wildcard source', async () => {
    await withExport(page, async (output, templatePath) => {
      const result = await generatePagesHeaders(output, templatePath, {
        supabaseUrl: 'https://abcdefghijklmnop.supabase.co/'
      });
      const policy = directives(result.csp);
      expect(policy.get('form-action')).toBe("'self'");
      expect(policy.get('connect-src')).toBe("'self' https://abcdefghijklmnop.supabase.co");
      expect(policy.get('img-src')).toBe("'self' https://abcdefghijklmnop.supabase.co");
      expect(policy.get('default-src')).toBe("'self'");
      expect(result.csp).not.toMatch(/wss?:|\*/);
      expect(result.supabaseOrigin).toBe('https://abcdefghijklmnop.supabase.co');
      const cspLine = result.content
        .split(/\r?\n/)
        .find((line) => line.includes('Content-Security-Policy:'));
      expect(cspLine?.trim()).toBe(`Content-Security-Policy: ${result.csp}`);
      expect(result.content.split(/\r?\n/).every((line) => line.length <= 2000)).toBe(true);
    });
  });

  it('refuses to emit a CSP line over the 2000-character limit', async () => {
    const scripts = Array.from(
      { length: 40 },
      (_, index) => `<script>globalThis.s${index} = ${index};</script>`
    ).join('');
    await withExport(
      `<!doctype html><html><head></head><body>${scripts}</body></html>`,
      async (output, templatePath) => {
        await expect(
          generatePagesHeaders(output, templatePath, {
            supabaseUrl: 'https://abcdefghijklmnop.supabase.co'
          })
        ).rejects.toThrow(/2000-character/);
      }
    );
  });
});
