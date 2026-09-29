import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { SHOP_MEDIA_BUCKET } from '@/lib/media/resolve-image';

/**
 * Payment methods, the shop's footer texts and image uploads (MP-09 c2, migration
 * 20260101003400). Customers and staff read `get_shop_payment_info()` (anon may execute it);
 * the owner reads and writes through `get_payment_methods`, `save_payment_method` and
 * `save_shop_texts`. Nothing here ever falls back to the ported demo accounts.
 */
export type PaymentClient = Pick<SupabaseClient<Database>, 'rpc'>;
export type UploadClient = Pick<SupabaseClient<Database>, 'storage'>;

export interface PublicMethod {
  id: string;
  label: string;
  number: string;
  name: string;
  qr: string;
}
export interface ShopTexts {
  registration_badge: string;
  tin_line: string;
  invoice_note: string;
  allergen_note: string;
}
export interface ShopPaymentInfo {
  methods: PublicMethod[];
  texts: ShopTexts;
  textsUpdatedAt: string | null;
}
export type PaymentMethodRow =
  Database['public']['Functions']['get_payment_methods']['Returns'][number];
export type PaymentMethodFields = Omit<PaymentMethodRow, 'id' | 'updated_at'>;

export const EMPTY_TEXTS: ShopTexts = {
  registration_badge: '',
  tin_line: '',
  invoice_note: '',
  allergen_note: ''
};
export const TEXT_LIMITS: Record<keyof ShopTexts, number> = {
  registration_badge: 20,
  tin_line: 80,
  invoice_note: 200,
  allergen_note: 300
};
export const QR_PATH = /^qr\/[A-Za-z0-9_-]{1,64}\.(png|jpg|jpeg|webp)$/;

const isText = (value: unknown): value is string => typeof value === 'string';

/**
 * Reads the RPC's JSON strictly: a method with a missing or non-text field is dropped, and a
 * malformed texts block becomes empty texts. Anything unexpected shows less, never more.
 */
export function parseShopPaymentInfo(json: unknown): ShopPaymentInfo {
  const root = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const methods: PublicMethod[] = [];
  if (Array.isArray(root.methods)) {
    for (const item of root.methods) {
      const m = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
      if (
        isText(m.id) &&
        isText(m.label) &&
        m.label.trim() &&
        isText(m.number) &&
        isText(m.name) &&
        isText(m.qr)
      ) {
        methods.push({ id: m.id, label: m.label, number: m.number, name: m.name, qr: m.qr });
      }
    }
  }
  const t = (root.texts && typeof root.texts === 'object' ? root.texts : {}) as Record<
    string,
    unknown
  >;
  const texts = { ...EMPTY_TEXTS };
  for (const key of Object.keys(EMPTY_TEXTS) as Array<keyof ShopTexts>) {
    const value = t[key];
    if (isText(value) && value.length <= TEXT_LIMITS[key]) texts[key] = value;
  }
  return { methods, texts, textsUpdatedAt: isText(t.updated_at) ? t.updated_at : null };
}

export async function fetchShopPaymentInfo(client: PaymentClient): Promise<ShopPaymentInfo> {
  const { data, error } = await client.rpc('get_shop_payment_info');
  if (error) throw new Error('payment info load failed: ' + (error.code || error.message));
  return parseShopPaymentInfo(data);
}

export async function fetchPaymentMethods(client: PaymentClient): Promise<PaymentMethodRow[]> {
  const { data, error } = await client.rpc('get_payment_methods');
  if (error) throw new Error('payment methods load failed: ' + (error.code || error.message));
  return data ?? [];
}

/** The engine's `PAY_ACCOUNTS` shape: `id` is the label an order stores. */
export function engineAccounts(methods: ReadonlyArray<PublicMethod>) {
  return methods.map((m) => ({ id: m.label, num: m.number, name: m.name, qr: m.qr }));
}

