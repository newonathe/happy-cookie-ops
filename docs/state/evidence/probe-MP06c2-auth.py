"""Local-only active-profile preflight; catalog metadata and rolled-back synthetic row."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'scripts/test-db-bootstrap.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
out = ROOT / 'docs/state/evidence/MP-06c2-auth-preflight.json'
h.REPORT = ROOT / 'docs/state/evidence/MP-06c2-auth-bootstrap.json'
report = {'status':'failed','runs':[]}
out.write_text(json.dumps(report),encoding='utf-8')
def inspect(db, workdir, password, fixture):
    metadata = h.psql(db,workdir,"""
    select jsonb_build_object('auth_columns',(select jsonb_agg(jsonb_build_object(
      'name',column_name,'nullable',is_nullable,'default',column_default) order by ordinal_position)
      from information_schema.columns where table_schema='auth' and table_name='users'),
      'uid_definition',pg_get_functiondef('auth.uid()'::regprocedure),
      'public_schema_acl',(select nspacl::text from pg_namespace where nspname='public'));
    """)
    h.psql(db,workdir,"""
    begin;
    insert into auth.users(id) values('a6c20000-0000-4000-8000-000000000001');
    insert into public.profiles(id,role,display_name)
      values('a6c20000-0000-4000-8000-000000000001','owner','Synthetic preflight owner');
    rollback;
    """)
    clean = h.psql(db,workdir,"select not exists(select 1 from auth.users where id='a6c20000-0000-4000-8000-000000000001') and not exists(select 1 from public.profiles);")
    if clean.strip()!='t': h.fail('preflight synthetic identity remained after rollback')
    report['runs'].append(json.loads(metadata))
try:
    code=h.main(after_reset=inspect)
    if code==0 and len(report['runs'])==2 and report['runs'][0]==report['runs'][1]:
        report.update(status='passed',rollback_verified=True)
finally:
    out.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
raise SystemExit(0 if report['status']=='passed' else 1)
