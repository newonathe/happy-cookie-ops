import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  TARGET,
  requireExistingWorker,
  validateGate
} from '../../scripts/check-owner-trial-release.mjs';

const digest = (email: string) => createHash('sha256').update(email).digest('hex');
const hashes = [digest('owner-one@example.test'), digest('owner-two@example.test')].join(',');
const gate = () => ({
  emailHashes: hashes,
  app: {
    id: TARGET.app,
    domain: TARGET.hostname,
    type: 'self_hosted',
    session_duration: '8h',
    allowed_idps: [TARGET.provider]
  },
  policies: [
    {
      id: TARGET.policy,
      decision: 'allow',
      session_duration: '8h',
      include: [
        { email: { email: 'owner-one@example.test' } },
        { email: { email: 'owner-two@example.test' } }
      ],
      require: [],
      exclude: []
    }
  ],
  providers: [{ id: TARGET.provider, type: 'onetimepin' }],
  routes: [],
  subdomain: { enabled: false, previews_enabled: false },
  accountSubdomain: { subdomain: 'admin-kethai' }
});

describe('owner trial release gate', () => {
  it('accepts only the exact allowlisted private app and disabled pre-deploy Worker domain', () => {
    expect(validateGate(gate())).toBe(true);
  });

  it('rejects extra access policies and mismatched private email digests', () => {
    expect(() =>
      validateGate({ ...gate(), policies: [...gate().policies, { decision: 'bypass' }] })
    ).toThrow();
    expect(() =>
      validateGate({
        ...gate(),
        emailHashes: `${digest('other@example.test')},${digest('owner-two@example.test')}`
      })
    ).toThrow();
  });

  it('rejects a foreign policy, duplicate selector, nested selector extras, and any Worker route', () => {
    const policy = gate().policies[0];
    expect(() => validateGate({ ...gate(), policies: [{ ...policy, id: 'foreign' }] })).toThrow();
    expect(() =>
      validateGate({
        ...gate(),
        policies: [{ ...policy, include: [policy.include[0], policy.include[0]] }]
      })
    ).toThrow();
    expect(() =>
      validateGate({
        ...gate(),
        policies: [
          {
            ...policy,
            include: [
              { email: { email: 'owner-one@example.test', domain: 'example.test' } },
              policy.include[1]
            ]
          }
        ]
      })
    ).toThrow();
    expect(() =>
      validateGate({ ...gate(), routes: [{ pattern: '*', script: TARGET.worker }] })
    ).toThrow();
    expect(() =>
      validateGate({ ...gate(), providers: [{ id: 'foreign', type: 'onetimepin' }] })
    ).toThrow();
    expect(() => validateGate({ ...gate(), subdomain: undefined })).toThrow();
  });

  it('refuses deployment when the approved Worker does not already exist', () => {
    expect(() => requireExistingWorker([])).toThrow();
    expect(() => requireExistingWorker([{ id: 'another-worker' }])).toThrow();
    expect(() => requireExistingWorker([{ id: TARGET.worker }])).not.toThrow();
  });

  it('rejects preview URLs before deployment and requires canonical hosting afterward', () => {
    expect(() =>
      validateGate({ ...gate(), subdomain: { enabled: false, previews_enabled: true } })
    ).toThrow();
    expect(() =>
      validateGate({
        ...gate(),
        afterDeploy: true,
        subdomain: { enabled: false, previews_enabled: false }
      })
    ).toThrow();
  });

  it('requires the post-deploy canonical Worker hostname while keeping previews disabled', () => {
    expect(
      validateGate({
        ...gate(),
        afterDeploy: true,
        subdomain: { enabled: true, previews_enabled: false }
      })
    ).toBe(true);
    expect(() =>
      validateGate({
        ...gate(),
        afterDeploy: true,
        subdomain: { enabled: true, previews_enabled: true }
      })
    ).toThrow();
  });
});
