import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pressable } from '@/components/ui/pressable';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Pressable border feedback', () => {
  it('hydrates server border styles without a mismatch', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const element = (
      <Pressable
        style={{ border: '1px solid var(--color-line)' }}
        hoverStyle={{ borderColor: 'var(--color-brand)' }}
      >
        Hydrated action
      </Pressable>
    );
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    document.body.append(container);
    const root = hydrateRoot(container, element);
    await act(async () => {});
    expect(errors).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    container.remove();
  });
  it('restores the Home card border after hover without a React style-conflict warning', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Pressable style={{ border: '1px solid #EDE8E4' }} hoverStyle={{ borderColor: '#E2DAD4' }}>
        Drop
      </Pressable>
    );
    const button = screen.getByRole('button', { name: 'Drop' });
    fireEvent.pointerEnter(button);
    expect(getComputedStyle(button).borderTopColor).toBe('rgb(226, 218, 212)');
    fireEvent.pointerLeave(button);
    expect(getComputedStyle(button).borderTopColor).toBe('rgb(237, 232, 228)');
    expect(getComputedStyle(button).borderTopWidth).toBe('1px');
    expect(getComputedStyle(button).borderTopStyle).toBe('solid');
    expect(errors).not.toHaveBeenCalled();
  });
  it('preserves base, focus and pressed precedence when complete borders and colors mix', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <Pressable
        style={{ border: '2px solid rgba(58,31,20,.3)' }}
        focusStyle={{ borderColor: 'blue' }}
        activeStyle={{ border: '1px dashed red' }}
      >
        Action
      </Pressable>
    );
    const button = screen.getByRole('button', { name: 'Action' });
    fireEvent.focus(button);
    expect(getComputedStyle(button).borderTopColor).toBe('rgb(0, 0, 255)');
    fireEvent.pointerDown(button);
    expect(getComputedStyle(button).borderTopColor).toBe('rgb(255, 0, 0)');
    expect(getComputedStyle(button).borderTopStyle).toBe('dashed');
    fireEvent.pointerUp(button);
    expect(getComputedStyle(button).borderTopColor).toBe('rgb(0, 0, 255)');
    expect(getComputedStyle(button).borderTopWidth).toBe('2px');
    fireEvent.blur(button);
    expect(getComputedStyle(button).borderTopColor).toBe('rgba(58, 31, 20, 0.3)');
    expect(errors).not.toHaveBeenCalled();
  });
});
