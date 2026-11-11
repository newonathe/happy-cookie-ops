import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OpsVals } from '@/view-models/vals';
import { RecipeEditor } from '@/components/live/recipes/recipe-editor';

afterEach(cleanup);

const row = (over: Record<string, unknown> = {}) => ({
  name: 'Flour',
  qty: 250,
  unit: 'g',
  warn: '',
  kind: 'ingredient',
  setName: vi.fn(),
  setQty: vi.fn(),
  setUnit: vi.fn(),
  setKind: vi.fn(),
  remove: vi.fn(),
  ...over
});
const recipe = (over: Record<string, unknown> = {}) => ({
  name: 'Cookie A',
  version: 'Version 3',
  costText: '₱10 per cookie',
  yieldText: '12 cookies',
  yieldNum: 12,
  dirty: true,
  rows: [row(), row({ name: 'Pouch', qty: 12, unit: 'pcs', kind: 'packaging' })],
  units: ['g', 'ml', 'pcs'],
  history: [{ label: 'Version 2', detail: '2 ingredients', batches: 'never baked on' }],
  currentBatches: 'Nothing baked on this version yet',
  yieldUp: vi.fn(),
  yieldDown: vi.fn(),
  addRow: vi.fn(),
  save: vi.fn(),
  ...over
});
const vals = (r: ReturnType<typeof recipe>) => ({ recipe: r }) as unknown as OpsVals;
const draw = (r: ReturnType<typeof recipe>, onBack = vi.fn()) =>
  render(<RecipeEditor v={vals(r)} backLabel="Back to costs" onBack={onBack} />);

describe('editing a recipe', () => {
  it('uses the engine handlers for every line and the yield', () => {
    const r = recipe();
    draw(r);
    const first = r.rows[0]!;
    fireEvent.change(screen.getAllByLabelText('Ingredient')[0]!, { target: { value: 'Rye' } });
    fireEvent.change(screen.getAllByLabelText('Quantity')[0]!, { target: { value: '9' } });
    fireEvent.change(screen.getAllByLabelText('Unit')[0]!, { target: { value: 'ml' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Flour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Raise yield' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(first.setName).toHaveBeenCalledOnce();
    expect(first.setQty).toHaveBeenCalledOnce();
    expect(first.setUnit).toHaveBeenCalledOnce();
    expect(first.remove).toHaveBeenCalledOnce();
    expect(r.yieldUp).toHaveBeenCalledOnce();
    expect(r.addRow).toHaveBeenCalledOnce();
  });

  it('shows each line as what it is, and can change it', () => {
    const r = recipe();
    draw(r);
    const types = screen.getAllByLabelText('Type') as HTMLSelectElement[];
    expect(types.map((select) => select.value)).toEqual(['ingredient', 'packaging']);
    fireEvent.change(types[0]!, { target: { value: 'packaging' } });
    expect(r.rows[0]!.setKind).toHaveBeenCalledWith('packaging');
  });

  it('asks for the type of a line whose record never said, before Review', () => {
    draw(recipe({ rows: [row({ kind: null })] }));
    expect((screen.getByLabelText('Type') as HTMLSelectElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Review recipe' }));
    expect(screen.getByText(/Choose ingredient or packaging/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review recipe changes' })).toBeNull();
  });

  it('will not review a line with no name, or an unchanged recipe', () => {
    draw(recipe({ rows: [row({ name: ' ' })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Review recipe' }));
    expect(screen.getByText(/Give every line a name/)).toBeTruthy();
    cleanup();
    draw(recipe({ dirty: false }));
    expect(screen.getByRole('button', { name: 'Review recipe' }).hasAttribute('disabled')).toBe(
      true
    );
  });

  it('saves only from Review, and leaves it only when the edit is saved', () => {
    const r = recipe();
    const ui = draw(r);
    fireEvent.click(screen.getByRole('button', { name: 'Review recipe' }));
    expect(r.save).not.toHaveBeenCalled();
    expect(screen.getByText('Packaging')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save new version' }));
    expect(r.save).toHaveBeenCalledOnce();
    // Refused: still dirty, still on Review.
    ui.rerender(<RecipeEditor v={vals(r)} backLabel="Back to costs" onBack={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Review recipe changes' })).toBeTruthy();
    // Saved: the runtime clears dirty.
    ui.rerender(
      <RecipeEditor v={vals({ ...r, dirty: false })} backLabel="Back to costs" onBack={vi.fn()} />
    );
    expect(screen.getByRole('heading', { name: 'Edit Cookie A' })).toBeTruthy();
  });

  it('keeps the version history and the way back', () => {
    const onBack = vi.fn();
    draw(recipe(), onBack);
    expect(screen.getByText('Version 2')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to costs' })[0]!);
    expect(onBack).toHaveBeenCalledOnce();
  });
});
