import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import * as axe from 'axe-core';
import { CustomerPaymentDetails } from '@/components/live/customer/payment-details';
import type { OpsVals } from '@/view-models/vals';

type Payment = NonNullable<OpsVals['liveCustomerPayment']>;
const moment = Date.parse('2026-11-10T01:00:00Z');
const fixture = (): Payment => ({
  order: {
    orderNo: 'HC-1001',
    state: 'Payment review',
    payState: 'unpaid',
    payMethod: 'GCash',
    totalCents: 25000,
    paidCents: null,
    pickupDate: '2026-11-12',
    pickupWindow: '09:00',
    placedAt: '2026-11-10T00:00:00Z',
    holdExpiresAt: new Date(moment + 1000).toISOString(),
    items: []
  },
  fresh: true,
  methods: [{ id: 'gcash', label: 'GCash', number: '0999', name: 'Synthetic owner', qr: '' }],
  paymentState: 'ready',
  canRetry: true,
  retry: vi.fn()
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(moment);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it('shows the exact server total and selected owner account, then removes instructions at the hold deadline', () => {
  const payment = fixture(),
    ui = render(<CustomerPaymentDetails payment={payment} />);
  expect(ui.getAllByText('₱250.00')).toHaveLength(2);
  fireEvent.click(ui.getByRole('button', { name: 'Refresh payment details' }));
  expect(payment.retry).toHaveBeenCalledOnce();
  expect(ui.getByText('Account number: 0999')).toBeTruthy();
  expect(ui.getByText('Not recorded')).toBeTruthy();
  expect(ui.getByText('Payment needs verification by the shop.')).toBeTruthy();
  expect(ui.getByText('Send payment proof to the shop for verification.')).toBeTruthy();
  act(() => vi.advanceTimersByTime(1001));
  expect(ui.queryByText('Account number: 0999')).toBeNull();
  expect(ui.queryByText('Amount to pay')).toBeNull();
  expect(ui.getByText(/payment hold has ended/)).toBeTruthy();
});
it.each([
  ['Confirmed', 'confirmed', 25000, 'Payment confirmed by the shop.', false],
  ['Confirmed', 'confirmed', 20000, 'Remaining balance', true],
  [
    'Confirmed',
    'confirmed',
    30000,
    'Recorded payment exceeds the current total. Contact the shop about the difference.',
    false
  ],
  ['Cancelled', 'refunded', 25000, 'Refund recorded.', false],
  ['Cancelled', 'unpaid', null, 'Order cancelled.', false],
  [
    'Payment review',
    'unpaid',
    undefined,
    'Recorded payment details are unavailable. Check with the shop before paying.',
    false
  ],
  [
    'Payment review',
    'unpaid',
    5000,
    'Payment needs checking by the shop before you send another payment.',
    false
  ],
  [
    'Payment review',
    'claimed',
    null,
    'Payment needs checking by the shop before you send another payment.',
    false
  ]
] as const)(
  'renders recorded payment facts for %s/%s/%s without inventing confirmation or refunds',
  (state, payState, paidCents, message, account) => {
    const payment = fixture();
    payment.order = { ...payment.order, state, payState, paidCents };
    const ui = render(<CustomerPaymentDetails payment={payment} />);
    expect(ui.getByText(message)).toBeTruthy();
    expect(!!ui.queryByText('Account number: 0999')).toBe(account);
    if (account) expect(ui.getByText('₱50.00')).toBeTruthy();
    if (paidCents === undefined) expect(ui.getByText('Unavailable', { exact: true })).toBeTruthy();
    expect(ui.queryByRole('button', { name: /confirm|paid|refund/i })).toBeNull();
  }
);
it('withholds stale and ambiguous account instructions and offers only local metadata recovery', () => {
  const payment = fixture(),
    ui = render(<CustomerPaymentDetails payment={payment} />);
  ui.rerender(<CustomerPaymentDetails payment={{ ...payment, fresh: false }} />);
  expect(ui.queryByText('Account number: 0999')).toBeNull();
  expect(ui.getByText('Refresh your order status before paying.')).toBeTruthy();
  ui.rerender(
    <CustomerPaymentDetails
      payment={{
        ...payment,
        methods: [payment.methods![0]!, { ...payment.methods![0]!, number: '0888' }]
      }}
    />
  );
  expect(ui.queryByText(/Account number/)).toBeNull();
  fireEvent.click(ui.getByRole('button', { name: 'Retry payment details' }));
  expect(payment.retry).toHaveBeenCalledOnce();
  ui.rerender(
    <CustomerPaymentDetails
      payment={{ ...payment, methods: null, paymentState: 'failed', canRetry: false }}
    />
  );
  expect((ui.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(ui.getByRole('button'));
  expect(payment.retry).toHaveBeenCalledOnce();
});
it('has no automated accessibility violations', async () => {
  vi.useRealTimers();
  const payment = fixture();
  payment.order.holdExpiresAt = new Date(Date.now() + 60000).toISOString();
  const ui = render(
    <main>
      <CustomerPaymentDetails payment={payment} />
    </main>
  );
  expect(
    (await axe.run(ui.container, { rules: { 'color-contrast': { enabled: false } } })).violations
  ).toEqual([]);
});
