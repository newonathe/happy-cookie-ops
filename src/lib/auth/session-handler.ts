import { z } from 'zod';
import {
  SessionRequestError,
  assertSameOriginMutation,
  assertSameOriginRead,
  assertSessionCsrf,
  readBoundedJson
} from './request-policy';

const COOKIE_NAME = '__Host-hc-session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_SESSION_SECONDS = 28800;
const DEADLINE_MS = 5000;
const MAX_COOKIE_HEADER_CHARS = 8192;

const SessionRecordSchema = z
  .object({
    sessionId: z.string().regex(TOKEN_PATTERN),
    csrfToken: z.string().regex(TOKEN_PATTERN),
    expiresAt: z.number().int(),
    profile: z
      .object({
        id: z.string().uuid(),
        role: z.enum(['owner', 'helper', 'support']),
        active: z.literal(true)
      })
      .strict()
  })
  .strict();

export type SessionRecord = z.infer<typeof SessionRecordSchema>;

type LimitAction = 'session' | 'login' | 'refresh' | 'logout';

export interface SessionAuthority {
  limit(request: Request, action: LimitAction, signal: AbortSignal): Promise<boolean>;
  login(
    credentials: { email: string; password: string },
    signal: AbortSignal
  ): Promise<SessionRecord | null>;
  read(sessionId: string, signal: AbortSignal): Promise<SessionRecord | null>;
  refresh(sessionId: string, signal: AbortSignal): Promise<SessionRecord | null>;
  logout(sessionId: string, signal: AbortSignal): Promise<void>;
}

type HandlerCode = 'unauthenticated' | 'not_found' | 'rate_limited' | 'dependency_unavailable';

class HandlerError extends Error {
  readonly code: HandlerCode;
  readonly status: number;
  constructor(code: HandlerCode, status: number) {
    super(code);
    this.name = 'HandlerError';
    this.code = code;
    this.status = status;
  }
}

const LoginBodySchema = z
  .object({ email: z.string().email().max(254), password: z.string().min(1).max(1024) })
  .strict();

const EmptyBodySchema = z.object({}).strict();

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

const ALLOW_BY_PATH: Record<string, string> = {
  '/api/v1/session': 'GET',
  '/api/v1/session/login': 'POST',
  '/api/v1/session/refresh': 'POST',
  '/api/v1/session/logout': 'POST'
};

function jsonResponse(
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json', ...(extraHeaders ?? {}) }
  });
}

function errorResponse(
  status: number,
  code: string,
  extraHeaders?: Record<string, string>
): Response {
  return jsonResponse(status, { code, correlationId: crypto.randomUUID() }, extraHeaders);
}

