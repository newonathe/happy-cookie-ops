"""MP-06.l SQL-role, active-profile and containment tests on owned local fixtures."""
import hashlib
import importlib.util
import json
import runpy
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("bootstrap", ROOT / "scripts/test-db-bootstrap.py")
h = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h)
verify_functions = runpy.run_path(str(ROOT / 'scripts/verify-function-authority.py'))['verify_functions']
SUITES = (
    ('public-catalog.sql', ('catalog_raw_read','catalog_view_update'), 'catalog boundary', 41),
    ('private-role-authority.sql', ('private_orders_select','private_stock_update'), 'private authority', 103),
    ('search-paths.sql', ('lookup_order(text,text)','drop_remaining(uuid)','settings_effective()'), 'search path shadow', 5),
    ('future-object-authority.sql', ('future_table_select','future_sequence_usage'), 'future authority', 24),
    ('auxiliary-authority.sql', ('orders_references','sequence_select','sequence_usage','sequence_update'), 'auxiliary boundary', 46),
    ('trigger-authority.sql', ('orders_trigger', 'touch_updated_at()', 'settings_touch()'), 'trigger boundary', 50),
    ('maintenance.sql', ('consume_rate_limit(text,integer,integer)', 'prune_rate_limits()', 'prune_personal_data(integer)'), 'forbidden maintenance invocation succeeded', 18),
    ('read-rpcs.sql', ('lookup_order(text,text)', 'drop_remaining(uuid)', 'settings_effective()'), 'forbidden read RPC invocation succeeded', 18),
    ('order-inserts.sql', ('orders', 'order_items'), 'forbidden order insert succeeded', 12),
    ('legacy-mutations.sql', ('sync_event_sale(jsonb)', 'update_order_state(text,timestamptz,text,text,text)'), 'legacy EXECUTE boundary missing: active_owner / ', 14),
    ('audit-writes.sql', ('audit_staff_insert',), 'forbidden audit mutation succeeded: active_owner / insert', 30),
    ('table-truncate.sql', ('settings_truncate',), 'forbidden truncate succeeded: anon / settings', 44),
    ('settings.sql', ('settings_staff_read',), 'settings visibility differs: active_helper', 84),
    ('profiles.sql', ('current_role_name_missing_active_filter',), 'profile authority differs: inactive_owner_forged_service', 17),
    ('erasure-authority.sql', ('anonymise_customer(text,text)',), 'erasure ACL boundary missing: anon', 12),
    ('flavours.sql', ('get_flavours()', 'save_flavour(text,jsonb,timestamptz)'), 'forbidden flavour call succeeded', 38),
)
CATALOG_GUARD_SQL = """
select json_build_object(
  'no_rls', coalesce((select json_agg(c.relname order by c.relname) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity), '[]'::json),
  'views', coalesce((select json_agg(c.relname order by c.relname) from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'), '[]'::json),
  'schema_grants', coalesce((select json_agg(role_name order by role_name) from unnest(array['anon','authenticated','service_role']) as role_name
    where has_schema_privilege(role_name, 'hco_private', 'USAGE,CREATE')), '[]'::json),
  'table_grants', coalesce((select json_agg(x order by x) from (
    select concat(role_name,'/',t.relname,'/',priv) as x from pg_class t
      join pg_namespace n on n.oid = t.relnamespace
      cross join unnest(array['anon','authenticated','service_role']) as role_name
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) as priv
      where n.nspname = 'hco_private' and t.relkind in ('r','p','v')
        and has_table_privilege(role_name, t.oid, priv)) q), '[]'::json)
)::text;
"""
REPORT = ROOT / "docs/state/evidence/MP-06l-security.json"
EMPTY_FIXTURES = 'select ' + ' and '.join(
    'not exists(select 1 from public.' + table + ')'
    for table in ('orders', 'order_items', 'products', 'drops', 'settings', 'rate_limits', 'profiles', 'audit_log', 'ledger_entries', 'event_sales', 'event_sale_items', 'inventory_items', 'bake_batches', 'recipes', 'recipe_ingredients', 'suppliers', 'supplier_prices', 'events', 'erasure_requests')) + " and not exists(select 1 from auth.users) and to_regnamespace('mp06f_probe') is null and to_regnamespace('mp06g_probe') is null and to_regclass('public.mp06g_future') is null and to_regclass('public.mp06g_future_id_seq') is null;"


