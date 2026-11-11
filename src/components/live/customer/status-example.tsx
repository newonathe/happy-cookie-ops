'use client';
import { useLayoutEffect } from 'react';
import type { OpsVals } from '@/view-models/vals';
import type { OrderStatusView } from '@/lib/data/orders';
import { statusCust } from '@/lib/orders/status-view';
import { CustomerStatusLive } from './status-live';

// A labelled display example: never an OrderFlow, request, status token or saved order.
const EXAMPLE: OrderStatusView = {
  orderNo: 'HC-0000',
  state: 'Payment review',
  payState: 'unpaid',
  payMethod: '',
  totalCents: 0,
  paidCents: null,
  pickupDate: null,
  pickupWindow: null,
  placedAt: '',
  holdExpiresAt: null,
  items: []
};
export function CustomerStatusExample({ v, back }: { v: OpsVals; back: () => void }) {
  useLayoutEffect(() => {
    if (window.scrollY > 0) window.scrollTo(0, 0);
  }, []);
  const example: OpsVals = {
    ...v,
    backToShop: back,
    liveStatusRead: null,
    liveCustomerPayment: null,
    cust: {
      ...v.cust,
      ...statusCust(EXAMPLE, { allergenNote: '' }),
      heroBody: 'A customer’s order has been received; payment is not confirmed yet.',
      windowText: 'Example pickup window'
    }
  };
  return <CustomerStatusLive v={example} preview />;
}