function cookieHeader(value: string | null, maxAgeSeconds: number): string {
  return `${COOKIE_NAME}=${value ?? ''}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

function unauthorized(): Response {
  return errorResponse(401, 'unauthenticated', { 'Set-Cookie': cookieHeader(null, 0) });
}

/** Exact single-cookie parse: no decoding, duplicate/malformed/oversized rejected wholesale. */
function parseCookie(request: Request): string | null | 'invalid' {
  const header = request.headers.get('cookie');
  if (header === null) return null;
  if (header.length > MAX_COOKIE_HEADER_CHARS) return 'invalid';
  let found: string | null = null;
  for (const rawPart of header.split(';')) {
    const part = rawPart.trim();
    if (part.length === 0) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      if (part === COOKIE_NAME) return 'invalid';
      continue;
    }
    if (part.slice(0, eq) !== COOKIE_NAME) continue;
    if (found !== null) return 'invalid';
    const value = part.slice(eq + 1);
    if (!TOKEN_PATTERN.test(value)) return 'invalid';
    found = value;
  }
  return found;
}

function checkRecord(
  raw: unknown,
  now: number,
  expectSessionId: string | null
): SessionRecord | 'expired' | 'malformed' {
  const parsed = SessionRecordSchema.safeParse(raw);
  if (!parsed.success) return 'malformed';
  const record = parsed.data;
  if (record.sessionId === record.csrfToken) return 'malformed';
  if (expectSessionId !== null && record.sessionId !== expectSessionId) return 'malformed';
  if (record.expiresAt > now + MAX_SESSION_SECONDS) return 'malformed';
  if (record.expiresAt <= now) return 'expired';
  return record;
}

function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw new HandlerError('dependency_unavailable', 503);
}

/** Single deadline shared by every authority call made while handling one request. */
async function withDeadline<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer!: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new HandlerError('dependency_unavailable', 503));
      controller.abort();
    }, DEADLINE_MS);
  });
  try {
    return await Promise.race([fn(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function loadSession(
  request: Request,
  authority: SessionAuthority,
  now: () => number,
  signal: AbortSignal
): Promise<SessionRecord | 'unauthorized' | 'malformed'> {
  const cookieValue = parseCookie(request);
  if (cookieValue === null || cookieValue === 'invalid') return 'unauthorized';
  ensureActive(signal);
  const raw = await authority.read(cookieValue, signal);
  ensureActive(signal);
  if (raw === null) return 'unauthorized';
  const checked = checkRecord(raw, now(), cookieValue);
  if (checked === 'malformed') return 'malformed';
  if (checked === 'expired') return 'unauthorized';
  return checked;
}

function successResponse(record: SessionRecord, cookieValue?: string, maxAge?: number): Response {
  const headers: Record<string, string> =
    cookieValue !== undefined && maxAge !== undefined
      ? { 'Set-Cookie': cookieHeader(cookieValue, maxAge) }
      : {};
  return jsonResponse(
    200,
    {
      profile: { id: record.profile.id, role: record.profile.role },
      csrfToken: record.csrfToken,
      expiresAt: record.expiresAt
    },
    headers
  );
}

async function handleRead(
  request: Request,
  origin: string,
  authority: SessionAuthority,
  now: () => number
): Promise<Response> {
  assertSameOriginRead(request, origin);
  return withDeadline(async (signal) => {
    if (!(await authority.limit(request, 'session', signal)))
      throw new HandlerError('rate_limited', 429);
    ensureActive(signal);
    const session = await loadSession(request, authority, now, signal);
    if (session === 'malformed') throw new HandlerError('dependency_unavailable', 503);
    if (session === 'unauthorized') return unauthorized();
    return successResponse(session);
  });
}

async function handleLogin(
  request: Request,
  origin: string,
  authority: SessionAuthority,
  now: () => number
): Promise<Response> {
  assertSameOriginMutation(request, origin);
  return withDeadline(async (signal) => {
    if (!(await authority.limit(request, 'login', signal)))
      throw new HandlerError('rate_limited', 429);
    ensureActive(signal);
    const credentials = await readBoundedJson(request, LoginBodySchema, 4096, signal);
    ensureActive(signal);
    const raw = await authority.login(credentials, signal);
    ensureActive(signal);
    if (raw === null) return unauthorized();
    const stamp = now();
    const checked = checkRecord(raw, stamp, null);
    if (checked === 'malformed' || checked === 'expired')
      throw new HandlerError('dependency_unavailable', 503);
    return successResponse(checked, checked.sessionId, checked.expiresAt - stamp);
  });
}

async function handleRefresh(
  request: Request,
  origin: string,
  authority: SessionAuthority,
  now: () => number
): Promise<Response> {
  assertSameOriginMutation(request, origin);
  return withDeadline(async (signal) => {
    if (!(await authority.limit(request, 'refresh', signal)))
      throw new HandlerError('rate_limited', 429);
    ensureActive(signal);
    await readBoundedJson(request, EmptyBodySchema, 64, signal);
    const session = await loadSession(request, authority, now, signal);
    if (session === 'malformed') throw new HandlerError('dependency_unavailable', 503);
    if (session === 'unauthorized') return unauthorized();
    assertSessionCsrf(request, session.csrfToken);
    ensureActive(signal);
    const raw = await authority.refresh(session.sessionId, signal);
    ensureActive(signal);
    if (raw === null) return unauthorized();
    const stamp = now();
    const checked = checkRecord(raw, stamp, null);
    if (checked === 'malformed' || checked === 'expired')
      throw new HandlerError('dependency_unavailable', 503);
    if (checked.profile.id !== session.profile.id ||
        checked.sessionId !== session.sessionId ||
        checked.csrfToken !== session.csrfToken ||
        checked.expiresAt !== session.expiresAt)
      throw new HandlerError('dependency_unavailable', 503);
    return successResponse(checked);
  });
}

async function handleLogout(
  request: Request,
  origin: string,
  authority: SessionAuthority,
  now: () => number
): Promise<Response> {
  assertSameOriginMutation(request, origin);
  return withDeadline(async (signal) => {
    if (!(await authority.limit(request, 'logout', signal)))
      throw new HandlerError('rate_limited', 429);
    ensureActive(signal);
    await readBoundedJson(request, EmptyBodySchema, 64, signal);
    const session = await loadSession(request, authority, now, signal);
    if (session === 'malformed') throw new HandlerError('dependency_unavailable', 503);
    if (session === 'unauthorized') return unauthorized();
    assertSessionCsrf(request, session.csrfToken);
    ensureActive(signal);
    await authority.logout(session.sessionId, signal);
    return new Response(null, {
      status: 204,
      headers: { ...BASE_HEADERS, 'Set-Cookie': cookieHeader(null, 0) }
    });
  });
}

export async function handleSessionRequest(
  request: Request,
  options: { origin: string; authority: SessionAuthority; now?: () => number }
): Promise<Response> {
  const { origin, authority } = options;
  const clock = options.now ?? (() => Math.floor(Date.now() / 1000));
  const now = () => {
    const value = clock();
    if (!Number.isSafeInteger(value) || value < 0) throw new HandlerError('dependency_unavailable', 503);
    return value;
  };

  let path: string;
  try {
    path = new URL(request.url).pathname;
  } catch {
    return errorResponse(503, 'dependency_unavailable');
  }
  const allow = ALLOW_BY_PATH[path];
  if (allow === undefined) return errorResponse(404, 'not_found');

  try {
    switch (path) {
      case '/api/v1/session':
        return await handleRead(request, origin, authority, now);
      case '/api/v1/session/login':
        return await handleLogin(request, origin, authority, now);
      case '/api/v1/session/refresh':
        return await handleRefresh(request, origin, authority, now);
      default:
        return await handleLogout(request, origin, authority, now);
    }
  } catch (err) {
    if (err instanceof SessionRequestError) {
      return errorResponse(err.status, err.code, err.status === 405 ? { Allow: allow } : undefined);
    }
    if (err instanceof HandlerError) {
      return errorResponse(err.status, err.code, err.status === 429 ? { 'Retry-After': '60' } : undefined);
    }
    return errorResponse(503, 'dependency_unavailable');
  }
}
