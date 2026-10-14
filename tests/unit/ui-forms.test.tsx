import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorSummary } from '@/components/ui/error-summary';
import { Field, SelectField } from '@/components/ui/field';
import { violations } from './ui-helpers';

afterEach(cleanup);

describe('Field', () => {
  it('joins label, hint and input', () => {
    render(<Field label="Name" hint="As it should appear on the list." />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAccessibleDescription('As it should appear on the list.');
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('an error turns it red, marks it invalid and describes it with the words', () => {
    render(
      <Field
        label="Stall rent"
        hint="In pesos."
        error="Enter the stall rent in pesos, like 2,500.00"
      />
    );
    const input = screen.getByLabelText('Stall rent');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(
      'In pesos. Enter the stall rent in pesos, like 2,500.00'
    );
    expect(input.parentElement?.className).toMatch(
      /border-danger.*border-l-4|border-l-4.*border-danger/
    );
  });

  it('takes the id it is given, so a summary can link to it', () => {
    render(<Field label="Name" id="event-name" />);
    expect(screen.getByLabelText('Name')).toHaveAttribute('id', 'event-name');
  });

  it('opens the right keypad for each mode', () => {
    render(
      <>
        <Field label="Rent" mode="decimal" prefix="₱" />
        <Field label="Count" mode="numeric" />
        <Field label="Start" mode="date" />
        <Field label="Place" />
      </>
    );
    expect(screen.getByLabelText('Rent')).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByLabelText('Count')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByLabelText('Start')).toHaveAttribute('type', 'date');
    expect(screen.getByLabelText('Place')).not.toHaveAttribute('inputmode');
    expect(screen.getByText('₱')).toBeInTheDocument();
  });

  it('passes typing and blur through, and can be disabled', () => {
    const onBlur = vi.fn();
    const onChange = vi.fn();
    render(<Field label="Name" onBlur={onBlur} onChange={onChange} />);
    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Ateneo' } });
    fireEvent.blur(input);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onBlur).toHaveBeenCalledTimes(1);
    cleanup();
    render(<Field label="Name" disabled />);
    expect(screen.getByLabelText('Name')).toBeDisabled();
  });

  it('has no axe violations idle or in error', async () => {
    const { container, rerender } = render(<Field label="Name" hint="Hint" />);
    expect(await violations(container)).toEqual([]);
    rerender(<Field label="Name" hint="Hint" error="Enter a name" />);
    expect(await violations(container)).toEqual([]);
  });
});

describe('SelectField', () => {
  const options = [
    { value: 'cash', label: 'Cash' },
    { value: 'gcash', label: 'GCash' }
  ];

  it('is a labelled select with its options, and an error the same way', () => {
    render(<SelectField label="Paid by" options={options} error="Pick how it was paid" />);
    const select = screen.getByLabelText('Paid by');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Cash', 'GCash']);
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveAccessibleDescription('Pick how it was paid');
  });

  it('has no axe violations', async () => {
    const { container } = render(<SelectField label="Paid by" options={options} />);
    expect(await violations(container)).toEqual([]);
  });
});

describe('ErrorSummary', () => {
  const errors = [
    { field: 'event-name', message: 'Enter a name for the event' },
    { field: 'event-rent', message: 'Enter the stall rent in pesos, like 2,500.00' }
  ];

  it('shows nothing without errors', () => {
    const { container } = render(<ErrorSummary errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says there is a problem, takes focus, and has one link per field', () => {
    render(<ErrorSummary errors={errors} />);
    const box = screen.getByRole('alert');
    expect(box).toHaveFocus();
    expect(box).toHaveAccessibleName('There is a problem');
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '#event-name',
      '#event-rent'
    ]);
  });

  it('a link focuses its field without changing the address', () => {
    window.location.hash = '';
    render(
      <>
        <ErrorSummary errors={errors} />
        <Field label="Name" id="event-name" />
        <Field label="Rent" id="event-rent" />
      </>
    );
    const scroll = vi.fn();
    (screen.getByLabelText('Rent') as HTMLElement).scrollIntoView = scroll;
    fireEvent.click(screen.getByRole('link', { name: /stall rent/ }));
    expect(screen.getByLabelText('Rent')).toHaveFocus();
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('');
  });

  it('takes focus back when the same errors come again on the next submit', () => {
    const { rerender } = render(<ErrorSummary errors={errors} focusKey={1} />);
    (document.activeElement as HTMLElement).blur();
    expect(screen.getByRole('alert')).not.toHaveFocus();
    rerender(<ErrorSummary errors={errors} focusKey={2} />);
    expect(screen.getByRole('alert')).toHaveFocus();
  });

  it('a link to a field that is not there does nothing', () => {
    render(<ErrorSummary errors={[{ field: 'gone', message: 'Gone' }]} />);
    expect(() => fireEvent.click(screen.getByRole('link'))).not.toThrow();
  });

  it('two summaries on screen each name themselves', () => {
    render(
      <>
        <ErrorSummary errors={errors} />
        <ErrorSummary errors={[{ field: 'x', message: 'X' }]} />
      </>
    );
    for (const box of screen.getAllByRole('alert'))
      expect(box).toHaveAccessibleName('There is a problem');
    const ids = screen.getAllByRole('heading', { name: 'There is a problem' }).map((h) => h.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('has no axe violations', async () => {
    const { container } = render(<ErrorSummary errors={errors} />);
    expect(await violations(container)).toEqual([]);
  });
});
