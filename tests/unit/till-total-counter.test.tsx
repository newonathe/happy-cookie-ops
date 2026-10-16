import { act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpsRuntime } from '@/store/ops-runtime';

/**
 * The till's "in this sale" figure is `this.num(cartTotal, '₱')`, an animated Counter. Whatever the animation does on the
 * way, the figure on screen must land on the number it was last given.
 * Mutation: a Counter that skips its settle when the value returns to where the last tween began leaves the total stuck.
 */
const engine = new OpsRuntime({});
let frames = new Map<number, FrameRequestCallback>();
let nextId = 1;
let clock = 0;

function runFrames(ms: number) {
  const end = clock + ms;
  act(() => {
    while (clock < end) {
      clock += 16;
      const batch = [...frames.values()];
      frames.clear();
      batch.forEach((cb) => cb(clock));
    }
  });
}

beforeEach(() => {
  frames = new Map();
  clock = 1000;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(nextId, cb);
    return nextId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    frames.delete(id);
  });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const shown = (c: HTMLElement) => c.textContent;

describe('till total Counter settles on the last value', () => {
  it('an item added then removed inside the tween lands on the original total', () => {
    const { container, rerender } = render(<>{engine.num(100, '₱')}</>);
    expect(shown(container)).toBe('₱100');

    rerender(<>{engine.num(300, '₱')}</>); // item added
    runFrames(160); // part way
    rerender(<>{engine.num(100, '₱')}</>); // item removed before it finished
    runFrames(2000);

    expect(shown(container)).toBe('₱100');
  });

  it('a normal change still animates to the new total', () => {
    const { container, rerender } = render(<>{engine.num(100, '₱')}</>);
    rerender(<>{engine.num(300, '₱')}</>);
    runFrames(2000);
    expect(shown(container)).toBe('₱300');
  });

  it('reduced motion lands at once, also after a mid-tween reversal', () => {
    const { container, rerender } = render(<>{engine.num(100, '₱')}</>);
    rerender(<>{engine.num(300, '₱')}</>);
    runFrames(160);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    rerender(<>{engine.num(100, '₱')}</>);
    runFrames(2000);
    expect(shown(container)).toBe('₱100');
  });
});
