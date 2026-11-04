import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProductionDough } from '@/components/live/production/production-dough';
import type { LiveDoughPreparation } from '@/lib/production/live-production-types';
afterEach(cleanup);
const data = (): LiveDoughPreparation => ({ id: 'mix', name: 'Chocolate cookie', photo: '', periodText: 'Drop 5',
  version: 3, balls: 6, reviewing: false, saving: false, uncertain: false, sourceChanged: false,
  portions: [{ label: 'Half recipe · 6 portions', selected: true, choose: vi.fn() }],
  rows: [{ name: 'Butter', amountText: '100 g', balanceText: 'Recorded balance unavailable', short: false }],
  review: vi.fn(), back: vi.fn(), confirm: vi.fn(), discard: vi.fn(), close: vi.fn() });
it('keeps an unavailable-source mix recoverable and does not expose placeholder ingredient amounts', () => {
  const d = { ...data(), sourceUnavailable: true, retryRecipe: vi.fn() };
  const ui = render(<ProductionDough data={d} />);
  expect(screen.getByText('Saved recipe unavailable')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Dough ingredients' })).toBeNull();
  expect(screen.queryByRole('group', { name: 'Recipe amount' })).toBeNull();
  expect(screen.getByText('draft portions · not recorded')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Review dough' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry saved recipe' }));
  expect(d.retryRecipe).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Discard mix' }));
  expect(d.discard).toHaveBeenCalledOnce();
  d.uncertain = true; d.reviewing = true;
  ui.rerender(<ProductionDough data={d} />);
  fireEvent.click(screen.getByRole('button', { name: 'Check saved result' }));
  expect(d.confirm).toHaveBeenCalledOnce();
});
it('separates amount, review and recording while keeping an unavailable balance honest', () => {
  const d = data(), ui = render(<ProductionDough data={d} />);
  expect(screen.getByText('Recorded balance unavailable')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Review dough' }));
  expect(d.review).toHaveBeenCalledTimes(1); expect(d.confirm).not.toHaveBeenCalled();
  d.reviewing = true; ui.rerender(<ProductionDough data={d} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm dough' }));
  expect(d.confirm).toHaveBeenCalledTimes(1);
  d.saving = true; ui.rerender(<ProductionDough data={d} />);
  expect((screen.getByRole('button', { name: 'Discard mix' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Leave for now' }));
  expect(d.close).toHaveBeenCalledTimes(1);
});
it('keeps unknown submissions immutable and checks their saved result instead of treating them as unsaved', () => {
  const d = data(); d.uncertain = true; d.reviewing = true;
  render(<ProductionDough data={d} />);
  expect(screen.queryByRole('region', { name: 'Dough ingredients' })).toBeNull();
  expect(screen.getByText('portions in this submission')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Discard mix' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Check saved result' }));
  expect(d.confirm).toHaveBeenCalledTimes(1);
});
it('compares an updated recipe before adoption, and keeps an incompatible amount out of review', () => {
  const d = data(); d.sourceChanged = true;
  d.recipeUpdate = { previousVersion: 3, version: 4, previousYield: 12, yield: 24,
    rows: [{ name: 'Butter', previous: '200 g', current: '300 g' }], use: vi.fn() };
  const ui = render(<ProductionDough data={d} />);
  expect(screen.getByRole('region', { name: 'Updated recipe' })).toBeTruthy();
  expect(screen.getByText('Previous: 200 g')).toBeTruthy();
  expect(screen.getByText('Updated: 300 g')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Use updated recipe' }));
  expect(d.recipeUpdate.use).toHaveBeenCalledTimes(1); expect(d.confirm).not.toHaveBeenCalled();
  d.sourceChanged = false; d.recipeUpdate = null; d.validAmount = false;
  ui.rerender(<ProductionDough data={d} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Choose a recipe amount');
  expect((screen.getByRole('button', { name: 'Review dough' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('6')).toBeTruthy();
});

it('reviews the first available saved source without inventing a previous version or yield', () => {
  const d = data(); d.sourceChanged = true;
  d.recipeUpdate = { previousVersion: null, version: 3, previousYield: null, yield: 12,
    rows: [{ name: 'Butter', previous: 'Not available', current: '200 g' }], use: vi.fn() };
  render(<ProductionDough data={d} />);
  expect(screen.getByText('Saved recipe · Version 3')).toBeTruthy();
  expect(screen.getByText('Makes 12 cookies per full recipe')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Use saved recipe' }));
  expect(d.recipeUpdate.use).toHaveBeenCalledOnce();
});
