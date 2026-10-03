-- PG17 adds MAINTAIN to provider-default table grants. It bypasses RLS and is
-- unnecessary for browser roles. Keep PG15-compatible migration history and
-- leave provider-managed schemas and service-role authority unchanged.
do $$
begin
  if current_setting('server_version_num')::integer >= 170000 then
    execute 'revoke maintain on all tables in schema public from public, anon, authenticated';
  end if;
end;
$$;
