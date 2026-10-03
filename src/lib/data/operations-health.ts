import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { OpsVals } from '@/view-models/vals';

// Object construction probes dynamic evaluation unless configured first; the live CSP forbids it.
z.config({ jitless: true });
const stamp = z.string().datetime({ offset: true });
const run = z
  .object({
    status: z.enum(['success', 'failed']),
    completed_at: stamp,
    archive_sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
  })
  .strict();
const job = z.object({ last_run: run.nullable(), last_success: run.nullable() }).strict();
const schema = z
  .object({
    checked_at: stamp,
    jobs: z.object({ backup: job, restore: job, retention: job, keepalive: job }).strict()
  })
  .strict();
export type OperationsHealth = z.infer<typeof schema>;
export type HealthPhase = 'loading' | 'ready' | 'error';
export type OperationsClient = Pick<SupabaseClient<Database>, 'rpc'>;
export type LiveAlert = {
  k: 'health' | 'orders' | 'inventory' | 'grocery' | 'today';
  label: string;
  sub: string;
  tone: 'bad' | 'warn' | 'info' | 'ok';
  urgency: string;
  go: () => void;
};

export function parseOperationsHealth(value: unknown): OperationsHealth | null {
  const result = schema.safeParse(value);
  if (!result.success) return null;
  const data = result.data;
  for (const [name, state] of Object.entries(data.jobs)) {
    const latest = state.last_run,
      success = state.last_success;
    if (
      success &&
      (!latest ||
        success.status !== 'success' ||
        Date.parse(success.completed_at) > Date.parse(latest.completed_at))
    )
      return null;
    for (const item of [latest, success]) {
      if (!item) continue;
      if (Date.parse(item.completed_at) > Date.parse(data.checked_at)) return null;
      if (
        item.status === 'success' &&
        (name === 'backup' || name === 'restore') &&
        !item.archive_sha256
      )
        return null;
    }
    if (
      latest?.status === 'success' &&
      (!success ||
        latest.completed_at !== success.completed_at ||
        latest.archive_sha256 !== success.archive_sha256)
    )
      return null;
  }
  return data;
}

export async function fetchOperationsHealth(client: OperationsClient): Promise<OperationsHealth> {
  const { data, error } = await client.rpc('get_operations_health');
  if (error) throw new Error('System health could not be checked.');
  const parsed = parseOperationsHealth(data);
  if (!parsed) throw new Error('System health answer was not understood.');
  return parsed;
}

const DAY = 86_400_000;
const jobs = [
  [
    'backup',
    'Encrypted database backup',
    8 * DAY,
    'Weekly database copy. Storage images need a separate off-device copy.'
  ],
  [
    'restore',
    'Restore drill',
    31 * DAY,
    'A successful drill verifies a copy in a disposable database.'
  ],
  [
    'retention',
    'Customer data retention',
    2 * DAY,
    'Daily clearing of name, phone, Instagram and add-on-note fields on orders older than one year. Financial records remain.'
  ],
  [
    'keepalive',
    'Keep-alive',
    2 * DAY,
    'Database activity check; this cannot guarantee the provider will never pause a project.'
  ]
] as const;
const when = (value: string) =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));

/** No green claim on a missing read, failed job or stale result. These are technical status records, not customer data. */
export function healthView(
  data: OperationsHealth | null,
  phase: HealthPhase,
  now: number,
  pending: number,
  online: boolean
): Pick<OpsVals, 'healthRows' | 'healthOk' | 'healthTitle' | 'healthSub'> {
  const fresh =
    phase === 'ready' &&
    data !== null &&
    now >= Date.parse(data.checked_at) - 60_000 &&
    now - Date.parse(data.checked_at) <= 5 * 60_000;
  const rows: OpsVals['healthRows'] = [
    {
      label: 'Database connection',
      value:
        fresh && online
          ? 'Checked ' + when(data.checked_at)
          : phase === 'loading'
            ? 'Checking'
            : 'Could not verify current health',
      bad: !fresh || !online,
      good: fresh && online,
      retry: false,
      hint: online
        ? 'Only a successful live database response verifies this connection.'
        : 'This device is offline. Last known results do not prove current server health.'
    }
  ];
  for (const [key, label, maxAge, hint] of jobs) {
    const state = data?.jobs[key],
      latest = state?.last_run,
      success = state?.last_success;
    const good =
      fresh &&
      online &&
      latest?.status === 'success' &&
      !!success &&
      now - Date.parse(success.completed_at) <= maxAge;
    rows.push({
      label,
      value: !latest
        ? 'Not yet recorded — activation pending'
        : latest.status === 'failed'
          ? 'Failed ' + when(latest.completed_at)
          : good
            ? 'Completed ' + when(latest.completed_at)
            : 'Last completed ' + when(latest.completed_at) + ' — needs checking',
      hint:
        hint +
        (latest?.status === 'failed' && success
          ? ' Last success: ' + when(success.completed_at) + '.'
          : ''),
      bad: !good,
      good,
      retry: false
    });
  }
  rows.push({
    label: 'Bazaar sync',
    value:
      pending < 0
        ? 'Queue storage not verified'
        : pending > 0
          ? `${pending} queued command(s)`
          : 'No queued commands on this device',
    hint: 'Only matching server acknowledgments remove queued sales. Other selling devices are not checked here.',
    bad: pending !== 0,
    good: pending === 0,
    retry: false
  });
  rows.push({
    label: 'Bookkeeping CSV',
    value: 'Owner download available',
    hint: 'The books CSV contains bookkeeping lines; it is not a database backup.',
    bad: false,
    good: false,
    retry: false
  });
  const ok = rows.every((row) => !row.bad);
  return {
    healthRows: rows,
    healthOk: ok,
    healthTitle:
      phase === 'loading' ? 'Checking system health' : ok ? 'Healthy' : 'Needs attention',
    healthSub: ok
      ? 'Recorded backup, restore, retention and activity checks are current.'
      : 'Check the results below. Missing or old results do not prove the data is protected.'
  };
}
