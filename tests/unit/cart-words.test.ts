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

  it('says cookies only when every product in the cart is known to be a cookie (migration 87)', () => {
    expect(cartWords({ boxCount: 1 }, true)).toEqual({
      boxCountText: '1 cookie picked',
      boxTitle: 'Your order · 1 cookie',
      countText: '1 cookie in this order'
    });
    expect(cartWords({ boxCount: 3 }, true).boxCountText).toBe('3 cookies picked');
    expect(cartWords({ boxCount: 3 }, false).boxCountText).toBe('3 picked');
    expect(cartWords({ boxCount: 0 }, true).boxCountText).toBe('Nothing picked yet');
  });
});
