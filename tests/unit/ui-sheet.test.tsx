import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sheet } from '@/components/ui/sheet';
import { violations } from './ui-helpers';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Sheet', () => {
  it('is a labelled modal dialog drawn into the page body, with its content and footer', () => {
    render(
      <Sheet
        title="Add an event"
        onClose={() => undefined}
        footer={<button type="button">Save the event</button>}
      >
        <p>Fields</p>
      </Sheet>
    );
    const dialog = screen.getByRole('dialog', { name: 'Add an event' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(screen.getByText('Fields')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save the event' })).toBeInTheDocument();
  });

  it('puts focus inside, locks the page behind and gives both back on close', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <Sheet title="Add" onClose={() => undefined}>
        body
      </Sheet>
    );
    expect(screen.getByRole('dialog')).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it('closes on Escape, on the backdrop and on the close button', () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Add" onClose={onClose}>
        body
      </Sheet>
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close Add' }));
    const backdrop = screen.getByRole('dialog').previousElementSibling as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close when the panel itself is clicked', () => {
    const onClose = vi.fn();
    render(
      <Sheet title="Add" onClose={onClose}>
        <button type="button">Inside</button>
      </Sheet>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Inside' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps Tab inside, wrapping both ways', () => {
    render(
      <Sheet title="Add" onClose={() => undefined} footer={<button type="button">Last</button>}>
        <button type="button">First</button>
      </Sheet>
    );
    const close = screen.getByRole('button', { name: 'Close Add' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('is a bottom sheet on a phone and a 460 px right panel on desktop, unless told otherwise', () => {
    const { rerender } = render(
      <Sheet title="Add" onClose={() => undefined}>
        x
      </Sheet>
    );
    const classes = () => screen.getByRole('dialog').className;
    expect(screen.getByRole('dialog')).toHaveAttribute('data-side', 'auto');
    expect(classes()).toContain('rounded-t-sheet');
    expect(classes()).toContain('md:max-w-[460px]');
    rerender(
      <Sheet title="Add" onClose={() => undefined} side="right">
        x
      </Sheet>
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('data-side', 'right');
    expect(classes()).toContain('max-w-[460px]');
    expect(classes()).not.toContain('md:');
    rerender(
      <Sheet title="Add" onClose={() => undefined} side="bottom">
        x
      </Sheet>
    );
    expect(classes()).not.toContain('460');
  });

  it('plays its exit, then goes', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <Sheet title="Add" onClose={() => undefined}>
        x
      </Sheet>
    );
    rerender(
      <Sheet title="Add" onClose={() => undefined} open={false}>
        x
      </Sheet>
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('data-leaving', 'true');
    act(() => void vi.advanceTimersByTime(200));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('has no axe violations', async () => {
    render(
      <Sheet
        title="Add an event"
        onClose={() => undefined}
        footer={<button type="button">Save</button>}
      >
        <label>
          Name <input />
        </label>
      </Sheet>
    );
    expect(await violations(document.body)).toEqual([]);
  });
});