export type SaveOutcome = 'saved' | 'conflict' | 'refused' | 'offline';

/** P0002 is a stale write; a database refusal is final; anything else is a lost connection. */
export function classifySaveError(error: { code?: string } | null): SaveOutcome {
  if (!error) return 'saved';
  if (error.code === 'P0002') return 'conflict';
  if (['22023', '23505', '42501', '55000'].includes(error.code ?? '')) return 'refused';
  return 'offline';
}

/** The same bounds `save_payment_method` enforces, so a sure refusal is never sent. */
export function paymentFieldError(fields: PaymentMethodFields): string | null {
  if (fields.label.trim().length < 1 || fields.label.trim().length > 30)
    return 'Name must be 1-30 characters.';
  if (fields.account_number.length > 40) return 'Account number must be 40 characters or fewer.';
  if (fields.account_name.length > 60) return 'Account name must be 60 characters or fewer.';
  if (fields.qr_path !== '' && !QR_PATH.test(fields.qr_path))
    return 'The QR image path is not valid.';
  if (!Number.isInteger(fields.sort_order) || fields.sort_order < 0 || fields.sort_order > 99)
    return 'Order must be a whole number from 0 to 99.';
  return null;
}

export function shopTextsError(texts: ShopTexts): string | null {
  for (const key of Object.keys(TEXT_LIMITS) as Array<keyof ShopTexts>) {
    if (texts[key].trim().length > TEXT_LIMITS[key])
      return 'Each shop text has a limit: ' + TEXT_LIMITS[key] + ' characters here.';
  }
  return null;
}

export async function savePaymentMethod(
  client: PaymentClient,
  id: string,
  fields: PaymentMethodFields,
  expectedUpdatedAt: string | null
): Promise<SaveOutcome> {
  const payload: Json = {
    label: fields.label,
    account_number: fields.account_number,
    account_name: fields.account_name,
    qr_path: fields.qr_path,
    active: fields.active,
    sort_order: fields.sort_order
  };
  try {
    const { error } = await client.rpc('save_payment_method', {
      p_id: id,
      p_method: payload,
      p_expected_updated_at: expectedUpdatedAt as string
    });
    return classifySaveError(error);
  } catch {
    return 'offline';
  }
}

export async function saveShopTexts(
  client: PaymentClient,
  texts: ShopTexts,
  expectedUpdatedAt: string | null
): Promise<SaveOutcome> {
  try {
    const { error } = await client.rpc('save_shop_texts', {
      p_texts: { ...texts },
      p_expected_updated_at: expectedUpdatedAt as string
    });
    return classifySaveError(error);
  } catch {
    return 'offline';
  }
}

export const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type UploadResult =
  { ok: true; path: string } | { ok: false; reason: 'type' | 'size' | 'refused' | 'offline' };

/** A generated bucket path: the file's own name never reaches the bucket. */
export function newImagePath(
  folder: 'qr' | 'flavours',
  type: string,
  unique: string
): string | null {
  const ext = IMAGE_TYPES[type];
  return ext && /^[a-f0-9]{32}$/.test(unique) ? folder + '/' + unique + '.' + ext : null;
}

export async function uploadShopImage(
  client: UploadClient,
  folder: 'qr' | 'flavours',
  file: { type: string; size: number },
  unique: string = crypto.randomUUID().replace(/-/g, '')
): Promise<UploadResult> {
  const path = newImagePath(folder, file.type, unique);
  if (!path) return { ok: false, reason: 'type' };
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return { ok: false, reason: 'size' };
  try {
    const { error } = await client.storage
      .from(SHOP_MEDIA_BUCKET)
      .upload(path, file as Blob, { contentType: file.type, upsert: false });
    if (!error) return { ok: true, path };
    const status = (error as { statusCode?: string | number }).statusCode;
    return {
      ok: false,
      reason: status && Number(status) >= 400 && Number(status) < 500 ? 'refused' : 'offline'
    };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
