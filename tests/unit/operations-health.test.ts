import { describe, expect, it } from 'vitest';
import { healthView, parseOperationsHealth } from '@/lib/data/operations-health';

const now = Date.parse('2026-10-02T04:00:00Z');
const run = (age = 0, status = 'success') => ({
  status,
  completed_at: new Date(now - age).toISOString(),
  archive_sha256: 'a'.repeat(64)
});
const wire = () => ({
  checked_at: new Date(now).toISOString(),
  jobs: Object.fromEntries(
    ['backup', 'restore', 'retention', 'keepalive'].map((job) => [
      job,
      {
        last_run: run(),
        last_success: run()
      }
    ])
  )
});

describe('F1 operational health uses evidence rather than demo flags', () => {
  it('never reports healthy before a status read, or after a failed read', () => {
    expect(healthView(null, 'loading', now, 0, true).healthOk).toBe(false);
    const data = parseOperationsHealth(wire());
    expect(healthView(data, 'error', now, 0, true).healthOk).toBe(false);
    expect(healthView(data, 'ready', now, 0, true).healthOk).toBe(true);
  });
  it('a failed latest backup is not hidden by an earlier successful backup', () => {
    const data = wire();
    data.jobs.backup!.last_run = run(0, 'failed');
    const view = healthView(parseOperationsHealth(data), 'ready', now, 0, true);
    expect(view.healthOk).toBe(false);
    expect(
      view.healthRows.find((row) => row.label === 'Encrypted database backup')?.value
    ).toContain('Failed');
    expect(view.healthRows.find((row) => row.label === 'Encrypted database backup')?.good).toBe(
      false
    );
    const firstFailure = {
      ...wire(),
      jobs: {
        ...wire().jobs,
        backup: { last_run: { ...run(0, 'failed'), archive_sha256: null }, last_success: null }
      }
    };
    expect(parseOperationsHealth(firstFailure)).not.toBeNull();
  });
  it('missing jobs, overdue backups and overdue status reads need attention', () => {
    const data = wire();
    data.jobs.backup!.last_run = run(9 * 86_400_000);
    data.jobs.backup!.last_success = run(9 * 86_400_000);
    expect(healthView(parseOperationsHealth(data), 'ready', now, 0, true).healthOk).toBe(false);
    expect(
      healthView(parseOperationsHealth(wire()), 'ready', now + 6 * 60_000, 0, true).healthOk
    ).toBe(false);
    const missing = {
      ...wire(),
      jobs: { ...wire().jobs, backup: { last_run: null, last_success: null } }
    };
    expect(
      healthView(parseOperationsHealth(missing), 'ready', now, 0, true).healthRows[1]?.value
    ).toContain('Not yet');
  });
  it('a queue or offline device prevents a healthy headline even with current successful jobs', () => {
    const data = parseOperationsHealth(wire());
    expect(healthView(data, 'ready', now, 1, true).healthOk).toBe(false);
    expect(healthView(data, 'ready', now, 0, false).healthOk).toBe(false);
    expect(healthView(data, 'ready', now, -1, true).healthOk).toBe(false);
  });
  it('rejects malformed, inconsistent and unrecognised service answers', () => {
    const good = wire();
    for (const bad of [
      null,
      {},
      { ...good, checked_at: 'yesterday' },
      {
        ...good,
        jobs: { ...good.jobs, backup: { last_run: run(), last_success: run(0, 'failed') } }
      },
      {
        ...good,
        jobs: {
          ...good.jobs,
          backup: { last_run: { ...run(), archive_sha256: 'bad' }, last_success: run() }
        }
      }
    ])
      expect(parseOperationsHealth(bad)).toBeNull();
  });
});
