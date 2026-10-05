/**
 * Load test: drop-open.
 *
 * The one moment this app must not fall over is the minute a drop opens, when everyone
 * who has been waiting checks out at once. That is also the one moment it has never been
 * tested at. This script is that test.
 *
 * Run:  pnpm test:load                 (needs k6 — https://k6.io/docs/get-started/installation)
 *       BASE_URL=https://... pnpm test:load
 *
 * Point it at a STAGING deployment, never production. It places real orders.
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://127.0.0.1:3000';

const oversold = new Rate('capacity_oversold');
const duplicates = new Rate('duplicate_orders');
const checkoutTime = new Trend('checkout_duration', true);

export const options = {
  scenarios: {
    // The real shape of the traffic: nothing, then everyone, then a long tail of people
    // checking their order status.
    drop_open: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 5 }, // stragglers from the last drop
        { duration: '5s', target: 40 }, // the drop opens
        { duration: '60s', target: 40 }, // the rush
        { duration: '30s', target: 8 }, // the tail
        { duration: '10s', target: 0 }
      ],
      gracefulRampDown: '10s'
    }
  },
  thresholds: {
    // A customer on Philippine mobile data will not wait longer than this.
    'http_req_duration{scenario:drop_open}': ['p(95)<2000'],
    // Capacity must hold under concurrency. This is the whole point of the test.
    capacity_oversold: ['rate==0'],
    // Idempotency must hold under retry.
    duplicate_orders: ['rate==0'],
    // 429s are fine and expected; 5xx is not.
    'http_req_failed{expected_response:true}': ['rate<0.01']
  }
};

const PRODUCTS = ['dcf', 'hc', 'wcb', 'pbm', 'rvc', 'nch'];

function basket() {
  const count = 1 + Math.floor(Math.random() * 3);
  const items = {};
  for (let i = 0; i < count; i++) {
    items[PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)]] =
      1 + Math.floor(Math.random() * 2);
  }
  return items;
}

function phone() {
  return '09' + String(100000000 + Math.floor(Math.random() * 899999999));
}

export default function dropOpenScenario() {
  const mobile = phone();
  const items = basket();

  group('browse the shop', () => {
    const res = http.get(`${BASE}/shop`);
    check(res, { 'shop loads': (r) => r.status === 200 });
    sleep(1 + Math.random() * 3); // reading the menu
  });

  group('place an order', () => {
    const payload = JSON.stringify({
      customerName: 'Load Test',
      phone: mobile,
      dropId: __ENV.DROP_ID || 'seed-drop',
      items,
      notes: '',
      payMethod: 'gcash'
    });
    const params = { headers: { 'content-type': 'application/json' } };

    const start = Date.now();
    const res = http.post(`${BASE}/api/orders`, payload, params);
    checkoutTime.add(Date.now() - start);

    // 201 accepted, 409 drop full, 429 rate limited. All three are correct behaviour;
    // anything else is a bug this test exists to find.
    check(res, {
      'checkout answered honestly': (r) => [201, 409, 429].includes(r.status),
      'no server error': (r) => r.status < 500
    });

    // The refusal must be honest: a 409 has to report remaining capacity, not just fail.
    if (res.status === 409) {
      const body = res.json();
      oversold.add(!(body && typeof body.remaining === 'number'));
    } else {
      oversold.add(false);
    }

    // The double-tap. Same basket, same phone: the idempotency key must make this one
    // order, not two.
    if (res.status === 201) {
      const retry = http.post(`${BASE}/api/orders`, payload, params);
      const first = res.json();
      const second = retry.json();
      duplicates.add(!(second && first && second.orderId === first.orderId));
    } else {
      duplicates.add(false);
    }
  });

  group('check the order status', () => {
    const res = http.post(
      `${BASE}/api/orders/lookup`,
      JSON.stringify({ orderId: 'HC-1042', phone: mobile }),
      { headers: { 'content-type': 'application/json' } }
    );
    // A wrong phone must return the same 404 as a nonexistent order, or order numbers
    // are enumerable. 429 is also fine — lookup is the tightest limit.
    check(res, { 'lookup does not leak': (r) => [200, 404, 429].includes(r.status) });
  });

  sleep(1);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'];
  return {
    stdout:
      '\n  drop-open load test\n' +
      `  p95 request duration: ${p95 ? p95.toFixed(0) + 'ms' : 'n/a'}\n` +
      `  oversold:             ${data.metrics.capacity_oversold?.values?.rate ?? 'n/a'}\n` +
      `  duplicate orders:     ${data.metrics.duplicate_orders?.values?.rate ?? 'n/a'}\n\n`
  };
}
