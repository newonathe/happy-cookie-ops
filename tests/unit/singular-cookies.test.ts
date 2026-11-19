import { expect, it } from 'vitest';
import { singularCookies } from '@/lib/display/singular-cookies';

it('fixes a lone 1 and leaves every other number alone', () => {
  expect(singularCookies('1 cookies')).toBe('1 cookie');
  expect(singularCookies('Baked: 1 cookies sold')).toBe('Baked: 1 cookie sold');
  for (const t of ['0 cookies', '2 cookies', '11 cookies', '21 cookies', '1.5 cookies', '1 cookie'])
    expect(singularCookies(t)).toBe(t);
});
