import { describe, expect, it, vi } from 'vitest';
import { PAYMENT_TOASTS, PaymentSync, type FlavourResizer } from '@/lib/data/payment-sync';
import type { PaymentClient, UploadClient } from '@/lib/data/payments';

/**
 * The flavour photo that reaches the bucket is the resized copy, never the picked original; a
 * payment QR is never recompressed. The storage client and the resizer are fakes.
 */

function setup(resizer?: FlavourResizer) {
  const upload = vi.fn(async () => ({ data: null, error: null }));
  const client = {
    rpc: vi.fn(),
    storage: { from: vi.fn(() => ({ upload })) }
  } as unknown as PaymentClient & UploadClient;
  const hooks = { apply: vi.fn(), changed: vi.fn(), toast: vi.fn() };
  const sync = new PaymentSync(client, hooks, resizer ? { resizeFlavourPhoto: resizer } : {});
  return { sync, upload, hooks };
}

const MB = 1024 * 1024;
// An 18 MB original: only its reported size matters to the code under test, so it is not allocated (a real 18 MB buffer made this
// file time out when the machine was busy).
const big = new File([new Uint8Array(8)], 'IMG_9999.JPG', { type: 'image/jpeg' });
Object.defineProperty(big, 'size', { value: 18 * MB });
const small = new Blob([new Uint8Array(900_000)], { type: 'image/webp' });

describe('flavour photo upload', () => {
  it('sends the resized blob, never the original, and an 18 MB original now uploads', async () => {
    const resizer = vi.fn(async () => ({ ok: true as const, file: small }));
    const { sync, upload, hooks } = setup(resizer);
    const path = await sync.upload('flavours', big);
    expect(path).toMatch(/^flavours\/[a-f0-9]{32}\.webp$/);
    expect(resizer).toHaveBeenCalledWith(big);
    const [, sent, options] = upload.mock.calls[0] as unknown as [
      string,
      Blob,
      { contentType: string }
    ];
    expect(sent).toBe(small);
    expect(sent).not.toBe(big);
    expect(sent.size).toBe(900_000);
    expect(options.contentType).toBe('image/webp');
    expect(hooks.toast).not.toHaveBeenCalled();
  });

  it('uses the resized type for the stored extension (a JPEG fallback is stored as .jpg)', async () => {
    const jpeg = new Blob([new Uint8Array(500)], { type: 'image/jpeg' });
    const { sync } = setup(async () => ({ ok: true, file: jpeg }));
    expect(await sync.upload('flavours', big)).toMatch(/^flavours\/[a-f0-9]{32}\.jpg$/);
  });

  it('leaves a payment QR untouched: the original goes through and the resizer is never called', async () => {
    const resizer = vi.fn(async () => ({ ok: true as const, file: small }));
    const { sync, upload } = setup(resizer);
    const qr = new File([new Uint8Array(5000)], 'qr.png', { type: 'image/png' });
    expect(await sync.upload('qr', qr)).toMatch(/^qr\/[a-f0-9]{32}\.png$/);
    expect(resizer).not.toHaveBeenCalled();
    expect((upload.mock.calls[0] as unknown[])[1]).toBe(qr);
  });

  it('an oversize QR is still refused (no resizing for QR codes)', async () => {
    const resizer = vi.fn();
    const { sync, upload, hooks } = setup(resizer);
    const qr = new File([new Uint8Array(3 * MB)], 'qr.png', { type: 'image/png' });
    expect(await sync.upload('qr', qr)).toBeNull();
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.uploadSize, 'warn');
    expect(resizer).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('an unreadable picture is toasted in plain language, returns null and uploads nothing', async () => {
    const { sync, upload, hooks } = setup(async () => ({ ok: false, reason: 'unreadable' }));
    expect(await sync.upload('flavours', big)).toBeNull();
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.photoUnreadable, 'warn');
    expect(PAYMENT_TOASTS.photoUnreadable).toBe(
      'Could not read that picture. Choose a PNG, JPEG or WebP.'
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('a picture that cannot be made small enough is toasted, returns null and uploads nothing', async () => {
    const { sync, upload, hooks } = setup(async () => ({ ok: false, reason: 'too_big' }));
    expect(await sync.upload('flavours', big)).toBeNull();
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.photoTooBig, 'warn');
    expect(PAYMENT_TOASTS.photoTooBig).toBe('Could not make that picture small enough.');
    expect(upload).not.toHaveBeenCalled();
  });

  it("a failed upload of the resized photo keeps today's toast and returns null", async () => {
    const { sync, upload, hooks } = setup(async () => ({ ok: true, file: small }));
    upload.mockResolvedValueOnce({ data: null, error: { statusCode: '500' } } as never);
    expect(await sync.upload('flavours', big)).toBeNull();
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.uploadFailed, 'warn');
  });

  it('refuses a type that is not an image before decoding anything', async () => {
    const resizer = vi.fn();
    const { sync, hooks } = setup(resizer);
    expect(await sync.upload('flavours', { type: 'application/pdf', size: 10 })).toBeNull();
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.uploadType, 'warn');
    expect(resizer).not.toHaveBeenCalled();
  });
});

describe('fail-closed wiring', () => {
  it('with no injected resizer the real one runs; in jsdom (no canvas) it fails closed', async () => {
    const { sync, upload, hooks } = setup();
    expect(await sync.upload('flavours', big)).toBeNull();
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.photoUnreadable, 'warn');
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses a resizer result that is the original file', async () => {
    const { sync, upload, hooks } = setup(async () => ({ ok: true, file: big }));
    expect(await sync.upload('flavours', big)).toBeNull();
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.photoUnreadable, 'warn');
    expect(upload).not.toHaveBeenCalled();
  });

  it('refuses a resizer result that is not WebP or JPEG', async () => {
    const png = new Blob([new Uint8Array(100)], { type: 'image/png' });
    const { sync, upload, hooks } = setup(async () => ({ ok: true, file: png }));
    expect(await sync.upload('flavours', big)).toBeNull();
    expect(hooks.toast).toHaveBeenCalledWith(PAYMENT_TOASTS.photoUnreadable, 'warn');
    expect(upload).not.toHaveBeenCalled();
  });
});
