import { z } from 'zod';
import { holdCountLock } from '@/lib/stock/count-lock';
import { validateEventForm, type EventFormInput } from './event-form';

/** Only the verified gate supplies this scope; a role name is never an identity. */
export interface EventEntryScope {
  userId: string;
  business: string;
}
export interface EventEntryRecord {
  version: 1;
  scope: EventEntryScope;
  draft: EventFormInput | null;
  /** Exact body retained before the first request. It is immutable until explicitly resolved. */
  submitted: FrozenEventRequest | null;
}
type DeviceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export interface EventEntryRead {
  status: 'empty' | 'stored' | 'invalid' | 'unavailable';
  value: EventEntryRecord | null;
}
const scopeSchema = z
  .object({
    userId: z.uuid(),
    business: z
      .string()
      .url()
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
        } catch {
          return false;
        }
      })
  })
  .strict();
const form = z
  .object({
    id: z.uuid(),
    name: z.string().max(1000),
    place: z.string().max(1000),
    startsOn: z.string().max(32),
    endsOn: z.string().max(32),
    rent: z.string().max(64)
  })
  .strict();
const sameScope = (a: EventEntryScope, b: EventEntryScope) =>
  a.userId === b.userId && a.business === b.business;
const request = z
  .object({
    p_event: z
      .object({
        id: z.uuid(),
        name: z.string(),
        place: z.string(),
        starts_on: z.string(),
        ends_on: z.string(),
        rent_cents: z.number().int(),
        active: z.literal(true)
      })
      .strict(),
    p_expected_updated_at: z.null()
  })
  .strict();
export type FrozenEventRequest = z.infer<typeof request>;
export const sameEventEntry = (a: FrozenEventRequest, b: FrozenEventRequest): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Version-one create protocol. Persist once; retries send this directly, without rebuilding form text. */
export function freezeEventEntry(input: EventFormInput): FrozenEventRequest | null {
  const checked = validateEventForm(input);
  if (!checked.ok) return null;
  const f = checked.fields;
  return request.parse({
    p_event: {
      id: f.id,
      name: f.name,
      place: f.place,
      starts_on: f.startsOn,
      ends_on: f.endsOn,
      rent_cents: f.rentCents,
      active: true
    },
    p_expected_updated_at: null
  });
}
const envelope = z
  .object({
    version: z.literal(1),
    scope: scopeSchema,
    draft: form.nullable(),
    submitted: request.nullable()
  })
  .strict()
  .refine(
    (value) =>
      !value.submitted ||
      (!!value.draft &&
        (() => {
          const frozen = freezeEventEntry(value.draft);
          return frozen !== null && sameEventEntry(frozen, value.submitted);
        })())
  );
const keyOf = (scope: EventEntryScope) =>
  'hc-event-entry-v1:' + encodeURIComponent(scope.business) + ':' + scope.userId;
export const emptyEventEntry = (scope: EventEntryScope): EventEntryRecord => ({
  version: 1,
  scope: { ...scope },
  draft: null,
  submitted: null
});

/** Raw drafts may be invalid business input. A submitted body must pass the existing validator. */
export function readEventEntry(scope: EventEntryScope, storage?: DeviceStorage): EventEntryRead {
  if (!scopeSchema.safeParse(scope).success) return { status: 'invalid', value: null };
  try {
    const raw = (storage ?? localStorage).getItem(keyOf(scope));
    if (raw === null) return { status: 'empty', value: null };
    if (raw.length > 32768) return { status: 'invalid', value: null };
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return { status: 'invalid', value: null };
    }
    const parsed = envelope.safeParse(value);
    return parsed.success && sameScope(parsed.data.scope, scope)
      ? { status: 'stored', value: parsed.data }
      : { status: 'invalid', value: null };
  } catch {
    return { status: 'unavailable', value: null };
  }
}

/** Caller holds the scoped Web Lock. A pending body cannot be edited or retired implicitly. */
export function writeEventEntry(
  scope: EventEntryScope,
  value: EventEntryRecord,
  options: { storage?: DeviceStorage; resolvedId?: string } = {}
): boolean {
  try {
    const parsed = envelope.safeParse(value);
    if (!parsed.success || !sameScope(parsed.data.scope, scope)) return false;
    const use = options.storage ?? localStorage,
      before = readEventEntry(scope, use);
    if (before.status === 'invalid' || before.status === 'unavailable') return false;
    const old = before.value?.submitted;
    if (
      old &&
      !(parsed.data.submitted && sameEventEntry(old, parsed.data.submitted)) &&
      options.resolvedId !== old.p_event.id
    )
      return false;
    const raw = JSON.stringify(parsed.data);
    if (raw.length > 32768) return false;
    use.setItem(keyOf(scope), raw);
    return use.getItem(keyOf(scope)) === raw;
  } catch {
    return false;
  }
}

/** Explicit recovery only: retain unreadable bytes under a fresh key before replacing the active copy. */
export function keepInvalidEventEntry(scope: EventEntryScope, storage?: DeviceStorage): boolean {
  try {
    const use = storage ?? localStorage;
    if (readEventEntry(scope, use).status !== 'invalid' || !scopeSchema.safeParse(scope).success)
      return false;
    const key = keyOf(scope),
      raw = use.getItem(key);
    if (raw === null) return false;
    const kept = key + ':kept:' + crypto.randomUUID();
    if (use.getItem(kept) !== null) return false;
    use.setItem(kept, raw);
    if (use.getItem(kept) !== raw) return false;
    const empty = JSON.stringify(emptyEventEntry(scope));
    use.setItem(key, empty);
    return use.getItem(key) === empty;
  } catch {
    return false;
  }
}

/** Reuses the existing race-free lock helper, with its own owner/backend namespace. */
export function holdEventEntryLock(scope: EventEntryScope): Promise<(() => void) | null> {
  return scopeSchema.safeParse(scope).success
    ? holdCountLock('event-entry:' + keyOf(scope))
    : Promise.resolve(null);
}
