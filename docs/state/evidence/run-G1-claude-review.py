"""Manual bounded one-shot; reviews read-only, coding has an exact file allowlist. No scheduler or billing fallback."""
import json, os, subprocess, sys
from pathlib import Path
root = Path(__file__).resolve().parents[3]
out = root / 'docs/state/evidence'
label, packet, agent_name = {'return-path-review': ('MP-08f-claude-review', 'MP-08f-claude-review-prompt.txt', 'mp08f-return-path-review'), 'return-path-code': ('MP-08f-claude-code', 'MP-08f-claude-code-prompt.txt', 'mp08f-return-path-code'), 'session-storage-preflight': ('MP-08e-claude', 'MP-08e-claude-prompt.txt', 'mp08e-preflight-review'), 'session-crypto-code': ('MP-08d-claude-code', 'MP-08d-claude-code-prompt.txt', 'mp08d-crypto-code'), 'auth-transport-code': ('MP-08c-claude-code', 'MP-08c-claude-code-prompt.txt', 'mp08c-transport-code'), 'session-handler-code': ('MP-08b-claude-code', 'MP-08b-claude-code-prompt.txt', 'mp08b-handler-code'), 'session-policy-code': ('MP-08a-claude-code', 'MP-08a-claude-code-prompt.txt', 'mp08a-policy-code'), 'catalog-tests-code': ('MP-06k-claude-code', 'MP-06k-claude-code-prompt.txt', 'mp06k-tests-code'), 'public-catalog': ('MP-06k-claude', 'MP-06k-claude-prompt.txt', 'mp06k-review'), 'private-roles': ('MP-06j-claude', 'MP-06j-claude-prompt.txt', 'mp06j-review'), 'function-guard': ('MP-06i-guard-claude', 'MP-06i-guard-claude-prompt.txt', 'mp06i-guard'), 'function-default-plan': ('MP-06i-claude', 'MP-06i-claude-prompt.txt', 'mp06i-plan'), 'search-paths': ('MP-06h-claude', 'MP-06h-claude-prompt.txt', 'mp06h-review'), 'future-tables': ('MP-06g-claude', 'MP-06g-claude-prompt.txt', 'mp06g-review'), 'auxiliary': ('MP-06f-claude', 'MP-06f-claude-prompt.txt', 'mp06f-review'), 'trigger-final': ('MP-06e-final-claude', 'MP-06e-final-claude-prompt.txt', 'mp06e-final-review'), 'authority-next': ('MP-06e-claude', 'MP-06e-claude-prompt.txt', 'mp06e-authority-review'), 'legacy': ('MP-06d-claude', 'MP-06d-claude-prompt.txt', 'mp06d-legacy-review'), 'audit': ('MP-06c5-claude', 'MP-06c5-claude-prompt.txt', 'mp06c5-audit-review'), 'truncate': ('MP-06c4-claude', 'MP-06c4-claude-prompt.txt', 'mp06c4-truncate-review'), 'settings': ('MP-06c3-claude', 'MP-06c3-claude-prompt.txt', 'mp06c3-settings-review'), 'profiles': ('MP-06c2-claude', 'MP-06c2-claude-prompt.txt', 'mp06c2-profile-review'), 'order-inserts': ('MP-06c1-claude', 'MP-06c1-claude-prompt.txt', 'mp06c1-security-review'), 'read-rpcs': ('MP-06b1-claude', 'MP-06b1-claude-prompt.txt', 'mp06b1-security-review'), 'authority': ('MP-06b-claude', 'MP-06b-claude-prompt.txt', 'mp06b-authority-review'), 'security': ('MP-06a-claude', 'MP-06a-claude-prompt.txt', 'mp06a-boundary-review'), 'types-review': ('MP-05b-claude-final', 'MP-05b-claude-final-prompt.txt', 'mp05b-final-review'), 'types': ('MP-05b-claude', 'MP-05b-claude-prompt.txt', 'mp05b-schema-map'), 'bootstrap': ('MP-05a-claude-review', 'MP-05a-claude-review-prompt.txt', 'mp05a-bootstrap-review'), 'schema': ('G1-claude', 'G1-claude-schema-prompt.txt', 'g1-schema-preflight'),
    'adapter': ('MP-04b-claude', 'MP-04b-claude-adapter-prompt.txt', 'mp04b-adapter-review')}[sys.argv[1] if len(sys.argv) > 1 else 'schema']
