/**
 * One resolver from a stored image path to the URL the page draws (MP-09 c2). Flavour photos
 * and payment QR codes both go through it.
 *
 * Two kinds of stored path exist:
 * - a bundled file, `assets/…` (seeded flavours; the seed roots it as `/assets/…`), served by
 *   the page itself and kept page-relative, exactly as before;
 * - a bucket path, `qr/<name>.png` or `flavours/<name>.webp`, generated at upload time and
 *   served from the public `shop-media` bucket on the Supabase origin.
 *
 * The engine splices the result into an inline style's unquoted `url(…)`, so anything that could
 * leave it (a quote, parenthesis, space, `;`, a scheme, `..`, a leading slash on a bucket path)
 * resolves to the empty string, which draws no image. The database enforces the same shape on
 * the way in (`save_flavour`, `save_payment_method`); this is the second lock.
 */
export const SHOP_MEDIA_BUCKET = 'shop-media';

const BUNDLED = /^\/?assets\/[A-Za-z0-9/_.-]+$/;
const BUCKET_PATH = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.[A-Za-z0-9]+$/;

/** The Supabase origin an image may load from, or null when none is configured or usable. */
export function supabaseOrigin(
  url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (!(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && loopback))) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolveImagePath(path: string, origin: string | null = supabaseOrigin()): string {
  if (path === '') return '';
  if (BUNDLED.test(path) && !path.includes('..')) return path.replace(/^\//, '');
  if (!BUCKET_PATH.test(path) || path.includes('..')) return '';
  if (!origin) return '';
  return origin + '/storage/v1/object/public/' + SHOP_MEDIA_BUCKET + '/' + path;
}
