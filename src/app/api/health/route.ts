import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Liveness for the container health check and for uptime monitoring. */
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  let database: 'ok' | 'unreachable' | 'not-configured' = 'not-configured';

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from('products').select('id').limit(1);
      database = error ? 'unreachable' : 'ok';
    } catch {
      database = 'unreachable';
    }
  }

  return NextResponse.json(
    { status: database === 'unreachable' ? 'degraded' : 'ok', database, ms: Date.now() - started },
    { status: database === 'unreachable' ? 503 : 200 }
  );
}
