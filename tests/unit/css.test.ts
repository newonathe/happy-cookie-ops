import { describe, expect, it } from 'vitest';
import { s } from '@/lib/css';

describe('s()', () => {
  it('camel-cases plain properties', () => {
    expect(s('max-width: 460px; padding-top: 8px')).toEqual({ maxWidth: '460px', paddingTop: '8px' });
  });

  it('keeps vendor prefixes in React form', () => {
    expect(s('-webkit-overflow-scrolling: touch')).toEqual({ WebkitOverflowScrolling: 'touch' });
  });

  it('survives empty and malformed input', () => {
    expect(s('')).toEqual({});
    expect(s(null)).toEqual({});
    expect(s('nonsense')).toEqual({});
  });

  it('does not split colours inside a value', () => {
    expect(s('background: rgba(255,255,255,0.9)')).toEqual({ background: 'rgba(255,255,255,0.9)' });
  });
});
