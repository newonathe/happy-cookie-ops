"""Read-only catalog inventory in the owned local fixture; no remote targets."""
import importlib.util
import json
import hashlib
from pathlib import Path
import sys
ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/state/evidence'
spec = importlib.util.spec_from_file_location('bootstrap', ROOT / 'scripts/test-db-bootstrap.py')
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
SQL = """
select jsonb_build_object(
 'schema', (select jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl::text) from pg_namespace where nspname='public'),
 'role_privileges', (select jsonb_agg(jsonb_build_object('role',r,
 'schema_create',has_schema_privilege(r,'public','CREATE'),
 'schema_usage',has_schema_privilege(r,'public','USAGE'),
 'database_temp',has_database_privilege(r,current_database(),'TEMP')) order by r)
 from unnest(array['anon','authenticated','service_role']) r),
 'table_privileges', (select jsonb_agg(jsonb_build_object('table',c.relname,'role',r,
 'trigger',has_table_privilege(r,c.oid,'TRIGGER'),'references',has_table_privilege(r,c.oid,'REFERENCES')) order by c.relname,r)
 from pg_class c cross join unnest(array['anon','authenticated','service_role']) r
 where c.relnamespace='public'::regnamespace and c.relkind='r'),
 'functions', (select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
 'security_definer',p.prosecdef,'config',p.proconfig,'body',p.prosrc,'acl',p.proacl::text) order by p.oid::regprocedure::text)
 from pg_proc p where p.pronamespace='public'::regnamespace),
 'triggers', (select jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,
 'function',t.tgfoid::regprocedure::text,'definition',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname)
 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),
 'sequences', (select coalesce(jsonb_agg(jsonb_build_object('name',c.relname,'acl',c.relacl::text) order by c.relname),'[]'::jsonb)
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='S'));
"""
def main():
 if len(sys.argv)!=1: raise RuntimeError('No external arguments accepted')
 dest=OUT/'MP-06e-authority.json'
 report={'status':'failed','scope':'local catalog and rollback-only trigger attachment attack; no hosted acceptance','runs':[]}
 dest.write_text(json.dumps(report),encoding='utf-8')
 h.REPORT=OUT/'MP-06e-authority-bootstrap.json'
 def check(db,workdir,password,fixture):
  first=h.psql(db,workdir,SQL)
  if first!=h.psql(db,workdir,SQL): h.fail('read-only catalog not stable')
  inventory=json.loads(first)
  attacks={}
  for role in ['anon','authenticated']:
   output=h.psql(db,workdir,f"begin; set local role {role}; create trigger mp06e_probe before update on public.orders for each row execute function public.touch_updated_at(); reset role; select exists(select 1 from pg_trigger where tgname='mp06e_probe'); rollback;")
   if output.strip()!='t': h.fail('trigger attachment probe did not produce expected true evidence')
   attacks[role]={'trigger_attachment_succeeded':True}
  if h.psql(db,workdir,"select not exists(select 1 from pg_trigger where tgname='mp06e_probe');").strip()!='t': h.fail('probe trigger survived rollback')
  if h.psql(db,workdir,SQL)!=first: h.fail('probe changed authority catalog')
  inventory['rollback_only_attacks']=attacks
  report['runs'].append(inventory)
 try:
  code=h.main(after_reset=check)
  if code==0 and len(report['runs'])==2 and report['runs'][0]==report['runs'][1]:
   report.update(status='passed',resets=2,probe_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
 finally:
  dest.write_text(json.dumps(report,indent=2),encoding='utf-8',newline='\n')
 print(json.dumps({'status':report['status'],'resets':len(report['runs'])}))
 return 0 if report['status']=='passed' else 1
if __name__=='__main__': raise SystemExit(main())
