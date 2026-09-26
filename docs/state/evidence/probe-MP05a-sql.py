"""Supplemental no-network SQL replay; never claims Supabase CLI reset acceptance."""
import hashlib
import json
import os
import runpy
import secrets
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
helpers = runpy.run_path(str(ROOT / 'scripts/test-db-bootstrap.py'))
env = helpers['LOCAL_ENV'].copy()
env['POSTGRES_PASSWORD'] = secrets.token_urlsafe(24)
base = ['docker', '--host', env['DOCKER_HOST']]
report = {'scope': 'SQL-only replay; no Supabase CLI reset or auth/RLS acceptance', 'runs': []}

def command(args, sql=None, timeout=30):
    result = subprocess.run(base + args, input=sql, capture_output=True, text=True,
                            encoding='utf-8', errors='replace', env=env, timeout=timeout)
    if result.returncode:
        raise RuntimeError(helpers['safe_error'](result.stderr + result.stdout))
    return result.stdout.strip()

try:
    for cycle in range(2):
        name = 'hcb-sql-probe-' + secrets.token_hex(6)
        run = {'container': name, 'applied': [], 'cleanup': 'pending'}
        report['runs'].append(run)
        try:
            command(['run', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_PASSWORD',
                     'public.ecr.aws/supabase/postgres:15.8.1.085'])
            assert command(['inspect', '--format', '{{.HostConfig.NetworkMode}}', name]) == 'none'
            psql = ['exec', '-i', name, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-At']
            for attempt in range(30):
                try:
                    # Init briefly serves Unix sockets; wait for the final TCP listener.
                    command(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], timeout=5)
                    command(psql, 'select 1;', 5)
                    break
                except RuntimeError:
                    time.sleep(1)
            else:
                raise RuntimeError('isolated PostgreSQL did not become ready')
            for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
                print('SQL replay ' + str(cycle + 1) + ': ' + migration.name, flush=True)
                command(psql + ['--single-transaction'], migration.read_text(encoding='utf-8'))
                run['applied'].append({'file': migration.name, 'sha256': hashlib.sha256(migration.read_bytes()).hexdigest()})
            run['public_tables'] = command(psql, "select tablename from pg_tables where schemaname='public' order by tablename;").splitlines()
            run['empty_transactions'] = command(psql, 'select (select count(*) from orders)+(select count(*) from order_items)+(select count(*) from event_sales)+(select count(*) from event_sale_items)+(select count(*) from ledger_entries);') == '0'
            assert run['empty_transactions'] and len(run['applied']) == 8
            run['status'] = 'passed'
        finally:
            command(['rm', '-f', '-v', name])
            run['cleanup'] = 'passed'
    assert report['runs'][0]['public_tables'] == report['runs'][1]['public_tables']
    report['status'] = 'passed'
except (RuntimeError, AssertionError, OSError, subprocess.TimeoutExpired) as error:
    report.update(status='failed', error=str(error) if isinstance(error, RuntimeError) else type(error).__name__)
finally:
    (ROOT / 'docs/state/evidence/MP-05a-sql-probe.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'status': report['status'], 'error': report.get('error')}))
raise SystemExit(0 if report['status'] == 'passed' else 1)
