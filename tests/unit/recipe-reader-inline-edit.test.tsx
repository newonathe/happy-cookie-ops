import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OpsVals } from '@/view-models/vals';
import { RecipeReader } from '@/components/live/recipes/recipe-reader';

afterEach(cleanup);

const line = {
  name: 'Flour',
  amountText: '250 g',
  qty: 250,
  unit: 'g',
  kind: 'ingredient' as const
};
const page = (over: Record<string, unknown> = {}) =>
  ({
    id: 'pie',
    name: 'Apple Pie',
    photo: '',
    state: 'read',
    yieldText: 'Makes 14 cookies',
    versionText: 'Version 2',
    savedYield: 14,
    rows: [line],
    back: vi.fn(),
    refresh: vi.fn(),
    discardEdit: vi.fn(),
    ...over
  }) as never;
const recipe = (over: Record<string, unknown> = {}) =>
  ({
    name: 'Apple Pie',
    yieldNum: 14,
    dirty: false,
    units: ['g'],
    rows: [
      {
        name: 'Flour',
        qty: 250,
        unit: 'g',
        kind: 'ingredient',
        setName: vi.fn(),
        setQty: vi.fn(),
        setUnit: vi.fn(),
        setKind: vi.fn(),
        remove: vi.fn()
      }
    ],
    yieldUp: vi.fn(),
    yieldDown: vi.fn(),
    addRow: vi.fn(),
    save: vi.fn(),
    ...over
  }) as unknown as OpsVals['recipe'];
const draw = (r: OpsVals['recipe'], p = page(), begin = vi.fn()) =>
  render(
    <RecipeReader page={p} onCosts={vi.fn()} inline={{ recipe: r, begin, dirtyHere: false }} />
  );

describe('editing a recipe on its own page', () => {
  it('opens the lines in place and edits through the engine handlers', () => {
    const r = recipe();
    const begin = vi.fn();
    draw(r, page(), begin);
    fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }));
    expect(begin).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Flour' }));
    const row = r.rows![0]!;
    expect(row.setQty).toHaveBeenCalledOnce();
    expect(r.addRow).toHaveBeenCalledOnce();
    expect(row.remove).toHaveBeenCalledOnce();
  });

  it('puts the batch back to the saved size, so a scaled amount cannot be the base', () => {
    draw(recipe());
    fireEvent.change(screen.getByLabelText('Cookies to make'), { target: { value: '28' } });
    fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }));
    expect(screen.queryByLabelText('Cookies to make')).toBeNull();
    expect(screen.getByText(/Amounts are for one saved batch/)).toBeTruthy();
  });

  it('saves only when something changed, through the existing save', () => {
    const r = recipe({ dirty: true });
    draw(r);
    fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save new version' }));
    expect(r.save).toHaveBeenCalledOnce();
  });

  it('does not save while nothing changed, or with a blank name', () => {
    const clean = recipe();
    draw(clean);
    fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save new version' }));
    expect(clean.save).not.toHaveBeenCalled();
    cleanup();
    const blank = recipe({
      dirty: true,
      rows: [{ ...recipe().rows![0], name: ' ' }]
    });
    draw(blank);
    fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save new version' }));
    expect(blank.save).not.toHaveBeenCalled();
    expect(screen.getByText('Give every line a name, or remove it.')).toBeTruthy();
  });

  it('cancel drops the changes and shows the read page again', () => {
    const p = page();
    draw(recipe({ dirty: true }), p);
    fireEvent.click(screen.getByRole('button', { name: 'Edit recipe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect((p as { discardEdit: () => void }).discardEdit).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Cookies to make')).toBeTruthy();
  });

  it('a helper (no inline editor) sees no Edit recipe button', () => {
    render(<RecipeReader page={page()} onCosts={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Edit recipe' })).toBeNull();
    expect(screen.getByLabelText('Cookies to make')).toBeTruthy();
  });
});
