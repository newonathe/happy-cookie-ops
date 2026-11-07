import { describe, expect, it, vi } from 'vitest';
import type { BazaarClient } from '@/lib/data/bazaar-days';
import { readKitchenTransferTarget } from '@/lib/bazaar/kitchen-transfer-target';
import example from '../fixtures/bazaar-example.json';

function fixture() {
  const wire = structuredClone(example),
    day = wire.summary.days[0];
  wire.final_hash = null;
  day.state = 'planned';
  let active = true;
  let sourceReply: unknown = [{ product_id: day.lines[0].product_id, source_drop: 3 }];
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'get_bazaar' ? wire : sourceReply,
    error: null
  }));
  const ports = {
    client: { rpc } as unknown as BazaarClient,
    bookingId: wire.summary.booking.id,
    dayId: day.id,
    defaultDrop: 9,
    current: () => active,
    now: () => 1794045600000
  };
  return {
    wire,
    day,
    rpc,
    ports,
    retire: () => {
      active = false;
    },
    sources: (value: unknown) => {
      sourceReply = value;
    }
  };
}

describe('authoritative selected-day transfer target', () => {
  it('reads quantities before immutable sources, retaining recorded source periods', async () => {
    const f = fixture(),
      target = await readKitchenTransferTarget(f.ports);
    expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([
      'get_bazaar',
      'get_bazaar_kitchen_sources'
    ]);
    expect(target.products[0]).toMatchObject({ sourceDrop: 3, separate: false });
    expect(target.closed).toBe(false);
  });
  it('checks separately-made quantities across the whole booking and distinguishes genuine empty', async () => {
    const f = fixture();
    f.sources([]);
    f.day.lines[0].made = 0;
    expect((await readKitchenTransferTarget(f.ports)).products[0]).toMatchObject({
      sourceDrop: 9,
      separate: true
    });
    for (const d of f.wire.summary.days) for (const l of d.lines) l.made = 0;
    expect((await readKitchenTransferTarget(f.ports)).products[0].separate).toBe(false);
  });
  it.each([null, {}, [{ product_id: 'broken' }]])(
    'rejects malformed sources: %j',
    async (value) => {
      const f = fixture();
      f.sources(value);
      await expect(readKitchenTransferTarget(f.ports)).rejects.toThrow();
    }
  );
  it('refuses another booking, a missing day, closed/inactive/finalised destinations', async () => {
    const f = fixture();
    f.ports.bookingId = 'a0820000-0000-4000-8000-000000000001';
    await expect(readKitchenTransferTarget(f.ports)).rejects.toThrow('destination changed');
    f.ports.bookingId = f.wire.summary.booking.id;
    f.ports.dayId = 'a0820000-0000-4000-8000-000000000001';
    await expect(readKitchenTransferTarget(f.ports)).rejects.toThrow('destination changed');
    f.ports.dayId = f.day.id;
    f.day.state = 'closed';
    expect((await readKitchenTransferTarget(f.ports)).closed).toBe(true);
    f.day.state = 'planned';
    f.wire.summary.booking.active = false;
    expect((await readKitchenTransferTarget(f.ports)).closed).toBe(true);
    f.wire.summary.booking.active = true;
    Object.assign(f.wire, {
      finalised_at: '2026-11-07T10:00:00Z',
      final_summary: structuredClone(f.wire.summary)
    });
    expect((await readKitchenTransferTarget(f.ports)).closed).toBe(true);
  });
  it('stops between reads on retirement and rejects retirement during provenance read', async () => {
    const f = fixture();
    f.rpc.mockImplementationOnce(async () => {
      f.retire();
      return { data: f.wire, error: null };
    });
    await expect(readKitchenTransferTarget(f.ports)).rejects.toThrow();
    expect(f.rpc).toHaveBeenCalledTimes(1);
    const g = fixture();
    g.rpc.mockImplementationOnce(async () => ({ data: g.wire, error: null }));
    g.rpc.mockImplementationOnce(async () => {
      g.retire();
      return { data: [], error: null };
    });
    await expect(readKitchenTransferTarget(g.ports)).rejects.toThrow();
  });
});
