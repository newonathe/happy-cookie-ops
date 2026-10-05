import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'scripts', 'f1-backup.mjs');
const restoreSource = await readFile(cli, 'utf8');
assert.match(
  restoreSource,
  /const targetUrl = validateLoopback\(url\);/,
  'restore keeps the validated URL object'
);
assert.match(
  restoreSource,
  /bindings\[0\]\.HostPort !== targetUrl\.port/,
  'container binding is compared with the parsed URL port'
);
assert.doesNotMatch(
  restoreSource,
  /bindings\[0\]\.HostPort !== url\.port/,
  'port guard never reads a property from the raw URL string'
);
const secret = randomBytes(32);
function archive(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secret, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      format: 'HCO-F1-BACKUP-1',
      cipher: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: body.toString('base64')
    })
  );
}
async function invoke(mode, file, env = {}, extra = []) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [cli, mode, mode === 'backup' ? '--out' : '--in', file, ...extra],
      {
        cwd: root,
        windowsHide: true,
        env: { ...process.env, F1_BACKUP_KEY: secret.toString('hex'), ...env },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
function tableEvidence(container, password) {
  const sql = [
    'DO $f1$',
    'DECLARE t record; f record; n bigint; h text; joincond text; nonnullcond text;',
    'BEGIN',
    "FOR t IN SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('public','auth','hco_private') ORDER BY schemaname,tablename LOOP",
    "EXECUTE format('SELECT count(*)::bigint,encode(extensions.digest(convert_to(coalesce(string_agg(md5(to_jsonb(x)::text), '''' ORDER BY md5(to_jsonb(x)::text)), ''''), ''UTF8''), ''sha256''), ''hex'') FROM %I.%I x',t.schemaname,t.tablename) INTO n,h;",
    "RAISE NOTICE 'F1TABLE|%|%|%|%',t.schemaname,t.tablename,n,h;",
    'END LOOP;',
    "FOR f IN SELECT con.conname,con.conrelid,con.confrelid,con.conkey,con.confkey,ns.nspname,cl.relname,con.convalidated FROM pg_constraint con JOIN pg_class cl ON cl.oid=con.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace WHERE con.contype='f' AND ns.nspname IN ('public','auth','hco_private') ORDER BY ns.nspname,cl.relname,con.conname LOOP",
    "SELECT string_agg(format('c.%I = p.%I',ca.attname,pa.attname),' AND ' ORDER BY s.i),string_agg(format('c.%I IS NOT NULL',ca.attname),' AND ' ORDER BY s.i) INTO joincond,nonnullcond FROM generate_subscripts(f.conkey,1) s(i) JOIN pg_attribute ca ON ca.attrelid=f.conrelid AND ca.attnum=f.conkey[s.i] JOIN pg_attribute pa ON pa.attrelid=f.confrelid AND pa.attnum=f.confkey[s.i];",
    "EXECUTE format('SELECT count(*) FROM %s c LEFT JOIN %s p ON %s WHERE (%s) AND p.ctid IS NULL',f.conrelid::regclass,f.confrelid::regclass,joincond,nonnullcond) INTO n;",
    "RAISE NOTICE 'F1FK|%|%|%|%',f.nspname||'.'||f.relname,f.conname,n,f.convalidated;",
    'END LOOP;',
    'END $f1$;'
  ].join('\n');
  const psql = password
    ? 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "$1"'
    : null;
  const result = password
    ? spawnSync('docker', ['exec', '-i', container, 'sh', '-c', psql, 'sh', sql], {
        input: Buffer.from(`${password}\n`),
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024
      })
    : spawnSync(
        'docker',
        [
          'exec',
          '-i',
          container,
          'psql',
          '-X',
          '-q',
          '-A',
          '-t',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-c',
          sql
        ],
        { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }
      );
  if (result.status !== 0)
    throw new Error('Aggregate database inventory failed; details suppressed.');
  const output = `${result.stdout}\n${result.stderr}`;
  const tables = Object.fromEntries(
    [...output.matchAll(/F1TABLE\|([a-z0-9_]+)\|([a-z0-9_]+)\|(\d+)\|([a-f0-9]{64})/g)].map((m) => [
      `${m[1]}.${m[2]}`,
      { rows: Number(m[3]), sha256: m[4] }
    ])
  );
  const fks = [...output.matchAll(/F1FK\|([a-z0-9_.]+)\|([a-z0-9_]+)\|(\d+)\|([tf])/g)].map(
    (m) => ({ table: m[1], constraint: m[2], orphans: Number(m[3]), validated: m[4] === 't' })
  );
  if (!Object.keys(tables).length || !fks.length)
    throw new Error('Aggregate inventory returned no tables or foreign keys.');
  return { tables, fks };
}
async function runRestoreDrill() {
  const container = process.env.F1_TEST_RESTORE_CONTAINER;
  const port = process.env.F1_TEST_RESTORE_PORT;
  const password = process.env.F1_RESTORE_PASSWORD;
  assert.match(container ?? '', /^f1-restore-[a-f0-9-]+$/);
  assert.match(port ?? '', /^\d+$/);
  assert.ok(password, 'disposable target password is supplied through the process environment');
  const inspect = spawnSync('docker', ['inspect', '--format', '{{json .}}', container], {
    encoding: 'utf8'
  });
  assert.equal(inspect.status, 0, 'disposable restore container exists');
  const meta = JSON.parse(inspect.stdout);
  assert.equal(meta.Name, `/${container}`);
  assert.equal(meta.Config.Image, 'public.ecr.aws/supabase/postgres:15.8.1.085');
  assert.equal(meta.Config.Labels['com.hco.f1-disposable'], 'true');
  assert.equal(meta.State.Running, true);
  assert.deepEqual(meta.NetworkSettings.Ports['5432/tcp'], [
    { HostIp: '127.0.0.1', HostPort: port }
  ]);

  const archivePath = path.join(dir, 'local-drill.hco');
  const before = tableEvidence('supabase_db_happy-cookie-ops');
  assert.ok(
    before.tables['hco_private.bff_sessions'],
    'archived public-function dependencies are included'
  );
  assert.ok(
    Object.entries(before.tables).some(([name, row]) => name.startsWith('public.') && row.rows > 0),
    'source contains nonempty app data'
  );
  assert.ok(
    before.fks.length > 0 && before.fks.every((fk) => fk.orphans === 0 && fk.validated),
    'source FKs are validated and have no orphans'
  );
  const backup = await invoke('backup', archivePath, { F1_BACKUP_SOURCE: 'local' });
  assert.equal(backup.code, 0, 'local encrypted backup succeeds');
  const verified = await invoke('verify', archivePath);
  assert.equal(verified.code, 0, 'written ciphertext authenticates');
  const archiveHash = JSON.parse(backup.stdout.trim()).sha256;
  const receiptPath = path.join(root, 'docs/state/evidence/F1-backup-20261003.json');
  const receipt = {
    date: '2026-10-03',
    scope: 'local encrypted database backup and isolated restore drill',
    backup: {
      status: 'PASS',
      cipher: 'AES-256-GCM',
      archiveSha256: archiveHash,
      authenticatedAfterWrite: true,
      offDeviceCopy: false,
      healthReported: false
    },
    restore: {
      status: 'UNPROVEN',
      image: meta.Config.Image,
      includedSchemas: ['public', 'auth', 'hco_private'],
      sourceTables: before.tables,
      sourceForeignKeys: before.fks,
      targetComparison: 'NOT RUN'
    },
    hostedWrites: false,
    scheduleActivated: false,
    storageObjectBytesIncluded: false,
    keyOrPiiInReceipt: false
  };
  const saveReceipt = () => writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  await saveReceipt();

  function targetSql(sql) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        container,
        'sh',
        '-c',
        'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql -X -q -A -t -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "$1"',
        'sh',
        sql
      ],
      { input: Buffer.from(`${password}\n`), encoding: 'utf8' }
    );
    assert.equal(
      result.status,
      0,
      'target-only rollback probe executes; SQL diagnostics suppressed'
    );
    return result.stdout.trim();
  }
  targetSql(
    "CREATE TABLE public.f1_rollback_probe(id text); INSERT INTO public.f1_rollback_probe VALUES ('synthetic-value');"
  );
  const failingArchive = path.join(dir, 'rollback.hco');
  await writeFile(
    failingArchive,
    archive(
      Buffer.from(
        "CREATE SCHEMA IF NOT EXISTS public;\nCREATE TABLE public.f1_bad_restore(id text);\nCOPY public.f1_bad_restore(id) FROM stdin;\nsynthetic-value\n\\.\nSELECT public.f1_nonexistent_failure('synthetic-pii');\n"
      )
    )
  );
  const rollback = await invoke('restore', failingArchive, { F1_RESTORE_PASSWORD: password }, [
    '--url',
    `postgresql://postgres@127.0.0.1:${port}/postgres`,
    '--container',
    container
  ]);
  assert.notEqual(rollback.code, 0, 'deliberate post-DROP SQL failure is rejected');
  assert.match(rollback.stderr, /SQLSTATE 42883/);
  assert.ok(
    !rollback.stderr.includes('synthetic-pii') && !rollback.stderr.includes(password),
    'SQL content and credentials remain suppressed'
  );
  assert.equal(
    targetSql(
      "SELECT count(*) = 1 AND bool_and(id = 'synthetic-value') FROM public.f1_rollback_probe;"
    ),
    't',
    'failed restore rolls back schema replacement and preserves target data'
  );
  assert.equal(
    targetSql("SELECT to_regclass('public.f1_bad_restore') IS NULL;"),
    't',
    'failed imported table is rolled back'
  );
  receipt.restore.atomicRollbackVerified = true;
  await saveReceipt();

  const wrongPort = await invoke('restore', archivePath, { F1_RESTORE_PASSWORD: password }, [
    '--url',
    `postgresql://postgres@127.0.0.1:${Number(port) + 1}/postgres`,
    '--container',
    container
  ]);
  assert.notEqual(wrongPort.code, 0, 'wrong published port is rejected before psql');
  assert.match(wrongPort.stderr, /exact running, labeled Supabase Postgres container/);

  assert.equal(
    targetSql('SELECT count(*) FROM public.f1_rollback_probe;'),
    '1',
    'wrong-port rejection leaves target data intact'
  );
  receipt.restore.wrongPortPreservedTarget = true;
  receipt.restore.restoreSqlAttempted = true;
  await saveReceipt();
  const restored = await invoke('restore', archivePath, { F1_RESTORE_PASSWORD: password }, [
    '--url',
    `postgresql://postgres@127.0.0.1:${port}/postgres`,
    '--container',
    container
  ]);
  if (restored.code !== 0) {
    Object.assign(receipt.restore, {
      status: 'FAIL',
      sanitizedError: restored.stderr.trim().replace(/\s+/g, ' ').slice(0, 240)
    });
    await saveReceipt();
    throw new Error(receipt.restore.sanitizedError || 'Final isolated restore failed.');
  }
  receipt.restore.restoreSqlApplied = true;
  await saveReceipt();
  let after;
  const sourceKeys = Object.keys(before.tables).sort();
  try {
    after = tableEvidence(container, password);
    const targetKeys = Object.keys(after.tables).sort();
    Object.assign(receipt.restore, {
      targetTables: after.tables,
      targetForeignKeys: after.fks,
      targetComparison: 'IN PROGRESS'
    });
    await saveReceipt();
    assert.deepEqual(
      targetKeys,
      sourceKeys,
      'all three archived schemas have matching table inventories'
    );
    for (const table of sourceKeys) {
      if (JSON.stringify(after.tables[table]) !== JSON.stringify(before.tables[table]))
        receipt.restore.comparisonFailure = {
          table,
          source: before.tables[table],
          target: after.tables[table]
        };
      assert.deepEqual(
        after.tables[table],
        before.tables[table],
        `row count and SHA-256 match for ${table}`
      );
    }
    assert.ok(
      Object.entries(after.tables).some(
        ([name, row]) => name.startsWith('public.') && row.rows > 0
      ),
      'target contains nonempty app data'
    );
    assert.ok(
      after.fks.length === before.fks.length &&
        after.fks.every((fk) => fk.orphans === 0 && fk.validated),
      'all restored FKs are validated and orphan-free'
    );
    assert.deepEqual(
      after.fks,
      before.fks,
      'restored FK names and validation/orphan results match source'
    );
  } catch (error) {
    Object.assign(receipt.restore, {
      status: 'FAIL',
      targetComparison: 'FAIL',
      sanitizedError: 'Restored inventory/count/hash/FK comparison failed; see technical receipt.'
    });
    await saveReceipt();
    throw error;
  }
  Object.assign(receipt.restore, {
    status: 'PASS',
    targetComparison: 'PASS',
    tableCount: sourceKeys.length,
    sourceHasNonemptyAppData: true,
    targetHasNonemptyAppData: true,
    rowCountsAndSha256Match: true,
    foreignKeyCount: after.fks.length,
    allForeignKeysValidated: true,
    orphanCount: after.fks.reduce((n, fk) => n + fk.orphans, 0)
  });
  await saveReceipt();
  return {
    archive: archivePath,
    container,
    archiveHash,
    tables: sourceKeys.length,
    rows: Object.values(after.tables).reduce((n, row) => n + row.rows, 0),
    fks: after.fks.length
  };
}
const dir = await mkdtemp(path.join(os.tmpdir(), 'hco-f1-tests-'));
try {
  const plain = Buffer.from(
    'CREATE TABLE public.receipts(id integer);\nCOPY public.receipts (id) FROM stdin;\n1\n\\.\n'
  );
  const good = path.join(dir, 'good.hco');
  await writeFile(good, archive(plain));
  const verified = await invoke('verify', good);
  assert.equal(verified.code, 0, 'valid archive authenticates');
  assert.match(verified.stdout, /"status":"authenticated"/);

  const wrong = await invoke('verify', good, { F1_BACKUP_KEY: randomBytes(32).toString('hex') });
  assert.notEqual(wrong.code, 0, 'wrong key is rejected');
  assert.match(wrong.stderr, /authentication failed/);
  assert.ok(!wrong.stderr.includes(secret.toString('hex')), 'key is absent from diagnostics');

  const original = await readFile(good);
  original[original.length - 5] ^= 1;
  const tampered = path.join(dir, 'tampered.hco');
  await writeFile(tampered, original);
  assert.notEqual((await invoke('verify', tampered)).code, 0, 'modified ciphertext is rejected');
  const truncated = path.join(dir, 'truncated.hco');
  await writeFile(truncated, (await readFile(good)).subarray(0, 18));
  assert.notEqual((await invoke('verify', truncated)).code, 0, 'truncated archive is rejected');
  const malformed = path.join(dir, 'malformed.hco');
  await writeFile(malformed, '{bad json');
  assert.notEqual((await invoke('verify', malformed)).code, 0, 'malformed archive is rejected');

  const localOnly = await invoke('restore', good, {}, [
    '--url',
    'postgresql://postgres@remote.example/postgres',
    '--container',
    'f1-restore-test'
  ]);
  assert.notEqual(localOnly.code, 0, 'remote restore URL is rejected');
  assert.match(localOnly.stderr, /127\.0\.0\.1|loopback/);
  if (process.env.F1_TEST_RESTORE_CONTAINER && process.env.F1_TEST_RESTORE_URL) {
    const mismatch = await invoke('restore', good, {}, [
      '--url',
      process.env.F1_TEST_RESTORE_URL,
      '--container',
      process.env.F1_TEST_RESTORE_CONTAINER
    ]);
    assert.notEqual(mismatch.code, 0, 'container port mismatch is rejected');
    assert.match(mismatch.stderr, /exact running, labeled Supabase Postgres container/);
  }
  if (process.env.F1_TEST_REMOTE_DOCKER_HOST) {
    const remoteContext = await invoke(
      'restore',
      good,
      { DOCKER_HOST: process.env.F1_TEST_REMOTE_DOCKER_HOST },
      ['--url', 'postgresql://postgres@127.0.0.1:55444/postgres', '--container', 'f1-restore-test']
    );
    assert.notEqual(remoteContext.code, 0, 'remote Docker endpoint is rejected');
    assert.match(remoteContext.stderr, /local Docker daemon/);
  }

  const existing = path.join(dir, 'existing.hco');
  await writeFile(existing, 'keep');
  const noOverwrite = await invoke('backup', existing);
  assert.notEqual(noOverwrite.code, 0, 'existing archive path is rejected');
  assert.equal(await readFile(existing, 'utf8'), 'keep', 'existing file remains untouched');

  const scratch = path.join(dir, 'scratch');
  const invalidOut = path.join(dir, 'failed.hco');
  await mkdir(scratch);
  const failed = await invoke('backup', invalidOut, {
    F1_BACKUP_SOURCE: 'invalid',
    TEMP: scratch,
    TMP: scratch
  });
  assert.notEqual(failed.code, 0, 'invalid source fails closed');
  assert.equal(
    failed.stderr.includes(secret.toString('hex')),
    false,
    'failure output does not disclose key'
  );
  assert.deepEqual(
    await readdir(scratch),
    [],
    'failed backup removes temporary plaintext directory'
  );

  for (const blocked of [
    path.join(root, '.hidden-f1-backup.hco'),
    path.join(root, 'docs', 'state', 'evidence', '..hidden-f1-backup.hco')
  ]) {
    const result = await invoke('backup', blocked);
    assert.notEqual(
      result.code,
      0,
      'lexically contained output is rejected, including dot-dot-prefixed names'
    );
    await assert.rejects(lstat(blocked), { code: 'ENOENT' }, 'blocked path is never created');
  }
  const alias = path.join(dir, 'repo-alias');
  try {
    await symlink(root, alias, 'junction');
    const viaAlias = await invoke(
      'backup',
      path.join(alias, 'docs', 'state', 'evidence', 'alias.hco')
    );
    assert.notEqual(viaAlias.code, 0, 'canonical repository path through a symlink is rejected');
    assert.match(viaAlias.stderr, /symlinks/);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) throw error;
  }
  const otherDrive = path.parse(root).root.toLowerCase() === 'c:\\' ? 'D:' : 'C:';
  const crossDrive = `${otherDrive}\\__f1_nonexistent_directory__\\archive.hco`;
  if (path.isAbsolute(crossDrive) && !existsSync(path.dirname(crossDrive))) {
    const result = await invoke('backup', crossDrive);
    assert.match(
      result.stderr,
      /output directory must exist/i,
      'different-drive paths are treated as outside, then require an existing parent'
    );
  }
  const reportFlag = await invoke('backup', path.join(dir, 'no-report.hco'), {}, ['--report']);
  assert.notEqual(reportFlag.code, 0, 'backup command has no status-report success mode');
  let drill = null;
  if (process.env.F1_TEST_RESTORE_CONTAINER) drill = await runRestoreDrill();
  console.log(
    'F1 backup cases passed: auth, wrong key, tamper, truncation, malformed input, remote target rejection, no overwrite, redacted failure, cleanup, repository path and symlink containment.'
  );
  if (drill)
    console.log(
      `F1 local restore verified: ${drill.tables} tables, ${drill.rows} rows, ${drill.fks} foreign keys; archive ${drill.archiveHash}.`
    );
} finally {
  if (process.env.F1_TEST_RESTORE_CONTAINER) {
    const name = process.env.F1_TEST_RESTORE_CONTAINER;
    const inspect = spawnSync(
      'docker',
      [
        'inspect',
        '--format',
        '{{.Name}}|{{.Config.Image}}|{{index .Config.Labels "com.hco.f1-disposable"}}',
        name
      ],
      { encoding: 'utf8' }
    );
    if (
      inspect.status === 0 &&
      inspect.stdout.trim() === `/${name}|public.ecr.aws/supabase/postgres:15.8.1.085|true`
    ) {
      const removed = spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' });
      assert.equal(removed.status, 0, 'owned disposable restore container is removed');
    }
  }
  await rm(dir, { recursive: true, force: true });
}
