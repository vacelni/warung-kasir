// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

// jsdom does not implement the modal <dialog> methods; model the parts the component relies on.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

afterEach(cleanup);

function renderDialog(props: Partial<ComponentProps<typeof Dialog>> = {}) {
  const onClose = vi.fn();
  const view = render(
    <Dialog
      open
      onClose={onClose}
      title="Keluar?"
      description="Transaksi tersimpan."
      actions={<button>Tetap keluar</button>}
      {...props}
    >
      <button data-autofocus>Batal</button>
    </Dialog>,
  );
  return { onClose, view, dialog: document.querySelector('dialog') as HTMLDialogElement };
}

describe('Dialog', () => {
  it('opens as a modal labelled by its title and description', () => {
    const { dialog } = renderDialog();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(screen.getByRole('dialog', { name: 'Keluar?' })).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBe(screen.getByText('Transaksi tersimpan.').id);
  });

  it('renders nothing inside while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByText('Keluar?')).toBeNull();
  });

  it('focuses the element marked data-autofocus', () => {
    renderDialog();

    expect(document.activeElement).toBe(screen.getByText('Batal'));
  });

  it('closes on the close button, Esc, and a tap on the backdrop', () => {
    const { onClose, dialog } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    fireEvent.click(dialog);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('ignores clicks inside the panel', () => {
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByText('Batal'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps a blocking dialog open: no close button, Esc, or backdrop dismissal', () => {
    const { onClose, dialog } = renderDialog({ dismissible: false });

    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    fireEvent.click(dialog);

    expect(screen.queryByRole('button', { name: 'Tutup' })).toBeNull();
    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('closes the native dialog when open becomes false', () => {
    const { view, dialog } = renderDialog();

    view.rerender(<Dialog open={false} onClose={() => {}} title="Keluar?" />);

    expect(dialog.hasAttribute('open')).toBe(false);
  });
});
