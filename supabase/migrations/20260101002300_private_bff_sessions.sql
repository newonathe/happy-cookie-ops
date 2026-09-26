begin;

create schema hco_private authorization postgres;
revoke all on schema hco_private from public, anon, authenticated, service_role;
revoke usage on schema hco_private from public, anon, authenticated, service_role;

create table hco_private.bff_sessions (
  session_hash text primary key check (
    pg_catalog.length(session_hash) = 64
    and session_hash operator(pg_catalog.~) '^[a-f0-9]{64}$'
  ),
  user_id uuid not null,
  provider_session_id uuid not null unique,
  csrf_token text not null check (
    pg_catalog.length(csrf_token) = 43
    and csrf_token operator(pg_catalog.~) '^[A-Za-z0-9_-]{43}$'
  ),
  credential_envelope text check (
    credential_envelope is null
    or (pg_catalog.octet_length(credential_envelope) between 1 and 90000)
  ),
  credentials_version integer not null default 0 check (credentials_version >= 0),
  refresh_fence bigint not null default 0 check (refresh_fence >= 0),
  state text not null check (state in ('active', 'revoked')),
  created_at timestamptz not null,
  absolute_expires_at timestamptz not null check (
    absolute_expires_at = created_at + interval '8 hours'
  ),
  refresh_lease_until timestamptz,
  revoked_at timestamptz,
  cleanup_state text not null check (cleanup_state in ('not_required', 'pending', 'complete')),
  cleanup_attempted_at timestamptz,
  cleanup_completed_at timestamptz,
  check (refresh_lease_until is null or refresh_lease_until <= absolute_expires_at),
  check (
    (state = 'active'
      and revoked_at is null
      and cleanup_state = 'not_required'
      and credential_envelope is not null
      and cleanup_attempted_at is null
      and cleanup_completed_at is null)
    or
    (state = 'revoked'
      and revoked_at is not null
      and refresh_lease_until is null
      and (
        (cleanup_state = 'pending'
          and credential_envelope is not null
          and cleanup_completed_at is null)
        or
        (cleanup_state = 'complete'
          and credential_envelope is null
          and cleanup_attempted_at is not null
          and cleanup_completed_at is not null)
      ))
  )
);

alter table hco_private.bff_sessions enable row level security;
revoke all on table hco_private.bff_sessions from public, anon, authenticated, service_role;
create index bff_sessions_cleanup_idx on hco_private.bff_sessions
  (cleanup_state, cleanup_attempted_at, absolute_expires_at, session_hash)
  where cleanup_state <> 'complete';

create or replace function public.bff_session_create(
  p_session_hash text,
  p_csrf_token text,
  p_user_id uuid,
  p_provider_session_id uuid,
  p_credential_envelope text
) returns table (p_role public.app_role, p_csrf_token_out text, p_expires_at bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_authority_found boolean;
  v_profile_active boolean;
  v_provider_not_after timestamptz;
  v_role public.app_role;
begin
  if p_session_hash is null or pg_catalog.length(p_session_hash) <> 64
      or not (p_session_hash operator(pg_catalog.~) '^[a-f0-9]{64}$')
      or p_csrf_token is null or pg_catalog.length(p_csrf_token) <> 43
      or not (p_csrf_token operator(pg_catalog.~) '^[A-Za-z0-9_-]{43}$')
      or p_user_id is null or p_provider_session_id is null
      or p_credential_envelope is null
      or pg_catalog.octet_length(p_credential_envelope) not between 1 and 90000 then
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hco:bff:hash:' || p_session_hash, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hco:bff:provider:' || p_provider_session_id::text, 0)
  );
  select profile.role, profile.active, provider_session.not_after
  into v_role, v_profile_active, v_provider_not_after
  from public.profiles as profile
  join auth.sessions as provider_session
    on provider_session.id = p_provider_session_id
    and provider_session.user_id = p_user_id
  where profile.id = p_user_id
  for share of profile, provider_session;
  v_authority_found := found;
  v_now := pg_catalog.clock_timestamp();
  if not v_authority_found or v_profile_active is not true
      or (v_provider_not_after is not null and v_provider_not_after <= v_now) then
    return;
  end if;

  return query
  with inserted as (
    insert into hco_private.bff_sessions (
      session_hash, user_id, provider_session_id, csrf_token, credential_envelope,
      created_at, absolute_expires_at, cleanup_state, state
    )
    values (p_session_hash, p_user_id, p_provider_session_id, p_csrf_token, p_credential_envelope,
      v_now, v_now + interval '8 hours', 'not_required', 'active')
    on conflict do nothing
    returning user_id, csrf_token, absolute_expires_at
  )
  select v_role, inserted.csrf_token,
    pg_catalog.floor(extract(epoch from inserted.absolute_expires_at))::bigint
  from inserted;
