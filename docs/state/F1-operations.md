# F1 operations — encrypted database backup

## Weekly backup preparation

`scripts/f1-backup.mjs` is a manual preparation tool. It makes three logical dumps with the pinned Supabase CLI: role definitions, the `public`, `auth` and `hco_private` schemas, and their data. The CLI explicitly excludes `auth.schema_migrations`; an additional read-only `pg_dump` preserves that history in the same encrypted archive. It uses the CLI-selected connection, parses credentials as literal environment values without executing the dry-run script, and fails closed if that script's expected shape changes. `F1_BACKUP_SOURCE=local` (the default) reads the local Supabase project. For a later owner-run weekly backup, `F1_BACKUP_SOURCE=linked` reads the project already linked and authenticated in the Supabase CLI; it does not activate a schedule or make a database write. Review the linked project in the CLI before each run.

The SQL is assembled in a private temporary directory, encrypted with AES-256-GCM using a random 96-bit IV, and authenticated before reporting success. The 32-byte key is supplied only through `F1_BACKUP_KEY` as 64 hex characters. Generate it with a cryptographically secure random generator, save it directly into the owner's password manager, and do not put it in a shell command, repository, backup filename, or output log. Keep a separately controlled recovery copy of the key. An encrypted file without its key cannot be restored.

Choose an existing protected directory outside this repository for ciphertext. The command requires the parent directory to exist, resolves symlinked parents, rejects paths inside the repository (including dot-dot-prefixed filenames), accepts a path on another drive only when its existing parent resolves outside the repository, and applies an owner-only Windows ACL to the archive. Keep one copy on the workstation and copy the encrypted archive to an off-device location controlled by the owner. Do not upload plaintext SQL. Off-device custody is not configured yet, and backup archive expiry has not been decided; do not prune archives automatically. No timer or runner is enabled: the schedule is written and off (last section), so the weekly run stays manual until Ethan switches it on.

PowerShell example (set the key from the password manager without echoing it):

```powershell
$env:PATH='C:\Users\ethan\dev\happy-cookie-tools\bin;C:\Users\ethan\dev\happy-cookie-tools\node-v24.20.0-win-x64;'+$env:PATH
$secureKey = Read-Host 'Paste 64-hex backup key' -AsSecureString
$keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try { $env:F1_BACKUP_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr); Remove-Variable secureKey,keyPtr }
$env:F1_BACKUP_SOURCE='linked' # omit this line for the local project
node scripts/f1-backup.mjs backup --out 'D:\Protected\HappyCookie\weekly-YYYY-MM-DD.hco'
node scripts/f1-backup.mjs verify --in 'D:\Protected\HappyCookie\weekly-YYYY-MM-DD.hco'
Remove-Item Env:F1_BACKUP_KEY
```

The prompt is non-echoing. Copy the key from the owner's password manager; do not generate a replacement for an existing archive.

The success record prints only an archive SHA-256. The output path must be absolute, outside the repository, and unused; an existing file is never overwritten. Its parent directory must already exist. The one-year policy applies to active personal data in the database. No archive retention period has been approved, so do not infer that backup archives should be automatically deleted after one year.

An encrypted local archive does not set backup health to green. Health must remain unconfirmed until a copy is safely off-device and an isolated restore drill passes.

## Keep-alive and retention operations

These commands are operator-run only. They need the target API origin and a service key supplied through environment variables; never put the key in command arguments or logs. No operation was run against a hosted project in this task.

```powershell
$env:F1_SUPABASE_URL='https://<approved-project-ref>.supabase.co'
$secureKey = Read-Host 'Paste operator service key' -AsSecureString
$keyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try { $env:F1_SERVICE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPtr); Remove-Variable secureKey,keyPtr }
node scripts/f1-operations.mjs keepalive
node scripts/f1-operations.mjs retention
Remove-Item Env:F1_SERVICE_KEY
```

The local runner rejects hosted targets unless `--hosted-approved` is present. Add it to the selected command only after Ethan approves that hosted operation, for example `node scripts/f1-operations.mjs keepalive --hosted-approved`. `docs/state/F1-schedule.example.json` is the written schedule; `.github/workflows/ops-jobs.yml` carries it, off (last section).

## Restore procedure and current evidence boundary

Restore must target a new disposable container running exactly `public.ecr.aws/supabase/postgres:15.8.1.085`, with label `com.hco.f1-disposable=true`, named `f1-restore-<id>`, and one published PostgreSQL port bound to `127.0.0.1`. Generate the ID from a GUID and assert the CLI's hex-and-dash name rule before creating the container; do not use descriptive word suffixes. The URL's port must match that container's published port, and the selected Docker context must be the local Windows Docker Desktop pipe. The restore connects as the image's `supabase_admin` superuser; the `postgres` role is not superuser in this image. Supply the disposable database password only as `F1_RESTORE_PASSWORD` in the process environment; never embed it in `--url`. The CLI refuses other images, labels, names, port bindings, passwords, Docker contexts, or targets. The image needs its normal database command and config file; do not launch only the bare `postgres` command. Example shape:

