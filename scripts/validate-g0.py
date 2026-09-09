"""Validate current G0 continuity without rewriting historical planning evidence."""
from pathlib import Path
from graphlib import TopologicalSorter
from urllib.parse import unquote
import hashlib
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
check('manual_progress_scope', set(status['packages']) == {'MP-00', 'MP-01', 'MP-02', 'MP-03'})
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
        if rel.startswith('src/components/sheets/') and file.stem in guards:
            guard = guards[file.stem]
            check('approved_guard_once:' + rel, data.count(guard) == 1)
            data = re.sub(re.escape(guard) + rb'\r?\n', b'', data, count=1)
        check('protected_delivery_bytes:' + rel, hashlib.sha256(data).hexdigest() == entry['sha256'])
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
report = dict(scope='G0 continuity, not application readiness', checks=checks, changed_delivery_files=changes,
              generator_scratch=str(scratch), failures=[c for c in checks if not c['passed']])
(EVIDENCE / 'g0-validation.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'checks': len(checks), 'failures': report['failures'], 'changed_delivery_files': changes}, indent=2))
raise SystemExit(bool(report['failures']))
