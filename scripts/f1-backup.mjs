#!/usr/bin/env node
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, link, lstat, mkdtemp, readFile, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const VERSION = 'HCO-F1-BACKUP-1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
const key = () => {
  const value = process.env.F1_BACKUP_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value)) throw new Error('F1_BACKUP_KEY must be 64 hex characters (32 random bytes).');
  return Buffer.from(value, 'hex');
};
const usage = () => { throw new Error('Usage: node scripts/f1-backup.mjs backup --out ABSOLUTE_FILE | verify --in ABSOLUTE_FILE | restore --in ABSOLUTE_FILE --url LOOPBACK_POSTGRES_URL --container F1_DISPOSABLE_CONTAINER'); };
function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}
function args(argv) {
  const [mode, ...rest] = argv; const opts = {};
  for (let i = 0; i < rest.length;) {
    const k = rest[i], v = rest[i + 1];
    if (!['--out', '--in', '--url', '--container'].includes(k) || !v || opts[k]) usage();
    opts[k] = v; i += 2;
  }
  if (!['backup', 'verify', 'restore'].includes(mode)) usage();
  const file = opts[mode === 'backup' ? '--out' : '--in'];
  if (!file || !path.isAbsolute(file) || (mode === 'backup' && (opts['--url'] || opts['--container'])) || (mode !== 'restore' && (opts['--url'] || opts['--container'])) || (mode === 'restore' && (!opts['--url'] || !opts['--container']))) usage();
  if (mode === 'backup' && isWithin(path.resolve(root), path.resolve(file))) throw new Error('Encrypted backup output must be outside the repository.');
  return { mode, file, url: opts['--url'], container: opts['--container'] };
}
function encrypt(plain, secret) {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', secret, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.from(JSON.stringify({ format: VERSION, cipher: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') }));
}
function decrypt(blob, secret) {
  try {
    const obj = JSON.parse(blob.toString('utf8'));
    if (obj.format !== VERSION || obj.cipher !== 'aes-256-gcm' || !obj.iv || !obj.tag || !obj.ciphertext) throw Error();
    const decipher = createDecipheriv('aes-256-gcm', secret, Buffer.from(obj.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(obj.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(obj.ciphertext, 'base64')), decipher.final()]);
  } catch { throw new Error('Backup authentication failed (wrong key, malformed file, or corruption).'); }
}
async function restrictWindowsAcl(target, directory = false) {
  if (process.platform !== 'win32') return;
  const identity = [process.env.USERDOMAIN, process.env.USERNAME].filter(Boolean).join('\\');
  if (!identity) throw new Error('Could not identify the Windows account for private backup ACLs.');
  await new Promise((resolve, reject) => {
    const rights = directory ? `${identity}:(OI)(CI)F` : `${identity}:F`;
    const child = spawn('icacls.exe', [target, '/inheritance:r', '/grant:r', rights], { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => reject(new Error('Could not apply private Windows backup ACLs.')));
    child.on('close', code => code === 0 ? resolve() : reject(new Error('Could not apply private Windows backup ACLs.')));
  });
}
async function run(command, argv, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, argv, { cwd: root, windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'], ...options });
    let err = ''; child.stderr.on('data', c => { err += c.toString(); });
    child.on('error', () => reject(new Error('Required local backup tool could not start.')));
    child.on('close', code => {
      if (code === 0) return resolve();
      if (options.safeDiagnostics) {
        const sqlstate = err.match(/\b(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1];
        const role = err.match(/role "([A-Za-z0-9_]+)" (?:does not exist|is a reserved role)/)?.[1];
        const cause = ['already exists', 'does not exist', 'permission denied', 'must be superuser', 'unrecognized configuration parameter'].find(message => err.includes(message));
        const detail = [sqlstate && `SQLSTATE ${sqlstate}`, role && `role ${role}`, cause].filter(Boolean).join(', ');
        return reject(new Error(`Database restore failed${detail ? ` (${detail})` : ''}; SQL and credentials suppressed.`));
      }
      reject(new Error(`Backup operation failed (${code}); sensitive command output suppressed.`));
    });
    if (options.input) child.stdin.end(options.input); else child.stdin.end();
  });
}
async function atomicPrivateWrite(file, bytes) {
  const tmp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, bytes, { flag: 'wx', mode: 0o600 });
    if (process.platform !== 'win32') await chmod(tmp, 0o600);
    else await restrictWindowsAcl(tmp);
    await link(tmp, file);
    await unlink(tmp);
  } catch (e) { await rm(tmp, { force: true }); throw e.code === 'EEXIST' ? new Error('Output already exists; refusing overwrite.') : e; }
}
async function capture(command, argv, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.on('error', () => reject(new Error('Required migration-history dump tool could not start.')));
    child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('Migration-history dump failed; sensitive output suppressed.')));
  });
}
export function authHistoryEnvironment(dryRun) {
  if (!dryRun.includes('--exclude-table "auth.schema_migrations"')) throw new Error('CLI Auth-history exclusion changed; review backup compatibility before running.');
  const values = [...dryRun.matchAll(/^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)="((?:\\"|[^"\r\n])*)"\r?$/gm)];
  if (values.length !== 5 || new Set(values.map(match => match[1])).size !== 5) throw new Error('CLI migration-history connection could not be safely resolved.');
  return Object.fromEntries(values.map(match => [match[1], match[2].replace(/\\"/g, '"')]));
}
async function dumpAuthHistory(source) {
  // Credentials become environment values; the expanded script is never executed.
  const dryRun = (await capture(process.execPath, [cli, 'db', 'dump', source === 'linked' ? '--linked' : '--local', '--data-only', '--schema', 'auth', '--dry-run'])).toString('utf8');
  const env = { ...process.env, ...authHistoryEnvironment(dryRun) };
  const flags = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'].flatMap(name => ['--env', name]);
  const bytes = await capture('docker', ['run', '--rm', '--network', 'host', '--entrypoint', 'pg_dump', ...flags, 'public.ecr.aws/supabase/postgres:15.8.1.085', '--data-only', '--table', 'auth.schema_migrations', '--quote-all-identifiers', '--no-owner', '--no-privileges', '--column-inserts'], env);
  return Buffer.from(bytes.toString('utf8').replace(/^\\(?:un)?restrict .*$/gm, '-- $&'));
}
function validateLoopback(value) {
  let u; try { u = new URL(value); } catch { throw new Error('Restore URL must point to a disposable loopback PostgreSQL container.'); }
  if (u.hostname !== '127.0.0.1' || !u.port || !['postgres:', 'postgresql:'].includes(u.protocol) || u.username !== 'postgres' || u.password || u.pathname !== '/postgres' || u.search || u.hash) throw new Error('Restore accepts only postgres@127.0.0.1:port/postgres targets with no embedded password.');
  return u;
}
async function verifyLocalDockerContext() {
  const endpoint = process.platform === 'win32' ? 'npipe:////./pipe/dockerDesktopLinuxEngine' : 'unix:///var/run/docker.sock';
  if (process.env.DOCKER_HOST && process.env.DOCKER_HOST.toLowerCase() !== endpoint.toLowerCase()) throw new Error('Restore requires the local Docker daemon.');
  const actual = await new Promise((resolve, reject) => {
    const child = spawn('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let out = ''; child.stdout.on('data', c => out += c); child.on('error', () => reject(new Error('Local Docker context could not be verified.')));
    child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error('Local Docker context could not be verified.')));
  });
  if (actual.toLowerCase() !== endpoint.toLowerCase()) throw new Error('Restore requires the local Docker daemon.');
}
async function main() {
  const { mode, file, url, container } = args(process.argv.slice(2)); const secret = key();
  if (mode === 'backup') {
    try { await lstat(file); throw new Error('Output already exists; refusing overwrite.'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const parent = await realpath(path.dirname(file)).catch(() => { throw new Error('Backup output directory must exist.'); });
    if (isWithin(await realpath(root), parent)) throw new Error('Encrypted backup output must be outside the repository, including through symlinks.');
    const output = path.join(parent, path.basename(file));
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'hco-f1-'));
    if (process.platform !== 'win32') await chmod(tmp, 0o700); else await restrictWindowsAcl(tmp, true);
    try {
      const parts = [];
      const source = process.env.F1_BACKUP_SOURCE || 'local';
      if (!['local', 'linked'].includes(source)) throw new Error('F1_BACKUP_SOURCE must be local or linked.');
      for (const [name, flags] of [['roles', ['--role-only']], ['schema', ['--schema', 'public,auth,hco_private']], ['data', ['--data-only', '--use-copy', '--schema', 'public,auth,hco_private']]]) {
        const target = path.join(tmp, `${name}.sql`);
        await run(process.execPath, [cli, 'db', 'dump', source === 'linked' ? '--linked' : '--local', ...flags, '--file', target]);
        const sql = await readFile(target);
        parts.push(Buffer.from(`\n-- HCO-F1 ${name} SHA256=${createHash('sha256').update(sql).digest('hex')}\n`), sql);
      }
      const history = await dumpAuthHistory(source);
      parts.push(Buffer.from(`\n-- HCO-F1 auth-history SHA256=${createHash('sha256').update(history).digest('hex')}\n`), history);
      await atomicPrivateWrite(output, encrypt(Buffer.concat(parts), secret));
      decrypt(await readFile(output), secret);
      const archiveSha256 = createHash('sha256').update(await readFile(output)).digest('hex');
      process.stdout.write(JSON.stringify({ status: 'backup_verified', sha256: archiveSha256 }) + '\n');
    } finally { await rm(tmp, { recursive: true, force: true }); }
  } else {
    const plain = decrypt(await readFile(file), secret);
    if (!plain.length || !plain.includes(Buffer.from('CREATE TABLE')) || !plain.includes(Buffer.from('INSERT INTO')) && !plain.includes(Buffer.from('COPY '))) throw new Error('Authenticated backup is incomplete or empty.');
    if (mode === 'verify') {
      process.stdout.write(JSON.stringify({ status: 'authenticated', plaintext_sha256: createHash('sha256').update(plain).digest('hex') }) + '\n'); return;
    }
    const targetUrl = validateLoopback(url);
    await verifyLocalDockerContext();
    if (!/^f1-restore-[a-f0-9-]+$/.test(container)) throw new Error('Restore target must be a named F1 disposable container.');
    const inspected = await new Promise((resolve, reject) => {
      const child = spawn('docker', ['inspect', '--format', '{{json .}}', container], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      let out = ''; child.stdout.on('data', c => out += c); child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error('Disposable restore container was not found.')));
    });
    let details; try { details = JSON.parse(inspected); } catch { throw new Error('Disposable restore container details could not be verified.'); }
    const bindings = details.NetworkSettings?.Ports?.['5432/tcp'];
    if (details.Name !== `/${container}` || details.Config?.Image !== 'public.ecr.aws/supabase/postgres:15.8.1.085' || details.Config?.Labels?.['com.hco.f1-disposable'] !== 'true' || details.State?.Running !== true || !Array.isArray(bindings) || bindings.length !== 1 || bindings[0].HostIp !== '127.0.0.1' || bindings[0].HostPort !== targetUrl.port) throw new Error('Restore URL must match the exact running, labeled Supabase Postgres container and its loopback port.');
    const managedRoles = [...new Set([...plain.toString('utf8').matchAll(/\b(?:TO|OWNER TO|ROLE)\s+"(supabase_[a-zA-Z0-9_]+)"/g)].map(match => match[1]))];
    const bootstrap = managedRoles.map(role => `DO $f1$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE "${role}" NOLOGIN; END IF; END $f1$;`).join('\n');
    const restorePassword = process.env.F1_RESTORE_PASSWORD;
    if (!restorePassword) throw new Error('F1_RESTORE_PASSWORD must be supplied through the operator environment for the disposable target.');
    // The image includes older Auth tables. Replace only the archived schemas, inside
    // the already verified disposable target and the same atomic restore transaction.
    const resetSchemas = 'DROP SCHEMA IF EXISTS hco_private CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS public CASCADE;';
    const psql = 'IFS= read -r PGPASSWORD; export PGPASSWORD; exec psql --no-psqlrc --single-transaction --set ON_ERROR_STOP=1 --set VERBOSITY=verbose --username supabase_admin --dbname postgres';
    await run('docker', ['exec', '-i', container, 'sh', '-c', psql], {
      input: Buffer.concat([Buffer.from(`${restorePassword}\n${bootstrap}\n${resetSchemas}\n`), plain]),
      safeDiagnostics: true
    });
    process.stdout.write(JSON.stringify({ status: 'restore_applied', plaintext_sha256: createHash('sha256').update(plain).digest('hex') }) + '\n');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(`${error.message || 'Backup operation failed.'}\n`); process.exitCode = 1; });
}
