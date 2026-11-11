import { describe, expect, it } from 'vitest';
import { ScopedRecipeEdits } from '@/lib/recipes/scoped-edits';

describe('ScopedRecipeEdits', () => {
  it('keeps dirty recipes and their original stamps for their identity only', () => {
    const edits = new ScopedRecipeEdits<{ text: string; stamp: string | null }>();
    const value = { text: 'edited A', stamp: 'original-A' };
    expect(edits.bind('A', new Map(), new Set())).toEqual(new Map());
    expect(edits.bind('B', new Map([['cookie', value]]), new Set(['cookie']))).toEqual(new Map());
    expect(edits.bind('A', new Map(), new Set())).toEqual(new Map([['cookie', value]]));
  });

  it('drops edits once the current identity reports them clean', () => {
    const edits = new ScopedRecipeEdits<string>();
    edits.bind('A', new Map(), new Set());
    edits.bind('B', new Map([['cookie', 'unsaved']]), new Set(['cookie']));
    edits.bind('A', new Map(), new Set());
    expect(edits.bind('B', new Map([['cookie', 'saved']]), new Set())).toEqual(new Map());
    expect(edits.bind('A', new Map(), new Set())).toEqual(new Map());
  });

  it('does not adopt edits typed without a verified identity', () => {
    const edits = new ScopedRecipeEdits<string>();
    edits.bind(null, new Map([['cookie', 'unverified']]), new Set(['cookie']));
    expect(edits.bind('A', new Map([['cookie', 'unverified']]), new Set(['cookie']))).toEqual(
      new Map()
    );
  });
});
