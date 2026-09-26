// @vitest-environment node
import { readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeReturnPath, returnPathFromSearch } from '@/lib/auth/return-path';

describe('safe sign-in destination', () => {
  it('accepts the actual application page paths without accepting the sign-in loop', () => {
    const root = fileURLToPath(new URL('../../src/app/',import.meta.url));
    const pages = ['/',...readdirSync(root,{withFileTypes:true}).filter(entry => entry.isDirectory() && entry.name!=='sign-in' && existsSync(join(root,entry.name,'page.tsx'))).map(entry=>'/'+entry.name)];
    expect(pages).toHaveLength(25);
    for (const page of pages) expect(safeReturnPath(page)).toBe(page);
    expect(safeReturnPath('/sign-in')).toBe('/');
  });
  it.each([null,undefined,123,true,{},['/orders'],'','javascript:alert(1)','JaVaScRiPt:alert(1)','data:text/html,secret','https://evil.test/orders','https://ops.example.test/orders','//evil.test','/\\evil.test','\\\\evil.test','/orders/','/orders?next=https://evil.test','/orders#fragment','/orders/../settings',' /orders','/orders\n','/orders\u0000','/%2forders','%2Forders','/%252fevil.test','/today','/api/health','/sign-in','/unknown','/'.repeat(129)])('rejects unsupported destination %#', value => {
    expect(safeReturnPath(value)).toBe('/');
  });
  it('accepts one decoded path but never decodes it a second time', () => {
    expect(returnPathFromSearch(new URLSearchParams('next=%2Forders'))).toBe('/orders');
    expect(returnPathFromSearch(new URLSearchParams('next=%252Forders'))).toBe('/');
    expect(returnPathFromSearch(new URLSearchParams('next=javascript%3Aalert%281%29'))).toBe('/');
  });
  it('rejects duplicate next values even if one or both are valid', () => {
    for (const query of ['next=/orders&next=/settings','next=/orders&next=/orders','next=javascript:bad&next=/orders','next=/orders&next=javascript:bad','other=/orders']) {
      expect(returnPathFromSearch(new URLSearchParams(query))).toBe('/');
    }
  });
});
