type Tokens = { accessToken: string; refreshToken: string };
type Context = { sessionHash: string; userId: string; version: number };
type Envelope = { v: 1; kid: string; iv: string; data: string };

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const own = Object.prototype.hasOwnProperty;
const keyId = /^[A-Za-z0-9_-]{1,32}$/;
const base64url = /^[A-Za-z0-9_-]*$/;
const hash = /^[a-f0-9]{64}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const token = /^[\x21-\x7e]{1,16384}$/;

export class SessionCryptoError extends Error {
  static get safe(): SessionCryptoError { return new SessionCryptoError(); }
  readonly code = 'session_crypto_unavailable';
  constructor() { super('session_crypto_unavailable'); this.name = 'SessionCryptoError'; }
}

function unavailable(): never { throw SessionCryptoError.safe; }
function exactObject(value: unknown, names: string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== names.length || keys.some(key => typeof key !== 'string' || !names.includes(key))) return false;
  return names.every(name => { const descriptor = Object.getOwnPropertyDescriptor(value, name); return own.call(value, name) && descriptor?.enumerable && descriptor.get === undefined && descriptor.set === undefined; });
}
function encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function cryptoBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length); copy.set(bytes); return copy.buffer;
}
function decode(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !base64url.test(value) || value.length % 4 === 1) unavailable();
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (encode(bytes) !== value) unavailable();
    return bytes;
  } catch { unavailable(); }
}
function validContext(value: unknown): value is Context {
  return exactObject(value, ['sessionHash', 'userId', 'version']) && typeof value.sessionHash === 'string' && hash.test(value.sessionHash)
    && typeof value.userId === 'string' && uuid.test(value.userId) && typeof value.version === 'number' && Number.isSafeInteger(value.version) && value.version >= 0;
}
function validTokens(value: unknown): value is Tokens {
  return exactObject(value, ['accessToken', 'refreshToken']) && typeof value.accessToken === 'string' && token.test(value.accessToken)
    && typeof value.refreshToken === 'string' && token.test(value.refreshToken) && encoder.encode(tokenJson({ accessToken: value.accessToken, refreshToken: value.refreshToken })).length <= 65536;
}
function tokenJson(value: Tokens): string {
  return JSON.stringify(Object.assign(Object.create(null), { accessToken: value.accessToken, refreshToken: value.refreshToken }));
}
function aad(kid: string, context: Context): Uint8Array {
  return encoder.encode(JSON.stringify(['hco-session-tokens', 1, kid, context.sessionHash, context.userId, context.version]));
}
function validEnvelope(value: unknown): value is Envelope {
  if (!exactObject(value, ['v', 'kid', 'iv', 'data']) || value.v !== 1 || typeof value.kid !== 'string' || !keyId.test(value.kid)) return false;
  try { return decode(value.iv).length === 12 && decode(value.data).length >= 16 && decode(value.data).length <= 65552; } catch { return false; }
}

export async function createSessionCrypto(config: unknown) {
  try {
    if (!exactObject(config, ['activeKeyId', 'keys']) || typeof config.activeKeyId !== 'string' || !keyId.test(config.activeKeyId)) unavailable();
    const activeKeyId = config.activeKeyId;
    const source = config.keys;
    if (source === null || typeof source !== 'object' || Array.isArray(source) || (Object.getPrototypeOf(source) !== Object.prototype && Object.getPrototypeOf(source) !== null) || Reflect.ownKeys(source).some(key => typeof key !== 'string')) unavailable();
    const ids = Object.keys(source);
    if (ids.length < 1 || ids.length > 3 || ids.length !== Reflect.ownKeys(source).length || ids.some(id => { const descriptor = Object.getOwnPropertyDescriptor(source, id); return !keyId.test(id) || !descriptor?.enumerable || descriptor.get !== undefined || descriptor.set !== undefined; })) unavailable();
    const raw = new Map<string, Uint8Array>();
    for (const id of ids) { const material = (source as Record<string, unknown>)[id]; if (typeof material !== 'string' || material.length !== 43) unavailable(); const bytes = decode(material); if (bytes.length !== 32) unavailable(); raw.set(id, bytes); }
    if (!raw.has(activeKeyId)) unavailable();
    const keys = new Map<string, CryptoKey>();
    for (const [id, bytes] of raw) keys.set(id, await globalThis.crypto.subtle.importKey('raw', cryptoBytes(bytes), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']));
    const requireContext = (value: unknown): Context => validContext(value) ? value : unavailable();
    return {
      newIdentifier(): string { try { const value = new Uint8Array(32); globalThis.crypto.getRandomValues(value); return encode(value); } catch { unavailable(); } },
      async hashIdentifier(identifier: string): Promise<string> {
        try { if (typeof identifier !== 'string' || identifier.length !== 43) unavailable(); const bytes = decode(identifier); if (bytes.length !== 32) unavailable(); return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', cryptoBytes(bytes))), byte => byte.toString(16).padStart(2, '0')).join(''); } catch { unavailable(); }
      },
      async seal(tokens: Tokens, context: Context): Promise<string> {
        try {
          if (!validTokens(tokens)) unavailable(); const bound = requireContext(context); const plaintext = encoder.encode(tokenJson(tokens));
          const iv = new Uint8Array(12); globalThis.crypto.getRandomValues(iv); const encrypted = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: cryptoBytes(iv), additionalData: cryptoBytes(aad(activeKeyId, bound)), tagLength: 128 }, keys.get(activeKeyId)!, cryptoBytes(plaintext));
          return JSON.stringify({ v: 1, kid: activeKeyId, iv: encode(iv), data: encode(new Uint8Array(encrypted)) });
        } catch { unavailable(); }
      },
      async open(envelope: string, context: Context): Promise<Tokens> {
        try {
          if (typeof envelope !== 'string' || envelope.length > 90000) unavailable(); const parsed: unknown = JSON.parse(envelope); if (!validEnvelope(parsed)) unavailable();
          const bound = requireContext(context); const cryptoKey = keys.get(parsed.kid); if (!cryptoKey) unavailable();
          const decrypted = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: cryptoBytes(decode(parsed.iv)), additionalData: cryptoBytes(aad(parsed.kid, bound)), tagLength: 128 }, cryptoKey, cryptoBytes(decode(parsed.data)));
          if (decrypted.byteLength > 65536) unavailable(); const tokens: unknown = JSON.parse(decoder.decode(decrypted)); if (!validTokens(tokens)) unavailable(); return tokens;
        } catch { unavailable(); }
      },
    };
  } catch { unavailable(); }
}
