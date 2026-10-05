import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRON_JOBS, opsJobsDecision } from '../../scripts/ops-jobs.mjs';

/**
 * Slice A4: the maintenance jobs (weekly backup, daily keep-alive, daily retention) are
 * written and OFF. One repository variable, OPS_JOBS_ENABLED, turns them on; Ethan sets it
 * after choosing where the encrypted archive lives and adding the secrets. Nothing here sets
 * it. Unlike the release hold, a typo must stay OFF: only a clear "on" enables.
 */
const off = { jobs: [] };

describe('opsJobsDecision', () => {
  it.each([undefined, null, '', '   ', 'false', '0', 'off', 'no', 'ture', 'enabled', 'maybe'])(
    'runs nothing unless the switch is clearly on (%j)',
    (enabled) => {
      expect(opsJobsDecision({ enabled, event: 'schedule', schedule: '0 0 * * 1' })).toMatchObject(
        off
      );
    }
  );

  it.each(['true', 'True', ' TRUE ', '1', 'on', 'yes'])('is on for %j', (enabled) => {
    expect(opsJobsDecision({ enabled, event: 'schedule', schedule: '0 0 * * 1' }).jobs).toEqual([
      'backup'
    ]);
  });

  it('maps each schedule to exactly one job', () => {
    expect(CRON_JOBS).toEqual({
      '0 0 * * 1': 'backup',
      '0 0 * * *': 'keepalive',
      '0 18 * * *': 'retention'
    });
    for (const [cron, job] of Object.entries(CRON_JOBS))
      expect(opsJobsDecision({ enabled: 'true', event: 'schedule', schedule: cron }).jobs).toEqual([
        job
      ]);
  });

  it('runs nothing for a schedule it does not know', () => {
    expect(
      opsJobsDecision({ enabled: 'true', event: 'schedule', schedule: '*/5 * * * *' }).jobs
    ).toEqual([]);
  });

  it('a manual run names one job, and runs it only while the switch is on', () => {
    for (const job of ['backup', 'keepalive', 'retention']) {
      expect(
        opsJobsDecision({ enabled: 'true', event: 'workflow_dispatch', requested: job }).jobs
      ).toEqual([job]);
      expect(
        opsJobsDecision({ enabled: '', event: 'workflow_dispatch', requested: job }).jobs
      ).toEqual([]);
    }
    expect(
      opsJobsDecision({ enabled: 'true', event: 'workflow_dispatch', requested: 'all' }).jobs
    ).toEqual([]);
    expect(opsJobsDecision({ enabled: 'true', event: 'workflow_dispatch' }).jobs).toEqual([]);
  });

  it('runs nothing for any other trigger, switch on or off', () => {
    for (const event of ['push', 'pull_request', 'workflow_call', ''])
      expect(opsJobsDecision({ enabled: 'true', event, schedule: '0 0 * * 1' }).jobs).toEqual([]);
  });

  it('says why in one line that names the variable', () => {
    for (const input of [
      { enabled: '', event: 'schedule', schedule: '0 0 * * 1' },
      { enabled: 'true', event: 'schedule', schedule: '0 0 * * 1' },
      { enabled: 'true', event: 'push' }
    ]) {
      const { reason } = opsJobsDecision(input);
      expect(reason).not.toMatch(/\n/);
      expect(reason).toContain('OPS_JOBS_ENABLED');
    }
  });
});

