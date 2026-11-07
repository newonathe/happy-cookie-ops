"""Owned local fixture callback; blocks a pack at INSERT to overlap a real swap."""
import concurrent.futures
import importlib.util
import json
from pathlib import Path
import runpy
import tempfile
import time


def run(root, psql):
    fixture = (root / 'tests/integration/security/bazaar-kitchen-journal.sql').read_text().replace('b075', 'b077').replace('p075-cookie', 'p077-source-cookie').replace('P075-PACK', 'P077-SOURCEPACK')
    fixture = fixture.replace("select 'KITCHEN_JOURNAL|passed';\nrollback;", '')
    regression = (root / 'tests/integration/security/packed-stock-identity.sql').read_text()
    output = psql(None, None, fixture + regression + '\nrollback;')
    assert 'PACKED_STOCK|passed' in output
    psql(None, None, fixture + """
      insert into public.products(id,name,short_name,price_cents,item_type,kind,published)
       values('p077-cookie','Synthetic race cookie','Race cookie',10000,'cookie','Permanent',true);
      insert into public.production_records(id,kind,product_id,qty,target,drop_no,at,payload_hash,created_by)
       values('b0774000-0000-4000-8000-000000000001','batch','p077-source-cookie',6,6,5,now(),repeat('0',64),auth.uid());
      insert into public.orders(id,customer_name,phone) values('P077-RACE','Synthetic race','09170000003');
      insert into public.order_items(order_id,product_id,qty,unit_price_cents) values('P077-RACE','p077-source-cookie',3,10000);
      create table public.hc_pack_gate(released boolean not null);
      alter table public.hc_pack_gate enable row level security;
      revoke all on public.hc_pack_gate from public,anon,authenticated,service_role;
      insert into public.hc_pack_gate values(false);
      create function public.hc_test_pack_wait() returns trigger language plpgsql security definer set search_path='' as $$
      begin
       if new.kind='pack' and new.ref='P077-RACE' then
        perform pg_advisory_xact_lock(hashtextextended('fixture:packed-stock-gate',0));
       end if;
       return new;
      end $$;
      revoke all on function public.hc_test_pack_wait() from public,anon,authenticated,service_role;
      create trigger hc_test_pack_wait before insert on public.production_records
       for each row execute function public.hc_test_pack_wait();
      commit;
    """)
    actor = "set request.jwt.claim.sub='b0770000-0000-4000-8000-000000000001';"

    def wait_for(condition):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if psql(None, None, 'select ' + condition + ';').strip() == 't':
                return
            time.sleep(.03)
        raise AssertionError('owned pack/swap synchronization deadline')

    def submit(name, statement):
        return psql(None, None, f"set application_name='{name}'; begin; " + actor +
            "do $$ begin " + statement + " perform set_config('hc_pack.outcome','saved',true); "
            "exception when sqlstate '55000' then perform set_config('hc_pack.outcome','refused',true); end $$; "
            "select current_setting('hc_pack.outcome'); commit;").strip()

    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            gate = pool.submit(psql, None, None, """
              set application_name='hc_pack_gate'; select pg_advisory_lock(hashtextextended('fixture:packed-stock-gate',0));
              do $$ declare deadline timestamptz:=clock_timestamp()+interval '12 seconds'; begin
               loop exit when (select released from public.hc_pack_gate);
                if clock_timestamp()>deadline then raise exception 'fixture gate deadline'; end if;
                perform pg_sleep(.03);
               end loop;
              end $$;
            """)
            wait_for("exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='hc_pack_gate' and l.locktype='advisory' and l.granted)")
            packed = pool.submit(submit, 'hc_pack_writer', "perform public.record_pack('P077-RACE',5);")
            wait_for("exists(select 1 from pg_stat_activity where application_name='hc_pack_writer' and wait_event='advisory')")
            swapped = pool.submit(submit, 'hc_pack_swap', "perform public.staff_swap_item('P077-RACE','p077-source-cookie','p077-cookie','b0775000-0000-4000-8000-000000000001',(select updated_at from public.orders where id='P077-RACE'));")
            # A correct swap waits on the pack identity; the old writer completes here.
            deadline = time.monotonic() + 8
            while not swapped.done():
                waiting = psql(None, None, "select exists(select 1 from pg_stat_activity where application_name='hc_pack_swap' and wait_event='advisory');").strip()
                if waiting == 't': break
                if time.monotonic() > deadline: raise AssertionError('swap did not reach pack serialization')
                time.sleep(.03)
            psql(None, None, 'update public.hc_pack_gate set released=true;')
            gate.result(timeout=15)
            assert packed.result(timeout=15) == 'saved'
            assert swapped.result(timeout=15) == 'refused', 'overlapping swap changed recorded pack identities'
        facts = psql(None, None, "select public.kitchen_cookie_balance('p077-source-cookie',5)=3 and (select product_id='p077-source-cookie' from public.order_items where order_id='P077-RACE');").strip()
        assert facts == 't', 'overlapping pack/swap duplicated kitchen cookies'
    finally:
        psql(None, None, 'update public.hc_pack_gate set released=true; drop trigger hc_test_pack_wait on public.production_records; drop function public.hc_test_pack_wait(); drop table public.hc_pack_gate;')
    print('Packed-stock identity, exact historical swap replay and held-pack concurrent swap passed.', flush=True)

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
verify = runpy.run_path(str(ROOT / "scripts/verify-function-authority.py"))["verify_functions"]


def check(db_id, workdir, _password, _report):
    inventory = (ROOT / "tests/integration/db/schema-inventory.sql").read_text(encoding="utf-8")
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])
    run(ROOT, lambda _id, _work, sql: h.psql(db_id, workdir, sql))
    verify(json.loads(h.psql(db_id, workdir, inventory))["functions"])


if __name__ == "__main__":
    h.REPORT = Path(tempfile.gettempdir()) / "hc-packed-stock-fixture.json"
    raise SystemExit(h.main(after_reset=check))
