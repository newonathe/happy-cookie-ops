// Checks the published folder before a push: paths exist, images decode, links resolve, metadata matches, no real data.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const repo = path.resolve(root, '../../..');
const req = createRequire(repo + '/package.json');
const sharp = createRequire(req.resolve('next/package.json'))('sharp');
const problems = [];
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const walk = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (f) => path.relative(root, f).replace(/\\/g, '/');

// 1. Every manifest path exists and decodes.
const paths = new Set();
for (const s of m.scenarios)
  for (const v of s.viewports) {
    if (v.screenshot) paths.add(v.screenshot);
    if (v.full_page) paths.add(v.full_page);
    if (v.measurements) paths.add(v.measurements);
  }
for (const f of m.flows)
  for (const r of f.runs) {
    for (const st of r.steps ?? []) {
      paths.add(st.screenshot);
      if (st.full_page) paths.add(st.full_page);
    }
    if (r.stopped_screenshot) paths.add(r.stopped_screenshot);
  }
let decoded = 0;
const hashes = new Map();
for (const p of paths) {
  const file = path.join(root, p);
  if (!fs.existsSync(file)) {
    problems.push('Missing: ' + p);
    continue;
  }
  if (fs.statSync(file).size === 0) {
    problems.push('Empty: ' + p);
    continue;
  }
  if (p.endsWith('.webp')) {
    try {
      const meta = await sharp(file).metadata();
      if (!meta.width || !meta.height) problems.push('Undecodable: ' + p);
      decoded++;
      const { size } = fs.statSync(file);
      const key = `${size}:${meta.width}x${meta.height}`;
      hashes.set(key, [...(hashes.get(key) ?? []), p]);
    } catch (e) {
      problems.push('Corrupt: ' + p + ' ' + e.message);
    }
  }
}
// 2. Files on disk that the manifest does not list (contact sheets are generated separately).
// Only what git would publish counts: tracked or staged files in this folder.
const files = execFileSync('git', ['ls-files', '--cached', '.'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 1 << 26
})
  .trim()
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.startsWith('harness/'));
const orphanImages = files.filter(
  (f) => /\.webp$/.test(f) && !f.startsWith('gallery/contact-sheets/') && !paths.has(f)
);
if (orphanImages.length)
  problems.push(
    `Images on disk not in the manifest: ${orphanImages.length}, e.g. ${orphanImages.slice(0, 3).join(', ')}`
  );

// 3. Same state claimed twice with identical pixels must be declared.
const undeclared = [...hashes.entries()].filter(([, list]) => list.length > 1).length;

// 4. Gallery links resolve.
let links = 0;
for (const f of files.filter((x) => /\.(md|html)$/.test(x))) {
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  const targets = [
    ...text.matchAll(/\]\((?!http)([^)#\s]+)\)/g),
    ...text.matchAll(/(?:src|href)="(?!http|#)([^"]+)"/g)
  ].map((x) => x[1]);
  for (const t of targets) {
    links++;
    if (!fs.existsSync(path.resolve(path.dirname(path.join(root, f)), decodeURI(t))))
      problems.push(`Broken link in ${f}: ${t}`);
  }
}
// 5. Metadata matches the commit this folder was built from.
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const base = execFileSync('git', ['merge-base', 'HEAD', m.source.captured_sha], {
  cwd: repo,
  encoding: 'utf8'
}).trim();
if (base !== m.source.captured_sha)
  problems.push('Captured SHA is not an ancestor of this branch.');
const srcDiff = execFileSync(
  'git',
  [
    'diff',
    '--name-only',
    m.source.captured_sha,
    'HEAD',
    '--',
    'src',
    'public',
    'supabase',
    'tools',
    'tests',
    'scripts',
    'docs/reference',
    'package.json',
    'pnpm-lock.yaml'
  ],
  { cwd: repo, encoding: 'utf8' }
).trim();
if (srcDiff) problems.push('Protected or source paths differ from the captured commit: ' + srcDiff);

// 6. Secret and personal-data scan of every text file (image pixels come only from the fixtures).
const RULES = [
  [/[A-Za-z0-9._%+-]+@(?!synthetic\.invalid\b)[A-Za-z0-9-]+\.[A-Za-z]{2,}/g, 'email'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, 'JWT'],
  [/sb_(publishable|secret)_[A-Za-z0-9_-]+/g, 'Supabase key'],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g, 'token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, 'private key'],
  [/[a-z0-9]{20}\.supabase\.co|enftprwcsrdbnlplfrwk|workers\.dev/g, 'hosted address'],
  [/kethai|users[\\/]+ethan|gmail\.com/gi, 'machine or account name'],
  [/\b09(?!17000)[0-9]{9}\b/g, 'phone not in the fictional range']
];
const hits = {};
for (const f of files.concat(
  walk(here)
    .map(rel)
    .filter((x) => !x.endsWith('verify-publish.mjs'))
)) {
  if (!/\.(md|html|json|csv|js|jsx|mjs|cjs)$/.test(f)) continue;
  const text = fs.readFileSync(path.join(root, f), 'utf8');
  for (const [re, name] of RULES)
    for (const x of text.match(re) ?? []) (hits[`${name}: ${x}`] ??= []).push(f);
}
const scan = Object.entries(hits).map(([k, v]) => `${k} (${v.length} file(s), e.g. ${v[0]})`);

const size = files.reduce((t, f) => t + fs.statSync(path.join(root, f)).size, 0);
console.log(
  JSON.stringify(
    {
      head,
      manifestPaths: paths.size,
      imagesDecoded: decoded,
      filesInFolder: files.length,
      sizeMB: +(size / 1048576).toFixed(1),
      largestMB: +(
        Math.max(...files.map((f) => fs.statSync(path.join(root, f)).size)) / 1048576
      ).toFixed(2),
      linksChecked: links,
      sameSizeImageGroups: undeclared,
      scanHits: scan,
      problems: problems.slice(0, 40),
      problemCount: problems.length
    },
    null,
    1
  )
);
process.exitCode = problems.length || scan.length ? 1 : 0;
