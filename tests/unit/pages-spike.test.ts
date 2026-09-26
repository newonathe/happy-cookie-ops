import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { handleApiRequest } from '../../spikes/pages/functions/api/[[path]]';
import { analyzeHtml, generatePagesHeaders } from '../../scripts/pages-spike-headers.mjs';

const health = 'https://pages-spike.test/api/v1/health';

describe('Pages feasibility API fixture', () => {
  it('offers only credential-free, non-readiness liveness over GET and HEAD', async () => {
    const get = await handleApiRequest(new Request(health));
    expect(get.status).toBe(200);
    expect(get.headers.get('cache-control')).toBe('no-store');
    await expect(get.json()).resolves.toMatchObject({
      database: 'not-checked', auth: 'not-checked', readiness: false
    });

    const head = await handleApiRequest(new Request(health, { method: 'HEAD' }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
  });

  it('does not imply a mutation or unavailable API succeeded', async () => {
    const method = await handleApiRequest(new Request(health, { method: 'POST' }));
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET, HEAD');

    const unavailable = await handleApiRequest(new Request('https://pages-spike.test/api/sync', {
      method: 'POST', body: '{"clientId":"must-not-be-acknowledged"}'
    }));
    expect(unavailable.status).toBe(503);
    expect(await unavailable.text()).not.toContain('must-not-be-acknowledged');
  });
});

describe('Pages static header preflight', () => {
  it('hashes exact executable script text and fails closed on malformed or event-handler HTML', () => {
    expect(analyzeHtml('<!doctype html><html><body><script> globalThis.ready = true; </script></body></html>'))
      .toEqual([' globalThis.ready = true; ']);
    expect(() => analyzeHtml('<!doctype html><html><body><button onclick="run()">x</button><script>x()</script></body></html>'))
      .toThrow(/event handler/);
    expect(() => analyzeHtml('<!doctype html><html><body><script src="/a.js" src="/b.js"></script><script>x()</script></body></html>'))
      .toThrow(/Malformed exported HTML/);
  });

  it('rejects empty or scriptless output instead of emitting stale policy', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'pages-spike-headers-'));
    const output = path.join(root, 'public');
    const template = path.join(root, '_headers');
    try {
      await mkdir(path.join(output, '_next', 'static', 'chunks'), { recursive: true });
      await writeFile(path.join(output, '_next', 'static', 'chunks', 'chunk-abcdef0123456789.js'), '');
      await writeFile(template, '/*\n  Permissions-Policy: camera=()\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n');
      await expect(generatePagesHeaders(output, template)).rejects.toThrow(/contains no HTML/);
      await writeFile(path.join(output, 'index.html'), '<!doctype html><html><head></head><body></body></html>');
      await expect(generatePagesHeaders(output, template)).rejects.toThrow(/no inline scripts/);
      const script = ' globalThis.preflight = true; ';
      await writeFile(path.join(output, 'index.html'), `<!doctype html><html><head></head><body><script type="application/json">${script}</script></body></html>`);
      const result = await generatePagesHeaders(output, template);
      const hash = createHash('sha256').update(script, 'utf8').digest('base64');
      expect(result.csp).toContain(`'sha256-${hash}'`);
      await writeFile(path.join(output, '_next', 'static', 'chunks', 'checkoutpanel2026.js'), '');
      await expect(generatePagesHeaders(output, template)).rejects.toThrow(/non-fingerprinted/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
