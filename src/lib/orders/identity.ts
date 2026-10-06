/**
 * The shop's own words for itself, as the sentences in `copy.ts`, `staff-copy.ts`,
 * `status-view.ts` and the message templates use them (slice B2, audit finding H14).
 *
 * No sentence in the live layer names the owner or the shop: each one asks here. The values
 * are the owner's (`get_shop_identity()`, set under Shop texts) and start empty, and an empty
 * value gives neutral wording, never a name. The live runtime calls `setIdentityWords` after
 * each read, the same replace-in-place the flavour list and payment accounts use, so the
 * hundred-odd places that read a sentence need no change.
 */
export interface IdentityWords {
  shopName: string;
  ownerName: string;
  contactLine: string;
}

const NONE: IdentityWords = { shopName: '', ownerName: '', contactLine: '' };
let words: IdentityWords = NONE;

/** Null (nothing read, or a failed read) puts the neutral wording back. */
export function setIdentityWords(next: IdentityWords | null): void {
  words = next
    ? { shopName: next.shopName, ownerName: next.ownerName, contactLine: next.contactLine }
    : NONE;
}

/** The owner's name where a sentence names who acts, or the fallback ("We", "the owner"). */
export const ownerOr = (fallback: string): string => words.ownerName || fallback;

/** A sentence followed by how to reach the shop, when the owner has said how. */
export const withContact = (sentence: string): string =>
  words.contactLine ? sentence + ' ' + words.contactLine : sentence;

/** How to reach the shop, or the fallback for a line that is nothing else. */
export const contactOr = (fallback: string): string => words.contactLine || fallback;

/** "Your Dulce Lab order", or "Your order" while the shop has no name set. */
export const yourOrder = (): string =>
  words.shopName ? 'Your ' + words.shopName + ' order' : 'Your order';
