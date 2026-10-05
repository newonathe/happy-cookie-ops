import { describe, expect, it } from 'vitest';
import {
  healthView,
  parseOperationsHealth,
  SETUP_PENDING_COPY
} from '@/lib/data/operations-health';

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
  describe('backups not switched on yet (UX review, proposal 2)', () => {
    const never = { last_run: null, last_success: null };
    const neverRun = () => ({
      checked_at: new Date(now).toISOString(),
      jobs: { backup: never, restore: never, retention: never, keepalive: never } as Record<
        string,
        unknown
      >
    });
    const jobLabels = [
      'Encrypted database backup',
      'Restore drill',
      'Customer data retention',
      'Keep-alive'
    ];
    const jobRows = (view: ReturnType<typeof healthView>) =>
      view.healthRows.filter((row) => jobLabels.includes(String(row.label)));

    it('a current read showing no job has ever run keeps the facts, raises nothing and claims nothing', () => {
      const view = healthView(parseOperationsHealth(neverRun()), 'ready', now, 0, true);
      expect(view.setupPending).toBe(true);
      expect(jobRows(view)).toHaveLength(4);
      for (const row of jobRows(view)) {
        expect(row.value).toBe('Not yet recorded — activation pending');
        expect(row.bad).toBe(false);
        expect(row.good).toBe(false);
      }
      expect(view.healthRows.some((row) => row.bad)).toBe(false);
      expect(view.healthOk).toBe(false);
      expect(view.healthTitle).toBe(SETUP_PENDING_COPY.title);
      expect(view.healthSub).toBe(SETUP_PENDING_COPY.sub);
      expect(String(view.healthTitle) + String(view.healthSub)).not.toMatch(/Healthy|current/);
    });
    it('one failed job ends the quiet state for every job, including those that never ran', () => {
      const data = neverRun();
      data.jobs.backup = {
        last_run: { ...run(0, 'failed'), archive_sha256: null },
        last_success: null
      };
      const view = healthView(parseOperationsHealth(data), 'ready', now, 0, true);
      expect(view.setupPending).toBe(false);
      expect(jobRows(view)).toHaveLength(4);
      expect(jobRows(view).every((row) => row.bad)).toBe(true);
      expect(jobRows(view)[0]?.value).toContain('Failed');
      expect(view.healthTitle).toBe('Needs attention');
    });
    it('once backups run, a restore drill that never ran needs attention', () => {
      const data = { ...wire(), jobs: { ...wire().jobs, restore: never } };
      const view = healthView(parseOperationsHealth(data), 'ready', now, 0, true);
      expect(view.setupPending).toBe(false);
      expect(view.healthRows.find((row) => row.label === 'Restore drill')?.bad).toBe(true);
      expect(view.healthRows.find((row) => row.label === 'Encrypted database backup')?.good).toBe(
        true
      );
      expect(view.healthOk).toBe(false);
    });
    it('a stale, failed, loading or missing read is never the quiet state', () => {
      const data = parseOperationsHealth(neverRun());
      expect(data).not.toBeNull();
      for (const view of [
        healthView(data, 'ready', now + 6 * 60_000, 0, true),
        healthView(data, 'error', now, 0, true),
        healthView(null, 'loading', now, 0, true),
        healthView(null, 'error', now, 0, true),
        healthView(null, 'ready', now, 0, true)
      ]) {
        expect(view.setupPending).toBe(false);
        expect(jobRows(view)).toHaveLength(4);
        expect(jobRows(view).every((row) => row.bad)).toBe(true);
        expect(view.healthTitle).not.toBe(SETUP_PENDING_COPY.title);
      }
    });
    it('a queue or an offline device still needs attention while backups are not set up', () => {
      const data = parseOperationsHealth(neverRun());
      for (const view of [
        healthView(data, 'ready', now, 2, true),
        healthView(data, 'ready', now, -1, true),
        healthView(data, 'ready', now, 0, false)
      ]) {
        expect(view.healthTitle).toBe('Needs attention');
        expect(view.healthOk).toBe(false);
        expect(view.healthRows.some((row) => row.bad)).toBe(true);
      }
    });
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
