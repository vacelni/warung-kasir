'use client';

import { useEffect, useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

type DialogProps = {
  open: boolean;
  /** Called for every dismissal: Esc, the close button, a tap on the backdrop, or the Android back gesture. */
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Buttons for the footer. Stack on mobile, side by side from `sm`. */
  actions?: ReactNode;
  /**
   * When false, Esc, the backdrop, and the close button do nothing, so the user must choose
   * one of `actions` (e.g. the blocking logout warning, UI_SPEC A.24).
   */
  dismissible?: boolean;
};

/**
 * Modal built on the native <dialog>: focus trap, Esc, inert background, and focus return come
 * from the browser. Bottom sheet on phones, centered panel from `sm`.
 *
 * Mark the safest control with `data-autofocus` so it receives focus when the dialog opens.
 */
export function Dialog({ open, onClose, title, description, children, actions, dismissible = true }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Esc arrives as `cancel`. Stay controlled: the parent decides by flipping `open`.
  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (dismissible) onClose();
  }

  // The browser closed the dialog by itself (e.g. the Android back gesture) while `open` is still true.
  function handleNativeClose() {
    if (!open) return;
    if (dismissible) onClose();
    else ref.current?.showModal();
  }

  // Padding-free <dialog> filled by the panel, so a click on the dialog itself is a click on the backdrop.
  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget && dismissible) onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onClick={handleClick}
      className={
        'm-0 mt-auto max-h-[calc(100dvh-1rem)] w-full max-w-none overflow-y-auto rounded-t-2xl bg-surface p-0 text-foreground shadow-sheet ' +
        'backdrop:bg-black/50 sm:m-auto sm:max-w-md sm:rounded-card'
      }
    >
      {open && (
        <div className="flex flex-col gap-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
          <div className="flex items-start gap-3">
            <h2 id={titleId} className="min-w-0 flex-1 text-section-title font-semibold break-words">
              {title}
            </h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="-mt-2 -mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-control text-muted active:bg-subtle hover:bg-subtle"
              >
                <Icon name="close" />
              </button>
            )}
          </div>
          {description && (
            <p id={descriptionId} className="text-base text-muted">
              {description}
            </p>
          )}
          {children}
          {actions && <div className="flex flex-col gap-3 sm:flex-row-reverse sm:[&>*]:flex-1">{actions}</div>}
        </div>
      )}
    </dialog>
  );
}
