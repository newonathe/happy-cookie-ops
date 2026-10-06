import type { Role } from '@/store/engine/ops-engine';

/**
 * The signed-in person's own name, as the app greets them and as a bazaar sale records who
 * rang it up (slice B2; Ethan's decision of 6 October 2026 to fix the clerk before the bazaar).
 *
 * The ported engine names every owner "Cine" and every helper "Kristian". Live mode never
 * shows or stores those: until a name is known the role word stands in ("Owner", "Helper"),
 * and once the person's profile has been read their `display_name` does.
 *
 * The name is remembered on the phone under its own key, so a stall that reopens with no
 * signal still records it. `hc-live-check` and `hc-live-stall` keep their shape.
 *
 * The next person on this phone must never sell under the last one's name, so the remembered
 * name is: removed on sign-out, where the remembered check is (`src/lib/auth/live-gate.ts`);
 * removed on every sign-in (`src/app/sign-in/sign-in-form.tsx`), because people also leave by
 * closing the tab; applied only by the reopen with no signal, never by an online page load,
 * which waits for the profile; and never written by a profile read that lands after a sign-out.
 */
const KEY = 'hc-live-staff-name';

export const ROLE_WORD: Readonly<Record<Role, string>> = {
  owner: 'Owner',
  helper: 'Helper',
  support: 'Support'
};

/** `record_event_sale` refuses a clerk longer than 40 characters; the sale path cuts at 40 units. */
export const STAFF_NAME_MAX = 40;

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
// Zero-width and direction marks: they would make a name look blank or reversed.
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

/**
 * A display name as a sale may carry it: plain text, single spaces, and short enough that
 * neither the server's 40-character rule nor the queue's 40-unit cut can refuse or split it.
 * Anything that is not text gives '' (the role word is used instead).
 */
export function cleanStaffName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const plain = raw.replace(INVISIBLE, '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  let out = '';
  for (const character of plain) {
    if (out.length + character.length > STAFF_NAME_MAX) break;
    out += character;
  }
  return out.trim();
}

export interface RememberedName {
  role: Role;
  name: string;
}

export function rememberStaffName(role: Role, name: string): void {
  try {
    if (name) localStorage.setItem(KEY, JSON.stringify({ role, name }));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode or full: an offline reopen then shows the role word */
  }
}

export function readStaffName(): RememberedName | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!saved || typeof saved !== 'object') return null;
    const { role, name } = saved as Record<string, unknown>;
    if (typeof role !== 'string' || !Object.hasOwn(ROLE_WORD, role)) return null;
    const clean = cleanStaffName(name);
    return clean ? { role: role as Role, name: clean } : null;
  } catch {
    return null;
  }
}

export function clearStaffName(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
