import { SCREEN_KEYS, pathForScreen } from '@/lib/screens';

const REDACTED = '[redacted]';
const ENUM_VALUES: Record<string, readonly string[]> = {
  screen: SCREEN_KEYS,
  route: [...SCREEN_KEYS.map(pathForScreen), '/sign-in', '/api/orders/lookup'],
  role: ['owner', 'helper', 'support'],
  environment: ['development', 'test', 'staging', 'production'],
  syncState: ['syncing', 'partial', 'synced'],
  level: ['fatal', 'error', 'warning', 'log', 'info', 'debug'],
  platform: ['javascript', 'node'],
  type: ['error', 'default', 'navigation', 'http']
};
const NUMERIC_KEYS = new Set(['status', 'count', 'attempts', 'ms', 'timestamp']);

/** Arbitrary text can contain names or secrets without a recognizable pattern. */
export function scrubText(input: string): string {
  void input; // Deliberately discard arbitrary text rather than pattern-match private names.
  return REDACTED;
}

function safeField(key: string, value: unknown): unknown {
  if (Object.hasOwn(ENUM_VALUES, key) && typeof value === 'string' && ENUM_VALUES[key].includes(value)) return value;
  if (NUMERIC_KEYS.has(key) && typeof value === 'number' && Number.isFinite(value)) return value;
  if (key === 'online' && typeof value === 'boolean') return value;
  return REDACTED;
}

/** Deny by default, including free text under formerly allowlisted keys. */
export function scrubValue(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return { length: value.length, items: REDACTED };
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let redacted = 0;
    for (const [key, inner] of Object.entries(value)) {
      if (Object.hasOwn(ENUM_VALUES, key) || NUMERIC_KEYS.has(key) || key === 'online') out[key] = safeField(key, inner);
      else redacted++;
    }
    if (redacted) out._redacted = redacted;
    return out;
  }
  return REDACTED;
}

// Structural input contract, not an index signature required of an SDK interface.
interface ReportLike {
  message?: unknown;
  request?: { url?: string; headers?: unknown; data?: unknown; cookies?: unknown };
  user?: unknown;
  extra?: unknown;
  contexts?: unknown;
  data?: unknown;
  breadcrumbs?: Array<{ message?: unknown; data?: unknown }>;
  exception?: { values?: Array<{ value?: unknown }> };
}

const REPORT_FIELDS = new Set([
  'message', 'request', 'extra', 'contexts', 'data', 'breadcrumbs', 'exception',
  'event_id', 'timestamp', 'level', 'platform', 'type', 'environment'
]);

/** Strip unknown SDK payloads too: tags, URLs, spans and stack locals can contain PII. */
export function scrubReport<T extends ReportLike>(report: T): T {
  for (const [key, value] of Object.entries(report)) {
    if (!REPORT_FIELDS.has(key)) {
      Reflect.deleteProperty(report, key);
    } else if (key === 'event_id') {
      if (typeof value !== 'string' || !/^[a-f0-9]{32}$/i.test(value)) Reflect.deleteProperty(report, key);
    } else if (Object.hasOwn(ENUM_VALUES, key) || NUMERIC_KEYS.has(key)) {
      if (safeField(key, value) === REDACTED) Reflect.deleteProperty(report, key);
    }
  }
  if (report.message !== undefined) report.message = REDACTED;
  if (report.extra !== undefined) report.extra = scrubValue(report.extra);
  if (report.contexts !== undefined) report.contexts = scrubValue(report.contexts);
  if (report.data !== undefined) report.data = scrubValue(report.data);
  if (report.request) {
    const path = report.request.url?.split(/[?#]/)[0];
    report.request = typeof path === 'string' && ENUM_VALUES.route.includes(path) ? { url: path } : {};
  }
  if (report.exception) {
    report.exception = { values: report.exception.values?.map(() => ({ value: REDACTED })) };
  }
  if (report.breadcrumbs) {
    report.breadcrumbs = report.breadcrumbs.map((crumb) => scrubReport(crumb));
  }
  return report;
}
