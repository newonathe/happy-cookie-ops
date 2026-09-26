// @vitest-environment node
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createSessionCrypto, SessionCryptoError } from '@/lib/auth/session-crypto';

const rawKey = Buffer.from(Array.from({length:32},(_,i)=>i));
const key = rawKey.toString('base64url');
const context = {sessionHash:'1'.repeat(64),userId:'00000000-0000-4000-8000-000000000001',version:7};
const tokens = {accessToken:'ACCESS_CANARY',refreshToken:'REFRESH_CANARY'};
const aad = Buffer.from(JSON.stringify(['hco-session-tokens',1,'k1',context.sessionHash,context.userId,context.version]));
const setup = () => createSessionCrypto({activeKeyId:'k1',keys:{k1:key}});
function independentEnvelope(plaintext: string) {
  const iv = Buffer.alloc(12,7); const cipher = createCipheriv('aes-256-gcm',rawKey,iv);
  cipher.setAAD(aad); const encrypted = Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final(),cipher.getAuthTag()]);
  return JSON.stringify({v:1,kid:'k1',iv:iv.toString('base64url'),data:encrypted.toString('base64url')});
}
describe('independent session encryption oracles', () => {
  it('decrypts a WebCrypto envelope with native Node AES-GCM', async () => {
    const crypto = await setup(); const encoded = await crypto.seal(tokens,context);
    expect(encoded).not.toContain('CANARY');
    const envelope = JSON.parse(encoded) as {v:number;kid:string;iv:string;data:string};
    const encrypted = Buffer.from(envelope.data,'base64url');
    const decipher = createDecipheriv('aes-256-gcm',rawKey,Buffer.from(envelope.iv,'base64url'));
    decipher.setAAD(aad); decipher.setAuthTag(encrypted.subarray(-16));
    expect(JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0,-16)),decipher.final()]).toString('utf8'))).toEqual(tokens);
  });
  it('opens a separately constructed Node envelope', async () => {
    expect(await (await setup()).open(independentEnvelope(JSON.stringify(tokens)),context)).toEqual(tokens);
  });
  it('rejects authenticated but schema-invalid plaintext', async () => {
    const crypto = await setup();
    for (const plaintext of ['{bad', JSON.stringify({...tokens,role:'owner'}), JSON.stringify({...tokens,refreshToken:null})]) {
      await expect(crypto.open(independentEnvelope(plaintext),context)).rejects.toBeInstanceOf(SessionCryptoError);
    }
  });
  it('hashes the decoded random identifier bytes, not its printable representation', async () => {
    const crypto = await setup(); const id = Buffer.alloc(32,5).toString('base64url');
    expect(await crypto.hashIdentifier(id)).toBe(createHash('sha256').update(Buffer.alloc(32,5)).digest('hex'));
    expect(await crypto.hashIdentifier(id)).not.toBe(createHash('sha256').update(id).digest('hex'));
  });
  it('rejects noncanonical trailing bits that decode to the same identifier', async () => {
    const crypto = await setup(); const canonical = Buffer.alloc(32).toString('base64url');
    const alias = canonical.slice(0,-1)+'B';
    expect(Buffer.from(alias,'base64url')).toEqual(Buffer.from(canonical,'base64url'));
    await expect(crypto.hashIdentifier(alias)).rejects.toBeInstanceOf(SessionCryptoError);
  });
  it('binds even a different key ID configured with the same raw key', async () => {
    const crypto = await createSessionCrypto({activeKeyId:'k1',keys:{k1:key,k2:key}});
    const envelope = JSON.parse(await crypto.seal(tokens,context)) as Record<string,unknown>; envelope.kid='k2';
    await expect(crypto.open(JSON.stringify(envelope),context)).rejects.toBeInstanceOf(SessionCryptoError);
  });
  it('ignores inherited serialization hooks when sealing the exact token projection', async () => {
    const crypto = await setup();
    const withHook = Object.assign(Object.create({toJSON:()=>({accessToken:'WRONG',refreshToken:'WRONG'})}) as typeof tokens,tokens);
    expect(await crypto.open(await crypto.seal(withHook,context),context)).toEqual(tokens);
  });

  it('enforces actual serialized plaintext size including JSON escaping', async () => {
    const crypto = await setup();
    await expect(crypto.seal({accessToken:'"'.repeat(16384),refreshToken:'"'.repeat(16384)},context)).rejects.toBeInstanceOf(SessionCryptoError);
  });

  it.each([
    {...context,version:-1}, {...context,version:Number.MAX_SAFE_INTEGER+1},
    {...context,sessionHash:'A'.repeat(64)}, {...context,userId:'00000000-0000-0000-8000-000000000001'},
    {...context,userId:'abcdefAB-0000-4000-8000-000000000001'}
  ])('rejects invalid context before encryption', async invalid => {
    await expect((await setup()).seal(tokens,invalid)).rejects.toBeInstanceOf(SessionCryptoError);
  });
  it('sanitizes RNG failures with fresh errors and no underlying cause', async () => {
    const crypto = await setup(); const spy = vi.spyOn(globalThis.crypto,'getRandomValues').mockImplementation(() => {throw new Error('RNG_CANARY');});
    try {
      const errors: unknown[] = [];
      for (let i=0;i<2;i++) {try {crypto.newIdentifier();} catch (error) {errors.push(error);}}
      expect(errors).toHaveLength(2); expect(errors[0]).not.toBe(errors[1]);
      for (const error of errors) {expect(error).toBeInstanceOf(SessionCryptoError);expect(String(error)).not.toContain('RNG_CANARY');expect(error).not.toHaveProperty('cause');}
    } finally {spy.mockRestore();}
  });

});
