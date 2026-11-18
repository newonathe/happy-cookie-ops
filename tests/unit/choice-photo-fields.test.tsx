import { act, StrictMode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChoicePhotoFields } from '@/components/live/choice-photo-fields';

const file = (name: string) => new File(['image'], name, { type: 'image/png' });

afterEach(cleanup);

describe('per-choice add-on photos', () => {
  it('keeps the old preview while upload is pending, then associates the saved path', async () => {
    let finish: ((path: string | null) => void) | undefined;
    const upload = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          finish = resolve;
        })
    );
    const change = vi.fn();
    const busy = vi.fn();
    const ui = render(
      <ChoicePhotoFields
        label="Birthday sticker"
        variants={['Blue']}
        imagePaths={{ Blue: 'assets/blue-old.png' }}
        upload={upload}
        onChange={change}
        onUploadsBusyChange={busy}
      />
    );
    fireEvent.change(screen.getByLabelText(/Replace photo.*Birthday sticker.*Blue/), {
      target: { files: [file('blue.png')] }
    });
    expect(
      screen.getByRole('img', { name: 'Birthday sticker Blue' }).getAttribute('src')
    ).toContain('assets/blue-old.png');
    expect(busy).toHaveBeenLastCalledWith(true);
    await act(async () => {
      finish?.('assets/blue-new.png');
      await Promise.resolve();
    });
    expect(change).toHaveBeenCalledWith('Blue', 'assets/blue-new.png');
    ui.rerender(
      <ChoicePhotoFields
        label="Birthday sticker"
        variants={['Blue']}
        imagePaths={{ Blue: 'assets/blue-new.png' }}
        upload={upload}
        onChange={change}
        onUploadsBusyChange={busy}
      />
    );
    expect(
      screen.getByRole('img', { name: 'Birthday sticker Blue' }).getAttribute('src')
    ).toContain('assets/blue-new.png');
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it('reports uploads and associations after StrictMode replays the effects', async () => {
    let finish: ((path: string | null) => void) | undefined;
    const upload = vi.fn(() => new Promise<string | null>((resolve) => (finish = resolve)));
    const change = vi.fn();
    const busy = vi.fn();
    render(
      <StrictMode>
        <ChoicePhotoFields
          label="Sticker"
          variants={['Blue']}
          imagePaths={{}}
          upload={upload}
          onChange={change}
          onUploadsBusyChange={busy}
        />
      </StrictMode>
    );
    fireEvent.change(screen.getByLabelText(/Upload photo.*Sticker.*Blue/), {
      target: { files: [file('blue.png')] }
    });
    expect(busy).toHaveBeenLastCalledWith(true);
    await act(async () => {
      finish?.('flavours/0123456789abcdef0123456789abcdef.webp');
      await Promise.resolve();
    });
    expect(change).toHaveBeenCalledWith('Blue', 'flavours/0123456789abcdef0123456789abcdef.webp');
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it('retains the previous photo if upload is refused and lets the owner remove only its association', async () => {
    const upload = vi.fn(async () => null);
    const change = vi.fn();
    render(
      <ChoicePhotoFields
        label="Sticker"
        variants={['Gold']}
        imagePaths={{ Gold: 'assets/gold.png' }}
        upload={upload}
        onChange={change}
      />
    );
    fireEvent.change(screen.getByLabelText(/Replace photo.*Sticker.*Gold/), {
      target: { files: [file('gold.png')] }
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Sticker Gold' }).getAttribute('src')).toContain(
      'assets/gold.png'
    );
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo for Sticker: Gold' }));
    expect(change).toHaveBeenLastCalledWith('Gold', null);
  });

  it('keys a choice typed with spaces by its trimmed name, once', async () => {
    const upload = vi.fn(async () => 'assets/gold-new.png');
    const change = vi.fn();
    render(
      <ChoicePhotoFields
        label="Sticker"
        variants={[' Gold ', 'Silver', 'Silver ']}
        imagePaths={{ Gold: 'assets/gold.png' }}
        upload={upload}
        onChange={change}
      />
    );
    expect(screen.getAllByRole('img', { name: 'Sticker Gold' })).toHaveLength(1);
    expect(screen.getAllByLabelText(/Upload photo.*Sticker.*Silver/)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/Replace photo.*Sticker.*Gold/), {
      target: { files: [file('gold.png')] }
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(change).toHaveBeenLastCalledWith('Gold', 'assets/gold-new.png');
  });

  it('ignores renamed or removed choices and keeps aggregate busy true for another pending upload', async () => {
    const pending = new Map<string, (path: string | null) => void>();
    const upload = vi.fn(
      (picked: File) => new Promise<string | null>((resolve) => pending.set(picked.name, resolve))
    );
    const change = vi.fn();
    const busy = vi.fn();
    const ui = render(
      <ChoicePhotoFields
        label="Sticker"
        variants={['Blue', 'Red']}
        imagePaths={{ Blue: 'assets/blue-old.png', Red: 'assets/red-old.png' }}
        upload={upload}
        onChange={change}
        onUploadsBusyChange={busy}
      />
    );
    fireEvent.change(screen.getByLabelText(/Replace photo.*Sticker.*Blue/), {
      target: { files: [file('blue.png')] }
    });
    expect(busy.mock.calls.map(([value]) => value)).toEqual([true]);
    fireEvent.change(screen.getByLabelText(/Replace photo.*Sticker.*Red/), {
      target: { files: [file('red.png')] }
    });
    expect([...pending.keys()]).toEqual(['blue.png', 'red.png']);
    expect(busy.mock.calls.map(([value]) => value)).toEqual([true]);
    ui.rerender(
      <ChoicePhotoFields
        label="Sticker"
        variants={['Red']}
        imagePaths={{ Red: 'assets/red-old.png' }}
        upload={upload}
        onChange={change}
        onUploadsBusyChange={busy}
      />
    );
    expect(busy.mock.calls.map(([value]) => value)).toEqual([true]);
    await act(async () => {
      pending.get('blue.png')?.('assets/blue-new.png');
      await Promise.resolve();
    });
    expect(change).not.toHaveBeenCalled();
    expect(busy.mock.calls.map(([value]) => value)).toEqual([true]);
    ui.unmount();
    expect(busy.mock.calls.map(([value]) => value)).toEqual([true, false]);
    await act(async () => {
      pending.get('red.png')?.('assets/red-new.png');
      await Promise.resolve();
    });
    expect(change).not.toHaveBeenCalled();
    expect(busy.mock.calls.map(([value]) => value)).toEqual([true, false]);
  });
});
