import { describe, expect, it } from 'vitest';
import { parseShopOrderRules, pickupTimes } from '@/lib/orders/pickup';
import { parseOrderStatus } from '@/lib/data/orders';
import { pickupText, statusCust } from '@/lib/orders/status-view';
import { savedPickupText } from '@/lib/orders/saved-pickup';
import { messagesFor } from '@/lib/orders/messages';
import type { StaffOrder } from '@/lib/data/staff-orders';

const rules = {
  pickup_days: [1, 4],
  lead_min_days: 1,
  lead_max_days: 14,
  pickup_from_hour: 9,
  pickup_cutoff_hour: 17,
  campus_from: '14:00',
  campus_to: '15:30',
  unpaid_hold_hours: 24
};
describe('owner-configured special pickup', () => {
  it('uses the configured location/time while preserving the existing wire value', () => {
    const parsed = parseShopOrderRules({ ...rules, campus_label: 'JSEC Ateneo' });
    expect(parsed).not.toBeNull();
    expect(pickupTimes(parsed!).at(-1)).toEqual({
      value: 'campus',
      label: 'JSEC Ateneo · 2:00 PM – 3:30 PM'
    });
    expect(pickupTimes(parsed!, 14 * 60).some((row) => row.value === 'campus')).toBe(false);
  });
  it.each(['', '  ', 'x'.repeat(81), 'A\nB', null, 42])(
    'refuses malformed location %j',
    (campus_label) => {
      expect(parseShopOrderRules({ ...rules, campus_label })).toBeNull();
    }
  );
  it('keeps old schema responses compatible during rollout', () => {
    expect(pickupTimes(parseShopOrderRules(rules)!).at(-1)?.label).toBe(
      'Campus · 2:00 PM – 3:30 PM'
    );
  });
  it('displays the saved order snapshot independently of current shop settings', () => {
    const order = parseOrderStatus({
      order_no: 'HC-1234',
      state: 'Confirmed',
      pay_state: 'paid',
      pay_method: 'Cash',
      total_cents: 100,
      pickup_date: '2026-11-19',
      pickup_window: 'campus',
      pickup_label: 'Original location · 2:00 PM – 3:30 PM',
      placed_at: '2026-11-16T10:00:00Z',
      items: []
    });
    expect(order).not.toBeNull();
    expect(pickupText(order!)).toContain('Original location · 2:00 PM – 3:30 PM');
  });
  it('does not mix labels for orders sharing a date and campus wire value', () => {
    expect(savedPickupText('2026-11-19', 'campus', 'short', 'First location')).toContain(
      'First location'
    );
    expect(savedPickupText('2026-11-19', 'campus', 'short', 'Second location')).toContain(
      'Second location'
    );
    expect(savedPickupText('2026-11-19', 'campus')).toContain('Campus pickup');
  });
  it('uses the saved location in the customer pickup timeline', () => {
    const order = parseOrderStatus({
      order_no: 'HC-1234',
      state: 'Confirmed',
      pay_state: 'confirmed',
      pay_method: 'Cash',
      total_cents: 100,
      pickup_date: '2026-11-19',
      pickup_window: 'campus',
      pickup_label: 'Original location · 2:00 PM – 3:30 PM',
      placed_at: '2026-11-16T10:00:00Z',
      items: []
    });
    expect(
      statusCust(order!, { allergenNote: '', now: 0 }).timeline.find(
        (row) => row.what === 'Ready for pickup'
      )?.sub
    ).toBe(order?.pickupLabel);
  });
  it.each(['Confirmed', 'Ready'] as const)(
    'uses the saved location in the %s message draft',
    (state) => {
      const order: StaffOrder = {
        id: 'HC-1234',
        name: 'Synthetic buyer',
        phone: '',
        ig: '',
        state,
        payState: 'confirmed',
        payMethod: 'Cash',
        payRef: '',
        totalCents: 100,
        paidCents: 100,
        refundRef: '',
        pickupDate: '2026-11-19',
        pickupWindow: 'campus',
        pickupLabel: 'Original location · 2:00 PM – 3:30 PM',
        placedAt: 0,
        updatedAt: '',
        statusToken: null,
        holds: true,
        items: [],
        swaps: [],
        surchargeCents: 0,
        sameDay: false,
        addOns: [],
        boxes: []
      };
      expect(messagesFor(order, 'https://example.invalid', () => 'Synthetic')[0]?.text).toContain(
        order.pickupLabel
      );
    }
  );
});
