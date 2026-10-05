import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The maintenance jobs (slice A4): weekly backup, daily keep-alive, daily retention. They are
// written and OFF. One repository variable, OPS_JOBS_ENABLED, turns them on; Ethan sets it
// after choosing where the encrypted archive lives and adding the secrets
// (docs/state/F1-operations.md). No script sets it.
//
// The opposite default to the release hold: a typo here must stay OFF, so only a clear "on"
// enables. Times are UTC; Manila is UTC+8 (docs/state/F1-schedule.example.json).
export const CRON_JOBS = Object.freeze({
  '0 0 * * 1': 'backup', // Monday 08:00 Manila
  '0 0 * * *': 'keepalive', // daily 08:00 Manila
  '0 18 * * *': 'retention' // daily 02:00 Manila
});
const JOBS = new Set(Object.values(CRON_JOBS));
const ON = new Set(['1', 'true', 'on', 'yes']);

/** Which of the three jobs the gate lets run for this trigger. Pure: reads nothing, calls nothing. */
export function opsJobsDecision({ enabled, event, schedule, requested } = {}) {
  const setting = String(enabled ?? '')
    .trim()
    .toLowerCase();
  if (!ON.has(setting))
    return {
      jobs: [],
      reason: `OPS_JOBS_ENABLED is off (${JSON.stringify(setting)}): no maintenance job runs.`
    };
  const job =
    event === 'schedule'
      ? CRON_JOBS[schedule ?? '']
      : event === 'workflow_dispatch'
        ? requested
        : undefined;
  if (!JOBS.has(job))
    return {
      jobs: [],
      reason: `OPS_JOBS_ENABLED is on, but ${JSON.stringify(event ?? '')} does not name a maintenance job: nothing runs.`
    };
  return { jobs: [job], reason: `OPS_JOBS_ENABLED is on: running the ${job} job.` };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { jobs, reason } = opsJobsDecision({
    enabled: process.env.OPS_JOBS_ENABLED,
    event: process.env.EVENT_NAME,
    schedule: process.env.EVENT_SCHEDULE,
    requested: process.env.REQUESTED_JOB
  });
  console.log(reason);
  if (process.env.GITHUB_OUTPUT)
    for (const job of JOBS)
      appendFileSync(process.env.GITHUB_OUTPUT, `${job}=${jobs.includes(job)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${reason}\n`);
}
