'use client';

import { useEffect, useRef, useState } from 'react';

type CounterProps = { value: number; prefix?: string; suffix?: string; decimals?: number };

/**
 * The animated figure behind `OpsRuntime.num()`, replacing the engine's Counter (same markup, same 420 ms ease-out).
 *
 * The engine's Counter remembers where the last tween began, not what is on screen, so a total that changed and came
 * back inside the tween (an item added then removed) left the figure stuck part way. This one tweens from what is
 * showing, and a figure that is already right is left alone.
 */
export function SettledCounter(props: CounterProps) {
  const [v, setV] = useState(props.value);
  const shown = useRef(props.value);
  useEffect(() => {
    const a = shown.current;
    const b = props.value;
    if (a === b) return;
    const settle = (n: number) => {
      shown.current = n;
      setV(n);
    };
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A hidden tab gets no animation frames: land on the number now rather than wait for one.
    if (reduce || document.hidden) {
      settle(b);
      return;
    }
    const t0 = performance.now();
    const dur = 420;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      if (p >= 1) {
        settle(b);
        return;
      }
      settle(a + (b - a) * (1 - Math.pow(1 - p, 3)));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [props.value]);
  const text = props.decimals ? v.toFixed(props.decimals) : Math.round(v).toLocaleString('en-PH');
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {(props.prefix || '') + text + (props.suffix || '')}
    </span>
  );
}
