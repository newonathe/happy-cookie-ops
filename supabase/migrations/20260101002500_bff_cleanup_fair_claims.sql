begin;

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
    order by coalesce(candidate.cleanup_attempted_at,
      case when candidate.state = 'revoked'
        then least(candidate.revoked_at, candidate.absolute_expires_at)
        else candidate.absolute_expires_at end),
      candidate.absolute_expires_at, candidate.session_hash
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

alter function public.bff_session_claim_cleanup(integer) owner to postgres;
revoke all on function public.bff_session_claim_cleanup(integer) from public, anon, authenticated, service_role;
grant execute on function public.bff_session_claim_cleanup(integer) to service_role;

commit;
