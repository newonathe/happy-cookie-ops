"""Validate current G0 continuity without rewriting historical planning evidence."""
from pathlib import Path
from graphlib import TopologicalSorter
from urllib.parse import unquote
import hashlib
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PLAN = ROOT / 'docs/master-plan'
EVIDENCE = ROOT / 'docs/state/evidence'
load = lambda p: json.loads(p.read_text(encoding='utf-8-sig'))
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
checks = []

def check(name, passed, detail=None):
    checks.append(dict(check=name, passed=bool(passed), detail=detail))

catalog = load(PLAN / 'tasks.json')
tasks = catalog['tasks']
ids = {t['id'] for t in tasks}
check('unique_task_ids', len(ids) == len(tasks))
check('known_dependencies', all(set(t['depends_on']) <= ids for t in tasks))
try:
    list(TopologicalSorter({t['id']: t['depends_on'] for t in tasks}).static_order())
    check('acyclic_dependencies', True)
except Exception as exc:
    check('acyclic_dependencies', False, str(exc))
if os.environ.get('G0_PYTHON_LIBS'):
    sys.path.insert(0, os.environ['G0_PYTHON_LIBS'])
from jsonschema import Draft202012Validator
errors = [e.message for e in Draft202012Validator(load(PLAN / 'templates/task-catalog.schema.json')).iter_errors(catalog)]
check('catalog_schema', not errors, errors)
status = load(ROOT / 'docs/state/task-status.json')
# F1 is the approved lean-plan package spanning historical MP-22/23/24.
check('manual_progress_scope', {'MP-00', 'MP-01', 'MP-02', 'MP-03'} <= set(status['packages']) <= ids | {'F1'})
check('manual_status_values', all(p['status'] in {'pending', 'in_progress', 'complete', 'blocked'} for p in status['packages'].values()))
scratch = Path(tempfile.mkdtemp(prefix='happy-cookie-catalog-'))
(scratch / 'evidence').mkdir()
generator = PLAN / 'evidence/build-task-catalog.py'
shutil.copyfile(generator, scratch / 'evidence/build-task-catalog.py')
subprocess.run([sys.executable, str(scratch / 'evidence/build-task-catalog.py')], check=True, capture_output=True)
generated = [scratch / 'tasks.json', scratch / '07-build-backlog.md', *sorted((scratch / 'prompts').glob('*.md'))]
drift = [p.relative_to(scratch).as_posix() for p in generated if p.read_text() != (PLAN / p.relative_to(scratch)).read_text()]
check('historical_generator_reproduces_catalog_and_prompts', not drift, drift)
guards = {
    'add-inv': b"  if (!sheet) throw new Error('add-inv sheet requires active sheet data.');",
    'edit-price': b"  if (!sheet) throw new Error('edit-price sheet requires active sheet data.');",
    'inv-edit': b"  if (!sheet) throw new Error('inv-edit sheet requires active sheet data.');",
    'why': b"  if (!sheet) throw new Error('why sheet requires active sheet data.');",
    'proof': b"  if (!od) throw new Error('proof sheet requires active order data.');"
}
# MP-04 live-frame exception (owner-directed 2026-09-27, docs/state/protected-exception.md):
# the exact guarded edits, reversed before the delivery-bytes check. Each must appear once.
LIVE_FRAME_REVERSALS = {
    'src/components/shell/app-frame.tsx': [
        (b"appSub, bakeFlavours, bareFrame, bakedSheet,", b"appSub, bakeFlavours, bakedSheet,"),
        (b"    <div style={bareFrame ? { minHeight: '100dvh', display: 'flex', flexDirection: 'column' } : { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 44px', gap: '12px' }}>\n      {bareFrame ? null : (\n",
         b"    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 44px', gap: '12px' }}>\n"),
        (b"      </div>\n      )}\n      {showFlowStrip ? (", b"      </div>\n      {showFlowStrip ? ("),
        (b"<div style={bareFrame ? { width: '100%', display: 'flex' } : { width: '100%', overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>",
         b"<div style={{ width: '100%', overflow: 'auto', display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>"),
    ],
    'src/components/screens/shop.tsx': [
        (b"bareFrame, dropStates, goBackOwner,", b"dropStates, goBackOwner,"),
        (b"        {bareFrame ? null : (\n", b""),
        (b"        </div>\n        )}\n        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '2px' }}>",
         b"        </div>\n        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '2px' }}>"),
    ],
    'src/components/screens/order-status.tsx': [
        (b"backToShop, bareFrame, cust,", b"backToShop, cust,"),
        (b"          {bareFrame ? null : (\n          <>\n", b""),
        (b"          </>\n          )}\n", b""),
    ],
    # "generated" is one shared field: each later approved edit that reruns --update moves
    # this tuple's left side to that day's date, still reversing to the true original.
    'scripts/port-baseline.json': [
        (b'"generated": "2026-10-05",', b'"generated": "2026-09-04",'),
        (b'"copyCount": 15,\n      "styles": 144,', b'"copyCount": 15,\n      "styles": 146,'),
    ],
}
# MP-09 c engine exception (approved 2026-09-27, applied in MP-09 c1; docs/state/protected-exception.md):
# the flavour-list swap inserted into the engine, and the allergen block appended to the generated seed.
FLAVOUR_REVERSALS = {
    'src/store/engine/ops-engine.js': [
        (b"PRODUCTS.forEach(p => { SEED_PRICES[p.id] = p.price; });\n// MP-09 c engine exception (docs/state/protected-exception.md): live mode swaps in the\n// flavour list loaded from the database. The same objects, replaced in place.\nexport const replaceFlavours = (list, allergens) => {\n  PRODUCTS.splice(0, PRODUCTS.length, ...list);\n  [P, SEED_PRICES, ALLERGENS].forEach(o => Object.keys(o).forEach(k => { delete o[k]; }));\n  PRODUCTS.forEach(p => { P[p.id] = p; SEED_PRICES[p.id] = p.price; ALLERGENS[p.id] = allergens[p.id] || ''; });\n};\n",
         b'PRODUCTS.forEach(p => { SEED_PRICES[p.id] = p.price; });\n'),
        (b"  { id: 'GoTyme', num: '\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2 7002', name: 'Francine Reyna To', qr: 'assets/qr-gotyme.png' }\n];\n// MP-09 c2 engine exception (docs/state/protected-exception.md): live mode swaps in the payment\n// methods loaded from the database. The same array, replaced in place.\nexport const replacePayAccounts = list => { PAY_ACCOUNTS.splice(0, PAY_ACCOUNTS.length, ...list); };\n",
         b"  { id: 'GoTyme', num: '\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2\xe2\x80\xa2 7002', name: 'Francine Reyna To', qr: 'assets/qr-gotyme.png' }\n];\n"),
    ],
    'supabase/seed.sql': [
        (b"('nch', 'Vanilla extract', 10, 'ml');\n\n-- allergens (MP-09 c1)\nupdate products set allergens = v.allergens from (values\n  ('dcf', 'milk, eggs, wheat, soy'),\n  ('hc', 'milk, eggs, wheat, soy'),\n  ('wcb', 'milk, eggs, wheat, soy'),\n  ('pbm', 'milk, eggs, wheat, soy, peanuts'),\n  ('rvc', 'milk, eggs, wheat, soy'),\n  ('nch', 'milk, eggs, wheat, soy, tree nuts')\n) as v (id, allergens) where products.id = v.id;\n",
         b"('nch', 'Vanilla extract', 10, 'ml');\n"),
    ],
    # MP-09 c1c form-host exception (F3, approved 2026-09-28; docs/state/protected-exception.md):
    # one import and one guarded render branch, the live-only form host later owner forms plug into.
    'src/components/shell/app-frame.tsx': [
        (b"import { EditPriceSheet } from '@/components/sheets/edit-price';\nimport { LiveFormHost } from '@/components/live/live-form-host';\n",
         b"import { EditPriceSheet } from '@/components/sheets/edit-price';\n"),
        (b"                        {sheet.isEditPrice ? <EditPriceSheet v={v} /> : null}\n                        {bareFrame && sheet.liveForm ? <LiveFormHost v={v} /> : null}\n",
         b"                        {sheet.isEditPrice ? <EditPriceSheet v={v} /> : null}\n"),
    ],
    # MP-09 c2 shop footer host (finding 16, D4; docs/state/protected-exception.md): an import and one guarded
    # branch around the ported footer, which stays verbatim as the demo branch.
    'src/components/screens/shop.tsx': [
        (b"import { Pressable } from '@/components/ui/pressable';\nimport { LiveShopFooter } from '@/components/live/live-shop-footer';\n",
         b"import { Pressable } from '@/components/ui/pressable';\n"),
        (b"        {bareFrame ? <LiveShopFooter v={v} /> : (\n        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '4px 2px 0' }}>\n          <span style={{ width: '44px'",
         b"        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '4px 2px 0' }}>\n          <span style={{ width: '44px'"),
        (b'          </span>\n        </div>\n        )}\n      </div>\n    </>\n  );\n}',
         b'          </span>\n        </div>\n      </div>\n    </>\n  );\n}'),
    ],
    # Applied after LIVE_FRAME_REVERSALS already turned this block's "styles" back to 146.
    'scripts/port-baseline.json': [
        (b'"src/components/screens/shop.tsx": {\n      "copy": "b9ed733a",\n      "copyCount": 6,\n      "styles": 49,\n      "dynamicStyles": 6,\n      "elements": 65\n    }',
         b'"src/components/screens/shop.tsx": {\n      "copy": "b9ed733a",\n      "copyCount": 6,\n      "styles": 49,\n      "dynamicStyles": 6,\n      "elements": 64\n    }'),
        (b'"src/components/shell/app-frame.tsx": {\n      "copy": "8f7ed5b6",\n      "copyCount": 15,\n      "styles": 146,\n      "dynamicStyles": 10,\n      "elements": 244',
         b'"src/components/shell/app-frame.tsx": {\n      "copy": "8f7ed5b6",\n      "copyCount": 15,\n      "styles": 146,\n      "dynamicStyles": 10,\n      "elements": 243'),
    ],
}
# B2 live checkout slot (D4, approved 2026-09-28; docs/state/protected-exception.md): one import, one destructured
# name and one guarded region in checkout.tsx, the ported "About you" to footnote markup kept verbatim as the demo branch.
CHECKOUT_REVERSALS = {
    'src/components/screens/checkout.tsx': [
        (b"import { Pressable } from '@/components/ui/pressable';\nimport { LiveCheckout } from '@/components/live/live-checkout';\n",
         b"import { Pressable } from '@/components/ui/pressable';\n"),
        (b"const { backToShop, bareFrame, cust, ic } = v;", b"const { backToShop, cust, ic } = v;"),
        (b"        {bareFrame ? <LiveCheckout v={v} /> : (\n        <>\n        <div style={{ background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '11px' }}>\n          <span style={{ fontSize: '12px', fontWeight: '700', color: '#6E574B' }}>About you</span>",
         b"        <div style={{ background: '#FFFFFF', border: '1px solid #F0E2CB', borderRadius: '18px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '11px' }}>\n          <span style={{ fontSize: '12px', fontWeight: '700', color: '#6E574B' }}>About you</span>"),
        (b"          Your slot is held once Cine verifies the payment.\n        </span>\n        </>\n        )}\n      </div>\n",
         b"          Your slot is held once Cine verifies the payment.\n        </span>\n      </div>\n"),
    ],
    'scripts/port-baseline.json': [
        (b'"src/components/screens/checkout.tsx": {\n      "copy": "16d02c0c",\n      "copyCount": 6,\n      "styles": 89,\n      "dynamicStyles": 2,\n      "elements": 101\n    }',
         b'"src/components/screens/checkout.tsx": {\n      "copy": "16d02c0c",\n      "copyCount": 6,\n      "styles": 89,\n      "dynamicStyles": 2,\n      "elements": 100\n    }'),
    ],
}
# B3 live lookup slot (approved by Ethan 2026-09-29; docs/state/protected-exception.md): one import, one destructured
# name and two guarded regions in find-my-order.tsx (the email-lookup intro, and the ported form), the ported markup
# kept verbatim as the demo branch.
LOOKUP_REVERSALS = {
    'src/components/screens/find-my-order.tsx': [
        (b"import { Pressable } from '@/components/ui/pressable';\nimport { LiveLookup } from '@/components/live/live-checkout';\n",
         b"import { Pressable } from '@/components/ui/pressable';\n"),
        (b"const { backToShop, bareFrame, ic, lookupMissed, lookupQ, runLookup, setLookupIn } = v;",
         b"const { backToShop, ic, lookupMissed, lookupQ, runLookup, setLookupIn } = v;"),
        (b"          {bareFrame ? null : (\n          <p style={{ margin: '0', maxWidth: '34ch',",
         b"          <p style={{ margin: '0', maxWidth: '34ch',"),
        (b"          </p>\n          )}\n        </div>\n        {bareFrame ? <LiveLookup v={v} /> : (\n        <form onSubmit={runLookup}",
         b"          </p>\n        </div>\n        <form onSubmit={runLookup}"),
        (b"        </form>\n        )}\n      </div>\n    </>\n",
         b"        </form>\n      </div>\n    </>\n"),
    ],
    'scripts/port-baseline.json': [
        (b'"src/components/screens/find-my-order.tsx": {\n      "copy": "74b938db",\n      "copyCount": 4,\n      "styles": 9,\n      "dynamicStyles": 0,\n      "elements": 12\n    }',
         b'"src/components/screens/find-my-order.tsx": {\n      "copy": "74b938db",\n      "copyCount": 4,\n      "styles": 9,\n      "dynamicStyles": 0,\n      "elements": 11\n    }'),
    ],
}
# F2-002: owner-approved live-only caption, exact reversal before original delivery hash.
PNL_CAPTION_REVERSALS = {
    'src/components/screens/profit-and-loss.tsx': [
        (b'      bareFrame, ic, openCategories, openExpense, pl, plCols, plExpenseDrill, plRevenueDrill, plRows, plTrend',
         b'      ic, openCategories, openExpense, pl, plCols, plExpenseDrill, plRevenueDrill, plRows, plTrend'),
        ("{bareFrame ? 'Profit · ' + pl.periodText : 'Profit · August 2026'}".encode(),
         'Profit · August 2026'.encode()),
    ],
}
# UX review proposal 3 (Ethan, 2026-10-05; docs/state/protected-exception.md): one guarded, live-only label
# under each phone-dock icon. Reversed FIRST: it turns today's app-frame baseline block back into the one
# LIVE_FRAME_REVERSALS and FLAVOUR_REVERSALS then expect.
DOCK_LABEL_REVERSALS = {
    'src/components/shell/app-frame.tsx': [
        (b"                            {bareFrame ? (\n                              <>\n                                <span style={{ position: 'relative', fontSize: '10px', fontWeight: '600', lineHeight: '1', whiteSpace: 'nowrap' }}>{d.label}</span>\n                              </>\n                            ) : null}\n",
         b""),
    ],
    'scripts/port-baseline.json': [
        (b'"copyCount": 15,\n      "styles": 145,\n      "dynamicStyles": 10,\n      "elements": 245',
         b'"copyCount": 15,\n      "styles": 144,\n      "dynamicStyles": 10,\n      "elements": 244'),
    ],
}
changes = []
for entry in load(EVIDENCE / 'delivery-manifest.json'):
    rel = entry['path']
    file = ROOT / rel
    check('delivery_file_present:' + rel, file.is_file())
    if not file.is_file():
        continue
    if digest(file) != entry['sha256']:
        changes.append(rel)
    protected = rel.startswith(('src/components/screens/', 'src/components/sheets/', 'src/components/shell/', 'docs/reference/', 'docs/master-plan/')) or rel in {'src/store/engine/ops-engine.js', 'scripts/port-baseline.json', 'supabase/seed.sql'} or rel.startswith('supabase/migrations/')
    if protected:
        data = file.read_bytes()
        if rel == 'supabase/migrations/20260101000000_init.sql':
            # DP-09: owner confirmed never applied and approved these two delimiters only.
            match = re.search(rb'create or replace function drop_remaining\(p_drop_id uuid\).*?(?=create or replace function touch_updated_at)', data, re.S)
            check('approved_bootstrap_function_present', match is not None)
            if match:
                block = match.group(0)
                check('approved_bootstrap_open_quote', len(re.findall(rb'(?m)^as \$\$\r?$', block)) == 1)
                check('approved_bootstrap_close_quote', len(re.findall(rb'(?m)^\$\$;\r?$', block)) == 1)
                restored = re.sub(rb'(?m)^as \$\$(\r?)$', rb'as $\1', block, count=1)
                restored = re.sub(rb'(?m)^\$\$;(\r?)$', rb'$;\1', restored, count=1)
                data = data[:match.start()] + restored + data[match.end():]
        if rel.startswith('src/components/sheets/') and file.stem in guards:
            guard = guards[file.stem]
            check('approved_guard_once:' + rel, data.count(guard) == 1)
            data = re.sub(re.escape(guard) + rb'\r?\n', b'', data, count=1)
        for index, (edited, original) in enumerate(DOCK_LABEL_REVERSALS.get(rel, [])):
            check(f'approved_dock_label_once:{rel}:{index}', data.count(edited) == 1)
            data = data.replace(edited, original, 1)
        for index, (edited, original) in enumerate(LIVE_FRAME_REVERSALS.get(rel, [])):
            check(f'approved_live_frame_once:{rel}:{index}', data.count(edited) == 1)
            data = data.replace(edited, original, 1)
        for index, (edited, original) in enumerate(FLAVOUR_REVERSALS.get(rel, [])):
            check(f'approved_flavour_exception_once:{rel}:{index}', data.count(edited) == 1)
            data = data.replace(edited, original, 1)
        for index, (edited, original) in enumerate(CHECKOUT_REVERSALS.get(rel, [])):
            check(f'approved_checkout_exception_once:{rel}:{index}', data.count(edited) == 1)
            data = data.replace(edited, original, 1)
        for index, (edited, original) in enumerate(LOOKUP_REVERSALS.get(rel, [])):
            check(f'approved_lookup_exception_once:{rel}:{index}', data.count(edited) == 1)
            data = data.replace(edited, original, 1)
        for index, (edited, original) in enumerate(PNL_CAPTION_REVERSALS.get(rel, [])):
            check(f'approved_pnl_caption_once:{rel}:{index}', data.count(edited) == 1)
            data = data.replace(edited, original, 1)
        check('protected_delivery_bytes:' + rel, hashlib.sha256(data).hexdigest() == entry['sha256'])
