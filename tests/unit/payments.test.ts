import { describe, expect, it, vi } from 'vitest';
import { resolveImagePath, supabaseOrigin } from '@/lib/media/resolve-image';
import {
  EMPTY_TEXTS,
  classifySaveError,
  engineAccounts,
  newImagePath,
  parseShopPaymentInfo,
  paymentFieldError,
  shopTextsError,
  uploadShopImage,
  type PaymentClient,
  type PaymentMethodFields,
  type UploadClient
} from '@/lib/data/payments';
import { PAYMENT_TOASTS, PaymentSync } from '@/lib/data/payment-sync';

/**
 * MP-09 c2: the image-path resolver, the strict RPC reader, the field bounds that mirror
 * `save_payment_method`, the upload path builder and PaymentSync. Each rule names the
 * mutation that the test below it would catch.
 */
const ORIGIN = 'https://abcdefghijklmnop.supabase.co';
const BUCKET = ORIGIN + '/storage/v1/object/public/shop-media/';

describe('resolveImagePath', () => {
  it('keeps a bundled file page-relative, with or without the seed’s leading slash', () => {
    expect(resolveImagePath('assets/happy-camper.png', ORIGIN)).toBe('assets/happy-camper.png');
    expect(resolveImagePath('/assets/happy-camper.png', ORIGIN)).toBe('assets/happy-camper.png');
    // Mutation: sending assets/ through the bucket branch would point demo photos at the bucket.
  });

  it('turns a generated bucket path into the public bucket URL, for a QR and a flavour photo', () => {
    expect(resolveImagePath('qr/0a1b2c3d.png', ORIGIN)).toBe(BUCKET + 'qr/0a1b2c3d.png');
    expect(resolveImagePath('flavours/abc_DEF-9.webp', ORIGIN)).toBe(
      BUCKET + 'flavours/abc_DEF-9.webp'
    );
    // Mutation: the old enginePath (strip one slash) returns "qr/…", which the page resolves against itself.
  });

  it.each([
    ['a traversal', 'qr/../secret.png'],
    ['a leading slash on a bucket path', '/qr/a.png'],
    ['a scheme', 'https://evil.example/a.png'],
    ['a colon', 'qr/a:b.png'],
    ['a quote that would leave url()', "qr/a'b.png"],
    ['a parenthesis', 'qr/a).png'],
    ['a semicolon', 'qr/a;b.png'],
    ['a space', 'qr/a b.png'],
    ['a query', 'qr/a.png?x=1'],
    ['a backslash', 'qr\\a.png'],
    ['a path with no extension', 'qr/abc'],
    ['an assets path with a traversal', 'assets/../../x.png']
  ])('draws nothing for %s', (_name, path) => {
    expect(resolveImagePath(path, ORIGIN)).toBe('');
    // Mutation: dropping the BUCKET_PATH/`..` checks lets each of these reach the inline style.
  });

  it('draws nothing for an empty path, and nothing for a bucket path with no Supabase origin', () => {
    expect(resolveImagePath('', ORIGIN)).toBe('');
    expect(resolveImagePath('qr/a.png', null)).toBe('');
  });

  it('accepts only an https origin, or http on loopback, and never credentials', () => {
    expect(supabaseOrigin(ORIGIN + '/')).toBe(ORIGIN);
    expect(supabaseOrigin('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321');
    expect(supabaseOrigin('http://evil.example')).toBeNull();
    expect(supabaseOrigin('https://user:pw@x.supabase.co')).toBeNull();
    expect(supabaseOrigin('not a url')).toBeNull();
    expect(supabaseOrigin('')).toBeNull();
  });
});

describe('parseShopPaymentInfo', () => {
  const good = { id: 'gcash', label: 'GCash', number: '0999', name: 'Cine', qr: 'qr/a.png' };
  it('reads well-formed methods and texts', () => {
    const info = parseShopPaymentInfo({
      methods: [good],
      texts: { ...EMPTY_TEXTS, tin_line: 'TIN 1', updated_at: '2026-09-29T00:00:00Z' }
    });
    expect(info.methods).toEqual([good]);
    expect(info.texts.tin_line).toBe('TIN 1');
    expect(info.textsUpdatedAt).toBe('2026-09-29T00:00:00Z');
  });

  it('shows less, never more, when the reply is malformed', () => {
    expect(parseShopPaymentInfo(null)).toEqual({
      methods: [],
      texts: EMPTY_TEXTS,
      textsUpdatedAt: null
    });
    expect(parseShopPaymentInfo('x').methods).toEqual([]);
    const info = parseShopPaymentInfo({
      methods: [good, { ...good, label: 5 }, { ...good, label: '  ' }, { id: 'x' }, null],
      texts: {
        registration_badge: 'x'.repeat(21),
        tin_line: 7,
        invoice_note: 'ok',
        allergen_note: ''
      }
    });
    expect(info.methods).toEqual([good]);
    // Mutation: trusting the reply as typed would put a number or an over-long text on the shop.
    expect(info.texts).toEqual({ ...EMPTY_TEXTS, invoice_note: 'ok' });
  });

  it('gives the engine the label as the method id', () => {
    expect(engineAccounts([good])).toEqual([
      { id: 'GCash', num: '0999', name: 'Cine', qr: 'qr/a.png' }
    ]);
  });
});

describe('classifySaveError', () => {
  it('tells a stale write, a refusal and a lost connection apart', () => {
    expect(classifySaveError(null)).toBe('saved');
    expect(classifySaveError({ code: 'P0002' })).toBe('conflict');
    for (const code of ['22023', '23505', '42501', '55000'])
      expect(classifySaveError({ code })).toBe('refused');
    expect(classifySaveError({ code: '' })).toBe('offline');
    expect(classifySaveError({})).toBe('offline');
  });
});

const method = (over: Partial<PaymentMethodFields> = {}): PaymentMethodFields => ({
  label: 'GCash',
  account_number: '0999 000 1111',
  account_name: 'Cine',
  qr_path: 'qr/a.png',
  active: true,
  sort_order: 0,
  ...over
});

describe('paymentFieldError (mirrors save_payment_method)', () => {
  it('accepts a valid method, with or without a QR', () => {
    expect(paymentFieldError(method())).toBeNull();
    expect(paymentFieldError(method({ qr_path: '' }))).toBeNull();
  });
  it.each([
    ['a blank name', { label: '   ' }],
    ['a 31-character name', { label: 'x'.repeat(31) }],
    ['a 41-character number', { account_number: 'x'.repeat(41) }],
    ['a 61-character account name', { account_name: 'x'.repeat(61) }],
    ['a traversal in the QR path', { qr_path: 'qr/../x.png' }],
    ['a scheme in the QR path', { qr_path: 'https://x/qr/a.png' }],
    ['a QR outside qr/', { qr_path: 'flavours/a.png' }],
    ['an SVG QR', { qr_path: 'qr/a.svg' }],
    ['a fractional order', { sort_order: 1.5 }],
    ['an order of 100', { sort_order: 100 }],
    ['a negative order', { sort_order: -1 }]
  ])('refuses %s', (_name, over) => {
    expect(paymentFieldError(method(over))).not.toBeNull();
  });
  it('bounds the four shop texts at the database limits', () => {
    expect(shopTextsError(EMPTY_TEXTS)).toBeNull();
    expect(shopTextsError({ ...EMPTY_TEXTS, registration_badge: 'x'.repeat(21) })).not.toBeNull();
    expect(shopTextsError({ ...EMPTY_TEXTS, tin_line: 'x'.repeat(81) })).not.toBeNull();
    expect(shopTextsError({ ...EMPTY_TEXTS, invoice_note: 'x'.repeat(201) })).not.toBeNull();
    expect(shopTextsError({ ...EMPTY_TEXTS, allergen_note: 'x'.repeat(301) })).not.toBeNull();
    expect(shopTextsError({ ...EMPTY_TEXTS, allergen_note: 'x'.repeat(300) })).toBeNull();
  });
});

const UNIQUE = '0123456789abcdef0123456789abcdef';

describe('uploads', () => {
  it('generates the name: folder, 32 hex characters and an extension from the type, never the file name', () => {
    expect(newImagePath('qr', 'image/png', UNIQUE)).toBe('qr/' + UNIQUE + '.png');
    expect(newImagePath('flavours', 'image/jpeg', UNIQUE)).toBe('flavours/' + UNIQUE + '.jpg');
    expect(newImagePath('flavours', 'image/webp', UNIQUE)).toBe('flavours/' + UNIQUE + '.webp');
    expect(newImagePath('qr', 'image/svg+xml', UNIQUE)).toBeNull();
    expect(newImagePath('qr', 'text/html', UNIQUE)).toBeNull();
    expect(newImagePath('qr', 'image/png', '../../etc')).toBeNull();
  });

  const storage = (error: unknown = null) => {
    const upload = vi.fn(async () => ({ data: null, error }));
    const client = { storage: { from: vi.fn(() => ({ upload })) } } as unknown as UploadClient;
    return { client, upload };
  };

  it('uploads a valid image to shop-media and returns its path', async () => {
    const { client, upload } = storage();
    const result = await uploadShopImage(client, 'qr', { type: 'image/png', size: 1000 }, UNIQUE);
    expect(result).toEqual({ ok: true, path: 'qr/' + UNIQUE + '.png' });
    expect(upload).toHaveBeenCalledWith('qr/' + UNIQUE + '.png', expect.anything(), {
      contentType: 'image/png',
      upsert: false
    });
  });

  it('refuses a wrong type or size before any request is made', async () => {
    const { client, upload } = storage();
    expect(
      await uploadShopImage(client, 'qr', { type: 'image/svg+xml', size: 10 }, UNIQUE)
    ).toEqual({
      ok: false,
      reason: 'type'
    });
    expect(
      await uploadShopImage(client, 'qr', { type: 'image/png', size: 2 * 1024 * 1024 + 1 }, UNIQUE)
    ).toEqual({
      ok: false,
      reason: 'size'
    });
    expect(await uploadShopImage(client, 'qr', { type: 'image/png', size: 0 }, UNIQUE)).toEqual({
      ok: false,
      reason: 'size'
    });
    expect(upload).not.toHaveBeenCalled();
    // Mutation: dropping the size check sends a 50 MB file; dropping the type check sends an SVG.
  });

  it('tells a refusal from a lost connection', async () => {
    expect(
      await uploadShopImage(
        storage({ statusCode: '403' }).client,
        'qr',
        { type: 'image/png', size: 5 },
        UNIQUE
      )
    ).toEqual({ ok: false, reason: 'refused' });
    expect(
      await uploadShopImage(
        storage({ message: 'Failed to fetch' }).client,
        'qr',
        { type: 'image/png', size: 5 },
        UNIQUE
      )
    ).toEqual({ ok: false, reason: 'offline' });
    const throwing = {
      storage: { from: () => ({ upload: () => Promise.reject(new Error('net')) }) }
    } as unknown as UploadClient;
    expect(await uploadShopImage(throwing, 'qr', { type: 'image/png', size: 5 }, UNIQUE)).toEqual({
      ok: false,
      reason: 'offline'
    });
  });
});

function syncFor(
  handler: (name: string, args?: Record<string, unknown>) => { data?: unknown; error?: unknown }
) {
  const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => ({
    data: null,
    error: null,
    ...handler(name, args)
  }));
  const hooks = { apply: vi.fn(), changed: vi.fn(), toast: vi.fn() };
  const client = {
    rpc,
    storage: { from: () => ({ upload: async () => ({ error: null }) }) }
  } as unknown as PaymentClient & UploadClient;
  return { sync: new PaymentSync(client, hooks), rpc, hooks };
}

