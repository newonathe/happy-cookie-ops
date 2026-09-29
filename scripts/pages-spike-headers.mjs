import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const jsdomEntry = require.resolve('jsdom');
const parse5 = createRequire(jsdomEntry)('parse5');
const MAX_HEADER_LINE = 2000;

function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
  if (node.content) walk(node.content, visit);
}

function attr(node, name) {
  return node.attrs?.find((item) => item.name === name)?.value;
}

function textContent(node) {
  return (node.childNodes ?? []).map((child) => child.nodeName === '#text' ? child.value : textContent(child)).join('');
}

export function analyzeHtml(html, source = '<html>') {
  const parseErrors = [];
  const document = parse5.parse(html, { onParseError: (error) => parseErrors.push(error) });
  if (parseErrors.length) throw new Error(`Malformed exported HTML ${source}: ${parseErrors[0].code}`);
  if (!document.childNodes?.some((node) => node.nodeName === 'html')) throw new Error(`Malformed exported HTML ${source}: missing html element.`);

  const scripts = [];
  walk(document, (node) => {
    // Hash every inline script element, including import maps and data blocks:
    // this keeps the policy in sync with exact emitted HTML as script types evolve.
    if (node.tagName === 'script' && attr(node, 'src') === undefined) {
      if (attr(node, 'nonce') !== undefined) throw new Error(`Nonce-bearing inline script cannot be statically authorized: ${source}`);
      scripts.push(textContent(node));
    }
    if (node.attrs?.some(({ name }) => /^on[a-z]/i.test(name))) {
      throw new Error(`Executable event handler attribute in exported HTML ${source}.`);
    }
  });
  return scripts;
}

// Architecture A: the browser talks to Supabase directly, so connect-src is 'self' plus
// exactly the configured Supabase origin (from the same NEXT_PUBLIC_SUPABASE_URL the bundle
// inlines). No ws:/wss: source: Realtime is not used. Only the parsed origin is emitted, so a
// path, ';' or newline in the variable can never widen or inject into the policy.
// img-src takes the same value (MP-09 c2): owner-uploaded QR codes and flavour photos are served
// from the public shop-media bucket on that origin, and nothing else loads images from off-site.
export function supabaseConnectOrigin(supabaseUrl) {
  if (supabaseUrl === undefined || supabaseUrl === '') return null;
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL; refusing to emit connect-src.');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) || url.origin === 'null') {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be https:// (http:// only for a loopback host).');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must not carry credentials, a query or a fragment.');
  }
  return url.origin;
}

export async function generatePagesHeaders(publicOutput, templatePath, { supabaseUrl } = {}) {
  const supabaseOrigin = supabaseConnectOrigin(supabaseUrl);
  const htmlFiles = [];
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), relative);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) htmlFiles.push(relative);
    }
  }
  await visit(publicOutput);
  if (!htmlFiles.length) throw new Error('Pages output contains no HTML; refusing to emit cache or CSP headers.');

  const staticRoot = path.join(publicOutput, '_next', 'static');
  let staticFiles = 0;
  const indexHtml = await readFile(path.join(publicOutput, 'index.html'), 'utf8');
  const buildManifestFiles = new Map();
  async function validateStatic(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await validateStatic(path.join(directory, entry.name), relative);
      else if (entry.isFile()) {
        staticFiles++;
        const manifest = /^([A-Za-z0-9_-]{20,})\/(_buildManifest|_ssgManifest)\.js$/.exec(relative);
        if (manifest && indexHtml.includes(manifest[1])) {
          const files = buildManifestFiles.get(manifest[1]) ?? new Set();
          files.add(manifest[2]);
          buildManifestFiles.set(manifest[1], files);
        }
        const fingerprinted = /^chunks\/(?:[^/]+\/)*[^/]+[-.][a-f0-9]{16}\.js$/.test(relative) ||
          /^css\/[a-f0-9]{16}\.css$/.test(relative) ||
          /^media\/[a-f0-9]{16}-s(?:\.p)?\.woff2$/.test(relative) ||
          Boolean(manifest && indexHtml.includes(manifest[1]));
        if (!fingerprinted) throw new Error(`Refusing immutable cache policy for non-fingerprinted /_next/static/${relative}.`);
      } else throw new Error(`Unexpected non-file in /_next/static: ${relative}`);
    }
  }
  if (!(await readdir(publicOutput, { withFileTypes: true })).some((entry) => entry.name === '_next' && entry.isDirectory()) ||
      !(await readdir(staticRoot)).length) throw new Error('Pages output has no Next static assets; refusing stale immutable-cache policy.');
  await validateStatic(staticRoot);
  if (!staticFiles) throw new Error('Pages output contains no fingerprinted Next static assets.');
  for (const [buildId, files] of buildManifestFiles) {
    if (!files.has('_buildManifest') || !files.has('_ssgManifest')) {
      throw new Error(`Incomplete Next build manifest pair for ${buildId}.`);
    }
  }

  const hashes = new Set();
  let inlineScripts = 0;
  for (const relative of htmlFiles.sort()) {
    const html = await readFile(path.join(publicOutput, relative), 'utf8');
    for (const script of analyzeHtml(html, relative)) {
      inlineScripts++;
      hashes.add(`'sha256-${createHash('sha256').update(script, 'utf8').digest('base64')}'`);
    }
  }
  if (!inlineScripts) throw new Error('Pages output contains no inline scripts; refusing to emit a potentially stale CSP.');

  const connectSrc = supabaseOrigin ? `'self' ${supabaseOrigin}` : "'self'";
  const csp = `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; connect-src ${connectSrc}; img-src ${connectSrc}; script-src 'self' ${[...hashes].sort().join(' ')}; style-src 'self' 'unsafe-inline'`;
  const template = (await readFile(templatePath, 'utf8')).trimEnd();
  const headerLines = ['Content-Security-Policy: ' + csp];
  for (const line of headerLines) {
    if (line.length > MAX_HEADER_LINE) throw new Error(`Generated header exceeds Cloudflare Pages 2000-character line limit (${line.length}).`);
  }

  // Pages joins duplicate headers from matching rules. Detach the broad safe
  // default before assigning immutable caching to the fingerprinted subtree.
  if (!/^\/\*\s*\n/m.test(template) || /Cache-Control:/i.test(template) || /Content-Security-Policy:/i.test(template)) {
    throw new Error('Static header template is unexpected or contains stale cache/CSP directives.');
  }
  for (const required of ['Permissions-Policy:', 'Referrer-Policy:', 'X-Content-Type-Options:', 'X-Frame-Options:']) {
    if (!template.includes(required)) throw new Error(`Static security header template is missing ${required}`);
  }
  const generated = `${template.trimEnd()}\n  Content-Security-Policy: ${csp}\n  Cache-Control: public, max-age=0, must-revalidate\n\n/_next/static/*\n  ! Cache-Control\n  Cache-Control: public, max-age=31536000, immutable\n`;
  if (generated.split(/\r?\n/).some((line) => line.length > MAX_HEADER_LINE)) throw new Error('Generated _headers contains a line over Cloudflare Pages 2000-character limit.');
  const ruleCount = generated.split(/\r?\n/).filter((line) => line && !/^\s/.test(line) && !line.startsWith('#')).length;
  if (ruleCount > 100) throw new Error(`Generated _headers exceeds Cloudflare Pages 100-rule limit (${ruleCount}).`);
  return { content: generated, csp, supabaseOrigin, hashes: [...hashes].sort(), htmlFiles: htmlFiles.length, inlineScripts, staticFiles };
}
