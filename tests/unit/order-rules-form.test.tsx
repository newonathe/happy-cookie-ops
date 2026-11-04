// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { OpsVals } from '@/view-models/vals';
import { OrderRulesForm } from '@/components/live/order-rules-form';

type Rules = NonNullable<OpsVals['liveOrderRules']>;

describe('the order rules page', () => {
  afterEach(() => cleanup());
  const setup = () => {
    const props: Rules = {
      online: true,
      rules: {
        unpaidHoldHours: 24,
        maxUnpaidPerPhone: 2,
        pickupDays: [3, 6],
        leadMinDays: 2,
        leadMaxDays: 14,
        pickupFromHour: 10,
        pickupCutoffHour: 18,
        campusFrom: '14:00',
        campusTo: '15:30'
      },
      save: vi.fn(),
      close: vi.fn()
    };
    const view = render(<OrderRulesForm liveOrderRules={props} />);
    const input = (name: string) =>
      view.container.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    return { props, view, input };
  };

  it('does not ask for unpaid orders per mobile number, and saves its value unchanged', () => {
    const { props, view, input } = setup();
    expect(view.container.textContent).not.toContain('per mobile number');
    expect(view.container.querySelector('[name="maxUnpaidPerPhone"]')).toBeNull();
    fireEvent.click(input('day7'));
    fireEvent.change(input('unpaidHoldHours'), { target: { value: '12' } });
    fireEvent.submit(view.container.querySelector('form')!);
    expect(props.save).toHaveBeenCalledWith({
      unpaidHoldHours: 12,
      maxUnpaidPerPhone: 2,
      pickupDays: [3, 6, 7],
      leadMinDays: 2,
      leadMaxDays: 14,
      pickupFromHour: 10,
      pickupCutoffHour: 18,
      campusFrom: '14:00',
      campusTo: '15:30'
    });
    // Mutation: sending a default instead of the saved limit would relax an anti-abuse rule.
  });

  it('Cancel closes without saving', () => {
    const { props, view } = setup();
    fireEvent.click(
      Array.from(view.container.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!
    );
    expect(props.close).toHaveBeenCalledOnce();
    expect(props.save).not.toHaveBeenCalled();
  });
});
