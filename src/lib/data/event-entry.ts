import { z } from 'zod';
import type { ScheduledClient } from './scheduled-events';
import type { FrozenEventRequest } from '@/lib/bazaar/event-entry-recovery';

const receipt = z
  .array(z.object({ id: z.uuid(), updated_at: z.iso.datetime({ offset: true }) }))
  .length(1);

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
