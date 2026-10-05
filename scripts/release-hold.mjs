import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The release hold (slice A3). One repository variable, RELEASE_HOLD, read by the owner-trial
// workflow before anything deploys. While it is on, a green push builds and tests but does not
// deploy. Ethan sets and lifts it in the repository's Actions variables; no script sets it.
//
// Off is a short list of clear "no" values. Any other value counts as ON: a typo must not
// deploy to the selling phone between the rehearsal and the bazaar.
const OFF = new Set(['', '0', 'false', 'off', 'no']);

export function releaseHoldDecision(value) {
  const setting = String(value ?? '')
    .trim()
    .toLowerCase();
  if (OFF.has(setting))
    return { deploy: true, reason: 'RELEASE_HOLD is off: the release continues to deploy.' };
  return {
    deploy: false,
    reason: `RELEASE_HOLD is on (${JSON.stringify(setting)}): built and tested, not deployed.`
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { deploy, reason } = releaseHoldDecision(process.env.RELEASE_HOLD);
  console.log(reason);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\n`);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${reason}\n`);
}