# F2 PG17 exception (Ethan, 2026-10-04): only three output-name quotes.
# This later migration is outside the original delivery inventory; restore its
# reviewed 85f6bc6 bytes independently instead of widening delivery protection.
pg17_settings = (ROOT / 'supabase/migrations/20260101002900_settings_preferences.sql').read_bytes().replace(b'\r\n', b'\n')
pg17_declarations = re.findall(rb'(?m)^returns table \([^\n]*"json_value" jsonb[^\n]*\)$', pg17_settings)
check('approved_pg17_settings_quotes_three', len(pg17_declarations) == 3)
for declaration in pg17_declarations:
    pg17_settings = pg17_settings.replace(declaration, declaration.replace(b'"json_value"', b'json_value'), 1)
check('approved_pg17_settings_original_bytes', hashlib.sha256(pg17_settings).hexdigest() == '17355ae140709be3146b993fbb22e3950c8ed410b4bf53108afebfdf793984c3')
notices = [[line for line in (ROOT / name).read_text().splitlines() if line.startswith('> **Current planning authority')] for name in ['AGENTS.md', 'CLAUDE.md']]
check('agent_authority_notices_aligned', len(notices[0]) == 1 and notices[0] == notices[1])
policy_notices = [[line for line in (ROOT / name).read_text().splitlines() if line.startswith('Shared worker policy:')] for name in ['AGENTS.md', 'CLAUDE.md']]
check('shared_worker_policy_aligned', len(policy_notices[0]) == 1 and policy_notices[0] == policy_notices[1])
broken_links = []
link_count = 0
link_sources = [ROOT / 'MASTER-PLAN.md', ROOT / 'AGENTS.md', ROOT / 'CLAUDE.md',
                *sorted((ROOT / 'docs/state').glob('*.md')),
                *sorted(PLAN.glob('*.md')), *sorted((PLAN / 'templates').glob('*.md')),
                *sorted((PLAN / 'prompts').glob('*.md'))]