coding = label in ('MP-08f-claude-code', 'MP-08d-claude-code', 'MP-08c-claude-code', 'MP-06k-claude-code', 'MP-08a-claude-code', 'MP-08b-claude-code')
worker_tools = ['Read', 'Grep', 'Glob', 'Edit', 'Write'] if coding else ['Read', 'Grep', 'Glob']
allowed_tools = 'Read,Grep,Glob,Edit(tests/integration/security/public-catalog.sql)' if coding else 'Read,Grep,Glob'
if label == 'MP-08a-claude-code':
    allowed_tools = 'Read,Grep,Glob,Edit(src/lib/auth/request-policy.ts),Write(src/lib/auth/request-policy.ts)'
if label == 'MP-08b-claude-code':
    allowed_tools = 'Read,Grep,Glob,Edit(src/lib/auth/session-handler.ts),Write(src/lib/auth/session-handler.ts)'
if label == 'MP-08c-claude-code':
    allowed_tools = 'Read,Grep,Glob,Edit(src/lib/auth/supabase-auth-transport.ts),Write(src/lib/auth/supabase-auth-transport.ts)'
if label == 'MP-08d-claude-code':
    allowed_tools = 'Read,Grep,Glob,Edit(src/lib/auth/session-crypto.ts),Write(src/lib/auth/session-crypto.ts),Edit(tests/unit/session-crypto.test.ts),Write(tests/unit/session-crypto.test.ts)'
if label == 'MP-08f-claude-code':
    allowed_tools = 'Read,Grep,Glob,Edit(src/lib/auth/return-path.ts),Write(src/lib/auth/return-path.ts),Edit(src/app/sign-in/sign-in-form.tsx)'
review_effort = 'high' if label == 'MP-06c2-claude' else 'medium'
exe = str(Path.home() / '.local/bin/claude.exe')
env = os.environ.copy()
blocked = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL',
           'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
           'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL']
assert not any(env.get(k) for k in blocked), 'Provider/model override present; inspect safely before running'
auth = subprocess.run([exe, 'auth', 'status', '--json'], capture_output=True, text=True, timeout=20)
state = json.loads(auth.stdout)
safe = {k: state.get(k) for k in ['loggedIn', 'authMethod', 'apiProvider', 'subscriptionType']}
(out / (label + '-auth.json')).write_text(json.dumps(safe, indent=2), encoding='utf-8')
assert safe == dict(loggedIn=True, authMethod='claude.ai', apiProvider='firstParty', subscriptionType='pro')
env.update(CLAUDE_CODE_DISABLE_1M_CONTEXT='1', CLAUDE_CODE_DISABLE_BACKGROUND_TASKS='1')
worker = {agent_name: {'description': 'Bounded read-only G1 review',
    'prompt': 'Follow the exact bounded packet; edit only its explicitly assigned file if coding is authorized; no children.',
    'tools': worker_tools, 'disallowedTools': ['Agent'],
    'model': 'claude-sonnet-5', 'effort': review_effort, 'maxTurns': 6, 'permissionMode': 'dontAsk'}}
args = [exe, '-p', '--model', 'claude-sonnet-5', '--effort', review_effort,
        '--agent', agent_name, '--agents', json.dumps(worker),
        '--permission-mode', 'dontAsk', '--tools', ','.join(worker_tools), '--allowedTools', allowed_tools,
        '--disallowedTools', 'Agent', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
        '--setting-sources', 'project', '--no-chrome', '--no-session-persistence', '--output-format', 'json']
try:
    result = subprocess.run(args, input=(out / packet).read_text(encoding='utf-8'),
        cwd=root, env=env, text=True, encoding='utf-8', capture_output=True, timeout=180)
    stdout, stderr, code = result.stdout, result.stderr, result.returncode
except subprocess.TimeoutExpired as error:
    stdout, stderr, code = error.stdout or '', error.stderr or '', 124
for suffix, value in [('result.json', stdout), ('stderr.txt', stderr)]:
    if isinstance(value, bytes): value = value.decode('utf-8', errors='replace')
    (out / (label + '-' + suffix)).write_text(value, encoding='utf-8')
print(json.dumps({'exit_code': code, 'requested_model': 'claude-sonnet-5', 'effort': review_effort}))
raise SystemExit(code)
