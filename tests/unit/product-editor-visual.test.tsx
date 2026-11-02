import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveFormHost } from '@/components/live/live-form-host';
import type { OpsVals } from '@/view-models/vals';

type Editing = NonNullable<NonNullable<OpsVals['liveForm']>['editing']>;
const fields = {
  name: 'QA cookie',
  shortName: 'QA',
  description: 'Chocolate',
  imagePath: 'assets/double-chocolate-fudge.png',
  allergens: 'milk, eggs, wheat',
  badge: 'Popular',
  kind: 'Permanent' as const,
  itemType: 'cookie' as const,
  capacityWeight: 1,
  sortOrder: 2,
  price: 125,
  active: true
};
const editor = (over: Partial<Editing> = {}): Editing => ({
  ...fields,
  id: 'qa',
  save: vi.fn(),
  cancel: vi.fn(),
  upload: vi.fn(async () => '/assets/mark.png'),
  ...over
});
const vals = (editing: Editing) => ({ liveForm: { kind: 'flavours', editing } }) as OpsVals;
const form = () => screen.getByRole('button', { name: 'Save product' }).closest('form')!;
const imageField = () => form().elements.namedItem('imagePath') as HTMLInputElement;
afterEach(cleanup);

describe('visual plain-language product editor', () => {
  it('shows the saved photo and familiar labels while submitting the same exact fields', () => {
    const edit = editor();
    render(<LiveFormHost v={vals(edit)} />);
    expect(screen.getByRole('img', { name: 'Product photo' }).style.background).toContain(
      'double-chocolate-fudge.png'
    );
    expect(screen.queryByLabelText('Photo path')).toBeNull();
    expect(
      screen.getByLabelText('Shop label (optional)').getAttribute('aria-describedby')
    ).toBeTruthy();
    expect(screen.getByText('Shown beside the cookie name.')).toBeTruthy();
    expect(imageField().type).toBe('hidden');
    expect(imageField().value).toBe(fields.imagePath);
    fireEvent.submit(form());
    expect(edit.save).toHaveBeenCalledExactlyOnceWith(fields);
  });

  it('previews an uploaded photo and retains its returned path in the existing form submission', async () => {
    const edit = editor();
    render(<LiveFormHost v={vals(edit)} />);
    fireEvent.change(screen.getByLabelText('Change photo'), {
      target: { files: [new File(['fixture'], 'cookie.png', { type: 'image/png' })] }
    });
    await waitFor(() => expect(imageField().value).toBe('/assets/mark.png'));
    expect(screen.getByRole('img', { name: 'Product photo' }).style.background).toBe(
      'var(--color-chip) url(assets/mark.png) center / cover'
    );
    fireEvent.submit(form());
    expect(edit.save).toHaveBeenCalledExactlyOnceWith({ ...fields, imagePath: '/assets/mark.png' });
  });

  it('cannot replace another product photo with a late upload result', async () => {
    let finish!: (path: string) => void;
    const first = editor({
      upload: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          })
      )
    });
    const second = editor({ id: 'other', name: 'Other cookie', imagePath: 'assets/mark.png' });
    const ui = render(<LiveFormHost v={vals(first)} />);
    fireEvent.change(screen.getByLabelText('Change photo'), {
      target: { files: [new File(['fixture'], 'old.png', { type: 'image/png' })] }
    });
    ui.rerender(<LiveFormHost v={vals(second)} />);
    await act(async () => finish('assets/happy-camper.png'));
    expect(imageField().value).toBe('assets/mark.png');
    expect(screen.getByRole('img', { name: 'Product photo' }).style.background).toContain(
      'mark.png'
    );
    expect(first.save).not.toHaveBeenCalled();
    expect(second.save).not.toHaveBeenCalled();
  });
});
