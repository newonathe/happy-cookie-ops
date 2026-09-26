-- Read-only managed-schema contract. Run ONLY through the owned local fixture.
-- Never select auth user/session/token row data or alter managed auth objects.
begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
do $$
declare required record; actual_type oid; actual_not_null boolean; pk_relation text;
begin
  if to_regclass('auth.sessions') is null or to_regclass('auth.users') is null then
    raise exception 'provider session contract: managed auth tables missing';
  end if;
  for required in
    select * from (values
      ('auth.sessions', 'id', 'uuid'::regtype::oid, true),
      ('auth.sessions', 'user_id', 'uuid'::regtype::oid, true),
      ('auth.sessions', 'not_after', 'timestamptz'::regtype::oid, false),
      ('auth.users', 'id', 'uuid'::regtype::oid, true),
      ('public.profiles', 'id', 'uuid'::regtype::oid, true),
      ('public.profiles', 'active', 'boolean'::regtype::oid, true)
    ) as requirements(relation_name, column_name, type_oid, not_null)
  loop
    select a.atttypid, a.attnotnull into actual_type, actual_not_null
      from pg_attribute a where a.attrelid=to_regclass(required.relation_name)
      and a.attname=required.column_name and a.attnum>0 and not a.attisdropped;
    if not found or actual_type is distinct from required.type_oid
        or actual_not_null is distinct from required.not_null then
      raise exception 'provider session contract: column mismatch %.%', required.relation_name, required.column_name;
    end if;
  end loop;
  for pk_relation in select * from (values ('auth.sessions'), ('auth.users'), ('public.profiles')) as relations(name)
  loop
    if not exists (
      select 1 from pg_index i join pg_attribute a on a.attrelid=i.indrelid
      where i.indrelid=to_regclass(pk_relation) and i.indisprimary and i.indisvalid
        and i.indnkeyatts=1 and a.attname='id' and a.attnum=i.indkey[0]
    ) then raise exception 'provider session contract: primary key mismatch %', pk_relation; end if;
  end loop;
end;
$$;
-- Only metadata; this does not prove session validity, provider behavior or grants safety.
select jsonb_build_object(
  'contract', 'provider-session-v1',
  'server_version_num', current_setting('server_version_num'),
  'relations', (select jsonb_agg(jsonb_build_object(
    'name', n.nspname||'.'||c.relname, 'owner',pg_get_userbyid(c.relowner),
    'rls',c.relrowsecurity,'acl',c.relacl::text) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='auth' and c.relname in ('sessions','users'))
      or (n.nspname='public' and c.relname='profiles'))
);
rollback;
