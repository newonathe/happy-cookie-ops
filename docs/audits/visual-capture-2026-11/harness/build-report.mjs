// Turns capture results into the published audit: copies only referenced images, writes manifest.json, coverage.csv,
// measurements, flow pages and the gallery (HTML and Markdown). Nothing is listed that was not produced by a run.
// Usage: node build-report.mjs [--crawl=<crawl.json>,<crawl2.json>] [--helper...]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENARIOS, VIEWS, VIEWPORTS, NOT_APPLICABLE } from './scenarios.mjs';
import { FLOWS } from './flows.mjs';
import { META } from './meta.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const req = createRequire(repo + '/package.json');
const sharp = createRequire(req.resolve('next/package.json'))('sharp');
const outRoot = path.resolve(here, '..');
const buildRoot = path.join(repo, 'build', process.env.CAPTURE_ROOT ?? 'visual-capture-output');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const resultsDir = path.join(buildRoot, 'results');
const results = new Map();
for (const f of fs.readdirSync(resultsDir)) {
  const r = JSON.parse(fs.readFileSync(path.join(resultsDir, f)));
  results.set(r.flow ? `flow:${r.flow}@${r.viewport}` : `${r.id}@${r.viewport}`, r);
}
const SECTIONS = ['home', 'bazaar', 'sell', 'shop', 'make', 'stock', 'money', 'account', 'other'];
const write = (rel, text) => {
  const file = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const copied = new Set();
const copy = (rel) => {
  const from = path.join(buildRoot, rel);
  const to = path.join(outRoot, rel);
  if (!fs.existsSync(from)) throw new Error('Missing image ' + rel);
  if (!copied.has(rel)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copied.add(rel);
  }
  return rel;
};
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const fixtureId = (cfg) => {
  const parts = [];
  if (cfg.data) parts.push('data:' + cfg.data);
  if (cfg.bazaar) parts.push('bazaar:' + cfg.bazaar);
  if (cfg.shopOverride) parts.push('shop:' + cfg.shopOverride);
  if (cfg.role) parts.push('role:' + cfg.role);
  if (cfg.session === false) parts.push('signed-out');
  if (cfg.rpcFail)
    parts.push(
      'fail:' +
        Object.entries(cfg.rpcFail)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
    );
  return parts.join(';') || 'default';
};

// Coverage table of the reference views, read from the repository's own checklist.
const coverageRows = new Map();
for (const line of fs
  .readFileSync(path.join(repo, 'docs/design/reference-v4/coverage.md'), 'utf8')
  .split('\n')) {
  if (!line.startsWith('|') || line.includes('---')) continue;
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length < 5 || !cells[3] || cells[1] === 'Mockup page') continue;
  for (const ref of cells[1].split(',').map((r) => r.trim()))
    coverageRows.set(ref, { location: cells[2], status: cells[3], gap: cells[4] });
}

// Crawl: what each control did at 1440 px, empty and filled.
const crawl = [];
for (const f of String(args.crawl ?? '')
  .split(',')
  .filter(Boolean))
  crawl.push(...JSON.parse(fs.readFileSync(f)));
const crawlByHeading = new Map();
for (const n of crawl) {
  const k = `${n.sig.screen}|${n.sig.h1}|${n.sig.dt}`;
  if (!crawlByHeading.has(k)) crawlByHeading.set(k, n);
}
const outcome = (o) =>
  o === undefined
    ? undefined
    : typeof o === 'string'
      ? o
      : o.stays
        ? `stays: ${o.says.join(' / ')}`
        : `to: ${o.h1 || o.dt || 'same heading'}${o.says?.length ? ` (says: ${o.says.join(' / ')})` : ''}`;

// What each control did when pressed at 1440 px, once with fields empty and once with fields filled.
if (crawl.length)
  write(
    'measurements/control-outcomes-1440.json',
    JSON.stringify(
      crawl
        .filter((n) => n.status === 'done')
        .map((n) => ({
          screen: n.sig.screen,
          heading: n.sig.h1,
          dialog: n.sig.dt || null,
          start: n.start.path,
          path: n.steps.map((st) => (st.fill ? '[fill fields]' : st.label)),
          inputs: (n.inputs ?? []).map((i) => `${i.type}: ${i.label}`),
          controls: n.controls.map((c) => ({
            label: c.label,
            disabled: c.disabled,
            empty: outcome(c.empty),
            filled: outcome(c.filled),
            writes: c.emptyWrites ?? c.filledWrites
          }))
        })),
      null,
      0
    )
  );