for source in link_sources:
    body = re.sub(r'```.*?```', '', source.read_text(encoding='utf-8-sig'), flags=re.S)
    for target in re.findall(r'\[[^\]\n]*\]\(([^)\n]+)\)', body):
        target = target.strip().split(' "', 1)[0].strip('<>')
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):
            continue
        destination = unquote(target.split('#', 1)[0])
        if not destination:
            continue
        link_count += 1
        if not (source.parent / destination).is_file():
            broken_links.append({'source': source.relative_to(ROOT).as_posix(), 'target': target})
check('current_and_master_local_document_links', not broken_links,
      {'checked': link_count, 'broken': broken_links})
baseline_entries = [line.split('  ', 1) for line in
                    (EVIDENCE / 'docker-visual-candidate-sha256-final-20260909.txt').read_text().splitlines()
                    if line.strip()]
baseline_root = ROOT / 'tests/e2e/visual.spec.ts-snapshots'
check('accepted_docker_baseline_count', len(baseline_entries) == 75
      and len(list(baseline_root.glob('*.png'))) == 75)
check('accepted_docker_baseline_hashes', all(Path(name).name == name
      and (baseline_root / name).is_file() and digest(baseline_root / name) == expected
      for expected, name in baseline_entries))
with (ROOT / 'docs/state/state-coverage.csv').open(encoding='utf-8-sig', newline='') as handle:
    coverage = list(csv.DictReader(handle))
coverage_ids = [next(iter(row.values())) for row in coverage]
check('state_coverage_unique_70_rows', len(coverage) == 70 and len(set(coverage_ids)) == 70)
report = dict(scope='G0 continuity, not application readiness', checks=checks, changed_delivery_files=changes,
              generator_scratch=str(scratch), failures=[c for c in checks if not c['passed']])
report_name = os.environ.get('CONTINUITY_REPORT_NAME', 'g0-validation.json')
if Path(report_name).name != report_name:
    raise ValueError('Continuity report must be a filename within the evidence directory')
(EVIDENCE / report_name).write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'checks': len(checks), 'failures': report['failures'], 'changed_delivery_files': changes}, indent=2))
raise SystemExit(bool(report['failures']))
