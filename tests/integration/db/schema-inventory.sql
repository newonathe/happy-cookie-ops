-- Catalog data only. Never dump transaction rows, credentials or managed auth data.
select jsonb_build_object(
  'views', (select jsonb_agg(jsonb_build_object('name',c.relname,
      'owner',pg_get_userbyid(c.relowner),'options',c.reloptions,'acl',c.relacl::text,
      'definition',pg_get_viewdef(c.oid,true)) order by c.relname)
    from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'),
  'sequences', (select jsonb_agg(jsonb_build_object('name',c.relname,
      'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,
      'anon_usage',has_sequence_privilege('anon',c.oid,'USAGE'),
      'anon_select',has_sequence_privilege('anon',c.oid,'SELECT'),
      'anon_update',has_sequence_privilege('anon',c.oid,'UPDATE'),
      'authenticated_usage',has_sequence_privilege('authenticated',c.oid,'USAGE'),
      'authenticated_select',has_sequence_privilege('authenticated',c.oid,'SELECT'),
      'authenticated_update',has_sequence_privilege('authenticated',c.oid,'UPDATE'),
      'service_usage',has_sequence_privilege('service_role',c.oid,'USAGE'),
      'service_select',has_sequence_privilege('service_role',c.oid,'SELECT'),
      'service_update',has_sequence_privilege('service_role',c.oid,'UPDATE')) order by c.relname)
    from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='S'),
  'columns', (select jsonb_agg(to_jsonb(c) order by table_name, ordinal_position)
    from (select table_name, column_name, ordinal_position, data_type, udt_name,
      is_nullable, column_default from information_schema.columns where table_schema='public') c),
  'constraints', (select jsonb_agg(jsonb_build_object('table', r.relname, 'name', c.conname,
      'type', c.contype, 'definition', pg_get_constraintdef(c.oid)) order by r.relname, c.conname)
    from pg_constraint c join pg_class r on r.oid=c.conrelid
    join pg_namespace n on n.oid=r.relnamespace where n.nspname='public'),
  'indexes', (select jsonb_agg(to_jsonb(i) order by tablename, indexname)
    from (select tablename, indexname, indexdef from pg_indexes where schemaname='public') i),
  'table_security', (select jsonb_agg(jsonb_build_object('table', c.relname,
      'owner', pg_get_userbyid(c.relowner), 'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity)
      order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'),
  'policies', (select jsonb_agg(to_jsonb(p) order by tablename, policyname)
    from (select tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies where schemaname='public') p),
  'table_grants', (select jsonb_agg(to_jsonb(g) order by table_name, grantee, privilege_type)
    from (select table_name, grantor, grantee, privilege_type, is_grantable
      from information_schema.table_privileges where table_schema='public') g),
  'functions', (select jsonb_agg(jsonb_build_object('name', p.proname,
      'body_md5', md5(p.prosrc),
      'identity', pg_get_function_identity_arguments(p.oid), 'returns', pg_get_function_result(p.oid),
      'owner', pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef, 'config', p.proconfig,
      'execute_anon', has_function_privilege('anon',p.oid,'EXECUTE'),
      'execute_authenticated', has_function_privilege('authenticated',p.oid,'EXECUTE'),
      'execute_service_role', has_function_privilege('service_role',p.oid,'EXECUTE'),
      'acl', coalesce(p.proacl,acldefault('f',p.proowner))::text)
      order by p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'enums', (select jsonb_agg(jsonb_build_object('name', t.typname, 'label', e.enumlabel,
      'sort', e.enumsortorder) order by t.typname, e.enumsortorder)
    from pg_type t join pg_enum e on e.enumtypid=t.oid
    join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'),
  'default_privileges', (select jsonb_agg(jsonb_build_object('owner', pg_get_userbyid(d.defaclrole),
      'schema',case when d.defaclnamespace=0 then '<global>' else d.defaclnamespace::regnamespace::text end,
      'object_type', d.defaclobjtype, 'acl', d.defaclacl::text) order by d.defaclrole, d.defaclnamespace, d.defaclobjtype)
    from pg_default_acl d)
);
