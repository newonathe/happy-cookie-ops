/**
 * HCB-030: how the live gate learns that the server turned a request down for its sign-in.
 *
 * supabase-js signs the app out when it knows the refresh failed (`SIGNED_OUT`), and the gate
 * re-checks when a tab comes back or the network returns. In between, a page can keep working
 * with a sign-in the server no longer accepts: every save fails and nothing says why. A 401
 * from the data API (PostgREST) is the server saying exactly that, so each one is reported to
 * the gate, which asks the server who is signed in. The gate decides; this only tells it.
 *
 * Only a real HTTP 401 on a data request counts. A failed fetch (offline, a dead stall
 * connection) never does, so a till with no signal is never signed out by this. The auth
 * endpoints are left out: the gate's own `getUser` check answers there already.
 */
export const SESSION_REJECTED_EVENT = 'hc:session-rejected';

export function reportSessionRejected(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_REJECTED_EVENT));
}

type Fetch = typeof fetch;

function urlOf(input: Parameters<Fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** `fetch` for the Supabase client: the same call, plus a report when the data API answers 401. */
export function fetchReportingRejection(base: Fetch = (...args) => fetch(...args)): Fetch {
  return async (input, init) => {
    const response = await base(input, init);
    if (response.status === 401 && urlOf(input).includes('/rest/v1/')) reportSessionRejected();
    return response;
  };
}
