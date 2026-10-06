import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SubTabs } from '@/components/ui/sub-tabs';
import type { SubTab } from '@/components/ui/sub-tabs';

afterEach(cleanup);

function tabs(open: string, extra: Partial<Record<string, SubTab['badge']>> = {}) {
  const go = { a: vi.fn(), b: vi.fn(), c: vi.fn() };
  const list: SubTab[] = [
    { id: 'a', label: 'Orders', active: open === 'a', badge: extra.a, go: go.a },
    { id: 'b', label: 'Bazaar', active: open === 'b', badge: extra.b, go: go.b },
    { id: 'c', label: 'Shop', active: open === 'c', badge: extra.c, go: go.c }
  ];
  return { list, go };
}

describe('SubTabs', () => {
  it('renders one button per tab, in order, inside a labelled nav', () => {
    render(<SubTabs label="Places" tabs={tabs('a').list} />);
    const nav = screen.getByRole('navigation', { name: 'Places' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Orders', 'Bazaar', 'Shop']);
    buttons.forEach((b) => expect(b).toHaveAttribute('type', 'button'));
  });

  it('marks only the open tab with aria-current="page"', () => {
    render(<SubTabs label="Places" tabs={tabs('b').list} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toHaveAttribute('aria-current', 'page');
    expect(buttons[0].hasAttribute('aria-current')).toBe(false);
    expect(buttons[2].hasAttribute('aria-current')).toBe(false);
  });

  it('calls only the clicked tab go, once', () => {
    const { list, go } = tabs('a');
    render(<SubTabs label="Places" tabs={list} />);
    fireEvent.click(screen.getByRole('button', { name: 'Shop' }));
    expect(go.c).toHaveBeenCalledTimes(1);
    expect(go.a).not.toHaveBeenCalled();
    expect(go.b).not.toHaveBeenCalled();
  });

  it('shows a badge only when it is truthy', () => {
    const { list } = tabs('a', { a: 2, b: 0, c: null });
    render(<SubTabs label="Places" tabs={list} />);
    const [orders, bazaar, shop] = screen.getAllByRole('button');
    expect(orders.querySelector('span')?.textContent).toBe('2');
    expect(bazaar.querySelector('span')).toBeNull();
    expect(shop.querySelector('span')).toBeNull();
    expect(bazaar.textContent).toBe('Bazaar');
  });

  it('sizes the row by the quiet flag', () => {
    const { rerender } = render(<SubTabs label="Entries" quiet tabs={tabs('a').list} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('data-sub-tabs', 'entries');
    screen.getAllByRole('button').forEach((b) => expect(b.style.minHeight).toBe('36px'));

    rerender(<SubTabs label="Places" tabs={tabs('a').list} />);
    expect(screen.getByRole('navigation')).toHaveAttribute('data-sub-tabs', 'places');
    screen.getAllByRole('button').forEach((b) => expect(b.style.minHeight).toBe('44px'));
  });

  it('renders nothing for an empty list', () => {
    const { container } = render(<SubTabs label="Places" tabs={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('scrolls inside itself so the page cannot scroll sideways', () => {
    render(<SubTabs label="Places" tabs={tabs('a').list} />);
    const nav = screen.getByRole('navigation');
    expect(nav.style.overflowX).toBe('auto');
    expect(nav.style.display).toBe('flex');
    screen.getAllByRole('button').forEach((b) => {
      expect(b.style.flexShrink).toBe('0');
      expect(b.style.whiteSpace).toBe('nowrap');
    });
  });
});
