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
  it('removes a photo in the draft and submits the empty photo without changing other saved fields', () => {
    const edit = editor();
    render(<LiveFormHost v={vals(edit)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    expect(screen.getByText('No photo')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Product photo' })).toBeNull();
    expect(imageField().value).toBe('');
    expect(document.activeElement).toBe(screen.getByLabelText('Change photo'));
    expect(edit.save).not.toHaveBeenCalled();
    fireEvent.submit(form());
    expect(edit.save).toHaveBeenCalledExactlyOnceWith({ ...fields, imagePath: '' });
  });

  it('does not restore a removed photo when an earlier upload returns later', async () => {
    let finish!: (path: string) => void;
    const edit = editor({
      upload: vi.fn(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          })
      )
    });
    render(<LiveFormHost v={vals(edit)} />);
    fireEvent.change(screen.getByLabelText('Change photo'), {
      target: { files: [new File(['fixture'], 'old.png', { type: 'image/png' })] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
    await act(async () => finish('assets/happy-camper.png'));
    expect(screen.getByText('No photo')).toBeTruthy();
    expect(imageField().value).toBe('');
    expect(edit.save).not.toHaveBeenCalled();
  });
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
    expect(screen.getByText('Shown beside the name on the order form.')).toBeTruthy();
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

  const typeOptions = [
    { id: 'cookie', label: 'Cookie', behavesAs: 'cookie' as const },
    { id: 'set', label: 'Set', behavesAs: 'set' as const },
    { id: 'ice-cream', label: 'Ice cream', behavesAs: 'item' as const }
  ];
  const item = () =>
    editor({ itemType: 'item', typeId: 'ice-cream', capacityWeight: 0, typeOptions });
  const weightField = () => form().elements.namedItem('capacityWeight') as HTMLInputElement;
  const typeField = () => form().elements.namedItem('typeId') as HTMLSelectElement;

  it('lets an item stored at 0 cookie slots be saved again, with no slot field to fill (migration 86)', () => {
    const edit = item();
    render(<LiveFormHost v={vals(edit)} />);
    expect(screen.queryByLabelText('Cookies counted toward the order limit')).toBeNull();
    expect(screen.getByText(/uses no cookie slots/)).toBeTruthy();
    expect(weightField().value).toBe('0');
    // The browser blocks Save on an invalid field: the form must be valid as it opens.
    expect(form().checkValidity()).toBe(true);
    fireEvent.submit(form());
    expect(edit.save).toHaveBeenCalledWith(
      expect.objectContaining({ itemType: 'item', typeId: 'ice-cream', capacityWeight: 0 })
    );
  });

  it('shows the slot field from 1 when an item becomes a cookie, and hides it again for an item', () => {
    const edit = item();
    render(<LiveFormHost v={vals(edit)} />);
    fireEvent.change(typeField(), { target: { value: 'cookie' } });
    const weight = screen.getByLabelText(
      'Cookies counted toward the order limit'
    ) as HTMLInputElement;
    expect(weight.value).toBe('1');
    expect(form().checkValidity()).toBe(true);
    fireEvent.submit(form());
    expect(edit.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ itemType: 'cookie', typeId: 'cookie', capacityWeight: 1 })
    );
    fireEvent.change(typeField(), { target: { value: 'ice-cream' } });
    expect(screen.queryByLabelText('Cookies counted toward the order limit')).toBeNull();
  });

  it('keeps a cookie’s own slot count and a cookie at 0 stays invalid in the browser', () => {
    render(<LiveFormHost v={vals(editor({ capacityWeight: 3, typeOptions }))} />);
    expect(weightField().value).toBe('3');
    fireEvent.change(weightField(), { target: { value: '0' } });
    expect(weightField().checkValidity()).toBe(false);
  });

  it('names the cost per piece for an item and per cookie for a cookie', () => {
    const { unmount } = render(<LiveFormHost v={vals(item())} />);
    expect(
      screen.getByText('The cost per piece appears here once the product is on the menu.')
    ).toBeTruthy();
    unmount();
    render(<LiveFormHost v={vals(editor())} />);
    expect(
      screen.getByText('The cost per cookie appears here once the product is on the menu.')
    ).toBeTruthy();
  });

  it('offers Publish menu only while a draft waits, and says so otherwise', () => {
    const row = (id: string, published: boolean) => ({
      id,
      name: id,
      shortName: id,
      priceText: '₱100',
      published,
      active: true,
      updatedAt: '2026-11-18T00:00:00.000Z',
      archive: vi.fn(async () => true),
      edit: vi.fn()
    });
    const list = (rows: ReturnType<typeof row>[], publish = vi.fn()) =>
      ({
        liveForm: {
          kind: 'flavours',
          online: true,
          rows,
          archivedRows: [],
          addNew: vi.fn(),
          publish,
          editing: null
        }
      }) as unknown as OpsVals;
    const publish = vi.fn();
    const { unmount } = render(
      <LiveFormHost v={list([row('cookie', true), row('ice cream', false)], publish)} />
    );
    expect(screen.getByText('1 change customers cannot see yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Publish menu' }));
    expect(publish).toHaveBeenCalledTimes(1);
    unmount();
    render(<LiveFormHost v={list([row('cookie', true)])} />);
    expect(screen.queryByRole('button', { name: 'Publish menu' })).toBeNull();
    expect(screen.getByText('Everything is published.')).toBeTruthy();
  });
});
