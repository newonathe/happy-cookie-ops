import { describe, expect, it } from 'vitest';
import { cartWords } from '@/lib/orders/cart-words';

describe('the order form cart says the count without calling every product a cookie', () => {
  it('words an empty cart and a full one', () => {
    expect(cartWords({ boxCount: 0 })).toEqual({
      boxCountText: 'Nothing picked yet',
      boxTitle: 'Your order',
      countText: '0 in this order'
    });
    expect(cartWords({ boxCount: 3 })).toEqual({
      boxCountText: '3 picked',
      boxTitle: 'Your order · 3',
      countText: '3 in this order'
    });
  });
});
