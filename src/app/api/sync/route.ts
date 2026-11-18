export const dynamic = 'force-dynamic';

/**
 * Legacy intake is quarantined until authoritative sale commands are verified.
 *
 * A plain web `Response` (not `NextResponse` from `next/server`): the handler needs nothing Next-specific, and importing
 * Next's server bundle made its unit test load it cold and time out under a parallel run (19 November 2026).
 */
export async function POST() {
  return Response.json(
    { error: 'sync_unavailable', accepted: [] },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
