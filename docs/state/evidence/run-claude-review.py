"""One-shot, subscription-authenticated, read-only review; no runner or scheduler."""
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[3]
evidence = root / 'docs/state/evidence'
env = os.environ.copy()
env['CLAUDE_CODE_DISABLE_1M_CONTEXT'] = '1'
args = [str(Path.home() / '.local/bin/claude.exe'), '-p', '--model', 'sonnet',
        '--effort', 'high', '--permission-mode', 'dontAsk',
        '--tools', 'Read,Grep,Glob', '--allowedTools', 'Read,Grep,Glob',
        '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--setting-sources', 'project', '--no-chrome', '--no-session-persistence',
        '--output-format', 'json']
result = subprocess.run(args, input=(evidence / 'claude-review-prompt.txt').read_text(),
                        cwd=root, env=env, text=True, encoding='utf-8',
                        capture_output=True, timeout=900)
(evidence / 'claude-review-result.json').write_text(result.stdout, encoding='utf-8')
(evidence / 'claude-review-stderr.txt').write_text(result.stderr, encoding='utf-8')
print(json.dumps({'exit_code': result.returncode, 'requested_model': 'sonnet', 'effort': 'high'}))
raise SystemExit(result.returncode)
