import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { releaseHoldDecision } from '../../scripts/release-hold.mjs';

/**
 * Slice A3, part 2: the release hold. One repository variable, RELEASE_HOLD, read by the
 * owner-trial workflow before anything deploys. On, a green push builds and tests but does
 * not deploy. Ethan sets and lifts it; nothing here sets it.
 */
describe('releaseHoldDecision', () => {
  it.each([undefined, null, '', '   ', 'false', 'FALSE ', '0', 'off', 'no', 'No'])(
    'deploys when the hold is off (%j)',
    (value) => {
      expect(releaseHoldDecision(value).deploy).toBe(true);
    }
  );

  it.each(['true', 'True', ' TRUE ', '1', 'on', 'ON', 'yes', 'Yes'])(
    'holds when the hold is on (%j)',
    (value) => {
      expect(releaseHoldDecision(value).deploy).toBe(false);
    }
  );

  // A typo must not deploy during the bazaar: anything not clearly "off" holds.
  it.each(['ture', 'maybe', 'hold', 'enabled', '2'])(
    'holds on an unrecognised value (%j)',
    (value) => {
      expect(releaseHoldDecision(value).deploy).toBe(false);
    }
  );

  it('says why in one line that names the variable', () => {
    const held = releaseHoldDecision('true').reason;
    expect(held).not.toMatch(/\n/);
    expect(held).toContain('RELEASE_HOLD');
    expect(held.toLowerCase()).toContain('not deployed');
    const open = releaseHoldDecision('').reason;
    expect(open).not.toMatch(/\n/);
    expect(open).toContain('RELEASE_HOLD');
  });
});

describe('owner-trial workflow: hold on means no deploy', () => {
  const workflow = readFileSync('.github/workflows/owner-trial.yml', 'utf8').replace(/\r\n/g, '\n');
  const deployJob = workflow.slice(workflow.indexOf('\n  deploy:'));
  const steps = deployJob
    .split(/\n {6}- /)
    .slice(1)
    .map((step) => '- ' + step);
  const holdAt = steps.findIndex((step) => /\bid: hold\b/.test(step));
  const gate = /if: steps\.hold\.outputs\.deploy == 'true'/;

  it('reads the variable in a step that runs before any deploy step', () => {
    expect(holdAt).toBeGreaterThanOrEqual(0);
    expect(steps[holdAt]).toContain('RELEASE_HOLD: ${{ vars.RELEASE_HOLD }}');
    expect(steps[holdAt]).toContain('scripts/release-hold.mjs');
  });

  it('puts the hold step before anything that installs, downloads, reads a secret or deploys', () => {
    const before = steps.slice(0, holdAt).join('\n');
    expect(before).not.toMatch(/secrets\./);
    expect(before).not.toContain('check-owner-trial-release');
    expect(before).not.toContain('download-artifact');
    expect(before).not.toContain('pnpm install');
  });

  it('gates every step after it on the decision', () => {
    const after = steps.slice(holdAt + 1);
    expect(after.length).toBeGreaterThan(0);
    for (const step of after) expect(step, step.split('\n')[0]).toMatch(gate);
  });

  it('runs the guarded deploy script only behind the gate', () => {
    const deploying = steps.filter((step) => step.includes('check-owner-trial-release.mjs'));
    expect(deploying).toHaveLength(1);
    expect(deploying[0]).toMatch(gate);
  });

  it('leaves the quality job unconditioned by the hold, so a held push still builds and tests', () => {
    const quality = workflow.slice(
      workflow.indexOf('\n  quality:'),
      workflow.indexOf('\n  deploy:')
    );
    expect(quality).not.toContain('RELEASE_HOLD');
    expect(quality).toContain('pnpm verify:release');
  });
});
