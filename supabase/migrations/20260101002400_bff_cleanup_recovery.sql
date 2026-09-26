begin;

create or replace function public.bff_session_save_cleanup_rotation(
  p_session_hash text,
  p_refresh_fence bigint,
  p_user_id uuid,
  p_provider_session_id uuid,
  p_credentials_version integer,
  p_next_credentials_version integer,
  p_credential_envelope text
) returns table (p_saved_credentials_version integer)
language plpgsql security definer set search_path = '' as $$
begin
  if p_session_hash is null or pg_catalog.length(p_session_hash) <> 64
      or not (p_session_hash operator(pg_catalog.~) '^[a-f0-9]{64}$')
      or p_refresh_fence is null or p_refresh_fence < 0
      or p_user_id is null or p_provider_session_id is null
      or p_credentials_version is null or p_credentials_version < 0
      or p_next_credentials_version is null or p_next_credentials_version < 0
      or p_next_credentials_version::bigint <> p_credentials_version::bigint + 1
      or p_credential_envelope is null
      or pg_catalog.octet_length(p_credential_envelope) not between 1 and 90000 then
    return;
  end if;

  return query
  update hco_private.bff_sessions as stored
  set credential_envelope = p_credential_envelope,
    credentials_version = p_next_credentials_version
  where stored.session_hash = p_session_hash
    and stored.state = 'revoked' and stored.cleanup_state = 'pending'
    and stored.refresh_fence = p_refresh_fence
    and stored.credentials_version = p_credentials_version
    and stored.user_id = p_user_id
    and stored.provider_session_id = p_provider_session_id
  returning stored.credentials_version;
end;
$$;

create or replace function public.bff_session_complete_if_provider_absent(
  p_session_hash text,
  p_refresh_fence bigint,
  p_user_id uuid,
  p_provider_session_id uuid
) returns table (p_completed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_auth_user uuid;
begin
  if p_session_hash is null or pg_catalog.length(p_session_hash) <> 64
      or not (p_session_hash operator(pg_catalog.~) '^[a-f0-9]{64}$')
      or p_refresh_fence is null or p_refresh_fence < 0
      or p_user_id is null or p_provider_session_id is null then
    return;
  end if;

  perform 1 from hco_private.bff_sessions as stored
  where stored.session_hash = p_session_hash
    and stored.state = 'revoked' and stored.cleanup_state = 'pending'
    and stored.refresh_fence = p_refresh_fence
    and stored.user_id = p_user_id
    and stored.provider_session_id = p_provider_session_id
  for update;
  if not found then return; end if;
  select provider_session.user_id into v_auth_user
  from auth.sessions as provider_session
  where provider_session.id = p_provider_session_id;
  if found and v_auth_user is distinct from p_user_id then
    raise exception 'provider_session_binding_mismatch' using errcode = 'P0001';
  end if;

  return query
  update hco_private.bff_sessions as stored
  set credential_envelope = null,
    cleanup_state = 'complete',
    cleanup_completed_at = pg_catalog.clock_timestamp()
  where stored.session_hash = p_session_hash
    and stored.state = 'revoked' and stored.cleanup_state = 'pending'
    and stored.refresh_fence = p_refresh_fence
    and stored.user_id = p_user_id
    and stored.provider_session_id = p_provider_session_id
    -- The managed Auth row's ID is decisive even if its user binding differs.
    and not exists (
      select 1 from auth.sessions as provider_session
      where provider_session.id = p_provider_session_id
    )
  returning stored.cleanup_completed_at;
end;
$$;

alter function public.bff_session_save_cleanup_rotation(text, bigint, uuid, uuid, integer, integer, text) owner to postgres;
alter function public.bff_session_complete_if_provider_absent(text, bigint, uuid, uuid) owner to postgres;

revoke all on function public.bff_session_save_cleanup_rotation(text, bigint, uuid, uuid, integer, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.bff_session_complete_if_provider_absent(text, bigint, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.bff_session_save_cleanup_rotation(text, bigint, uuid, uuid, integer, integer, text) to service_role;
grant execute on function public.bff_session_complete_if_provider_absent(text, bigint, uuid, uuid) to service_role;

commit;
