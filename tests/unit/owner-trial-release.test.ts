import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ALLOWED_SESSION_DURATIONS,
  APPROVED_EMAIL_MAX,
  APPROVED_EMAIL_MIN,
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

  describe('approved addresses', () => {
    const addresses = (n: number) =>
      Array.from({ length: n }, (_, i) => `made-up-${i + 1}@example.test`);
    const withAddresses = (emails: string[], digests: string[] = emails.map(digest)) => {
      const base = gate();
      return {
        ...base,
        emailHashes: digests.join(','),
        policies: [{ ...base.policies[0], include: emails.map((email) => ({ email: { email } })) }]
      };
    };

    it('keeps the bounds at two to six', () => {
      expect([APPROVED_EMAIL_MIN, APPROVED_EMAIL_MAX]).toEqual([2, 6]);
    });

    it.each([2, 3, 4, 6])('accepts %i matching addresses', (n) => {
      expect(validateGate(withAddresses(addresses(n)))).toBe(true);
    });

    it.each([1, 7])('rejects %i addresses, even when the digests match', (n) => {
      expect(() => validateGate(withAddresses(addresses(n)))).toThrow(
        /between 2 and 6 email selectors/
      );
    });

    it('rejects a digest list outside the bounds when the policy is inside them', () => {
      expect(() => validateGate(withAddresses(addresses(3), addresses(1).map(digest)))).toThrow(
        /between 2 and 6 unique digests/
      );
      expect(() => validateGate(withAddresses(addresses(3), addresses(7).map(digest)))).toThrow(
        /between 2 and 6 unique digests/
      );
    });

    it('rejects a duplicate address, including one that differs only in case', () => {
      const three = addresses(3);
      expect(() =>
        validateGate(withAddresses([three[0], three[1], three[0]], three.map(digest)))
      ).toThrow(/duplicate/i);
      expect(() =>
        validateGate(withAddresses([three[0], three[1], three[0].toUpperCase()], three.map(digest)))
      ).toThrow(/duplicate/i);
    });

    it('rejects a duplicate digest', () => {
      const three = addresses(3);
      const digests = [digest(three[0]), digest(three[1]), digest(three[1])];
      expect(() => validateGate(withAddresses(three, digests))).toThrow(
        /between 2 and 6 unique digests/
      );
    });

    it('rejects a digest list with one address too many', () => {
      const three = addresses(3);
      expect(() => validateGate(withAddresses(three, addresses(4).map(digest)))).toThrow(
        /do not match the approved SHA-256 digests/
      );
    });

    it('rejects a digest list with one address too few', () => {
      const four = addresses(4);
      expect(() => validateGate(withAddresses(four, addresses(3).map(digest)))).toThrow(
        /do not match the approved SHA-256 digests/
      );
    });

    it('rejects a digest list with one address swapped', () => {
      const four = addresses(4);
      const swapped = [...four.slice(0, 3), 'someone-else@example.test'].map(digest);
      expect(() => validateGate(withAddresses(four, swapped))).toThrow(
        /do not match the approved SHA-256 digests/
      );
    });

    it('rejects a malformed digest', () => {
      const three = addresses(3);
      expect(() =>
        validateGate(withAddresses(three, [...three.slice(0, 2).map(digest), 'not-a-digest']))
      ).toThrow(/do not match the approved SHA-256 digests/);
    });

    it('still rejects a non-email selector among several addresses', () => {
      const base = withAddresses(addresses(3));
      const [policy] = base.policies;
      const include = [...policy.include.slice(0, 2), { email_domain: { domain: 'example.test' } }];
      expect(() => validateGate({ ...base, policies: [{ ...policy, include }] })).toThrow(
        /single email selectors/
      );
      const everyone = [...policy.include.slice(0, 2), { everyone: {} }];
      expect(() => validateGate({ ...base, policies: [{ ...policy, include: everyone }] })).toThrow(
        /single email selectors/
      );
    });

    it('still rejects exclude and require selectors with many addresses', () => {
      const base = withAddresses(addresses(4));
      const [policy] = base.policies;
      expect(() =>
        validateGate({
          ...base,
          policies: [{ ...policy, exclude: [{ email: { email: 'x@example.test' } }] }]
        })
      ).toThrow(/allow policy/);
      expect(() =>
        validateGate({
          ...base,
          policies: [{ ...policy, require: [{ email: { email: 'x@example.test' } }] }]
        })
      ).toThrow(/allow policy/);
    });
  });

  describe('access session length', () => {
    const withSession = (app: string | undefined, policy: string | undefined = '8h') => {
      const base = gate();
      return {
        ...base,
        app: { ...base.app, session_duration: app },
        policies: [{ ...base.policies[0], session_duration: policy }]
      };
    };

    it('allows 8h, and only plain duration strings are listed', () => {
      expect(ALLOWED_SESSION_DURATIONS).toContain('8h');
      for (const value of ALLOWED_SESSION_DURATIONS) expect(value).toMatch(/^\S+$/);
    });

    it('accepts every allowed length on the application and on the policy', () => {
      for (const value of ALLOWED_SESSION_DURATIONS)
        expect(validateGate(withSession(value, value))).toBe(true);
    });

    it('rejects any other application length and prints the value it found', () => {
      expect(() => validateGate(withSession('24h'))).toThrow(/application session.*"24h"/);
      expect(() => validateGate(withSession(undefined))).toThrow(/application session/);
    });

    it('rejects any other policy length and prints the value it found', () => {
      expect(() => validateGate(withSession('8h', '730h'))).toThrow(/policy session.*"730h"/);
      expect(() => validateGate(withSession('8h', ''))).toThrow(/policy session/);
    });
  });
});
