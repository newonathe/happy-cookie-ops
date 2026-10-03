-- F1 operations status and the approved one-year customer-data retention window.
create table public.operations_runs (
  run_id uuid primary key,
  job text not null check (job in ('backup', 'restore', 'retention', 'keepalive')),
  status text not null check (status in ('success', 'failed')),
  completed_at timestamptz not null,
  archive_sha256 text,
  constraint operations_runs_archive_hash check (
    archive_sha256 is null or archive_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint operations_runs_backup_hash check (
    status <> 'success' or job not in ('backup', 'restore') or archive_sha256 is not null
  )
);
alter table public.operations_runs enable row level security;
revoke all on table public.operations_runs from public, anon, authenticated, service_role;

create or replace function public.record_operations_run(
  p_job text, p_status text, p_run_id uuid, p_completed_at timestamptz,
  p_archive_sha256 text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_existing public.operations_runs%rowtype;
begin
  if auth.role() is distinct from 'service_role' then -- rule:run-service
    raise insufficient_privilege using message = 'service role required';
  end if;
  if p_job not in ('backup', 'restore', 'retention', 'keepalive')
     or p_status not in ('success', 'failed') or p_run_id is null or p_completed_at is null
     or (p_archive_sha256 is not null and p_archive_sha256 !~ '^[0-9a-f]{64}$')
     or (p_status = 'success' and p_job in ('backup', 'restore') and p_archive_sha256 is null) then
    raise check_violation using message = 'invalid operations run';
  end if;
  if p_job not in ('backup', 'restore') and p_archive_sha256 is not null then -- rule:run-input
    raise check_violation using message = 'archive hash only applies to backup or restore';
  end if;
  if p_completed_at > pg_catalog.clock_timestamp() then -- rule:run-time
    raise check_violation using message = 'operations time cannot be in the future';
  end if;
  insert into public.operations_runs(run_id, job, status, completed_at, archive_sha256)
  values (p_run_id, p_job, p_status, p_completed_at, p_archive_sha256)
  on conflict (run_id) do nothing;
  if not found then
    select * into v_existing from public.operations_runs where run_id = p_run_id;
    if (v_existing.job, v_existing.status, v_existing.completed_at, v_existing.archive_sha256) is distinct from (p_job, p_status, p_completed_at, p_archive_sha256) then -- rule:run-idempotency
      raise unique_violation using message = 'run id payload conflict';
    end if;
  end if;
end;
$$;
revoke all on function public.record_operations_run(text, text, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_operations_run(text, text, uuid, timestamptz, text)
  to service_role;

create or replace function public.get_operations_health()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_role text := auth.role(); v_uid uuid := auth.uid(); v_jobs jsonb;
begin
  if v_role is distinct from 'service_role' and not exists (select 1 from public.profiles p where p.id = v_uid and p.active and p.role in ('owner', 'support')) then -- rule:health-role
    raise insufficient_privilege using message = 'owner, support, or service role required';
  end if;
  select pg_catalog.jsonb_object_agg(j.job, pg_catalog.jsonb_build_object(
    'last_run', (select pg_catalog.jsonb_build_object('status', r.status, 'completed_at', r.completed_at,
                          'archive_sha256', r.archive_sha256)
                   from public.operations_runs r where r.job = j.job order by r.completed_at desc, r.run_id desc limit 1),
    'last_success', (select pg_catalog.jsonb_build_object('status', r.status, 'completed_at', r.completed_at,
                              'archive_sha256', r.archive_sha256)
                      from public.operations_runs r where r.job = j.job and r.status = 'success'
                      order by r.completed_at desc, r.run_id desc limit 1)
  )) into v_jobs
  from (values ('backup'), ('restore'), ('retention'), ('keepalive')) as j(job);
  return pg_catalog.jsonb_build_object('checked_at', pg_catalog.statement_timestamp(), 'jobs', v_jobs);
end;
$$;
revoke all on function public.get_operations_health() from public, anon;
grant execute on function public.get_operations_health() to authenticated, service_role;

-- The one-year minimum cannot be shortened by a caller. Financial/order records remain.
create or replace function public.prune_personal_data(p_retain_days integer default 365)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_count integer; v_run_id uuid := pg_catalog.gen_random_uuid(); v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then -- rule:retention-service
    raise insufficient_privilege using message = 'service role required';
  end if;
  if p_retain_days is distinct from 365 then -- rule:retention-window
    raise check_violation using message = 'retention window must be 365 days';
  end if;
  update public.order_add_ons a set note = null
    from public.orders o
   where a.order_id = o.id and o.placed_at < v_now - interval '365 days' and a.note is not null;
  with pruned as (
    update public.orders
       set customer_name = 'Past customer', phone = '', notes = '', ig = '',
           status_token = null, payload_hash = null
     where placed_at < v_now - interval '365 days'
       and (phone <> '' or customer_name <> 'Past customer' or notes <> '' or ig <> ''
            or status_token is not null or payload_hash is not null)
    returning 1
  ) select pg_catalog.count(*) into v_count from pruned;
  delete from public.waitlist_entries where created_at < v_now - interval '365 days';
  insert into public.operations_runs(run_id, job, status, completed_at)
    values (v_run_id, 'retention', 'success', v_now);
  return v_count;
end;
$$;
revoke all on function public.prune_personal_data(integer) from public, anon, authenticated;
grant execute on function public.prune_personal_data(integer) to service_role;
comment on function public.prune_personal_data(integer) is
  'Anonymises customer fields after the fixed 365-day retention window; financial/order records survive.';
