import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PayEditForm, PayList } from '@/components/live/payment-forms';
import type { OpsVals } from '@/view-models/vals';

afterEach(cleanup);

function editing(upload: (file: File) => Promise<string | null>) {
  return {
    id: 'gcash',
    label: 'GCash',
    accountNumber: '0999 123 4567',
    accountName: 'Cookie Owner',
    qrPath: 'qr/' + 'a'.repeat(32) + '.png',
    active: true,
    sortOrder: 2,
    save: vi.fn(),
    cancel: vi.fn(),
    upload
  };
}

describe('owner payment method forms', () => {
  it('makes QR upload discoverable from the method list', () => {
    const edit = vi.fn();
    const livePay: NonNullable<OpsVals['livePay']> = {
      online: true,
      rows: [
        {
          id: 'gcash',
          label: 'GCash',
          detail: '0999 · Owner',
          active: true,
          hasQr: false,
          edit
        },
        {
          id: 'maya',
          label: 'Maya',
          detail: '0912 · Owner',
          active: true,
          hasQr: true,
          edit
        }
      ],
      addNew: vi.fn(),
      close: vi.fn(),
      editing: null
    };
    render(<PayList livePay={livePay} />);
    expect(
      screen.getByText(
        /Select a method to edit its account details or upload or replace its QR image/
      )
    ).toBeTruthy();
    expect(screen.getByText('Upload QR')).toBeTruthy();
    expect(screen.getByText('Replace QR')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /GCash/ }));
    expect(edit).toHaveBeenCalledOnce();
  });

  it('uploads a selected QR, keeps account fields, and tells the owner to save', async () => {
    let finish!: (path: string) => void;
    const upload = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        })
    );
    const form = editing(upload);
    const view = render(<PayEditForm editing={form} />);
    const picker = screen.getByLabelText(/Upload a QR image \(optional\)/) as HTMLInputElement;
    const file = new File(['synthetic QR'], 'wallet.png', { type: 'image/png' });
    fireEvent.change(picker, { target: { files: [file] } });
    expect(screen.getByText('Uploading…')).toBeTruthy();
    expect(picker.disabled).toBe(true);
    const saveButton = screen.getByRole('button', {
      name: 'Save payment method'
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.submit(view.container.querySelector('form')!);
    expect(form.save).not.toHaveBeenCalled();
    await act(async () => finish('qr/' + 'b'.repeat(32) + '.png'));
    expect(saveButton.disabled).toBe(false);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Save changes'));
    expect((screen.getByLabelText(/QR image path/) as HTMLInputElement).value).toBe(
      'qr/' + 'b'.repeat(32) + '.png'
    );
    fireEvent.submit(view.container.querySelector('form')!);
    expect(form.save).toHaveBeenCalledWith({
      label: 'GCash',
      accountNumber: '0999 123 4567',
      accountName: 'Cookie Owner',
      qrPath: 'qr/' + 'b'.repeat(32) + '.png',
      active: true,
      sortOrder: 2
    });
    expect(upload).toHaveBeenCalledWith(file);
  });

  it('ignores a programmatic save submission while the QR upload is pending', () => {
    const upload = vi.fn(() => new Promise<string>(() => undefined));
    const form = editing(upload);
    const view = render(<PayEditForm editing={form} />);
    fireEvent.change(screen.getByLabelText(/Upload a QR image \(optional\)/), {
      target: { files: [new File(['synthetic QR'], 'wallet.png', { type: 'image/png' })] }
    });
    fireEvent.submit(view.container.querySelector('form')!);
    expect(form.save).not.toHaveBeenCalled();
  });

  it('reports a refused upload and leaves the saved QR path untouched', async () => {
    const form = editing(vi.fn(async () => null));
    render(<PayEditForm editing={form} />);
    const picker = screen.getByLabelText(/Upload a QR image \(optional\)/);
    fireEvent.change(picker, {
      target: { files: [new File(['bad'], 'rejected.png', { type: 'image/png' })] }
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'image path in this form is unchanged'
    );
    expect((screen.getByLabelText(/QR image path/) as HTMLInputElement).value).toBe(form.qrPath);
  });
});
