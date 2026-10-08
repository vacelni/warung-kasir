'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { cx } from '@/lib/cx';
import { Icon, type IconName } from './Icon';

export type ToastTone = 'info' | 'success' | 'danger';

type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastContextValue = {
  /** Shows a brief message. Errors stay longer than confirmations. */
  show: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 3;
const DURATION_MS: Record<ToastTone, number> = { info: 4000, success: 4000, danger: 7000 };

const TONE_CLASSES: Record<ToastTone, string> = {
  info: 'border-border-strong bg-foreground text-white',
  success: 'border-success bg-success text-white',
  danger: 'border-danger bg-danger text-white',
};
const TONE_ICONS: Record<ToastTone, IconName> = { info: 'info', success: 'check', danger: 'alert' };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }].slice(-MAX_VISIBLE));
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext value={value}>
      {children}
      {/* Above the mobile bottom navigation; bottom-right on desktop. */}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-50 flex flex-col gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
      >
        {toasts.map((toast) => (
          <ToastMessage key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

function ToastMessage({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const { id, message, tone } = toast;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), DURATION_MS[tone]);
    return () => clearTimeout(timer);
  }, [id, tone, onDismiss]);

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx(
        'pointer-events-auto flex items-center gap-3 rounded-control border py-1 pr-1 pl-4 text-base shadow-sheet',
        TONE_CLASSES[tone],
      )}
    >
      <Icon name={TONE_ICONS[tone]} size={20} className="shrink-0" />
      <p className="min-w-0 flex-1 py-2 font-medium break-words">{message}</p>
      <button
        type="button"
        onClick={() => onDismiss(id)}
        aria-label="Tutup notifikasi"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-control active:bg-white/20 hover:bg-white/20"
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>.');
  return value;
}
