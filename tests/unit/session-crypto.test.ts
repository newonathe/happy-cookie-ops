// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSessionCrypto } from '@/lib/auth/session-crypto';

const key = Buffer.alloc(32, 9).toString('base64url');
const otherKey = Buffer.alloc(32, 8).toString('base64url');
const context = {
  sessionHash: 'a'.repeat(64),
  userId: '00000000-0000-4000-8000-000000000001',
  version: 1
};
const tokens = { accessToken: 'ACCESS_CANARY', refreshToken: 'REFRESH_CANARY' };
const setup = () => createSessionCrypto({ activeKeyId: 'one', keys: { one: key } });
const safe = (promise: Promise<unknown>) =>
  expect(promise).rejects.toMatchObject({
    name: 'SessionCryptoError',
    code: 'session_crypto_unavailable',
    message: 'session_crypto_unavailable'
  });
const corrupt = (value: unknown) => {
  const bytes = Buffer.from(String(value), 'base64url');
  bytes[0] ^= 1;
  return bytes.toString('base64url');
};

describe('session crypto', () => {
  it('round trips tokens and produces fresh authenticated envelopes', async () => {
    const crypto = await setup();
    const first = await crypto.seal(tokens, context);
    const second = await crypto.seal(tokens, context);
    expect(first).not.toContain('CANARY');
    expect(JSON.parse(first)).not.toEqual(JSON.parse(second));
    expect(await crypto.open(first, context)).toEqual(tokens);
  });
  it('binds ciphertext to its key and complete session context', async () => {
    const crypto = await setup();
    const envelope = JSON.parse(await crypto.seal(tokens, context)) as Record<string, unknown>;
    for (const changed of [
      { ...context, sessionHash: 'b'.repeat(64) },
      { ...context, userId: '00000000-0000-4000-8000-000000000002' },
      { ...context, version: 2 }
    ])
      await safe(crypto.open(JSON.stringify(envelope), changed));
    for (const field of ['iv', 'data', 'kid'] as const) {
      const copy = { ...envelope, [field]: field === 'kid' ? 'missing' : corrupt(envelope[field]) };
      await safe(crypto.open(JSON.stringify(copy), context));
    }
  });
  it('supports bounded independent key rotation', async () => {
    const old = await setup();
    const envelope = await old.seal(tokens, context);
    const rotated = await createSessionCrypto({
      activeKeyId: 'two',
      keys: { one: key, two: otherKey }
    });
    expect(await rotated.open(envelope, context)).toEqual(tokens);
    expect(JSON.parse(await rotated.seal(tokens, context)).kid).toBe('two');
    await safe(
      (await createSessionCrypto({ activeKeyId: 'two', keys: { two: otherKey } })).open(
        envelope,
        context
      )
    );
  });
  it('uses 256-bit opaque identifiers and hashes decoded bytes', async () => {
    const crypto = await setup();
    const identifier = crypto.newIdentifier();
    const known = Buffer.alloc(32, 4).toString('base64url');
    expect(identifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await crypto.hashIdentifier(known)).toBe(
      createHash('sha256').update(Buffer.alloc(32, 4)).digest('hex')
    );
    await safe(crypto.hashIdentifier(known.slice(0, -1) + 'B'));
  });
  it('rejects malformed configuration, inputs, envelopes and oversized plaintext', async () => {
    for (const bad of [
      null,
      {},
      { activeKeyId: 'one', keys: {} },
      { activeKeyId: 'one', keys: { one: key, two: key, three: key, four: key } },
      { activeKeyId: 'none', keys: { one: key } },
      { activeKeyId: 'one', keys: { one: 'not_base64' } }
    ])
      await safe(createSessionCrypto(bad));
    const crypto = await setup();
    await safe(crypto.seal({ ...tokens, role: 'owner' } as typeof tokens, context));
    await safe(
      crypto.seal({ accessToken: 'has space', refreshToken: tokens.refreshToken }, context)
    );
    await safe(crypto.open('{bad', context));
    await safe(
      crypto.open(
        JSON.stringify({
          v: 1,
          kid: 'one',
          iv: Buffer.alloc(12).toString('base64url'),
          data: Buffer.alloc(16).toString('base64url'),
          extra: true
        }),
        context
      )
    );
    await safe(crypto.open(' '.repeat(90001), context));
  });
  it('snapshots supplied key material before callers mutate it', async () => {
    const config = { activeKeyId: 'one', keys: { one: key } };
    const crypto = await createSessionCrypto(config);
    config.keys.one = otherKey;
    expect(await crypto.open(await crypto.seal(tokens, context), context)).toEqual(tokens);
  });
  it('snapshots the active key before asynchronous imports', async () => {
    const config = { activeKeyId: 'one', keys: { one: key, two: otherKey } };
    const pending = createSessionCrypto(config);
    config.activeKeyId = 'two';
    expect(JSON.parse(await (await pending).seal(tokens, context)).kid).toBe('one');
  });
});
