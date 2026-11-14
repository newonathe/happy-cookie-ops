import { describe, expect, it, vi } from 'vitest';
import { deleteBazaarBooking, type BazaarClient } from '@/lib/data/bazaar-days';

const BOOKING = 'b0831000-0000-4000-8000-000000000001';

function client(answer: { data?: unknown; error?: { code?: string; message?: string } | null }) {
  const rpc = vi.fn(async () => ({ data: answer.data ?? null, error: answer.error ?? null }));
  return { rpc, client: { rpc } as unknown as BazaarClient };
}

describe('deleteBazaarBooking (End event: delete an event that never sold)', () => {
  it('sends the booking and its exact name, and is deleted only when the answer says what was removed', async () => {
    const { rpc, client: c } = client({
      data: { deleted_at: 1_794_640_000_000, days: 1, events: 1 }
    });
    expect(await deleteBazaarBooking(c, BOOKING, 'The Sopheme Club')).toBe('deleted');
    expect(rpc).toHaveBeenCalledWith('delete_bazaar_booking', {
      p_booking: BOOKING,
      p_confirm_name: 'The Sopheme Club'
    });
    // An answer that does not say what was done is not an acknowledgement.
    expect(await deleteBazaarBooking(client({ data: null }).client, BOOKING, 'x')).toBe('offline');
    expect(await deleteBazaarBooking(client({ data: { days: 1 } }).client, BOOKING, 'x')).toBe(
      'offline'
    );
  });

  it('refuses a malformed booking or name without calling the server', async () => {
    const { rpc, client: c } = client({ data: { deleted_at: 1 } });
    expect(await deleteBazaarBooking(c, 'nope', 'Fair')).toBe('wrong-name');
    expect(await deleteBazaarBooking(c, BOOKING, '')).toBe('wrong-name');
    expect(await deleteBazaarBooking(c, BOOKING, 'x'.repeat(81))).toBe('wrong-name');
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: '22023', message: 'the name given is not the name of that booking' }, 'wrong-name'],
    [
      { code: '55000', message: 'that event has sales: end it and keep or scratch them instead' },
      'has-sales'
    ],
    [
      { code: '55000', message: 'that event has a fee in the books and cannot be deleted' },
      'in-books'
    ],
    [
      {
        code: '55000',
        message: 'that event is finalised: it is in the books and cannot be deleted'
      },
      'in-books'
    ],
    [
      { code: '55000', message: 'that event uses recorded kitchen cookies and cannot be deleted' },
      'in-books'
    ],
    [
      { code: '55000', message: 'that event has a day still selling: close the day first' },
      'open-day'
    ],
    [{ code: 'P0002', message: 'that booking does not exist' }, 'refused'],
    [{ code: '42501', message: 'only the owner may delete an event' }, 'refused'],
    [{ code: '08006', message: 'connection failure' }, 'offline']
  ])('classifies %o as %s', async (error, want) => {
    expect(await deleteBazaarBooking(client({ error }).client, BOOKING, 'Fair')).toBe(want);
  });

  it('treats a thrown request as unanswered', async () => {
    const rpc = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await deleteBazaarBooking({ rpc } as unknown as BazaarClient, BOOKING, 'Fair')).toBe(
      'offline'
    );
  });
});
