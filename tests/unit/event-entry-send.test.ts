import { describe, expect, it, vi } from 'vitest';
import { sendEventEntry } from '@/lib/data/event-entry';
import { freezeEventEntry } from '@/lib/bazaar/event-entry-recovery';
import type { ScheduledClient } from '@/lib/data/scheduled-events';

const body = freezeEventEntry({
  id: '22222222-2222-4222-8222-222222222222',
  name: ' Weekend market ',
  place: ' Hall ',
  startsOn: '2026-12-12',
  endsOn: '2026-12-13',
  rent: '₱ 2,500.50'
})!;
const at = '2026-11-04T04:00:00+00:00';

describe('frozen event create acknowledgement', () => {
  it('sends the retained wire body unchanged and accepts its own server receipt', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: [{ id: body.p_event.id, updated_at: at }], error: null });
    expect(await sendEventEntry({ rpc } as unknown as ScheduledClient, body)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('save_scheduled_event', body);
    expect(body.p_event.rent_cents).toBe(250050);
    expect(body.p_event.name).toBe('Weekend market');
  });
  it.each([
    null,
    [],
    {},
    [{ id: body.p_event.id }],
    [{ id: body.p_event.id, updated_at: 'not a timestamp' }],
    [{ id: '33333333-3333-4333-8333-333333333333', updated_at: at }],
    [
      { id: body.p_event.id, updated_at: at },
      { id: body.p_event.id, updated_at: at }
    ]
  ])('retains an unconfirmed request for unusable reply %j', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    expect(await sendEventEntry({ rpc } as unknown as ScheduledClient, body)).toBe(false);
  });
  it('does not accept data alongside an error or a thrown transport failure', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: body.p_event.id, updated_at: at }],
      error: { code: '42501' }
    });
    expect(await sendEventEntry({ rpc } as unknown as ScheduledClient, body)).toBe(false);
    rpc.mockRejectedValueOnce(new Error('network'));
    expect(await sendEventEntry({ rpc } as unknown as ScheduledClient, body)).toBe(false);
  });
});
