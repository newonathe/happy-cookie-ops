-- B3a: every row-security policy calls its helper wrapped, so Postgres evaluates it once per statement and not once per row.
--
-- tests/fixtures/policies-before-58.json lists every policy in force before migration 20260101005700 (public schema, and the four
-- `shop media owner` policies on storage.objects); the harness replaces __POLICIES_BEFORE__ with that file. This suite holds the
-- database to it:
--   (c) the number of policies is the fixture's: none added, none dropped (a new policy goes into the fixture, wrapped or not)
--   (a) each policy still exists with the same command and roles, and its using / with check text, with every wrapper
--       `( SELECT is_owner() AS is_owner)` reduced back to the bare call, equals the fixture's text exactly
--   (b) no policy keeps a bare is_owner(), is_staff() or auth.uid(): after the wrapped forms are removed, none is left
-- A bare helper in a policy restates only text, so (a) alone could not tell; (b) is what the registered mutants break.
-- The text is read as Postgres prints it, with the search path the fixture was captured under.
begin;
set local search_path = "$user", public, extensions;
create temporary table policy_results (operation text, actor text, outcome text);

do $$
declare
  fixture jsonb := ('__POLICIES_BEFORE__'::jsonb) -> 'policies';
  f jsonb;
  p record;
  found_n integer;
  reduced_q text;
  reduced_w text;
  stripped text;
  helper_call constant text := '(is_owner|is_staff|auth\.uid)\s*\(';
  wrapped constant text := '\( SELECT (is_owner\(\)|is_staff\(\)|auth\.uid\(\)) AS (is_owner|is_staff|uid)\)';
begin
  select count(*) into found_n from pg_policies
   where schemaname = 'public' or (schemaname = 'storage' and tablename = 'objects' and policyname like 'shop media owner%');
  if found_n is distinct from jsonb_array_length(fixture) then
    raise exception 'policy count differs: % in force, % in the fixture', found_n, jsonb_array_length(fixture);
  end if;
  insert into policy_results values ('policy_count', 'all', 'equals_fixture');

  for f in select value from jsonb_array_elements(fixture) loop
    select * into p from pg_policies
     where schemaname = f ->> 'schemaname' and tablename = f ->> 'tablename' and policyname = f ->> 'policyname';
    if not found then
      raise exception 'policy missing: % / %', f ->> 'tablename', f ->> 'policyname';
    end if;
    if p.cmd is distinct from (f ->> 'cmd') or to_jsonb(p.roles) is distinct from (f -> 'roles') then
      raise exception 'policy command or roles differ: % / %', f ->> 'tablename', f ->> 'policyname';
    end if;
    reduced_q := regexp_replace(p.qual, wrapped, '\1', 'g');
    reduced_w := regexp_replace(p.with_check, wrapped, '\1', 'g');
    if reduced_q is distinct from (f ->> 'qual') or reduced_w is distinct from (f ->> 'with_check') then
      raise exception 'policy text differs: % / %: using % check %', f ->> 'tablename', f ->> 'policyname', p.qual, p.with_check;
    end if;
    stripped := coalesce(regexp_replace(p.qual, wrapped, '', 'g'), '') || ' ' || coalesce(regexp_replace(p.with_check, wrapped, '', 'g'), '');
    if stripped ~ helper_call then
      raise exception 'policy helper call is not wrapped: % / %', f ->> 'tablename', f ->> 'policyname';
    end if;
    insert into policy_results values (f ->> 'schemaname' || '.' || (f ->> 'tablename'), f ->> 'policyname', 'wrapped_text_unchanged');
  end loop;

  -- The check itself is not vacuous: a bare call and a wrapped call tell apart.
  if 'x = is_owner()' !~ helper_call or regexp_replace('( SELECT is_owner() AS is_owner)', wrapped, '', 'g') ~ helper_call then
    raise exception 'policy helper pattern differs';
  end if;
  insert into policy_results values ('policy_helper_pattern', 'all', 'bare_and_wrapped_told_apart');
end $$;
select 'SEC_RESULT|' || operation || '|' || actor || '|' || outcome from pg_temp.policy_results order by operation, actor;
rollback;