// ---------------------------------------------------------------- scenarios
const hashOwner = new Map();
const shotsOut = [];
const coverage = [
  [
    'entry_type',
    'id',
    'section',
    'view',
    'state',
    'viewport',
    'result',
    'reason',
    'screenshot',
    'full_page',
    'state_source',
    'fixture',
    'reference_views',
    'duplicate_of'
  ]
];
const measurementsIndex = [];
const scenarioOut = [];
for (const sc of SCENARIOS) {
  const perVp = [];
  for (const vp of sc.viewports) {
    const r = results.get(`${sc.id}@${vp}`);
    const refs = VIEWS.find((v) => v.key === `${sc.section}/${sc.view}`).refs.join(' ');
    if (!r) {
      perVp.push({ viewport: vp, result: 'not-run' });
      coverage.push([
        'state',
        `${sc.id}@${vp}`,
        sc.section,
        sc.view,
        sc.state,
        vp,
        'unverified',
        'Not run in the final capture',
        '',
        '',
        sc.stateSource,
        fixtureId(sc.config),
        refs,
        ''
      ]);
      continue;
    }
    if (r.status !== 'captured') {
      perVp.push({ viewport: vp, result: 'failed', reason: r.reason });
      coverage.push([
        'state',
        `${sc.id}@${vp}`,
        sc.section,
        sc.view,
        sc.state,
        vp,
        'failed',
        r.reason,
        '',
        '',
        sc.stateSource,
        fixtureId(sc.config),
        refs,
        ''
      ]);
      continue;
    }
    const vshot = r.shots.find((s) => s.kind === 'viewport');
    const fshot = r.shots.find((s) => s.kind === 'full');
    const ownerKey = `${vp}:${vshot.hash}`;
    const dupOf = hashOwner.get(ownerKey);
    let shotPath = '';
    let fullPath = '';
    if (dupOf) {
      shotPath = dupOf.path;
      fullPath = dupOf.full;
    } else {
      shotPath = copy(vshot.path);
      fullPath = fshot ? copy(fshot.path) : '';
      hashOwner.set(ownerKey, { path: shotPath, full: fullPath, id: `${sc.id}@${vp}` });
    }
    const m = `measurements/${sc.section}/${sc.view}/${sc.state}/${vp}.json`;
    if (!dupOf) {
      write(
        m,
        JSON.stringify(
          {
            id: `${sc.id}@${vp}`,
            viewport: { w: r.width, h: r.height },
            engine: r.engine,
            audit: r.audit,
            keyElements: r.measures,
            inputs: r.inputs
          },
          null,
          1
        )
      );
      measurementsIndex.push(m);
    }
    perVp.push({
      viewport: vp,
      width: r.width,
      height: r.height,
      engine: r.engine,
      result: sc.unverified ? 'unverified' : dupOf ? 'identical-to-other-state' : 'captured',
      reason: sc.unverified ?? null,
      identical_to: dupOf?.id ?? null,
      screenshot: shotPath,
      full_page: fullPath || null,
      measurements: dupOf ? null : m,
      overflow_x: r.audit.overflowX,
      small_targets: r.audit.smallTargetCount,
      covered_controls: r.audit.covered.length,
      low_contrast: r.audit.lowContrastCount,
      broken_images: r.audit.brokenImages,
      heading: r.audit.heading,
      page_errors: r.log.pageErrors,
      console_errors: r.log.consoleErrors,
      failed_requests: r.log.failedRequests,
      simulated_writes: r.writes,
      unhandled_rpc: [...new Set(r.unhandled ?? [])]
    });
    coverage.push([
      'state',
      `${sc.id}@${vp}`,
      sc.section,
      sc.view,
      sc.state,
      vp,
      sc.unverified
        ? 'unverified'
        : dupOf
          ? 'captured (pixel-identical to another state)'
          : 'captured',
      sc.unverified ?? '',
      shotPath,
      fullPath,
      sc.stateSource,
      fixtureId(sc.config),
      refs,
      dupOf?.id ?? ''
    ]);
    shotsOut.push({
      section: sc.section,
      view: sc.view,
      state: sc.state,
      vp,
      path: shotPath,
      full: fullPath,
      group: sc.group,
      dup: !!dupOf
    });
  }
  scenarioOut.push({
    id: sc.id,
    section: sc.section,
    view: sc.view,
    state: sc.state,
    group: sc.group,
    route: sc.path ?? null,
    state_source: sc.stateSource,
    fixture: fixtureId(sc.config),
    entry_steps: sc.steps.map(stepWords),
    motion: sc.motion ?? 'no-preference',
    reduced_transparency: !!sc.transparency,
    engine: sc.engine ?? 'chromium',
    note: sc.note,
    viewports: perVp
  });
}
function stepWords(st) {
  if (typeof st === 'string') return `Press "${st}"`;
  if (st instanceof RegExp) return `Press control matching ${st.source}`;
  if (st.click)
    return `Press ${st.click instanceof RegExp ? 'control matching ' + st.click.source : '"' + st.click + '"'}${st.idx ? ' (#' + (st.idx + 1) + ')' : ''}`;
  if (st.tryClick)
    return `Press if offered: ${st.tryClick instanceof RegExp ? st.tryClick.source : st.tryClick}`;
  if (st.fill !== undefined) return `Type "${st.value}" in ${st.fill}`;
  if (st.fillRole) return `Type "${st.value}" in ${st.name}`;
  if (st.select) return `Choose in ${st.select}`;
  if (st.check) return `Tick ${st.check}`;
  if (st.fillAll) return 'Fill every empty field with fictional values';
  if (st.fail)
    return `Simulated server: ${Object.entries(st.fail)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`;
  if (st.clearFail) return 'Simulated server: back to normal';
  if (st.offline !== undefined) return st.offline ? 'Browser goes offline' : 'Browser back online';
  if (st.key) return `Press key ${st.key}${st.times > 1 ? ' ×' + st.times : ''}`;
  if (st.hover) return `Hover "${st.hover}"`;
  if (st.press) return `Hold pointer on "${st.press}"`;
  if (st.clock) return `Clock moved to ${st.clock}`;
  if (st.goto) return `Open address ${st.goto}`;
  if (st.reload) return 'Reload the page';
  if (st.setState) return 'Inject engine state (test bridge)';
  if (st.inject) return 'Injected script (see harness)';
  if (st.wait) return `Wait ${st.wait} ms`;
  return JSON.stringify(st).slice(0, 80);
}

