import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '@/components/ui/button';
import { violations } from './ui-helpers';

afterEach(cleanup);

describe('Button', () => {
  it('is a button that does not submit a form, and presses', () => {
    const press = vi.fn();
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <Button onClick={press}>Save the event</Button>
      </form>
    );
    const button = screen.getByRole('button', { name: 'Save the event' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('carries the press scale and one look per variant', () => {
    render(
      <>
        <Button variant="primary">A</Button>
        <Button variant="dark">B</Button>
        <Button variant="danger">C</Button>
        <Button variant="icon" aria-label="Close">
          ✕
        </Button>
      </>
    );
    expect(screen.getByRole('button', { name: 'A' }).className).toMatch(/motion-press.*bg-brand/);
    expect(screen.getByRole('button', { name: 'B' }).className).toContain('bg-ink');
    expect(screen.getByRole('button', { name: 'C' }).className).toContain('text-danger');
    expect(screen.getByRole('button', { name: 'Close' }).className).toContain('size-11');
  });

  it('shows the busy label, stays pressed once, and says it is busy', () => {
    const press = vi.fn();
    render(
      <Button busy busyLabel="Saving…" onClick={press}>
        Save
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(press).not.toHaveBeenCalled();
  });

  it('a disabled button with a reason shows the reason and is described by it', () => {
    render(
      <Button disabled reason="Starting a day needs signal.">
        Start the day →
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Start the day →' });
    expect(button).toBeDisabled();
    expect(screen.getByText('Starting a day needs signal.')).toBeVisible();
    expect(button).toHaveAccessibleDescription('Starting a day needs signal.');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Button reason="x">Go</Button>);
    expect(await violations(container)).toEqual([]);
  });
});
