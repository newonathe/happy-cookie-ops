import type { OpsVals } from '@/view-models/vals';

/**
 * The order form's cart, in words that hold for every product (Ethan, 15 November 2026). The shop's published menu
 * (`shop_products`) does not say which products are cookies and which are sold by the piece, so the ported "3 cookies
 * picked" would call an ice cream a cookie. The counts are the engine's own; only the words change.
 */
/**
 * Since migration 87 (Ethan, 16 November 2026) the menu says which products are sold by the piece: a cart of only
 * cookies (and cookie sets) says so ("3 cookies picked"); anything else, or a cart whose products are not all known,
 * keeps the neutral words.
 */
export function cartWords(
  v: Pick<OpsVals, 'boxCount'>,
  allCookies = false
): {
  boxCountText: string;
  boxTitle: string;
  /** For `cust.countText`, merged into the runtime's own `cust`. */
  countText: string;
} {
  const n = Number(v.boxCount) || 0;
  if (n > 0 && allCookies) {
    const word = n === 1 ? 'cookie' : 'cookies';
    return {
      boxCountText: `${n} ${word} picked`,
      boxTitle: `Your order · ${n} ${word}`,
      countText: `${n} ${word} in this order`
    };
  }
  return {
    boxCountText: n === 0 ? 'Nothing picked yet' : `${n} picked`,
    boxTitle: n === 0 ? 'Your order' : `Your order · ${n}`,
    countText: `${n} in this order`
  };
}
