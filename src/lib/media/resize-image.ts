/**
 * Flavour photos are resized and re-encoded in the browser before they are uploaded.
 *
 * Why always re-encode: every flavour photo is publicly readable, and a phone original carries
 * EXIF and GPS data. Drawing the picture onto a canvas and encoding it again drops all metadata,
 * so even a small file goes through here.
 *
 * The numbers match scripts/prepare-flavour-photos.py (the offline preparer) and stay under the
 * app's 2 MiB upload limit (`MAX_IMAGE_BYTES` in `@/lib/data/payments`).
 */

export const FLAVOUR_PHOTO_MAX_SIDE = 1600;
export const FLAVOUR_PHOTO_MAX_BYTES = 1_900_000;

/** A source file over this is refused before any decode. */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
/** A decoded picture over this many pixels is refused (a decompression bomb would exhaust memory). */
export const MAX_DECODE_PIXELS = 50_000_000;

const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45] as const;
const MAX_SHRINKS = 3;
const SHRINK_FACTOR = 0.8;

export interface Size {
  width: number;
  height: number;
}

/** A decoded picture. `source` is whatever the encoder needs to draw it (an ImageBitmap by default). */
export interface DecodedImage extends Size {
  source: unknown;
  close?: () => void;
}

export interface ResizeDeps {
  /** Decodes the file honouring its EXIF orientation. Throws when it is not a readable image. */
  decode: (file: Blob) => Promise<DecodedImage>;
  /** Draws the picture at width x height and encodes it. Null when the browser could not encode. */
  encode: (
    image: DecodedImage,
    width: number,
    height: number,
    type: string,
    quality: number
  ) => Promise<Blob | null>;
}

export type ResizeResult =
  { ok: true; file: Blob } | { ok: false; reason: 'unreadable' | 'too_big' };

/** Scales so the longest side is at most `maxSide`, keeping the ratio. Whole pixels, at least 1, never upscales. */
export function fitWithin(width: number, height: number, maxSide: number): Size {
  const longest = Math.max(width, height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

const WEBP = 'image/webp';
const JPEG = 'image/jpeg';

function canvasFor(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export const defaultResizeDeps: ResizeDeps = {
  decode: async (file) => {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await createImageBitmap(file);
    }
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      close: () => bitmap.close()
    };
  },
  encode: async (image, width, height, type, quality) => {
    const canvas = canvasFor(width, height);
    const context = canvas.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) return null;
    if (type === JPEG) {
      // JPEG has no transparency: a transparent PNG would turn black.
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    if ('imageSmoothingQuality' in context) context.imageSmoothingQuality = 'high';
    context.drawImage(image.source as CanvasImageSource, 0, 0, width, height);
    if (canvas instanceof HTMLCanvasElement) {
      return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    }
    return canvas.convertToBlob({ type, quality });
  }
};

/**
 * Resizes and re-encodes a picked photo. WebP first, quality 0.85 stepping down to 0.45 until it
 * is at most `FLAVOUR_PHOTO_MAX_BYTES`; still too big, the dimensions shrink by 20% (at most 3
 * times) and the steps repeat. A browser that cannot encode WebP hands back another type; the
 * same steps then run in JPEG.
 */
export async function resizeFlavourPhoto(
  file: Blob,
  deps: ResizeDeps = defaultResizeDeps
): Promise<ResizeResult> {
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, reason: 'too_big' };
  let image: DecodedImage;
  try {
    image = await deps.decode(file);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  try {
    if (!(image.width > 0) || !(image.height > 0)) return { ok: false, reason: 'unreadable' };
    if (image.width * image.height > MAX_DECODE_PIXELS) return { ok: false, reason: 'too_big' };
    let size = fitWithin(image.width, image.height, FLAVOUR_PHOTO_MAX_SIDE);
    let type = WEBP;
    for (let shrink = 0; shrink <= MAX_SHRINKS; shrink += 1) {
      for (const quality of QUALITIES) {
        let blob = await deps.encode(image, size.width, size.height, type, quality);
        if (blob && type === WEBP && blob.type !== WEBP) {
          type = JPEG;
          blob = await deps.encode(image, size.width, size.height, type, quality);
        }
        if (!blob || blob.size < 1 || blob.type !== type)
          return { ok: false, reason: 'unreadable' };
        if (blob.size <= FLAVOUR_PHOTO_MAX_BYTES) return { ok: true, file: blob };
      }
      size = {
        width: Math.max(1, Math.round(size.width * SHRINK_FACTOR)),
        height: Math.max(1, Math.round(size.height * SHRINK_FACTOR))
      };
    }
    return { ok: false, reason: 'too_big' };
  } catch {
    return { ok: false, reason: 'unreadable' };
  } finally {
    image.close?.();
  }
}
