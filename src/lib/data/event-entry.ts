import { z } from 'zod';
import type { ScheduledClient, ScheduledEvent } from './scheduled-events';
import type { FrozenEventRequest } from '@/lib/bazaar/event-entry-recovery';

const receipt = z
  .array(z.object({ id: z.uuid(), updated_at: z.iso.datetime({ offset: true }) }))
  .length(1);

/** Presence alone cannot resolve an uncertain create: compare every normalized submitted field. */
export function matchesEventEntry(body: FrozenEventRequest, row: ScheduledEvent): boolean {
  const event = body.p_event;
  return (
    row.id === event.id &&
    row.name === event.name &&
    row.place === event.place &&
    row.startsOn === event.starts_on &&
    row.endsOn === event.ends_on &&
    row.rentCents === event.rent_cents &&
    row.active === event.active
  );
}

/** Send the already frozen create body. An empty HTTP success is not an acknowledgement. */
export async function sendEventEntry(
  client: ScheduledClient,
  body: FrozenEventRequest
): Promise<boolean> {
  try {
    const { data, error } = await client.rpc('save_scheduled_event', {
      p_event: { ...body.p_event },
      // The existing generated placeholder omits SQL's nullable create stamp.
      p_expected_updated_at: body.p_expected_updated_at as unknown as string
    });
    const parsed = receipt.safeParse(data);
    return !error && parsed.success && parsed.data[0]?.id === body.p_event.id;
  } catch {
    return false;
  }
}
