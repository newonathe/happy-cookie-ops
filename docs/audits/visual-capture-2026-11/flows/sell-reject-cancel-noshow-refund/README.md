# Flow: Sell: reject, cancel, no-show, refund, swap

**ACTUAL application.** Started at `/orders`, fixture `default`, simulated server. See [the README](../../README.md).

## p390 (390×844): captured

### 1. rejected: Reject applies on the first press

`/order` · heading: Order HC-1101 · says: Payment rejected. The order is cancelled and its slots are free again.

![rejected at p390](../../flows/sell-reject-cancel-noshow-refund/01-rejected/p390.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/01-rejected/p390.full.webp)

### 2. back-to-list: Return to context

`/orders` · heading: Orders · says: 1 payment needs review
Check the reference and the amount on each one.
Show them

![back-to-list at p390](../../flows/sell-reject-cancel-noshow-refund/02-back-to-list/p390.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/02-back-to-list/p390.full.webp)

### 3. paid-order

`/order` · heading: Order HC-1103

![paid-order at p390](../../flows/sell-reject-cancel-noshow-refund/03-paid-order/p390.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/03-paid-order/p390.full.webp)

### 4. refund-form

`/order` · heading: Record refund

![refund-form at p390](../../flows/sell-reject-cancel-noshow-refund/04-refund-form/p390.webp)

### 5. refund-filled

`/order` · heading: Record refund

![refund-filled at p390](../../flows/sell-reject-cancel-noshow-refund/05-refund-filled/p390.webp)

### 6. refund-result

`/order` · heading: Order HC-1103 · says: ₱810 refund recorded. The order is cancelled.

![refund-result at p390](../../flows/sell-reject-cancel-noshow-refund/06-refund-result/p390.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/06-refund-result/p390.full.webp)

### 7. back-after-refund

`/orders` · heading: Orders · says: 1 payment needs review
Check the reference and the amount on each one.
Show them

![back-after-refund at p390](../../flows/sell-reject-cancel-noshow-refund/07-back-after-refund/p390.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/07-back-after-refund/p390.full.webp)

### 8. ready-order

`/order` · heading: Order HC-1105

![ready-order at p390](../../flows/sell-reject-cancel-noshow-refund/08-ready-order/p390.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/08-ready-order/p390.full.webp)

### 9. no-show-form

`/order` · heading: Mark as no-show

![no-show-form at p390](../../flows/sell-reject-cancel-noshow-refund/09-no-show-form/p390.webp)

### 10. no-show-result

`/order` · heading: Order HC-1105 · says: Elsa did not pick up. The order stays paid.

![no-show-result at p390](../../flows/sell-reject-cancel-noshow-refund/10-no-show-result/p390.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/10-no-show-result/p390.full.webp)

## d1440 (1440×900): captured

### 1. rejected: Reject applies on the first press

`/order` · heading: Order HC-1101 · says: Payment rejected. The order is cancelled and its slots are free again.

![rejected at d1440](../../flows/sell-reject-cancel-noshow-refund/01-rejected/d1440.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/01-rejected/d1440.full.webp)

### 2. back-to-list: Return to context

`/orders` · heading: Orders · says: 1 payment needs review
Check the reference and the amount on each one.
Show them

![back-to-list at d1440](../../flows/sell-reject-cancel-noshow-refund/02-back-to-list/d1440.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/02-back-to-list/d1440.full.webp)

### 3. paid-order

`/order` · heading: Order HC-1103

![paid-order at d1440](../../flows/sell-reject-cancel-noshow-refund/03-paid-order/d1440.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/03-paid-order/d1440.full.webp)

### 4. refund-form

`/order` · heading: Record refund

![refund-form at d1440](../../flows/sell-reject-cancel-noshow-refund/04-refund-form/d1440.webp)

### 5. refund-filled

`/order` · heading: Record refund

![refund-filled at d1440](../../flows/sell-reject-cancel-noshow-refund/05-refund-filled/d1440.webp)

### 6. refund-result

`/order` · heading: Order HC-1103 · says: ₱810 refund recorded. The order is cancelled.

![refund-result at d1440](../../flows/sell-reject-cancel-noshow-refund/06-refund-result/d1440.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/06-refund-result/d1440.full.webp)

### 7. back-after-refund

`/orders` · heading: Orders · says: 1 payment needs review
Check the reference and the amount on each one.
Show them

![back-after-refund at d1440](../../flows/sell-reject-cancel-noshow-refund/07-back-after-refund/d1440.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/07-back-after-refund/d1440.full.webp)

### 8. ready-order

`/order` · heading: Order HC-1105

![ready-order at d1440](../../flows/sell-reject-cancel-noshow-refund/08-ready-order/d1440.webp)

[Full page](../../flows/sell-reject-cancel-noshow-refund/08-ready-order/d1440.full.webp)

### 9. no-show-form

`/order` · heading: Mark as no-show

![no-show-form at d1440](../../flows/sell-reject-cancel-noshow-refund/09-no-show-form/d1440.webp)

### 10. no-show-result

`/order` · heading: Order HC-1105 · says: Elsa did not pick up. The order stays paid.

![no-show-result at d1440](../../flows/sell-reject-cancel-noshow-refund/10-no-show-result/d1440.webp)