// ---------------------------------------------------------------- views
const viewOut = VIEWS.map((v) => {
  const states = scenarioOut.filter((s) => s.section === v.section && s.view === v.view);
  const first = states.flatMap((s) => s.viewports).find((p) => p.heading);
  const firstRes = states
    .map((s) => results.get(`${s.id}@d1440`) ?? results.get(`${s.id}@p390`))
    .find(Boolean);
  const heading = firstRes?.audit?.heading ?? first?.heading ?? '';
  const screen = v.path ? v.path.replace(/^\//, '') || 'today' : '';
  const node = crawl.find(
    (n) => n.sig.h1 === heading && !n.sig.dt && (n.sig.screen === screen || n.start.path === v.path)
  );
  const controls = firstRes?.controls ?? [];
  const seen = new Set();
  const controlList = controls
    .filter((c) => !c.rail)
    .map((c) => {
      const rec = node?.controls.find((x) => x.label === c.label && x.idx === c.idx);
      return {
        label: c.label,
        tag: c.tag,
        disabled: c.disabled,
        outcome_empty: outcome(rec?.empty),
        outcome_filled: outcome(rec?.filled)
      };
    })
    .filter((c) => {
      const k = c.label;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const parent = v.steps?.length
    ? 'Reached from: ' + (v.path ?? '') + ' → ' + v.steps.map(stepWords).join(' → ')
    : null;
  const captured = states.flatMap((s) => s.viewports).filter((p) => p.result === 'captured').length;
  const failed = states.flatMap((s) =>
    s.viewports
      .filter((p) => p.result === 'failed')
      .map((p) => `${s.state}@${p.viewport}: ${p.reason}`)
  );
  return {
    id: v.key,
    section: v.section,
    title: v.title,
    route: v.path ?? null,
    source_component: v.source,
    other_sources: v.extraSources ?? [],
    controller: v.controller ?? 'src/store/ops-runtime.tsx (wiring) and engine',
    required_role: v.role,
    parent,
    entry_action: v.steps?.length
      ? v.steps.map(stepWords)
      : ['Open the address directly or use the section navigation'],
    primary_view: !!v.primary,
    drawn_by_old_ported_screen: !!v.oldScreen,
    discovered_from_code_not_in_reference: !!v.discovered,
    reference_views: v.refs,
    controls: controlList,
    inputs: firstRes?.inputs ?? [],
    crawl_matched: !!node,
    business_rules: META.rules[v.key] ?? META.sectionRules[v.section] ?? [],
    note: v.note ?? '',
    expected_states: states.map((s) => s.state),
    viewports: [...new Set(states.flatMap((s) => s.viewports.map((p) => p.viewport)))],
    states: states.map((s) => s.id),
    images_captured: captured,
    failed_or_unreachable: failed,
    evidence_limits: META.viewLimits[v.key] ?? []
  };
});

// ---------------------------------------------------------------- flows
const flowsOut = [];
for (const fl of FLOWS) {
  const runs = [];
  for (const vp of fl.viewports) {
    const r = results.get(`flow:${fl.id}@${vp}`);
    if (!r) {
      runs.push({ viewport: vp, result: 'not-run' });
      coverage.push([
        'flow',
        `${fl.id}@${vp}`,
        fl.section,
        fl.id,
        '',
        vp,
        'unverified',
        'Not run',
        '',
        '',
        'ui-driven',
        fixtureId(fl.config ?? {}),
        '',
        ''
      ]);
      continue;
    }
    const steps = r.steps
      .filter((st) => st.shots)
      .map((st) => {
        const v = st.shots.find((x) => x.kind === 'viewport');
        const f = st.shots.find((x) => x.kind === 'full');
        return {
          n: st.n,
          name: st.name,
          note: st.note,
          url: st.url,
          screen: st.screen,
          h1: st.h1,
          alerts: st.alerts,
          writes_so_far: st.writes,
          screenshot: copy(v.path),
          full_page: f ? copy(f.path) : null,
          hash: v.hash,
          overflow_x: st.audit.overflowX
        };
      });
    const skipped = r.steps.filter((st) => !st.shots).map((st) => st.note);
    let stopped = null;
    if (r.stoppedAt) stopped = copy(r.stoppedAt.path);
    runs.push({
      viewport: vp,
      result: r.status,
      reason: r.reason ?? null,
      stopped_screenshot: stopped,
      steps,
      optional_steps_not_available: skipped,
      writes: r.writes,
      page_errors: r.log.pageErrors,
      console_errors: r.log.consoleErrors
    });
    coverage.push([
      'flow',
      `${fl.id}@${vp}`,
      fl.section,
      fl.id,
      '',
      vp,
      r.status === 'captured'
        ? skipped.length
          ? 'captured, with optional steps unavailable'
          : 'captured'
        : 'partial',
      r.reason ?? skipped.join(' | ').slice(0, 300),
      '',
      '',
      'ui-driven',
      fixtureId(fl.config ?? {}),
      '',
      ''
    ]);
  }
  flowsOut.push({
    id: fl.id,
    title: fl.title,
    section: fl.section,
    start: fl.path,
    fixture: fixtureId(fl.config ?? {}),
    runs
  });
  const md = [
    `# Flow: ${fl.title}`,
    '',
    `**ACTUAL application.** Started at \`${fl.path}\`, fixture \`${fixtureId(fl.config ?? {})}\`, simulated server. See [the README](../../README.md).`,
    ''
  ];
  for (const run of runs) {
    md.push(
      `## ${run.viewport} (${VIEWPORTS[run.viewport].w}×${VIEWPORTS[run.viewport].h}): ${run.result}`,
      ''
    );
    if (run.reason) md.push(`Stopped: ${run.reason}`, '');
    if (run.stopped_screenshot)
      md.push(`Where it stopped: [screenshot](../../${run.stopped_screenshot})`, '');
    if (run.optional_steps_not_available?.length)
      md.push(
        `Controls the flow looked for and did not find here: ${run.optional_steps_not_available.length}. Listed in manifest.json.`,
        ''
      );
    for (const st of run.steps ?? []) {
      md.push(
        `### ${st.n}. ${st.name}${st.note ? `: ${st.note}` : ''}`,
        '',
        `\`${st.url}\` · heading: ${st.h1 ?? 'none'}${st.alerts?.length ? ` · says: ${st.alerts.join(' / ')}` : ''}`,
        '',
        `![${st.name} at ${run.viewport}](../../${st.screenshot})`,
        ''
      );
      if (st.full_page) md.push(`[Full page](../../${st.full_page})`, '');
    }
  }
  write(`flows/${fl.id}/README.md`, md.join('\n'));
}

// ---------------------------------------------------------------- reference map
const refMap = [...coverageRows.keys(), ...NOT_APPLICABLE.map((n) => n.ref)]
  .filter((r, i, a) => a.indexOf(r) === i)
  .filter((r) => META.referenceViews.includes(r))
  .map((ref) => {
    const views = VIEWS.filter((v) => v.refs.includes(ref));
    const row = coverageRows.get(ref) ?? {};
    const na = NOT_APPLICABLE.find((n) => n.ref === ref);
    const noPage = META.noPage[ref];
    const states = scenarioOut.filter((s) =>
      views.some((v) => v.section === s.section && v.view === s.view)
    );
    const images = states.flatMap((s) => s.viewports).filter((p) => p.result === 'captured').length;
    return {
      reference_view: ref,
      section: META.refSection[ref],
      implementation: views.map((v) => ({ view: v.id ?? v.key, source: v.source })),
      repository_status: row.status ?? null,
      repository_gap: (row.gap ?? '').replace(/Ethan to decide/g, 'Open decision') || null,
      capture: na
        ? 'not-applicable'
        : noPage
          ? 'unavailable'
          : META.notReached[ref]
            ? 'unverified'
            : images
              ? 'captured'
              : 'failed',
      images,
      why_not_applicable: na?.why ?? noPage ?? META.notReached[ref] ?? null,
      nearest_view_only: !!noPage
    };
  });
const missingRefs = META.referenceViews.filter((r) => !refMap.some((m) => m.reference_view === r));
for (const ref of missingRefs) {
  const views = VIEWS.filter((v) => v.refs.includes(ref));
  const na = NOT_APPLICABLE.find((n) => n.ref === ref);
  refMap.push({
    reference_view: ref,
    section: META.refSection[ref],
    implementation: views.map((v) => ({ view: v.key, source: v.source })),
    repository_status: null,
    repository_gap: null,
    capture: na ? 'not-applicable' : views.length ? 'captured' : 'failed',
    images: 0,
    why_not_applicable: na?.why ?? null
  });
}
for (const r of refMap)
  coverage.push([
    'reference',
    r.reference_view,
    r.section,
    r.implementation.map((i) => i.view).join(' '),
    '',
    '',
    r.capture,
    r.why_not_applicable ?? r.repository_gap ?? '',
    '',
    '',
    '',
    '',
    r.reference_view,
    ''
  ]);

// ---------------------------------------------------------------- manifest
const uniqueImages = copied.size;
const flowsDone = flowsOut.reduce(
  (t, f) => t + f.runs.reduce((a, r) => a + (r.steps?.length ?? 0), 0),
  0
);
write(
  'manifest.json',
  JSON.stringify(
    {
      label:
        'ACTUAL application capture. Reference mockups and proposed designs are not in this folder.',
      source: META.source,
      environment: META.environment,
      viewports: VIEWPORTS,
      totals: {
        views: viewOut.length,
        state_scenarios: scenarioOut.length,
        images_in_folder: uniqueImages,
        flows: flowsOut.length,
        flow_steps_saved: flowsDone,
        reference_views: refMap.length
      },
      reference_views: refMap,
      views: viewOut,
      scenarios: scenarioOut,
      flows: flowsOut,
      unreachable: META.unreachable,
      measurements: measurementsIndex
    },
    null,
    1
  )
);
for (const u of META.unreachable)
  coverage.push(['limit', u.state, '', '', '', '', 'unverified', u.why, '', '', '', '', '', '']);
write('coverage.csv', coverage.map((row) => row.map(csv).join(',')).join('\n') + '\n');

// ---------------------------------------------------------------- gallery (Markdown renders on GitHub; HTML works from a checkout or Pages)
const VP_ORDER = Object.keys(VIEWPORTS);
const bySection = Object.fromEntries(
  SECTIONS.map((s) => [s, VIEWS.filter((v) => v.section === s)])
);
const statesOf = (v) => scenarioOut.filter((s) => s.section === v.section && s.view === v.view);
const mdIndex = [
  '# Gallery',
  '',
  '**ACTUAL application screens.** Fictional data on a simulated server. Open a section, then a view. [README](../README.md) · [Manifest](../manifest.json) · [Coverage](../coverage.csv)',
  '',
  '| Section | Views | Contact sheet |',
  '| --- | --- | --- |'
];
const htmlIndex = [];
for (const section of SECTIONS) {
  const views = bySection[section];
  if (!views.length) continue;
  mdIndex.push(
    `| [${section}](${section}/README.md) | ${views.length} | [sheet](contact-sheets/${section}-desktop.webp) · [phone](contact-sheets/${section}-phone.webp) |`
  );
  const sec = [
    `# ${section}`,
    '',
    '**ACTUAL application.** [Back to the gallery](../README.md)',
    '',
    '| View | Reference | States | Source |',
    '| --- | --- | --- | --- |'
  ];
  const htmlViews = [];
  for (const v of views) {
    const sts = statesOf(v);
    sec.push(
      `| [${v.title}](${v.view}.md) | ${v.refs.join(', ') || 'found in code'} | ${sts.length} | \`${v.source}\` |`
    );
    const page = [
      `# ${v.title}`,
      '',
      `**ACTUAL application.** [Back to ${section}](README.md)`,
      '',
      `- Manifest id: \`${v.key}\``,
      `- Source: \`${v.source}\``,
      `- Role: ${v.role}`,
      `- Reference views: ${v.refs.join(', ') || 'none (found in code)'}`,
      ...(v.oldScreen ? ['- Drawn by an old ported screen, not the refined live interface.'] : []),
      ...(v.note ? [`- Note: ${v.note}`] : []),
      ''
    ];
    const htmlStates = [];
    for (const s of sts) {
      page.push(
        `## ${s.state}`,
        '',
        `${s.note ? s.note + ' ' : ''}Group: ${s.group}. Fixture: \`${s.fixture}\`. How it was reached: ${s.state_source}.`,
        ''
      );
      const cards = [];
      for (const p of [...s.viewports].sort(
        (a, b) => VP_ORDER.indexOf(a.viewport) - VP_ORDER.indexOf(b.viewport)
      )) {
        if (!p.screenshot) {
          page.push(`- **${p.viewport}: ${p.result}.** ${p.reason ?? ''}`);
          cards.push(`<p class="bad">${p.viewport}: ${p.result}. ${esc(p.reason ?? '')}</p>`);
          continue;
        }
        const dup = p.identical_to ? ` (pixel-identical to \`${p.identical_to}\`)` : '';
        page.push(
          `**${p.viewport}** ${VIEWPORTS[p.viewport].w}×${VIEWPORTS[p.viewport].h}${dup}${p.full_page ? ` · [full page](../../${p.full_page})` : ''}`,
          '',
          `![${v.title} ${s.state} ${p.viewport}](../../${p.screenshot})`,
          ''
        );
        cards.push(
          `<figure><a href="../${p.full_page ?? p.screenshot}"><img loading="lazy" src="../${p.screenshot}" alt="${esc(v.title + ' ' + s.state + ' ' + p.viewport)}"></a><figcaption>${p.viewport}${dup ? ' (identical to another state)' : ''}${p.full_page ? ' · opens full page' : ''}</figcaption></figure>`
        );
      }
      htmlStates.push(
        `<h4 id="${esc(v.view + '-' + s.state)}">${esc(s.state)} <small>${esc(s.group)} · ${esc(s.fixture)}</small></h4>${s.note ? `<p>${esc(s.note)}</p>` : ''}<div class="row">${cards.join('')}</div>`
      );
    }
    write(`gallery/${section}/${v.view}.md`, page.join('\n'));
    htmlViews.push(
      `<section><h3>${esc(v.title)}</h3><p><code>${esc(v.source)}</code>${v.refs.length ? ' · reference: ' + esc(v.refs.join(', ')) : ' · found in code'}${v.oldScreen ? ' · <b>old ported screen</b>' : ''}</p>${htmlStates.join('')}</section>`
    );
  }
  write(`gallery/${section}/README.md`, sec.join('\n'));
  write(
    `gallery/${section}.html`,
    html(
      `${section} · ACTUAL app`,
      `<p class="tag">ACTUAL application · fictional data · simulated server</p><p><a href="index.html">All sections</a></p><h1>${section}</h1>${htmlViews.join('')}`
    )
  );
  htmlIndex.push(
    `<li><a href="${section}.html">${section}</a> (${views.length} views) · <a href="contact-sheets/${section}-desktop.webp">desktop sheet</a> · <a href="contact-sheets/${section}-phone.webp">phone sheet</a></li>`
  );
}
mdIndex.push(
  '',
  '## Journeys',
  '',
  ...flowsOut.map((f) => `- [${f.title}](../flows/${f.id}/README.md)`)
);
write('gallery/README.md', mdIndex.join('\n'));
write(
  'gallery/index.html',
  html(
    'Happy Cookie actual-app capture',
    `<p class="tag">ACTUAL application · fictional data · simulated server</p><h1>Happy Cookie: actual-app capture</h1><p>Source commit <code>${META.source.captured_sha}</code>.</p><ul>${htmlIndex.join('')}</ul><h2>Journeys</h2><ul>${flowsOut.map((f) => `<li><a href="../flows/${f.id}/README.md">${esc(f.title)}</a></li>`).join('')}</ul>`
  )
);

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
function html(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>
body{font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1500px;padding:16px;color:#222;background:#fff}
.tag{display:inline-block;background:#222;color:#fff;padding:2px 10px;border-radius:4px;font-size:13px}
.row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
figure{margin:0;border:1px solid #ccc;border-radius:6px;padding:6px;max-width:100%}
figure img{display:block;max-height:420px;max-width:100%;height:auto}
figcaption{font-size:12px;color:#555;padding-top:4px}
section{border-top:2px solid #ddd;margin-top:24px}
small{color:#666;font-weight:400}.bad{color:#b00020}code{font-size:13px}
</style></head><body>${body}</body></html>`;
}

// Contact sheets
fs.mkdirSync(path.join(outRoot, 'gallery/contact-sheets'), { recursive: true });
for (const section of SECTIONS) {
  for (const [name, vp, tw] of [
    ['desktop', 'd1440', 360],
    ['phone', 'p390', 195]
  ]) {
    const picks = [];
    for (const v of bySection[section]) {
      const st = statesOf(v).find((s) =>
        s.viewports.some((p) => p.viewport === vp && p.screenshot)
      );
      const p = st?.viewports.find((x) => x.viewport === vp && x.screenshot);
      if (p)
        picks.push({ file: path.join(outRoot, p.screenshot), label: `${v.title} · ${st.state}` });
    }
    if (!picks.length) continue;
    const cols = name === 'desktop' ? 4 : 8;
    const th = name === 'desktop' ? 225 : 422;
    const labelH = 34;
    const rows = Math.ceil(picks.length / cols);
    const comp = [];
    for (let i = 0; i < picks.length; i++) {
      const x = (i % cols) * (tw + 10) + 10;
      const y = Math.floor(i / cols) * (th + labelH + 10) + 10;
      const img = await sharp(picks[i].file)
        .resize({ width: tw, height: th, fit: 'contain', position: 'top', background: '#eeeeee' })
        .png()
        .toBuffer();
      comp.push({ input: img, left: x, top: y });
      const text = esc(
        picks[i].label.length > (name === 'desktop' ? 50 : 26)
          ? picks[i].label.slice(0, name === 'desktop' ? 49 : 25) + '…'
          : picks[i].label
      );
      comp.push({
        input: Buffer.from(
          `<svg width="${tw}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><text x="0" y="20" font-family="Arial" font-size="13" fill="#222">${text}</text></svg>`
        ),
        left: x,
        top: y + th
      });
    }
    await sharp({
      create: {
        width: cols * (tw + 10) + 10,
        height: rows * (th + labelH + 10) + 10,
        channels: 3,
        background: '#ffffff'
      }
    })
      .composite(comp)
      .webp({ quality: 78 })
      .toFile(path.join(outRoot, `gallery/contact-sheets/${section}-${name}.webp`));
  }
}
console.log(
  JSON.stringify({
    views: viewOut.length,
    scenarios: scenarioOut.length,
    images: uniqueImages,
    flowSteps: flowsDone,
    refs: refMap.length,
    refsByCapture: refMap.reduce((a, r) => ((a[r.capture] = (a[r.capture] ?? 0) + 1), a), {})
  })
);
