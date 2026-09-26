import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Legacy intake is quarantined until authoritative sale commands are verified. */
export async function POST() {
  return NextResponse.json(
    { error: 'sync_unavailable', accepted: [] },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}
