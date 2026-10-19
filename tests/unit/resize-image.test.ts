import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FLAVOUR_PHOTO_MAX_BYTES,
  FLAVOUR_PHOTO_MAX_SIDE,
  MAX_DECODE_PIXELS,
  MAX_SOURCE_BYTES,
  defaultResizeDeps,
  fitWithin,
  resizeFlavourPhoto,
  type DecodedImage,
  type ResizeDeps
} from '@/lib/media/resize-image';

/**
 * Flavour photos are re-encoded in the browser before upload: always (a re-encode drops EXIF and GPS,
 * and every flavour photo is publicly readable), at most 1600 px on the long side, and small enough
 * for the 2 MiB bucket limit. jsdom has no canvas, so decode and encode are injected here; the real
 * canvas path is on the laptop checklist.
 */

const original = new File([new Uint8Array(10)], 'IMG_0001.JPG', { type: 'image/jpeg' });

function fakeDeps(opts: {
  width?: number;
  height?: number;
  /** Bytes produced for (type, quality, width); default 1000. */
  size?: (type: string, quality: number, width: number, height: number) => number;
  /** Types this fake "browser" cannot encode: it hands back image/png instead, as browsers do. */
  unsupported?: string[];
  decodeFails?: boolean;
  encodeNull?: boolean;
}) {
  const close = vi.fn();
  const image: DecodedImage = {
    width: opts.width ?? 4284,
    height: opts.height ?? 5712,
    source: {},
    close
  };
  const decode = vi.fn(async () => {
    if (opts.decodeFails) throw new Error('not an image');
    return image;
  });
  const encode = vi.fn(
    async (_img: DecodedImage, width: number, height: number, type: string, quality: number) => {
      if (opts.encodeNull) return null;
      const actual = opts.unsupported?.includes(type) ? 'image/png' : type;
      const bytes = opts.size ? opts.size(actual, quality, width, height) : 1000;
      return new Blob([new Uint8Array(bytes)], { type: actual });
    }
  );
  const deps: ResizeDeps = { decode, encode };
  return { deps, decode, encode, close };
}

describe('fitWithin', () => {
  it('scales a portrait photo so the height is the limit and keeps the ratio', () => {
    expect(fitWithin(4284, 5712, 1600)).toEqual({ width: 1200, height: 1600 });
  });

  it('scales a landscape photo so the width is the limit', () => {
    expect(fitWithin(5712, 4284, 1600)).toEqual({ width: 1600, height: 1200 });
  });

  it('leaves a picture that already fits unchanged and never upscales', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });

  it('rounds to whole pixels and never goes below 1', () => {
    expect(fitWithin(1601, 1000, 1600)).toEqual({ width: 1600, height: 999 });
    expect(fitWithin(10000, 1, 1600)).toEqual({ width: 1600, height: 1 });
  });

  it('exports the limits the offline preparer script shares', () => {
    expect(FLAVOUR_PHOTO_MAX_SIDE).toBe(1600);
    expect(FLAVOUR_PHOTO_MAX_BYTES).toBe(1_900_000);
  });
});