```powershell
node scripts/f1-backup.mjs verify --in 'D:\Protected\HappyCookie\weekly-YYYY-MM-DD.hco'
node scripts/f1-backup.mjs restore --in 'D:\Protected\HappyCookie\weekly-YYYY-MM-DD.hco' `
  --url 'postgresql://postgres@127.0.0.1:55444/postgres' --container f1-restore-<id>
```

For an approved isolated drill, the intended name and container startup shape are:

```powershell
$container = "f1-restore-$([guid]::NewGuid().ToString())"
if ($container -notmatch '^f1-restore-[a-f0-9-]+$') { throw 'Invalid disposable target name.' }
docker run -d --name $container --label com.hco.f1-disposable=true `
  -p '127.0.0.1:55445:5432' --env POSTGRES_PASSWORD `
  public.ecr.aws/supabase/postgres:15.8.1.085 postgres -D /etc/postgresql `
  -c config_file=/etc/postgresql/postgresql.conf
```

Set `POSTGRES_PASSWORD` in the process environment first; pass the same disposable-only value as `F1_RESTORE_PASSWORD` when invoking the test harness. Confirm the exact container identity and bound port, and readiness, before the drill. The 2026-10-03 run confirmed this startup shape reached readiness, but the harness rejected the descriptive name before starting the dump; no restore SQL was sent.

The archive includes `hco_private` because archived public BFF functions depend on its table types; this does not reactivate that architecture. The restore replaces the image's older Auth skeleton by dropping only the three archived schemas inside the verified disposable target and the same atomic restore transaction. It never resets the source or a hosted database.

After restore, verify application table counts and row hashes against a pre-dump inventory, check the auth-user rows needed by foreign keys, and run PostgreSQL constraint validation (`VALIDATE CONSTRAINT` on every unvalidated FK plus an orphan query). Destroy only the disposable target after capturing a secret-free receipt. Never point restore at the app's existing local Supabase stack or a hosted database.

The retention routine clears `orders.customer_name`, `phone`, `notes`, `ig`, `status_token`, and `payload_hash`, clears add-on notes, and deletes waitlist rows after 365 days. It retains order and financial records, including payment references. Encrypted backup copies can still contain older personal details, so a restore from an old archive may reintroduce data already cleared from the active database. The encrypted database dump includes `public`, `auth` and `hco_private` schemas and rows plus the CLI role dump; it excludes Storage object bytes, Auth provider configuration/API keys, Edge Functions, Realtime settings, and other project configuration.

**Restore status is recorded in the evidence receipt.** A restore is only considered proven after table counts and deterministic row hashes match the source and every FK validates with no orphans. Applying SQL alone never marks restore health successful.

Latest direct run (run 9, 2026-10-03), including the applied F1 migration: recovery PASS. All 61 tables/236 rows across the three schemas match source counts and hashes, including all 77 Auth migration rows. All 55 FKs match and are validated with zero orphans. The deliberate SQL-error probe verified atomic schema rollback and preserved target data; wrong-port preservation and exact owned cleanup passed. No off-device copy, hosted status write or schedule activation occurred. Historical failures remain in the evidence receipt.

Earlier attempts failed on managed-role setup, URL/name/startup preflight, and the omitted Auth migration rows. They remain recorded as failures in `docs/state/evidence/F1-backup-20261003.json`; run 9 supplies the current complete recovery proof. Local recovery does not set hosted backup health green.

## Health receipt workflow

Only report a successful `backup` after the encrypted archive is written, authenticated, and its ciphertext has been verified at an owner-controlled off-device location. Only report successful `restore` after an isolated restore has passed schema/table inventory, row-count and deterministic hash comparison, and all-FK validation with zero orphans. Use the same archive SHA-256 in both success records. Never set successful health from a local-only archive, a decryption check, SQL application alone, or an unverified restore. Record failed backup or restore attempts as `failed`; include the archive hash only if a complete archive exists. Use a fresh stable UUID per run and retain the completion timestamp.

The service-only RPC reporter is exported from `scripts/f1-operations.mjs`; it accepts jobs `backup`, `restore`, `retention`, or `keepalive` and statuses `success` or `failed`. The example below is intentionally operator-run and must only be used after Ethan explicitly approves the hosted status write. Supply `F1_SUPABASE_URL` and `F1_SERVICE_KEY` through the environment as shown above; do not put the service key in the command or logs.

