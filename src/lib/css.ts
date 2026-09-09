import type { CSSProperties } from 'react';

/**
 * Turns a CSS declaration string into a React style object.
 *
 * The prototype computed a handful of styles as strings (frame geometry, the sheet
 * position, product thumbnails). Those values are still computed in the engine, so the
 * markup needs to accept a string. Everything else in the ported markup is a plain
 * style object written at build time — this only runs for genuinely dynamic values.
 */
const cache = new Map<string, CSSProperties>();

const camel = (prop: string): string =>
  prop.startsWith('-webkit-')
    ? 'Webkit' + kebabToPascal(prop.slice(8))
    : prop.startsWith('-moz-')
      ? 'Moz' + kebabToPascal(prop.slice(5))
      : prop.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase());

function kebabToPascal(prop: string): string {
  const c = prop.replace(/-(\w)/g, (_m, ch: string) => ch.toUpperCase());
  return c.charAt(0).toUpperCase() + c.slice(1);
}

export function s(input: string | number | null | undefined): CSSProperties {
  if (input == null) return {};
  const css = String(input);
  const hit = cache.get(css);
  if (hit) return hit;
  const style: Record<string, string> = {};
  for (const decl of css.split(';')) {
    if (!decl.trim()) continue;
    const i = decl.indexOf(':');
    if (i < 0) continue;
    style[camel(decl.slice(0, i).trim())] = decl.slice(i + 1).trim();
  }
  const out = style as CSSProperties;
  cache.set(css, out);
  return out;
}
