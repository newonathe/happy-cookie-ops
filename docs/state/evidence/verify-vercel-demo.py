"""Verify this authorized demo via authenticated CLI; never expose bypass credentials."""
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[3]
evidence = root / 'docs/state/evidence'
node = Path.home() / 'dev/happy-cookie-tools/node-v24.20.0-win-x64/node.exe'
cli = Path.home() / 'AppData/Roaming/npm/node_modules/vercel/dist/vc.js'
deployment = 'happy-cookie-ops-demo-m0wbduoz7-newonathes-projects.vercel.app'
results = []
for path in ['/', '/api/health', '/api/sync']:
    args = [str(node), str(cli), 'curl', path, '--deployment', deployment,
            '--', '--silent', '--show-error',
            '--write-out', '\nSTATUS:%{http_code}\n']
    if path == '/api/sync':
        args += ['--request', 'POST', '--header', 'Content-Type: application/json', '--data', '{}']
    run = subprocess.run(args, cwd=root, text=True, encoding='utf-8',
                         capture_output=True, timeout=90)
    body, _, status = run.stdout.rpartition('\nSTATUS:')
    row = {'path': path, 'cliExit': run.returncode, 'status': status.strip()}
    if path == '/':
        row['hasBrand'] = 'Happy Cookie' in body
        row['responseBytes'] = len(body.encode())
    else:
        try:
            row['body'] = json.loads(body)
        except json.JSONDecodeError:
            row['bodyIsJson'] = False
    results.append(row)
(evidence / 'vercel-demo-probes.json').write_text(json.dumps(results, indent=2) + '\n')
print(json.dumps(results, indent=2))
passed = (all(r['cliExit'] == 0 for r in results) and results[0]['status'] == '200'
          and results[0]['hasBrand'] and results[1]['status'] == '200'
          and results[1].get('body', {}).get('database') == 'not-configured'
          and results[2]['status'].startswith(('4', '5'))
          and not results[2].get('body', {}).get('accepted'))
raise SystemExit(not passed)