```powershell
node --input-type=module -e "import { reportOperation } from './scripts/f1-operations.mjs'; await reportOperation('backup','success','<64-character-archive-sha256>',{runId:'<stable-uuid>',now:()=>new Date('<original-completion-ISO>'),hostedApproved:true});"
node --input-type=module -e "import { reportOperation } from './scripts/f1-operations.mjs'; await reportOperation('restore','success','<same-archive-sha256>',{runId:'<new-stable-uuid>',now:()=>new Date('<original-completion-ISO>'),hostedApproved:true});"
```

Use `'failed'` in place of `'success'` for a failed run; a failed run may use a null archive hash. Do not execute these examples now. Hosted status writes and schedule activation remain unauthorized; the schedule is written in `.github/workflows/ops-jobs.yml` and stays off.

References: [Supabase CLI backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [Supabase database backups](https://supabase.com/docs/guides/platform/backups). Supabase documents separate role/schema/data dumps and states that database backups do not contain Storage object bytes.

## The maintenance jobs: written and off (slice A4, 6 October 2026)

`.github/workflows/ops-jobs.yml` holds the three jobs of [F1-schedule.example.json](F1-schedule.example.json): the weekly backup (Monday 08:00 Manila), the daily keep-alive (08:00) and the daily retention run (02:00). **It is off.** A first job reads one repository variable, `OPS_JOBS_ENABLED`, and no secret; every other job waits on it, so while it is unset nothing runs and no secret is read. Only a clear "on" (`true`, `1`, `on`, `yes`) enables it; a typo stays off. The three jobs also run only from the `main` branch. `scripts/ops-jobs.mjs` makes the decision and `tests/unit/ops-jobs.test.ts` proves it from the workflow text, including against an ungated extra job, a widened condition, a bracket-style secret and a step that may fail open.

**What Ethan does to switch on keep-alive and retention:**

1. **Add the secret and variable** (repository Settings, Secrets and variables, Actions): the secret `OPS_SERVICE_KEY` (prefer a modern `sb_secret_` key) and the variable `OPS_SUPABASE_URL` (the trial's `https://<ref>.supabase.co` origin; the runner refuses any other host). If the repository's plan allows it, create a GitHub Environment limited to `main` and keep the secret there: a repository secret can be read by any workflow file pushed to any branch, and the `main` rule in this workflow cannot stop that.
2. **Schedules only fire from the default branch.** The file does nothing on a schedule until it is merged to `main`, which is your call. A manual run (Actions, Maintenance jobs, Run workflow, pick a job) works from `main` only.
3. **Set `OPS_JOBS_ENABLED` to `true`.** This is also your approval of the hosted operations: keep-alive and retention pass `--hosted-approved` to the project in `OPS_SUPABASE_URL`. One switch enables all three jobs, so retention (which clears personal data older than 365 days) comes on with the others. Delete the variable or set it to `false` to stop everything.

**The backup needs more, and is blocked until it has it.** The backup job stops at its first step ("Custody is not decided") before it reads any secret or dumps anything. To wire it:

- **Custody (yours):** where the encrypted archive lives and who can restore it. Add the copy step, then delete the failing step. Nothing is chosen for you.
- **The dump's version.** `scripts/f1-backup.mjs` dumps the auth history with `pg_dump` from the pinned `15.8.1.085` image, and `current-history.md` records the hosted project as Postgres 17. `pg_dump` refuses a newer server, so the job would fail even with custody wired. The image must follow the server's major version, and that needs one hosted dry run to prove (not made: no hosted call in this slice).
- **Credentials.** The job as written links the project with `supabase link`, which needs an account-wide Supabase access token. Prefer dumping with the project's database URL and password (`--db-url`) so no account-wide token sits in Actions; that is a small change to `f1-backup.mjs`, also to be proven on the hosted dry run. Add `OPS_BACKUP_KEY` (64 hex characters from your password manager; it is the only way to read an archive) and `OPS_SUPABASE_PROJECT_REF`.
- **One hosted dry run by hand**, reading what it prints, before the schedule is trusted. Until a backup is copied off-device and a restore drill passes on a hosted archive, backup health stays unconfirmed.

A job that fails shows as a red run in the Actions tab; the in-app System health card reads the last recorded run of each job.

**What the 6 October dry run proved, and what it did not** ([receipt](evidence/A4-dry-run-20261006.json), [restore evidence](evidence/F1-backup-20261006.json)). Against the local project and a disposable local container only: an encrypted backup, its verification, a restore into a fresh `15.8.1.085` container (62 tables, row counts and SHA-256 match, 56 foreign keys validated, no orphans), keep-alive and retention. The dry run found a real defect, now fixed with a test: the keep-alive job recorded a success and then a failure, and exited with an error, because the database answers its report with an empty `204`; against the trial it would have failed every day. **Not exercised:** the backup job's hosted source, any off-device copy, and the GitHub schedule.