def main():
    if len(sys.argv) != 1:
        h.fail("security fixture accepts no URLs, project refs or arguments")
    report = {"status": "failed", "scope": "Local SQL-role containment and erasure authority/effects; not JWT/API, hosted erasure or full MP-06 acceptance", "runs": [], "regressions_detected": [], "upgrade_runs": 0, "legacy_regression_diagnostics": [], "sequence_restorations": 0, "function_guard_runs": 0, "catalog_guard_runs": 0, "catalog_guard_red_runs": 0}

    def check(db_id, workdir, password, fixture_report):
        def assert_functions():
            query = (ROOT / 'tests/integration/db/schema-inventory.sql').read_text(encoding='utf-8')
            verify_functions(json.loads(h.psql(db_id, workdir, query))['functions'])
            report['function_guard_runs'] += 1
        def assert_catalog_wide():
            result = json.loads(h.psql(db_id, workdir, CATALOG_GUARD_SQL))
            if result['no_rls']:
                h.fail('catalog guard: public relation(s) without row-level security: ' + ','.join(result['no_rls']))
            if result['views'] != ['shop_drops', 'shop_products']:
                h.fail('catalog guard: unexpected public view set: ' + ','.join(result['views']))
            if result['schema_grants'] or result['table_grants']:
                h.fail('catalog guard: an API role has a privilege in hco_private')
            report['catalog_guard_runs'] += 1
        def assert_catalog_wide_red():
            # Deliberately create a public table with RLS left off; the guard must flag it, then roll back.
            probe = 'begin; create table public.mp06p_catalog_guard_probe(id integer);\n' + CATALOG_GUARD_SQL + '\nrollback;'
            result = json.loads(h.psql(db_id, workdir, probe).strip())
            if 'mp06p_catalog_guard_probe' not in result['no_rls']:
                h.fail('catalog guard failed to detect a public table without row-level security')
            report['catalog_guard_red_runs'] += 1
            # Deliberately widen hco_private to PUBLIC (not a named API role); the
            # guard must still flag it via has_schema_privilege/has_table_privilege,
            # which fold PUBLIC in, then roll back.
            probe = ('begin; grant usage on schema hco_private to public;'
                      ' grant select on hco_private.bff_sessions to public;\n'
                      + CATALOG_GUARD_SQL + '\nrollback;')
            result = json.loads(h.psql(db_id, workdir, probe).strip())
            if not result['schema_grants'] or not any('bff_sessions' in item for item in result['table_grants']):
                h.fail('catalog guard failed to detect a PUBLIC grant into hco_private')
            report['catalog_guard_red_runs'] += 1
        assert_functions()
        assert_catalog_wide_red()
        assert_catalog_wide()
        def assert_empty():
            # Every call opens a fresh connection, independent of the test transaction.
            if h.psql(db_id, workdir, EMPTY_FIXTURES).strip() != 't':
                h.fail('security fixture tables are not empty after rollback or before tests')
        def run_suite(sql, auxiliary=False):
            if not auxiliary:
                return h.psql(db_id, workdir, sql)
            state_sql = "select json_build_object('value',last_value,'called',is_called) from public.audit_log_id_seq;"
            before = json.loads(h.psql(db_id, workdir, state_sql))
            try:
                return h.psql(db_id, workdir, sql)
            finally:
                value, called = before['value'], before['called']
                if type(value) is not int or type(called) is not bool:
                    h.fail('sequence snapshot has invalid shape')
                h.psql(db_id, workdir, f"select setval('public.audit_log_id_seq',{value},{str(called).lower()});")
                if json.loads(h.psql(db_id, workdir, state_sql)) != before:
                    h.fail('owned audit sequence restoration failed')
                report['sequence_restorations'] += 1
        assert_empty()
        upgrade = (ROOT / 'tests/integration/security/profile-upgrade.sql').read_text(encoding='utf-8')
        migration = (ROOT / 'supabase/migrations/20260101001100_active_profile_authority.sql').read_text(encoding='utf-8')
        if h.psql(db_id, workdir, upgrade.replace('__ACTIVE_MIGRATION__', migration)).splitlines().count('UPGRADE|passed') != 1:
            h.fail('populated profile upgrade proof missing')
        assert_empty()
        report['upgrade_runs'] += 1
        results = []
        for filename, signatures, forbidden, expected in SUITES:
            raw_sql = (ROOT / 'tests/integration/security' / filename).read_text(encoding='utf-8')
            sql = raw_sql.replace('__FUTURE_RED_GRANT__', '').replace('__PRIVATE_RED_POLICY__', '').replace('__PRIVATE_RED_UPDATE_POLICY__', '').replace('__CATALOG_RED_POLICY__', '').replace('__CATALOG_RED_VIEW_GRANT__', '')
            for signature in signatures:
                # Failed psql closes the connection and rolls back synthetic grant/data.
                table_test = filename == 'order-inserts.sql'
                grant = 'grant insert on table public.' if table_test else 'grant execute on function public.'
                operation = signature + '_insert' if table_test else signature.split('(')[0]
                broken = sql.replace('begin;', 'begin;\n' + grant + signature + ' to anon;', 1)
                expected_error = forbidden + ': anon / ' + operation
                if filename == 'profiles.sql':
                    # Restore only the missing active filter, within the failing transaction.
                    unsafe = "create or replace function public.current_role_name() returns public.app_role language sql stable security definer set search_path='' as $$ select p.role from public.profiles p where p.id=auth.uid() $$;"
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = forbidden
                if filename == 'settings.sql':
                    unsafe = 'create policy "settings staff read" on public.settings for select using (public.is_staff());'
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = forbidden
                if filename == 'table-truncate.sql':
                    broken = sql.replace('begin;', 'begin;\ngrant truncate on public.settings to anon;', 1)
                    expected_error = forbidden
                if filename == 'audit-writes.sql':
                    unsafe = 'grant insert on public.audit_log to authenticated; create policy "audit staff insert" on public.audit_log for insert with check (public.is_staff());'
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = forbidden
                if filename == 'legacy-mutations.sql':
                    broken = sql.replace('begin;', 'begin;\ngrant execute on function public.' + signature + ' to authenticated;', 1)
                    expected_error = forbidden + signature.split('(')[0]
                if filename == 'trigger-authority.sql':
                    if signature == 'orders_trigger':
                        unsafe = 'grant trigger on public.orders to anon;'
                        expected_error = 'trigger table boundary missing: anon / orders'
                    else:
                        unsafe = 'grant execute on function public.' + signature + ' to anon;'
                        expected_error = 'trigger function boundary missing: anon / ' + signature.split('(')[0]
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                if filename == 'auxiliary-authority.sql':
                    if signature == 'orders_references':
                        unsafe = 'grant references on public.orders to anon;'
                        expected_error = 'references boundary missing: anon / orders'
                    else:
                        privilege = signature.split('_')[1]
                        unsafe = 'grant ' + privilege + ' on sequence public.audit_log_id_seq to anon;'
                        expected_error = 'sequence boundary missing: anon / ' + {'select':'read','usage':'nextval','update':'setval'}[privilege]
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                if filename == 'future-object-authority.sql':
                    if signature == 'future_table_select':
                        unsafe = 'grant select on public.mp06g_future to anon;'
                        expected_error = 'forbidden future table operation succeeded: anon / select'
                    else:
                        unsafe = 'grant usage on sequence public.mp06g_future_id_seq to anon;'
                        expected_error = 'forbidden future sequence operation succeeded: anon / nextval'
                    broken = raw_sql.replace('__FUTURE_RED_GRANT__', unsafe)
                if filename == 'private-role-authority.sql':
                    if signature == 'private_orders_select':
                        unsafe = 'alter policy "orders staff read" on public.orders using (public.is_staff());'
                        broken = raw_sql.replace('__PRIVATE_RED_POLICY__', unsafe).replace('__PRIVATE_RED_UPDATE_POLICY__', '')
                        expected_error = 'private read differs: active_helper / orders / 1'
                    else:
                        unsafe = 'alter policy "stock staff read" on public.inventory_items using (public.is_staff()); alter policy "stock staff write" on public.inventory_items using (public.is_staff()) with check (public.is_staff());'
                        broken = raw_sql.replace('__PRIVATE_RED_POLICY__', '').replace('__PRIVATE_RED_UPDATE_POLICY__', 'reset role; ' + unsafe + ' set local role authenticated;')
                        expected_error = 'private update succeeded: active_helper / inventory_items / 1'
                if filename == 'public-catalog.sql':
                    if signature == 'catalog_raw_read':
                        unsafe = 'alter policy "catalogue public read" on public.products using (active or public.is_staff());'
                        broken = raw_sql.replace('__CATALOG_RED_POLICY__', unsafe).replace('__CATALOG_RED_VIEW_GRANT__', '')
                        expected_error = 'raw visibility differs: anon'
                    else:
                        broken = raw_sql.replace('__CATALOG_RED_POLICY__', '').replace('__CATALOG_RED_VIEW_GRANT__', 'grant update on public.shop_products to anon;')
                        expected_error = 'view mutation succeeded: anon / shop_products / update'
                if filename == 'search-paths.sql':
                    unsafe = 'alter function public.' + signature + ' set search_path=public;'
                    broken = sql.replace('begin;', 'begin;\n' + unsafe, 1)
                    expected_error = 'search path shadow: ' + signature.split('(')[0]
                if filename == 'erasure-authority.sql':
                    expected_error = forbidden
                try:
                    run_suite(broken, filename == 'auxiliary-authority.sql')
                except RuntimeError as error:
                    if expected_error not in str(error):
                        raise
                    report['regressions_detected'].append(signature)
                    if filename == 'legacy-mutations.sql':
                        report['legacy_regression_diagnostics'].append(str(error))
                else:
                    h.fail('role suite failed to detect a deliberately restored unsafe grant')
                assert_empty()
            output = run_suite(sql, filename == 'auxiliary-authority.sql')
            rows = [line for line in output.splitlines() if line.startswith('SEC_RESULT|')]
            if len(rows) != expected or len(set(rows)) != expected:
                h.fail(filename + ' did not return its complete role matrix')
            results.extend(rows)
            assert_empty()
        if len(set(results)) != 556:
            h.fail('combined role matrix has missing or duplicate cases')
        assert_functions()
        assert_catalog_wide()
        h.catalog(db_id, workdir, h.sql_for(h.expected_versions()))
        report["runs"].append(sorted(results))

    h.REPORT = ROOT / "docs/state/evidence/MP-06l-bootstrap.json"
    # Replace an older pass before bootstrap preflight can fail.
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    try:
        code = h.main(after_reset=check)
        if (code == 0 and len(report["runs"]) == 2 and report["runs"][0] == report["runs"][1]
                and len(report['regressions_detected']) == 66 and report['sequence_restorations'] == 10
                and report['upgrade_runs'] == 2 and report['function_guard_runs'] == 4
                and report['catalog_guard_runs'] == 4 and report['catalog_guard_red_runs'] == 4):
            report.update(status="passed", cases_per_reset=556, resets=2, matrix_equal=True, rollback_verified=True,
                          sql_sha256={name: hashlib.sha256((ROOT / 'tests/integration/security' / name).read_bytes()).hexdigest() for name, _, _, _ in SUITES},
                          harness_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    except (RuntimeError, OSError, ValueError) as error:
        report['error'] = str(error) if isinstance(error, RuntimeError) else type(error).__name__
    finally:
        REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report.get(key) for key in ("status", "cases_per_reset", "resets")}))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
