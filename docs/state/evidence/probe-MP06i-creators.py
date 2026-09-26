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
 'roles',(select jsonb_agg(jsonb_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'inherit',rolinherit,'create_role',rolcreaterole,'bypass_rls',rolbypassrls) order by rolname) from pg_roles),
 'memberships',(select coalesce(jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'admin_option',admin_option) order by roleid,member),'[]'::jsonb) from pg_auth_members),
 'functions_by_schema_owner',(select jsonb_agg(jsonb_build_object('schema',nspname,'owner',owner,'count',n) order by nspname,owner) from (select ns.nspname,pg_get_userbyid(p.proowner) owner,count(*) n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname not in ('pg_catalog','information_schema') group by ns.nspname,p.proowner) f),
 'extensions',(select jsonb_agg(jsonb_build_object('name',extname,'version',extversion,'schema',extnamespace::regnamespace::text,'owner',pg_get_userbyid(extowner)) order by extname) from pg_extension),
 'defaults',(select jsonb_agg(jsonb_build_object('creator',pg_get_userbyid(defaclrole),'schema',case when defaclnamespace=0 then '<global>' else defaclnamespace::regnamespace::text end,'kind',defaclobjtype,'acl',defaclacl::text) order by defaclrole,defaclnamespace,defaclobjtype) from pg_default_acl));
"""
def main():
 if len(sys.argv)!=1: raise RuntimeError('No external arguments accepted')
 dest=OUT/'MP-06i-creators.json'
 report={'status':'failed','scope':'local creator,role,extension inventory; no managed upgrade or hosted acceptance','runs':[]}
 dest.write_text(json.dumps(report),encoding='utf-8')
 h.REPORT=OUT/'MP-06i-creators-bootstrap.json'
 def check(db,workdir,password,fixture):
  first=h.psql(db,workdir,SQL)
  if first!=h.psql(db,workdir,SQL): h.fail('read-only catalog not stable')
  inventory=json.loads(first)
  erasure = h.psql(db,workdir,'''begin;
insert into auth.users(id) values('a6f90000-0000-4000-8000-000000000001');
insert into public.profiles(id,role,display_name,active) values('a6f90000-0000-4000-8000-000000000001','owner','Synthetic',true);
insert into public.orders(id,customer_name,phone,state) values('MP06I-O','Preserve me','09170000001','Confirmed');
select set_config('request.jwt.claim.sub','a6f90000-0000-4000-8000-000000000001',true);
set local role authenticated;
do $$ begin
 begin
  perform public.anonymise_customer('09170000001','Synthetic probe');
  raise exception 'legacy erasure unexpectedly succeeded';
 exception when undefined_function then
  if sqlerrm not like '%digest%' then raise; end if;
 end;
end $$;
reset role;
select 'ERASURE|'||case when exists(select 1 from public.orders where id='MP06I-O' and customer_name='Preserve me' and phone='09170000001') and not exists(select 1 from public.erasure_requests) then '42883_rollback_preserved' else 'unexpected' end;
rollback;''')
  if 'ERASURE|42883_rollback_preserved' not in erasure.splitlines(): h.fail('legacy erasure characterization differs')
  if h.psql(db,workdir,"select not exists(select 1 from public.orders) and not exists(select 1 from public.profiles) and not exists(select 1 from auth.users) and not exists(select 1 from public.erasure_requests);").strip()!='t': h.fail('erasure probe left rows')
  inventory['erasure_probe']='42883 undefined digest; statement rollback preserved synthetic customer; all fixture rows rolled back'
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
