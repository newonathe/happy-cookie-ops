import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

let live = false;
vi.mock('@/lib/config/app-mode', () => ({ isLiveMode: () => live }));

import { OpsRuntime } from '@/store/ops-runtime';
import { NotificationsScreen } from '@/components/screens/notifications';
import { useOpsVals } from '@/store/use-ops';

/**
 * The notifications screen's alert switches call `toggleChannel`, which the protected
 * engine (and the prototype it was ported from) never defines, so every tap threw.
 * `OpsRuntime` now defines it: a tap flips that one channel, nothing else.
 */
function Screen() {
  return <NotificationsScreen v={useOpsVals()} />;
}

function mount() {
  const ref: { current: OpsRuntime | null } = { current: null };
  render(
    <OpsRuntime ref={(r) => void (ref.current = r)}>
      <Screen />
    </OpsRuntime>
  );
  return ref.current!;
}

describe('notification channel switches', () => {
  afterEach(() => {
    cleanup();
    live = false;
  });

  for (const mode of ['demo', 'live'] as const) {
    it(`a tap flips only that channel (${mode} mode)`, () => {
      live = mode === 'live';
      const runtime = mount();
      const before = { ...(runtime.state.channels as Record<string, boolean>) };
      const [first, ...rest] = Object.keys(before);

      const switches = screen.getAllByRole('button', { name: 'Toggle' });
      expect(switches).toHaveLength(Object.keys(before).length);
      act(() => {
        fireEvent.click(switches[0]!);
      });

      const after = runtime.state.channels as Record<string, boolean>;
      expect(after[first!]).toBe(!before[first!]);
      for (const key of rest) expect(after[key]).toBe(before[key]);

      act(() => {
        fireEvent.click(screen.getAllByRole('button', { name: 'Toggle' })[0]!);
      });
      expect((runtime.state.channels as Record<string, boolean>)[first!]).toBe(before[first!]);
    });
  }
});
