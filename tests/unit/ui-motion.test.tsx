import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCountUp,
  usePresence,
  usePrefersReducedMotion,
  useViewTransition
} from '@/components/ui/motion';
import { setReducedMotion } from './ui-helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'startViewTransition');
});

describe('usePrefersReducedMotion', () => {
  it('is false where matchMedia does not exist (jsdom) and follows the query where it does', () => {
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
    setReducedMotion(true);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true);
  });
});

describe('usePresence', () => {
  beforeEach(() => vi.useFakeTimers());

  it('keeps a leaving node mounted for the exit, then removes it', () => {
    const { result, rerender } = renderHook(({ present }) => usePresence(present, 150), {
      initialProps: { present: true }
    });
    expect(result.current).toEqual({ mounted: true, leaving: false });
    rerender({ present: false });
    expect(result.current).toEqual({ mounted: true, leaving: true });
    act(() => void vi.advanceTimersByTime(149));
    expect(result.current.mounted).toBe(true);
    act(() => void vi.advanceTimersByTime(2));
    expect(result.current).toEqual({ mounted: false, leaving: false });
  });

  it('comes back at once when it is shown again mid-exit', () => {
    const { result, rerender } = renderHook(({ present }) => usePresence(present, 150), {
      initialProps: { present: true }
    });
    rerender({ present: false });
    act(() => void vi.advanceTimersByTime(50));
    rerender({ present: true });
    expect(result.current).toEqual({ mounted: true, leaving: false });
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.mounted).toBe(true);
  });

  it('removes the node without an exit under reduced motion', () => {
    setReducedMotion(true);
    const { result, rerender } = renderHook(({ present }) => usePresence(present, 150), {
      initialProps: { present: true }
    });
    rerender({ present: false });
    expect(result.current).toEqual({ mounted: false, leaving: false });
  });

  it('starts unmounted and never shows when it was never present', () => {
    const { result } = renderHook(() => usePresence(false));
    expect(result.current).toEqual({ mounted: false, leaving: false });
  });
});

describe('useViewTransition', () => {
  it('runs the update plainly where the browser has no view transitions', () => {
    const update = vi.fn();
    renderHook(() => useViewTransition()).result.current(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('wraps the update in document.startViewTransition where it exists', () => {
    const start = vi.fn((cb: () => void) => cb());
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    const update = vi.fn();
    renderHook(() => useViewTransition()).result.current(update);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('skips startViewTransition entirely under reduced motion, and still runs the update', () => {
    setReducedMotion(true);
    const start = vi.fn();
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    const update = vi.fn();
    renderHook(() => useViewTransition()).result.current(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('useCountUp', () => {
  function Probe({ value, enabled }: { value: number; enabled?: boolean }) {
    return <span data-testid="n">{useCountUp(value, { enabled })}</span>;
  }

  it('gives the final value at once under reduced motion', () => {
    setReducedMotion(true);
    render(<Probe value={144} />);
    expect(screen.getByTestId('n')).toHaveTextContent('144');
  });

  it('gives the final value at once when switched off', () => {
    render(<Probe value={144} enabled={false} />);
    expect(screen.getByTestId('n')).toHaveTextContent('144');
  });

  it('counts up from 0 and ends on the value', () => {
    vi.useFakeTimers();
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    render(<Probe value={200} />);
    expect(screen.getByTestId('n')).toHaveTextContent('0');
    const step = (t: number) => {
      now = t;
      act(() => frames.shift()?.(t));
    };
    step(200);
    const mid = Number(screen.getByTestId('n').textContent);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(200);
    step(400);
    expect(screen.getByTestId('n')).toHaveTextContent('200');
  });
});
