"""Disposable static-capability diagnostic, not application or BFF implementation."""
import hashlib, json, os, subprocess, tempfile
from pathlib import Path
root = Path(__file__).resolve().parents[3]
out = root / 'docs/state/evidence'
scratch = Path(tempfile.mkdtemp(prefix='happy-cookie-G1-export-', dir=root.parent))
files = subprocess.check_output(['git', 'ls-files'], cwd=root, text=True).splitlines()
inputs = [f for f in files if f.startswith(('src/', 'public/')) or
          ('/' not in f and f.endswith(('.json', '.ts', '.mjs', '.js', '.yaml')))]
omitted = []
for name in inputs:
    if name.startswith('src/app/api/') or name == 'src/middleware.ts':
        omitted.append(name)
        continue
    target = scratch / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes((root / name).read_bytes())
config = dict(output='export', reactStrictMode=True, poweredByHeader=False, turbopack=dict(root=str(root.parent)))
(scratch / 'next.config.ts').write_text('export default ' + json.dumps(config) + ';\n')
subprocess.run(['cmd.exe', '/c', 'mklink', '/J', str(scratch / 'node_modules'), str(root / 'node_modules')], check=True, capture_output=True)
env = os.environ.copy()
for key in list(env):
    if key.startswith(('SUPABASE_', 'NEXT_PUBLIC_SUPABASE_', 'SENTRY_', 'NEXT_PUBLIC_SENTRY_', 'VERCEL')):
        env.pop(key)
node = Path.home() / 'dev/happy-cookie-tools/node-v24.20.0-win-x64/node.exe'
result = subprocess.run([str(node), str(root / 'node_modules/next/dist/bin/next'), 'build'],
                        cwd=scratch, env=env, capture_output=True, text=True, encoding='utf-8', timeout=240)
(out / 'G1-export-build.txt').write_text(result.stdout + '\n' + result.stderr, encoding='utf-8')
protected = [f for f in inputs if f.startswith(('src/components/screens/', 'src/components/sheets/', 'src/components/shell/')) or f == 'src/store/engine/ops-engine.js']
same = all(hashlib.sha256((root/f).read_bytes()).digest() == hashlib.sha256((scratch/f).read_bytes()).digest() for f in protected)
report = dict(scope='static capability only; Next APIs/middleware and Sentry wrapper deliberately absent in scratch',
    source_sha=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    scratch=str(scratch), exit_code=result.returncode, omitted=omitted,
    protected_source_files=len(protected), protected_source_unchanged=same,
    html=sorted(str(p.relative_to(scratch/'out')).replace('\\', '/') for p in (scratch/'out').rglob('*.html')),
    hosted=False, auth_verified=False, hydrated_routes_verified=False)
(out / 'G1-export-result.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
raise SystemExit(result.returncode)
