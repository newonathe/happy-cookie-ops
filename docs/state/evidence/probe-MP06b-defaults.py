"""Manual MP-06.b planning experiment; owned local fixture, all probe DDL rolls back."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/state/evidence'
spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'scripts/test-db-bootstrap.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
CATALOG = """
select jsonb_build_object(
 'current_user',current_user,'session_user',session_user,
 'defaults',(select jsonb_agg(jsonb_build_object('creator',pg_get_userbyid(d.defaclrole),
 'schema',case when d.defaclnamespace=0 then '<global>' else n.nspname end,
 'kind',d.defaclobjtype,'acl',d.defaclacl::text) order by d.defaclrole,d.defaclnamespace,d.defaclobjtype)
 from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace),
 'public_function_owners',(select jsonb_object_agg(owner,total) from
 (select pg_get_userbyid(proowner) owner,count(*) total from pg_proc where pronamespace='public'::regnamespace group by proowner) p));
"""
SQL = """
begin;
create schema mp06b_probe;
create role mp06b_probe_creator nologin;
grant mp06b_probe_creator to postgres;
grant usage,create on schema mp06b_probe to mp06b_probe_creator;
select 'ACL|baseline|'||coalesce(jsonb_agg(jsonb_build_object('schema',coalesce(n.nspname,'<global>'),'acl',d.defaclacl::text) order by d.defaclnamespace)::text,'[]') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclrole='postgres'::regrole and d.defaclobjtype='f';
create function public.mp06b_before() returns integer language sql as 'select 1';
select 'baseline_public|'||has_function_privilege('anon','public.mp06b_before()','EXECUTE');
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated;
select 'ACL|after_schema_revoke|'||coalesce(jsonb_agg(jsonb_build_object('schema',coalesce(n.nspname,'<global>'),'acl',d.defaclacl::text) order by d.defaclnamespace)::text,'[]') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclrole='postgres'::regrole and d.defaclobjtype='f';
create function public.mp06b_schema_only() returns integer language sql as 'select 1';
select 'schema_only_still_public|'||has_function_privilege('anon','public.mp06b_schema_only()','EXECUTE');
alter default privileges for role postgres revoke execute on functions from public;
select 'ACL|after_global_revoke|'||coalesce(jsonb_agg(jsonb_build_object('schema',coalesce(n.nspname,'<global>'),'acl',d.defaclacl::text) order by d.defaclnamespace)::text,'[]') from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace where d.defaclrole='postgres'::regrole and d.defaclobjtype='f';
create function public.mp06b_restricted() returns integer language sql as 'select 1';
select 'future_anon_denied|'||not has_function_privilege('anon','public.mp06b_restricted()','EXECUTE');
select 'future_authenticated_denied|'||not has_function_privilege('authenticated','public.mp06b_restricted()','EXECUTE');
select 'public_service_retained|'||has_function_privilege('service_role','public.mp06b_restricted()','EXECUTE');
select 'existing_unchanged|'||has_function_privilege('anon','public.mp06b_before()','EXECUTE');
create function mp06b_probe.other_schema() returns integer language sql as 'select 1';
select 'other_schema_affected|'||not has_function_privilege('anon','mp06b_probe.other_schema()','EXECUTE');
set local role mp06b_probe_creator;
create function mp06b_probe.other_creator() returns integer language sql as 'select 1';
reset role;
select 'other_creator_unaffected|'||has_function_privilege('anon','mp06b_probe.other_creator()','EXECUTE');
grant execute on function public.mp06b_restricted() to authenticated;
set local role authenticated;
select 'explicit_grant_callable|'||(public.mp06b_restricted()=1);
reset role;
rollback;
"""

def main():
    if len(sys.argv) != 1:
        h.fail('probe accepts no arguments or external targets')
    report = {'status':'failed','scope':'local default-privilege planning experiment; no persistent ACL migration','runs':[]}
    destination = OUT / 'MP-06b-defaults.json'
    destination.write_text(json.dumps(report)+'\n',encoding='utf-8')
    h.REPORT = OUT / 'MP-06b-defaults-bootstrap.json'
    def check(db, workdir, password, fixture):
        before = h.psql(db,workdir,CATALOG)
        output = h.psql(db,workdir,SQL)
        snapshots = [line.split('|',2) for line in output.splitlines() if line.startswith('ACL|')]
        if [row[1] for row in snapshots]!=['baseline','after_schema_revoke','after_global_revoke']:
            h.fail('missing default ACL transition snapshots')
        rows = [line for line in output.splitlines() if '|' in line and not line.startswith('ACL|')]
        if len(rows)!=9 or len(set(rows))!=9 or not all(line.endswith('|true') for line in rows):
            h.fail('default-privilege experiment did not satisfy all nine assertions: '+str(rows))
        if h.psql(db,workdir,CATALOG)!=before:
            h.fail('probe changed catalog after rollback')
        clean = h.psql(db,workdir,"select to_regnamespace('mp06b_probe') is null and not exists(select 1 from pg_roles where rolname='mp06b_probe_creator') and not exists(select 1 from pg_proc where proname like 'mp06b_%');")
        if clean.strip()!='t': h.fail('probe left synthetic objects after rollback')
        report['runs'].append({'catalog':json.loads(before),'acl_transitions':{row[1]:json.loads(row[2]) for row in snapshots},'assertions':rows,'rollback_verified':True})
    try:
        code = h.main(after_reset=check)
        if code==0 and len(report['runs'])==2 and report['runs'][0]==report['runs'][1]:
            report.update(status='passed',probe_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    finally:
        destination.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':report['status'],'resets':len(report['runs'])}))
    return 0 if report['status']=='passed' else 1

if __name__ == '__main__':
    raise SystemExit(main())
