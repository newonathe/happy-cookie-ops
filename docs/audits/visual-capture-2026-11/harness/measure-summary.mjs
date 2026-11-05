// Reads manifest.json and prints the measured layout problems as Markdown, for findings.md. Observations only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const rows = [];
for (const s of m.scenarios)
  for (const v of s.viewports)
    if (v.measurements)
      rows.push({
        id: s.id,
        s,
        v,
        a: JSON.parse(fs.readFileSync(path.join(root, v.measurements), 'utf8')).audit
      });
const link = (r) => `[\`${r.id}@${r.v.viewport}\`](${r.v.screenshot})`;
const out = [];
const over = rows.filter((r) => r.a.overflowX > 0);
out.push(
  `### Horizontal overflow (page wider than the viewport): ${over.length} of ${rows.length} captures`,
  ''
);
for (const r of over.slice(0, 40))
  out.push(
    `- ${link(r)}: ${r.a.overflowX}px. Widest: ${
      r.a.offenders
        .slice(0, 2)
        .map((o) => `${o.el} "${o.name.slice(0, 30)}"`)
        .join(', ') || 'not attributed'
    }`
  );
if (over.length > 40) out.push(`- ...and ${over.length - 40} more in manifest.json`);
const off = rows.filter((r) => r.a.overflowX <= 0 && r.a.offenders.length);
out.push(
  '',
  `### Elements past the viewport edge without page overflow: ${off.length} captures`,
  ''
);
for (const r of off.slice(0, 15))
  out.push(
    `- ${link(r)}: ${r.a.offenders
      .slice(0, 2)
      .map((o) => `${o.el} "${o.name.slice(0, 30)}" x=${o.x} w=${o.w}`)
      .join(', ')}`
  );
const cov = rows.filter((r) => r.a.covered.length);
const covCount = {};
for (const r of cov)
  for (const c of r.a.covered) {
    const k = `"${c.name.slice(0, 36)}" covered by "${c.by.slice(0, 30)}"`;
    (covCount[k] ??= []).push(r);
  }
out.push(
  '',
  `### Controls whose centre is covered by another element at the moment of capture: ${cov.length} captures`,
  '',
  'Scrolling can uncover them. Sticky bars are the usual cause.',
  ''
);
for (const [k, list] of Object.entries(covCount)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 25))
  out.push(`- ${k}: ${list.length} capture(s), e.g. ${link(list[0])}`);
const phone = rows.filter((r) => r.a.viewport.w < 768);
const tiny = {};
for (const r of phone)
  for (const t of r.a.smallTargets) {
    const k = `${t.name.slice(0, 40)} (${t.w}×${t.h})`;
    (tiny[k] ??= []).push(r);
  }
out.push(
  '',
  `### Touch targets under 44 px at phone widths (first 15 per capture, ${phone.length} phone captures)`,
  ''
);
for (const [k, list] of Object.entries(tiny)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 30))
  out.push(`- ${k}: ${list.length} capture(s), e.g. ${link(list[0])}`);
const low = {};
for (const r of rows)
  for (const c of r.a.lowContrast) {
    const k = `"${c.name.slice(0, 30)}" ${c.color} at ${c.fontSize}: ${c.contrast}:1`;
    (low[k] ??= []).push(r);
  }
out.push('', '### Text under WCAG AA contrast, measured against the nearest opaque background', '');
for (const [k, list] of Object.entries(low)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 25))
  out.push(`- ${k}: ${list.length} capture(s), e.g. ${link(list[0])}`);
const clip = {};
for (const r of rows)
  for (const c of r.a.clipped) {
    const k = `"${c.name.slice(0, 40)}"`;
    (clip[k] ??= []).push(r);
  }
out.push('', '### Clipped or truncated text', '');
for (const [k, list] of Object.entries(clip)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 20))
  out.push(`- ${k}: ${list.length} capture(s), e.g. ${link(list[0])}`);
const broken = rows.filter((r) => r.a.brokenImages);
out.push('', `### Broken images: ${broken.length} captures`, '');
for (const r of broken.slice(0, 15)) out.push(`- ${link(r)}`);
const errs = {};
for (const s of m.scenarios)
  for (const v of s.viewports)
    for (const e of [
      ...(v.page_errors ?? []).map((x) => 'Page error: ' + x),
      ...(v.console_errors ?? []).map((x) => 'Console: ' + x),
      ...(v.failed_requests ?? []).map((x) => 'Failed request: ' + x)
    ])
      (errs[e.slice(0, 120)] ??= []).push(`${s.id}@${v.viewport}`);
out.push('', '### Page errors, console errors and failed requests', '');
for (const [k, list] of Object.entries(errs))
  out.push(`- ${k}: ${list.length}, e.g. \`${list[0]}\``);
const dup = {};
for (const s of m.scenarios)
  for (const v of s.viewports) if (v.identical_to) (dup[v.identical_to] ??= []).push(s.state);
out.push(
  '',
  '### States pixel-identical to another state of the same view',
  '',
  'The image is stored once. Either the state does not change what is drawn, or the app cannot express the difference.',
  ''
);
for (const [k, list] of Object.entries(dup).slice(0, 80))
  out.push(`- \`${k}\` = ${[...new Set(list)].join(', ')}`);
const noH1 = rows.filter((r) => !r.a.heading).map((r) => r.id);
out.push(
  '',
  `### Captures with no visible h1: ${new Set(noH1).size} states`,
  '',
  [...new Set(noH1)]
    .slice(0, 40)
    .map((x) => `\`${x}\``)
    .join(', ')
);
process.stdout.write(out.join('\n') + '\n');