end;
$$;

create or replace function public.bff_session_read(p_session_hash text)
returns table (p_user_id uuid, p_role public.app_role, p_csrf_token text, p_expires_at bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_session hco_private.bff_sessions%rowtype;
  v_authority_found boolean;
  v_profile_active boolean;
  v_provider_not_after timestamptz;
  v_role public.app_role;
begin
  if p_session_hash is null or pg_catalog.length(p_session_hash) <> 64
      or not (p_session_hash operator(pg_catalog.~) '^[a-f0-9]{64}$') then
    return;
  end if;
  select * into v_session from hco_private.bff_sessions
    where session_hash = p_session_hash for update;
  if not found or v_session.state <> 'active' then
    return;
  end if;

  select profile.role, profile.active, provider_session.not_after
  into v_role, v_profile_active, v_provider_not_after
  from public.profiles as profile
  join auth.sessions as provider_session
    on provider_session.id = v_session.provider_session_id
    and provider_session.user_id = v_session.user_id
  where profile.id = v_session.user_id
  for share of profile, provider_session;
  v_authority_found := found;
  v_now := pg_catalog.clock_timestamp();
  if v_session.absolute_expires_at <= v_now
      or (v_session.refresh_lease_until is not null and v_session.refresh_lease_until <= v_now)
      or not v_authority_found or v_profile_active is not true
      or (v_provider_not_after is not null and v_provider_not_after <= v_now) then
    update hco_private.bff_sessions set state = 'revoked', revoked_at = v_now,
      refresh_lease_until = null, refresh_fence = refresh_fence + 1,
      cleanup_state = 'pending', cleanup_attempted_at = null
    where session_hash = p_session_hash and state = 'active';
    return;
  end if;
  return query
  select v_session.user_id, v_role, v_session.csrf_token,
    pg_catalog.floor(extract(epoch from v_session.absolute_expires_at))::bigint;
end;
$$;

create or replace function public.bff_session_acquire_refresh(p_session_hash text)
returns table (
  p_user_id uuid, p_provider_session_id uuid, p_credential_envelope text,
  p_credentials_version integer, p_next_credentials_version integer,
  p_refresh_fence bigint, p_lease_until timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_session hco_private.bff_sessions%rowtype;
  v_authority_found boolean;
  v_profile_active boolean;
  v_provider_not_after timestamptz;
begin
  if p_session_hash is null or pg_catalog.length(p_session_hash) <> 64
      or not (p_session_hash operator(pg_catalog.~) '^[a-f0-9]{64}$') then
    return;
  end if;
  select * into v_session from hco_private.bff_sessions
    where session_hash = p_session_hash for update;
  if not found or v_session.state <> 'active' then
    return;
  end if;

  select profile.active, provider_session.not_after
  into v_profile_active, v_provider_not_after
  from public.profiles as profile
  join auth.sessions as provider_session
    on provider_session.id = v_session.provider_session_id
    and provider_session.user_id = v_session.user_id
  where profile.id = v_session.user_id
  for share of profile, provider_session;
  v_authority_found := found;
  v_now := pg_catalog.clock_timestamp();
  if v_session.absolute_expires_at <= v_now
      or (v_session.refresh_lease_until is not null and v_session.refresh_lease_until <= v_now)
      or not v_authority_found or v_profile_active is not true
      or (v_provider_not_after is not null and v_provider_not_after <= v_now) then
    update hco_private.bff_sessions set state = 'revoked', revoked_at = v_now,
      refresh_lease_until = null, refresh_fence = refresh_fence + 1,
      cleanup_state = 'pending', cleanup_attempted_at = null
    where session_hash = p_session_hash and state = 'active';
    return;
  end if;
  if v_session.refresh_lease_until is not null then return; end if;
  return query
  update hco_private.bff_sessions set refresh_fence = refresh_fence + 1,
    refresh_lease_until = least(v_now + interval '30 seconds', absolute_expires_at)
  where session_hash = p_session_hash and state = 'active' and refresh_lease_until is null
  returning user_id, provider_session_id, credential_envelope, credentials_version,
    credentials_version + 1, refresh_fence, refresh_lease_until;
end;
$$;

create or replace function public.bff_session_finalize_refresh(
  p_session_hash text,
  p_refresh_fence bigint,
  p_user_id uuid,
  p_provider_session_id uuid,
  p_next_credentials_version integer,
  p_credential_envelope text
) returns table (p_role public.app_role, p_csrf_token text, p_expires_at bigint)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_session hco_private.bff_sessions%rowtype;
  v_authority_found boolean;
  v_profile_active boolean;
  v_provider_not_after timestamptz;
  v_role public.app_role;
begin
  if p_session_hash is null or pg_catalog.length(p_session_hash) <> 64
      or not (p_session_hash operator(pg_catalog.~) '^[a-f0-9]{64}$')
      or p_refresh_fence is null or p_refresh_fence < 0
      or p_user_id is null or p_provider_session_id is null
      or p_next_credentials_version is null or p_next_credentials_version < 0
      or p_credential_envelope is null
      or pg_catalog.octet_length(p_credential_envelope) not between 1 and 90000 then
    return;
  end if;
  select * into v_session from hco_private.bff_sessions
    where session_hash = p_session_hash for update;
  if not found or v_session.state <> 'active' then
    return;
  end if;

  select profile.role, profile.active, provider_session.not_after
  into v_role, v_profile_active, v_provider_not_after
  from public.profiles as profile
  join auth.sessions as provider_session
    on provider_session.id = v_session.provider_session_id
    and provider_session.user_id = v_session.user_id
  where profile.id = v_session.user_id
  for share of profile, provider_session;
  v_authority_found := found;
  v_now := pg_catalog.clock_timestamp();
  if v_session.absolute_expires_at <= v_now
      or (v_session.refresh_lease_until is not null and v_session.refresh_lease_until <= v_now)
      or not v_authority_found or v_profile_active is not true
      or (v_provider_not_after is not null and v_provider_not_after <= v_now)
      or (v_session.refresh_fence = p_refresh_fence and (
        v_session.user_id <> p_user_id or v_session.provider_session_id <> p_provider_session_id
      )) then
    update hco_private.bff_sessions set state = 'revoked', revoked_at = v_now,
      refresh_lease_until = null, refresh_fence = refresh_fence + 1,
      cleanup_state = 'pending', cleanup_attempted_at = null
    where session_hash = p_session_hash and state = 'active';
    return;
  end if;
  if v_session.refresh_lease_until is null or v_session.refresh_fence <> p_refresh_fence
      or v_session.credentials_version + 1 <> p_next_credentials_version then return; end if;
  update hco_private.bff_sessions set credential_envelope = p_credential_envelope,
    credentials_version = p_next_credentials_version, refresh_lease_until = null
  where session_hash = p_session_hash and refresh_fence = p_refresh_fence;
  return query
  select v_role, v_session.csrf_token,
    pg_catalog.floor(extract(epoch from v_session.absolute_expires_at))::bigint;
end;
$$;

create or replace function public.bff_session_begin_revoke(p_session_hash text)
returns table (
  p_user_id uuid, p_provider_session_id uuid, p_credential_envelope text,
  p_credentials_version integer, p_refresh_fence bigint
)
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_session hco_private.bff_sessions%rowtype;
begin
  if p_session_hash is null or pg_catalog.length(p_session_hash) <> 64
      or not (p_session_hash operator(pg_catalog.~) '^[a-f0-9]{64}$') then
    return;
  end if;
  select * into v_session from hco_private.bff_sessions
    where session_hash = p_session_hash for update;
  if not found then return; end if;
  v_now := pg_catalog.clock_timestamp();
  if v_session.state = 'active' then
    return query
    update hco_private.bff_sessions set state = 'revoked', revoked_at = v_now,
      refresh_lease_until = null, refresh_fence = refresh_fence + 1,
      cleanup_state = 'pending', cleanup_attempted_at = v_now
    where session_hash = p_session_hash and state = 'active'
    returning user_id, provider_session_id, credential_envelope, credentials_version, refresh_fence;
    return;
  end if;
  if v_session.state = 'revoked' and v_session.cleanup_state = 'pending'
      and (v_session.cleanup_attempted_at is null
        or v_session.cleanup_attempted_at <= v_now - interval '30 seconds') then
    return query
    update hco_private.bff_sessions set cleanup_attempted_at = v_now,
      refresh_fence = refresh_fence + 1
    where session_hash = p_session_hash and state = 'revoked' and cleanup_state = 'pending'
    returning user_id, provider_session_id, credential_envelope, credentials_version, refresh_fence;
  end if;
end;
$$;

create or replace function public.bff_session_claim_cleanup(p_limit integer)
returns table (
  p_session_hash text, p_user_id uuid, p_provider_session_id uuid,
  p_credential_envelope text, p_credentials_version integer, p_refresh_fence bigint
)
language plpgsql security definer set search_path = '' as $$
declare
  v_scan_now timestamptz := pg_catalog.clock_timestamp();
  v_session_hash text;
  v_claimed_at timestamptz;
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then return; end if;
  for v_session_hash in
    select candidate.session_hash
    from hco_private.bff_sessions as candidate
    where (candidate.state = 'active' and candidate.absolute_expires_at <= v_scan_now)
      or (candidate.state = 'revoked' and candidate.cleanup_state = 'pending'
        and (candidate.cleanup_attempted_at is null
          or candidate.cleanup_attempted_at <= v_scan_now - interval '30 seconds'))
    order by candidate.absolute_expires_at, candidate.session_hash
    limit p_limit
    for update skip locked
  loop
    v_claimed_at := pg_catalog.clock_timestamp();
    return query
    update hco_private.bff_sessions as claimed
    set state = 'revoked', revoked_at = coalesce(claimed.revoked_at, v_claimed_at),
      refresh_lease_until = null, refresh_fence = claimed.refresh_fence + 1,
      cleanup_state = 'pending', cleanup_attempted_at = v_claimed_at
    where claimed.session_hash = v_session_hash
    returning claimed.session_hash, claimed.user_id, claimed.provider_session_id,
      claimed.credential_envelope, claimed.credentials_version, claimed.refresh_fence
    ;
  end loop;
end;
$$;

create or replace function public.bff_session_complete_cleanup(
  p_session_hash text,
  p_refresh_fence bigint
) returns table (p_completed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if p_session_hash is null or pg_catalog.length(p_session_hash) <> 64
      or not (p_session_hash operator(pg_catalog.~) '^[a-f0-9]{64}$')
      or p_refresh_fence is null or p_refresh_fence < 0 then
    return;
  end if;
  return query
  update hco_private.bff_sessions set credential_envelope = null,
    cleanup_state = 'complete', cleanup_completed_at = pg_catalog.clock_timestamp()
  where session_hash = p_session_hash and state = 'revoked'
    and cleanup_state = 'pending' and refresh_fence = p_refresh_fence
  returning cleanup_completed_at;
end;
$$;

alter function public.bff_session_create(text, text, uuid, uuid, text) owner to postgres;
alter function public.bff_session_read(text) owner to postgres;
alter function public.bff_session_acquire_refresh(text) owner to postgres;
alter function public.bff_session_finalize_refresh(text, bigint, uuid, uuid, integer, text) owner to postgres;
alter function public.bff_session_begin_revoke(text) owner to postgres;
alter function public.bff_session_claim_cleanup(integer) owner to postgres;
alter function public.bff_session_complete_cleanup(text, bigint) owner to postgres;

revoke all on function public.bff_session_create(text, text, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.bff_session_read(text) from public, anon, authenticated, service_role;
revoke all on function public.bff_session_acquire_refresh(text) from public, anon, authenticated, service_role;
revoke all on function public.bff_session_finalize_refresh(text, bigint, uuid, uuid, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.bff_session_begin_revoke(text) from public, anon, authenticated, service_role;
revoke all on function public.bff_session_claim_cleanup(integer) from public, anon, authenticated, service_role;
revoke all on function public.bff_session_complete_cleanup(text, bigint) from public, anon, authenticated, service_role;
grant execute on function public.bff_session_create(text, text, uuid, uuid, text) to service_role;
grant execute on function public.bff_session_read(text) to service_role;
grant execute on function public.bff_session_acquire_refresh(text) to service_role;
grant execute on function public.bff_session_finalize_refresh(text, bigint, uuid, uuid, integer, text) to service_role;
grant execute on function public.bff_session_begin_revoke(text) to service_role;
grant execute on function public.bff_session_claim_cleanup(integer) to service_role;
grant execute on function public.bff_session_complete_cleanup(text, bigint) to service_role;

commit;
