import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RecipeReader } from '@/components/live/recipes/recipe-reader';
import type { LiveRecipesVals } from '@/lib/recipes/live-recipes-types';

type Page = NonNullable<LiveRecipesVals['recipePage']>;
const page = (over: Partial<Page> = {}): Page => ({
  id: 'qa-one',
  name: 'QA Alpha',
  photo: '',
  state: 'failed',
  yieldText: null,
  versionText: null,
  savedYield: 0,
  rows: [],
  back: vi.fn(),
  refresh: vi.fn(),
  ...over
});

afterEach(cleanup);

describe('the recipe page after a failed read', () => {
  it('says it could not be read when nothing was ever read, and claims no saved copy', () => {
    render(<RecipeReader page={page()} onCosts={vi.fn()} />);
    expect(screen.getByText('The recipe could not be read.')).toBeTruthy();
    expect(screen.queryByText(/refreshed/)).toBeNull();
    expect(screen.queryByText('Showing the last saved copy.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry recipe' })).toBeTruthy();
  });

  it('says it could not be refreshed, with the last saved copy, when rows are shown', () => {
    const rows = [{ name: 'Flour', amountText: '500 g', qty: 500, unit: 'g' }];
    render(<RecipeReader page={page({ rows, savedYield: 12 })} onCosts={vi.fn()} />);
    expect(screen.getByText('The recipe could not be refreshed.')).toBeTruthy();
    expect(screen.getByText('Showing the last saved copy.')).toBeTruthy();
  });
});