describe('ops-jobs workflow: off means no job runs and no secret is read', () => {
  const workflow = readFileSync('.github/workflows/ops-jobs.yml', 'utf8').replace(/\r\n/g, '\n');
  const jobsAt = workflow.indexOf('\njobs:\n');
  const header = workflow.slice(0, jobsAt);
  const blocks = workflow
    .slice(jobsAt + '\njobs:\n'.length)
    .split(/\n(?=  [A-Za-z0-9_-]+:\n)/)
    .map((block) => [/^ {2}([A-Za-z0-9_-]+):/.exec(block)?.[1] ?? '', block] as const);
  const jobs = Object.fromEntries(blocks);
  const gated = ['backup', 'keepalive', 'retention'];
  const secretsIn = (text: string) =>
    [...text.matchAll(/\bsecrets(?:\.[A-Z_]+|\[)/g)].map((m) => m[0]);

  it('has the gate and the three jobs, and nothing else (a new job cannot hide in another block)', () => {
    expect(blocks.map(([name]) => name).sort()).toEqual([
      'backup',
      'gate',
      'keepalive',
      'retention'
    ]);
  });

  it('is triggered only by a schedule or by hand, never by anything else', () => {
    const on = workflow.slice(workflow.indexOf('\non:\n') + 4, workflow.indexOf('\npermissions:'));
    expect([...on.matchAll(/^ {2}([a-z_]+):/gm)].map((m) => m[1]).sort()).toEqual([
      'schedule',
      'workflow_dispatch'
    ]);
    expect(workflow).not.toMatch(/^on: /m);
  });

  it('keeps every cron in step with the decision script and with the written schedule', () => {
    const crons = [...header.matchAll(/- cron: '([^']+)'/g)].map((m) => m[1]).sort();
    expect(crons).toEqual(Object.keys(CRON_JOBS).sort());
    const written = JSON.parse(readFileSync('docs/state/F1-schedule.example.json', 'utf8')) as {
      jobs: Array<{ job: string; cronUtc: string }>;
    };
    expect(Object.fromEntries(written.jobs.map((j) => [j.cronUtc, j.job]))).toEqual(CRON_JOBS);
  });

  it('reads the switch in a gate that touches no secret and calls no hosted API', () => {
    expect(jobs.gate).toContain('OPS_JOBS_ENABLED: ${{ vars.OPS_JOBS_ENABLED }}');
    expect(jobs.gate).toContain('run: node scripts/ops-jobs.mjs');
    expect(jobs.gate).not.toMatch(/secret/i);
    expect(jobs.gate).not.toMatch(/hosted-approved|supabase/i);
  });

  it.each(gated)('%s needs the gate, its own output and the main branch, on exact lines', (job) => {
    expect(jobs[job]).toMatch(/^ {4}needs: gate$/m);
    expect(jobs[job]).toMatch(
      new RegExp(
        `^ {4}if: github\.ref == 'refs/heads/main' && needs\.gate\.outputs\.${job} == 'true'$`,
        'm'
      )
    );
    expect(jobs[job]).toMatch(/^ {4}runs-on: ubuntu-latest$/m);
    expect(jobs[job]).not.toMatch(/\bpermissions:/);
  });

  it('reads only the secrets each job is meant to, in no other form', () => {
    expect(header.replace(/^#.*$/gm, '')).not.toMatch(/secrets/);
    expect(secretsIn(jobs.gate)).toEqual([]);
    expect(secretsIn(jobs.keepalive)).toEqual(['secrets.OPS_SERVICE_KEY']);
    expect(secretsIn(jobs.retention)).toEqual(['secrets.OPS_SERVICE_KEY']);
    expect(secretsIn(jobs.backup).sort()).toEqual([
      'secrets.OPS_BACKUP_KEY',
      'secrets.OPS_SUPABASE_ACCESS_TOKEN',
      'secrets.OPS_SUPABASE_DB_PASSWORD'
    ]);
    expect(workflow).not.toMatch(/secrets\[|toJSON\(secrets|\$\{\{ *secrets *\}\}/);
  });

  it('nothing is allowed to fail open or be skipped past', () => {
    expect(workflow).not.toMatch(/continue-on-error/);
    expect(workflow).not.toMatch(/\bif: (false|true|always\(\)|\$\{\{ *always)/);
  });

  it('only the keep-alive and retention jobs may pass the hosted-approval flag', () => {
    expect([...workflow.replace(/^ *#.*$/gm, '').matchAll(/--hosted-approved/g)]).toHaveLength(2);
    expect(jobs.backup).not.toContain('--hosted-approved');
    expect(jobs.keepalive).toContain('--hosted-approved');
    expect(jobs.retention).toContain('--hosted-approved');
  });

  it('the backup job fails closed on custody before it installs anything or reads a secret', () => {
    const steps = jobs.backup.split(/\n {6}- (?=name:|uses:|run:)/);
    const custody = steps.findIndex((step) => /name: Custody is not decided/.test(step));
    expect(custody).toBeGreaterThan(0);
    expect(steps[custody]).toContain('exit 1');
    expect(steps[custody]).not.toMatch(/\bif:|continue-on-error/);
    const before = steps.slice(0, custody).join('\n');
    expect(before).not.toMatch(/secrets|pnpm|supabase|f1-backup/);
    expect(steps[custody]).toMatch(/custody/i);
    expect(jobs.backup).not.toMatch(
      /upload-artifact|actions\/cache|scp |rsync|aws |s3:|gdrive|rclone/i
    );
  });

  it('every checkout drops the token, and the token is read-only', () => {
    const checkouts = [...workflow.matchAll(/uses: actions\/checkout@/g)].length;
    expect(checkouts).toBe(4);
    expect([...workflow.matchAll(/persist-credentials: false/g)].length).toBe(checkouts);
    expect(header).toMatch(/\npermissions:\n {2}contents: read\n/);
  });

  it('the gate script writes every output false while off, and exactly one true when on', () => {
    const run = (env: Record<string, string>) => {
      const out = path.join(mkdtempSync(path.join(os.tmpdir(), 'ops-jobs-')), 'output');
      spawnSync(process.execPath, ['scripts/ops-jobs.mjs'], {
        env: { NODE_ENV: 'test', PATH: process.env.PATH ?? '', GITHUB_OUTPUT: out, ...env },
        encoding: 'utf8'
      });
      return readFileSync(out, 'utf8').trim().split('\n').sort();
    };
    const base = { EVENT_NAME: 'schedule', EVENT_SCHEDULE: '0 0 * * 1' };
    expect(run({ ...base, OPS_JOBS_ENABLED: '' })).toEqual([
      'backup=false',
      'keepalive=false',
      'retention=false'
    ]);
    expect(run({ ...base, OPS_JOBS_ENABLED: 'true' })).toEqual([
      'backup=true',
      'keepalive=false',
      'retention=false'
    ]);
  });
});