describe('resizeFlavourPhoto', () => {
  it('encodes WebP at the fitted size and the first quality that fits wins', async () => {
    const { deps, encode, close } = fakeDeps({
      size: (_t, q) => (q >= 0.85 ? 3_000_000 : q >= 0.75 ? 2_000_000 : 1_500_000)
    });
    const result = await resizeFlavourPhoto(original, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.type).toBe('image/webp');
    expect(result.file.size).toBe(1_500_000);
    const calls = encode.mock.calls.map((c) => [c[1], c[2], c[3], c[4]]);
    expect(calls).toEqual([
      [1200, 1600, 'image/webp', 0.85],
      [1200, 1600, 'image/webp', 0.75],
      [1200, 1600, 'image/webp', 0.65]
    ]);
    expect(close).toHaveBeenCalled();
  });

  it('always re-encodes, even a small file that already fits (this is what drops EXIF and GPS)', async () => {
    const { deps, encode } = fakeDeps({ width: 600, height: 400 });
    const result = await resizeFlavourPhoto(original, deps);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode.mock.calls[0]!.slice(1, 5)).toEqual([600, 400, 'image/webp', 0.85]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file).not.toBe(original);
  });

  it('shrinks the dimensions by 20% when no quality fits, then succeeds', async () => {
    const { deps, encode } = fakeDeps({
      size: (_t, _q, w) => (w > 1000 ? 2_500_000 : 900_000)
    });
    const result = await resizeFlavourPhoto(original, deps);
    expect(result.ok).toBe(true);
    // 5 qualities at 1200x1600, then the first quality at 960x1280.
    expect(encode).toHaveBeenCalledTimes(6);
    expect(encode.mock.calls[4]!.slice(1, 5)).toEqual([1200, 1600, 'image/webp', 0.45]);
    expect(encode.mock.calls[5]!.slice(1, 5)).toEqual([960, 1280, 'image/webp', 0.85]);
  });

  it('gives up with too_big after three shrinks', async () => {
    const { deps, encode } = fakeDeps({ size: () => 5_000_000 });
    const result = await resizeFlavourPhoto(original, deps);
    expect(result).toEqual({ ok: false, reason: 'too_big' });
    // The fitted size plus three 20% shrinks, five qualities each.
    expect(encode).toHaveBeenCalledTimes(20);
    const widths = [...new Set(encode.mock.calls.map((c) => c[1]))];
    expect(widths).toEqual([1200, 960, 768, 614]);
  });

  it('falls back to JPEG when the browser cannot encode WebP', async () => {
    const { deps, encode } = fakeDeps({ unsupported: ['image/webp'] });
    const result = await resizeFlavourPhoto(original, deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.type).toBe('image/jpeg');
    expect(encode.mock.calls.map((c) => c[3])).toEqual(['image/webp', 'image/jpeg']);
    expect(encode.mock.calls[1]![4]).toBe(0.85);
  });

  it('keeps stepping down in JPEG with the same steps once WebP is known to be unsupported', async () => {
    const { deps, encode } = fakeDeps({
      unsupported: ['image/webp'],
      size: (_t, q) => (q > 0.65 ? 2_400_000 : 1_000_000)
    });
    const result = await resizeFlavourPhoto(original, deps);
    expect(result.ok).toBe(true);
    expect(encode.mock.calls.map((c) => [c[3], c[4]])).toEqual([
      ['image/webp', 0.85],
      ['image/jpeg', 0.85],
      ['image/jpeg', 0.75],
      ['image/jpeg', 0.65]
    ]);
  });

  it('reports unreadable when the picture cannot be decoded', async () => {
    const { deps, encode } = fakeDeps({ decodeFails: true });
    expect(await resizeFlavourPhoto(original, deps)).toEqual({ ok: false, reason: 'unreadable' });
    expect(encode).not.toHaveBeenCalled();
  });

  it('reports unreadable for a zero-sized picture and when the encoder yields nothing', async () => {
    expect(await resizeFlavourPhoto(original, fakeDeps({ width: 0, height: 0 }).deps)).toEqual({
      ok: false,
      reason: 'unreadable'
    });
    expect(await resizeFlavourPhoto(original, fakeDeps({ encodeNull: true }).deps)).toEqual({
      ok: false,
      reason: 'unreadable'
    });
  });
});

describe('guards before and after decoding', () => {
  it('exports the limits', () => {
    expect(MAX_SOURCE_BYTES).toBe(40 * 1024 * 1024);
    expect(MAX_DECODE_PIXELS).toBe(50_000_000);
  });

  it('a file over 40 MiB never reaches decode', async () => {
    const { deps, decode, encode } = fakeDeps({});
    const huge = { size: MAX_SOURCE_BYTES + 1, type: 'image/png' } as Blob;
    expect(await resizeFlavourPhoto(huge, deps)).toEqual({ ok: false, reason: 'too_big' });
    expect(decode).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
  });

  it('a decode result over 50 megapixels is refused, closed, and never encoded', async () => {
    const { deps, encode, close } = fakeDeps({ width: 10_000, height: 5_001 });
    expect(await resizeFlavourPhoto(original, deps)).toEqual({ ok: false, reason: 'too_big' });
    expect(encode).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('exactly 50 megapixels is allowed', async () => {
    const { deps, encode } = fakeDeps({ width: 10_000, height: 5_000 });
    expect((await resizeFlavourPhoto(original, deps)).ok).toBe(true);
    expect(encode).toHaveBeenCalled();
  });
});

describe('default encoder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks for high-quality smoothing before drawing', async () => {
    const order: string[] = [];
    const context: Record<string, unknown> = {
      fillRect: vi.fn(),
      drawImage: vi.fn(() => order.push('draw'))
    };
    Object.defineProperty(context, 'imageSmoothingQuality', {
      set: (v: string) => order.push('quality:' + v),
      get: () => 'low'
    });
    class FakeCanvas {
      getContext() {
        return context;
      }
      async convertToBlob(o: { type: string }) {
        return new Blob([new Uint8Array(5)], { type: o.type });
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const blob = await defaultResizeDeps.encode(
      { width: 10, height: 10, source: {} },
      10,
      10,
      'image/webp',
      0.85
    );
    expect(blob?.type).toBe('image/webp');
    expect(order).toEqual(['quality:high', 'draw']);
  });

  it('copes with a context that lacks the property', async () => {
    const context = { fillRect: vi.fn(), drawImage: vi.fn() };
    class FakeCanvas {
      getContext() {
        return context;
      }
      async convertToBlob(o: { type: string }) {
        return new Blob([new Uint8Array(5)], { type: o.type });
      }
    }
    vi.stubGlobal('OffscreenCanvas', FakeCanvas);
    const blob = await defaultResizeDeps.encode(
      { width: 10, height: 10, source: {} },
      10,
      10,
      'image/webp',
      0.85
    );
    expect(blob).not.toBeNull();
    expect(context.drawImage).toHaveBeenCalled();
  });
});
