import {
  EMPTY_TEXTS,
  engineAccounts,
  fetchPaymentMethods,
  fetchShopPaymentInfo,
  paymentFieldError,
  savePaymentMethod,
  saveShopTexts,
  shopTextsError,
  uploadShopImage,
  type PaymentClient,
  type PaymentMethodFields,
  type PaymentMethodRow,
  type SaveOutcome,
  type ShopPaymentInfo,
  type ShopTexts,
  type UploadClient
} from '@/lib/data/payments';

type Accounts = ReturnType<typeof engineAccounts>;

export interface PaymentHooks {
  /** Replaces the engine's payment accounts (the approved `replacePayAccounts` exception). */
  apply: (accounts: Accounts) => void;
  /** Something the screen shows changed; render again. */
  changed: () => void;
  toast: (message: string, tone?: 'warn') => void;
}

export const PAYMENT_TOASTS = {
  conflict: 'Someone else changed this just now. Showing their version.',
  offline: 'Offline. That did not save.',
  refused: 'That could not be saved.',
  uploadType: 'Use a PNG, JPEG or WebP image.',
  uploadSize: 'That image is over 2 MB. Choose a smaller one.',
  uploadFailed: 'The image could not be uploaded. Try again.'
} as const;

/**
 * The payment methods and shop texts the live app shows (MP-09 c2). Whatever the read gives is
 * what the shop shows: a failed or empty read means no methods, no QR and no footer claim,
 * never the ported demo accounts. The owner's list, saves and uploads go through the same object.
 */
export class PaymentSync {
  /** Null until the public read has finished (or failed, which leaves it empty, not stale). */
  info: ShopPaymentInfo | null = null;
  rows: PaymentMethodRow[] = [];

  constructor(
    private readonly client: PaymentClient & UploadClient,
    private readonly hooks: PaymentHooks
  ) {}

  async loadPublic(): Promise<boolean> {
    let info: ShopPaymentInfo;
    let ok = true;
    try {
      info = await fetchShopPaymentInfo(this.client);
    } catch {
      ok = false;
      info = { methods: [], texts: { ...EMPTY_TEXTS }, textsUpdatedAt: null };
    }
    this.info = info;
    this.hooks.apply(engineAccounts(info.methods));
    this.hooks.changed();
    return ok;
  }

  async loadRows(): Promise<boolean> {
    try {
      this.rows = await fetchPaymentMethods(this.client);
    } catch {
      this.hooks.toast(PAYMENT_TOASTS.offline, 'warn');
      return false;
    }
    this.hooks.changed();
    return true;
  }

  private async settle(outcome: SaveOutcome): Promise<SaveOutcome> {
    if (outcome === 'saved') {
      await Promise.all([this.loadRows(), this.loadPublic()]);
    } else if (outcome === 'conflict') {
      this.hooks.toast(PAYMENT_TOASTS.conflict, 'warn');
      await Promise.all([this.loadRows(), this.loadPublic()]);
    } else {
      this.hooks.toast(PAYMENT_TOASTS[outcome], 'warn');
    }
    return outcome;
  }

  async saveMethod(
    id: string,
    fields: PaymentMethodFields,
    expectedUpdatedAt: string | null
  ): Promise<SaveOutcome> {
    const problem = paymentFieldError(fields);
    if (problem) {
      this.hooks.toast(problem, 'warn');
      return 'refused';
    }
    return this.settle(await savePaymentMethod(this.client, id, fields, expectedUpdatedAt));
  }

  async saveTexts(texts: ShopTexts, expectedUpdatedAt: string | null): Promise<SaveOutcome> {
    const problem = shopTextsError(texts);
    if (problem) {
      this.hooks.toast(problem, 'warn');
      return 'refused';
    }
    return this.settle(await saveShopTexts(this.client, texts, expectedUpdatedAt));
  }

  /** Uploads one image and returns its stored path, or null after telling the owner why. */
  async upload(
    folder: 'qr' | 'flavours',
    file: { type: string; size: number }
  ): Promise<string | null> {
    const result = await uploadShopImage(this.client, folder, file);
    if (result.ok) return result.path;
    this.hooks.toast(
      result.reason === 'type'
        ? PAYMENT_TOASTS.uploadType
        : result.reason === 'size'
          ? PAYMENT_TOASTS.uploadSize
          : PAYMENT_TOASTS.uploadFailed,
      'warn'
    );
    return null;
  }
}
