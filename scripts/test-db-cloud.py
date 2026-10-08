#!/usr/bin/env python3
"""Runs the SQL role suite (scripts/test-db-security.py) where there is no Docker: a cloud session with a local
PostgreSQL 16 cluster. Each "reset" is a fresh database with Supabase stand-ins (the roles, auth.uid(), auth.users,
auth.sessions, storage, pgcrypto in `extensions`, the migration history table and Supabase's default grants), then
every migration in order. It swaps only the bootstrap's main and psql; the suite, its cases and its mutations are
unchanged. Not acceptance for auth or RLS against real Supabase: that stays the Docker run (docs/TESTING.md).

Usage: python3 scripts/test-db-cloud.py        (as root; connects as the postgres OS user through the local socket)
"""
import os
import runpy
import secrets
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STANDINS = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator noinherit; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now(), not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $f$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid $f$;
create function auth.role() returns text language sql stable as $f$
  select nullif(coalesce(current_setting('request.jwt.claim.role', true),
                         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '') $f$;
create function auth.jwt() returns jsonb language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text not null unique, owner uuid, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
"""


def run_psql(db: str, sql: str) -> str:
    args = ["runuser", "-u", "postgres", "--", "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db,
            "-A", "-t", "-F", "\t"]
    done = subprocess.run(args, input=sql, text=True, capture_output=True, timeout=600, cwd="/")
    if done.returncode:
        raise RuntimeError(f"command exit {done.returncode}: " + h.safe_error(done.stdout + done.stderr))
    return done.stdout


def fresh_database(db: str) -> None:
    run_psql("postgres", f"drop database if exists {db}; create database {db};")
    run_psql(db, STANDINS)
    for path in sorted((ROOT / "supabase/migrations").glob("[0-9]*_*.sql")):
        version, name = path.name.split("_", 1)
        run_psql(db, path.read_text(encoding="utf-8") +
                 f"\n;insert into supabase_migrations.schema_migrations (version, name) values ('{version}', '{name[:-4]}');\n")


def local_main(*, fail_after_start: bool = False, after_reset=None) -> int:
    db = "hco_" + secrets.token_hex(4)
    try:
        for cycle in range(2):
            print(f"Cloud reset {cycle + 1}: fresh database, stand-ins, {len(h.expected_versions())} migrations.", flush=True)
            fresh_database(db)
            h.catalog(db, ROOT, h.sql_for(h.expected_versions()))
            if after_reset is not None:
                after_reset(db, ROOT, "", {})
        print('{"status": "passed", "error": null, "cleanup": "passed"}')
        return 0
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        print('{"status": "failed", "error": %r}' % str(error)[:2000])
        return 1
    finally:
        try:
            run_psql("postgres", f"drop database if exists {db};")
        except RuntimeError:
            pass


if __name__ == "__main__":
    if os.geteuid() != 0:
        sys.exit("run as root (it connects as the postgres OS user)")
    sys.argv = sys.argv[:1]
    suite = runpy.run_path(str(ROOT / "scripts/test-db-security.py"), run_name="cloud")
    h = suite["h"]
    h.psql = lambda db, _workdir, sql: run_psql(db, sql)
    h.main = local_main
    # The suite's receipts describe the Docker run; a stand-in run writes its own outside the tree.
    out = Path(os.environ.get("TMPDIR", "/tmp"))
    h.REPORT = out / "hco-cloud-bootstrap.json"
    suite["main"].__globals__["REPORT"] = out / "hco-cloud-security.json"
    raise SystemExit(suite["main"]())
