/**
 * Drop capacity, in one place.
 *
 * This module exists because of a specific failure. From T-11 onward the capacity rule
 * lives in two runtimes: the engine checks it so the UI can refuse instantly, and
 * Postgres checks it inside the insert transaction so two simultaneous checkouts cannot
 * both take the last box. Two implementations of one rule that nothing forces to agree
 * is the classic distributed-monolith failure: the client says yes, the server says no,
 * and the customer gets an error the design never accounted for.
 *
 * So: the arithmetic is here, both sides call it, and tests/unit/capacity-parity.test.ts
 * asserts the SQL function agrees with this file over a shared table of cases. If they
 * ever diverge, CI says so instead of a customer doing.
 */

export interface CapacityInput {
  /** Boxes the drop can produce. DEFAULT_CFG.capacity in the engine. */
  capacity: number;
  /** Boxes already committed by live orders — excludes cancelled and no-show. */
  committed: number;
  /** Boxes this request wants. */
  requested: number;
}

export interface CapacityDecision {
  ok: boolean;
  remaining: number;
  /** How many could still be taken. Equal to `remaining` when the request is refused. */
  available: number;
}

/**
 * Whether a request fits, and what is left.
 *
 * Deliberately total: negatives are clamped rather than thrown on, because the caller is
 * sometimes a checkout form and sometimes a stale cached count, and a crash there is
 * worse than a refusal. A request of zero is not ok — it is a bug upstream, and silently
 * accepting it creates an empty order.
 */
export function decideCapacity({ capacity, committed, requested }: CapacityInput): CapacityDecision {
  const safeCapacity = Math.max(0, Math.floor(capacity));
  const safeCommitted = Math.max(0, Math.floor(committed));
  const safeRequested = Math.floor(requested);
  const remaining = Math.max(0, safeCapacity - safeCommitted);
  return {
    ok: safeRequested > 0 && safeRequested <= remaining,
    remaining,
    available: remaining
  };
}

/**
 * The refusal the customer reads when the drop has closed or sold out.
 *
 * Verbatim from the prototype's `custSubmit` — this is the string the owner signed off,
 * and the two things it does are deliberate: it says nothing was charged (the customer's
 * first fear), and it names when to come back. Do not paraphrase it, and do not make it
 * more apologetic.
 */
export const DROP_CLOSED_MESSAGE =
  'Ordering closed while you were filling this in. Nothing was charged — the next drop opens Monday 9:00 AM.';

/**
 * The partial-capacity case has NO signed-off wording, and inventing one is not allowed.
 *
 * The prototype never needed it: its shop clamps the quantity picker to what is left, so
 * a customer cannot ask for more than exists and never sees a refusal. `POST /api/orders`
 * is a different surface — a direct request can ask for anything — so the API does need a
 * message, and there is no prototype string to copy.
 *
 * Rather than fabricate one and dress it up as approved, this returns the honest fallback
 * and the number, and T-11 must get the real sentence from the owner. If you are reading
 * this because a customer saw an ugly message: that is the intended failure. It is louder
 * than a plausible invention nobody ever reviewed.
 *
 * @see docs/CONTRACTS.md — the 409 body
 */
export function capacityRefusal(remaining: number): string {
  if (remaining <= 0) return DROP_CLOSED_MESSAGE;
  // PLACEHOLDER — needs the owner's wording. Do not ship a rewrite of this line without
  // asking her; do not delete this comment until she has given you the sentence.
  return remaining === 1
    ? 'Only 1 box left in this drop.'
    : `Only ${remaining} boxes left in this drop.`;
}
