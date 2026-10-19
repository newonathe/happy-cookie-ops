import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FilterChips } from '@/components/ui/filter-chips';
import { Stepper } from '@/components/ui/stepper';
import { violations } from './ui-helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('FilterChips', () => {
  const options = [
    { id: 'upcoming', label: 'Upcoming', count: 3 },
    { id: 'past', label: 'Past', count: 0 }
  ];

  it('marks the selected chip, shows counts (a zero too) and changes on tap', () => {
    const onChange = vi.fn();
    render(<FilterChips label="Events" options={options} value="upcoming" onChange={onChange} />);
    expect(screen.getByRole('group', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upcoming/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const past = screen.getByRole('button', { name: /Past/ });
    expect(past).toHaveAttribute('aria-pressed', 'false');
    expect(past).toHaveTextContent('Past0');
    fireEvent.click(past);
    expect(onChange).toHaveBeenCalledWith('past');
  });

  it('does nothing when the selected chip is tapped again', () => {
    const onChange = vi.fn();
    render(<FilterChips label="Events" options={options} value="upcoming" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Upcoming/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches inside a view transition where the browser has one', () => {
    const start = vi.fn((cb: () => void) => cb());
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    function Host() {
      const [value, setValue] = useState('upcoming');
      return <FilterChips label="Events" options={options} value={value} onChange={setValue} />;
    }
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: /Past/ }));
    Reflect.deleteProperty(document, 'startViewTransition');
    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Past/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <FilterChips label="Events" options={options} value="past" onChange={() => undefined} />
    );
    expect(await violations(container)).toEqual([]);
  });
});

describe('Stepper', () => {
  function Host(props: {
    start?: number;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (n: number) => void;
  }) {
    const [value, setValue] = useState(props.start ?? 5);
    return (
      <Stepper
        label="Classic made"
        value={value}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(n) => {
          setValue(n);
          props.onChange?.(n);
        }}
      />
    );
  }
  const more = () => screen.getByRole('button', { name: 'More Classic made' });
  const fewer = () => screen.getByRole('button', { name: 'Fewer Classic made' });
  const number = () => screen.getByRole('button', { name: /Classic made: / });

  it('steps by the step, from the keyboard (a click with no pointer)', () => {
    const onChange = vi.fn();
    render(<Host start={100} step={50} onChange={onChange} />);
    fireEvent.click(more());
    fireEvent.click(fewer());
    fireEvent.click(fewer());
    expect(onChange.mock.calls).toEqual([[150], [100], [50]]);
  });

  it('a pointer press steps once, and the click it ends with does not step again', () => {
    const onChange = vi.fn();
    render(<Host onChange={onChange} />);
    fireEvent.pointerDown(more(), { button: 0 });
    fireEvent.pointerUp(more());
    fireEvent.click(more(), { detail: 1 });
    expect(onChange.mock.calls).toEqual([[6]]);
  });

  it('holding repeats, and letting go stops', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Host start={0} onChange={onChange} />);
    fireEvent.pointerDown(more(), { button: 0 });
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(449));
    expect(onChange).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(1 + 90 * 3));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4]);
    fireEvent.pointerUp(more());
    act(() => void vi.advanceTimersByTime(1000));
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('stops at min and max, with the button off', () => {
    const { rerender } = render(
      <Stepper label="Classic made" value={0} min={0} max={3} onChange={() => undefined} />
    );
    expect(fewer()).toBeDisabled();
    expect(more()).toBeEnabled();
    rerender(<Stepper label="Classic made" value={3} min={0} max={3} onChange={() => undefined} />);
    expect(more()).toBeDisabled();
  });

  it('a held button stops at the max without overshooting', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<Host start={8} max={10} onChange={onChange} />);
    fireEvent.pointerDown(more(), { button: 0 });
    act(() => void vi.advanceTimersByTime(3000));
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([9, 10]);
  });

  it('tap the number to type: Enter sets it', () => {
    const onChange = vi.fn();
    render(<Host start={5} onChange={onChange} />);
    fireEvent.click(number());
    const input = screen.getByRole('textbox', { name: 'Classic made' });
    expect(input).toHaveAttribute('inputmode', 'numeric');
    fireEvent.change(input, { target: { value: '42' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(42);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(number()).toHaveTextContent('42');
  });

  it('Enter and Escape hand focus back to the number, so the keyboard is not dropped on the page', () => {
    render(<Host start={5} />);
    fireEvent.click(number());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '8' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(number()).toHaveFocus();
    fireEvent.click(number());
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(number()).toHaveFocus();
  });

  it('Escape while typing does not reach a sheet around it', () => {
    const outer = vi.fn();
    render(
      // A stand-in for the sheet's key handler: this test only watches what reaches it.
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div onKeyDown={outer}>
        <Host start={5} />
      </div>
    );
    fireEvent.click(number());
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(outer).not.toHaveBeenCalled();
  });

  it('leaving the field sets the number, and Escape cancels', () => {
    const onChange = vi.fn();
    render(<Host start={5} onChange={onChange} />);
    fireEvent.click(number());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '9' } });
    fireEvent.blur(screen.getByRole('textbox'));
    expect(onChange).toHaveBeenCalledWith(9);
    fireEvent.click(number());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '77' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(number()).toHaveTextContent('9');
  });

  it('refuses a number out of range or not whole, with words, and keeps the field open', () => {
    const onChange = vi.fn();
    render(<Host start={5} max={20} onChange={onChange} />);
    for (const bad of ['21', '2.5', '', 'abc', '-1']) {
      fireEvent.click(screen.queryByRole('textbox') ? screen.getByRole('textbox') : number());
      fireEvent.change(screen.getByRole('textbox'), { target: { value: bad } });
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription('Enter a whole number from 0 to 20.');
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has no axe violations idle or typing', async () => {
    const { container } = render(<Host />);
    expect(await violations(container)).toEqual([]);
    fireEvent.click(number());
    expect(await violations(container)).toEqual([]);
  });
});
