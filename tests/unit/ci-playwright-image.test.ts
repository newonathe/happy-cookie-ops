import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The browser and visual jobs run inside the Playwright image instead of installing browsers on the runner (19 November
 * 2026: the install fetched system libraries from a slow mirror for 36 minutes). The image's browsers only match the
 * test runner when its tag equals the pinned @playwright/test version, so an upgrade must move both together.
 */
describe('CI Playwright image', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const pinned = (
    JSON.parse(readFileSync('package.json', 'utf8')) as {
      devDependencies: Record<string, string>;
    }
  ).devDependencies['@playwright/test'];

  it('pins the image tag to the installed Playwright version in every job that uses it', () => {
    const tags = [...ci.matchAll(/mcr\.microsoft\.com\/playwright:v([0-9.]+)-noble/g)].map(
      (m) => m[1]
    );
    expect(tags.length).toBeGreaterThanOrEqual(2);
    for (const tag of tags) expect(tag).toBe(pinned);
  });

  it('pins the release workflow image too, and no release job installs browsers', () => {
    const release = readFileSync('.github/workflows/owner-trial.yml', 'utf8');
    const tags = [...release.matchAll(/mcr\.microsoft\.com\/playwright:v([0-9.]+)-noble/g)].map(
      (m) => m[1]
    );
    expect(tags).toHaveLength(2);
    for (const tag of tags) expect(tag).toBe(pinned);
    expect(release).not.toMatch(/playwright install/);
  });

  it('never installs browsers on the bare runner in the browser job', () => {
    const e2e = ci.slice(ci.indexOf('  e2e:'), ci.indexOf('  storybook:'));
    expect(e2e).toContain('container:');
    expect(e2e).not.toMatch(/run: pnpm exec playwright install/);
  });
});