describe('PaymentSync', () => {
  const info = {
    methods: [{ id: 'gcash', label: 'GCash', number: '1', name: 'C', qr: '' }],
    texts: { ...EMPTY_TEXTS, tin_line: 'T' }
  };

  it('applies the methods it read to the engine', async () => {
    const { sync, hooks } = syncFor(() => ({ data: info }));
    expect(await sync.loadPublic()).toBe(true);
    expect(hooks.apply).toHaveBeenCalledWith([{ id: 'GCash', num: '1', name: 'C', qr: '' }]);
    expect(sync.info?.texts.tin_line).toBe('T');
  });

  it('a failed read leaves no method and no text, never the previous or the ported ones', async () => {
    const { sync, hooks } = syncFor(() => ({ error: { code: '57014' } }));
    expect(await sync.loadPublic()).toBe(false);
    expect(hooks.apply).toHaveBeenCalledWith([]);
    expect(sync.info).toEqual({ methods: [], texts: EMPTY_TEXTS, textsUpdatedAt: null });
    // Mutation: keeping the old info (or skipping apply) on failure leaves stale accounts on the checkout.
  });

  it('refuses an invalid method before any request, and says why', async () => {
    const { sync, rpc, hooks } = syncFor(() => ({}));
    expect(await sync.saveMethod('gcash', method({ qr_path: 'qr/../x.png' }), null)).toBe(
      'refused'
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(hooks.toast).toHaveBeenCalledWith('The QR image path is not valid.', 'warn');
  });

  it('saves, then reloads both lists', async () => {
    const { sync, rpc } = syncFor((name) =>
      name === 'get_shop_payment_info' ? { data: info } : { data: [] }
    );
    expect(await sync.saveMethod('gcash', method(), '2026-09-29T00:00:00Z')).toBe('saved');
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'save_payment_method',
      'get_payment_methods',
      'get_shop_payment_info'
    ]);
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_id: 'gcash',
      p_expected_updated_at: '2026-09-29T00:00:00Z'
    });
  });

  it('a stale save shows the newer version and says so', async () => {
    const { sync, rpc, hooks } = syncFor((name) =>
      name === 'save_payment_method' ? { error: { code: 'P0002' } } : { data: [] }
    );
    expect(await sync.saveMethod('gcash', method(), 'x')).toBe('conflict');
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.conflict, 'warn');
    expect(rpc.mock.calls.length).toBe(3);
  });

  it('an offline save does not reload and does not claim success', async () => {
    const { sync, rpc, hooks } = syncFor((name) =>
      name === 'save_shop_texts' ? { error: { message: 'x' } } : {}
    );
    expect(await sync.saveTexts(EMPTY_TEXTS, null)).toBe('offline');
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.offline, 'warn');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('a texts save that is too long never reaches the network', async () => {
    const { sync, rpc } = syncFor(() => ({}));
    expect(await sync.saveTexts({ ...EMPTY_TEXTS, tin_line: 'x'.repeat(81) }, null)).toBe(
      'refused'
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('an upload the runtime refuses is toasted and returns null', async () => {
    const { sync, hooks } = syncFor(() => ({}));
    expect(await sync.upload('qr', { type: 'image/gif', size: 5 })).toBeNull();
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.uploadType, 'warn');
    expect(await sync.upload('qr', { type: 'image/png', size: 5 })).toMatch(
      /^qr\/[a-f0-9]{32}\.png$/
    );
  });
});
