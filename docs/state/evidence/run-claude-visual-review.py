"""Manual one-shot read-only diagnostic; no scheduler, billing fallback or agent service."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[3]
evidence = root / 'docs/state/evidence'
env = os.environ.copy()
env['CLAUDE_CODE_DISABLE_1M_CONTEXT'] = '1'
env['CLAUDE_CODE_DISABLE_BACKGROUND_TASKS'] = '1'
worker = {'visual-gate-review': {
    'description': 'Bounded read-only Docker visual gate review',
    'prompt': 'Follow the exact task packet. Read-only; no child agents. Report evidence and stop.',
    'tools': ['Read', 'Grep', 'Glob'], 'disallowedTools': ['Agent'],
    'model': 'sonnet', 'effort': 'medium', 'maxTurns': 8,
    'permissionMode': 'dontAsk',
}}
args = [str(Path.home() / '.local/bin/claude.exe'), '-p', '--model', 'sonnet',
        '--effort', 'medium', '--agent', 'visual-gate-review', '--agents', json.dumps(worker),
        '--permission-mode', 'dontAsk', '--tools', 'Read,Grep,Glob',
        '--allowedTools', 'Read,Grep,Glob', '--disallowedTools', 'Agent',
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--setting-sources', 'project', '--no-chrome', '--no-session-persistence',
        '--output-format', 'json']
try:
    result = subprocess.run(args, input=(evidence / 'claude-visual-gate-prompt.txt').read_text(),
                            cwd=root, env=env, text=True, encoding='utf-8',
                            capture_output=True, timeout=480)
    stdout, stderr, status = result.stdout, result.stderr, result.returncode
except subprocess.TimeoutExpired as error:
    stdout, stderr, status = error.stdout or '', error.stderr or '', 124
for name, value in [('result.json', stdout), ('stderr.txt', stderr)]:
    if isinstance(value, bytes):
        value = value.decode('utf-8', errors='replace')
    (evidence / ('claude-visual-gate-' + name)).write_text(value, encoding='utf-8')
print(json.dumps({'exit_code': status, 'requested_model': 'sonnet', 'effort': 'medium',
                  'status': 'partial' if status else 'finished; inspect result'}))
raise SystemExit(status)
