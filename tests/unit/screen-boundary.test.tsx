import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScreenBoundary } from '@/components/app/screen-boundary';

function Boom(): never {
  throw new Error('kaboom');
}

describe('ScreenBoundary', () => {
  it('shows the recovery panel instead of unmounting the app', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ScreenBoundary screen="bake">
        <Boom />
      </ScreenBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/nothing was lost/i)).toBeInTheDocument();
  });

  it('renders children when nothing throws', () => {
    render(
      <ScreenBoundary screen="bake">
        <span>bake plan</span>
      </ScreenBoundary>
    );
    expect(screen.getByText('bake plan')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
