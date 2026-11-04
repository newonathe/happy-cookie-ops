import { describe, expect, it } from 'vitest';
import { cookieArt, cookiePicture } from '@/lib/media/cookie-art';

const svgOf = (url: string) => decodeURIComponent(url.replace('data:image/svg+xml,', ''));

describe('cookie art', () => {
  it('draws the same picture for the same name, however it is typed', () => {
    expect(cookieArt('Ube Crinkle')).toBe(cookieArt('  ube crinkle '));
  });

  it('draws different cookies differently', () => {
    expect(cookieArt('Oatmeal Raisin')).not.toBe(cookieArt('Lemon Crinkle'));
  });

  it('takes its colour from the name', () => {
    expect(svgOf(cookieArt('Ube Crinkle'))).toContain('hsl(275,');
    expect(svgOf(cookieArt('Red Velvet'))).toContain('hsl(352,');
    expect(svgOf(cookieArt('Double Chocolate'))).toContain('hsl(18,42%');
    // Golden dough, dark chips: not a chocolate cookie.
    expect(svgOf(cookieArt('Chocolate Chip'))).toContain('hsl(33,58%');
  });

  it('keeps the name out of the picture, and nothing can leave an unquoted url()', () => {
    const name = `x);background:url(//evil.example/a.png'" <script>`;
    const url = cookieArt(name);
    expect(url).not.toMatch(/[\s()'"<>;]/);
    expect(svgOf(url)).not.toContain('evil.example');
    expect(svgOf(url)).not.toContain('<script');
  });

  it('gives a nameless cookie a picture too', () => {
    expect(svgOf(cookieArt(''))).toContain('<svg');
  });

  it('a real photo always wins', () => {
    expect(cookiePicture('assets/happy-camper.png', 'Happy Camper')).toBe(
      'assets/happy-camper.png'
    );
    expect(cookiePicture('', 'Happy Camper')).toBe(cookieArt('Happy Camper'));
  });
});
