import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { violations } from './ui-helpers';

afterEach(cleanup);

describe('Card', () => {
  it('draws each variant, and only accent has the brand left bar', () => {
    render(
      <>
        <Card data-testid="plain">a</Card>
        <Card variant="accent" data-testid="accent">
          b
        </Card>
        <Card variant="inset" data-testid="inset">
          c
        </Card>
        <Card variant="warm" data-testid="warm">
          d
        </Card>
      </>
    );
    expect(screen.getByTestId('accent').className).toContain('border-l-brand');
    for (const id of ['plain', 'inset', 'warm']) {
      expect(screen.getByTestId(id).className).not.toContain('border-l-brand');
    }
    expect(screen.getByTestId('warm').className).toContain('bg-warm-high');
    expect(screen.getByTestId('plain')).toHaveAttribute('data-variant', 'plain');
  });

  it('renders as the element it is told to', () => {
    render(
      <Card as="section" aria-label="Bazaar">
        x
      </Card>
    );
    expect(screen.getByRole('region', { name: 'Bazaar' }).tagName).toBe('SECTION');
  });
});

describe('SectionHeader', () => {
  it('shows the title, a count of 0, and one action', () => {
    const press = vi.fn();
    render(
      <SectionHeader title="Fees" count={0} action={{ label: 'Add a fee', onPress: press }} />
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Fees' })).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a fee' }));
    expect(press).toHaveBeenCalledTimes(1);
  });

  it('shows neither count nor action when they are not given, at the level asked', () => {
    render(<SectionHeader title="Days" level={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Days' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Card>
        <SectionHeader title="Fees" count={2} action={{ label: 'Add', onPress: () => undefined }} />
      </Card>
    );
    expect(await violations(container)).toEqual([]);
  });
});
