import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Operator-only runner. Its credentials are never shipped to the browser. Schedules are prepared separately, inactive. */
export function operationTarget(url, key, hostedApproved = false) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('An explicit Supabase API origin is required.');
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/')
    throw new Error('Use an API origin without credentials or a path.');
  if (!key || typeof key !== 'string' || /\s/.test(key))
    throw new Error('A service key from the operator environment is required.');
  if (
    local
      ? parsed.protocol !== 'http:'
      : parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')
  )
    throw new Error('Unexpected Supabase API target.');
  if (!local && !hostedApproved) throw new Error('Hosted operation needs Ethan’s approval.');
  return { origin: parsed.origin, key };
}

async function rpc(target, name, args, fetcher) {
  let response;
  try {
    response = await fetcher(target.origin + '/rest/v1/rpc/' + name, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: {
        apikey: target.key,
        ...(!target.key.startsWith('sb_secret_') ? { Authorization: 'Bearer ' + target.key } : {}),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args)
    });
  } catch {
    throw new Error('Operation connection failed.');
  }
  if (!response.ok) throw new Error('Operation was refused (HTTP ' + response.status + ').');
  // A void function (record_operations_run) is answered 204 No Content with an empty body.
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new Error('Operation returned an unreadable result.');
  }
}

export async function reportOperation(job, status, archiveSha256 = null, options = {}) {
  const target = operationTarget(
    options.url ?? process.env.F1_SUPABASE_URL,
    options.key ?? process.env.F1_SERVICE_KEY,
    options.hostedApproved ?? false
  );
  return rpc(
    target,
    'record_operations_run',
    {
      p_job: job,
      p_status: status,
      p_run_id: options.runId ?? randomUUID(),
      p_completed_at: (options.now?.() ?? new Date()).toISOString(),
      p_archive_sha256: archiveSha256
    },
    options.fetcher ?? fetch
  );
}

export async function runOperation(job, options = {}) {
  if (!['retention', 'keepalive'].includes(job)) throw new Error('Choose retention or keepalive.');
  const target = operationTarget(
    options.url ?? process.env.F1_SUPABASE_URL,
    options.key ?? process.env.F1_SERVICE_KEY,
    options.hostedApproved ?? false
  );
  const fetcher = options.fetcher ?? fetch;
  try {
    const data = await rpc(
      target,
      job === 'retention' ? 'prune_personal_data' : 'get_operations_health',
      job === 'retention' ? { p_retain_days: 365 } : {},
      fetcher
    );
    if (
      job === 'retention'
        ? !Number.isInteger(data) || data < 0
        : !data ||
          typeof data.checked_at !== 'string' ||
          !Number.isFinite(Date.parse(data.checked_at)) ||
          !data.jobs
    )
      throw new Error('Operation result was not understood.');
    // Retention records success transactionally inside its RPC. Keep-alive proves a real query before recording success.
    if (job === 'keepalive') await reportOperation(job, 'success', null, { ...options, fetcher });
    return { job, status: 'success' };
  } catch (error) {
    try {
      await reportOperation(job, 'failed', null, { ...options, fetcher });
    } catch {
      /* A failed reporter must never turn a failed operation into a success. */
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOperation(process.argv[2], { hostedApproved: process.argv.includes('--hosted-approved') })
    .then((result) => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch(() => {
      process.stderr.write('Operation failed; no successful result is claimed.\n');
      process.exitCode = 1;
    });
}
